// =============================================================================
// METRIC DETAIL CONTRACT — roadmap Phase 3C.
//
// Every detail screen must answer the same five questions. Running and Strength
// each hand-rolled the "How this is calculated" footer, which is exactly how
// they drifted: Running stated Confidence, Strength did not, and neither said
// how much interpretive weight a metric deserved. These tests hold the shared
// footer honest and prove no field silently disappears from either screen.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metricMethodHTML, exclusionNote, tierNote, REQUIRED_METHOD_ROWS,
} from '../js/analytics/views/metric-contract.js';

const base = {
  metricId: 'running.weekly-distance',
  calculation: 'Sum of dated run distances in the calendar week.',
  source: 'Independent run activities',
  confidence: 'Device-recorded',
  recordCount: 12,
  recordNoun: 'independent activity',
  exclusions: { future: 1, undated: 2 },
  limitations: ['Distance depends on GPS accuracy.'],
};

test('the footer renders every row the contract requires', () => {
  const html = metricMethodHTML(base);
  for (const row of REQUIRED_METHOD_ROWS) {
    assert.match(html, new RegExp(`<dt>${row}</dt>`), `missing contract row: ${row}`);
  }
  assert.match(html, /How this is calculated/);
  assert.match(html, /Sum of dated run distances/);
  assert.match(html, /GPS accuracy/);
});

test('a missing field degrades to an honest statement, never a blank row', () => {
  // The old hand-rolled footers simply omitted a row they had no value for,
  // which reads as "this metric has no such concern" rather than "unknown".
  const html = metricMethodHTML({ metricId: 'strength.acwr', calculation: '', source: '' });
  for (const row of REQUIRED_METHOD_ROWS) {
    assert.match(html, new RegExp(`<dt>${row}</dt>`), `missing contract row: ${row}`);
  }
  assert.match(html, /No calculation description is available/);
  assert.match(html, /Source not recorded/);
  assert.match(html, /No explicit confidence treatment/);
  assert.match(html, /Record count unavailable/);
  assert.doesNotMatch(html, /<dd><\/dd>/, 'no empty definition rows');
});

test('the footer states how much weight a metric deserves', () => {
  assert.match(metricMethodHTML(base), /Headline metric/);
  assert.match(metricMethodHTML({ ...base, metricId: 'hybrid.score' }), /Supporting metric/);
  assert.match(metricMethodHTML({ ...base, metricId: 'running.pace-heart-rate' }), /Diagnostic/);
  // An unclassified metric is described as advanced, matching tierFor's default.
  assert.match(metricMethodHTML({ ...base, metricId: 'strength.unknown-new' }), /Advanced metric/);
});

test('tierNote names the tier and explains what it means', () => {
  assert.match(tierNote('recovery.readiness'), /^Headline metric — /);
  assert.match(tierNote('recovery.monotony'), /^Diagnostic — /);
});

test('record counts are pluralised from the caller\'s own noun', () => {
  assert.match(metricMethodHTML({ ...base, recordCount: 1 }), /1 dated independent activity across/);
  // A noun that does not pluralise with a bare "s" supplies its own plural.
  assert.match(
    metricMethodHTML({ ...base, recordCount: 5, recordNounPlural: 'independent activities' }),
    /5 dated independent activities across/,
  );
  assert.match(metricMethodHTML({ ...base, recordCount: 3, recordNoun: 'strength workout' }), /3 dated strength workouts across/);
  // Zero is a real count, not missing data.
  assert.match(
    metricMethodHTML({ ...base, recordCount: 0, recordNounPlural: 'independent activities' }),
    /0 dated independent activities across/,
  );
});

test('exclusions list every category, including domain-specific ones', () => {
  assert.equal(exclusionNote({ future: 1, undated: 2 }), '1 future · 2 undated');
  assert.equal(exclusionNote({}), 'No future or undated records found.');
  assert.equal(exclusionNote({ future: 0, undated: 0 }), 'No future or undated records found.');
  // Running's pace-ineligible category must survive the move to a shared
  // footer — dropping it would quietly lose a real exclusion.
  assert.equal(
    exclusionNote({ future: 1 }, ['3 pace-ineligible']),
    '1 future · 3 pace-ineligible',
  );
  assert.equal(exclusionNote({}, ['3 pace-ineligible']), '3 pace-ineligible');
});

test('caller-supplied text is escaped, not injected', () => {
  const html = metricMethodHTML({
    ...base,
    calculation: '<script>alert(1)</script>',
    source: 'a "quoted" & <b>bold</b> source',
    limitations: ['<img src=x onerror=1>'],
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;quoted&quot; &amp; &lt;b&gt;/);
});

// ---- the real screens still satisfy the contract ----------------------------

const noop = () => {};
const store = new Map();
function makeEl(id) {
  const e = {
    id: id || '', setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    appendChild: (c) => c, insertBefore: (c) => c, removeChild: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], closest: () => null, contains: () => false, click: noop,
    focus: noop, style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, children: [],
  };
  let h = '';
  Object.defineProperty(e, 'innerHTML', { get: () => h, set: (x) => { h = String(x); } });
  Object.defineProperty(e, 'textContent', { get: () => '', set: noop });
  return e;
}
const getEl = (id) => { if (!store.has(id)) store.set(id, makeEl(id)); return store.get(id); };

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const work = (w, r) => ({ c: true, w, r });

test('both real detail screens render the full contract footer', async () => {
  globalThis.document = {
    getElementById: getEl, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => makeEl(), addEventListener: noop, body: makeEl('body'),
  };
  const vsm = await import('../js/analytics/views/view-strength-metric.js');
  const vrm = await import('../js/analytics/views/view-running-metric.js');

  const state = {
    settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    currentWeek: '1',
    weeks: { '1': {
      dates: { mon: '2026-07-13' },
      lifts: { mon: { 'Barbell Bench Press': [work(100, 5), work(100, 5)] } },
      runs: { tue: { dist: '5.0', time: '25:00' } },
    } },
  };

  vsm.renderStrengthMetricDetail(state, { id: 'strength.muscle-set-credits', name: 'Muscle Set Credits' });
  const strength = getEl('strengthMetricDetail').innerHTML;
  for (const row of REQUIRED_METHOD_ROWS) {
    assert.match(strength, new RegExp(`<dt>${row}</dt>`), `strength detail missing: ${row}`);
  }
  assert.doesNotMatch(strength, /NaN|Infinity|undefined/);

  vrm.renderRunningMetricDetail(state, { id: 'running.weekly-distance', name: 'Weekly Distance' });
  const running = getEl('runningMetricDetail').innerHTML;
  for (const row of REQUIRED_METHOD_ROWS) {
    assert.match(running, new RegExp(`<dt>${row}</dt>`), `running detail missing: ${row}`);
  }
  assert.doesNotMatch(running, /NaN|Infinity|undefined/);
});
