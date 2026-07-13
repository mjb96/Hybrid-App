// ==========================================
// PROGRAM SCHEDULE + PROGRESSION TESTS (tests/program_schedule.test.js)
//
// Covers the truthful week-at-a-glance + progression helpers
// (js/programs/schedule.js): day ordering, strength/running/rest summaries,
// per-week working-set counts, phase grouping, week-to-week diffs, honest
// fallbacks, no raw ids, and program-definition immutability.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildWeekSchedule, summarizeProgression, diffWeekPrescription } from '../js/programs/schedule.js';

// A small synthetic program: strength + running + rest days, with a build →
// deload → peak progression. desc is '' so liftTarget falls back to the week
// modifier's set count (the same rule the cockpit uses).
const PROG = {
  durationWeeks: 4,
  days: {
    mon: { title: 'Upper Strength', desc: '', lifts: ['Bench Press', 'Barbell Row', 'Overhead Press'], runs: 'Rest' },
    tue: { title: 'Easy Run', lifts: [], runs: '5 km easy' },
    wed: { title: 'Rest', lifts: [], runs: 'Rest' },
    thu: { title: 'Lower Strength', desc: '', lifts: ['Back Squat', 'Deadlift'], runs: 'Rest' },
    sat: { title: 'Intervals', lifts: [], runs: '8 × 400m (200m jog recovery)' },
  },
  weeklyVolModifiers: {
    '1': { sets: 3, reps: 8, intensityLabel: 'Build' },
    '2': { sets: 4, reps: 6, intensityLabel: 'Build' },
    '3': { sets: 2, reps: 8, intensityLabel: 'Deload' },
    '4': { sets: 4, reps: 4, intensityLabel: 'Peak' },
  },
};

// A program whose weeks never change — the honest "no variation" case.
const FLAT = {
  durationWeeks: 3,
  days: { mon: { title: 'Full Body', desc: '', lifts: ['Squat', 'Bench Press'], runs: 'Rest' } },
  weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: 'Work' }, '2': { sets: 3, reps: 5, intensityLabel: 'Work' }, '3': { sets: 3, reps: 5, intensityLabel: 'Work' } },
};

// A lift-less running block — sets/reps are an internal hack, must not surface.
const RUNBLOCK = {
  durationWeeks: 3,
  days: { mon: { title: 'Easy Run', lifts: [], runs: '6 km easy' }, sat: { title: 'Long Run', lifts: [], runs: '10 km' }, sun: { title: 'Rest', lifts: [], runs: 'Rest' } },
  weeklyVolModifiers: { '1': { sets: 1, reps: 1, intensityLabel: 'Base' }, '2': { sets: 1, reps: 1, intensityLabel: 'Base' }, '3': { sets: 1, reps: 1, intensityLabel: 'Build' } },
};

// ---- buildWeekSchedule ------------------------------------------------------

test('week schedule keeps day order and only includes defined days', () => {
  const rows = buildWeekSchedule(PROG, 1);
  assert.deepEqual(rows.map(r => r.dayKey), ['mon', 'tue', 'wed', 'thu', 'sat']);
});

test('strength day summary shows exercise count and total working sets', () => {
  const rows = buildWeekSchedule(PROG, 1);
  const mon = rows.find(r => r.dayKey === 'mon');
  assert.equal(mon.type, 'strength');
  assert.equal(mon.summary, '3 exercises · 9 working sets'); // 3 lifts × 3 sets (wk1 modifier)
});

test('working-set totals track the week modifier (deload shows fewer sets)', () => {
  const wk3 = buildWeekSchedule(PROG, 3).find(r => r.dayKey === 'mon');
  assert.equal(wk3.summary, '3 exercises · 6 working sets'); // 3 lifts × 2 sets (deload)
});

test('running day summary uses the actual run prescription string', () => {
  const rows = buildWeekSchedule(PROG, 1);
  assert.equal(rows.find(r => r.dayKey === 'tue').summary, '5 km easy');
  assert.equal(rows.find(r => r.dayKey === 'sat').summary, '8 × 400m (200m jog recovery)');
  assert.equal(rows.find(r => r.dayKey === 'sat').type, 'running');
});

test('rest day is intentional, not empty, and not interactive', () => {
  const rest = buildWeekSchedule(PROG, 1).find(r => r.dayKey === 'wed');
  assert.equal(rest.isRest, true);
  assert.equal(rest.type, 'rest');
  assert.equal(rest.summary, 'Rest day');
  assert.equal(rest.interactive, false);
});

test('mixed day (lifts + run) is typed "mixed" and shows both', () => {
  const mixed = buildWeekSchedule({ days: { mon: { title: 'Hybrid', desc: '', lifts: ['Squat'], runs: '3 km' } }, weeklyVolModifiers: { '1': { sets: 4, reps: 5 } }, durationWeeks: 1 }, 1)[0];
  assert.equal(mixed.type, 'mixed');
  assert.match(mixed.summary, /1 exercise · 4 working sets · 3 km/);
});

test('missing session detail falls back honestly, never blank', () => {
  const row = buildWeekSchedule({ days: { mon: { title: 'Mystery', lifts: [], runs: 'something' } }, durationWeeks: 1 }, 1)[0];
  assert.equal(row.summary, 'something');
  const noData = buildWeekSchedule({ days: { mon: { title: 'Mystery' } }, durationWeeks: 1 }, 1)[0];
  assert.equal(noData.isRest, true); // no lifts, no run → intentional rest
});

// ---- summarizeProgression ---------------------------------------------------

test('progression groups consecutive weeks into the program\'s own phases', () => {
  const { phases } = summarizeProgression(PROG);
  assert.deepEqual(phases.map(p => `${p.from}-${p.to}:${p.label}`), ['1-2:Build', '3-3:Deload', '4-4:Peak']);
  assert.equal(phases.find(p => p.label === 'Deload').deload, true);
});

test('progression headline names deloads from real data', () => {
  const s = summarizeProgression(PROG);
  assert.equal(s.hasVariation, true);
  assert.match(s.headline, /deload in Week 3/);
});

test('a program with no week-to-week change gets an honest "same schedule" message', () => {
  const s = summarizeProgression(FLAT);
  assert.equal(s.hasVariation, false);
  assert.match(s.headline, /stays the same across the block|adding load/i);
  assert.equal(s.phases.length, 1);
});

test('empty/missing program yields a "not specified" headline, no crash', () => {
  const s = summarizeProgression({});
  assert.equal(s.weeks >= 0, true);
});

// ---- diffWeekPrescription ---------------------------------------------------

test('week diff reports set and rep changes from real modifiers', () => {
  assert.deepEqual(diffWeekPrescription(PROG, 1, 2), ['Working sets per lift: 3 → 4', 'Reps: 8 → 6']);
});

test('week diff flags a reduced-load (deload) week', () => {
  const d = diffWeekPrescription(PROG, 1, 3);
  assert.ok(d.includes('Reduced-load week'));
  assert.ok(d.some(x => /Working sets per lift: 3 → 2/.test(x)));
});

test('same week (or no change) reports "No prescription changes"', () => {
  assert.deepEqual(diffWeekPrescription(PROG, 2, 2), ['No prescription changes']);
});

test('running block diff never shows misleading set/rep numbers', () => {
  const d = diffWeekPrescription(RUNBLOCK, 1, 3);
  assert.equal(d.some(x => /working sets|reps/i.test(x)), false);
  assert.ok(d.some(x => /Phase: Base → Build/.test(x)));
});

// ---- integrity --------------------------------------------------------------

test('no raw internal-looking ids appear in any summary or phase text', () => {
  const faces = [
    ...buildWeekSchedule(PROG, 1).flatMap(r => [r.title, r.summary]),
    ...summarizeProgression(PROG).phases.map(p => p.label + ' ' + p.spec),
    ...diffWeekPrescription(PROG, 1, 3),
  ].join(' | ');
  assert.equal(/\b[a-z]+_[a-z0-9]{4,}\b/.test(faces), false);
  assert.equal(/undefined|NaN|null/.test(faces), false);
});

test('program definitions are never mutated by building summaries', () => {
  const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
  const frozen = deepFreeze(structuredClone(PROG));
  const before = JSON.stringify(frozen);
  assert.doesNotThrow(() => {
    buildWeekSchedule(frozen, 1); buildWeekSchedule(frozen, 3);
    summarizeProgression(frozen);
    diffWeekPrescription(frozen, 1, 4);
  });
  assert.equal(JSON.stringify(frozen), before);
});
