// @ts-check
// =============================================================================
// FASTING STAGE NUDGES (js/fasting/fasting-nudge.js) — S1d
//
// Zero-style pushes: a calm nudge when a fast crosses into a new metabolic
// stage, and one when the goal is reached. A pure decider + a dependency-
// injected firer, so the logic is unit-testable; real delivery is wired through
// the native NotifyBridge in notifications.js.
//
// HONEST LIMITATION (shared with every timer reminder here): the Android WebView
// freezes JS while backgrounded, so a crossing is delivered when the app is next
// foregrounded, not the instant it happens. True background delivery needs native
// scheduling — a follow-up, same as the daily reminder.
// =============================================================================
import { getFastingContext, FASTING_ZONES } from '../fasting.js';

// Short, forward-looking one-liners per stage (not the long clinical description).
const STAGE_BLURB = {
  blood_sugar: 'Insulin is falling and glycogen is starting to burn.',
  glycogen:    'Glycogen stores are draining — fat oxidation is climbing.',
  fat_adapt:   'Fat is now your main fuel — the metabolic sweet spot.',
  ketosis:     'Ketones are up and autophagy — cellular clean-up — has begun.',
  deep_fast:   'Deep fasting: growth hormone up, cellular renewal in earnest.',
};

// Pure decider: given the fasting context and the last-notified marker, return
// the single nudge to fire, or null. Never fires for the opening Fed state.
export function fastingNudge(ctx, marker) {
  if (!ctx || !ctx.active || !ctx.zone) return null;
  const m = marker || {};
  if (ctx.progressPct >= 100 && !m.goalNotified) {
    return {
      kind: 'goal', zoneId: ctx.zone.id,
      title: 'Fasting goal reached 🎉',
      body: `You hit your ${ctx.goal}h fast — now in ${ctx.zone.name}. Strong work.`,
    };
  }
  const idx = FASTING_ZONES.findIndex(z => z.id === ctx.zone.id);
  if (idx > 0 && ctx.zone.id !== m.zoneId) {
    return {
      kind: 'stage', zoneId: ctx.zone.id,
      title: `New stage: ${ctx.zone.name}`,
      body: STAGE_BLURB[ctx.zone.id] || ctx.zone.name,
    };
  }
  return null;
}

// A fresh marker for a fast that just started (or is seen for the first time).
function _freshMarker(startTime) {
  return { startTime, zoneId: 'fed', goalNotified: false };
}

// Fire at most one nudge and persist the marker on the session so it never
// repeats within a fast. Dependency-injected: notifyFn(title, body, tag),
// granted:boolean, saveFn(). Returns the nudge fired (or null) for callers/tests.
/**
 * @param {any} state
 * @param {{ notifyFn?: Function, granted?: boolean, saveFn?: Function }} [opts]
 */
export function maybePushFastingNudge(state, { notifyFn, granted, saveFn } = {}) {
  const fs = state && state.fastingSession;
  if (!fs || !fs.active || !granted) return null;
  const ctx = getFastingContext(state);
  // A new fast (startTime changed) resets the marker so its stages re-notify.
  let marker = fs._nudge;
  if (!marker || marker.startTime !== fs.startTime) marker = _freshMarker(fs.startTime);
  const nudge = fastingNudge(ctx, marker);
  if (!nudge) { fs._nudge = marker; return null; }
  if (nudge.kind === 'goal') marker.goalNotified = true;
  else marker.zoneId = nudge.zoneId;
  fs._nudge = marker;
  if (typeof notifyFn === 'function') notifyFn(nudge.title, nudge.body, 'fasting-stage');
  if (typeof saveFn === 'function') saveFn();
  return nudge;
}
