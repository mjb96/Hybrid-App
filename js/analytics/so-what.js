// @ts-check
// =============================================================================
// SO WHAT? — one prescriptive line per analytics leaf (roadmap R8)
//
// Analytics must drive action, not just display data. Every leaf gets ONE
// honest, data-aware sentence answering "so what should I do?". Pure function
// of (context, dashboard model, state) — no DOM — so every rule is testable.
// Returns null for surfaces that already prescribe (hub, Hybrid Score detail,
// Week in Review) or when there's nothing worth saying.
//
// Tones map to the app's severity colours: positive · neutral · caution · warning.
// =============================================================================
import { streakRiskLine } from '../brain/streak.js';

const pct = (delta) => (delta && delta.pctLabel) ? delta.pctLabel : null;

// ---- Shared signal readers (all from the one dashboard model) --------------
function loadLine(model) {
  const L = model.load;
  if (!L?.hasData) return { text: 'Log RPE and session durations to unlock load guidance.', tone: 'neutral' };
  if (L.acwr >= 1.5) return { text: `Load is spiking (ACWR ${L.acwr.toFixed(2)}). Cut volume now — a deload week is the smart play, not a setback.`, tone: 'warning' };
  if (L.acwr >= 1.3) return { text: `Load is elevated (ACWR ${L.acwr.toFixed(2)}). Hold planned volume — no extra sets, no surges this week.`, tone: 'caution' };
  if (L.acwr >= 0.8) return { text: `You're in the productive zone (ACWR ${L.acwr.toFixed(2)}). Stick to the plan — this is where adaptation happens.`, tone: 'positive' };
  return { text: `Load has dropped (ACWR ${L.acwr.toFixed(2)}). Add a session this week before the fitness base starts to slide.`, tone: 'caution' };
}

function recoveryLine(model) {
  const r = model.ready;
  if (!r?.hasData) return { text: 'Log a 30-second wellness check-in to generate a readiness score.', tone: 'neutral' };
  if (!(r.available || []).includes('wellness')) {
    return { text: `Readiness ${r.score} — add today's 30-second check-in to sharpen it.`, tone: 'neutral' };
  }
  if (r.score >= 85) return { text: `Readiness ${r.score} — green light. Push intensity or chase a PR today.`, tone: 'positive' };
  if (r.score < 40)  return { text: `Readiness ${r.score} — swap today for easy movement and protect tonight's sleep.`, tone: 'warning' };
  if (r.score < 55)  return { text: `Readiness ${r.score} — complete the plan at the easier end. Nothing extra today.`, tone: 'caution' };
  return { text: `Readiness ${r.score} — train as planned.`, tone: 'neutral' };
}

function strengthLine(model) {
  const v = model.week?.volume;
  const p = pct(v?.delta);
  if (v?.delta && !v.delta.good && v.delta.dir === 'down' && p) {
    return { text: `Lifting volume is down ${p} on last week — schedule one more lift or add a back-off set today.`, tone: 'caution' };
  }
  if (v?.delta && v.delta.good && v.delta.dir === 'up' && p) {
    return { text: `Volume up ${p} on last week — ride it, don't spike it. Keep jumps under ~10%.`, tone: 'positive' };
  }
  if ((v?.current || 0) > 0) return { text: 'Progress lives in small jumps — add 2.5 kg wherever the last set felt clean.', tone: 'neutral' };
  return { text: 'No lifts logged this week yet — today is the day to open the account.', tone: 'caution' };
}

function runningLine(model) {
  const d = model.week?.distance;
  const p = pct(d?.delta);
  if ((d?.current || 0) <= 0) return { text: 'No runs this week yet — one easy Zone 2 run keeps the engine alive.', tone: 'caution' };
  if (d?.delta && d.delta.dir === 'up' && p) return { text: `Distance up ${p} on last week — keep 80% of it easy so the extra volume sticks.`, tone: 'positive' };
  if (d?.delta && d.delta.dir === 'down' && p) return { text: `Running volume down ${p} — protect the aerobic base with one more easy run before Sunday.`, tone: 'caution' };
  return { text: 'Consistency beats heroics — most runs easy, one quality session a week.', tone: 'neutral' };
}

function consistencyLine(model) {
  const w = model.week;
  const s = model.streak?.current || 0;
  if (w?.consistencyTotal > 0 && w.consistencyPct >= 100) {
    return { text: 'Plan complete — recovery is the training now. Sleep and refuel.', tone: 'positive' };
  }
  if (w?.consistencyTotal > 0) {
    return { text: `${w.consistencyPct}% of this week's plan done — close the gap before Sunday; adherence moves your Hybrid Score most.`, tone: w.consistencyPct >= 60 ? 'neutral' : 'caution' };
  }
  if (s >= 3) return { text: `Train today to keep your ${s}-day streak alive.`, tone: 'positive' };
  return { text: 'Log sessions to build your weekly picture — the plan only works if it happens.', tone: 'neutral' };
}

// ---- Context → line ---------------------------------------------------------
export function buildSoWhat(context, model, state) {
  if (!model) return null;
  switch (context) {
    // These surfaces already prescribe — no banner.
    case 'hub':
    case 'hybrid-score':
    case 'weekly-review':
    case 'projections':
    case 'monthly-report':
      return null;

    case 'training-status':
    case 'stress-balance':
    case 'load-focus':
      return loadLine(model);

    case 'recovery':
    case 'recovery-score':
      return recoveryLine(model);

    case 'strength':
    case 'weekly-volume':
      return strengthLine(model);

    case 'strength_pr': {
      const r = model.ready;
      if (r?.hasData && r.score >= 85) return { text: `Readiness ${r.score} — today is a PR day. Pick ONE lift and take a clean shot.`, tone: 'positive' };
      return { text: 'PRs come on fresh days — check Readiness first, then attempt one lift, not three.', tone: 'neutral' };
    }

    case 'running':
      return runningLine(model);

    case 'vdot':
      if (!state?.thresholdPaceSeconds) return { text: 'Set your threshold pace below to unlock VDOT and fitness trends.', tone: 'neutral' };
      return { text: 'Retest your threshold every 4–6 weeks: 20 minutes hard, on a fresh day.', tone: 'neutral' };

    case 'avg-pace':
      if (!model.pace?.hasData) return { text: 'Log run times with distances and your pace trend appears here.', tone: 'neutral' };
      return { text: 'If easy-run pace is creeping toward race pace, slow down — easy days build the engine.', tone: 'neutral' };

    case 'run-crossref':
      return { text: 'Keep 24h between hard runs and heavy leg days — they compete for the same recovery.', tone: 'neutral' };

    case 'bodyweight': {
      const b = model.bodyweight;
      const goal = state?.settings?.weightGoal || 'maintain';
      if (!b?.hasData) return { text: 'Log a weight below — a trend needs at least two points.', tone: 'neutral' };
      if (b.delta7 == null) return { text: 'Weigh in at the same time each day — morning, post-bathroom, pre-food.', tone: 'neutral' };
      if (goal === 'cut' && b.delta7 > 0) return { text: `Up ${b.delta7} kg this week against a cut — tighten the week's nutrition before changing training.`, tone: 'caution' };
      if (goal === 'bulk' && b.delta7 < 0) return { text: `Down ${Math.abs(b.delta7)} kg this week against a bulk — add ~200 kcal/day and hold training steady.`, tone: 'caution' };
      return { text: `Tracking with your ${goal === 'maintain' ? 'maintenance' : goal} goal — same scale, same time, every day.`, tone: 'positive' };
    }

    case 'progress':
    case 'activity':
      return consistencyLine(model);

    case 'streak': {
      const s = model.streak || {};
      // Loss-aversion first: if a meaningful streak is unprotected today, say so.
      const risk = streakRiskLine(state, model);
      if (risk) return risk;
      if ((s.current || 0) <= 0) return { text: 'Start a streak today — even 20 minutes counts as a day.', tone: 'neutral' };
      if (s.longest > s.current) return { text: `${s.current} days — ${s.longest - s.current} more to beat your record of ${s.longest}.`, tone: 'positive' };
      return { text: `${s.current} days — this IS your record. Every day extends it.`, tone: 'positive' };
    }

    case 'goal-progress': {
      const g = model.goal || {};
      if ((g.avgConsistency || 0) >= 80) return { text: `Avg adherence ${g.avgConsistency}% — the program delivers at this level. Keep going.`, tone: 'positive' };
      if ((g.avgConsistency || 0) > 0) return { text: `Avg adherence ${g.avgConsistency}% — the gap to results is adherence, not the program. Aim for 80%+.`, tone: 'caution' };
      return { text: "Complete this week's sessions to start tracking goal progress.", tone: 'neutral' };
    }

    case 'fasting': {
      const f = model.fasting || {};
      if (f.active) {
        const toGo = Math.max(0, Math.round((f.goal || 16) - (f.hours || 0)));
        return toGo <= 0
          ? { text: 'Goal reached — break the fast gently: protein first, then carbs.', tone: 'positive' }
          : { text: `${Math.floor(f.hours)}h in — ${toGo}h to goal. Water and electrolytes; keep training easy while fasted.`, tone: 'neutral' };
      }
      if ((f.streak || 0) > 0) return { text: `${f.streak}-day fasting streak — start today's fast after your last meal to keep it.`, tone: 'positive' };
      return { text: "16:8 is the sustainable default — start the clock after tonight's last meal.", tone: 'neutral' };
    }

    case 'weekly-summary':
    default:
      return consistencyLine(model);
  }
}
