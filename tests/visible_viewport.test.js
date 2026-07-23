import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  visibleViewportHeight, applyVisibleViewportHeight,
  clearVisibleViewportHeight, trackVisibleViewport,
} from '../js/ui/visible-viewport.js';

// A minimal window/document double: enough surface for the helper to read a
// (mock) visualViewport height and to set/clear a CSS custom property.
function makeWindow({ innerHeight = 844, visualHeight = null } = {}) {
  const props = new Map();
  const documentElement = {
    style: {
      setProperty: (k, v) => props.set(k, v),
      removeProperty: (k) => props.delete(k),
    },
  };
  const listeners = [];
  const makeTarget = () => ({
    addEventListener: (ev, fn) => listeners.push({ ev, fn, target: 'x' }),
    removeEventListener: (ev, fn) => {
      const i = listeners.findIndex((l) => l.ev === ev && l.fn === fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  });
  const win = {
    innerHeight,
    document: { documentElement },
    props,
    listeners,
  };
  Object.assign(win, makeTarget());
  if (visualHeight != null) {
    const vv = { height: visualHeight };
    Object.assign(vv, makeTarget());
    win.visualViewport = vv;
    win._vv = vv;
    win._fireVvResize = (h) => { vv.height = h; listeners.filter((l) => l.ev === 'resize').forEach((l) => l.fn()); };
  }
  return win;
}

test('visibleViewportHeight prefers visualViewport over innerHeight', () => {
  assert.equal(visibleViewportHeight(makeWindow({ innerHeight: 844, visualHeight: 400 })), 400);
  assert.equal(visibleViewportHeight(makeWindow({ innerHeight: 844 })), 844);
  assert.equal(visibleViewportHeight(undefined), null);
});

test('applyVisibleViewportHeight writes a px CSS custom property', () => {
  const win = makeWindow({ visualHeight: 396 });
  applyVisibleViewportHeight(win, win.document);
  assert.equal(win.props.get('--visible-viewport-height'), '396px');
});

test('tracking updates on visualViewport resize (keyboard open) and cleans up', () => {
  const win = makeWindow({ innerHeight: 844, visualHeight: 844 });
  const teardown = trackVisibleViewport(win);
  assert.equal(win.props.get('--visible-viewport-height'), '844px', 'initial height applied');

  // Simulate the keyboard opening: visualViewport shrinks.
  win._fireVvResize(430);
  assert.equal(win.props.get('--visible-viewport-height'), '430px', 'height follows the keyboard');

  // Teardown detaches every listener and clears the property.
  teardown();
  assert.equal(win.props.has('--visible-viewport-height'), false, 'property cleared on close');
  assert.equal(win.listeners.length, 0, 'all listeners removed');
});

test('clearVisibleViewportHeight is safe when nothing is set', () => {
  const win = makeWindow({ visualHeight: 500 });
  assert.doesNotThrow(() => clearVisibleViewportHeight(win.document));
});

test('trackVisibleViewport is a safe no-op without a window', () => {
  const teardown = trackVisibleViewport(undefined);
  assert.equal(typeof teardown, 'function');
  assert.doesNotThrow(teardown);
});
