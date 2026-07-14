// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { upsertRunSession } from '../js/state/run-sessions.js';
import {
  weeklyBestPaceSeries, weeklyDistanceSeries, weeklyPaceSeries,
} from '../js/metrics/metrics-running.js';
import { weeklyLoadSeries, weeklyRpeSeries } from '../js/metrics/metrics-load.js';
import { enduranceLoadSeries, recoveryCostSeries } from '../js/brain/load_models.js';
import { forEachLoggedDay } from '../js/analytics/logged-days.js';
import { buildWeekChart } from '../js/analytics/week-chart-model.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function multiRunState() {
  const week = {
    activationId: 'act_1',
    dates: { mon: '2026-07-13' },
    lifts: {}, gymRpe: {}, gymStats: {}, runs: {}, runSessions: {},
  };
  upsertRunSession(week, 'mon', {
    dist: '5', time: '25:00', rpe: '5', type: 'run',
  }, { sessionId: 'run_morning', localDate: '2026-07-13', updatedTs: 100 });
  upsertRunSession(week, 'mon', {
    dist: '3', time: '18:00', rpe: '7', type: 'run',
  }, { sessionId: 'run_evening', localDate: '2026-07-13', updatedTs: 200 });
  upsertRunSession(week, 'mon', {
    dist: '2', time: '30:00', rpe: '3', type: 'walk',
  }, { sessionId: 'walk_lunch', localDate: '2026-07-13', updatedTs: 300 });
  return {
    currentWeek: '1', weekStartedAt: '2026-07-13',
    weeks: { 1: week },
  };
}

test('all analytics preserve same-day sessions without double-counting the day', () => {
  const state = multiRunState();

  assert.deepEqual(weeklyDistanceSeries(state, DAYS, 1), [10]);
  assert.deepEqual(enduranceLoadSeries(state, DAYS, 1), [10]);
  assert.deepEqual(recoveryCostSeries(state, DAYS, 1), [341]);
  assert.deepEqual(weeklyLoadSeries(state, DAYS, 1).run, [341]);
  assert.deepEqual(weeklyRpeSeries(state, DAYS, 1), [5]);

  // Pace signals include both runs but exclude the walk.
  assert.deepEqual(weeklyPaceSeries(state, DAYS, 1), [322.5]);
  assert.deepEqual(weeklyBestPaceSeries(state, DAYS, 1), [300]);

  const loggedDays = [];
  forEachLoggedDay(state, DAYS, day => loggedDays.push(day));
  assert.equal(loggedDays.length, 1);
  assert.equal(loggedDays[0].distance, 10);
  assert.equal(loggedDays[0].run.sessionCount, 3);

  const chart = buildWeekChart(state, {
    type: 'running', metric: 'distance', today: '2026-07-14',
  });
  assert.equal(chart.total, 10);
  assert.equal(chart.days[0].value, 10);
});
