// ==========================================
// BRIDGE INPUT-VALIDATION TEST (tests/bridge_input.test.js)
// ------------------------------------------
// The Android bridges echo a JS-supplied callback id back into
// evaluateJavascript(). This proves:
//   (1) the ids the web layer generates are always within the native allowlist
//       (BridgeSafe.callbackId — [A-Za-z0-9_-]{1,64}); and
//   (2) the shared regex actually rejects injection-shaped strings.
// If native ever tightened its alphabet, (1) would catch the drift here.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeBridgeCallbackId, BRIDGE_CALLBACK_ID_RE } from '../js/util/bridge-callback-id.js';

test('generated callback ids are always native-safe', () => {
  for (let i = 0; i < 5000; i++) {
    const id = makeBridgeCallbackId(i % 2 ? 'perm' : 'n');
    assert.match(id, BRIDGE_CALLBACK_ID_RE, `unsafe id generated: ${id}`);
  }
});

test('generated ids are unique enough to not collide back-to-back', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(makeBridgeCallbackId('n'));
  // Allow a tiny theoretical collision margin; in practice this is 2000.
  assert.ok(seen.size > 1990, `too many id collisions: ${seen.size}/2000`);
});

test('prefix is sanitised so a hostile prefix cannot break out', () => {
  const id = makeBridgeCallbackId("x');alert(1);//");
  assert.match(id, BRIDGE_CALLBACK_ID_RE);
});

test('allowlist regex rejects injection-shaped ids', () => {
  for (const bad of [
    "a'];alert(1);//",
    'a b',
    'a"b',
    'a;b',
    '',
    'x'.repeat(65),
    "'+document.cookie+'",
  ]) {
    assert.ok(!BRIDGE_CALLBACK_ID_RE.test(bad), `should reject: ${bad}`);
  }
});
