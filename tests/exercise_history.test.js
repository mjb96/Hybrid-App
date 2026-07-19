import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXERCISE_HISTORY_SCOPE,
  exerciseLoggerHistory,
  exercisePerformanceHistory,
  latestExercisePerformance,
} from '../js/workout/exercise-history.js';
import { computeDiagnosticForLift, initEngine } from '../js/engine.js';

const done = (w, r = 5, extra = {}) => ({ w: String(w), r: String(r), c: true, ...extra });
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function historyFixture() {
  return {
    activeActivationId: 'act_new',
    activeProgramId: 'program_b',
    weeks: {
      // A higher program-week number is older in real time.
      '9': {
        activationId: 'act_new', programId: 'program_b',
        dates: { mon: '2026-06-20' },
        lifts: { mon: { Squat: [done(90)] } },
      },
      // Archived history is newer than week 9 and lives on another weekday.
      'arch:act_old:2': {
        activationId: 'act_old', programId: 'program_a',
        dates: { thu: '2026-07-01' },
        lifts: { thu: { Squat: [done(100)] } },
      },
      '2': {
        activationId: 'act_new', programId: 'program_b',
        dates: { tue: '2026-07-08' },
        lifts: { tue: {
          Squat: [done(105), done(50, 10, { type: 'W' }), done(110, 3, { c: false })],
          'Paused Squat': [done(120)],
        } },
      },
      'legacy-undated': {
        activationId: 'act_old', programId: 'program_a',
        lifts: { fri: { Squat: [done(200)] } },
      },
    },
  };
}

test('exercise history follows stamped dates across weekdays, activations and archived keys', () => {
  const history = exercisePerformanceHistory(historyFixture(), 'Squat');
  assert.deepEqual(history.map((row) => [row.weekKey, row.day, row.date, row.weight]), [
    ['2', 'tue', '2026-07-08', 105],
    ['arch:act_old:2', 'thu', '2026-07-01', 100],
    ['9', 'mon', '2026-06-20', 90],
  ]);
  assert.equal(history[0].workingSets.length, 1, 'warm-ups and incomplete sets are excluded');
});

test('exercise identity resolves explicit aliases but keeps different variations separate', () => {
  const state = historyFixture();
  assert.equal(latestExercisePerformance(state, 'Squat')?.weight, 105);
  assert.equal(latestExercisePerformance(state, 'Paused Squat')?.weight, 120);
  assert.equal(latestExercisePerformance(state, 'squat')?.weight, 105);
});

test('history scopes are explicit and current-slot exclusion is exact', () => {
  const state = historyFixture();
  const activation = exercisePerformanceHistory(state, 'Squat', {
    scope: EXERCISE_HISTORY_SCOPE.ACTIVATION,
  });
  assert.deepEqual(activation.map((row) => row.weekKey), ['2', '9']);

  const program = exercisePerformanceHistory(state, 'Squat', {
    scope: EXERCISE_HISTORY_SCOPE.PROGRAM,
    programId: 'program_a',
  });
  assert.deepEqual(program.map((row) => row.weekKey), ['arch:act_old:2']);

  const excluded = exercisePerformanceHistory(state, 'Squat', {
    exclude: { weekKey: '2', day: 'tue' },
  });
  assert.equal(excluded[0].weekKey, 'arch:act_old:2');
});

test('same-date ties prefer a persisted session timestamp, then stay deterministic', () => {
  const state = { weeks: {
    'session:a': {
      sessionId: 'a', startedAt: '2026-07-10T08:00:00Z',
      dates: { fri: '2026-07-10' }, lifts: { fri: { Squat: [done(80)] } },
    },
    'session:b': {
      sessionId: 'b', startedAt: '2026-07-10T18:00:00Z',
      dates: { fri: '2026-07-10' }, lifts: { fri: { Squat: [done(85)] } },
    },
    x: { dates: { fri: '2026-07-09' }, lifts: { fri: { Squat: [done(70)] } } },
  } };
  assert.equal(latestExercisePerformance(state, 'Squat')?.sessionId, 'b');

  delete state.weeks['session:a'].startedAt;
  delete state.weeks['session:b'].startedAt;
  const first = exercisePerformanceHistory(state, 'Squat').map((row) => row.weekKey);
  const roundTrip = exercisePerformanceHistory(JSON.parse(JSON.stringify(state)), 'Squat').map((row) => row.weekKey);
  assert.deepEqual(roundTrip, first, 'storage-key tie break survives export/import round trips');
});

test('undated and future performances are never guessed into eligible chronology', () => {
  const state = historyFixture();
  state.weeks.future = { dates: { mon: '2026-08-01' }, lifts: { mon: { Squat: [done(150)] } } };
  const rows = exercisePerformanceHistory(state, 'Squat', { beforeDate: '2026-07-15' });
  assert.equal(rows.some((row) => row.weekKey === 'legacy-undated'), false);
  assert.equal(rows.some((row) => row.weekKey === 'future'), false);
});

test('diagnostic progression uses the newest dated cross-day archived performance', () => {
  const state = historyFixture();
  // Exclude the active Tue slot; the archived Thu session is the prior eligible
  // performance despite belonging to another activation/program.
  initEngine(() => state, () => DAYS);
  const result = computeDiagnosticForLift('2', 'tue', 'Squat', 5);
  assert.equal(result.suggestedWeight, 102.5);
  assert.equal(result.progression?.action, 'load-up');
});

test('logger history carries an exercise across a program switch and supplies set ghosts', () => {
  const state = historyFixture();
  const logger = exerciseLoggerHistory(state, 'Back Squat', {
    weekKey: '2', day: 'tue', beforeDate: '2026-07-08',
  });
  assert.equal(logger.hasHistory, true);
  assert.equal(logger.latest?.weekKey, 'arch:act_old:2');
  assert.equal(logger.latest?.workingSets[0].w, '100');
  assert.ok(logger.datedBestEstimated1RM > 100);
});

test('legacy aggregate history prevents a false first-time claim without inventing a session', () => {
  const logger = exerciseLoggerHistory({
    weeks: {},
    exerciseStats: { back_squat: { allTimeMax: 140 } },
  }, 'Squat');
  assert.equal(logger.hasHistory, true);
  assert.equal(logger.latest, null);
  assert.equal(logger.globalBestEstimated1RM, 140);
});

test('high-rep history still carries set context without fabricating an e1RM', () => {
  const state = { weeks: {
    old: { dates: { mon: '2026-07-01' }, lifts: { mon: { Curl: [done(20, 20)] } } },
  } };
  const latest = latestExercisePerformance(state, 'Curl');
  assert.equal(latest?.weight, 20);
  assert.equal(latest?.reps, 20);
  assert.equal(latest?.e1rm, 0);
});
