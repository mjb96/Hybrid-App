import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getWorkoutElapsedSeconds,
  getWorkoutTimerSessionKey,
  startWorkoutTimer,
  stopAndResetWorkoutTimer,
} from '../js/timers.js';
import { workoutSessionKey } from '../js/workout/session-identity.js';

function fakeStorage() {
  const values = {};
  return {
    getItem: (key) => key in values ? values[key] : null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
  };
}

test('workout session keys separate activation/week/day and one-off sessions', () => {
  const state = {
    activeActivationId: 'act_a',
    weeks: {
      '2': { activationId: 'act_a' },
      'session:str_1': { sessionId: 'str_1' },
    },
  };
  assert.equal(workoutSessionKey(state, '2', 'mon'), 'program:act_a:2:mon');
  assert.equal(workoutSessionKey(state, '2', 'tue'), 'program:act_a:2:tue');
  assert.equal(workoutSessionKey(state, 'session:str_1', 'fri'), 'session:str_1:fri');
});

test('elapsed time cannot leak from one workout into another', () => {
  const originalNow = Date.now;
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = fakeStorage();
  try {
    Date.now = () => 1_000_000;
    startWorkoutTimer('program:act_a:2:mon');
    Date.now = () => 1_090_000;
    assert.equal(getWorkoutElapsedSeconds('program:act_a:2:mon'), 90);
    assert.equal(getWorkoutElapsedSeconds('program:act_a:2:tue'), 0);

    startWorkoutTimer('program:act_a:2:tue');
    assert.equal(getWorkoutTimerSessionKey(), 'program:act_a:2:tue');
    assert.equal(getWorkoutElapsedSeconds('program:act_a:2:tue'), 0);
    assert.equal(stopAndResetWorkoutTimer('program:act_a:2:mon'), false);
    assert.equal(getWorkoutTimerSessionKey(), 'program:act_a:2:tue');
    assert.equal(stopAndResetWorkoutTimer('program:act_a:2:tue'), true);
  } finally {
    Date.now = originalNow;
    globalThis.document = originalDocument;
    globalThis.localStorage = originalStorage;
  }
});
