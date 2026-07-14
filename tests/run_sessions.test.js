import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearRunSessions, hasRunData, legacyRunSessionId, migrateLegacyRunSessions,
  runDaySummary, runLoadForDay, runSessionsForDay, upsertRunSession,
} from '../js/state/run-sessions.js';
import { CURRENT_SCHEMA_VERSION, migrateState } from '../js/state/migrations.js';

test('empty run scaffolding is not activity', () => {
  assert.equal(hasRunData({ dist: '', time: '', rpe: '' }), false);
  assert.equal(hasRunData({ dist: '5', time: '' }), true);
  assert.equal(hasRunData(null), false);
});

test('two same-day sessions keep distinct stable ids and latest cockpit projection', () => {
  const week = { runs: { mon: { dist: '', time: '', rpe: '' } }, runSessions: { mon: [] } };
  upsertRunSession(week, 'mon', { dist: '5', time: '25:00', rpe: '6' }, {
    sessionId: 'run_a', source: 'manual', localDate: '2026-07-14', updatedTs: 10,
  });
  upsertRunSession(week, 'mon', { dist: '3', time: '18:00', rpe: '4' }, {
    sessionId: 'run_b', source: 'gps', localDate: '2026-07-14', updatedTs: 20,
  });

  assert.deepEqual(runSessionsForDay(week, 'mon').map((r) => r.sessionId), ['run_a', 'run_b']);
  assert.equal(week.runs.mon.sessionId, 'run_b');
  assert.equal(week.runs.mon.dist, '3');

  // Updating run_b edits it in place; it never appends a duplicate.
  upsertRunSession(week, 'mon', { dist: '3.2', time: '18:30' }, {
    sessionId: 'run_b', updatedTs: 30,
  });
  assert.equal(runSessionsForDay(week, 'mon').length, 2);
  assert.equal(runSessionsForDay(week, 'mon')[1].dist, '3.2');

  // localStorage/cloud JSON serialization preserves both canonical sessions.
  const reloaded = JSON.parse(JSON.stringify({ weeks: { 1: week } }));
  assert.deepEqual(
    runSessionsForDay(reloaded.weeks['1'], 'mon').map((r) => [r.sessionId, r.source]),
    [['run_a', 'manual'], ['run_b', 'gps']],
  );
});

test('same-day analytics sum distance, duration, zones and exact per-session load', () => {
  const week = { runs: {}, runSessions: { tue: [] } };
  upsertRunSession(week, 'tue', {
    dist: '5', time: '25:00', rpe: '6', avgHR: 150, maxHR: 170,
    elev: 40, cals: 300, hrZones: [1, 2, 3, 4, 5], type: 'run',
  }, { sessionId: 'run_1', updatedTs: 1 });
  upsertRunSession(week, 'tue', {
    dist: '2', time: '20:00', rpe: '3', avgHR: 100, maxHR: 120,
    elev: 10, cals: 100, hrZones: [5, 4, 3, 2, 1], type: 'walk',
  }, { sessionId: 'run_2', updatedTs: 2 });

  const summary = runDaySummary(week, 'tue');
  assert.equal(summary.dist, 7);
  assert.equal(summary.time, '45:00');
  assert.equal(summary.sessionCount, 2);
  assert.equal(summary.type, 'run');
  assert.equal(summary.elev, 50);
  assert.equal(summary.cals, 400);
  assert.deepEqual(summary.hrZones, [6, 6, 6, 6, 6]);
  assert.equal(runLoadForDay(week, 'tue'), 210); // 6×25 + 3×20
});

test('clear removes one exact session or the whole day without resurrecting projection', () => {
  const week = { runs: {}, runSessions: { wed: [] } };
  upsertRunSession(week, 'wed', { dist: '4' }, { sessionId: 'a', updatedTs: 1 });
  upsertRunSession(week, 'wed', { dist: '6' }, { sessionId: 'b', updatedTs: 2 });
  assert.equal(clearRunSessions(week, 'wed', 'b'), 1);
  assert.equal(week.runs.wed.sessionId, 'a');
  assert.equal(clearRunSessions(week, 'wed'), 1);
  assert.deepEqual(week.runSessions.wed, []);
  assert.deepEqual(week.runs.wed, { dist: '', time: '', rpe: '' });
});

test('legacy migration is deterministic, non-destructive and idempotent', () => {
  const state = {
    weeks: {
      '1': {
        activationId: 'act_a',
        dates: { mon: '2026-07-13' },
        runs: { mon: { dist: '5', time: '24:00', rpe: '7', notes: 'kept' }, tue: { dist: '', time: '', rpe: '' } },
      },
    },
  };
  assert.equal(migrateLegacyRunSessions(state, ['mon', 'tue']), 1);
  const id = legacyRunSessionId('act_a', '1', 'mon');
  assert.equal(state.weeks['1'].runSessions.mon[0].sessionId, id);
  assert.equal(state.weeks['1'].runSessions.mon[0].notes, 'kept');
  assert.deepEqual(state.weeks['1'].runSessions.tue, []);
  assert.equal(migrateLegacyRunSessions(state, ['mon', 'tue']), 0);
  assert.equal(state.weeks['1'].runSessions.mon.length, 1);
});

test('v4 state migration adopts legacy runs after activation identity', () => {
  const state = {
    schemaVersion: 3,
    activeActivationId: 'act_existing',
    activeProgramId: 'hybrid_engine',
    weeks: { '2': { activationId: 'act_existing', dates: { fri: '2026-07-10' }, runs: { fri: { dist: '8', time: '40:00' } } } },
  };
  migrateState(state);
  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(state.weeks['2'].runSessions.fri.length, 1);
  assert.equal(state.weeks['2'].runSessions.fri[0].sessionId, legacyRunSessionId('act_existing', '2', 'fri'));
  assert.equal(state.weeks['2'].runs.fri.dist, '8');
});
