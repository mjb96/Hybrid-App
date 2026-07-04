// ==========================================
// PROGRAM COMPARE TEST (tests/program_compare.test.js)
// B4 — the pure comparison model: decision stats per program + a side-by-side
// diff. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { programStats, buildComparison, equipmentFit } from '../js/programs/compare.js';

const strongLifts = {
  name: 'StrongLifts 5×5', durationWeeks: 12, sessionsPerWeek: 3,
  sessionDurationMinutes: { min: 30, max: 50 }, difficulty: 'beginner',
  equipment: ['barbell', 'rack', 'bench'],
  metrics: { strengthEmphasis: 95, hypertrophyEmphasis: 40, enduranceEmphasis: 5, conditioningEmphasis: 5, recoveryDemand: 45 },
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
