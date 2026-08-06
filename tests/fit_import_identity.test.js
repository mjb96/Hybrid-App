// =============================================================================
// FIT IMPORT — DATE ATTRIBUTION AND DUPLICATE DETECTION
//
// Two defects this pins, both of which quietly corrupted date-strict analytics:
//
//  1. The importer never read the activity's start time, so an imported run was
//     stamped with whichever day the cockpit happened to be showing. Import last
//     Tuesday's run today and it was logged as today — and since every weekly
//     aggregate, streak, calendar week and load model attributes by the stamped
//     date, all of them inherited the wrong day.
//
//  2. Nothing identified an activity, so re-importing the same file appended a
//     second identical run, double-counting distance and load in every total.
//
// The natural key is the activity's own start timestamp: two activities cannot
// begin at the same millisecond.
// =============================================================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSessionStats, sessionStartTs, extractData } from '../js/garmin.js';
import { findImportedRunSession, upsertRunSession } from '../js/state/run-sessions.js';

const START = Date.UTC(2026, 6, 14, 6, 30, 0); // 2026-07-14T06:30:00Z

function runFixture(sessionExtra = {}) {
  return {
    sessions: [{
      total_distance: 10.5,
      total_timer_time: 3000,
      avg_heart_rate: 150,
      ...sessionExtra,
    }],
    laps: [],
    records: [],
  };
}

// ── Extraction ───────────────────────────────────────────────────────────────

test('start_time is read as the activity start', () => {
  const r = extractSessionStats(runFixture({ start_time: new Date(START) }), true);
  assert.equal(r.ok, true);
  assert.equal(r.stats.startTs, START);
});

test('an ISO string or epoch start_time is accepted', () => {
  assert.equal(
    extractSessionStats(runFixture({ start_time: new Date(START).toISOString() }), true).stats.startTs,
    START,
  );
  assert.equal(
    extractSessionStats(runFixture({ start_time: START }), true).stats.startTs,
    START,
  );
});

test('a session timestamp is the END of the activity, so the duration is subtracted', () => {
  // FIT writes `timestamp` at the end of the session. Using it raw would date a
  // late-evening activity into the following day.
  const end = START + 3000 * 1000;
  const r = extractSessionStats(runFixture({ timestamp: new Date(end) }), true);
  assert.equal(r.stats.startTs, START, 'end timestamp minus 3000s of timer time');
});

test('start_time wins over timestamp when both are present', () => {
  const r = extractSessionStats(runFixture({
    start_time: new Date(START),
    timestamp: new Date(START + 9_999_000),
  }), true);
  assert.equal(r.stats.startTs, START);
});

test('a missing or unusable timestamp yields null, never a fabricated date', () => {
  assert.equal(extractSessionStats(runFixture(), true).stats.startTs, null);
  for (const bad of [null, undefined, '', 'not-a-date', NaN, {}, []]) {
    assert.equal(
      extractSessionStats(runFixture({ start_time: bad }), true).stats.startTs,
      null,
      `start_time ${JSON.stringify(bad)} must not produce a timestamp`,
    );
  }
});

test('implausible timestamps are refused rather than dating an import to 1989', () => {
  // A garbled epoch or a device clock left unset must not silently create a
  // decades-old activity that then reshapes every all-time total.
  assert.equal(sessionStartTs({ start_time: new Date(Date.UTC(1989, 0, 1)) }), null);
  assert.equal(sessionStartTs({ start_time: 0 }), null);
  const farFuture = new Date(Date.now() + 400 * 86400000);
  assert.equal(sessionStartTs({ start_time: farFuture }), null);
  // A timestamp a few hours ahead (device clock skew / timezone edge) is kept.
  const soon = new Date(Date.now() + 3600_000);
  assert.equal(sessionStartTs({ start_time: soon }), soon.getTime());
});

test('extraction still works for gym files', () => {
  const gym = { sessions: [{ total_timer_time: 2400, total_calories: 300, start_time: new Date(START) }] };
  const r = extractSessionStats(gym, false);
  assert.equal(r.ok, true);
  assert.equal(r.stats.startTs, START);
});

// ── Duplicate detection ──────────────────────────────────────────────────────

function stateWithImportedRun(startTs, { weekKey = '1', day = 'tue', localDate = '2026-07-14' } = {}) {
  const state = { weeks: { [weekKey]: { dates: { [day]: localDate }, runs: {}, runSessions: {} } } };
  upsertRunSession(state.weeks[weekKey], day, { dist: '10.50', time: '50:00' }, {
    sessionId: 'run_seed', source: 'fit', localDate, startTs,
  });
  return state;
}

test('an already-imported activity is found by its start timestamp', () => {
  const state = stateWithImportedRun(START);
  const hit = findImportedRunSession(state, START);
  assert.ok(hit, 'the seeded import must be found');
  assert.equal(hit.weekKey, '1');
  assert.equal(hit.day, 'tue');
  assert.equal(hit.session.localDate, '2026-07-14');
});

test('a different activity is not mistaken for a duplicate', () => {
  const state = stateWithImportedRun(START);
  assert.equal(findImportedRunSession(state, START + 1000), null);
  assert.equal(findImportedRunSession(state, null), null);
  assert.equal(findImportedRunSession(state, undefined), null);
  assert.equal(findImportedRunSession(state, 0), null);
});

test('a re-import is detected even after the program run was archived', () => {
  // A program switch moves weeks to `arch:<id>:<n>` keys inside state.weeks.
  // Dedup must scan those too, or switching programs would silently re-enable
  // duplicate imports of everything already logged.
  const state = stateWithImportedRun(START, { weekKey: 'arch:old-activation:3' });
  const hit = findImportedRunSession(state, START);
  assert.ok(hit, 'archived weeks must still be searched');
  assert.equal(hit.weekKey, 'arch:old-activation:3');
});

test('a live-tracked GPS run never blocks a file import', () => {
  // Matching is scoped to the import source, so a run tracked in-app that
  // happens to share a start time is not treated as the same record.
  const state = { weeks: { '1': { dates: {}, runs: {}, runSessions: {} } } };
  upsertRunSession(state.weeks['1'], 'tue', { dist: '5.00', time: '25:00' }, {
    sessionId: 'run_gps', source: 'gps', localDate: '2026-07-14', startTs: START,
  });
  assert.equal(findImportedRunSession(state, START), null, 'source must be part of the identity');
  assert.ok(findImportedRunSession(state, START, 'gps'));
});

test('malformed state never throws', () => {
  for (const bad of [null, undefined, {}, { weeks: null }, { weeks: { '1': null } }, { weeks: { '1': { runSessions: 'x' } } }]) {
    assert.equal(findImportedRunSession(bad, START), null);
  }
  const partial = { weeks: { '1': { runSessions: { tue: [null, 'x', {}] } } } };
  assert.equal(findImportedRunSession(partial, START), null);
});

// ── The destination contract ─────────────────────────────────────────────────

test('a declined re-import is not reported as a successful import', () => {
  const toasts = [];
  const toast = (msg, isError) => toasts.push({ msg, isError });
  return extractData(runFixture({ start_time: new Date(START) }), true,
    async () => ({ handled: true }), toast,
  ).then((ok) => {
    assert.equal(ok, false, 'a refused import must not return success');
    assert.deepEqual(toasts, [], 'the destination already explained; no generic toast may overwrite it');
  });
});

test('a genuine failure is still reported as a failure', async () => {
  const toasts = [];
  const ok = await extractData(runFixture({ start_time: new Date(START) }), true,
    async () => false, (msg, isError) => toasts.push({ msg, isError }));
  assert.equal(ok, false);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].msg, /failed/i);
  assert.equal(toasts[0].isError, true);
});

test('a successful import still reports success', async () => {
  const toasts = [];
  const ok = await extractData(runFixture({ start_time: new Date(START) }), true,
    async () => true, (msg) => toasts.push(msg));
  assert.equal(ok, true);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Imported/i);
});
