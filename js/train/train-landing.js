// @ts-check
// =============================================================================
// TRAIN LANDING MODEL (js/train/train-landing.js) — roadmap Phase 0/2
//
// Train used to open straight into the workout cockpit: a day-selector bar and
// an exercise list, with no answer to "what am I doing today, and what else can
// I start?". Quick start was hidden behind a sheet and recent activity was not
// on the screen at all.
//
// This models the landing that now sits in front of the cockpit:
//
//   1. Today   — the planned session and ONE primary action
//   2. Quick start — the other things you can begin right now
//   3. Recent  — what you last did, as a way back into it
//
// Today comes from `buildTodayCardModel`, the SAME model Home renders, so Train
// and Home can never disagree about what today's session is or whether it is
// finished. This module adds no second opinion — it only decides what Train
// shows around it.
//
// PURE. No DOM, no state mutation.
// =============================================================================

import { buildTodayCardModel } from '../home/today-card.js';
import { buildActivityHistory } from '../activities/model.js';

/**
 * The things a user can start from Train right now. Mirrors the quick-start
 * sheet's actions so both entry points do exactly the same thing — the sheet
 * remains for the cockpit header; the landing surfaces them without a tap.
 */
export const QUICK_START_ACTIONS = Object.freeze([
  { id: 'workout', action: 'qs-workout', label: 'Workout', icon: 'dumbbell', hint: "Open today's session" },
  { id: 'run', action: 'qs-run', label: 'Run', icon: 'run', hint: 'Track a run with GPS' },
  { id: 'walk', action: 'qs-walk', label: 'Walk', icon: 'activity', hint: 'Track a walk' },
  { id: 'fast', action: 'qs-fast', label: 'Fast', icon: 'clock', hint: 'Start a fasting timer' },
]);

const KIND_LABEL = { strength: 'Strength', run: 'Run', walk: 'Walk', ride: 'Ride' };

/**
 * The most recent dated activities, newest first. Undated legacy records are
 * excluded rather than guessed onto a day — same rule as every calendar
 * surface, so Train's "recent" list cannot show a date the rest of the app
 * disagrees with.
 * @param {any} state
 * @param {number} limit
 */
export function recentActivities(state, limit = 3) {
  const rows = buildActivityHistory(state) || [];
  return rows
    .filter((row) => row && row.localDate)
    .sort((a, b) => String(b.localDate).localeCompare(String(a.localDate)))
    .slice(0, Math.max(0, limit))
    .map((row) => ({
      id: row.id,
      title: row.title || KIND_LABEL[row.kind] || 'Activity',
      kind: row.kind,
      kindLabel: KIND_LABEL[row.kind] || 'Activity',
      date: row.localDate,
      // The history model already owns both of these; recomputing them here
      // would be a second opinion about the same row.
      dateLabel: row.dateLabel || row.localDate,
      subtitle: row.subtitle || '',
    }));
}

/**
 * Build the Train landing model.
 *
 * @param {{
 *   state: any, program?: any, model?: any, briefing?: any, score?: any,
 *   now?: Date, tz?: string, offline?: boolean, recentLimit?: number,
 * }} options
 */
export function buildTrainLanding(options) {
  const { state, program = null, model = null, briefing = null, score = null,
    now = new Date(), tz = undefined, offline = false, recentLimit = 3 } = options || {};

  const today = buildTodayCardModel({ state, program, model, briefing, score, now, offline, tz });
  const recent = recentActivities(state, recentLimit);

  // A session already under way is the one thing that must not be buried
  // behind a landing — the user's unsaved intent outranks browsing.
  const resumable = today.state === 'in_progress' || today.state === 'unresolved';

  return {
    today,
    resumable,
    quickStart: QUICK_START_ACTIONS,
    recent,
    hasHistory: recent.length > 0,
  };
}
