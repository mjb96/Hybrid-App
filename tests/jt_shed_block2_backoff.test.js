// ==========================================
// JACKED & TAN: SHED EDITION — Block-2 dynamic back-off + stable set roles
// (tests/jt_shed_block2_backoff.test.js)
//
// Covers weeks 7–11, where the T1 back-off load is a percentage of THAT DAY'S
// entered top-set weight (not the training max), and the stored-role model that
// keeps each row's role attached to the row across warm-up / working-set edits,
// reload and completion. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalogEntry } from '../js/programs/catalog.js';
import {
  JT_SHED_ID, jtStoredRolesFor, jtStoredRoleTag, jtBackoffFromTopSet, roundLoad,
} from '../js/programs/jt-shed-model.js';
import {
  prescribeSetsForLift, reconcilePrescribedSets, jtRoleStampsForCtx,
} from '../js/engine.js';
import { buildSetRow } from '../js/templates.js';
import { buildSessionRecap } from '../js/session-recap.js';
import {
  setAppState, appState, verifyWeekStorageSchema, reseedActiveProgramIntoWeek,
} from '../js/state.js';
import { hasDayWorkoutDraft } from '../js/workout/delete-day.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
}

const P = getCatalogEntry(JT_SHED_ID);
const ctx = (week) => ({ program: P, week, dayKey: 'mon' });

// ---- 1–5. Block-2 percentage calculation from the entered top-set load -----

test('1. Week 7 back-off = 85% of the entered top-set load (5×3, final is a plus set)', () => {
  const roles = jtStoredRolesFor(P, 7, 'mon', 'Back Squat');
  assert.deepEqual(roles.map((r) => r.role), ['repmax', 'backoff', 'backoff', 'backoff', 'backoff', 'plus']);
  assert.equal(roles[1].boPct, 85);
  assert.equal(roles[1].boSrc, 'dayRepMax');
  assert.equal(jtBackoffFromTopSet(120, 85), 102.5);
});

test('2. Week 8 back-off = 85% (5×2)', () => {
  const roles = jtStoredRolesFor(P, 8, 'mon', 'Back Squat');
  assert.equal(roles[1].boPct, 85);
  assert.equal(jtBackoffFromTopSet(100, 85), 85);
});

test('3. Week 9 back-off = 85% (5×1)', () => {
  assert.equal(jtStoredRolesFor(P, 9, 'mon', 'Back Squat')[1].boPct, 85);
  assert.equal(jtBackoffFromTopSet(140, 85), 120); // 119 → nearest 2.5
});

test('4. Week 10 back-off = 90% (3×2)', () => {
  const roles = jtStoredRolesFor(P, 10, 'mon', 'Back Squat');
  assert.equal(roles[1].boPct, 90);
  assert.equal(roles[1].boSrc, 'dayRepMax');
  assert.equal(jtBackoffFromTopSet(150, 90), 135);
});

test('5. Week 11 back-off = 90% (3×1)', () => {
  assert.equal(jtStoredRolesFor(P, 11, 'mon', 'Back Squat')[1].boPct, 90);
  assert.equal(jtBackoffFromTopSet(160, 90), 145); // 144 → nearest 2.5 = 145
});

// ---- 6. Rounding + honest missing/zero handling ---------------------------

test('6. back-off suggestion rounds to 2.5 and never returns NaN/0 for bad input', () => {
  assert.equal(jtBackoffFromTopSet(123, 85), roundLoad(123 * 0.85)); // shared rounding
  assert.equal(jtBackoffFromTopSet(0, 85), null);
  assert.equal(jtBackoffFromTopSet('', 85), null);
  assert.equal(jtBackoffFromTopSet(120, 0), null);
  assert.equal(jtBackoffFromTopSet(NaN, 85), null);
  assert.equal(jtBackoffFromTopSet(120, 85, { increment: 5 }), 100); // 102 → nearest 5
});

// ---- 7. Recalc semantics: untouched rows follow the top set; clearing clears -

test('7. suggestion is recomputed from the top set; clearing the top set clears it', () => {
  // Simulate the render-time contract the cockpit uses: suggest only when a valid
  // top set exists; otherwise null (no stale load).
  const pct = jtStoredRolesFor(P, 7, 'mon', 'Back Squat')[1].boPct;
  assert.equal(jtBackoffFromTopSet(130, pct), 110); // 110.5 → nearest 2.5
  assert.equal(jtBackoffFromTopSet(140, pct), 120); // changed top set → new suggestion (119 → 120)
  assert.equal(jtBackoffFromTopSet(null, pct), null); // cleared → no suggestion
});

// ---- 8. buildSetRow shows the suggestion as a placeholder + source hint -----

test('8. buildSetRow seeds the back-off placeholder + source line from the top set', () => {
  const roleTag = { role: 'backoff', label: 'Back-off', emphasis: false, boPct: 85, boSrc: 'dayRepMax',
    unit: 'kg', backoffSuggest: 102.5, backoffHint: '85% of 120kg top set · 102.5kg' };
  const html = buildSetRow({ w: '', r: '', c: false, role: 'backoff', boPct: 85, boSrc: 'dayRepMax' }, 1, 'Back Squat', null, 'kg', 'Back Squat', 75, 3, 3, null, roleTag);
  assert.match(html, /data-bo-src="dayRepMax"/);
  assert.match(html, /data-bo-pct="85"/);
  assert.match(html, /placeholder="102\.5"/);
  assert.match(html, /data-ghost-default="kg"/);
  assert.match(html, /set-backoff-hint/);
  assert.ok(html.includes('85% of 120kg top set'));
});

test('9. a filled back-off row (override) is NOT seeded with a suggestion placeholder', () => {
  // The cockpit passes backoffSuggest:null when the row already has a value, so
  // the override weight is shown and the placeholder falls back to the default.
  const roleTag = { role: 'backoff', label: 'Back-off', emphasis: false, boPct: 85, boSrc: 'dayRepMax',
    unit: 'kg', backoffSuggest: null, backoffHint: '85% of 120kg top set · 102.5kg' };
  const html = buildSetRow({ w: '110', r: '3', c: false, role: 'backoff', boPct: 85, boSrc: 'dayRepMax' }, 1, 'Back Squat', null, 'kg', 'Back Squat', 75, 3, 3, null, roleTag);
  assert.match(html, /value="110"/);
  assert.match(html, /placeholder="kg"/); // default ghost, not the suggestion
});

// ---- 10 & 11. Materialisation stamps stable roles; reload/immutability ------

test('10. materialised Block-2 sets carry stable role + back-off metadata', () => {
  setAppState({ activeProgramId: JT_SHED_ID, customPrograms: [], settings: {}, weeks: {}, currentWeek: '7', schemaVersion: 3 });
  verifyWeekStorageSchema('7');
  reseedActiveProgramIntoWeek('7');
  const squat = appState.weeks['7'].lifts.mon['Back Squat'];
  assert.equal(squat.length, 6); // 10RM top + 5×3 back-off (final is the plus set)
  assert.equal(squat[0].role, 'repmax');
  assert.equal(squat[0].roleReps, 6);
  assert.equal(squat[1].role, 'backoff');
  assert.equal(squat[1].boPct, 85);
  assert.equal(squat[1].boSrc, 'dayRepMax');
  assert.equal(squat[5].role, 'plus');
  // Roles are metadata, not user input: a freshly stamped day is NOT a draft.
  assert.equal(hasDayWorkoutDraft(appState.weeks['7'], 'mon'), false);
});

test('11. a completed Block-2 snapshot is immutable across a later reseed', () => {
  setAppState({ activeProgramId: JT_SHED_ID, customPrograms: [], settings: {}, weeks: {}, currentWeek: '7', schemaVersion: 3 });
  verifyWeekStorageSchema('7');
  reseedActiveProgramIntoWeek('7');
  // Log the top set + one back-off with a manual override weight.
  const squat = appState.weeks['7'].lifts.mon['Back Squat'];
  squat[0] = { ...squat[0], w: 120, r: 6, c: true };
  squat[1] = { ...squat[1], w: 100, r: 3, c: true };     // override (not 102.5)
  const snapshot = JSON.stringify(squat);
  reseedActiveProgramIntoWeek('7');
  const after = appState.weeks['7'].lifts.mon['Back Squat'];
  assert.equal(JSON.stringify(after.slice(0, 2)), JSON.stringify(squat.slice(0, 2)), 'logged rows unchanged');
  assert.equal(after[0].role, 'repmax');
  assert.equal(after[1].w, 100, 'override load preserved');
  assert.ok(snapshot.includes('"role":"repmax"'));
});

// ---- 12 & 13. Role stability across warm-up / working-set edits -------------

test('12. inserting a warm-up does not shift the top-set/back-off roles', () => {
  const sets = prescribeSetsForLift('7', 'mon', 'Back Squat', undefined, {}, ctx(7));
  assert.equal(sets[0].role, 'repmax');
  // Insert a warm-up at the front, exactly like appendWarmupSetRow.
  sets.splice(0, 0, { w: '', r: '', c: false, type: 'W' });
  // The role travels with the row object — the top set is still role:'repmax'.
  assert.equal(sets[0].type, 'W');
  assert.equal(sets[0].role, undefined);
  assert.equal(sets[1].role, 'repmax');
  assert.equal(sets[sets.length - 1].role, 'plus');
});

test('13. an appended extra working set does not steal a prescribed role', () => {
  const sets = prescribeSetsForLift('7', 'mon', 'Back Squat', undefined, {}, ctx(7));
  assert.equal(sets.length, 6);
  sets.push({ w: '', r: '', c: false }); // appendCustomSetRow
  assert.equal(sets[0].role, 'repmax');
  assert.equal(sets[5].role, 'plus');
  assert.equal(sets[6].role, undefined); // the extra set is untagged
  // Removing a middle prescribed row leaves the others' roles intact.
  const removed = prescribeSetsForLift('7', 'mon', 'Back Squat', undefined, {}, ctx(7));
  removed.splice(2, 1); // drop one back-off
  assert.equal(removed[0].role, 'repmax');
  assert.equal(removed[removed.length - 1].role, 'plus');
});

// ---- 14. Omitted sets stay represented (roles + blanks preserved) ----------

test('14. reconcile keeps completed + override rows and re-stamps only padded blanks', () => {
  const stamps = jtRoleStampsForCtx(ctx(7), 'Back Squat');
  // Athlete did the top set + 2 back-offs then finished early (rest omitted).
  const existing = [
    { w: 120, r: 6, c: true, role: 'repmax', roleReps: 6 },
    { w: 100, r: 3, c: true, role: 'backoff', boPct: 85, boSrc: 'dayRepMax' },
    { w: 100, r: 3, c: true, role: 'backoff', boPct: 85, boSrc: 'dayRepMax' },
  ];
  const out = reconcilePrescribedSets(existing, 6, stamps);
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(0, 3), existing, 'completed rows untouched');
  assert.equal(out[3].w, ''); assert.equal(out[3].c, false); // omitted, blank
  assert.equal(out[5].role, 'plus'); // padded rows still stamped by working index
});

// ---- 15 & 16. History role rendering + old-workout compatibility ------------

test('15. completed workout history renders roles from the snapshot', () => {
  const state = {
    settings: { weightUnit: 'kg' },
    weeks: { '7': { activationId: 'a', dates: { mon: '2026-08-01' }, lifts: { mon: {
      'Back Squat': [
        { w: 120, r: 6, c: true, role: 'repmax', roleReps: 6 },
        { w: 102.5, r: 3, c: true, role: 'backoff', boPct: 85, boSrc: 'dayRepMax' },
        { w: 102.5, r: 3, c: true, role: 'plus', boPct: 85, boSrc: 'dayRepMax' },
        { w: 60, r: 5, c: true, type: 'W' }, // warm-up: no role chip
      ],
      'Dumbbell Bulgarian Split Squat': [
        { w: 30, r: 15, c: true, role: 'target', roleReps: 15 },
        { w: 30, r: 12, c: true, role: 'mrs' },
        { w: 30, r: 9, c: true, role: 'mrs' },
      ],
    } }, notes: { mon: '' }, gymStats: {}, gymRpe: {}, runs: {}, runSessions: {} } },
  };
  const recap = buildSessionRecap(state, '7', 'mon');
  const squat = recap.lifts.find((l) => l.name === 'Back Squat');
  assert.deepEqual(squat.setList.map((s) => s.role), ['repmax', 'backoff', 'plus', null]);
  const bulg = recap.lifts.find((l) => l.name === 'Dumbbell Bulgarian Split Squat');
  assert.deepEqual(bulg.setList.map((s) => s.role), ['target', 'mrs', 'mrs']);
  // The role tag labels resolve (MRS numbered in order).
  assert.equal(jtStoredRoleTag(bulg.setList[1], 1).label, 'MRS 1');
  assert.equal(jtStoredRoleTag(bulg.setList[2], 2).label, 'MRS 2');
  assert.equal(jtStoredRoleTag(squat.setList[0]).label, 'Top set · 6RM');
});

test('16. an OLD workout without role metadata renders with no chips (no error)', () => {
  const state = {
    settings: { weightUnit: 'kg' },
    weeks: { '1': { activationId: 'a', dates: { mon: '2026-01-01' }, lifts: { mon: {
      'Back Squat': [ { w: 100, r: 5, c: true }, { w: 100, r: 5, c: true } ], // no role
    } }, notes: { mon: '' }, gymStats: {}, gymRpe: {}, runs: {}, runSessions: {} } },
  };
  const recap = buildSessionRecap(state, '1', 'mon');
  const squat = recap.lifts.find((l) => l.name === 'Back Squat');
  assert.deepEqual(squat.setList.map((s) => s.role), [null, null]);
  assert.equal(jtStoredRoleTag(squat.setList[0]), null);
});

// ---- 17. Non-J&T programs keep byte-identical plain scaffolding -------------

test('17. non-J&T prescribeSetsForLift/reconcile produce plain {w,r,c} (no role keys)', () => {
  const sets = prescribeSetsForLift('1', 'mon', 'Bench Press', '', { sets: 5, reps: 5 });
  assert.equal(sets.length, 5);
  assert.ok(sets.every((s) => Object.keys(s).sort().join(',') === 'c,r,w'));
  const rec = reconcilePrescribedSets(sets, 5);
  assert.ok(rec.every((s) => Object.keys(s).sort().join(',') === 'c,r,w'));
  // No role stamps for a non-J&T ctx.
  assert.equal(jtRoleStampsForCtx({ program: { progressionModel: undefined }, week: 1, dayKey: 'mon' }, 'Bench Press'), null);
});
