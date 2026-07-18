import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completionPresentation, evaluateSessionCompletion } from '../js/workout/completion-policy.js';
import { finishSession, markSessionInProgress } from '../js/workout/session-status.js';

const PROGRAM = {
  days: {
    mon: { title: 'Hybrid', lifts: ['Squat', 'Bench'], runs: '5 km easy' },
    tue: { title: 'Run', lifts: [], runs: '6×800m (90s recovery)' },
    wed: { title: 'Lift', lifts: ['Squat'], runs: 'Rest' },
    sun: { title: 'Rest', lifts: [], runs: 'Rest' },
  },
  weeklyVolModifiers: { '1': { sets: 2, reps: 5, intensityLabel: 'Build' } },
};

const set = (complete, type = '') => ({ w: '100', r: '5', c: complete, type });
const state = (week) => ({ currentWeek: '1', weeks: { '1': week } });

test('empty planned session is not complete', () => {
  const result = evaluateSessionCompletion(state({ lifts: { wed: { Squat: [set(false), set(false)] } } }), PROGRAM, 1, 'wed');
  assert.equal(result.outcome, 'empty');
  assert.equal(result.complete, false);
});

test('one of several prescribed sets is partial and never complete', () => {
  const result = evaluateSessionCompletion(state({ lifts: { wed: { Squat: [set(true), set(false)] } } }), PROGRAM, 1, 'wed');
  assert.equal(result.outcome, 'partial');
  assert.equal(result.progressLabel, '1 of 2 planned sets');
});

test('all planned working sets completes a gym session; warmups do not count', () => {
  const result = evaluateSessionCompletion(state({ lifts: { wed: { Squat: [set(true, 'W'), set(true), set(true)] } } }), PROGRAM, 1, 'wed');
  assert.equal(result.outcome, 'complete');
  assert.equal(result.actual.sets, 2);
});

test('hybrid session requires both the planned sets and run', () => {
  const lifts = { mon: { Squat: [set(true), set(true)], Bench: [set(true), set(true)] } };
  const withoutRun = evaluateSessionCompletion(state({ lifts }), PROGRAM, 1, 'mon');
  assert.equal(withoutRun.outcome, 'partial');
  assert.equal(withoutRun.componentOutcome, 'strength-complete');
  assert.equal(withoutRun.progressLabel, 'Strength complete · run not logged');
  const strengthPresentation = completionPresentation(withoutRun);
  assert.equal(strengthPresentation.title, 'Finish workout?');
  assert.doesNotMatch(strengthPresentation.title, /partial/i);
  assert.match(strengthPresentation.body, /treated as skipped/i);
  assert.equal(strengthPresentation.emitsRecap, true);
  const withRun = evaluateSessionCompletion(state({ lifts, runSessions: { mon: [{ sessionId: 'run_1', dist: '5', time: '25:00' }] } }), PROGRAM, 1, 'mon');
  assert.equal(withRun.outcome, 'complete');
});

test('a completed run on a hybrid day is credited while strength remains open', () => {
  const result = evaluateSessionCompletion(state({ runSessions: { mon: [{ sessionId: 'run_3', dist: '5', time: '25:00' }] } }), PROGRAM, 1, 'mon');
  assert.equal(result.componentOutcome, 'run-complete');
  const presentation = completionPresentation(result);
  assert.equal(presentation.title, 'Finish workout?');
  assert.match(presentation.body, /treated as skipped/i);
});

test('run-only plan does not invent a gym requirement despite its title', () => {
  const result = evaluateSessionCompletion(state({ runSessions: { tue: [{ sessionId: 'run_2', time: '30:00' }] } }), PROGRAM, 1, 'tue');
  assert.equal(result.planned.gym, false);
  assert.equal(result.outcome, 'complete');
});

test('exercise swap can complete the same set prescription and is marked modified', () => {
  const result = evaluateSessionCompletion(state({ lifts: { wed: { 'Goblet Squat': [set(true), set(true)] } } }), PROGRAM, 1, 'wed');
  assert.equal(result.complete, true);
  assert.equal(result.modified, true);
});

test('an intentionally skipped exercise remains a truthful partial session', () => {
  const result = evaluateSessionCompletion(state({ lifts: { mon: { Squat: [set(true), set(true)], Bench: [set(false), set(false)] } } }), PROGRAM, 1, 'mon');
  assert.equal(result.outcome, 'partial');
  assert.equal(result.complete, false);
});

test('extra incomplete sets do not revoke completion but flag a modification', () => {
  const result = evaluateSessionCompletion(state({ lifts: { wed: { Squat: [set(true), set(true), set(false)] } } }), PROGRAM, 1, 'wed');
  assert.equal(result.complete, true);
  assert.equal(result.modified, true);
});

test('rest day is never a completed training session', () => {
  const result = evaluateSessionCompletion(state({}), PROGRAM, 1, 'sun');
  assert.equal(result.outcome, 'rest');
  assert.equal(result.complete, false);
});

test('deliberately finishing skipped work never calls the session partial', () => {
  const presentation = completionPresentation({ partial: true, complete: false, anyLogged: true });
  assert.equal(presentation.title, 'Finish workout?');
  assert.doesNotMatch(presentation.title + presentation.body, /partial/i);
  assert.equal(presentation.emitsRecap, true);
});

test('fully adherent work uses the same explicit finish action', () => {
  const presentation = completionPresentation({ partial: false, complete: true, anyLogged: true });
  assert.equal(presentation.action, 'Finish Workout');
  assert.equal(presentation.emitsRecap, true);
});

test('warm-up-only or empty work cannot be finished as training', () => {
  const result = evaluateSessionCompletion(state({ lifts: { wed: { Squat: [set(true, 'W')] } } }), PROGRAM, 1, 'wed');
  assert.equal(result.anyLogged, false);
  const presentation = completionPresentation(result);
  assert.equal(presentation.action, null);
  assert.match(presentation.body, /discard/i);
});

test('finish state is separate from adherence and is idempotent', () => {
  const value = state({ lifts: { mon: { Squat: [set(true), set(true)], Bench: [set(false), set(false)] } } });
  const before = evaluateSessionCompletion(value, PROGRAM, 1, 'mon');
  assert.equal(before.complete, false, 'prescription adherence remains incomplete');
  const first = finishSession(value.weeks['1'], 'mon', before, Date.parse('2026-07-19T10:00:00Z'));
  const second = finishSession(value.weeks['1'], 'mon', before, Date.parse('2026-07-19T11:00:00Z'));
  const after = evaluateSessionCompletion(value, PROGRAM, 1, 'mon');
  assert.equal(first.alreadyFinished, false);
  assert.equal(second.alreadyFinished, true);
  assert.equal(after.finished, true);
  assert.equal(after.complete, false);
  assert.equal(value.weeks['1'].sessionSummary.mon.skippedSets, 2);
  assert.equal(value.weeks['1'].sessionSummary.mon.finishedAt, '2026-07-19T10:00:00.000Z');
});

test('leaving fully logged new work without Finish keeps it resumable', () => {
  const value = state({ lifts: { wed: { Squat: [set(true), set(true)] } } });
  markSessionInProgress(value.weeks['1'], 'wed');
  const result = evaluateSessionCompletion(value, PROGRAM, 1, 'wed');
  assert.equal(result.complete, true, 'planned adherence can already be complete');
  assert.equal(result.finished, false, 'session lifecycle waits for Finish Workout');
});

test('editing a finished workout retains its finished lifecycle', () => {
  const week = { sessionStatus: { wed: 'finished' } };
  assert.equal(markSessionInProgress(week, 'wed'), false);
  assert.equal(week.sessionStatus.wed, 'finished');
});

test('one-off strength completion is isolated from the program prescription', () => {
  const oneOff = {
    currentWeek: '1',
    weeks: {
      'session:str_1': {
        sessionId: 'str_1', sessionKind: 'empty',
        lifts: { thu: { Bench: [set(true), set(true)] } },
      },
    },
  };
  const result = evaluateSessionCompletion(oneOff, PROGRAM, 'session:str_1', 'thu');
  assert.equal(result.complete, true);
  assert.equal(result.planned.sets, 2);
  assert.equal(result.planned.run, false);
});
