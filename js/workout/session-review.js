// @ts-check
// =============================================================================
// SESSION REVIEW — what the athlete actually achieved, at the moment of finishing.
//
// The finish sheet showed Total Volume and Sets Completed and then asked for
// duration and RPE: three inputs and two numbers, which reads as a form to
// complete rather than a session to review. Nothing told the athlete they had
// just hit a best.
//
// Worse, it could not have: `updateExercisePRs()` runs INSIDE the finish
// handler, after the sheet has already been populated and as it is closing. So
// the one moment the athlete is looking at the screen and cares most was the one
// moment the app had nothing to say.
//
// This is the pure model behind that review. No DOM, no state mutation.
//
// It reuses the canonical strength primitives rather than recomputing anything:
// `isValidWorkingSet` (warm-ups and zero-rep sets are not training),
// `estimatedE1rmForSet` (which refuses bodyweight/assisted/band work instead of
// fabricating a load) and `isE1rmPr`/`E1RM_PR_EPSILON` (one shared 0.5 threshold,
// and a first-ever log is a BASELINE, not a record). That is deliberate: a
// "new best" here that the Strength screen does not also show would be worse
// than showing nothing.
// =============================================================================
import { isValidWorkingSet, setVolume } from '../set-utils.js';
import { estimatedE1rmForSet, isE1rmPr } from '../strength/e1rm.js';
import { exercisePerformanceHistory, EXERCISE_HISTORY_SCOPE } from './exercise-history.js';

/** Best defensible e1RM across a set list, and the set that produced it. */
function bestE1rm(liftName, sets) {
  let best = 0;
  let bestSet = null;
  for (const set of sets || []) {
    if (!isValidWorkingSet(set)) continue;
    const estimate = estimatedE1rmForSet(liftName, set);
    if (estimate > best) { best = estimate; bestSet = set; }
  }
  return { e1rm: best, set: bestSet };
}

/**
 * All-time best e1RM for a lift from every OTHER session, including archived
 * program runs. Scoped ALL on purpose: a personal best is a fact about the
 * athlete, not about the program they happen to be running, so switching
 * programs must not hand out a fresh set of "records" for lifts they have
 * already beaten.
 */
function previousBestE1rm(state, liftName, weekKey, day) {
  const history = exercisePerformanceHistory(state, liftName, {
    scope: EXERCISE_HISTORY_SCOPE.ALL,
    exclude: { weekKey: String(weekKey), day },
  });
  let best = 0;
  for (const row of history) {
    const value = Number(row?.e1rm) || 0;
    if (value > best) best = value;
  }
  return best;
}

/**
 * Build the review for one finished session.
 *
 * @param {any} state
 * @param {{ weekKey: string|number, day: string, liftNames?: string[] }} opts
 * @returns {{
 *   volume: number,
 *   workingSets: number,
 *   exercisesWorked: number,
 *   highlights: Array<{ lift: string, e1rm: number, previousBest: number, delta: number }>,
 * }}
 */
export function buildSessionReview(state, opts = /** @type {any} */ ({})) {
  const { weekKey, day } = opts;
  const week = state?.weeks?.[String(weekKey)];
  const dayLifts = week?.lifts?.[day] || {};

  // When the caller knows which lifts belong to THIS session (the cockpit does —
  // a day's stored lifts can include work from a swapped-out exercise), honour
  // it. Otherwise review everything logged on the day.
  const names = Array.isArray(opts.liftNames) && opts.liftNames.length
    ? opts.liftNames.filter((name) => Array.isArray(dayLifts[name]))
    : Object.keys(dayLifts).filter((name) => Array.isArray(dayLifts[name]));

  let volume = 0;
  let workingSets = 0;
  let exercisesWorked = 0;
  const highlights = [];

  for (const lift of names) {
    const sets = dayLifts[lift];
    let liftSets = 0;
    for (const set of sets) {
      if (!isValidWorkingSet(set)) continue;   // warm-ups and 0-rep rows are not training
      volume += setVolume(set);
      liftSets++;
    }
    if (!liftSets) continue;
    workingSets += liftSets;
    exercisesWorked++;

    const { e1rm } = bestE1rm(lift, sets);
    if (e1rm <= 0) continue;                   // bodyweight/band work has no comparable load
    const previousBest = previousBestE1rm(state, lift, weekKey, day);
    if (isE1rmPr(e1rm, previousBest)) {
      highlights.push({
        lift,
        e1rm,
        previousBest,
        delta: e1rm - previousBest,
      });
    }
  }

  // Biggest gain first — if only one line is ever read, it should be the best one.
  highlights.sort((a, b) => b.delta - a.delta || a.lift.localeCompare(b.lift));

  return { volume, workingSets, exercisesWorked, highlights };
}

/**
 * One plain sentence for the review, or '' when there is nothing honest to say.
 *
 * Deliberately silent rather than encouraging when no best was set: most good
 * sessions are not PR sessions, and inventing praise for every one of them
 * teaches the athlete to ignore the line that matters.
 *
 * @param {{highlights: Array<{lift:string, delta:number}>}} review
 * @param {(value:number)=>string} formatWeight
 */
export function reviewHighlightLine(review, formatWeight = (v) => String(Math.round(v))) {
  const highlights = review?.highlights || [];
  if (!highlights.length) return '';
  const [first] = highlights;
  const gain = `+${formatWeight(first.delta)}`;
  if (highlights.length === 1) return `New best: ${first.lift} (${gain} estimated 1RM)`;
  return `New best: ${first.lift} (${gain}) and ${highlights.length - 1} more`;
}
