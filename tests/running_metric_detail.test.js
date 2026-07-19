import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  RUNNING_METRICS,
  buildRunningMetricDetail,
  collectRunningHistory,
} from '../js/analytics/running-detail.js';

function run(sessionId, dist, time, extra = {}) {
  return { sessionId, dist: String(dist), time, type: 'run', source: 'gps', ...extra };
}

function fixture() {
  return {
    currentWeek: 1,
    thresholdPaceSeconds: 300,
    settings: { distanceUnit: 'km' },
    weeks: {
      'arch:old:1': {
        activationId: 'old',
        dates: { mon: '2026-07-06', wed: '2026-07-08', sun: null },
        runSessions: {
          mon: [run('old_mon', 5, '27:30', { avgHR: 150, rpe: 6 })],
          wed: [run('old_wed', 5, '30:00', { avgHR: 145, rpe: 5 })],
          sun: [run('undated', 7, '40:00')],
        },
      },
      '1': {
        activationId: 'new',
        dates: { mon: '2026-07-13', tue: '2026-07-14', wed: '2026-07-15', fri: '2026-07-17' },
        runSessions: {
          mon: [run('current_5k', 5, '25:00', { avgHR: 155, maxHR: 180, avgCadence: 170, rpe: 7, elev: 40 })],
          tue: [{ ...run('walk_2k', 2, '30:00', { avgHR: 105, rpe: 3 }), type: 'walk' }],
          wed: [
            run('current_10k', 10, '55:00', { avgHR: 160, maxHR: 185, avgCadence: 174, rpe: 8, elev: 80 }),
            run('short_spike', 0.2, '0:20', { avgHR: 170, maxHR: 190, rpe: 9 }),
          ],
          fri: [run('future', 100, '4:00:00', { rpe: 10 })],
        },
      },
    },
  };
}

test('running metric registry has stable unique identities and explicit contracts', () => {
  assert.ok(RUNNING_METRICS.length >= 25);
  assert.equal(new Set(RUNNING_METRICS.map((metric) => metric.id)).size, RUNNING_METRICS.length);
  for (const metric of RUNNING_METRICS) {
    assert.match(metric.id, /^running\.[a-z0-9-]+$/);
    for (const field of ['label', 'unit', 'scope', 'calculation', 'source', 'empty']) {
      assert.ok(metric[field], `${metric.id} missing ${field}`);
    }
    assert.ok(Array.isArray(metric.limitations));
  }
});

test('history includes archives and independent same-day sessions but excludes future and undated records', () => {
  const history = collectRunningHistory(fixture(), { today: '2026-07-16' });
  assert.deepEqual(history.records.map((record) => record.activityId), [
    'run:old_mon', 'run:old_wed', 'run:current_5k', 'run:walk_2k', 'run:current_10k', 'run:short_spike',
  ]);
  assert.equal(history.exclusions.undated, 1);
  assert.equal(history.exclusions.future, 1);
  assert.equal(history.records.filter((record) => record.date === '2026-07-15').length, 2);
});

test('weekly distance is calendar-dated, archive-aware and elapsed-matched', () => {
  const detail = buildRunningMetricDetail(fixture(), 'running.weekly-distance', { today: '2026-07-16' });
  assert.equal(detail.value, 17.2);
  assert.equal(detail.comparison.previousValue, 10);
  assert.equal(detail.comparison.percentageChange, 72);
  assert.equal(detail.period.status, 'Live calendar week');
  assert.deepEqual(detail.contributing.map((record) => record.activityId), [
    'run:current_5k', 'run:walk_2k', 'run:current_10k', 'run:short_spike',
  ]);
  assert.equal(detail.dailyBreakdown.length, 7);
  assert.equal(detail.dailyBreakdown[0].formatted, '5.0 km');
  assert.equal(detail.dailyBreakdown[2].formatted, '10.2 km');
  assert.equal(detail.dailyBreakdown[4].formatted, 'Upcoming');
});

test('average pace is distance-weighted and excludes walks and implausible short records', () => {
  const detail = buildRunningMetricDetail(fixture(), 'running.average-pace', { today: '2026-07-16' });
  assert.equal(Math.round(detail.value), 330);
  assert.equal(detail.formattedValue, '5:30 /km');
  assert.deepEqual(detail.contributing.map((record) => record.activityId), [
    'run:old_mon', 'run:old_wed', 'run:current_5k', 'run:current_10k',
  ]);
  assert.equal(detail.exclusions.paceIneligible, 2);
});

test('rolling metrics label the actual equal-length comparison window', () => {
  const state = { weeks: {
    old: { dates: { mon: '2026-06-01' }, runSessions: { mon: [run('prior_window', 5, '30:00')] } },
    current: { dates: { mon: '2026-07-01' }, runSessions: { mon: [run('current_window', 5, '25:00')] } },
  } };
  const detail = buildRunningMetricDetail(state, 'running.average-pace', { today: '2026-07-16' });
  assert.equal(detail.comparison.comparisonLabel, 'vs previous 28 days');
});

test('best pace identifies an exact eligible whole-session source activity', () => {
  const detail = buildRunningMetricDetail(fixture(), 'running.best-pace', { today: '2026-07-16' });
  assert.equal(detail.formattedValue, '5:00 /km');
  assert.deepEqual(detail.contributing.map((record) => record.activityId), ['run:current_5k']);
  const recordWeek = detail.series.find((point) => point.weekStart === '2026-07-13');
  assert.ok(recordWeek.evidence.some((record) => record.activityId === 'run:current_5k'));
  assert.ok(!detail.contributing.some((record) => record.activityId === 'run:short_spike'));
});

test('longest run and distance PB evidence identify only the records producing the result', () => {
  const longest = buildRunningMetricDetail(fixture(), 'running.longest-run', { today: '2026-07-16' });
  assert.deepEqual(longest.contributing.map((record) => record.activityId), ['run:current_10k']);
  const personalBests = buildRunningMetricDetail(fixture(), 'running.personal-bests', { today: '2026-07-16' });
  assert.equal(personalBests.value, 2);
  assert.deepEqual(personalBests.contributing.map((record) => record.activityId), ['run:current_5k', 'run:current_10k']);
});

test('edits and deletions recalculate from live state without a stale analytics cache', () => {
  const state = fixture();
  assert.equal(buildRunningMetricDetail(state, 'running.total-distance', { today: '2026-07-16' }).value, 27.2);
  state.weeks['1'].runSessions.wed = [state.weeks['1'].runSessions.wed[1]];
  assert.equal(buildRunningMetricDetail(state, 'running.total-distance', { today: '2026-07-16' }).value, 17.2);
  state.weeks['1'].runSessions.mon[0].dist = '6';
  assert.equal(buildRunningMetricDetail(state, 'running.total-distance', { today: '2026-07-16' }).value, 18.2);
});

test('range selection changes only the requested metric series', () => {
  const state = fixture();
  const four = buildRunningMetricDetail(state, 'running.weekly-distance', { today: '2026-07-16', range: '4w' });
  const year = buildRunningMetricDetail(state, 'running.weekly-distance', { today: '2026-07-16', range: '1y' });
  assert.equal(four.series.length, 4);
  assert.equal(year.series.length, 52);
  assert.equal(four.value, year.value);
});

test('configured VDOT does not fabricate historical setting values', () => {
  const detail = buildRunningMetricDetail(fixture(), 'running.vdot', { today: '2026-07-16', range: '4w' });
  assert.equal(detail.value, 41);
  assert.ok(detail.series.some((point) => point.value !== detail.value));
});

test('zero activity counts are honest empty states', () => {
  const detail = buildRunningMetricDetail({ weeks: {} }, 'running.total-run-count', { today: '2026-07-16' });
  assert.equal(detail.value, 0);
  assert.equal(detail.formattedValue, '—');
  assert.equal(detail.empty, true);
});

test('zero form without eligible load evidence is unavailable, not a recovery claim', () => {
  const detail = buildRunningMetricDetail({ weeks: {} }, 'running.form', { today: '2026-07-16' });
  assert.equal(detail.value, 0);
  assert.equal(detail.formattedValue, '—');
  assert.equal(detail.empty, true);
  assert.match(detail.interpretation, /duration \+ RPE baseline/i);
});

test('1,000 mixed activities remain comfortably responsive in the pure detail model', () => {
  const state = { settings: { distanceUnit: 'km' }, weeks: {} };
  for (let weekIndex = 0; weekIndex < 100; weekIndex++) {
    const weekKey = weekIndex < 50 ? `arch:stress:${weekIndex}` : String(weekIndex - 49);
    const weekStart = new Date(Date.UTC(2024, 7, 12 + weekIndex * 7));
    const date = weekStart.toISOString().slice(0, 10);
    state.weeks[weekKey] = {
      activationId: weekIndex < 50 ? 'old' : 'active',
      dates: { mon: date },
      runSessions: { mon: Array.from({ length: 10 }, (_, index) => run(`stress_${weekIndex}_${index}`, 5 + index / 10, '30:00', { rpe: 6, avgHR: 150 })) },
    };
  }
  const started = performance.now();
  const history = collectRunningHistory(state, { today: '2026-07-19' });
  const detail = buildRunningMetricDetail(state, 'running.average-pace', { history, range: '1y' });
  const elapsed = performance.now() - started;
  assert.equal(history.records.length, 1000);
  assert.equal(detail.series.length, 52);
  assert.ok(elapsed < 500, `expected <500ms, took ${elapsed.toFixed(1)}ms`);
});
