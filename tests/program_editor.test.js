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
