import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStrengthMetricDetail,
  collectStrengthHistory,
  STRENGTH_METRICS,
} from '../js/analytics/strength-detail.js';

const completed = (w, r, extra = {}) => ({ w: String(w), r: String(r), c: true, ...extra });

function fixture() {
  return {
    settings: { weightUnit: 'kg' },
    weeks: {
      'arch:old:1': {
        sessionId: 'previous-window', sessionTitle: 'Old Upper',
        dates: { mon: '2026-06-22' },
        lifts: { mon: { 'Bench Press': [completed(100, 10)] } },
      },
      'arch:new:1': {
        sessionId: 'current-start', sessionTitle: 'Upper Volume',
        dates: { wed: '2026-07-01' },
        lifts: { wed: { 'Bench Press': [
          completed(100, 5),
          completed(20, 10, { type: 'W' }),
          { w: '100', r: '5', c: false },
        ] } },
      },
      '1': {
        sessionId: 'current-week', sessionTitle: 'Upper Strength',
        dates: { tue: '2026-07-21' },
        lifts: { tue: { 'Bench Press': [completed(100, 10)] } },
      },
      '2': {
        sessionId: 'future-strength', dates: { thu: '2026-07-23' },
        lifts: { thu: { Squat: [completed(200, 10)] } },
      },
      '3': {
        sessionId: 'undated-strength', dates: {},
        lifts: { fri: { Deadlift: [completed(200, 5)] } },
      },
      '4': {
        dates: { sat: '2026-07-25' },
        runs: { sat: { dist: '5', time: '25:00' } },
      },
    },
  };
}

test('Strength history is date-strict and retains exact workout evidence', () => {
  const history = collectStrengthHistory(fixture(), { today: '2026-07-22' });
  assert.deepEqual(history.records.map((record) => record.date), ['2026-06-22', '2026-07-01', '2026-07-21']);
  assert.deepEqual(history.records.map((record) => record.activityId), [
    'strength:previous-window', 'strength:current-start', 'strength:current-week',
  ]);
  assert.equal(history.exclusions.future, 1, 'future run-only records are not misreported as excluded strength');
  assert.equal(history.exclusions.undated, 1);
  assert.equal(history.records[1].workingSets, 1, 'warm-ups and incomplete rows are excluded');
  assert.equal(history.records[1].volumeKg, 500);
});

test('4-Week Volume and progression share the same trailing calendar evidence', () => {
  const state = fixture();
  const fourWeek = buildStrengthMetricDetail(state, 'strength.four-week-volume', { today: '2026-07-22', range: '4w' });
  const progression = buildStrengthMetricDetail(state, 'strength.volume-progression', { today: '2026-07-22', range: '4w' });

  assert.equal(fourWeek.value, 1500);
  assert.equal(fourWeek.formattedValue, '1,500 kg');
  assert.equal(fourWeek.comparison.previousTotal, 1000);
  assert.equal(fourWeek.comparison.percentageChange, 50);
  assert.equal(progression.value, 50);
  assert.equal(progression.formattedValue, '+50%');
  assert.deepEqual(progression.contributing.map((record) => record.activityId), [
    'strength:current-start', 'strength:current-week',
  ]);
  const latest = progression.series.at(-1);
  assert.equal(latest.value, 50);
  assert.deepEqual(latest.evidence.map((record) => record.activityId), [
    'strength:current-start', 'strength:current-week',
  ]);
});

test('Muscle Set Credits use the live calendar week and elapsed-matched comparison', () => {
  const model = buildStrengthMetricDetail(fixture(), 'strength.muscle-set-credits', { today: '2026-07-22' });
  assert.equal(model.value, 1.75);
  assert.equal(model.formattedValue, '1.8 credits');
  assert.equal(model.period.label, '2026-07-20 – 2026-07-26');
  assert.equal(model.contributing.length, 1);
  assert.equal(model.contributing[0].activityId, 'strength:current-week');
  assert.equal(model.comparison.comparisonLabel, 'vs same point last week');
});

test('registered Strength details have honest empty states and never emit invalid values', () => {
  for (const metric of STRENGTH_METRICS) {
    const model = buildStrengthMetricDetail({ settings: { weightUnit: 'kg' }, weeks: {} }, metric.id, { today: '2026-07-22' });
    assert.equal(model.empty, true, metric.id);
    assert.equal(model.formattedValue, '—', metric.id);
    if (model.comparison) assert.equal(model.comparison.message, 'Not enough previous data to compare', metric.id);
    assert.ok(!JSON.stringify(model).match(/NaN|Infinity/), metric.id);
  }
});
