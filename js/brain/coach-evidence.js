// @ts-check
// =============================================================================
// COACH EVIDENCE (js/brain/coach-evidence.js)
//
// Turns the daily coach recommendation into progressive-disclosure evidence:
// the concrete, plain-language facts behind "why am I seeing this", plus what
// would make the recommendation change. Every number comes from the SAME
// verified shared aggregates the rest of the app uses (buildWeekChart for
// working sets / running distance, the dashboard model for readiness/load),
// so the evidence can never contradict the In Focus graph or the detail views.
//
// Pure function — no DOM, no persistence. Wording stays jargon-free: consequences
// and counts, never "ACWR 1.52" / "TSB +7" (those live one tap deeper in the
// Load/Recovery stat views).
// =============================================================================
import { buildWeekChart } from '../analytics/week-chart-model.js';
import { addDaysISO, todayKey } from '../dates.js';

// How many of the last 7 nights carry a sleep reading (data completeness).
function sleepNights(state, today) {
  const log = state?.healthConnect?.sleep;
  if (!Array.isArray(log) || !log.length) return 0;
  const cutoffKey = addDaysISO(today, -6);
  const seen = new Set();
  for (const e of log) {
    if (e && e.date && e.date >= cutoffKey && e.date <= today && (e.totalHours > 0)) seen.add(e.date);
  }
  return seen.size;
}

// A single plain-language line describing the recent-load consequence, keyed off
// the same status band the coach used. No numbers/jargon — a felt description.
function loadLine(model) {
  if (!model?.load?.hasData) return null;
  const acwr = model.load.acwr;
  if (acwr >= 1.5) return 'Recent training load is climbing faster than your body is recovering.';
  if (acwr >= 1.3) return 'You’re building load productively, but fatigue is starting to stack up.';
  if (acwr >= 0.8) return 'Your recent training load is in the productive zone.';
  if (acwr >= 0.5) return 'Your recent training load has been on the lighter side.';
  return 'Your training load has dropped below your recent baseline.';
}

// Working-sets change bullet, phrased for the current (elapsed) vs completed week.
function setsBullet(state, days, today) {
  const c = buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: 0, today });
  const cmp = c.comparison;
  const cur = c.isCurrentWeek ? c.elapsedTotal : c.total;
  if (!cmp.isComparable) {
    if (cur > 0) return `Working sets this week: ${cur} (no comparable week yet).`;
    return null;
  }
  const prev = cmp.previousTotal;
  if (cur === 0 && prev === 0) return null;
  const at = c.isCurrentWeek ? 'at the same point last week' : 'the week before';
  const delta = cur - prev;
  const dir = delta > 0 ? `+${delta}` : `${delta}`;
  return `Working sets: ${cur} this week vs ${prev} ${at} (${dir}).`;
}

// Running-distance change bullet (km, unit-agnostic count kept simple).
function distanceBullet(state, days, today) {
  const c = buildWeekChart(state, { type: 'running', metric: 'distance', weekOffset: 0, today });
  const cmp = c.comparison;
  const cur = c.isCurrentWeek ? c.elapsedTotal : c.total;
  if (cur === 0 && (!cmp.isComparable || cmp.previousTotal === 0)) return null;
  const unit = (state?.settings?.distanceUnit === 'mi') ? 'mi' : 'km';
  const conv = (km) => unit === 'mi' ? km * 0.621371 : km;
  const curD = conv(cur).toFixed(1);
  if (!cmp.isComparable) return `Running: ${curD} ${unit} this week.`;
  const prevD = conv(cmp.previousTotal).toFixed(1);
  const at = c.isCurrentWeek ? 'at the same point last week' : 'the week before';
  return `Running: ${curD} ${unit} this week vs ${prevD} ${unit} ${at}.`;
}

/**
 * Build the evidence + "what clears it" for a coach recommendation.
 * @param {object} args
 * @param {object} args.state    appState
 * @param {string[]} args.days   day keys
 * @param {object} args.model    dashboard model (readiness, load)
 * @param {object} args.rec      the recommendation ({ severity, badge })
 * @param {string} [args.today]  'YYYY-MM-DD' (injected for tests)
 * @returns {{ bullets: string[], clears: string|null, confidence: 'ok'|'limited' }}
 */
export function buildCoachEvidence({ state, days, model, rec, today }) {
  const t = today || todayKey();
  const sev = rec?.severity || 'neutral';
  const badge = rec?.badge || '';
  const bullets = [];

  const ld = loadLine(model);
  const sets = setsBullet(state, days, t);
  const dist = distanceBullet(state, days, t);
  const readyHas = !!model?.ready?.hasData;
  const readyLine = readyHas ? `Readiness is ${model.ready.score} — ${model.ready.status}.` : null;

  // Order the evidence by what actually drove THIS recommendation.
  const recoveryFocused = sev === 'warning' || sev === 'caution' || badge === 'Rest Day' || badge === 'Deload';
  if (recoveryFocused) {
    if (ld) bullets.push(ld);
    if (readyLine) bullets.push(readyLine);
    if (sets) bullets.push(sets);
    if (dist) bullets.push(dist);
  } else {
    if (sets) bullets.push(sets);
    if (dist) bullets.push(dist);
    if (ld) bullets.push(ld);
    if (readyLine) bullets.push(readyLine);
  }

  // Data-completeness: only surfaced when it materially weakens a recovery call.
  const connected = !!state?.healthConnect?.connected;
  const nights = sleepNights(state, t);
  /** @type {'ok'|'limited'} */
  let confidence = 'ok';
  if (recoveryFocused) {
    if (connected && nights < 4) {
      bullets.push(`Sleep logged ${nights} of the last 7 nights — recovery read is partial.`);
      confidence = 'limited';
    } else if (!readyHas) {
      bullets.push('No recent readiness data — this is based on training load alone.');
      confidence = 'limited';
    }
  }

  // What would make this recommendation change / disappear. Badge-specific cases
  // win over the generic severity fallbacks (Detraining is itself a 'caution').
  let clears = null;
  if (badge === 'Detraining' || badge === 'Maintaining') {
    clears = 'This lifts once you string a few full sessions back together.';
  } else if (badge === 'High RPE Trend') {
    clears = 'This clears after a couple of easier sessions bring your recent efforts back down.';
  } else if (sev === 'warning') {
    clears = 'This eases once your recent load settles back toward your baseline — often just a lighter day or two.';
  } else if (sev === 'caution') {
    clears = 'This clears once fatigue drops back into your normal range.';
  } else if (sev === 'positive') {
    clears = 'Keep it here — the guidance updates as your load and readiness move.';
  }

  return { bullets: bullets.slice(0, 4), clears, confidence };
}
