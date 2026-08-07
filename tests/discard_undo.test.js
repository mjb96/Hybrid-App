// =============================================================================
// DISCARD UNDO (Phase 2B) — a destructive action you can take back.
//
// Discarding a day's workout used to be immediate and final, announced by copy
// that said "Clear today's log?" even when the selected day was not today — the
// one moment a confirmation must not be vague.
//
// Two halves are pinned here:
//
//  1. The SNAPSHOT must capture every field the clear overwrites. A field
//     cleared but not captured is silently unrecoverable, which is the worst way
//     for an Undo to fail: it looks like it worked.
//
//  2. The undo bar is shared with Activities (one DOM element), so it must have
//     exactly one owner. `finalize` — the irreversible half, deleting a stored
//     GPS route — must run exactly once: never twice, and never not at all.
//     A finalize that is skipped orphans a route in IndexedDB; one that runs on
//     an undone change destroys a route the athlete just restored.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteDayWorkoutData, snapshotDayWorkoutData, restoreDayWorkoutData,
} from '../js/workout/delete-day.js';
import {
  showUndo, runUndo, flushUndo, hasPendingUndo, __resetUndoForTests,
} from '../js/ui/undo-bar.js';

const set = (w, r) => ({ c: true, w: String(w), r: String(r) });

function weekWithWork() {
  return {
    dates: { mon: '2026-07-13' },
    lifts: { mon: { 'Back Squat': [set(140, 5), set(140, 5)] } },
    liftOrder: { mon: ['Back Squat'] },
    liftMeta: { mon: { 'Back Squat': { swapped: true } } },
    notes: { mon: 'felt strong' },
    gymRpe: { mon: '8' },
    gymStats: { mon: { time: '52:00', avgHR: '141', maxHR: '170', cals: '480' } },
    runSessions: { mon: [{ sessionId: 'run_1', dist: '5.0', time: '25:00', source: 'gps' }] },
    runs: { mon: { sessionId: 'run_1', dist: '5.0', time: '25:00' } },
    sessionStatus: { mon: 'finished' },
    sessionSummary: { mon: { sets: 2 } },
  };
}

// ── Snapshot / restore ───────────────────────────────────────────────────────

test('a discard is fully reversible', () => {
  const week = weekWithWork();
  const before = JSON.parse(JSON.stringify(week));
  const snapshot = snapshotDayWorkoutData(week, 'mon');

  deleteDayWorkoutData(week, 'mon', { lifts: {}, liftOrder: [] });
  assert.deepEqual(week.lifts.mon, {}, 'the clear must actually clear');
  assert.equal(week.notes.mon, '');

  restoreDayWorkoutData(week, snapshot);
  assert.deepEqual(week.lifts.mon, before.lifts.mon);
  assert.deepEqual(week.liftOrder.mon, before.liftOrder.mon);
  assert.deepEqual(week.liftMeta.mon, before.liftMeta.mon);
  assert.equal(week.notes.mon, before.notes.mon);
  assert.equal(week.gymRpe.mon, before.gymRpe.mon);
  assert.deepEqual(week.gymStats.mon, before.gymStats.mon);
  assert.deepEqual(week.runSessions.mon, before.runSessions.mon);
  assert.deepEqual(week.sessionStatus.mon, before.sessionStatus.mon);
  assert.deepEqual(week.sessionSummary.mon, before.sessionSummary.mon);
});

test('the snapshot covers every field the clear overwrites', () => {
  // Guards the pair directly: if a future field is added to the clear list
  // without being captured, its value survives the round trip as cleared.
  const week = weekWithWork();
  const snapshot = snapshotDayWorkoutData(week, 'mon');
  deleteDayWorkoutData(week, 'mon', { lifts: {}, liftOrder: [] });
  const cleared = JSON.parse(JSON.stringify(week));
  restoreDayWorkoutData(week, snapshot);
  for (const bucket of Object.keys(cleared)) {
    if (bucket === 'dates') continue;               // a discard never re-dates the slot
    const stillCleared = JSON.stringify(week[bucket]?.mon) === JSON.stringify(cleared[bucket]?.mon);
    assert.ok(!stillCleared || bucket === 'dates',
      `${bucket}[mon] was cleared but not restored — it is missing from the snapshot`);
  }
});

test('the snapshot is a deep copy, not a live reference', () => {
  const week = weekWithWork();
  const snapshot = snapshotDayWorkoutData(week, 'mon');
  week.lifts.mon['Back Squat'][0].w = '999';        // mutate after snapshotting
  deleteDayWorkoutData(week, 'mon', { lifts: {}, liftOrder: [] });
  restoreDayWorkoutData(week, snapshot);
  assert.equal(week.lifts.mon['Back Squat'][0].w, '140', 'the snapshot must hold the pre-mutation values');
});

test('restoring does not invent keys the day never had', () => {
  const week = { lifts: { mon: { Squat: [set(100, 5)] } } };
  const snapshot = snapshotDayWorkoutData(week, 'mon');
  deleteDayWorkoutData(week, 'mon', { lifts: {}, liftOrder: [] });
  restoreDayWorkoutData(week, snapshot);
  assert.equal(week.notes.mon, undefined, 'a field that was absent must not come back as a value');
});

test('snapshot and restore tolerate malformed input', () => {
  assert.equal(snapshotDayWorkoutData(null, 'mon'), null);
  assert.equal(snapshotDayWorkoutData({}, ''), null);
  assert.equal(restoreDayWorkoutData(null, { day: 'mon' }), false);
  assert.equal(restoreDayWorkoutData({}, null), false);
});

// ── The shared undo bar ──────────────────────────────────────────────────────

test('undo runs the reversal and never the irreversible half', async () => {
  __resetUndoForTests();
  let undone = 0, finalized = 0;
  showUndo('Workout discarded', () => { undone++; }, () => { finalized++; });
  assert.equal(hasPendingUndo(), true);
  assert.equal(await runUndo(), true);
  assert.equal(undone, 1);
  assert.equal(finalized, 0, 'a restored route must never be deleted');
  assert.equal(hasPendingUndo(), false);
});

test('letting the window lapse finalizes exactly once', async () => {
  __resetUndoForTests();
  let finalized = 0;
  showUndo('Workout discarded', () => {}, () => { finalized++; });
  await flushUndo();
  assert.equal(finalized, 1);
  await flushUndo();
  assert.equal(finalized, 1, 'flushing twice must not finalize twice');
  assert.equal(hasPendingUndo(), false);
});

test('a second undoable action finalizes the first', async () => {
  // The athlete moved on, so the earlier change is permanent — but its
  // irreversible half must still run rather than being stranded.
  __resetUndoForTests();
  let firstFinalized = 0, secondFinalized = 0;
  showUndo('First', () => {}, () => { firstFinalized++; });
  showUndo('Second', () => {}, () => { secondFinalized++; });
  assert.equal(firstFinalized, 1, 'the displaced change must finalize');
  assert.equal(secondFinalized, 0);
  await runUndo();
  assert.equal(secondFinalized, 0, 'the surviving change was undone, so it must not finalize');
});

test('undo after the change was already finalized does nothing', async () => {
  __resetUndoForTests();
  let undone = 0;
  showUndo('Workout discarded', () => { undone++; }, () => {});
  await flushUndo();
  assert.equal(await runUndo(), false, 'nothing is pending');
  assert.equal(undone, 0);
});

test('runUndo with nothing pending is safe', async () => {
  __resetUndoForTests();
  assert.equal(await runUndo(), false);
  await flushUndo();
});
