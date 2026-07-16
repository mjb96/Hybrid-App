import test from 'node:test';
import assert from 'node:assert/strict';

import { buildActivityHistory, filterActivityHistory } from '../js/activities/model.js';
import {
  deleteRunActivity, deleteStrengthActivity,
  restoreRunActivity, restoreStrengthActivity,
} from '../js/activities/mutations.js';
import { buildSessionRecap } from '../js/session-recap.js';

function fixture() {
  return {
    settings: { weightUnit: 'kg' },
    activeActivationId: 'act_1',
    weeks: {
      '1': {
        activationId: 'act_1',
        dates: { mon: '2026-07-13' },
        lifts: { mon: { Squat: [{ c: true, w: '100', r: '5' }] } },
        liftOrder: { mon: ['Squat'] },
        liftMeta: { mon: { Squat: { groupId: null } } },
        notes: { mon: 'Strong day' },
        gymRpe: { mon: '8' },
        gymStats: { mon: { time: '45:00', avgHR: '120' } },
        runs: { mon: { sessionId: 'run_b', dist: '3', time: '15:00' } },
        runSessions: { mon: [
          { sessionId: 'run_a', source: 'gps', localDate: '2026-07-13', startTs: 100, dist: '5', time: '25:00', splits: [] },
          { sessionId: 'run_b', source: 'manual', localDate: '2026-07-13', startTs: 200, dist: '3', time: '15:00', splits: [] },
        ] },
      },
    },
  };
}

test('history creates one strength row and one row for every same-day run', () => {
  const rows = buildActivityHistory(fixture());
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.kind).sort(), ['run', 'run', 'strength']);
  assert.deepEqual(rows.filter((row) => row.kind === 'run').map((row) => row.sessionId), ['run_b', 'run_a']);
  assert.equal(rows.find((row) => row.kind === 'strength').workingSets, 1);
  assert.equal(filterActivityHistory(rows, 'run', '2026-07-13').length, 2);
});

test('deleting an exact run preserves its sibling and all strength data', () => {
  const state = fixture();
  const week = state.weeks['1'];
  const snapshot = deleteRunActivity(week, 'mon', 'run_a');
  assert.equal(snapshot.sessionId, 'run_a');
  assert.deepEqual(week.runSessions.mon.map((run) => run.sessionId), ['run_b']);
  assert.equal(week.runs.mon.sessionId, 'run_b');
  assert.equal(week.lifts.mon.Squat[0].w, '100');
  assert.equal(restoreRunActivity(week, 'mon', snapshot), true);
  assert.deepEqual(week.runSessions.mon.map((run) => run.sessionId).sort(), ['run_a', 'run_b']);
});

test('deleting strength preserves every run and can be fully undone', () => {
  const state = fixture();
  const week = state.weeks['1'];
  const snapshot = deleteStrengthActivity(week, 'mon', {
    lifts: { Squat: [{ c: false, w: '', r: '5' }] },
    liftOrder: ['Squat'],
  });
  assert.equal(week.lifts.mon.Squat[0].c, false);
  assert.equal(week.notes.mon, '');
  assert.deepEqual(week.runSessions.mon.map((run) => run.sessionId), ['run_a', 'run_b']);
  assert.equal(restoreStrengthActivity(week, 'mon', snapshot), true);
  assert.equal(week.lifts.mon.Squat[0].w, '100');
  assert.equal(week.notes.mon, 'Strong day');
  assert.equal(week.gymStats.mon.avgHR, '120');
});

test('activity detail isolates strength from runs and an exact run from strength', () => {
  const state = fixture();
  const strength = buildSessionRecap(state, '1', 'mon', null, 'strength');
  const run = buildSessionRecap(state, '1', 'mon', 'run_a', 'run');
  assert.equal(strength.lifts.length, 1);
  assert.equal(strength.run, null);
  assert.equal(run.lifts.length, 0);
  assert.equal(run.run.sessionId, 'run_a');
  assert.equal(run.run.distKm, 5);
});
