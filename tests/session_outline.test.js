// =============================================================================
// SESSION OUTLINE — roadmap Phase 2A.
//
// The outline sits above the accordion answering "how much is left?". Its whole
// value depends on agreeing with the cards beneath it, so these tests pin the
// counting rules to the logger's own: warm-ups are not working sets, and a set
// counts as done only when isCompletedSet says so.
//
// An outline that over-promises remaining work, or congratulates someone for an
// empty session, is worse than no outline at all.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionOutline, outlineSummaryLine } from '../js/workout/session-outline.js';

const done = (w = 100, r = 5) => ({ c: true, w: String(w), r: String(r) });
const todo = (w = 100, r = 5) => ({ c: false, w: String(w), r: String(r) });
const warm = (w = 60, r = 5) => ({ c: true, w: String(w), r: String(r), type: 'W' });

test('counts working sets per exercise and overall', () => {
  const lifts = {
    Bench: [done(), done(), todo()],
    Squat: [todo(), todo()],
  };
  const o = buildSessionOutline(lifts, ['Bench', 'Squat']);
  assert.equal(o.entries.length, 2);
  assert.deepEqual(o.entries.map((e) => [e.name, e.done, e.total, e.remaining]), [
    ['Bench', 2, 3, 1],
    ['Squat', 0, 2, 2],
  ]);
  assert.equal(o.setsDone, 2);
  assert.equal(o.setsTotal, 5);
  assert.equal(o.setsRemaining, 3);
  assert.equal(o.exercisesDone, 0, 'neither exercise is finished');
  assert.equal(o.complete, false);
});

test('warm-ups are excluded, exactly as the logger excludes them', () => {
  // Three warm-ups plus two working sets must read as 2, not 5 — otherwise the
  // outline promises more remaining work than the card below it lists.
  const o = buildSessionOutline({ Bench: [warm(), warm(), warm(), done(), todo()] }, ['Bench']);
  assert.equal(o.entries[0].total, 2);
  assert.equal(o.entries[0].done, 1);
  assert.equal(o.entries[0].remaining, 1);
  assert.equal(o.setsTotal, 2);
});

test('an exercise is done only when every working set is', () => {
  const o = buildSessionOutline({
    Finished: [done(), done()],
    Nearly: [done(), done(), todo()],
  }, ['Finished', 'Nearly']);
  assert.equal(o.entries[0].status, 'done');
  assert.equal(o.entries[1].status, 'todo');
  assert.equal(o.exercisesDone, 1);
});

test('the active exercise is marked, but completion outranks it', () => {
  const lifts = { Bench: [done(), done()], Squat: [todo()] };
  const o = buildSessionOutline(lifts, ['Bench', 'Squat'], { activeLift: 'Squat' });
  assert.equal(o.entries.find((e) => e.name === 'Squat').status, 'active');

  // A finished exercise stays "done" even while it is the expanded card —
  // the user needs to see it is complete, not that it is selected.
  const o2 = buildSessionOutline(lifts, ['Bench', 'Squat'], { activeLift: 'Bench' });
  assert.equal(o2.entries.find((e) => e.name === 'Bench').status, 'done');
});

test('the outline follows the cockpit order, not object key order', () => {
  const lifts = { Zzz: [todo()], Aaa: [todo()], Mmm: [todo()] };
  const o = buildSessionOutline(lifts, ['Mmm', 'Zzz', 'Aaa']);
  assert.deepEqual(o.entries.map((e) => e.name), ['Mmm', 'Zzz', 'Aaa']);
});

test('an order naming a lift that no longer exists is ignored', () => {
  // Removing an exercise mid-session must not leave a phantom outline row.
  const o = buildSessionOutline({ Bench: [todo()] }, ['Bench', 'Deleted', 'AlsoGone']);
  assert.deepEqual(o.entries.map((e) => e.name), ['Bench']);
});

test('a missing or empty order falls back to whatever lifts exist', () => {
  const lifts = { Bench: [todo()], Squat: [done()] };
  assert.equal(buildSessionOutline(lifts, []).entries.length, 2);
  assert.equal(buildSessionOutline(lifts, null).entries.length, 2);
  assert.equal(buildSessionOutline(lifts, undefined).entries.length, 2);
});

test('non-array lift values never reach the outline', () => {
  const o = buildSessionOutline({ Bench: [todo()], Junk: 'not-an-array', Nope: null }, null);
  assert.deepEqual(o.entries.map((e) => e.name), ['Bench']);
});

// ---- honesty about empty and degenerate sessions -----------------------------

test('an empty session is empty, never complete', () => {
  const o = buildSessionOutline({}, []);
  assert.equal(o.empty, true);
  assert.equal(o.complete, false);
  assert.equal(o.setsTotal, 0);
  assert.match(outlineSummaryLine(o), /No exercises/);
});

test('exercises with no prescribed sets do not count as a finished session', () => {
  // Every exercise present but zero sets: completing nothing must not read as
  // "all complete".
  const o = buildSessionOutline({ Bench: [], Squat: [] }, ['Bench', 'Squat']);
  assert.equal(o.complete, false, 'an empty workout must not be congratulated');
  assert.equal(o.setsTotal, 0);
  assert.match(outlineSummaryLine(o), /no sets prescribed/);
});

test('a session of only warm-ups is not a completed session', () => {
  const o = buildSessionOutline({ Bench: [warm(), warm()] }, ['Bench']);
  assert.equal(o.setsTotal, 0);
  assert.equal(o.complete, false);
});

// ---- the summary line --------------------------------------------------------

test('the summary states remaining WORK, not a percentage', () => {
  const o = buildSessionOutline({ Bench: [done(), todo(), todo()], Squat: [todo()] }, ['Bench', 'Squat']);
  const line = outlineSummaryLine(o);
  assert.match(line, /3 sets left/);
  assert.match(line, /0 of 2 exercises done/);
  assert.doesNotMatch(line, /%/, 'a percentage is not actionable');
});

test('a fresh session says what there is to do', () => {
  const o = buildSessionOutline({ Bench: [todo(), todo()] }, ['Bench']);
  assert.equal(outlineSummaryLine(o), '2 sets to go.');
});

test('a finished session says so plainly', () => {
  const o = buildSessionOutline({ Bench: [done()], Squat: [done(), done()] }, ['Bench', 'Squat']);
  assert.equal(o.complete, true);
  assert.match(outlineSummaryLine(o), /All 2 exercises complete/);
});

test('singular and plural read correctly at every boundary', () => {
  assert.equal(outlineSummaryLine(buildSessionOutline({ Bench: [todo()] }, ['Bench'])), '1 set to go.');
  assert.match(outlineSummaryLine(buildSessionOutline({ Bench: [done()] }, ['Bench'])), /All 1 exercise complete/);
  const one = buildSessionOutline({ Bench: [done(), todo()], Squat: [done()] }, ['Bench', 'Squat']);
  assert.match(outlineSummaryLine(one), /1 set left/);
});
