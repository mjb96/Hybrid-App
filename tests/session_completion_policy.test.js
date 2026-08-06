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
  // CHANGED DELIBERATELY (Phase 2B): this used to assert the generic
  // "treated as skipped" copy, which every finishable session received —
  // including one that completed everything. Adherence now changes the
  // EXPLANATION (never the availability of Finish), so a session whose strength
  // work is done is told exactly that, and told what is outstanding.
  assert.match(strengthPresentation.body, /strength work is complete/i);
  assert.match(strengthPresentation.body, /run is not logged/i);
  assert.equal(strengthPresentation.emitsRecap, true);
  const withRun = evaluateSessionCompletion(state({ lifts, runSessions: { mon: [{ sessionId: 'run_1', dist: '5', time: '25:00' }] } }), PROGRAM, 1, 'mon');
  assert.equal(withRun.outcome, 'complete');
});

test('a completed run on a hybrid day is credited while strength remains open', () => {
  const result = evaluateSessionCompletion(state({ runSessions: { mon: [{ sessionId: 'run_3', dist: '5', time: '25:00' }] } }), PROGRAM, 1, 'mon');
  assert.equal(result.componentOutcome, 'run-complete');
  const presentation = completionPresentation(result);
  assert.equal(presentation.title, 'Finish workout?');
  // CHANGED DELIBERATELY (Phase 2B) — see the note above. The mirror case: the
  // run is done, the strength work is not.
  assert.match(presentation.body, /run is logged/i);
  assert.match(presentation.body, /strength work is not complete/i);
});

test('a complete session is not warned about work it did not skip', () => {
  // The old copy told EVERY finishable session that unfinished work "will be
  // treated as skipped" — including sessions that finished everything. A
  // warning that fires every time is one nobody reads when it finally matters.
  const presentation = completionPresentation({ complete: true, partial: false, anyLogged: true });
  assert.doesNotMatch(presentation.body, /skipped|not done|did not/i);
  assert.match(presentation.body, /Everything you planned is logged/i);
  assert.equal(presentation.action, 'Finish Workout');
});

test('low adherence explains itself without blocking the finish', () => {
  const presentation = completionPresentation({ complete: false, partial: true, anyLogged: true });
  assert.equal(presentation.action, 'Finish Workout', 'Finish must never be withheld for low adherence');
  assert.equal(presentation.emitsRecap, true);
  assert.match(presentation.body, /not a failure/i, 'the explanation must not read as a reprimand');
  assert.doesNotMatch(presentation.title + presentation.body, /partial|incomplete/i);
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

test('completed rows leaked beneath the current prescription do not count toward today', () => {
  const result = evaluateSessionCompletion(state({
    lifts: { wed: {
      Squat: [set(false), set(false)],
      'Romanian Deadlift': [set(true), set(true), set(true)],
    } },
    liftOrder: { wed: ['Squat', 'Romanian Deadlift'] },
    liftMeta: { wed: {} },
  }), PROGRAM, 1, 'wed');
  assert.equal(result.anyLogged, false);
  assert.equal(result.actual.sets, 0);
  assert.equal(result.outcome, 'empty');
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
