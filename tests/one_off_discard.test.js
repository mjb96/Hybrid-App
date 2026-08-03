import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeOneOffSession, discardActiveOneOffSession,
} from '../js/workout/one-off-session.js';

test('discarding an active one-off removes only that unfinished session', () => {
  const programmed = { programId: 'plan', lifts: { mon: { Squat: [] } } };
  const oneOff = {
    sessionId: 'str_test', sessionKind: 'empty', sessionDay: 'mon',
    lifts: { mon: {} },
  };
  const state = {
    currentWeek: '1',
    activeStrengthSessionKey: 'session:str_test',
    weeks: { '1': programmed, 'session:str_test': oneOff },
  };

  assert.ok(activeOneOffSession(state));
  assert.deepEqual(discardActiveOneOffSession(state), {
    key: 'session:str_test',
    day: 'mon',
    sessionId: 'str_test',
  });
  assert.equal(state.activeStrengthSessionKey, undefined);
  assert.equal(state.weeks['session:str_test'], undefined);
  assert.equal(state.weeks['1'], programmed);
});

test('discard is a no-op when no one-off is active', () => {
  const state = { weeks: { '1': {} } };
  assert.equal(discardActiveOneOffSession(state), null);
  assert.deepEqual(state, { weeks: { '1': {} } });
});
