// =============================================================================
// SESSION REVIEW (Phase 2B) — notable progress at the moment of finishing.
//
// The risk worth pinning is not "does it find a PR" but "does it agree with the
// rest of the app". A new best shown here that the Strength screen does not also
// show would be worse than showing nothing, so this reuses the canonical
// primitives and the tests hold it to their rules: warm-ups and zero-rep rows
// are not training, bodyweight/band work has no comparable load, a first-ever
// log is a baseline rather than a record, and the shared 0.5 epsilon decides
// what counts as a change.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionReview, reviewHighlightLine } from '../js/workout/session-review.js';
import { E1RM_PR_EPSILON } from '../js/strength/e1rm.js';

const set = (w, r, extra = {}) => ({ c: true, w: String(w), r: String(r), ...extra });

/** Two-week state: week 1 is history, week 2 is the session being finished. */
function stateWith(prior, current, { priorDate = '2026-07-01', date = '2026-07-08' } = {}) {
  return {
    activeActivationId: 'a1',
    weeks: {
      '1': { activationId: 'a1', dates: { mon: priorDate }, lifts: { mon: prior } },
      '2': { activationId: 'a1', dates: { mon: date }, lifts: { mon: current } },
    },
  };
}

const review = (state, liftNames) =>
  buildSessionReview(state, { weekKey: '2', day: 'mon', liftNames });

// ── Completed work ───────────────────────────────────────────────────────────

test('volume and set counts exclude warm-ups and zero-rep rows', () => {
  const r = review(stateWith({}, {
    'Barbell Bench Press': [
      set(100, 5),
      set(100, 5),
      set(60, 10, { type: 'W' }),        // warm-up
      set(100, 0),                        // zero reps — not training
      { c: false, w: '100', r: '5' },     // unticked
    ],
  }));
  assert.equal(r.workingSets, 2);
  assert.equal(r.volume, 1000);
  assert.equal(r.exercisesWorked, 1);
});

test('an exercise with no completed working sets is not counted', () => {
  const r = review(stateWith({}, {
    'Barbell Bench Press': [set(100, 5)],
    'Back Squat': [set(140, 8, { type: 'W' })],   // warm-ups only
  }));
  assert.equal(r.exercisesWorked, 1);
  assert.equal(r.workingSets, 1);
});

// ── Notable progress ─────────────────────────────────────────────────────────

test('beating a previous best is reported with the gain', () => {
  const r = review(stateWith(
    { 'Barbell Bench Press': [set(100, 5)] },   // prior: e1RM 116.67
    { 'Barbell Bench Press': [set(105, 5)] },   // now:   e1RM 122.5
  ));
  assert.equal(r.highlights.length, 1);
  const [h] = r.highlights;
  assert.equal(h.lift, 'Barbell Bench Press');
  assert.ok(Math.abs(h.e1rm - 122.5) < 0.01);
  assert.ok(Math.abs(h.previousBest - 116.6667) < 0.01);
  assert.ok(h.delta > 5);
});

test('a first-ever log is a baseline, not a record', () => {
  // Otherwise a new user's first session fires a trophy on every exercise.
  const r = review(stateWith({}, { 'Barbell Bench Press': [set(100, 5)] }));
  assert.deepEqual(r.highlights, []);
});

test('matching a previous best is not a record', () => {
  const r = review(stateWith(
    { 'Barbell Bench Press': [set(100, 5)] },
    { 'Barbell Bench Press': [set(100, 5)] },
  ));
  assert.deepEqual(r.highlights, [], 'an exact tie must not fire a trophy');
});

test('a gain smaller than the shared epsilon is not a record', () => {
  // The displayed value is rounded, so a difference too small to see must not
  // claim a best. Uses the same threshold as every other PR site.
  const state = stateWith(
    { 'Barbell Bench Press': [set(100, 1)] },        // e1RM 100 (a single is the load)
    { 'Barbell Bench Press': [set(100 + E1RM_PR_EPSILON / 2, 1)] },
  );
  assert.deepEqual(review(state).highlights, []);
});

test('a regression is never reported as progress', () => {
  const r = review(stateWith(
    { 'Barbell Bench Press': [set(120, 5)] },
    { 'Barbell Bench Press': [set(100, 5)] },
  ));
  assert.deepEqual(r.highlights, []);
});

test('bodyweight, assisted and band work produce no fabricated best', () => {
  const r = review(stateWith({}, {
    'Pull-Up': [set(0, 10, { bw: true }), set(0, 8, { bw: true })],
    'Band Face Pull': [set(0, 20, { band: true })],
  }));
  assert.deepEqual(r.highlights, [], 'no comparable external load, so no record');
  assert.equal(r.exercisesWorked, 2, 'the work still counts as work');
});

test('a warm-up cannot set a record', () => {
  const r = review(stateWith(
    { 'Barbell Bench Press': [set(100, 5)] },
    { 'Barbell Bench Press': [set(200, 5, { type: 'W' }), set(90, 5)] },
  ));
  assert.deepEqual(r.highlights, [], 'the 200kg row is a warm-up and must be ignored');
});

test('the previous best spans archived program runs', () => {
  // A personal best is a fact about the athlete, not the program. Switching
  // programs must not hand out fresh "records" for lifts already beaten.
  const state = {
    activeActivationId: 'new',
    weeks: {
      'arch:old:3': { activationId: 'old', dates: { mon: '2026-06-01' }, lifts: { mon: { 'Back Squat': [set(180, 3)] } } },
      '2': { activationId: 'new', dates: { mon: '2026-07-08' }, lifts: { mon: { 'Back Squat': [set(150, 3)] } } },
    },
  };
  assert.deepEqual(
    buildSessionReview(state, { weekKey: '2', day: 'mon' }).highlights,
    [],
    'the archived 180kg squat is still the best to beat',
  );
});

test('multiple records are ordered by the size of the gain', () => {
  const r = review(stateWith(
    { 'Barbell Bench Press': [set(100, 5)], 'Back Squat': [set(140, 5)] },
    { 'Barbell Bench Press': [set(102, 5)], 'Back Squat': [set(160, 5)] },
  ));
  assert.equal(r.highlights.length, 2);
  assert.equal(r.highlights[0].lift, 'Back Squat', 'the biggest gain leads');
});

test('liftNames scopes the review to this session', () => {
  const state = stateWith({}, {
    'Barbell Bench Press': [set(100, 5)],
    'Swapped-Out Exercise': [set(50, 5)],
  });
  const r = review(state, ['Barbell Bench Press']);
  assert.equal(r.exercisesWorked, 1);
  assert.equal(r.volume, 500);
});

// ── Presentation ─────────────────────────────────────────────────────────────

test('the highlight line is empty when nothing was beaten', () => {
  assert.equal(reviewHighlightLine({ highlights: [] }), '');
  assert.equal(reviewHighlightLine({}), '');
  assert.equal(reviewHighlightLine(null), '');
});

test('the highlight line names the lift and the gain', () => {
  assert.match(
    reviewHighlightLine({ highlights: [{ lift: 'Back Squat', delta: 5 }] }),
    /Back Squat/,
  );
  assert.match(
    reviewHighlightLine({ highlights: [{ lift: 'Back Squat', delta: 5 }, { lift: 'Bench', delta: 2 }] }),
    /and 1 more/,
  );
});

// ── Degenerate input ─────────────────────────────────────────────────────────

test('missing or malformed state never throws', () => {
  for (const bad of [null, undefined, {}, { weeks: null }, { weeks: { '2': null } }]) {
    const r = buildSessionReview(bad, { weekKey: '2', day: 'mon' });
    assert.equal(r.workingSets, 0);
    assert.deepEqual(r.highlights, []);
  }
  const junk = { weeks: { '2': { lifts: { mon: { 'X': 'not-an-array' } } } } };
  assert.equal(buildSessionReview(junk, { weekKey: '2', day: 'mon' }).exercisesWorked, 0);
});

test('an empty session reviews as empty, never as an achievement', () => {
  const r = review(stateWith({ 'Barbell Bench Press': [set(100, 5)] }, {}));
  assert.equal(r.workingSets, 0);
  assert.equal(r.volume, 0);
  assert.deepEqual(r.highlights, []);
});
