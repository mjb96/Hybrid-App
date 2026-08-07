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

test('a re-render cannot collapse or reparent a live run', () => {
  // `.run-collapsed` hides `.run-body-content` wholesale, and a re-render adds
  // it on any day with no scheduled run — which is exactly when an unscheduled
  // run is being tracked.
  assert.match(css, /\.run-collapsed \.run-body-content \{ display: none; \}/);
  assert.match(workout, /run-collapsed', !isRunScheduled && !runSessionLive/);
  assert.match(workout, /exercisesContainer && !runSessionLive/);
  assert.match(workout, /const runSessionLive = hasActiveRunSession\(\)/);
});
