// =============================================================================
// ANALYTICS CORRECTNESS REGRESSIONS
//
// Three defects where the app contradicted itself or emitted invalid output:
//
//  1. Two streak numbers. Home used the date-strict computeStreak while
//     Progress → Review → Stats rebuilt its own set of trained dates by
//     approximating each slot from `weekStartedAt ± currentWeek` arithmetic.
//     The two disagreed whenever a session moved, logging had gaps, or an
//     activation was archived.
//  2. NaN heatmap cells. The training calendars are PROGRAM-week indexed, but
//     their builders ran parseInt over every week key — including an archived
//     activation's `arch:<id>:<n>` — producing NaN, which slipped past the
//     range guard (every NaN comparison is false) and emitted <rect x="NaN">.
//  3. Mislabelled weights. Weight display had no single owner, so a screen
//     could read settings.weightUnit for one figure and hardcode "kg" for the
//     next. There is no conversion in the app by design: a set is stored in
//     the unit it was entered in, so hardcoding the label misnames an lbs
//     athlete's own numbers.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak, activeTrainingDates } from '../js/home/dashboard-model.js';
import { renderConsistencyHeatmap } from '../js/analytics/charts.js';
import { renderVolumeCalendarHeatmap } from '../js/analytics/charts/strength-charts.js';
import { formatWeight, weightUnitOf } from '../js/analytics/utils.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w: String(w), r: String(r) });

const noop = () => {};
function makeEl() {
  const e = { setAttribute: noop, getAttribute: () => null, style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false } };
  let h = '';
  Object.defineProperty(e, 'innerHTML', { get: () => h, set: (x) => { h = String(x); } });
  return e;
}

// ---- 1. one streak definition ----------------------------------------------

test('the streak is computed from stamped dates, so archived runs still count', () => {
  const state = {
    currentWeek: '1',
    weekStartedAt: '2020-01-01T00:00:00.000Z', // deliberately far from the data
    weeks: {
      // Three consecutive days ending today, split across an archived
      // activation and the live one. The old approximation would have placed
      // these relative to weekStartedAt and found no streak at all.
      'arch:old-run:6': { dates: { mon: '2026-07-13' }, lifts: { mon: { Bench: [work(100, 5)] } } },
      '1': {
        dates: { tue: '2026-07-14', wed: '2026-07-15' },
        lifts: { tue: { Bench: [work(100, 5)] }, wed: { Bench: [work(100, 5)] } },
      },
    },
  };
  const dates = activeTrainingDates(state.weeks, DAYS, state);
  assert.ok(dates.has('2026-07-13'), 'archived activation contributes its real date');
  assert.ok(dates.has('2026-07-15'));
  assert.equal(dates.size, 3);

  const streak = computeStreak(state.weeks, DAYS, state, '2026-07-15');
  assert.equal(streak.current, 3);
  assert.equal(streak.longest, 3);
  assert.equal(streak.total, 3);
});

test('undated legacy activity never invents a streak day', () => {
  const state = { currentWeek: '4', weekStartedAt: '2026-07-13T00:00:00.000Z', weeks: {
    '1': { lifts: { mon: { Bench: [work(100, 5)] } } }, // no dates map at all
  } };
  assert.equal(activeTrainingDates(state.weeks, DAYS, state).size, 0);
  assert.equal(computeStreak(state.weeks, DAYS, state, '2026-07-15').current, 0);
});

test('a gap breaks the current streak but not the longest', () => {
  const state = { currentWeek: '1', weeks: { '1': {
    dates: { mon: '2026-07-06', tue: '2026-07-07', wed: '2026-07-08', sat: '2026-07-11' },
    lifts: {
      mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(100, 5)] },
      wed: { Bench: [work(100, 5)] }, sat: { Bench: [work(100, 5)] },
    },
  } } };
  const streak = computeStreak(state.weeks, DAYS, state, '2026-07-15');
  assert.equal(streak.current, 0, 'nothing logged on or before today in an unbroken run');
  assert.equal(streak.longest, 3);
});

// ---- 2. heatmaps never emit NaN geometry ------------------------------------

for (const [name, render] of [
  ['consistency heatmap', (el, days, labels) => renderConsistencyHeatmap(el, days, labels)],
  ['volume calendar heatmap', (el, days, labels) => renderVolumeCalendarHeatmap(el, days, labels, [100, 200, 300])],
]) {
  test(`${name} drops a non-numeric week instead of emitting NaN coordinates`, () => {
    const el = makeEl();
    render(el, [
      { week: 2, dayIdx: 1, gym: true, run: false },
      // What parseInt('arch:old-run:6', 10) yields — the exact production path.
      { week: NaN, dayIdx: 3, gym: true, run: false },
      { week: 1, dayIdx: NaN, gym: true, run: false },
    ], ['W1', 'W2', 'W3']);
    assert.doesNotMatch(el.innerHTML, /NaN/, 'no NaN reached an SVG attribute');
    assert.match(el.innerHTML, /<rect/, 'the valid cell still rendered');
  });
}

test('heatmaps still reject out-of-range cells', () => {
  const el = makeEl();
  renderConsistencyHeatmap(el, [{ week: 99, dayIdx: 0, gym: true, run: false }], ['W1', 'W2']);
  // Only the background grid and legend — no overlay cell for week 99.
  assert.doesNotMatch(el.innerHTML, /fill="#3b82f6" opacity/);
});

// ---- 3. one weight-unit owner ----------------------------------------------

test('weightUnitOf normalises to the two units settings actually stores', () => {
  assert.equal(weightUnitOf({ settings: { weightUnit: 'lbs' } }), 'lbs');
  assert.equal(weightUnitOf({ settings: { weightUnit: 'kg' } }), 'kg');
  assert.equal(weightUnitOf({}), 'kg');
  assert.equal(weightUnitOf(null), 'kg');
  assert.equal(weightUnitOf({ settings: { weightUnit: 'stone' } }), 'kg', 'unknown units fall back, never leak through');
});

test('formatWeight labels in the athlete\'s unit and stays honest about no data', () => {
  assert.equal(formatWeight(102.4, 'lbs'), '102 lbs');
  assert.equal(formatWeight(1500, 'kg'), '1,500 kg');
  assert.equal(formatWeight(2.75, 'kg', { decimals: 1 }), '2.8 kg');
  // No value must never render as "0 kg".
  assert.equal(formatWeight(0, 'kg'), '--');
  assert.equal(formatWeight(null, 'kg'), '--');
  assert.equal(formatWeight(NaN, 'kg'), '--');
  assert.equal(formatWeight(undefined, 'kg', { empty: '—' }), '—');
});

test('no analytics view hardcodes a kg label', async () => {
  // The defect was mixed units on ONE screen, so this guards the whole folder
  // rather than the single file that happened to be worst.
  const { readdir, readFile } = await import('node:fs/promises');
  // Includes insights AND js/brain: coaching text, briefings, weekly/monthly
  // review copy and projection lines all quote real loads. Three hardcoded kg
  // sites survived in js/brain precisely because the first version of this
  // guard only swept js/analytics.
  // A literal kg SUFFIX emitted into output. Covers both a spaced label
  // (`+ ' kg'`) and one glued straight onto an interpolation (`}kg`) —
  // the second form is how the exercise-picker PR chips escaped the
  // original guard entirely. Deliberately does NOT flag
  // `weightUnit === 'lbs' ? 'lbs' : 'kg'` or `unit = 'kg'`: those resolve
  // the unit correctly, and bare 'kg' is the legitimate fallback value.
  const KG_LABEL = /['"`] kg\b| kg['"`<.,/]|>kg<|\(kg\)|\}kg\b/;
  const roots = ['js/analytics/views', 'js/analytics/charts', 'js/analytics/insights', 'js/brain',
    // The LOGGER is where loads are entered, so a hardcoded unit there
    // mislabels the athlete's own numbers at the point of entry. It sat
    // outside every previous sweep and was rendering "225kg PR" on every
    // exercise-picker chip regardless of the configured unit.
    'js/workout', 'js/strength'];
  const offenders = [];
  for (const root of ['js/workout.js', ...roots]) {
    if (root.endsWith('.js')) {
      const source = await readFile(root, 'utf8');
      source.split('\n').forEach((line, index) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        if (KG_LABEL.test(line)) offenders.push(`${root}:${index + 1}`);
      });
      continue;
    }
    // Recursive: js/brain has subdirectories (hybrid-score/), and a
    // non-recursive sweep would be blind to them — the same shape of gap that
    // let the js/brain sites through in the first place.
    for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
      const file = `${entry.parentPath || entry.path || root}/${entry.name}`.replace(`${root}/${root}/`, `${root}/`);
      const source = await readFile(file, 'utf8');
      source.split('\n').forEach((line, index) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
        // A literal " kg" SUFFIX emitted into output — i.e. a quoted string
        // whose kg is preceded by a space, as in `+ ' kg'` or `} kg\``.
        // Deliberately does NOT flag `weightUnit === 'lbs' ? 'lbs' : 'kg'` or
        // `unit = 'kg'`: those resolve the unit correctly, and 'kg' with no
        // leading space is the legitimate fallback value.
        if (KG_LABEL.test(line)) offenders.push(`${file}:${index + 1}`);
      });
    }
  }
  assert.deepEqual(offenders, [], `hardcoded kg labels: ${offenders.join(', ')}`);
});

// ---- 4. sparkline honesty ---------------------------------------------------

test('a constant sparkline series is drawn mid-height, not on the floor', async () => {
  const { spark } = await import('../js/analytics/views/screen-kit.js');
  // A steady 3 sessions a week is not "nothing": pinning a zero-span series to
  // the baseline made it visually identical to a series of zeros.
  const flat = spark([3, 3, 3, 3], '#3b82f6');
  assert.match(flat, /points="[^"]*"/);
  const ys = [...flat.matchAll(/,(\d+\.\d)/g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y === 15), `expected mid-height 15, got ${ys.join(',')}`);

  // Genuine zeros still sit on the floor.
  const zeros = spark([0, 0, 5, 5.0001], '#3b82f6');
  assert.match(zeros, /,30\.0/, 'a real zero stays at the baseline');
});

test('a varying series still scales across the full height', async () => {
  const { spark } = await import('../js/analytics/views/screen-kit.js');
  const ys = [...spark([1, 2, 3], '#3b82f6').matchAll(/,(\d+\.\d)/g)].map((m) => Number(m[1]));
  assert.equal(Math.max(...ys), 30, 'the minimum sits at the baseline');
  assert.equal(Math.min(...ys), 0, 'the maximum reaches the top');
});

test('too little data draws no sparkline at all', async () => {
  const { spark } = await import('../js/analytics/views/screen-kit.js');
  assert.equal(spark([], '#3b82f6'), '');
  assert.equal(spark([5], '#3b82f6'), '');
  assert.equal(spark([0, 0, 0], '#3b82f6'), '');
});
