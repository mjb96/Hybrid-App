import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVolumeGuideModel,
  effectiveMusclePriorities,
  hasExplicitMusclePriorities,
  projectProgramMuscleCredits,
  volumeReferenceForPriority,
} from '../js/analytics/volume-guide.js';

const work = (w, r) => ({ c: true, w: String(w), r: String(r) });

function programFixture() {
  return {
    days: {
      mon: { title: 'Upper', desc: '', lifts: ['Barbell Bench Press'], runs: 'Rest' },
      wed: { title: 'Lower', desc: '', lifts: ['Back Squat'], runs: 'Rest' },
    },
    weeklyVolModifiers: {
      '1': { sets: 3, reps: 8, intensityLabel: 'Build' },
      '2': { sets: 2, reps: 6, intensityLabel: 'Deload' },
    },
  };
}

test('program projection uses logger targets and separates direct from indirect credits', () => {
  const result = projectProgramMuscleCredits(programFixture(), '1');
  assert.equal(result.deload, false);
  assert.deepEqual(result.muscles.chest, {
    direct: 3, indirect: 0, total: 3,
    exercises: ['Barbell Bench Press'], days: ['mon'],
  });
  assert.equal(result.muscles.triceps.direct, 0);
  assert.equal(result.muscles.triceps.indirect, 1.5);
  assert.equal(result.muscles.quads.direct, 3);
});

test('program projection recognises planned deloads without inventing warnings', () => {
  const result = projectProgramMuscleCredits(programFixture(), '2');
  assert.equal(result.deload, true);
  assert.equal(result.muscles.chest.total, 2);
});

test('explicit priorities override program defaults and track-only has no target band', () => {
  const projection = projectProgramMuscleCredits(programFixture(), '1');
  const state = { settings: { musclePriorities: { chest: 'maintain', quads: 'track' } } };
  const priorities = effectiveMusclePriorities(state, projection);
  assert.equal(priorities.chest, 'maintain');
  assert.equal(priorities.quads, 'track');
  assert.equal(priorities.triceps, 'track', 'supporting work alone does not create a growth target');
  assert.equal(hasExplicitMusclePriorities(state), true);
  assert.equal(volumeReferenceForPriority('chest', 'track'), null);
  assert.deepEqual(volumeReferenceForPriority('chest', 'grow'), {
    min: 10, max: 20, label: 'General productive reference',
  });
});

test('guide combines real calendar-week logs with the active program projection', () => {
  const state = {
    currentWeek: '1',
    settings: { musclePriorities: { chest: 'grow', quads: 'maintain' } },
    weeks: {
      live: {
        dates: { mon: '2026-07-20' },
        lifts: { mon: { 'Barbell Bench Press': [work(100, 5), work(100, 5)] } },
      },
    },
  };
  const guide = buildVolumeGuideModel(state, {
    program: programFixture(), weekStart: '2026-07-20', today: '2026-07-22',
  });
  const chest = guide.muscles.find((row) => row.id === 'chest');
  assert.equal(chest.logged.direct, 2);
  assert.equal(chest.planned.total, 3);
  assert.equal(chest.priority, 'grow');
  assert.equal(chest.status, 'Below general reference', 'a plan below a generic band is described, not scored');
  assert.equal(guide.summary.focusCount, 2);
  assert.equal(guide.summary.scheduledCount, 2, 'scheduled count describes remaining planned work, not only plans that reach a reference band');
  assert.equal(guide.summary.loggedCredits > 2, true, 'supporting muscle credits remain visible');
});

test('historical guide never presents the current program as a past plan', () => {
  const guide = buildVolumeGuideModel({ currentWeek: '1', settings: {}, weeks: {} }, {
    program: programFixture(), weekStart: '2026-07-06', today: '2026-07-22',
  });
  assert.equal(guide.isCurrentWeek, false);
  assert.equal(guide.summary.plannedCredits, 0);
  assert.equal(guide.muscles.length, 0);
});
