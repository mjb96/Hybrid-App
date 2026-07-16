import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strengthSessionChipModels } from '../js/analytics/views/view-strength.js';
import { collectCalendarWeek } from '../js/analytics/weekly-aggregate.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const completed = (w, r) => ({ c: true, w: String(w), r: String(r) });

function movedUpperWorkoutState() {
  return {
    activeProgramId: 'upper-lower-test',
    currentWeek: '2',
    settings: { weightUnit: 'kg' },
    customPrograms: [{
      id: 'upper-lower-test',
      name: 'Upper Lower Test',
      totalWeeks: 4,
      days: {
        mon: { title: 'Upper Strength', lifts: ['Bench Press'] },
        tue: { title: 'Lower Strength', lifts: ['Back Squat'] },
      },
    }],
    weeks: {
      '2': {
        programId: 'upper-lower-test',
        // The Monday program slot was deliberately trained on Tuesday.
        dates: { mon: '2026-07-14' },
        lifts: { mon: { 'Bench Press': [completed(80, 5)] } },
      },
    },
  };
}

test('calendar collection preserves performed day and source workout day', () => {
  const week = collectCalendarWeek(movedUpperWorkoutState(), '2026-07-13');
  assert.ok(week.lifts.tue['Bench Press']);
  assert.deepEqual(week.sourceSlots, [{
    date: '2026-07-14',
    day: 'tue',
    sourceDay: 'mon',
    weekKey: '2',
    weekNum: 2,
    programId: 'upper-lower-test',
  }]);
});

test('Strength Insights names and opens the workout logged, not Tuesday schedule', () => {
  const chips = strengthSessionChipModels(movedUpperWorkoutState(), DAYS, {
    weekStart: '2026-07-13',
  });
  assert.deepEqual(chips, [{
    calendarDay: 'tue',
    sourceDay: 'mon',
    weekKey: '2',
    title: 'Upper Strength',
    totalVolume: 400,
    unit: 'kg',
  }]);
});
