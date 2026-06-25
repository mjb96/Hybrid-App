// ==========================================
// HEALTH BRIDGE MAPPER TESTS (tests/health_bridge.test.js)
// Verifies applyHealthDays() maps native per-day buckets into the
// appState.healthConnect.* shapes every reader expects, idempotently.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHealthDays, isHealthBridgeAvailable, getHealthAvailability } from '../js/health/health-bridge.js';

function makeState() {
  return { healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [] } };
}

test('applyHealthDays maps each metric into its reader shape', () => {
  const state = makeState();
  const applied = applyHealthDays(state, [
    {
      date: '2026-06-20',
      steps: 8000,
      restingHeartRate: 52,
      hrvRmssd: 64,
      sleepSessions: [{ durationMs: 7.5 * 3600000 }],
    },
  ]);
  assert.equal(applied, 1);
  const hc = state.healthConnect;
  // hrv read as .rmssd (dashboard) and .value (profile)
  assert.deepEqual(hc.hrv, [{ date: '2026-06-20', rmssd: 64, value: 64 }]);
  // rhr read as .bpm (dashboard/recovery) and .value (profile)
  assert.deepEqual(hc.restingHR, [{ date: '2026-06-20', bpm: 52, value: 52 }]);
  // sleep read as .hours
  assert.deepEqual(hc.sleep, [{ date: '2026-06-20', hours: 7.5 }]);
  // steps read as .value (dashboard)
  assert.deepEqual(hc.steps, [{ date: '2026-06-20', value: 8000, count: 8000 }]);
});

test('applyHealthDays is idempotent — re-sync updates in place, no dupes', () => {
  const state = makeState();
  applyHealthDays(state, [{ date: '2026-06-20', restingHeartRate: 52 }]);
  applyHealthDays(state, [{ date: '2026-06-20', restingHeartRate: 50 }]);
  assert.equal(state.healthConnect.restingHR.length, 1);
  assert.equal(state.healthConnect.restingHR[0].bpm, 50);
});

test('applyHealthDays skips null metrics and date-less buckets', () => {
  const state = makeState();
  const applied = applyHealthDays(state, [
    { date: '2026-06-21', hrvRmssd: null, restingHeartRate: null, steps: null, sleepSessions: [] },
    { steps: 500 }, // no date → ignored
  ]);
  assert.equal(applied, 0);
  assert.equal(state.healthConnect.hrv.length, 0);
  assert.equal(state.healthConnect.steps.length, 0);
});

test('applyHealthDays sorts by date and caps history length', () => {
  const state = makeState();
  const buckets = [];
  for (let i = 0; i < 150; i++) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    buckets.push({ date: d, steps: i });
  }
  // feed out of order
  applyHealthDays(state, buckets.slice().reverse());
  const steps = state.healthConnect.steps;
  assert.equal(steps.length, 120);                 // capped
  assert.ok(steps[0].date < steps[steps.length - 1].date); // ascending
});

test('bridge detection is false without a native interface (PWA/Node)', () => {
  assert.equal(isHealthBridgeAvailable(), false);
  assert.equal(getHealthAvailability(), 'NOT_SUPPORTED');
});
