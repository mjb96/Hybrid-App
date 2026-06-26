// ==========================================
// RENDER TOOLKIT TESTS (tests/ui_render.test.js)
// Validates setHTML memoisation and reconcileKeyed (create/reuse/remove/reorder)
// against a small but functional fake DOM that mirrors real childNodes semantics.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setHTML, reconcileKeyed } from '../js/ui/render.js';

// ---- minimal functional DOM ----------------------------------------------
class FakeNode {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this._attrs = {};
    this._html = '';
    this.createdSeq = ++FakeNode._seq;
  }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() {
    const p = this.parentNode;
    if (!p) return null;
    const i = p.children.indexOf(this);
    return p.children[i + 1] || null;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this._htmlWrites = (this._htmlWrites || 0) + 1; }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  _detach(node) { const i = this.children.indexOf(node); if (i >= 0) this.children.splice(i, 1); }
  appendChild(node) { if (node.parentNode) node.parentNode._detach(node); node.parentNode = this; this.children.push(node); return node; }
  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode._detach(node);
    node.parentNode = this;
    if (ref == null) { this.children.push(node); return node; }
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, node);
    return node;
  }
  removeChild(node) { this._detach(node); node.parentNode = null; return node; }
}
FakeNode._seq = 0;

const keysOf = (c) => c.children.map(n => n.getAttribute('data-key'));

// ---- setHTML --------------------------------------------------------------

test('setHTML writes once and skips identical follow-ups', () => {
  const el = new FakeNode();
  assert.equal(setHTML(el, '<b>hi</b>'), true);
  assert.equal(el.innerHTML, '<b>hi</b>');
  assert.equal(setHTML(el, '<b>hi</b>'), false);   // unchanged → skipped
  assert.equal(el._htmlWrites, 1);                  // DOM written exactly once
  assert.equal(setHTML(el, '<b>bye</b>'), true);    // changed → written
  assert.equal(el._htmlWrites, 2);
});

// ---- reconcileKeyed -------------------------------------------------------

const opts = (extra = {}) => ({
  key: (it) => it.id,
  create: () => new FakeNode('article'),
  update: (node, it) => setHTML(node, `tile:${it.v}`),
  ...extra,
});

test('reconcileKeyed creates nodes in order on first render', () => {
  const c = new FakeNode();
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }], opts());
  assert.deepEqual(keysOf(c), ['a', 'b', 'c']);
  assert.equal(c.children[1].innerHTML, 'tile:2');
});

test('reconcileKeyed reuses existing nodes (identity preserved)', () => {
  const c = new FakeNode();
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], opts());
  const aNode = c.children[0];
  const seqBefore = aNode.createdSeq;
  reconcileKeyed(c, [{ id: 'a', v: 9 }, { id: 'b', v: 2 }], opts());
  assert.equal(c.children[0].createdSeq, seqBefore, 'same node reused, not recreated');
  assert.equal(c.children[0].innerHTML, 'tile:9', 'reused node updated');
});

test('reconcileKeyed removes stale nodes', () => {
  const c = new FakeNode();
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }], opts());
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'c', v: 3 }], opts()); // drop b
  assert.deepEqual(keysOf(c), ['a', 'c']);
});

test('reconcileKeyed reorders in place without recreating', () => {
  const c = new FakeNode();
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }], opts());
  const seqs = Object.fromEntries(c.children.map(n => [n.getAttribute('data-key'), n.createdSeq]));
  reconcileKeyed(c, [{ id: 'c', v: 3 }, { id: 'a', v: 1 }, { id: 'b', v: 2 }], opts());
  assert.deepEqual(keysOf(c), ['c', 'a', 'b']);
  // identities preserved across the reorder
  assert.equal(c.children[0].createdSeq, seqs['c']);
  assert.equal(c.children[1].createdSeq, seqs['a']);
});

test('reconcileKeyed handles add + remove + reorder together', () => {
  const c = new FakeNode();
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], opts());
  reconcileKeyed(c, [{ id: 'b', v: 2 }, { id: 'd', v: 4 }, { id: 'a', v: 1 }], opts());
  assert.deepEqual(keysOf(c), ['b', 'd', 'a']);
});

test('reconcileKeyed invokes custom remove hook instead of detaching', () => {
  const c = new FakeNode();
  let removed = 0;
  const o = opts({ remove: () => { removed++; } });
  reconcileKeyed(c, [{ id: 'a', v: 1 }, { id: 'b', v: 2 }], o);
  reconcileKeyed(c, [{ id: 'a', v: 1 }], o);
  assert.equal(removed, 1);
});
