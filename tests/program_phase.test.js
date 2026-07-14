import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveProgramPhase } from '../js/programs/phase.js';
import { dayVerdict } from '../js/brain/day-verdict.js';

test('program-authored week labels are authoritative', () => {
  const program = { weeklyVolModifiers: {
    '4': { sets: 5, intensityLabel: 'Volume build' },
    '8': { sets: 2, intensityLabel: 'Deload — absorb the work' },
  } };
  assert.deepEqual(resolveProgramPhase(program, 4), {
    week: 4, label: 'Volume build', authoredLabel: 'Volume build', kind: 'build',
    isDeload: false, source: 'program', modifier: program.weeklyVolModifiers['4'],
  });
  assert.equal(resolveProgramPhase(program, 8).isDeload, true);
});

test('a program without semantic phase data gets a neutral fallback, never a fabricated deload', () => {
  assert.deepEqual(resolveProgramPhase({ totalWeeks: 12 }, 4), {
    week: 4, label: 'Training', authoredLabel: '', kind: 'work',
    isDeload: false, source: 'fallback', modifier: null,
  });
});

test('an explicitly applied deload is shared phase truth even on a normal authored week', () => {
  const program = { weeklyVolModifiers: { '3': { intensityLabel: 'Heavy strength' } } };
  const phase = resolveProgramPhase(program, 3, { currentWeek: '3', deloadApplied: '3' });
  assert.equal(phase.isDeload, true);
  assert.equal(phase.kind, 'deload');
  assert.match(phase.label, /Applied deload/);
});

test('Day Verdict consumes the same resolved phase', () => {
  const program = { weeklyVolModifiers: { '6': { intensityLabel: 'Taper and deload' } } };
  const model = { rec: { sessionLabel: 'Gym Session', badge: '' }, ready: { hasData: true, score: 75 } };
  const verdict = dayVerdict(model, { currentWeek: '6' }, program, 'mon');
  assert.equal(verdict.weekLabel, resolveProgramPhase(program, 6).label);
  assert.equal(verdict.mode, 'deload');
});

test('feature modules cannot read the global phase map directly', () => {
  const files = [
    'js/app.js', 'js/home.js', 'js/brain/day-verdict.js',
    'js/brain/morning-briefing.js', 'js/brain/recommendations.js',
    'js/brain/hybrid-score/hybrid-score.js', 'js/programs/detail.js',
    'js/programs/timeline.js',
  ];
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /WEEK_PHASE_NAMES/, file);
  }
});
