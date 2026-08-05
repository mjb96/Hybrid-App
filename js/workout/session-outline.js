// @ts-check
// =============================================================================
// SESSION OUTLINE (js/workout/session-outline.js) — roadmap Phase 2A
//
// "Add a lightweight session outline so users can see what remains without
// scrolling through every expanded control."
//
// The cockpit already collapses completed and inactive exercises, but answering
// "how much is left?" still meant scrolling the whole accordion and counting.
// This models a compact, glanceable index of the session: one entry per
// exercise with its set progress, plus the totals that answer the question
// directly.
//
// Counting rules match the logger EXACTLY — a set counts as done when
// `isCompletedSet` says so, and warm-ups are excluded from the working-set
// count the same way the rest of the app excludes them. An outline that
// disagreed with the card beneath it would be worse than no outline.
//
// PURE. No DOM, no state mutation.
// =============================================================================

import { isCompletedSet, isWarmupSet } from '../set-utils.js';

/**
 * @typedef {object} OutlineEntry
 * @property {string} name        the stored lift key (used to target its card)
 * @property {number} total       working sets prescribed/logged
 * @property {number} done        working sets completed
 * @property {number} remaining   working sets still to do
 * @property {'done'|'active'|'todo'} status
 * @property {boolean} started    at least one set completed
 */

/**
 * Build the outline for one session.
 *
 * @param {Record<string, any[]>} lifts   day lifts: name → sets array
 * @param {string[]} order                the order the cockpit renders them in
 * @param {{activeLift?: string|null}} [options]
 */
export function buildSessionOutline(lifts, order, options = {}) {
  const active = options.activeLift || null;
  const names = Array.isArray(order) && order.length
    ? order.filter((name) => Array.isArray(lifts?.[name]))
    : Object.keys(lifts || {}).filter((name) => Array.isArray(lifts[name]));

  /** @type {OutlineEntry[]} */
  const entries = names.map((name) => {
    const sets = lifts[name] || [];
    // Warm-ups are not working sets anywhere else in the app, so they are not
    // counted here either — otherwise the outline would promise more remaining
    // work than the exercise card lists.
    const working = sets.filter((set) => !isWarmupSet(set));
    const done = working.filter(isCompletedSet).length;
    const total = working.length;
    const complete = total > 0 && done === total;
    return {
      name,
      total,
      done,
      remaining: Math.max(0, total - done),
      started: done > 0,
      status: complete ? 'done' : (name === active ? 'active' : 'todo'),
    };
  });

  const exercisesDone = entries.filter((entry) => entry.status === 'done').length;
  const setsDone = entries.reduce((sum, entry) => sum + entry.done, 0);
  const setsTotal = entries.reduce((sum, entry) => sum + entry.total, 0);

  return {
    entries,
    exercisesDone,
    exercisesTotal: entries.length,
    setsDone,
    setsTotal,
    setsRemaining: Math.max(0, setsTotal - setsDone),
    // A session with no prescribed sets at all is not "100% complete" — that
    // would congratulate someone for an empty workout.
    complete: entries.length > 0 && exercisesDone === entries.length && setsTotal > 0,
    empty: entries.length === 0,
  };
}

/**
 * One short line answering "how much is left?". Deliberately states remaining
 * work rather than a percentage: "4 sets left" is actionable, "62%" is not.
 * @param {ReturnType<typeof buildSessionOutline>} outline
 */
export function outlineSummaryLine(outline) {
  if (!outline || outline.empty) return 'No exercises in this session yet.';
  if (outline.setsTotal === 0) return `${outline.exercisesTotal} exercise${outline.exercisesTotal === 1 ? '' : 's'} · no sets prescribed yet.`;
  if (outline.complete) return `All ${outline.exercisesTotal} exercise${outline.exercisesTotal === 1 ? '' : 's'} complete.`;
  if (outline.setsDone === 0) return `${outline.setsTotal} set${outline.setsTotal === 1 ? '' : 's'} to go.`;
  return `${outline.setsRemaining} set${outline.setsRemaining === 1 ? '' : 's'} left · ${outline.exercisesDone} of ${outline.exercisesTotal} exercises done`;
}
