import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildProgramExportText, serializeProgram, extractSessionNotes, PROGRAM_REVIEW_HEADER,
} from '../js/programs/program-export.js';
import { replaceProgramExercise } from '../js/programs/editor-model.js';
import { getCatalogEntry } from '../js/programs/catalog.js';
import { liftTarget } from '../js/engine.js';
import { getWeekModifier } from '../js/schema.js';

const restDay = () => ({ title: 'Rest', badge: 'Rest', color: 'x', desc: 'Rest.', runs: 'Rest', lifts: [] });

// A compact program with the shapes the formatter must handle: a strength day,
// a run day, a rest day, a custom exercise, and a multi-week progression.
function sampleProgram() {
  const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, restDay()]));
  days.mon = {
    title: 'Upper', badge: 'Gym', color: 'x', runs: 'Rest',
    desc: 'Heavy push and pull. Barbell Bench Press (4×5-8). EZ-Bar Curl (3×10). Weighted Sit-Up (3×15).',
    lifts: ['Barbell Bench Press', 'EZ-Bar Curl', 'My Secret Move'],
  };
  days.wed = { title: 'Easy Run', badge: 'Run', color: 'x', desc: 'Zone 2.', runs: '5 km easy', lifts: [] };
  return {
    id: 'prog_secret123', sourceProgramId: 'src_builtin_999', name: 'Test Plan',
    difficulty: 'intermediate', totalWeeks: 3, sessionsPerWeek: 2,
    goals: ['strength', 'hypertrophy'], equipment: ['barbell', 'ezBar', 'bench'],
    dossier: { focus: 'Test', philosophy: 'Keep it simple.' },
    days,
    weeklyVolModifiers: {
      '1': { sets: 3, reps: 10, intensityLabel: 'Base' },
      '2': { sets: 4, reps: 8, intensityLabel: 'Build' },
      '3': { sets: 2, reps: 10, intensityLabel: 'Deload week' },
    },
  };
}

test('1 & 2: every training day and every rest day is included', () => {
  const text = serializeProgram(sampleProgram());
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    assert.ok(text.includes(`### ${day}`), `${day} heading present`);
  }
  assert.ok(text.includes('### Wednesday — Easy Run'));
  assert.ok(text.includes('### Tuesday — Rest'));
});

test('3: exercises keep day.lifts order', () => {
  const text = serializeProgram(sampleProgram());
  const mon = text.slice(text.indexOf('### Monday'));
  const i1 = mon.indexOf('1. Barbell Bench Press');
  const i2 = mon.indexOf('2. EZ-Bar Curl');
  const i3 = mon.indexOf('3. My Secret Move');
  assert.ok(i1 >= 0 && i2 > i1 && i3 > i2, 'lifts numbered in day.lifts order');
});

test('4: an edited personal exercise replaces the built-in one', () => {
  const program = sampleProgram();
  replaceProgramExercise(program.days.mon, 1, 'EZ-Bar Reverse Curl');
  const text = serializeProgram(program);
  assert.ok(text.includes('EZ-Bar Reverse Curl'));
  assert.ok(!/\d+\.\sEZ-Bar Curl\b/.test(text), 'old exercise no longer a numbered row');
});

test('5 & 6: stale desc names and narrative never become exercises', () => {
  const program = sampleProgram();
  // "Weighted Sit-Up" lives only in day.desc, never in day.lifts.
  const text = serializeProgram(program);
  assert.ok(!/\d+\.\sWeighted Sit-Up/.test(text), 'stale desc exercise is not a numbered row');
  // The narrative prefix appears only as session notes, never as an exercise.
  assert.ok(text.includes('Session notes: Heavy push and pull.'));
  assert.ok(!/\d+\.\sHeavy push and pull/.test(text));
});

test('7: prescriptions match the shared liftTarget resolver', () => {
  const program = sampleProgram();
  const mod = getWeekModifier(program, 1);
  const t = liftTarget(program.days.mon.desc, 'Barbell Bench Press', mod);
  const text = serializeProgram(program);
  assert.ok(text.includes(`1. Barbell Bench Press — ${t.sets} sets × ${t.reps} reps`));
  // A custom exercise with no inline spec falls back to the week modifier.
  const tc = liftTarget(program.days.mon.desc, 'My Secret Move', mod);
  assert.ok(text.includes(`3. My Secret Move — ${tc.sets} sets × ${tc.reps} reps`));
});

test('8: every progression week appears in numeric order', () => {
  const text = serializeProgram(sampleProgram());
  const i1 = text.indexOf('Week 1:');
  const i2 = text.indexOf('Week 2:');
  const i3 = text.indexOf('Week 3:');
  assert.ok(i1 >= 0 && i2 > i1 && i3 > i2);
  assert.ok(text.includes('- Phase: Deload week'));
  assert.ok(text.includes('- Deload week'), 'deload designation included');
});

test('9: running/cardio prescriptions are included and Rest is not a run', () => {
  const text = serializeProgram(sampleProgram());
  assert.ok(text.includes('Cardio: 5 km easy'));
  const mon = text.slice(text.indexOf('### Monday'), text.indexOf('### Tuesday'));
  assert.ok(mon.includes('Cardio: Rest'), 'strength day shows Cardio: Rest');
  assert.ok(!/Running: Rest/.test(text));
});

test('10: empty metadata lines are omitted cleanly', () => {
  const bare = { name: 'Bare', totalWeeks: 1, days: { mon: { title: 'Day', desc: '', runs: 'Rest', lifts: ['Push-Up'] } }, weeklyVolModifiers: { '1': { sets: 3, reps: 10 } } };
  const text = serializeProgram(bare);
  assert.ok(!/Level:/.test(text), 'no difficulty → no Level line');
  assert.ok(!/Sessions per week:/.test(text));
  assert.ok(!/Equipment:/.test(text));
  assert.ok(text.includes('# Bare'));
});

test('11: unknown custom exercise names are retained', () => {
  const text = serializeProgram(sampleProgram());
  assert.ok(text.includes('My Secret Move'));
});

test('12: no HTML is emitted', () => {
  const text = buildProgramExportText(sampleProgram());
  assert.ok(!/[<>]/.test(text), 'plain text contains no angle brackets');
});

test('13: internal ids and personal history are excluded', () => {
  const program = sampleProgram();
  program.days.mon.notes = 'private note';
  const text = buildProgramExportText(program, { activeWeek: 2 });
  assert.ok(!text.includes('prog_secret123'), 'program id excluded');
  assert.ok(!text.includes('src_builtin_999'), 'sourceProgramId excluded');
  assert.ok(!text.includes('private note'), 'session notes sidecar not exported');
  assert.ok(!/\b80\s*kg\b/.test(text));
});

test('14: output is deterministic for the same program', () => {
  const a = buildProgramExportText(sampleProgram(), { activeWeek: 2 });
  const b = buildProgramExportText(sampleProgram(), { activeWeek: 2 });
  assert.equal(a, b);
});

test('15: EZ-Bar exercises render with their canonical names', () => {
  const program = sampleProgram();
  replaceProgramExercise(program.days.mon, 2, 'EZ-Bar Skull Crusher');
  const text = serializeProgram(program);
  assert.ok(text.includes('EZ-Bar Curl'));
  assert.ok(text.includes('EZ-Bar Skull Crusher'));
});

test('AI header is present in ai mode and absent in plain mode', () => {
  const program = sampleProgram();
  const ai = buildProgramExportText(program, { mode: 'ai' });
  const plain = buildProgramExportText(program, { mode: 'plain' });
  assert.ok(ai.startsWith(PROGRAM_REVIEW_HEADER));
  assert.ok(ai.includes('# Test Plan'));
  assert.ok(!plain.startsWith(PROGRAM_REVIEW_HEADER));
  assert.ok(plain.startsWith('# Test Plan'));
});

test('active-week notes appear only when copying the active program', () => {
  const withWeek = serializeProgram(sampleProgram(), { activeWeek: 3 });
  assert.ok(withWeek.includes('- Current active week: Week 3'));
  assert.ok(withWeek.includes('- Untouched future workouts follow this definition.'));
  const withoutWeek = serializeProgram(sampleProgram());
  assert.ok(!withoutWeek.includes('Current active week'));
});

test('extractSessionNotes keeps narrative and drops per-lift prescriptions', () => {
  assert.equal(extractSessionNotes('Squat + hinge foundation. Back Squat (4×5-8). Weighted Sit-Up (3×15).'), 'Squat + hinge foundation.');
  assert.equal(extractSessionNotes('Back Squat (4×5-8).'), '', 'no narrative prefix → empty');
  assert.equal(extractSessionNotes('Rest.'), '');
  assert.equal(extractSessionNotes('10×10 Bench and Row.'), '10×10 Bench and Row.');
});

// ── Real-program regression: home_gym_rebuild_5day, personal + edited ─────────
test('real home_gym_rebuild_5day: edited personal program exports current exercises', () => {
  // A personal backing program is a deep clone of the catalog source.
  const personal = JSON.parse(JSON.stringify(getCatalogEntry('home_gym_rebuild_5day')));
  personal.id = 'prog_personal_1';
  personal.sourceProgramId = 'home_gym_rebuild_5day';
  personal.totalWeeks = personal.durationWeeks;

  // The exact reported edits, applied through the central mutation helper.
  const tue = personal.days.tue; // Lower Strength
  replaceProgramExercise(tue, tue.lifts.indexOf('Weighted Sit-Up'), 'Seated Calf Raise');
  const mon = personal.days.mon; // Upper Strength
  replaceProgramExercise(mon, mon.lifts.indexOf('Dumbbell Curl'), 'EZ-Bar Curl');
  const thu = personal.days.thu; // Push Hypertrophy has Dumbbell Skull Crusher
  replaceProgramExercise(thu, thu.lifts.indexOf('Dumbbell Skull Crusher'), 'EZ-Bar Skull Crusher');

  const text = buildProgramExportText(personal, { mode: 'plain', activeWeek: 3 });

  // Edited personal exercises are present…
  assert.ok(text.includes('EZ-Bar Curl'), 'EZ-Bar Curl exported');
  assert.ok(text.includes('EZ-Bar Skull Crusher'), 'EZ-Bar Skull Crusher exported');
  assert.ok(text.includes('Seated Calf Raise'), 'Seated Calf Raise exported');
  // …and removed source exercises never reappear on the edited day (via desc or catalog).
  const monBlock = text.slice(text.indexOf('### Monday'), text.indexOf('### Tuesday'));
  const tueBlock = text.slice(text.indexOf('### Tuesday'), text.indexOf('### Wednesday'));
  const thuBlock = text.slice(text.indexOf('### Thursday'), text.indexOf('### Friday'));
  assert.ok(!/Weighted Sit-Up/.test(tueBlock), 'removed Weighted Sit-Up absent from Lower Strength');
  assert.ok(!/Dumbbell Curl/.test(monBlock), 'replaced Dumbbell Curl absent from Upper Strength');
  assert.ok(monBlock.includes('EZ-Bar Curl'), 'EZ-Bar Curl present on Upper Strength');
  assert.ok(!/Dumbbell Skull Crusher/.test(thuBlock), 'replaced Dumbbell Skull Crusher absent from Push Hypertrophy');
  assert.ok(thuBlock.includes('EZ-Bar Skull Crusher'), 'EZ-Bar Skull Crusher present on Push Hypertrophy');
  // Narrative never leaks in as an exercise.
  assert.ok(!/\d+\.\sSquat \+ hinge foundation/.test(text));

  // The source catalog remains unchanged.
  assert.ok(getCatalogEntry('home_gym_rebuild_5day').days.tue.lifts.includes('Weighted Sit-Up'));
});
