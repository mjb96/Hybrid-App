// ==========================================
// PROGRAM COMPARE TEST (tests/program_compare.test.js)
// B4 — the pure comparison model: decision stats per program + a side-by-side
// diff. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { programStats, buildComparison, equipmentFit, programHasLifts } from '../js/programs/compare.js';

// A run-only block: days are all lifts:[], and weeklyVolModifiers carry sets:1
// purely to hold an intensityLabel (the real run prescription).
const couchTo5k = {
  name: 'Couch to 5K', durationWeeks: 9, sessionsPerWeek: 3, category: 'running',
  days: {
    mon: { title: 'Rest', runs: 'Rest', lifts: [] },
    wed: { title: 'Run/Walk', runs: '🏃 Week 1: 8×60sec run / 90sec walk', lifts: [] },
    fri: { title: 'Run/Walk', runs: '🏃 Week 1: 8×60sec run / 90sec walk', lifts: [] },
  },
  weeklyVolModifiers: {
    '1': { sets: 1, reps: 8, intensityLabel: 'Week 1: 8×(60sec run / 90sec walk)' },
    '2': { sets: 1, reps: 6, intensityLabel: 'Week 2: 6×(90sec run / 2min walk)' },
  },
};

const strongLifts = {
  name: 'StrongLifts 5×5', durationWeeks: 12, sessionsPerWeek: 3,
  sessionDurationMinutes: { min: 30, max: 50 }, difficulty: 'beginner',
  equipment: ['barbell', 'rack', 'bench'],
  metrics: { strengthEmphasis: 95, hypertrophyEmphasis: 40, enduranceEmphasis: 5, conditioningEmphasis: 5, recoveryDemand: 45 },
  days: { mon: { title: 'Workout A', lifts: ['Squat', 'Bench', 'Row'] }, wed: { title: 'Workout B', lifts: ['Squat', 'Overhead Press', 'Deadlift'] } },
  weeklyVolModifiers: { '1': { sets: 5, reps: 5 }, '2': { sets: 5, reps: 5 }, '3': { sets: 5, reps: 5 } },
};
const nsuns = {
  name: 'nSuns 5/3/1', durationWeeks: 12, sessionsPerWeek: 4,
  sessionDurationMinutes: { min: 75, max: 100 }, difficulty: 'intermediate',
  equipment: ['barbell', 'rack', 'bench', 'dumbbells'],
  metrics: { strengthEmphasis: 92, hypertrophyEmphasis: 45, enduranceEmphasis: 5, conditioningEmphasis: 10, recoveryDemand: 80 },
};

test('programStats derives decision numbers incl. total time cost', () => {
  const s = programStats(strongLifts);
  assert.equal(s.weeks, 12);
  assert.equal(s.daysPerWeek, 3);
  assert.equal(s.weeklySets, 5);
  // 3 days × avg(30,50)=40 min × 12 weeks / 60 = 24 h
  assert.equal(s.totalHours, 24);
});

test('programStats tolerates missing fields', () => {
  const s = programStats({ name: 'Bare', totalWeeks: 8 });
  assert.equal(s.weeks, 8);
  assert.equal(s.daysPerWeek, null);
  assert.equal(s.totalHours, null);
  assert.deepEqual(s.equipment, []);
  assert.equal(s.weeklySets, null);
});

test('buildComparison yields aligned rows for both programs', () => {
  const cmp = buildComparison(strongLifts, nsuns);
  assert.equal(cmp.a.name, 'StrongLifts 5×5');
  assert.equal(cmp.b.name, 'nSuns 5/3/1');
  const freq = cmp.rows.find(r => r.label === 'Frequency');
  assert.equal(freq.a, '3×/week');
  assert.equal(freq.b, '4×/week');
  const time = cmp.rows.find(r => r.label === 'Time cost');
  assert.equal(time.a, '~24 h total');   // nSuns has no weeklyVolModifiers but does have time
  assert.ok(time.b.startsWith('~'));
});

test('programHasLifts is true for a lifting program, false for a run-only block', () => {
  assert.equal(programHasLifts(strongLifts), true);  // days carry lifts
  assert.equal(programHasLifts(couchTo5k), false);   // run-only: all lifts:[]
  assert.equal(programHasLifts({ days: { mon: { lifts: ['Squat'] } } }), true);
  assert.equal(programHasLifts(null), false);
});

test('programStats flags a run-only block as lift-less (no phantom sets/lift)', () => {
  const s = programStats(couchTo5k);
  assert.equal(s.hasLifts, false);
  // weeklySets is still computed (avg of sets:1) but hasLifts gates its display
  assert.equal(s.weeklySets, 1);
  const strong = programStats({ ...strongLifts, days: { mon: { lifts: ['Squat', 'Bench'] } } });
  assert.equal(strong.hasLifts, true);
});

test('buildComparison shows no "sets/lift" for a run-only program', () => {
  const cmp = buildComparison(couchTo5k, strongLifts);
  const vol = cmp.rows.find(r => r.label === 'Set volume');
  assert.equal(vol.a, '—');            // run-only: suppressed, not "~1 sets/lift"
  assert.equal(vol.b, '~5 sets/lift'); // strength program still shows it
});

test('buildComparison surfaces training-focus metrics present on either side', () => {
  const cmp = buildComparison(strongLifts, nsuns);
  const strength = cmp.metrics.find(m => m.label === 'Strength');
  assert.equal(strength.a, 95);
  assert.equal(strength.b, 92);
  // every emphasis row carries a value for at least one program
  assert.ok(cmp.metrics.every(m => m.a > 0 || m.b > 0));
});

// ── A2 equipment fit ──────────────────────────────────────────────────────────

test('equipmentFit flags missing kit against what the athlete owns', () => {
  const owned = { barbell: false, rack: false, dumbbells: true, cables: true, pullupBar: true, bands: true, kettlebells: false };
  const fit = equipmentFit(['barbell', 'rack', 'dumbbells'], owned);
  assert.deepEqual(fit.missing, ['barbell', 'rack']);
  assert.deepEqual(fit.owned, ['dumbbells']);
});

test('equipmentFit treats unmappable kit (bench, sled) as unknown, not missing', () => {
  const owned = { barbell: true };
  const fit = equipmentFit(['barbell', 'bench', 'sled'], owned);
  assert.deepEqual(fit.owned, ['barbell']);
  assert.deepEqual(fit.unknown, ['bench', 'sled']);
  assert.deepEqual(fit.missing, []);
});

test('equipmentFit does not red-flag anything when ownership is unknown', () => {
  const fit = equipmentFit(['barbell', 'rack'], {}); // no equipment set
  assert.equal(fit.missing.length, 0);
  assert.equal(fit.unknown.length, 2);
});
