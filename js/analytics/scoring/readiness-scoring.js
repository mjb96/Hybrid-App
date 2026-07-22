// @ts-check
// ==========================================
// READINESS SCORING — analytics/scoring/readiness-scoring.js
// Pure functions. No DOM, no side effects.
// Garmin-style 0–100 readiness incorporating multiple signals.
// ==========================================
import { clamp } from '../calculations/math-utils.js';

// Component weights for composite readiness score.
// When fewer signals available, weights are redistributed.
const WEIGHTS = {
  hrv:       0.27,
  sleep:     0.27,
  load:      0.23,
  restingHr: 0.10,
  wellness:  0.13,
};

const EVIDENCE_META = {
  hrv:       { label: 'HRV vs baseline', scope: 'recent biometric' },
  sleep:     { label: 'Latest sleep', scope: 'last night' },
  load:      { label: 'Training load balance', scope: 'rolling training load' },
  restingHr: { label: 'Resting HR vs baseline', scope: 'recent biometric' },
  wellness:  { label: 'Wellness check-in', scope: 'today' },
};

const MAX_AGE_DAYS = { hrv: 2, sleep: 2, restingHr: 2, wellness: 0 };

function ageDays(date, asOf) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(asOf || ''))) return null;
  const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(asOf) - utc(date)) / 86400000);
}

function confidenceFor(inputCount) {
  if (inputCount <= 0) return 'none';
  if (inputCount === 1) return 'low';
  if (inputCount === 2) return 'moderate';
  return 'high';
}

function statusForConfidence(score, confidence) {
  if (score === null) return 'No Data';
  if (confidence === 'low') return 'Limited signal';
  if (confidence === 'moderate') return 'Developing read';
  return readinessStatus(score);
}

// HRV component: 0–100.
// Uses HRV status (elevated/baseline/suppressed/low).
function hrvComponent(hrvStat) {
  if (!hrvStat) return null;
  switch (hrvStat.status) {
    case 'elevated':   return 90;
    case 'baseline':   return 70;
    case 'suppressed': return 45;
    case 'low':        return 20;
    default:           return null;
  }
}

// Sleep component: 0–100 based on last night's hours vs 8h target.
function sleepComponent(sleepHours) {
  if (!sleepHours || sleepHours <= 0 || sleepHours > 16) return null;
  if (sleepHours >= 8.5) return 100;
  if (sleepHours >= 7.5) return 85;
  if (sleepHours >= 7.0) return 70;
  if (sleepHours >= 6.0) return 50;
  if (sleepHours >= 5.0) return 30;
  return 15;
}

// Load component: 0–100 based on ATL/CTL ratio (ACWR).
// Optimal zone 0.8–1.0 gets max score.
function loadComponent(atl, ctl) {
  if (!ctl || ctl === 0) return null;
  const ratio = atl / ctl;
  if (ratio < 0.5)              return 75;  // underloaded, fresh but detraining
  if (ratio < 0.8)              return 90;  // fresh, ready
  if (ratio < 1.0)              return 100; // optimal
  if (ratio < 1.1)              return 85;  // productive
  if (ratio < 1.3)              return 60;  // accumulating fatigue
  if (ratio < 1.5)              return 35;  // high load
  return 15;                                 // danger zone
}

// Resting HR component: 0–100 based on deviation from 7-day baseline.
// Elevated resting HR relative to baseline signals poor recovery.
function restingHrComponent(restingHrValues) {
  const valid = Array.isArray(restingHrValues)
    ? restingHrValues.filter((entry) => Number.isFinite(Number(entry?.bpm)) && Number(entry.bpm) >= 25 && Number(entry.bpm) <= 220)
    : [];
  if (valid.length < 2) return null;
  const sorted   = [...valid].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const today    = sorted[0].bpm;
  const window7  = sorted.slice(0, Math.min(7, sorted.length));
  const baseline = window7.reduce((s, e) => s + e.bpm, 0) / window7.length;
  const deviation = today - baseline;
  if (deviation >= 10) return 15;
  if (deviation >= 6)  return 35;
  if (deviation >= 3)  return 60;
  if (deviation >= 0)  return 80;
  return 100; // below baseline = excellent recovery
}

// Wellness component: 0–100 from today's check-in.
function wellnessComponent(todayWellness) {
  if (!todayWellness || (!todayWellness.mood && !todayWellness.soreness)) return null;
  let score = 0, n = 0;
  if (todayWellness.mood > 0) {
    score += (todayWellness.mood / 5) * 100;
    n++;
  }
  if (todayWellness.soreness > 0) {
    score += ((6 - todayWellness.soreness) / 5) * 100;
    n++;
  }
  return n > 0 ? Math.round(score / n) : null;
}

/**
 * @typedef {Object} ReadinessInput
 * @property {{ status?: string } | null} [hrvStat]
 * @property {number | null} [sleepHours]
 * @property {number | null} [atl]
 * @property {number | null} [ctl]
 * @property {{ mood?: number, soreness?: number } | null} [todayWellness]
 * @property {Array<{ date?: string, bpm?: number }>} [restingHrValues]
 * @property {Record<string, string | null | undefined>} [signalDates]
 * @property {string | null} [asOf]
 */

// Compute composite readiness from all available components.
// Returns the score plus its calibration contract: confidence, input count,
// evidence, time scope, excluded inputs, and a deterministic dev trace.
/** @param {ReadinessInput} [input] */
export function computeReadiness({ hrvStat, sleepHours, atl, ctl, todayWellness, restingHrValues, signalDates = {}, asOf = null } = {}) {
  const raw = {
    hrv:       hrvComponent(hrvStat),
    sleep:     sleepComponent(sleepHours),
    load:      loadComponent(atl, ctl),
    restingHr: restingHrComponent(restingHrValues),
    wellness:  wellnessComponent(todayWellness),
  };

  const supplied = {
    hrv: !!hrvStat,
    sleep: sleepHours != null && Number(sleepHours) !== 0,
    load: Number(ctl) > 0,
    restingHr: Array.isArray(restingHrValues) && restingHrValues.length > 0,
    wellness: !!todayWellness,
  };
  const excluded = [];
  for (const key of Object.keys(raw)) {
    const age = ageDays(signalDates?.[key], asOf);
    const maxAge = MAX_AGE_DAYS[key];
    if (age != null && maxAge != null && (age < 0 || age > maxAge)) {
      raw[key] = null;
      excluded.push({ key, reason: age < 0 ? 'future-dated' : 'stale', ageDays: age });
    } else if (supplied[key] && raw[key] === null) {
      excluded.push({ key, reason: 'invalid' });
    }
  }

  // Only include available signals
  const available = Object.entries(raw).filter(([, v]) => v !== null);
  if (available.length === 0) {
    return {
      score: null, components: {}, status: 'No Data',
      recommendation: 'Log workouts and wellness check-ins to generate readiness.',
      available: [], confidence: 'none', inputCount: 0, evidence: [],
      scope: 'no current inputs', excluded,
      devTrace: { method: 'available-signal weighted mean', normalizedWeights: {}, excluded },
    };
  }

  // Redistribute weights across available signals
  const totalWeight = available.reduce((s, [k]) => s + WEIGHTS[k], 0);
  let score = 0;
  const components = {};
  available.forEach(([k, v]) => {
    const w = WEIGHTS[k] / totalWeight;
    score += v * w;
    components[k] = Math.round(v);
  });

  score = Math.round(clamp(score, 0, 100));
  const inputCount = available.length;
  const confidence = confidenceFor(inputCount);
  const evidence = available.map(([key, value]) => ({
    key,
    label: EVIDENCE_META[key]?.label || key,
    scope: EVIDENCE_META[key]?.scope || 'recent',
    score: Math.round(value),
  }));
  const scopes = [...new Set(evidence.map((item) => item.scope))];
  const normalizedWeights = Object.fromEntries(available.map(([key]) => [key, Math.round((WEIGHTS[key] / totalWeight) * 1000) / 1000]));

  return {
    score,
    components,
    status: statusForConfidence(score, confidence),
    recommendation: readinessRecommendation(score, components, { confidence, evidence }),
    available: available.map(([k]) => k),
    confidence,
    inputCount,
    evidence,
    scope: scopes.join(' + '),
    excluded,
    devTrace: {
      method: 'available-signal weighted mean',
      normalizedWeights,
      score,
      confidence,
      inputCount,
      evidence,
      excluded,
    },
  };
}

// Status label for score.
export function readinessStatus(score) {
  if (score === null)  return 'No Data';
  if (score >= 85)     return 'Peak';
  if (score >= 70)     return 'Ready';
  if (score >= 55)     return 'Moderate';
  if (score >= 40)     return 'Low';
  return                      'Rest Advised';
}

// Status color for score.
export function readinessColor(score) {
  if (score === null)  return 'rgba(255,255,255,0.4)';
  if (score >= 85)     return '#10b981';
  if (score >= 70)     return '#3b82f6';
  if (score >= 55)     return '#f59e0b';
  if (score >= 40)     return '#f97316';
  return                      '#ef4444';
}

// Actionable recommendation text.
export function readinessRecommendation(score, components, { confidence = 'high', evidence = [] } = {}) {
  if (score === null) return 'Log workouts and wellness check-ins to generate readiness.';

  const evidenceText = evidence.map((item) => item.label).join(' + ') || 'one available signal';
  if (confidence === 'low') {
    return `Early estimate from ${evidenceText}. One signal is not enough to recommend pushing or backing off — follow the plan and reassess how you feel.`;
  }
  if (confidence === 'moderate') {
    if (score >= 70) return `Two signals look positive, but this read is still developing. Train as planned; wait for more evidence before a PR or time trial.`;
    if (score < 55) return `Two signals suggest recovery may be limited. Keep planned effort flexible and reassess during the warm-up.`;
    return `Readiness is still developing from two signals. Complete planned work without adding extra intensity.`;
  }

  if (score >= 85) {
    return 'You are primed for high-intensity training or a PR attempt today.';
  }
  if (score >= 70) {
    return 'Good readiness. Stick to your planned session. Push intensity if it feels right.';
  }
  if (score >= 55) {
    if (components.sleep && components.sleep < 60) {
      return 'Moderate readiness. Sleep quality is limiting recovery — prioritise an early night.';
    }
    if (components.load && components.load < 60) {
      return 'Moderate readiness. Training load is elevated — keep today at planned volume.';
    }
    return 'Moderate readiness. Complete planned work but avoid adding extra volume.';
  }
  if (score >= 40) {
    return 'Low readiness. Consider a reduced-intensity or active recovery session today.';
  }
  return 'Rest advised. Multiple recovery signals are suppressed. Prioritise sleep and nutrition.';
}
