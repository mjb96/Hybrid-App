import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgramSessionChoices, rescheduledWorkoutContext } from '../js/workout/program-session-picker.js';

const done = { c: true, w: '80', r: '5' };
const program = {
  id: 'test', totalWeeks: 4,
  weeklyVolModifiers: { 1: { sets: 1, reps: '5' } },
  days: {
    mon: { title: 'Upper Strength', desc: '', lifts: ['Bench Press'], runs: 'Rest' },
    tue: { title: 'Lower Strength', desc: '', lifts: ['Back Squat'], runs: 'Rest' },
    wed: { title: 'Rest', lifts: [], runs: 'Rest' },
  },
};

test('picker keeps Monday workout identity when it was completed Tuesday', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': {
      dates: { mon: '2026-07-14' },
      lifts: { mon: { 'Bench Press': [done] } },
    } },
  };
  const choices = buildProgramSessionChoices(state, program, 'tue');
  assert.equal(choices.length, 2, 'rest days are omitted');
  assert.deepEqual(choices[0], {
    day: 'mon', dayLabel: 'Monday', title: 'Upper Strength', sessionLabel: 'Gym Session',
    isToday: false, status: 'complete', loggedDate: '2026-07-14',
    performedDay: 'tue', moved: true, performedLabel: 'Tuesday',
  });
  assert.equal(choices[1].title, 'Lower Strength');
  assert.equal(choices[1].status, 'open');
  assert.equal(choices[1].isToday, true);
});

test('cockpit explains a rescheduled workout without changing its source day', () => {
  assert.deepEqual(rescheduledWorkoutContext(program, 'mon', 'tue'), {
    title: 'Upper Strength', sourceDay: 'mon', sourceLabel: 'Monday', todayLabel: 'Tuesday',
  });
  assert.equal(rescheduledWorkoutContext(program, 'tue', 'tue'), null);
  assert.equal(rescheduledWorkoutContext(program, 'wed', 'tue'), null, 'rest is not a workout');
});
