// ==========================================
// HEALTH BRIDGE MAPPER TESTS (tests/health_bridge.test.js)
// Verifies applyHealthDays() maps native per-day buckets into the
// appState.healthConnect.* shapes every reader expects, idempotently.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyHealthDays,
  updateFieldStatus,
  describeFieldStatus,
  syncHealthConnect,
  isHealthBridgeAvailable,
  getHealthAvailability,
} from '../js/health/health-bridge.js';

function makeState() {
  return { healthConnect: { connected: false, lastSync: null, hrv: [], restingHR: [], sleep: [], steps: [] } };
}

test('applyHealthDays maps each metric into its reader shape', () => {
  const state = makeState();
  const { applied } = applyHealthDays(state, [
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
  const { applied } = applyHealthDays(state, [
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

test('applyHealthDays writes ONLY the selected fields', () => {
  const state = makeState();
  // User selected steps + sleep only; a full native bucket must not leak hrv/rhr.
  const { applied, perField } = applyHealthDays(state, [
    { date: '2026-06-20', steps: 8000, restingHeartRate: 52, hrvRmssd: 64, sleepSessions: [{ durationMs: 7 * 3600000 }] },
  ], ['steps', 'sleep']);
  assert.equal(applied, 1);
  assert.equal(state.healthConnect.steps.length, 1);
  assert.equal(state.healthConnect.sleep.length, 1);
  assert.equal(state.healthConnect.hrv.length, 0);       // not selected → never written
  assert.equal(state.healthConnect.restingHR.length, 0); // not selected → never written
  assert.equal(perField.steps.days, 1);
  assert.equal(perField.sleep.lastDate, '2026-06-20');
  assert.equal('hrv' in perField, false);
});

test('updateFieldStatus reflects grant, denial, revocation, error and off', () => {
  const hc = { fieldStatus: {} };
  // Selected steps+restingHR+hrv; only steps+restingHR currently granted; hrv errored.
  updateFieldStatus(hc, {
    selected: ['steps', 'restingHR', 'hrv'],
    granted: ['steps', 'restingHR'],
    errors: ['restingHR'],
    perField: { steps: { days: 5, lastDate: '2026-06-20' }, restingHR: { days: 0, lastDate: null }, hrv: { days: 0, lastDate: null } },
  });
  assert.equal(hc.fieldStatus.steps.permission, 'granted');
  assert.equal(hc.fieldStatus.steps.days, 5);
  assert.equal(hc.fieldStatus.hrv.permission, 'denied');   // selected but not granted = revoked/denied
  assert.equal(hc.fieldStatus.restingHR.error, true);      // granted but read threw
  assert.equal(hc.fieldStatus.sleep.selected, false);      // never selected = off
});

test('describeFieldStatus turns status into honest copy', () => {
  assert.equal(describeFieldStatus(null).text, 'Off');
  assert.equal(describeFieldStatus({ selected: false }).text, 'Off');
  assert.equal(describeFieldStatus({ selected: true, permission: 'denied' }).tone, 'warn');
  assert.equal(describeFieldStatus({ selected: true, permission: 'granted', error: true }).text, 'Read error');
  assert.equal(describeFieldStatus({ selected: true, permission: 'granted', days: 1 }).text, 'Synced · 1 day');
  assert.equal(describeFieldStatus({ selected: true, permission: 'granted', days: 3 }).text, 'Synced · 3 days');
  assert.equal(describeFieldStatus({ selected: true, permission: 'granted', days: 0 }).text, 'No data yet');
});

// Drive syncHealthConnect through a synchronous fake of the native bridge so the
// grant/deny/revoke/no-data/partial-error outcomes are exercised without a device.
async function withFakeBridge(payload, fn) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = {
    __hcCB: {},
    HybridHealthBridge: {
      getAvailabilityStatus: () => 'AVAILABLE',
      readHealthDataByDay: (s, e, fieldsJson, id) => { globalThis.window.__hcCB[id]?.(JSON.stringify(payload)); },
      requestPermissions: (fieldsJson, id) => { globalThis.window.__hcCB[id]?.(JSON.stringify({ granted: JSON.parse(fieldsJson), denied: [] })); },
    },
  };
  try { await fn(); }
  finally { if (prev) Object.defineProperty(globalThis, 'window', prev); else delete globalThis.window; }
}

test('syncHealthConnect: full revocation → disconnect, keep history, throw', async () => {
  const state = { healthConnect: { connected: true, lastSync: 123, hrv: [], restingHR: [], sleep: [],
    steps: [{ date: '2026-06-01', value: 100, count: 100 }],
    syncFields: { steps: true, restingHR: false, hrv: false, sleep: false }, fieldStatus: {} } };
  await withFakeBridge({ granted: [], days: [], errors: [] }, async () => {
    await assert.rejects(syncHealthConnect(state, null, { fields: ['steps'] }), /permissions-revoked/);
  });
  assert.equal(state.healthConnect.connected, false);         // no fake "connected"
  assert.equal(state.healthConnect.steps.length, 1);          // stored history preserved
  assert.equal(state.healthConnect.fieldStatus.steps.permission, 'denied');
});

test('syncHealthConnect: granted but no data → connected, zero fieldsWithData', async () => {
  const state = { healthConnect: { connected: false, hrv: [], restingHR: [], sleep: [], steps: [],
    syncFields: { steps: true, restingHR: false, hrv: false, sleep: false }, fieldStatus: {} } };
  let result;
  await withFakeBridge({ granted: ['steps'], days: [], errors: [] }, async () => {
    result = await syncHealthConnect(state, null, { fields: ['steps'] });
  });
  assert.equal(state.healthConnect.connected, true);
  assert.equal(result.fieldsWithData, 0);
  assert.equal(state.healthConnect.fieldStatus.steps.permission, 'granted');
  assert.equal(state.healthConnect.fieldStatus.steps.days, 0);
});

test('syncHealthConnect: partial read error is surfaced per field', async () => {
  const state = { healthConnect: { connected: false, hrv: [], restingHR: [], sleep: [], steps: [],
    syncFields: { steps: true, hrv: true, restingHR: false, sleep: false }, fieldStatus: {} } };
  await withFakeBridge({ granted: ['steps', 'hrv'], days: [{ date: '2026-06-02', steps: 500 }], errors: ['hrv'] }, async () => {
    await syncHealthConnect(state, null, { fields: ['steps', 'hrv'] });
  });
  assert.equal(state.healthConnect.fieldStatus.hrv.error, true);
  assert.equal(state.healthConnect.fieldStatus.steps.days, 1);
  assert.equal(state.healthConnect.hrv.length, 0);   // errored field wrote nothing
});

test('bridge detection is false without a native interface (PWA/Node)', () => {
  assert.equal(isHealthBridgeAvailable(), false);
  assert.equal(getHealthAvailability(), 'NOT_SUPPORTED');
});
