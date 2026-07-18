import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dailyTrainingLoadTimeline,
  dayTrainingLoad,
  programWeekDailyLoads,
  programWeekLoadBreakdown,
} from '../js/metrics/training-load.js';
import { weeklyLoadSeries, weekDailyLoads } from '../js/metrics/metrics-load.js';
import { recoveryCostBreakdown, recoveryCostSeries, recomputeLoadMetrics } from '../js/brain/load_models.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const strengthSession = (date, rpe, minutes, extra = {}) => ({
  dates: { mon: date },
  lifts: { mon: { Squat: [{ c: true, w: '100', r: '5' }] } },
  gymRpe: { mon: String(rpe) },
  gymStats: { mon: { time: String(minutes) } },
  runs: {},
  ...extra,
});

test('all program-week load APIs are adapters over one golden sRPE formula', () => {
  const state = { weeks: {
    '1': {
      gymRpe: { mon: '8' }, gymStats: { mon: { time: '60' } },
      runSessions: { mon: [
        { sessionId: 'r1', time: '20:00', rpe: '5' },
        { sessionId: 'r2', time: '10:00', rpe: '6' },
      ] },
    },
  } };
  // Strength 8×60=480; runs 5×20 + 6×10=160; total 640.
  assert.deepEqual(dayTrainingLoad(state.weeks['1'], 'mon'), { strength: 480, endurance: 160, total: 640 });
  assert.deepEqual(programWeekLoadBreakdown(state, DAYS, 1), {
    strength: [480], endurance: [160], total: [640],
  });
  assert.deepEqual(weeklyLoadSeries(state, DAYS, 1), { lift: [480], run: [160] });
  assert.deepEqual(recoveryCostBreakdown(state, DAYS, 1), {
    strength: [480], endurance: [160], total: [640],
  });
  assert.deepEqual(recoveryCostSeries(state, DAYS, 1), [640]);
  assert.deepEqual(weekDailyLoads(state, DAYS, 1), programWeekDailyLoads(state, DAYS, 1));
});

test('dated rolling load includes archived activations and one-off sessions', () => {
  const state = { weeks: {
    'arch:act_old:3': strengthSession('2026-07-10', 8, 60, {
      activationId: 'act_old', programId: 'old_program',
    }),
    'session:str_new': strengthSession('2026-07-12', 6, 30, {
      sessionId: 'str_new', sessionKind: 'empty', startedAt: '2026-07-12T08:00:00Z',
      programId: null,
    }),
  } };
  const timeline = dailyTrainingLoadTimeline(state, { throughDate: '2026-07-13' });
  assert.deepEqual(timeline, [
    { date: '2026-07-10', load: 480 },
    { date: '2026-07-11', load: 0 },
    { date: '2026-07-12', load: 180 },
    { date: '2026-07-13', load: 0 },
  ]);
  const all = recomputeLoadMetrics(state, { throughDate: '2026-07-13' });
  const withoutArchive = recomputeLoadMetrics({ weeks: { 'session:str_new': state.weeks['session:str_new'] } }, { throughDate: '2026-07-13' });
  assert.ok(all.ctl > withoutArchive.ctl, 'prior activation contributes to chronic load');
  assert.ok(all.atl > withoutArchive.atl, 'prior activation contributes to acute load');
});

test('rolling load is date-strict, dedupes legacy slots, and sums independent same-day sessions', () => {
  const duplicateA = strengthSession('2026-07-10', 8, 30);
  const duplicateB = strengthSession('2026-07-10', 8, 30);
  const independent = strengthSession('2026-07-10', 6, 20, {
    sessionId: 'str_independent', sessionKind: 'empty',
  });
  const undated = strengthSession(null, 10, 100);
  const state = { weeks: {
    '1': duplicateA,
    '2': duplicateB,
    'session:str_independent': independent,
    undated,
  } };
  assert.deepEqual(dailyTrainingLoadTimeline(state, { throughDate: '2026-07-10' }), [
    { date: '2026-07-10', load: 360 }, // one legacy 240 + independent 120
  ]);
});
