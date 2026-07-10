import { test } from 'node:test';
import assert from 'node:assert/strict';

// Returning-user path stamps onboardingComplete and persists it, which reaches
// localStorage. Provide a stub so that write succeeds silently instead of
// logging a swallowed "localStorage is not defined" (a false-green noise line).
globalThis.localStorage = globalThis.localStorage || {
  s: {}, getItem(k) { return this.s[k] ?? null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; },
};

const { initOnboarding, shouldShowOnboarding } = await import('../js/onboarding.js');

// Drive shouldShowOnboarding with a stubbed state getter.
const withState = (s) => { initOnboarding(() => s); return shouldShowOnboarding(); };

test('fresh install (no saved state) → show onboarding, even with the empty week scaffold present', () => {
  // Boot seeds an empty week scaffold before the check runs; that must NOT count.
  const fresh = {
    _hadStoredState: false,
    settings: { onboardingComplete: false, name: '' },
    weeks: { '1': { runs: {}, lifts: {}, notes: {} } },  // scaffold, no real data
    bodyWeightLog: [], customExercises: [],
  };
  assert.equal(withState(fresh), true);
});

test('returning user (had a saved blob at boot) → skip onboarding and mark complete', () => {
  const s = {
    _hadStoredState: true,
    settings: { onboardingComplete: false },
    weeks: {}, bodyWeightLog: [], customExercises: [],
  };
  assert.equal(withState(s), false);
  assert.equal(s.settings.onboardingComplete, true, 'legacy user is stamped done');
});

test('already onboarded → never show', () => {
  assert.equal(withState({ settings: { onboardingComplete: true } }), false);
});

test('real logged data without the stored-state flag still counts as existing', () => {
  const s = {
    _hadStoredState: false,
    settings: { onboardingComplete: false, name: 'Matt' },
    weeks: {}, bodyWeightLog: [], customExercises: [],
  };
  assert.equal(withState(s), false);
});
