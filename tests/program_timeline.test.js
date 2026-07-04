// ==========================================
// PROGRAM TIMELINE TEST (tests/program_timeline.test.js)
// A1 — the week-by-week plan builder. Turns weeklyVolModifiers into a readable
// progression arc; degrades to WEEK_PHASE_NAMES when a program has none. Run
// with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildProgramTimeline, classifyWeek } from '../js/programs/timeline.js';

test('classifies week phases from their labels', () => {
  assert.equal(classifyWeek('Deload if stalling — reset 10%'), 'deload');
  assert.equal(classifyWeek('Peak week — test maxes'), 'peak');
  assert.equal(classifyWeek('Heavy Engine Taper'), 'taper');
  assert.equal(classifyWeek('Phase 2: Strength emphasis'), 'work');
  assert.equal(classifyWeek('Threshold Intensification'), 'intensify');
  assert.equal(classifyWeek('Accumulation Phase'), 'build');
  assert.equal(classifyWeek(''), 'work');
});

test('builds one contiguous row per week with sets/reps/label', () => {
  const program = {
    durationWeeks: 3,
    weeklyVolModifiers: {
      '1': { sets: 5, reps: 5, intensityLabel: 'Base' },
      '2': { sets: 5, reps: 5, intensityLabel: 'Build volume' },
      '3': { sets: 2, reps: 5, intensityLabel: 'Deload week' },
    },
  };
  const rows = buildProgramTimeline(program);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.week), [1, 2, 3]);
  assert.equal(rows[0].sets, 5);
  assert.equal(rows[2].deload, true, 'deload week flagged');
  assert.equal(rows[2].kind, 'deload');
});

test('volume bars scale to the program peak set count', () => {
  const program = {
    durationWeeks: 2,
    weeklyVolModifiers: { '1': { sets: 5, reps: 5, intensityLabel: 'Base' }, '2': { sets: 10, reps: 3, intensityLabel: 'Peak' } },
  };
  const rows = buildProgramTimeline(program);
  assert.equal(rows[1].volumeScore, 100, 'the peak-volume week fills the bar');
  assert.ok(rows[0].volumeScore < rows[1].volumeScore, 'lower-volume week reads shorter');
});

test('degrades gracefully to the generic phase map with no modifiers', () => {
  const rows = buildProgramTimeline({ durationWeeks: 12 }); // no weeklyVolModifiers
  assert.equal(rows.length, 12);
  // WEEK_PHASE_NAMES marks weeks 4 and 8 as deloads.
  assert.equal(rows[3].deload, true);
  assert.equal(rows[7].deload, true);
  assert.ok(rows.every(r => r.sets === null), 'no fabricated set counts');
  assert.ok(rows.every(r => r.volumeScore > 0), 'still shows a shape');
});

test('infers week count from modifiers when duration is absent', () => {
  const rows = buildProgramTimeline({ weeklyVolModifiers: { '1': { sets: 3 }, '2': { sets: 3 }, '3': { sets: 3 }, '4': { sets: 3 } } });
  assert.equal(rows.length, 4);
});
