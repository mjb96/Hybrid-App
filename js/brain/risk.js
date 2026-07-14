// @ts-check
// =============================================================================
// OVERTRAINING / INJURY-RISK (js/brain/risk.js) — roadmap R10
//
// Deterministic, multi-signal risk assessment. The existing deload suggestion
// (engine.shouldSuggestDeload) is ACWR-only and advisory; this escalates when
// SEVERAL fatigue signals stack up — the pattern that actually precedes
// overuse injury and non-functional overreaching. Genuine user-safety feature
// for a health app, so it requires acknowledgement (see the Home card) rather
// than a silent auto-hide.
//
// Pure function of (dashboard model, state, days). No DOM. Every signal is read
// from data that already exists (load metrics, readiness, sleep log, Hybrid
// Score history, logged RPEs).
// =============================================================================
import { runSessionsForDay } from '../state/run-sessions.js';

// Signal catalogue: key → { weight, severity, label }. Weight drives the level;
// severity colours the chip. ACWR ≥1.5 is on its own sufficient (injury-risk
// literature: Gabbett), so it carries a weight that trips 'high' alone.
const SIGNAL_META = {
  acwrSpike:      { weight: 4, severity: 'high',    label: 'Training load spiking' },
  acwrElevated:   { weight: 1, severity: 'watch',   label: 'Training load elevated' },
  deepFatigue:    { weight: 2, severity: 'high',    label: 'Deep fatigue (low freshness)' },
  lowReadiness:   { weight: 2, severity: 'high',    label: 'Readiness suppressed' },
  readinessDip:   { weight: 1, severity: 'watch',   label: 'Readiness dipping' },
  sleepDebt:      { weight: 2, severity: 'high',    label: 'Sleep debt building' },
  scoreSlide:     { weight: 2, severity: 'watch',   label: 'Hybrid Score sliding' },
  highRpeStreak:  { weight: 2, severity: 'watch',   label: 'Hard-effort streak' },
};

// Average of the most recent `n` nights of sleep (hours), or null.
function recentSleepAvg(state, n = 3) {
  const log = state?.healthConnect?.sleep;
  if (!Array.isArray(log) || !log.length) return null;
  const sorted = [...log].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const take = sorted.slice(0, n).map(e => e.totalHours).filter(h => h > 0);
  if (!take.length) return null;
  return take.reduce((a, b) => a + b, 0) / take.length;
}

// Is the Hybrid Score in a sustained decline? ≥3 consecutive down days AND the
// latest reading is itself low (a slide from 95→90→85 isn't a risk signal).
function scoreSliding(state) {
  const hist = [...(state?.hybridScore?.history || [])].sort((a, b) => a.date.localeCompare(b.date));
  if (hist.length < 4) return false;
  const last4 = hist.slice(-4).map(h => h.score);
  const latest = last4[last4.length - 1];
  let declines = 0;
  for (let i = 1; i < last4.length; i++) if (last4[i] < last4[i - 1]) declines++;
  return declines >= 3 && latest < 55;
}

// Count of the most recent (up to 6) session RPEs that were maximal (≥8).
function highRpeCount(state, days) {
  const curWk = parseInt(state?.currentWeek || '1', 10);
  const rpes = [];
  for (let w = curWk; w >= Math.max(1, curWk - 1); w--) {
    const wk = state?.weeks?.[String(w)];
    if (!wk) continue;
    for (const d of days) {
      const g = parseFloat(wk.gymRpe?.[d]) || 0;
      if (g > 0) rpes.push(g);
      runSessionsForDay(wk, d).forEach(run => {
        const r = parseFloat(run.rpe) || 0;
        if (r > 0) rpes.push(r);
      });
    }
  }
  return rpes.slice(-6).filter(v => v >= 8).length;
}

// Main assessment. Returns:
//   { level:'none'|'watch'|'high', score, signals:[{key,label,severity}],
//     headline, advice, deloadPlanned }
export function assessOvertrainingRisk(model, state, days = ['mon','tue','wed','thu','fri','sat','sun']) {
  const present = [];
  const add = (k) => present.push(k);

  const L = model?.load;
  const acwr = L?.hasData ? L.acwr : 0;
  if (acwr >= 1.5) add('acwrSpike');
  else if (acwr >= 1.3) add('acwrElevated');

  if (L?.hasData && L.tsb <= -25) add('deepFatigue');

  const r = model?.ready;
  if (r?.hasData) {
    if (r.score < 40) add('lowReadiness');
    else if (r.score < 55) add('readinessDip');
  }

  const sleep3 = recentSleepAvg(state, 3);
  if (sleep3 !== null && sleep3 < 6) add('sleepDebt');

  if (scoreSliding(state)) add('scoreSlide');

  if (highRpeCount(state, days) >= 3) add('highRpeStreak');

  const score = present.reduce((s, k) => s + (SIGNAL_META[k]?.weight || 0), 0);
  const hasSpike = present.includes('acwrSpike');
  const level = (hasSpike || score >= 4) ? 'high' : score >= 2 ? 'watch' : 'none';

  const signals = present
    .map(k => ({ key: k, label: SIGNAL_META[k].label, severity: SIGNAL_META[k].severity }))
    .sort((a, b) => (SIGNAL_META[b.key].weight - SIGNAL_META[a.key].weight));

  // Is this week already a planned/applied deload? Then the athlete is already
  // acting — soften the copy (they don't need to be told to deload again).
  const wk = String(state?.currentWeek ?? '');
  const deloadPlanned = String(state?.deloadApplied ?? '') === wk;

  let headline = '', advice = '';
  if (level === 'high') {
    headline = deloadPlanned ? 'High fatigue — stay in recovery' : 'Overtraining risk — back off';
    const lead = signals.slice(0, 2).map(s => s.label.toLowerCase()).join(' + ');
    advice = deloadPlanned
      ? `Several fatigue signals are stacked (${lead}). You've deloaded this week — hold the reduced load, prioritise sleep, and don't add sessions.`
      : `Several fatigue signals are stacked (${lead}). Consider a deload week — reduce volume, keep intensity easy, and protect sleep. Easing off when stress is elevated may help reduce injury risk, and a deload isn't lost progress. This isn't a medical diagnosis.`;
  } else if (level === 'watch') {
    headline = 'Fatigue building';
    advice = `Early fatigue signs (${signals.map(s => s.label.toLowerCase()).join(', ')}). Hold planned volume this week and watch recovery — no extra sessions.`;
  }

  return { level, score, signals, headline, advice, deloadPlanned };
}

// Stable signature of the active high-risk signal set, so acknowledging one
// condition dismisses exactly that condition — a NEW or worse signal set
// (different signature) resurfaces the warning.
export function riskSignature(assessment) {
  if (!assessment || assessment.level !== 'high') return '';
  return assessment.signals.map(s => s.key).sort().join('+');
}
