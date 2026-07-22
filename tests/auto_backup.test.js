import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  automaticBackupDue,
  automaticBackupSupported,
  buildCompleteBackup,
  chooseAutomaticBackupFolder,
  disableAutomaticBackup,
  getAutomaticBackupStatus,
  runAutomaticBackup,
} from '../js/portability/auto-backup.js';
import { beginRecoveryGate, completeRecoveryGate } from '../js/state/recovery-gate.js';

const state = () => ({ currentWeek: '1', weeks: { 1: { lifts: {} } } });
const route = () => ({
  id: 'route:run_1', sessionId: 'run_1', activationId: 'activation_1',
  programId: 'hybrid', week: '1', day: 'mon', localDate: '2026-07-20',
  startTs: 10, updatedTs: 20,
  coordinates: [[-33.86, 151.20], [-33.85, 151.21]],
});

function nativeRuntime(handlers = {}) {
  const win = {};
  const calls = [];
  const resolve = (callbackId, payload) => win.__autoBackupCB[callbackId](JSON.stringify(payload));
  win.HybridAutoBackupBridge = {
    getStatus(callbackId) {
      calls.push(['getStatus']);
      resolve(callbackId, handlers.status || { status: 'ready', available: true, configured: false });
    },
    chooseFolder(callbackId) {
      calls.push(['chooseFolder']);
      resolve(callbackId, handlers.folder || { status: 'configured', available: true, configured: true, folderName: 'Helyx' });
    },
    disable(callbackId) {
      calls.push(['disable']);
      resolve(callbackId, { status: 'disabled', configured: false });
    },
    writeAutomaticBackup(content, dayKey, weekKey, reason, callbackId) {
      calls.push(['writeAutomaticBackup', content, dayKey, weekKey, reason]);
      resolve(callbackId, { status: 'saved', configured: true, lastBackupDay: dayKey });
    },
  };
  return {
    runtime: { window: win, setTimeout: () => 1, clearTimeout: () => {} },
    calls,
  };
}

test('automatic backup is Android-only and reports unavailable in a browser', async () => {
  const runtime = { window: {}, setTimeout: () => 1, clearTimeout: () => {} };
  assert.equal(automaticBackupSupported(runtime), false);
  assert.deepEqual(await getAutomaticBackupStatus(runtime), {
    status: 'unavailable', available: false, configured: false,
  });
});

test('folder setup and disable resolve through the native completion callback', async () => {
  const { runtime, calls } = nativeRuntime();
  assert.equal(automaticBackupSupported(runtime), true);
  assert.equal((await chooseAutomaticBackupFolder(runtime)).folderName, 'Helyx');
  assert.equal((await disableAutomaticBackup(runtime)).status, 'disabled');
  assert.deepEqual(calls, [['chooseFolder'], ['disable']]);
  assert.deepEqual(runtime.window.__autoBackupCB, {});
});

test('complete backup is the portable v4 envelope and includes every GPS route', async () => {
  const complete = await buildCompleteBackup(state(), {
    getRoutes: async () => [route()],
    appVersion: 'test-version',
  });
  const parsed = JSON.parse(complete.content);
  assert.equal(parsed.format, 'helyx-export');
  assert.equal(parsed.version, 4);
  assert.equal(parsed.appVersion, 'test-version');
  assert.equal(parsed.state.currentWeek, '1');
  assert.equal(parsed.routeRecords.length, 1);
  assert.equal(parsed.routeRecords[0].id, 'route:run_1');
  assert.equal(complete.routeCount, 1);
});

test('complete backup refuses a partial route export', async () => {
  await assert.rejects(
    buildCompleteBackup(state(), { getRoutes: async () => [route(), { id: 'invalid' }] }),
    /did not preserve every route/,
  );
});

test('daily due check compares the native last-written calendar day', () => {
  assert.equal(automaticBackupDue({ configured: true, lastBackupDay: '2026-07-21' }, '2026-07-22'), true);
  assert.equal(automaticBackupDue({ configured: true, lastBackupDay: '2026-07-22' }, '2026-07-22'), false);
  assert.equal(automaticBackupDue({ configured: false }, '2026-07-22'), false);
});

test('configured backup writes complete JSON with daily and Monday week keys', async () => {
  const { runtime, calls } = nativeRuntime({
    status: { status: 'ready', available: true, configured: true, lastBackupDay: '2026-07-21' },
  });
  const result = await runAutomaticBackup('session', {
    force: true,
    runtime,
    state: state(),
    dayKey: '2026-07-22',
    getRoutes: async () => [route()],
  });
  assert.equal(result.status, 'saved');
  assert.equal(calls.length, 2);
  const write = calls[1];
  assert.equal(write[0], 'writeAutomaticBackup');
  assert.equal(write[2], '2026-07-22');
  assert.equal(write[3], '2026-07-20');
  assert.equal(write[4], 'session');
  assert.equal(JSON.parse(write[1]).routeRecords.length, 1);
});

test('same-day daily check skips route reads and document writes', async () => {
  const { runtime, calls } = nativeRuntime({
    status: { status: 'ready', available: true, configured: true, lastBackupDay: '2026-07-22' },
  });
  let routeReads = 0;
  const result = await runAutomaticBackup('daily', {
    runtime,
    state: state(),
    dayKey: '2026-07-22',
    getRoutes: async () => { routeReads++; return [route()]; },
  });
  assert.equal(result.status, 'current');
  assert.equal(routeReads, 0);
  assert.deepEqual(calls, [['getStatus']]);
});

test('an unconfigured folder never reads or writes training data', async () => {
  const { runtime, calls } = nativeRuntime();
  let routeReads = 0;
  const result = await runAutomaticBackup('session', {
    force: true,
    runtime,
    state: state(),
    getRoutes: async () => { routeReads++; return [route()]; },
  });
  assert.equal(result.configured, false);
  assert.equal(routeReads, 0);
  assert.deepEqual(calls, [['getStatus']]);
});

test('recovery gate prevents an empty scaffold from overwriting offline files', async () => {
  const { runtime, calls } = nativeRuntime({
    status: { status: 'ready', available: true, configured: true, lastBackupDay: '2026-07-21' },
  });
  beginRecoveryGate();
  try {
    const result = await runAutomaticBackup('daily', {
      runtime,
      state: state(),
      dayKey: '2026-07-22',
      getRoutes: async () => { throw new Error('routes must not be read'); },
    });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(calls, []);
  } finally {
    completeRecoveryGate();
  }
});
