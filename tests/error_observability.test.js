// =============================================================================
// ERROR OBSERVABILITY + overtraining escalation gating.
//
// The overtraining card once died from a swallowed ReferenceError. These tests
// lock in that (1) intentionally-caught errors are never silent, and (2) the
// escalation only fires on genuinely stacked signals and clears when they do.
// =============================================================================
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { reportHandledError, renderSafely, _setErrorHook } from '../js/monitoring/report-error.js';
import { assessOvertrainingRisk } from '../js/brain/risk.js';
import { buildMorningBriefing } from '../js/brain/morning-briefing.js';

afterEach(() => _setErrorHook(null));

test('reportHandledError is observable (never silent)', () => {
  const seen = [];
  _setErrorHook((ctx, err) => seen.push([ctx, err.message]));
  // Silence the console.error for a clean test log while still exercising it.
  const orig = console.error; let logged = 0; console.error = () => { logged++; };
  try {
    reportHandledError('unit:test', new Error('boom'));
  } finally { console.error = orig; }
  assert.equal(logged, 1, 'must log to console.error');
  assert.deepEqual(seen, [['unit:test', 'boom']]);
});

test('renderSafely returns the value on success and does not report', () => {
  const seen = [];
  _setErrorHook((ctx) => seen.push(ctx));
  const out = renderSafely('ok', () => 42, -1);
  assert.equal(out, 42);
  assert.equal(seen.length, 0);
});

test('renderSafely reports a thrown render AND returns the fallback (card degrades, not silent)', () => {
  const seen = [];
  _setErrorHook((ctx, err) => seen.push([ctx, err.message]));
  const orig = console.error; console.error = () => {};
  let out;
  try {
    out = renderSafely('home:overtraining-card', () => { throw new Error('render fault'); }, false);
  } finally { console.error = orig; }
  assert.equal(out, false, 'degrades to the fallback');
  assert.deepEqual(seen, [['home:overtraining-card', 'render fault']], 'and is observable');
});

test('a failing coach-evidence build is reported AND the briefing still renders', () => {
  // The evidence builder throwing must NOT take down the whole briefing, but the
  // failure must be observable (not swallowed) — the exact lesson of the dead card.
  const seen = [];
  _setErrorHook((ctx, err) => seen.push([ctx, err.message]));
  const orig = console.error; console.error = () => {};
  let brief;
  try {
    const model = {
      rec: { headline: 'Push', advice: 'Go', severity: 'neutral', badge: '' },
      ready: { hasData: false },
      get load() { throw new Error('load boom'); }, // only coach-evidence reads model.load
      streak: { current: 0 }, fasting: { active: false },
    };
    brief = buildMorningBriefing({ state: { currentWeek: '1', weeks: {}, settings: {} },
      model, score: { score: 50 }, program: null, selectedDay: 'mon',
      now: new Date('2026-06-18T09:00:00Z'), days: ['mon'] });
  } finally { console.error = orig; }
  assert.ok(brief && brief.coach, 'briefing degrades gracefully — coach still present');
  assert.equal(brief.coach.evidence, null, 'evidence is null, not a crash');
  assert.deepEqual(seen, [['briefing:coach-evidence', 'load boom']], 'failure is observable');
});

// ---- escalation gating -----------------------------------------------------
const baseState = { currentWeek: '1', weeks: {} };

test('escalation does NOT fire from one weak signal', () => {
  const model = { load: { hasData: true, acwr: 1.3, tsb: 0 }, ready: { hasData: true, score: 70 } };
  const a = assessOvertrainingRisk(model, baseState, ['mon']);
  assert.equal(a.level, 'none', 'a single elevated-load signal is not an escalation');
});

test('missing readiness data does NOT create a false escalation', () => {
  const model = { load: { hasData: true, acwr: 1.0, tsb: 0 }, ready: { hasData: false } };
  const a = assessOvertrainingRisk(model, baseState, ['mon']);
  assert.equal(a.level, 'none');
});

test('escalation fires on a load spike, then CLEARS when the signal resolves', () => {
  const high = assessOvertrainingRisk({ load: { hasData: true, acwr: 1.6, tsb: -10 }, ready: { hasData: true, score: 70 } }, baseState, ['mon']);
  assert.equal(high.level, 'high');
  assert.ok(high.signals.some(s => s.key === 'acwrSpike'));

  const resolved = assessOvertrainingRisk({ load: { hasData: true, acwr: 1.0, tsb: 5 }, ready: { hasData: true, score: 75 } }, baseState, ['mon']);
  assert.equal(resolved.level, 'none', 'clears once load settles');
  assert.equal(resolved.signals.length, 0);
});
