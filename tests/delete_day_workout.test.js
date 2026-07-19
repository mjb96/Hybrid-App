import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteDayWorkoutData, hasDayWorkoutData, hasDayWorkoutDraft } from '../js/workout/delete-day.js';

function loggedWeek() {
  return {
    runs: { mon: { dist: '5', time: '25:00', rpe: '7', sessionId: 'run_1' } },
    runSessions: { mon: [{ dist: '5', time: '25:00', rpe: '7', sessionId: 'run_1' }] },
    lifts: { mon: { Squat: [{ w: '100', r: '5', c: true }] } },
    liftOrder: { mon: ['Squat'] },
    liftMeta: { mon: { Squat: { groupId: 'ss_1' } } },
    notes: { mon: 'Hard but good' },
    gymRpe: { mon: '8' },
    gymStats: { mon: { time: '45:00', avgHR: 130, gymSets: [{ reps: 5 }] } },
    bodyWeight: { mon: '80.2' },
    dates: { mon: '2026-07-13' },
    sessionStatus: { mon: 'finished' },
    sessionSummary: { mon: { plannedSets: 4, completedSets: 1, skippedSets: 3 } },
  };
}

test('deletes one day workout and restores a supplied blank prescription', () => {
  const week = loggedWeek();
  const replacement = { Squat: [{ w: '', r: '5', c: false, targetWeight: 102.5 }] };

  assert.equal(deleteDayWorkoutData(week, 'mon', { lifts: replacement, liftOrder: ['Squat'] }), true);

  assert.deepEqual(week.runSessions.mon, []);
  assert.deepEqual(week.runs.mon, { dist: '', time: '', rpe: '' });
  assert.deepEqual(week.lifts.mon, replacement);
  assert.deepEqual(week.liftOrder.mon, ['Squat']);
  assert.deepEqual(week.liftMeta.mon, {});
  assert.equal(week.notes.mon, '');
  assert.equal(week.gymRpe.mon, '');
  assert.deepEqual(week.gymStats.mon, { time: '', avgHR: '', maxHR: '', cals: '' });
  assert.equal(week.sessionStatus.mon, undefined);
  assert.equal(week.sessionSummary.mon, undefined);
});

test('workout deletion preserves the day date and body-weight measurement', () => {
  const week = loggedWeek();
  deleteDayWorkoutData(week, 'mon');
  assert.equal(week.dates.mon, '2026-07-13');
  assert.equal(week.bodyWeight.mon, '80.2');
  assert.equal(hasDayWorkoutData(week, 'mon'), false);
});

test('deleting a missing or already-empty day is an honest no-op', () => {
  assert.equal(deleteDayWorkoutData(null, 'mon'), false);
  assert.equal(deleteDayWorkoutData({ bodyWeight: { mon: '80' } }, 'mon'), false);
});

test('unchecked user edits count as an unresolved draft but blank prescriptions do not', () => {
  assert.equal(hasDayWorkoutDraft({ lifts: { mon: { Squat: [{ w: '', r: '', c: false }] } } }, 'mon'), false);
  assert.equal(hasDayWorkoutDraft({ lifts: { mon: { Squat: [{ w: '100', r: '5', c: false }] } } }, 'mon'), true);
  assert.equal(hasDayWorkoutDraft({ lifts: { mon: { Squat: [{ w: '', r: '', c: false, rpe: 8 }] } } }, 'mon'), true);
});

test('finished history is resolved while an unfinished session remains a draft', () => {
  assert.equal(hasDayWorkoutDraft({ lifts: { mon: { Squat: [{ w: '100', r: '5', c: true }] } } }, 'mon'), false);
  assert.equal(hasDayWorkoutDraft({ lifts: { mon: { Squat: [
    { w: '100', r: '5', c: true }, { w: '', r: '', c: false },
  ] } } }, 'mon'), true);
  assert.equal(hasDayWorkoutDraft({
    lifts: { mon: { Squat: [{ w: '100', r: '5', c: true }, { w: '', r: '', c: false }] } },
    gymStats: { mon: { time: '30:00' } },
  }, 'mon'), false);
  assert.equal(hasDayWorkoutDraft({
    lifts: { mon: { Squat: [{ w: '100', r: '5', c: true }, { w: '', r: '', c: false }] } },
    sessionStatus: { mon: 'finished' },
  }, 'mon'), false, 'explicit finish resolves skipped sets without a duration proxy');
  assert.equal(hasDayWorkoutDraft({
    runs: { mon: { dist: '5', time: '25:00' } },
    runSessions: { mon: [{ sessionId: 'run_1', dist: '5', time: '25:00' }] },
  }, 'mon'), false);
  assert.equal(hasDayWorkoutDraft({ runs: { mon: { dist: '5', time: '' } } }, 'mon'), true);
});

test('activity detail exposes exact deletion and Undo outside the logger', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const activities = await readFile(new URL('../js/activities.js', import.meta.url), 'utf8');
  assert.match(html, /id="activitiesScreen"/);
  assert.match(html, /data-action="undo-activity-delete"/);
  assert.match(activities, /data-action=\"delete-activity\"/);
  assert.match(activities, /Only this .* will be removed/);
});
