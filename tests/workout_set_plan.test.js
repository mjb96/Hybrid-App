// ==========================================
// SESSION SET PLAN — a deleted set stays deleted (tests/workout_set_plan.test.js)
//
// The reported defect: delete a set mid-workout and it comes back, and the
// finish review keeps calling the session incomplete. Two causes, both covered
// here — `verifyWeekStorageSchema` padding the row back on its next pass, and
// `evaluateSessionCompletion` counting the removed set in the denominator.
//
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalogEntry, PROGRAM_CATALOG } from '../js/programs/catalog.js';
import { setAppState, appState, verifyWeekStorageSchema, reseedActiveProgramIntoWeek } from '../js/state.js';
import { evaluateSessionCompletion } from '../js/workout/completion-policy.js';
import {
  applySetRemoval, restoreSetRemoval, sessionSetPlan, plannedSetsForLift,
  clearSessionSetPlan, workingSetCount,
} from '../js/workout/set-plan.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
}

const PID = 'hybridhq_foundations';
const P = getCatalogEntry(PID);
const DAY = 'mon';

/** A fresh week 1 of a real catalog program, with every set of `day` logged. */
function loggedWeek({ log = true } = {}) {
  setAppState({ activeProgramId: PID, customPrograms: [], settings: {}, weeks: {}, currentWeek: '1', schemaVersion: 3 });
  verifyWeekStorageSchema('1');
  const week = appState.weeks['1'];
  if (log) {
    for (const sets of Object.values(week.lifts[DAY])) {
      sets.forEach((set) => { set.w = '60'; set.r = '8'; set.c = true; });
    }
    week.dates = { [DAY]: '2026-08-07' };
  }
  return week;
}

test('0. the fixture is a real multi-set program day', () => {
  assert.ok(PROGRAM_CATALOG.some((p) => p.id === PID), 'catalog still has the fixture program');
  const week = loggedWeek({ log: false });
  assert.ok(Object.keys(week.lifts[DAY]).length > 1);
  assert.ok(Object.values(week.lifts[DAY]).every((sets) => sets.length > 1));
});

// ---- 1–3. The row does not come back ---------------------------------------

test('1. a deleted set survives the scaffolding pass that used to pad it back', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  const before = week.lifts[DAY][lift].length;

  assert.equal(applySetRemoval(week, DAY, lift, before - 1).ok, true);
  assert.equal(week.lifts[DAY][lift].length, before - 1);

  // This runs on boot, week nav, run logging and GPS finish.
  verifyWeekStorageSchema('1');
  assert.equal(week.lifts[DAY][lift].length, before - 1, 'the removed row must not be re-materialised');
  assert.ok(week.lifts[DAY][lift].every((set) => set.c === true), 'no blank row was appended');
});

test('2. repeated scaffolding passes never re-add the row', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  applySetRemoval(week, DAY, lift, week.lifts[DAY][lift].length - 1);
  const after = week.lifts[DAY][lift].length;
  for (let i = 0; i < 5; i++) verifyWeekStorageSchema('1');
  assert.equal(week.lifts[DAY][lift].length, after);
});

test('3. removing the last set removes the exercise, and it stays removed', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  while (week.lifts[DAY][lift]?.length) applySetRemoval(week, DAY, lift, 0);

  assert.equal(week.lifts[DAY][lift], undefined);
  assert.ok(!(week.liftOrder[DAY] || []).includes(lift), 'dropped from the display order');
  assert.equal(sessionSetPlan(week, DAY, lift), 0);

  verifyWeekStorageSchema('1');
  assert.equal(week.lifts[DAY][lift], undefined, 'the exercise must not be re-seeded');
  assert.ok(!(week.liftOrder[DAY] || []).includes(lift));
});

// ---- 4–6. The review agrees with the session -------------------------------

test('4. a session finished after dropping a set reads as complete', () => {
  const week = loggedWeek();
  assert.equal(evaluateSessionCompletion(appState, P, '1', DAY).complete, true, 'baseline: all logged');

  const lift = Object.keys(week.lifts[DAY])[1];
  const before = week.lifts[DAY][lift].length;
  applySetRemoval(week, DAY, lift, before - 1);
  verifyWeekStorageSchema('1');

  const result = evaluateSessionCompletion(appState, P, '1', DAY);
  assert.equal(result.complete, true, 'the deleted set is not work left undone');
  assert.equal(result.outcome, 'complete');
  assert.match(result.progressLabel, /^\d+ of \d+ planned sets/);
  const [done, planned] = result.progressLabel.match(/\d+/g).map(Number);
  assert.equal(done, planned, 'numerator and denominator agree');
  assert.equal(planned, result.planned.prescribedSets - 1, 'denominator dropped by exactly the removed set');
});

test('5. removing a set still counts as a modified session', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[1];
  applySetRemoval(week, DAY, lift, week.lifts[DAY][lift].length - 1);
  const result = evaluateSessionCompletion(appState, P, '1', DAY);
  assert.equal(result.modified, true, 'measured against the plan, not the session');
});

test('6. an untouched short day is still padded back to the prescription', () => {
  const week = loggedWeek({ log: false });
  const lift = Object.keys(week.lifts[DAY])[0];
  const prescribed = week.lifts[DAY][lift].length;
  // A genuinely short array with no stamped count — e.g. a legacy/imported day.
  week.lifts[DAY][lift] = [{ w: '80', r: '5', c: true }];
  verifyWeekStorageSchema('1');
  assert.equal(week.lifts[DAY][lift].length, prescribed, 'reconcile still repairs real scaffolding gaps');
});

// ---- 7–9. Undo, warm-ups, and handing the count back -----------------------

test('7. Undo restores the set and hands the count back to the program', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  const before = JSON.stringify(week.lifts[DAY][lift]);
  const order = [...week.liftOrder[DAY]];

  const snapshot = applySetRemoval(week, DAY, lift, week.lifts[DAY][lift].length - 1);
  assert.equal(sessionSetPlan(week, DAY, lift), snapshot.plannedSets);

  assert.equal(restoreSetRemoval(week, DAY, lift, snapshot), true);
  assert.equal(JSON.stringify(week.lifts[DAY][lift]), before, 'exact prior sets');
  assert.deepEqual(week.liftOrder[DAY], order);
  assert.equal(sessionSetPlan(week, DAY, lift), null, 'no stamped count after undo');

  verifyWeekStorageSchema('1');
  assert.equal(JSON.stringify(week.lifts[DAY][lift]), before, 'and the pass leaves it alone');
});

test('8. Undo of a whole removed exercise brings it back intact', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  const before = JSON.stringify(week.lifts[DAY][lift]);
  const snapshots = [];
  while (week.lifts[DAY][lift]?.length) snapshots.push(applySetRemoval(week, DAY, lift, 0));

  // Undo the last removal — the snapshot it carries is the full prior state.
  restoreSetRemoval(week, DAY, lift, snapshots.at(-1));
  assert.equal(week.lifts[DAY][lift].length, 1);
  // Then unwind the rest.
  restoreSetRemoval(week, DAY, lift, snapshots[0]);
  assert.equal(JSON.stringify(week.lifts[DAY][lift]), before);
  assert.ok(week.liftOrder[DAY].includes(lift));
});

test('9. warm-ups are not part of the plan, and deleting one does not change it', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  const working = week.lifts[DAY][lift].length;
  week.lifts[DAY][lift].unshift({ w: '20', r: '10', c: true, type: 'W' });
  assert.equal(workingSetCount(week.lifts[DAY][lift]), working);

  applySetRemoval(week, DAY, lift, 0); // delete the warm-up
  assert.equal(sessionSetPlan(week, DAY, lift), working, 'working-set plan unchanged');

  const result = evaluateSessionCompletion(appState, P, '1', DAY);
  assert.equal(result.complete, true);
});

// ---- 10–12. Scope: the stamp is per week+day, and a reseed clears it --------

test('10. the stamped count does not leak to other days or weeks', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  applySetRemoval(week, DAY, lift, week.lifts[DAY][lift].length - 1);

  assert.equal(sessionSetPlan(week, 'tue', lift), null);
  assert.equal(plannedSetsForLift(week, 'tue', lift, 4), 4);
  verifyWeekStorageSchema('2');
  const nextWeek = appState.weeks['2'];
  if (Array.isArray(nextWeek.lifts?.[DAY]?.[lift])) {
    assert.equal(sessionSetPlan(nextWeek, DAY, lift), null, 'next week starts from the program again');
  }
});

test('11. a deliberate reseed hands the set count back to the program', () => {
  const week = loggedWeek({ log: false });
  const lift = Object.keys(week.lifts[DAY])[0];
  const prescribed = week.lifts[DAY][lift].length;
  while (week.lifts[DAY][lift]?.length) applySetRemoval(week, DAY, lift, 0);
  assert.equal(sessionSetPlan(week, DAY, lift), 0);

  reseedActiveProgramIntoWeek('1');
  assert.equal(sessionSetPlan(appState.weeks['1'], DAY, lift), null);
  assert.equal(appState.weeks['1'].lifts[DAY][lift].length, prescribed);
});

test('12. clearSessionSetPlan keeps the rest of a lift\'s meta', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  week.liftMeta = { [DAY]: { [lift]: { groupId: 'A', origin: 'swap' } } };
  applySetRemoval(week, DAY, lift, 0);
  clearSessionSetPlan(week, DAY, lift);
  assert.deepEqual(week.liftMeta[DAY][lift], { groupId: 'A', origin: 'swap' });
});

// ---- 13. Bad input is refused, not half-applied -----------------------------

test('13. applySetRemoval refuses a missing lift or an out-of-range index', () => {
  const week = loggedWeek();
  const lift = Object.keys(week.lifts[DAY])[0];
  const before = JSON.stringify(week.lifts[DAY][lift]);

  assert.deepEqual(applySetRemoval(week, DAY, 'Nope', 0), { ok: false, reason: 'missing' });
  assert.deepEqual(applySetRemoval(week, DAY, lift, 99), { ok: false, reason: 'out-of-range' });
  assert.deepEqual(applySetRemoval(week, DAY, lift, -1), { ok: false, reason: 'out-of-range' });
  assert.equal(JSON.stringify(week.lifts[DAY][lift]), before);
  assert.equal(sessionSetPlan(week, DAY, lift), null, 'a refused removal stamps nothing');
});
