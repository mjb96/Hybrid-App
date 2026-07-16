import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const service = readFileSync(new URL(
  '../android/app/src/main/java/com/helyx/app/GpsTrackingService.kt', import.meta.url,
), 'utf8');
const bridge = readFileSync(new URL(
  '../android/app/src/main/java/com/helyx/app/GpsBridge.kt', import.meta.url,
), 'utf8');
const tracker = readFileSync(new URL('../js/gps-tracker.js', import.meta.url), 'utf8');

test('native tracking journals before accepting fixes and redelivers after service death', () => {
  assert.match(service, /journal\?\.append\(JournalGpsPoint/);
  assert.match(service, /if \(!stored[^]*stopListening\(\)/);
  assert.match(service, /return START_REDELIVER_INTENT/);
  assert.match(service, /status == STATUS_TRACKING[^]*status = STATUS_PAUSED/);
});

test('a new native run cannot start until its durable journal is prepared', () => {
  const prepare = bridge.indexOf('GpsPointStore.startRun()');
  const command = bridge.indexOf('command(GpsTrackingService.ACTION_START');
  assert.ok(prepare >= 0 && command > prepare);
});

test('stop is two-phase and explicit cancel discards instead of finalizing', () => {
  const stop = tracker.indexOf('nativeStopRun()');
  const stateSave = tracker.indexOf('await saveStateToLocalStorage(true)', stop);
  const acknowledge = tracker.indexOf('nativeCompleteRun()', stateSave);
  assert.ok(stop >= 0 && stateSave > stop && acknowledge > stateSave);
  assert.match(tracker, /routeId = await saveMapToDB[^]*if \(!routeId\) routeSaveFailed = true/);
  assert.match(tracker, /savedSession[^]*nativeCompleteRun\(\)/);
  assert.match(tracker, /cancelTracking\(\)[^]*nativeDiscardRun\(\)/);
});
