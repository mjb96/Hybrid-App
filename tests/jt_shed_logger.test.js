// ==========================================
// JACKED & TAN: SHED EDITION — LOGGER SET-ROLE RENDERING
// (tests/jt_shed_logger.test.js)
//
// The tier-aware resolver already produces the correct set COUNTS and the rich
// card label. These tests cover the next layer: turning the structured
// `setPlan` into per-WORKING-row role tags (top set / back-off / plus / target /
// MRS / light / assessment) and rendering them in the live logger set row —
// WITHOUT stamping anything onto the stored set. A plain straight-set `work`
// role stays untagged so ordinary sets are uncluttered.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { escapeHtml } from '../js/util.js';
import { getCatalogEntry } from '../js/programs/catalog.js';
import {
  JT_SHED_ID, resolveJtPrescription, jtSetRoleTags,
} from '../js/programs/jt-shed-model.js';
import { buildSetRow } from '../js/templates.js';

const P = getCatalogEntry(JT_SHED_ID);
const tagsFor = (week, day, name) =>
  jtSetRoleTags(resolveJtPrescription(P, week, day, name).setPlan);
const rolesFor = (week, day, name) => tagsFor(week, day, name).map((t) => (t ? t.role : null));

// ---- 1. T1 week 1 → top set + 3 back-off, final is the plus set ------------

test('1. T1 week 1 role tags = Top set, Back-off, Back-off, Back-off + (last emphasised)', () => {
  const tags = tagsFor(1, 'mon', 'Back Squat');
  assert.deepEqual(tags.map((t) => t.role), ['repmax', 'backoff', 'backoff', 'plus']);
  assert.match(tags[0].label, /Top set · 10RM/);
  assert.equal(tags[0].emphasis, true);          // the money set
  assert.deepEqual(tags.slice(1, 3).map((t) => t.label), ['Back-off', 'Back-off']);
  assert.equal(tags[3].label, 'Back-off +');      // plus set indicator
  assert.equal(tags[3].emphasis, true);
});

// ---- 2. T1 rep-max target tracks the week ---------------------------------

test('2. T1 top-set label follows the weekly rep-max (8RM in week 2, heavy single in 6)', () => {
  assert.match(tagsFor(2, 'mon', 'Back Squat')[0].label, /Top set · 8RM/);
  // Week 6 pivot: a single heavy top set, no back-offs.
  const w6 = tagsFor(6, 'mon', 'Back Squat');
  assert.deepEqual(w6.map((t) => t.role), ['repmax']);
  assert.match(w6[0].label, /Top set · 1RM/);
  // Week 12 assessment: one assessment row, no back-offs.
  const w12 = tagsFor(12, 'mon', 'Back Squat');
  assert.deepEqual(w12.map((t) => t.role), ['assessment']);
  assert.equal(w12[0].label, 'Assessment');
});

// ---- 3. T2b/T2c → Target · N, MRS 1, MRS 2 (MRS numbered in order) --------

test('3. T2b/T2c role tags = Target · 15, MRS 1, MRS 2', () => {
  const tags = tagsFor(1, 'mon', 'Dumbbell Bulgarian Split Squat');
  assert.deepEqual(tags.map((t) => t.role), ['target', 'mrs', 'mrs']);
  assert.equal(tags[0].label, 'Target · 15');
  assert.equal(tags[0].emphasis, true);
  assert.deepEqual(tags.slice(1).map((t) => t.label), ['MRS 1', 'MRS 2']);
});

// ---- 4. T3 → Target · 20, MRS 1, MRS 2 ------------------------------------

test('4. T3 role tags = Target · 20, MRS 1, MRS 2', () => {
  assert.deepEqual(tagsFor(1, 'mon', 'Band Leg Curl').map((t) => t.label), ['Target · 20', 'MRS 1', 'MRS 2']);
});

// ---- 5. Straight-set work (T2a / pull-up / rows / core) stays UNTAGGED -----

test('5. T2a / pull-up / spec row / core produce no role tags (null per row)', () => {
  assert.deepEqual(rolesFor(1, 'mon', 'Romanian Deadlift'), [null, null, null, null]);        // T2a 4×10
  assert.deepEqual(rolesFor(1, 'tue', 'Pull-Up'), [null, null, null]);                          // double progression
  assert.deepEqual(rolesFor(1, 'sat', 'Chest-Supported Dumbbell Row'), [null, null, null, null]); // spec row 4×8–12
  assert.deepEqual(rolesFor(1, 'mon', 'Ab Wheel Rollout'), [null, null, null]);                 // core
});

// ---- 6. Recovery / light weeks tag their rows as "Light" ------------------

test('6. Week-6 T2b recovery + T3 light sets tag as Light', () => {
  // T2b week 6 = recovery, 2 light sets.
  assert.deepEqual(tagsFor(6, 'mon', 'Dumbbell Bulgarian Split Squat').map((t) => t.label), ['Light', 'Light']);
  // T3 week 6 = 2 light sets.
  assert.deepEqual(rolesFor(6, 'mon', 'Band Leg Curl'), ['light', 'light']);
});

// ---- 7. Defensive: jtSetRoleTags tolerates junk ---------------------------

test('7. jtSetRoleTags is defensive (non-array → [], unknown role → null)', () => {
  assert.deepEqual(jtSetRoleTags(null), []);
  assert.deepEqual(jtSetRoleTags(undefined), []);
  assert.deepEqual(jtSetRoleTags([{ role: 'mystery' }, {}, null]), [null, null, null]);
});

// ---- 8. buildSetRow renders the role tag + data attribute -----------------

test('8. buildSetRow renders a role tag with a data-set-role attribute + label', () => {
  const plus = { role: 'plus', label: 'Back-off +', emphasis: true };
  const html = buildSetRow({ w: '', r: '', c: false }, 3, 'Back Squat', null, 'kg', 'Back Squat', 75, 6, 6, null, plus);
  assert.match(html, /data-set-role="plus"/);
  assert.match(html, /set-role-tag--plus/);
  assert.match(html, /is-emphasis/);
  assert.ok(html.includes(escapeHtml('Back-off +')));
  // The row itself carries the role for selection.
  assert.match(html, /class="cockpit-set-row[^"]*"[^>]*data-set-role="plus"/);
});

test('8b. buildSetRow with no role tag renders no set-role markup (generic programs unaffected)', () => {
  const html = buildSetRow({ w: '', r: '', c: false }, 0, 'Bench Press', null, 'kg', 'Bench Press', 75, 5, 5, null, null);
  assert.doesNotMatch(html, /set-role-tag/);
  assert.doesNotMatch(html, /data-set-role/);
});

// ---- 9. A warm-up row never shows a role tag ------------------------------

test('9. a warm-up set (type W) suppresses the role tag even if one is supplied', () => {
  const repmax = { role: 'repmax', label: 'Top set · 10RM', emphasis: true };
  const html = buildSetRow({ w: '', r: '', c: false, type: 'W' }, 0, 'Back Squat', null, 'kg', 'Back Squat', 75, 10, 10, null, repmax);
  assert.doesNotMatch(html, /set-role-tag/);
  assert.doesNotMatch(html, /data-set-role/);
});

// ---- 10. The tag count matches the materialised working-set count ----------

test('10. role-tag array length equals the resolved working-set count for every tier', () => {
  for (const [day, name] of [
    ['mon', 'Back Squat'], ['mon', 'Romanian Deadlift'], ['mon', 'Dumbbell Bulgarian Split Squat'],
    ['mon', 'Band Leg Curl'], ['tue', 'Pull-Up'], ['sat', 'Chest-Supported Dumbbell Row'],
  ]) {
    const p = resolveJtPrescription(P, 1, day, name);
    assert.equal(jtSetRoleTags(p.setPlan).length, p.sets, `${name} tag count == set count`);
  }
});
