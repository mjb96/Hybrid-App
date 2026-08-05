// @ts-check
// =============================================================================
// PERFORMANCE PREDICTIONS (js/brain/predictions.js) — roadmap R12
//
// "On your current trajectory you'll hit a sub-20 5k in ~6 weeks." Turns the
// trends the app already tracks (weekly e1RM per lift, weekly running pace)
// into concrete, motivating ETAs to the next milestone — plus the current
// Daniels race-time predictions (reused from running-calcs).
//
// Pure. Honest by construction: projects ONLY when there's a real improving
// trend over enough data; returns null otherwise (never invents progress).
// =============================================================================
import { weeklyE1rmByLift } from '../metrics/metrics-strength.js';
import { weeklyPaceSeries, weeklyDistanceSeries } from '../metrics/metrics-running.js';
import { racePredictors, effectiveVdot } from '../analytics/calculations/running-calcs.js';

const MIN_POINTS = 3;     // need at least this many data points to trust a trend
const MAX_ETA_WEEKS = 78; // don't promise more than ~18 months out

// How far ahead a projection may reach, by how much the trend can be trusted.
// A three-point trend has no business promising anything 18 months out: the
// further the horizon, the more the trend's QUALITY matters, not just its slope.
const HORIZON_BY_CONFIDENCE = Object.freeze({ high: MAX_ETA_WEEKS, moderate: 26, low: 8 });

/**
 * Least-squares slope over the trailing non-zero points, WITH the two things
 * needed to judge it: how many points it rests on, and how well the line
 * actually fits them.
 *
 * Without fit, a noisy three-week series like 100 → 150 → 110 yields a
 * confident-looking "+5/week" — a FASTER promise than a clean six-week
 * 100 → 110 progression at +2/week. The least trustworthy input produced the
 * most optimistic projection, and nothing downstream could tell them apart.
 *
 * Returns { rate, current, n, r2 } or null when there isn't enough signal.
 */
function trailingTrend(series, maxPoints = 6) {
  const pts = [];
  for (let i = 0; i < series.length; i++) if (series[i] > 0) pts.push({ x: i, y: series[i] });
  const tail = pts.slice(-maxPoints);
  if (tail.length < MIN_POINTS) return null;
  const n = tail.length;
  const mx = tail.reduce((s, p) => s + p.x, 0) / n;
  const my = tail.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of tail) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  if (den === 0) return null;
  const rate = num / den;

  // Coefficient of determination for the fitted line. A perfectly flat set of
  // observations has no variance to explain, so its fit is reported as 0
  // rather than as a divide-by-zero.
  const intercept = my - rate * mx;
  let ssRes = 0, ssTot = 0;
  for (const p of tail) {
    ssRes += (p.y - (rate * p.x + intercept)) ** 2;
    ssTot += (p.y - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));

  return { rate, current: tail[tail.length - 1].y, n, r2 };
}

/**
 * How much a projection built on this series deserves to be believed.
 * Exported so surfaces can LABEL a projection instead of presenting every ETA
 * with equal authority.
 *
 * @param {number[]} series
 * @returns {{level:'high'|'moderate'|'low', n:number, r2:number}|null}
 */
export function trendQuality(series) {
  const t = trailingTrend(series);
  if (!t) return null;
  const r2 = Math.round(t.r2 * 100) / 100;
  const level = t.n >= 6 && t.r2 >= 0.7 ? 'high'
    : t.n >= 4 && t.r2 >= 0.5 ? 'moderate'
    : 'low';
  return { level, n: t.n, r2 };
}

/** Plain-language note for a projection's confidence. */
export function confidenceNote(quality) {
  if (!quality) return 'Not enough history to project a trend yet.';
  if (quality.level === 'high') return `Based on ${quality.n} weeks of consistent progress.`;
  if (quality.level === 'moderate') return `Based on ${quality.n} weeks; the trend is uneven, so treat this as a rough guide.`;
  return `Based on only ${quality.n} weeks of inconsistent data — a rough indication, not a forecast.`;
}

// Weeks until `series` reaches `target`. `higherIsBetter` flips the sign test
// (pace improves by DECREASING). null when not trending the right way.
export function weeksToTarget(series, target, higherIsBetter = true) {
  const t = trailingTrend(series);
  if (!t) return null;
  const improving = higherIsBetter ? t.rate > 0 : t.rate < 0;
  if (!improving) return null;
  const gap = higherIsBetter ? target - t.current : t.current - target;
  if (gap <= 0) return 0; // already there
  const perWeek = Math.abs(t.rate);
  const weeks = Math.ceil(gap / perWeek);
  // The horizon a projection may claim depends on how trustworthy its trend
  // is, not only on the arithmetic. A weak trend that "reaches" the target in
  // 40 weeks is a guess dressed as a plan, so it returns no ETA at all.
  const horizon = HORIZON_BY_CONFIDENCE[trendQuality(series)?.level || 'low'];
  return weeks > horizon ? null : weeks;
}

// ---- Strength ---------------------------------------------------------------
// Next round-number milestone above the current e1RM (10 kg steps).
function nextPlate(e1rm) { return Math.ceil((e1rm + 0.01) / 10) * 10; }

const TRACKED_LIFTS = [
  { match: /back squat|^squat/i, name: 'Squat' },
  { match: /bench press/i,        name: 'Bench' },
  { match: /deadlift/i,           name: 'Deadlift' },
];

export function strengthProjections(state, days, maxWeek) {
  const byLift = weeklyE1rmByLift(state, days, maxWeek);
  const out = [];
  for (const spec of TRACKED_LIFTS) {
    const key = Object.keys(byLift).find(l => spec.match.test(l) && !/romanian|stiff|split|goblet/i.test(l));
    if (!key) continue;
    const series = byLift[key];
    const current = Math.max(0, ...series);
    if (current <= 0) continue;
    const target = nextPlate(current);
    const eta = weeksToTarget(series, target, true);
    const quality = trendQuality(series);
    out.push({
      lift: spec.name, current: Math.round(current), target, etaWeeks: eta,
      confidence: quality?.level || null,
      confidenceNote: confidenceNote(quality),
      samples: quality?.n || 0,
    });
  }
  return out;
}

// ---- Running ----------------------------------------------------------------
const FIVEK_TARGETS = [30, 27.5, 25, 22.5, 20, 18, 16].map(m => m * 60); // seconds

// Convert a weekly average-pace series (sec/km) into a projected 5k target.
// Uses the same 88%-of-threshold model as racePredictors so a pace ETA lines
// up with the predicted-time card.
export function runningProjection(state, days, maxWeek) {
  // E4 — manual threshold OR estimated from the best recent run, so race
  // predictions + ETAs appear for anyone who logs runs (not just those who
  // typed a threshold pace).
  const ev = effectiveVdot(state, days, maxWeek);
  const thresholdSecs = ev?.thresholdSecs || 0;
  const vdot = ev?.vdot || null;
  const races = thresholdSecs ? racePredictors(thresholdSecs) : null;

  // Current predicted 5k time (seconds) from threshold, if available.
  const current5kSec = thresholdSecs ? Math.round(thresholdSecs * 0.88 * 5) : null;

  // Trend of weekly average pace (sec/km); improving = decreasing.
  const paceSeries = weeklyPaceSeries(state, days, maxWeek);
  // Map each weekly pace to an implied 5k time so we can project in "5k seconds".
  const implied5k = paceSeries.map(p => (p > 0 ? p * 0.88 * 5 : 0));

  let nextTarget = null, etaWeeks = null;
  if (current5kSec) {
    const faster = FIVEK_TARGETS.filter(t => t < current5kSec).sort((a, b) => b - a)[0];
    if (faster) {
      nextTarget = faster;
      etaWeeks = weeksToTarget(implied5k, faster, /* higherIsBetter */ false);
    }
  }

  const paceQuality = trendQuality(implied5k);
  const fmt = (sec) => sec == null ? null : `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;
  return {
    hasData: !!thresholdSecs,
    vdot,
    races,
    current5k: fmt(current5kSec),
    nextTarget: nextTarget ? {
      time: fmt(nextTarget),
      etaWeeks,
      confidence: paceQuality?.level || null,
      confidenceNote: confidenceNote(paceQuality),
      samples: paceQuality?.n || 0,
    } : null,
  };
}

export function buildPredictions(state, days) {
  const weekKeys = Object.keys(state?.weeks || {}).map(Number).filter(n => !isNaN(n));
  const maxWeek = weekKeys.length ? Math.max(...weekKeys) : (parseInt(state?.currentWeek, 10) || 1);
  const strength = strengthProjections(state, days, maxWeek);
  const running = runningProjection(state, days, maxWeek);
  const hasAny = strength.length > 0 || running.hasData;
  return { hasData: hasAny, strength, running };
}

// One motivating projection line for the Morning Briefing / share (or null).
// `weightUnit` matters: this is coaching text quoting a real load, and telling
// an lbs athlete their squat hits "140 kg" misnames their own numbers.
export function topPredictionLine(pred, weightUnit = 'kg') {
  if (!pred?.hasData) return null;
  if (pred.running?.nextTarget?.etaWeeks) {
    return `On your current trend you'll break a ${pred.running.nextTarget.time} 5k in ~${pred.running.nextTarget.etaWeeks} week${pred.running.nextTarget.etaWeeks === 1 ? '' : 's'}.`;
  }
  const s = pred.strength.find(x => x.etaWeeks != null);
  if (s) return `On your current trend your ${s.lift} hits ${s.target} ${weightUnit} in ~${s.etaWeeks} week${s.etaWeeks === 1 ? '' : 's'}.`;
  return null;
}
