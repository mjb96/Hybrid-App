// =============================================================================
// RECOVERY METRIC DETAIL — roadmap 3D.
//
// Recovery was the only domain with no inspectable metrics. These tests hold
// the new details to the same standard as Running and Strength, plus the two
// obligations unique to this domain:
//
//   • LOWER IS BETTER for resting HR and soreness — a fall is an improvement,
//     and reporting direction without that would invert half the domain.
//   • SELF-REPORTED vs DEVICE-MEASURED readings get different confidence
//     language rather than being presented as equally objective.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECOVERY_METRICS, buildRecoveryMetricDetail, recoveryMetricById,
  formatRecoveryValue, SOURCE_KIND,
} from '../js/analytics/recovery-detail.js';

const TODAY = '2026-07-20';
const day = (n) => {
  const d = new Date(`${TODAY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const wellness = (rows) => ({ wellnessLog: rows });
const build = (state, id, range = '4w') => buildRecoveryMetricDetail(state, id, { today: TODAY, range });

// ---- registry ---------------------------------------------------------------

test('every recovery metric declares a source kind, calculation and confidence', () => {
  assert.ok(RECOVERY_METRICS.length >= 5);
  for (const m of RECOVERY_METRICS) {
    assert.ok(m.id.startsWith('recovery.'), `${m.id} namespaced`);
    assert.ok(Object.values(SOURCE_KIND).includes(m.sourceKind), `${m.id} source kind`);
    assert.ok(m.calculation && m.calculation.length > 20, `${m.id} explains its calculation`);
    assert.ok(m.confidence, `${m.id} states confidence`);
    assert.ok(m.empty, `${m.id} has empty copy`);
  }
});

test('self-reported and device metrics carry different confidence language', () => {
  const sleep = recoveryMetricById('recovery.sleep');
  const hrv = recoveryMetricById('recovery.hrv');
  assert.match(sleep.confidence, /Self-reported/);
  assert.match(hrv.confidence, /Device-measured/);
  assert.notEqual(sleep.confidence, hrv.confidence);
});

test('an unknown metric id returns null rather than a blank screen', () => {
  assert.equal(recoveryMetricById('recovery.nope'), null);
  assert.equal(buildRecoveryMetricDetail({}, 'recovery.nope', { today: TODAY }), null);
});

// ---- the inverse-metric obligation ------------------------------------------

test('a FALLING resting heart rate is reported as an improvement', () => {
  // Previous 28d ~60bpm, current 28d ~54bpm. Lower is better here.
  const rhr = [];
  for (let i = 0; i < 28; i++) rhr.push({ date: day(i), bpm: 54 });
  for (let i = 28; i < 56; i++) rhr.push({ date: day(i), bpm: 60 });
  const model = build({ healthConnect: { restingHR: rhr } }, 'recovery.resting-hr');
  assert.equal(model.value, 54);
  assert.equal(model.comparison.direction, 'down');
  assert.equal(model.comparison.favourable, true, 'a lower resting HR must read as better');
  assert.match(model.interpretation, /better/);
});

test('a RISING resting heart rate is reported as worse, not as progress', () => {
  const rhr = [];
  for (let i = 0; i < 28; i++) rhr.push({ date: day(i), bpm: 64 });
  for (let i = 28; i < 56; i++) rhr.push({ date: day(i), bpm: 58 });
  const model = build({ healthConnect: { restingHR: rhr } }, 'recovery.resting-hr');
  assert.equal(model.comparison.direction, 'up');
  assert.equal(model.comparison.favourable, false);
  assert.match(model.interpretation, /worse/);
});

test('a rising non-inverse metric is the improvement instead', () => {
  const log = [];
  for (let i = 0; i < 28; i++) log.push({ date: day(i), sleep: 8 });
  for (let i = 28; i < 56; i++) log.push({ date: day(i), sleep: 7 });
  const model = build(wellness(log), 'recovery.sleep');
  assert.equal(model.comparison.direction, 'up');
  assert.equal(model.comparison.favourable, true, 'more sleep is better');
});

test('falling soreness reads as better, matching resting HR not sleep', () => {
  const log = [];
  for (let i = 0; i < 28; i++) log.push({ date: day(i), soreness: 2 });
  for (let i = 28; i < 56; i++) log.push({ date: day(i), soreness: 4 });
  const model = build(wellness(log), 'recovery.soreness');
  assert.equal(model.comparison.favourable, true);
});

test('an unchanged period is neither better nor worse', () => {
  const log = [];
  for (let i = 0; i < 56; i++) log.push({ date: day(i), sleep: 7.5 });
  const model = build(wellness(log), 'recovery.sleep');
  assert.equal(model.comparison.favourable, null, 'flat must not be dressed up as an improvement');
});

// ---- missing data is missing, not zero --------------------------------------

test('days without an entry are skipped, never counted as zero', () => {
  // Three 8-hour nights in a 28-day window; the other 25 days have no entry.
  const log = [{ date: day(0), sleep: 8 }, { date: day(3), sleep: 8 }, { date: day(9), sleep: 8 }];
  const model = build(wellness(log), 'recovery.sleep');
  assert.equal(model.value, 8, 'averaging over 28 days would have produced ~0.9h');
  assert.equal(model.readingCount, 3);
  assert.equal(model.series.length, 3, 'no zero-filled points');
});

test('an empty domain is honestly empty rather than zero', () => {
  const model = build({ wellnessLog: [] }, 'recovery.sleep');
  assert.equal(model.empty, true);
  assert.equal(model.value, null);
  assert.equal(model.comparison, null, 'nothing to compare must not fabricate a comparison');
  assert.equal(model.interpretation, recoveryMetricById('recovery.sleep').empty);
});

test('too few readings says so instead of implying a trend', () => {
  const model = build(wellness([{ date: day(1), sleep: 7 }, { date: day(2), sleep: 8 }]), 'recovery.sleep');
  assert.match(model.interpretation, /too few to read as a trend/);
});

test('no previous period is stated, not filled in', () => {
  const log = [];
  for (let i = 0; i < 10; i++) log.push({ date: day(i), sleep: 7 });
  const model = build(wellness(log), 'recovery.sleep');
  assert.equal(model.comparison.isComparable, false);
  assert.match(model.interpretation, /No comparable previous period/);
});

// ---- exclusions -------------------------------------------------------------

test('future-dated and implausible readings are excluded and counted', () => {
  const log = [
    { date: day(-3), sleep: 8 },     // future
    { date: day(1), sleep: 40 },     // implausible: 40h night
    { date: day(2), sleep: 0.1 },    // implausible: below the floor
    { date: day(3), sleep: 7 },
    { date: day(4), sleep: 8 },
    { date: day(5), sleep: 7.5 },
  ];
  const model = build(wellness(log), 'recovery.sleep');
  assert.equal(model.exclusions.future, 1);
  assert.equal(model.exclusions.implausible, 2);
  assert.equal(model.readingCount, 3, 'only the three plausible past readings count');
  assert.equal(model.value, 7.5);
});

test('a plausible extreme is kept — exclusion is for bad data, not inconvenient data', () => {
  const log = [];
  for (let i = 0; i < 5; i++) log.push({ date: day(i), sleep: 4 });   // genuinely short nights
  const model = build(wellness(log), 'recovery.sleep');
  assert.equal(model.exclusions.implausible, 0);
  assert.equal(model.value, 4);
});

// ---- ranges and Health Connect shapes ---------------------------------------

test('the range selector changes the window it averages', () => {
  const rhr = [];
  for (let i = 0; i < 28; i++) rhr.push({ date: day(i), bpm: 50 });
  for (let i = 28; i < 84; i++) rhr.push({ date: day(i), bpm: 70 });
  const state = { healthConnect: { restingHR: rhr } };
  assert.equal(build(state, 'recovery.resting-hr', '4w').value, 50);
  // 12 weeks pulls in the older, higher readings.
  assert.ok(build(state, 'recovery.resting-hr', '12w').value > 50);
  // An unknown range falls back to the default rather than breaking.
  assert.equal(buildRecoveryMetricDetail(state, 'recovery.resting-hr', { today: TODAY, range: 'nonsense' }).range, '4w');
});

test('HRV accepts the value keys Health Connect has used across versions', () => {
  for (const key of ['rmssd', 'value']) {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push({ date: day(i), [key]: 42 });
    const model = build({ healthConnect: { hrv: rows } }, 'recovery.hrv');
    assert.equal(model.value, 42, `HRV via "${key}"`);
  }
});

// ---- formatting -------------------------------------------------------------

test('values format with their real units and never show a fake zero', () => {
  const f = (id, v) => formatRecoveryValue(recoveryMetricById(id), v);
  assert.equal(f('recovery.sleep', 7.25), '7.3 h');
  assert.equal(f('recovery.hrv', 42.6), '43 ms');
  assert.equal(f('recovery.resting-hr', 54.2), '54 bpm');
  assert.equal(f('recovery.soreness', 2.5), '2.5 / 5');
  assert.equal(f('recovery.sleep', null), '—');
  assert.equal(f('recovery.sleep', NaN), '—');
});

test('interpretations never give medical or training instructions', () => {
  const log = [];
  for (let i = 0; i < 28; i++) log.push({ date: day(i), sleep: 5, soreness: 5, mood: 1 });
  for (let i = 28; i < 56; i++) log.push({ date: day(i), sleep: 8, soreness: 1, mood: 5 });
  for (const id of ['recovery.sleep', 'recovery.soreness', 'recovery.mood']) {
    const { interpretation } = build(wellness(log), id);
    assert.doesNotMatch(interpretation, /should|must|see a doctor|rest day|reduce|increase/i, `${id}: ${interpretation}`);
  }
});

test('the interpretation quotes the same formatted value as the headline', () => {
  // A 54.6 mean rendered as "55 bpm" in the headline must not appear as
  // "54.6 bpm" in the sentence below it — one number, one answer.
  const rhr = [];
  for (let i = 0; i < 28; i++) rhr.push({ date: day(i), bpm: i % 2 ? 54 : 55 });
  for (let i = 28; i < 56; i++) rhr.push({ date: day(i), bpm: 60 });
  const model = build({ healthConnect: { restingHR: rhr } }, 'recovery.resting-hr');
  const headline = formatRecoveryValue(model.definition, model.value);
  assert.ok(model.interpretation.includes(headline),
    `interpretation "${model.interpretation}" does not quote the headline "${headline}"`);
  assert.doesNotMatch(model.interpretation, /\d+\.\d+ bpm/, 'bpm must not appear with a decimal');
});

test('sleep keeps its decimal in both places', () => {
  const log = [];
  for (let i = 0; i < 28; i++) log.push({ date: day(i), sleep: 7.25 });
  for (let i = 28; i < 56; i++) log.push({ date: day(i), sleep: 8 });
  const model = build(wellness(log), 'recovery.sleep');
  assert.ok(model.interpretation.includes(formatRecoveryValue(model.definition, model.value)));
  assert.match(model.interpretation, /7\.3 h/);
});

test('steps read from their own Health Connect bucket and both value keys', () => {
  for (const key of ['value', 'count']) {
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push({ date: day(i), [key]: 9000 });
    const model = build({ healthConnect: { steps: rows } }, 'recovery.steps');
    assert.equal(model.value, 9000, `steps via "${key}"`);
    assert.equal(formatRecoveryValue(model.definition, model.value), '9,000 steps');
  }
});

test('more steps is better, and a stepless day is skipped not zeroed', () => {
  const rows = [];
  for (let i = 0; i < 28; i++) rows.push({ date: day(i), value: 11000 });
  for (let i = 28; i < 56; i++) rows.push({ date: day(i), value: 9000 });
  const model = build({ healthConnect: { steps: rows } }, 'recovery.steps');
  assert.equal(model.comparison.favourable, true, 'steps are not an inverse metric');

  // Two logged days in a 28-day window average those two days, not 28.
  const sparse = build({ healthConnect: { steps: [{ date: day(0), value: 10000 }, { date: day(5), value: 12000 }] } }, 'recovery.steps');
  assert.equal(sparse.value, 11000);
  assert.equal(sparse.readingCount, 2);
});
