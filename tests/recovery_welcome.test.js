import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  beginRecoveryGate,
  reconcileRecoveryGate,
  completeRecoveryGate,
  isRecoveryGatePending,
} from '../js/state/recovery-gate.js';

test('a fresh device remains cloud-write locked until recovery is resolved', () => {
  beginRecoveryGate();
  assert.equal(isRecoveryGatePending(), true);
  assert.equal(reconcileRecoveryGate({
    hadLocalState: false,
    loadedCloudState: false,
    onboardingComplete: false,
  }), true);
  assert.equal(isRecoveryGatePending(), true);

  completeRecoveryGate();
  assert.equal(isRecoveryGatePending(), false);
});

test('real local, cloud, or deliberately completed setup releases the recovery gate', () => {
  for (const evidence of [
    { hadLocalState: true },
    { loadedCloudState: true },
    { onboardingComplete: true },
  ]) {
    beginRecoveryGate();
    assert.equal(reconcileRecoveryGate(evidence), false);
    assert.equal(isRecoveryGatePending(), false);
  }
});

test('fresh boot cannot persist its empty scaffold before the user chooses a recovery path', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const state = await import('../js/state.js?recovery-welcome-test');
  globalThis.document = { dispatchEvent() {} };
  globalThis.CustomEvent ??= class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  };

  await state.pullEngineDataFromStorage();
  assert.equal(isRecoveryGatePending(), true);
  assert.equal(await state.saveStateToLocalStorage(true), false);
  assert.equal(store.has(state.STORAGE_KEY), false, 'blank boot state must not become a local returning profile');

  completeRecoveryGate();
  assert.equal(await state.saveStateToLocalStorage(true), true);
  assert.equal(store.has(state.STORAGE_KEY), true, 'deliberate setup may persist normally');
});

test('welcome exposes cloud and offline-file recovery before new-profile setup', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
  const state = await readFile(new URL('../js/state.js', import.meta.url), 'utf8');

  const gateway = html.indexOf('id="obRecoveryGateway"');
  const newProfile = html.indexOf('id="obNewProfileSetup"');
  assert.ok(gateway >= 0 && gateway < newProfile, 'recovery choices must precede new-profile fields');
  assert.match(html, /data-action="open-auth"[^]*Sign in and restore/);
  assert.match(html, /data-action="ob-import-backup"[^]*works offline/);
  assert.match(html, /id="onboardingImportFile"[^]*accept="\.json,application\/json"/);
  assert.match(app, /target\.id === 'settingsImportFile' \|\| target\.id === 'onboardingImportFile'/);

  const write = state.indexOf('function writeLocalNow()');
  const writeGate = state.indexOf('if (isRecoveryGatePending()) return false;', write);
  const serialize = state.indexOf('localStorage.setItem(STORAGE_KEY', write);
  assert.ok(writeGate > write && writeGate < serialize, 'blank local persistence must be blocked before serialization');

  const cloud = state.indexOf('async function cloudSave');
  const cloudGate = state.indexOf('if (isRecoveryGatePending())', cloud);
  const upsert = state.indexOf('.upsert({ user_id: uid, state_data: appState }', cloud);
  assert.ok(cloudGate > cloud && cloudGate < upsert, 'blank cloud persistence must be blocked before upsert');
});
