import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  copyProgramDay, dayTrainingSummary, previewProgramWeek,
  programEditorSummary, validateProgramDraft,
} from '../js/programs/editor-model.js';
import { appState, reconcileActiveProgramEdits, setAppState } from '../js/state.js';

if (typeof globalThis.localStorage === 'undefined') {
  const memory = {};
  globalThis.localStorage = {
    getItem: (key) => memory[key] ?? null,
    setItem: (key, value) => { memory[key] = String(value); },
    removeItem: (key) => { delete memory[key]; },
  };
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function programFixture() {
  const days = Object.fromEntries(DAYS.map((day) => [day, {
    title: 'Rest', desc: '', runs: 'Rest', lifts: [],
  }]));
  days.mon = { title: 'Upper', desc: '', runs: '5 km easy', lifts: ['Bench Press', 'Push-Ups 4×max'] };
  return {
    id: 'prog_editor', name: 'Editor Test', totalWeeks: 4, days,
    weeklyVolModifiers: { '1': { sets: 3, reps: '8-10', intensityLabel: 'Build' } },
  };
}

test('editor summaries distinguish strength, run and rest days', () => {
  const program = programFixture();
  assert.deepEqual(dayTrainingSummary(program.days.mon), {
    lifts: 2, hasRun: true, training: true, label: '2 exercises + run',
  });
  assert.deepEqual(programEditorSummary(program), {
    strengthDays: 1, runDays: 1, totalExercises: 2,
  });
});

test('logger preview uses the real target resolver including ranges and max reps', () => {
  const monday = previewProgramWeek(programFixture(), '1')[0];
  assert.deepEqual(monday.lifts.map(({ sets, reps }) => ({ sets, reps })), [
    { sets: 3, reps: '8-10' },
    { sets: 4, reps: 'max reps' },
  ]);
});

test('validation catches blank rows and canonical exercise duplicates', () => {
  const program = programFixture();
  program.days.mon.lifts = ['Bench Press', 'Barbell Bench Press', ''];
  const messages = validateProgramDraft(program).map((issue) => issue.message);
  assert.ok(messages.some((message) => /blank exercise/i.test(message)));
  assert.ok(messages.some((message) => /contains Barbell Bench Press twice/i.test(message)));
});

test('copying a day is a deep copy, not shared editor state', () => {
  const program = programFixture();
  assert.equal(copyProgramDay(program, 'mon', 'wed'), true);
  program.days.wed.lifts.push('Cable Row');
  assert.deepEqual(program.days.mon.lifts, ['Bench Press', 'Push-Ups 4×max']);
});

test('active-plan reconciliation updates untouched days and preserves started days', () => {
  const program = programFixture();
  program.days.mon.lifts = ['Barbell Bench Press'];
  program.days.tue = { title: 'Lower', desc: '', runs: 'Rest', lifts: ['Back Squat'] };
  setAppState({
    activeProgramId: program.id,
    activeActivationId: 'activation-1',
    currentWeek: '1',
    customPrograms: [program],
    settings: {},
    weeks: {
      '1': {
        activationId: 'activation-1', programId: program.id,
        lifts: {
          mon: { 'Old Press': [{ w: '', r: 10, c: false }] },
          tue: { 'Old Squat': [{ w: 80, r: 5, c: true }] },
        },
        liftOrder: { mon: ['Old Press'], tue: ['Old Squat'] },
        runs: {}, runSessions: {}, notes: {}, gymRpe: {}, gymStats: {}, dates: {},
        sessionStatus: { tue: 'finished' },
      },
    },
  });

  const result = reconcileActiveProgramEdits(program.id);
  assert.ok(result.updatedDays >= 1);
  assert.ok(result.preservedDays >= 1);
  assert.deepEqual(Object.keys(appState.weeks['1'].lifts.mon), ['Barbell Bench Press']);
  assert.deepEqual(Object.keys(appState.weeks['1'].lifts.tue), ['Old Squat']);
  assert.equal(appState.weeks['1'].lifts.tue['Old Squat'][0].w, 80);
});

test('editing an inactive program never touches the active workout', () => {
  const program = programFixture();
  setAppState({ activeProgramId: 'other', customPrograms: [program], weeks: {}, settings: {} });
  assert.deepEqual(reconcileActiveProgramEdits(program.id), { updatedDays: 0, preservedDays: 0 });
});

// =============================================================================
// EDITOR UNDO (roadmap Phase 4C, interaction principle 5)
//
// The builder had three confirmation dialogs and no undo, so removing an
// exercise, wiping a day to rest or copying over a planned day each cost a modal
// and still left the mistake permanent. Principle 5 prefers Undo over repeated
// confirmation; these are the pure halves of it.
//
// The snapshot is the whole editable PLAN (`days` + `weeklyVolModifiers`) and
// nothing else: logged workouts live in `state.weeks`, so an undo can never
// rewrite training history.
// =============================================================================
import { captureProgramDraft, restoreProgramDraft } from '../js/programs/editor-model.js';

const draftProgram = () => ({
  id: 'p1',
  name: 'Draft',
  totalWeeks: 4,
  days: {
    mon: { title: 'Push', runs: 'Rest', lifts: ['Bench Press', 'Overhead Press'] },
    tue: { title: 'Rest', runs: 'Rest', lifts: [] },
  },
  weeklyVolModifiers: { 1: { sets: 3, reps: 10, intensityLabel: 'Working Sets' } },
});

test('a captured draft restores the plan exactly', () => {
  const program = draftProgram();
  const snapshot = captureProgramDraft(program, 'Removed Bench Press');
  program.days.mon.lifts.splice(0, 1);
  program.days.mon.title = 'Changed';
  program.weeklyVolModifiers['1'].sets = 9;

  assert.equal(restoreProgramDraft(program, snapshot), true);
  assert.deepEqual(program.days.mon.lifts, ['Bench Press', 'Overhead Press']);
  assert.equal(program.days.mon.title, 'Push');
  assert.equal(program.weeklyVolModifiers['1'].sets, 3);
});

test('the snapshot is a deep clone in BOTH directions', () => {
  const program = draftProgram();
  const snapshot = captureProgramDraft(program, 'x');
  // Mutating the program must not reach into the snapshot…
  program.days.mon.lifts.push('Dip');
  assert.deepEqual(snapshot.days.mon.lifts, ['Bench Press', 'Overhead Press']);
  // …and restoring must not hand the snapshot's own objects to the program,
  // or the next edit would corrupt the thing meant to undo it.
  restoreProgramDraft(program, snapshot);
  program.days.mon.lifts.push('Dip');
  assert.deepEqual(snapshot.days.mon.lifts, ['Bench Press', 'Overhead Press']);
});

test('the label is carried so the strip can name what it will undo', () => {
  const snapshot = captureProgramDraft(draftProgram(), 'Monday is now a rest day');
  assert.equal(snapshot.label, 'Monday is now a rest day');
  assert.equal(captureProgramDraft(draftProgram(), '').label, 'Last change');
});

test('a snapshot captures the plan only — never logged training', () => {
  const snapshot = captureProgramDraft(draftProgram(), 'x');
  assert.deepEqual(Object.keys(snapshot).sort(), ['days', 'label', 'weeklyVolModifiers']);
});

test('restoring refuses malformed input rather than wiping the plan', () => {
  const program = draftProgram();
  assert.equal(restoreProgramDraft(program, null), false);
  assert.equal(restoreProgramDraft(program, {}), false);
  assert.equal(restoreProgramDraft(null, captureProgramDraft(draftProgram(), 'x')), false);
  assert.deepEqual(program.days.mon.lifts, ['Bench Press', 'Overhead Press'], 'plan untouched');
});

test('a programme with no week table still snapshots and restores', () => {
  const program = { id: 'p', days: { mon: { title: 'A', runs: 'Rest', lifts: ['Squat'] } } };
  const snapshot = captureProgramDraft(program, 'x');
  program.days.mon.lifts = [];
  assert.equal(restoreProgramDraft(program, snapshot), true);
  assert.deepEqual(program.days.mon.lifts, ['Squat']);
  assert.deepEqual(program.weeklyVolModifiers, {});
});
