// =============================================================================
// RUN NOTICES (Phase 2C) — the states that are not the run.
//
// The rule these tests hold is that a notice describes a CONDITION the athlete
// can act on. Every one names what is true, what it means for this run, and the
// one next step — and the three geolocation failures, which used to collapse
// into a single "GPS unavailable" message, stay distinguishable: only the
// athlete can undo a denied permission, and only the sky fixes a lost fix.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backgroundTrackingNotice, locationErrorNotice, runRecoveryNotice, runSaveNotice,
  startBlockedNotice,
} from '../js/gps/run-notices.js';

/** Every notice must be renderable and actionable, whatever produced it. */
function assertWellFormed(notice, label) {
  assert.ok(notice, `${label}: expected a notice`);
  assert.ok(notice.title && notice.title.length > 0, `${label}: needs a title`);
  assert.ok(notice.body && notice.body.length > 20, `${label}: needs a real explanation`);
  assert.equal(typeof notice.retry, 'boolean', `${label}: retry must be decided`);
  assert.ok(notice.kind, `${label}: needs a kind for styling`);
  // Never blame the athlete, and never leave them with only a restatement.
  assert.doesNotMatch(notice.body, /you (failed|forgot|should have)/i, `${label}: blames the athlete`);
}

// ── Geolocation failures ────────────────────────────────────────────────────

test('the three geolocation failures stay distinguishable', () => {
  const denied = locationErrorNotice(1);
  const unavailable = locationErrorNotice(2);
  const timeout = locationErrorNotice(3);
  for (const [n, label] of [[denied, 'denied'], [unavailable, 'unavailable'], [timeout, 'timeout']]) {
    assertWellFormed(n, label);
  }
  const kinds = new Set([denied.kind, unavailable.kind, timeout.kind]);
  assert.equal(kinds.size, 3, 'the three causes must not collapse into one message');
  const bodies = new Set([denied.body, unavailable.body, timeout.body]);
  assert.equal(bodies.size, 3);
});

test('a denied permission tells the athlete where to undo it', () => {
  const n = locationErrorNotice(1);
  assert.equal(n.kind, 'permission');
  // Only the athlete can lift this, so the notice must point at settings.
  assert.match(n.body, /settings/i);
  assert.equal(n.retry, true);
});

test('a lost or slow fix offers the manual route out', () => {
  for (const code of [2, 3]) {
    assert.match(locationErrorNotice(code).body, /distance and time/i);
  }
});

test('an unrecognised error still produces something renderable', () => {
  for (const code of [undefined, null, 0, 99, 'nonsense']) {
    assertWellFormed(locationErrorNotice(/** @type {any} */ (code)), `code ${code}`);
  }
});

// ── Blocked starts ──────────────────────────────────────────────────────────

test('a blocked start names its cause, and an unblocked one says nothing', () => {
  assertWellFormed(startBlockedNotice('permission'), 'permission');
  assertWellFormed(startBlockedNotice('unsupported'), 'unsupported');
  assertWellFormed(startBlockedNotice('native-busy'), 'native-busy');
  assert.equal(startBlockedNotice(null), null);
  assert.equal(startBlockedNotice('anything-else'), null);
});

test('a blocked start reuses the permission wording rather than inventing a second one', () => {
  assert.deepEqual(startBlockedNotice('permission'), locationErrorNotice(1));
});

test('the states nothing can retry do not offer a retry', () => {
  // Retrying an unsupported browser or a busy recovery journal just fails
  // again — the notice says what to do instead.
  assert.equal(startBlockedNotice('unsupported').retry, false);
  assert.equal(startBlockedNotice('native-busy').retry, false);
});

test('a protected recovery run is not framed as a failure', () => {
  const n = startBlockedNotice('native-busy');
  assert.doesNotMatch(n.title + n.body, /error|failed|lost/i);
  assert.match(n.body, /finish or discard/i);
});

// ── Background tracking ─────────────────────────────────────────────────────

test('the web build admits it stops when the app leaves the foreground', () => {
  const web = backgroundTrackingNotice({ nativeAvailable: false });
  assert.equal(web.kind, 'foreground-only');
  assert.match(web.text, /lock the screen/i);
});

test('the Android build states that it keeps recording', () => {
  const native = backgroundTrackingNotice({ nativeAvailable: true });
  assert.equal(native.kind, 'background');
  assert.match(native.text, /screen off/i);
  assert.notEqual(native.text, backgroundTrackingNotice({ nativeAvailable: false }).text);
});

test('background tracking defaults to the honest, weaker claim', () => {
  // An unknown platform must not promise background recording it may not have.
  assert.equal(backgroundTrackingNotice().kind, 'foreground-only');
  assert.equal(backgroundTrackingNotice({}).kind, 'foreground-only');
});

// ── Recovery / replay ───────────────────────────────────────────────────────

test('a recovery says whether anything is missing', () => {
  // This is the only thing the athlete cannot work out for themselves, and the
  // fact they need when the run disagrees with their watch.
  const lossless = runRecoveryNotice({ restored: false });
  const partial = runRecoveryNotice({ restored: true });
  assertWellFormed(lossless, 'lossless');
  assertWellFormed(partial, 'partial');
  assert.match(lossless.body, /nothing is missing/i);
  assert.match(partial.body, /may be missing/i);
  assert.notEqual(lossless.kind, partial.kind);
});

test('a recovery caught mid-save asks for the one action that finishes it', () => {
  const n = runRecoveryNotice({ restored: true, status: 'FINALIZING' });
  assert.equal(n.kind, 'recovered-finalizing');
  assert.match(n.body, /finish/i);
  // FINALIZING outranks the partial-loss wording: saving it is what matters now.
  assert.notEqual(n.kind, runRecoveryNotice({ restored: true }).kind);
});

test('a recovery never offers a retry — the run is already running', () => {
  for (const input of [{}, { restored: true }, { status: 'FINALIZING' }]) {
    assert.equal(runRecoveryNotice(input).retry, false);
  }
});

// ── Save outcomes ───────────────────────────────────────────────────────────

test('an ordinary save produces no notice at all', () => {
  assert.equal(runSaveNotice({}), null);
  assert.equal(runSaveNotice(), null);
  assert.equal(runSaveNotice({
    stateSaved: true, routeSaved: true, journalCleared: true, hadRoute: true,
  }), null);
});

test('a run with no route is not reported as having lost one', () => {
  // A manual-distance finish or a run stopped before the first fix has no
  // route to save; claiming the map was lost would be a false alarm.
  assert.equal(runSaveNotice({ hadRoute: false, routeSaved: false }), null);
});

test('a lost route says exactly what survived', () => {
  const n = runSaveNotice({ hadRoute: true, routeSaved: false });
  assertWellFormed(n, 'route-lost');
  assert.equal(n.kind, 'route-lost');
  assert.match(n.body, /distance, time and splits/i);
});

test('an unsaved run on Android says the run is not lost', () => {
  // The Android journal still holds it — the difference between "not saved
  // yet" and "gone" is the only thing the athlete cares about here.
  const n = runSaveNotice({ stateSaved: false, nativeProtected: true });
  assertWellFormed(n, 'not-saved native');
  assert.match(n.body, /not lost/i);
  const web = runSaveNotice({ stateSaved: false, nativeProtected: false });
  assert.notEqual(web.body, n.body);
  assert.match(web.body, /space/i);
});

test('save outcomes are reported in severity order', () => {
  // Losing the whole run outranks losing its map, which outranks a journal
  // that could not be closed.
  assert.equal(runSaveNotice({
    stateSaved: false, routeSaved: false, journalCleared: false,
  }).kind, 'not-saved');
  assert.equal(runSaveNotice({
    stateSaved: true, routeSaved: false, journalCleared: false,
  }).kind, 'route-lost');
  assert.equal(runSaveNotice({
    stateSaved: true, routeSaved: true, journalCleared: false,
  }).kind, 'journal-open');
});

test('no save notice asks the athlete to retry a finished run', () => {
  // The run is already over; a "Try again" here would suggest re-finishing it.
  for (const outcome of [
    { stateSaved: false }, { routeSaved: false }, { journalCleared: false },
  ]) {
    assert.equal(runSaveNotice(outcome).retry, false, JSON.stringify(outcome));
  }
});
