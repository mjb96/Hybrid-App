// =============================================================================
// ACTIVE RUN SURFACE (Phase 2C) — the wiring the pure model cannot prove.
//
// `active_run_display.test.js` proves the model is right. These tests prove the
// tracker and markup actually USE it: a correct unit conversion helps nobody if
// `tickStats` still writes raw kilometres, and a signal chip nothing renders is
// not a signal. They also hold the line on the defect this phase exists to fix
// — a live run being collapsed or reparented out from under the athlete by an
// unrelated re-render.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const tracker = read('js/gps-tracker.js');
const html = read('index.html');
const css = read('css/styles.css');
const workout = read('js/workout.js');
const runLogging = read('js/workout/run-logging.js');
const app = read('js/app.js');

test('the live stats are rendered through the shared display model', () => {
  assert.match(tracker, /activeRunStats\(\{[^}]*unit: runDistanceUnit\(appState\)/s);
  // The raw-km writes this phase replaced must not come back.
  assert.doesNotMatch(tracker, /textContent = _distKm\.toFixed/);
  assert.doesNotMatch(tracker, /fmtPace\(/);
});

test('both surfaces own every element the tracker writes', () => {
  // The scope map is the tracker's whole contract with the markup, and it drove
  // updates at a `qsStartPanel` that has never existed. A named ID must resolve;
  // a surface that genuinely lacks a panel says so with null.
  const scopes = tracker.match(/(cockpit|activity):\s*\{[^}]*\}/gs) || [];
  assert.equal(scopes.length, 2, 'expected exactly the cockpit and activity scopes');
  for (const scope of scopes) {
    const ids = [...scope.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    assert.ok(ids.length >= 10, `scope declares too few elements: ${scope}`);
    for (const id of ids) {
      assert.ok(
        html.includes(`id="${id}"`),
        `${id} is written by the tracker but absent from index.html`,
      );
    }
  }
});

test('the unit labels are elements, not hardcoded text', () => {
  // "DIST (KM)" was baked into the markup, so a miles athlete was mislabelled
  // even before the number was converted.
  assert.match(html, /id="gpsDistUnitLabel"/);
  assert.match(html, /id="gpsPaceUnitLabel"/);
  assert.match(html, /id="qsDistUnitLabel"/);
  assert.match(html, /id="qsPaceUnitLabel"/);
  assert.doesNotMatch(html, /DIST \(KM\)/);
  assert.match(tracker, /function applyUnitLabels\(\)/);
  // Applied when a panel opens, not only on the first stats tick.
  assert.match(tracker, /function showPanel\([^]*?applyUnitLabels\(\)[^]*?\n\}/);
});

test('the signal chip refreshes while paused, when the stats tick is stopped', () => {
  const pause = tracker.match(/export function pauseTracking\(\)[^]*?\n\}/)?.[0] || '';
  const resume = tracker.match(/export function resumeTracking\(\)[^]*?\n\}/)?.[0] || '';
  assert.match(pause, /tickSignal\(\)/);
  assert.match(resume, /tickSignal\(\)/);
});

test('every signal level the model can return is styled', () => {
  for (const level of ['searching', 'strong', 'fair', 'weak', 'lost', 'paused']) {
    assert.ok(
      css.includes(`.gps-signal[data-level="${level}"]`),
      `signal level ${level} has no styling`,
    );
  }
});

test('focus mode hides setup and import, and is scoped to the cockpit run card', () => {
  assert.match(tracker, /function applyRunFocusMode\(\)[^]*?_scope === 'cockpit' && isActiveRunSession\(_status\)/s);
  for (const selector of ['.run-grid-inputs', '.run-notes-input', '.fit-import-tile--run']) {
    assert.ok(
      css.includes(`#cockpitRunPanel.run-session-active ${selector}`),
      `${selector} still competes with the live run`,
    );
  }
});

test('a refused start is reported, not swallowed', () => {
  // startTracking returned a bare boolean that every caller ignored, so a
  // refused start left whatever screen had been opened for it sitting empty.
  assert.match(tracker, /return \{ ok: false, reason: 'permission' \}/);
  assert.match(tracker, /return \{ ok: false, reason: 'unsupported' \}/);
  assert.match(tracker, /return \{ ok: false, reason: 'native-busy' \}/);
  assert.match(tracker, /return \{ ok: true, reason: null \}/);
  assert.doesNotMatch(tracker, /^\s*return false;$/m);
});

test('the Quick Activity screen can never be left blank by a blocked start', () => {
  // It has no start panel, so showPanel('start') rendered nothing at all.
  const notice = tracker.match(/function showRunNotice\([^]*?\n\}/)?.[0] || '';
  assert.match(notice, /showPanel\(_scope === 'cockpit' \? 'start' : 'notice'\)/);
  assert.match(html, /id="qsNotice"/);
  assert.match(html, /id="qsNoticeTitle"/);
  assert.match(html, /id="qsNoticeBody"/);
  // And a way forward from it, since Cancel would throw the intent away.
  assert.match(html, /id="qsNoticeRetry"[^>]*data-action="qs-retry"/s);
  assert.match(app, /action === 'qs-retry'/);
});

test('retry repeats the same activity, not a default one', () => {
  // A blocked walk must not come back as a run.
  assert.match(app, /_lastQuickActivityType = kind/);
  assert.match(app, /function retryQuickActivity\(\)[^]*_lastQuickActivityType/s);
});

test('a mid-run position error does not tear down the run', () => {
  // The distance already recorded is real work; a dropout is not a reason to
  // discard it, and the signal chip reports the dropout on its own.
  const handler = tracker.match(/function onPositionError\([^]*?\n\}/)?.[0] || '';
  assert.match(handler, /if \(_status === 'tracking'\) \{ tickSignal\(\); return; \}/);
});

test('a recovered run is explained without being sent back to the start panel', () => {
  // A recovered session is still LIVE. Routing it through showRunNotice would
  // call showPanel('start') and take the running run off the screen.
  const info = tracker.match(/function showInfoNotice\([^]*?\n\}/)?.[0] || '';
  assert.ok(info, 'showInfoNotice must exist');
  assert.doesNotMatch(info, /showPanel\(/);
  assert.match(tracker, /showInfoNotice\(runRecoveryNotice\(\{ restored: p\.restored, status: p\.status \}\)\)/);
  // And the transient toast it replaced is gone.
  assert.doesNotMatch(tracker, /GPS kept tracking/);
});

test('the background-tracking truth is stated on both surfaces', () => {
  assert.match(html, /id="gpsBackgroundNote"/);
  assert.match(html, /id="qsBackgroundNote"/);
  assert.match(tracker, /function applyBackgroundNotice\(\)[^]*backgroundTrackingNotice\(\{ nativeAvailable: isNativeGpsAvailable\(\) \}\)/s);
  // Refreshed whenever a panel changes, so it is present before the phone is
  // pocketed and still there mid-run.
  assert.match(tracker, /function showPanel\([^]*?applyBackgroundNotice\(\)[^]*?\n\}/);
});

test('every notice kind the model emits is styled', () => {
  const notices = read('js/gps/run-notices.js');
  const kinds = [...notices.matchAll(/kind: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.ok(kinds.length >= 8, `expected the full set of kinds, got ${kinds.length}`);
  // Only the non-error kinds get their own treatment; the rest share the
  // default. What must never happen is a kind with no rule at all.
  assert.match(css, /\.gps-notice \{/);
  for (const kind of ['native-busy', 'journal-open', 'route-lost']) {
    assert.ok(css.includes(`.gps-notice[data-kind="${kind}"]`), `${kind} unstyled`);
  }
  assert.match(css, /\.gps-background-note\[data-kind="foreground-only"\]/);
});

test('a re-render cannot collapse or reparent a live run', () => {
  // `.run-collapsed` hides `.run-body-content` wholesale, and a re-render adds
  // it on any day with no scheduled run — which is exactly when an unscheduled
  // run is being tracked.
  assert.match(css, /\.run-collapsed \.run-body-content \{ display: none; \}/);
  assert.match(workout, /positionRunPanel\(\{ homeBlueprint, exercisesContainer \}\)/);
  assert.match(runLogging, /run-collapsed', !isRunScheduled && !runSessionLive/);
  assert.match(runLogging, /exercisesContainer && !runSessionLive/);
  assert.match(runLogging, /const runSessionLive = hasActiveRunSession\(\)/);
});
