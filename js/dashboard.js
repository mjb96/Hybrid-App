// ==========================================
// DASHBOARD TILE REGISTRY (dashboard.js)
// ==========================================
// Each tile is a pure presenter of the shared dashboard model (computed once
// per render in home/dashboard-model.js and passed in as the 5th argument).
// Tiles read from `model` so every number on the dashboard is consistent and
// the intelligence lives in one testable place.
//
// DashboardTileConfig shape:
// {
//   id, type, icon, label, accentVar, navTarget, order,
//   requiresHealth?: boolean   — hidden (folded into one Connect tile) until
//                                 the Health app is linked,
//   renderData: (appState, days, program, selectedDay, model) => DashboardTileData
// }
//
// DashboardTileData may carry, in addition to hero/sub/tag:
//   delta:   makeDelta() output   — coloured week-over-week chip
//   spark:   number[]             — tiny bar sparkline
//   insight: string               — one-line brain insight
// ==========================================

import { dateKey } from './dates.js';
import { fmtFastDuration, fmtHoursLabel } from './fasting.js';
import { isCompletedSet } from './set-utils.js';

export const DashboardTileType = Object.freeze({
  METRIC:    'metric',
  RING:      'ring',
  SPLIT_3:   'split_3',
  RATIO_BAR: 'ratio_bar',
  PROGRESS:  'progress',
  CONNECT:   'connect',   // full-width "Connect your Health app" placeholder
});

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

// Recent logged days (run + gym) by real date — for time-window tiles.
function collectRecentDays(appState, windowDays = 7) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (windowDays - 1));
  const out = [];
  const weeks = appState.weeks || {};
  for (const wk in weeks) {
    const wd = weeks[wk];
    if (!wd || !wd.dates) continue;
    for (const day in wd.dates) {
      const ds = wd.dates[day];
      if (!ds) continue;
      const d = new Date(ds + 'T00:00:00');
      if (isNaN(d.getTime()) || d < cutoff) continue;
      out.push({ date: ds, run: wd.runs?.[day], gymStats: wd.gymStats?.[day] });
    }
  }
  return out;
}

// ==========================================
// TILE REGISTRY
// ==========================================
export const TILE_REGISTRY = [

  // ---- PROGRAM HERO -------------------------------------------
  {
    id: 'program-hero', type: DashboardTileType.METRIC, icon: '📋', label: 'Active Program',
    accentVar: '--color-blue', navTarget: 'goal-progress', order: -1,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        if (!activeProgram) return { hero: 'No Program', sub: 'Select a program to begin.', state: 'empty' };
        const wk = model.wkNum;
        const total = activeProgram.totalWeeks || 12;
        const pct = Math.round((wk / total) * 100);
        const phaseWk = wk % 4 === 0 ? 'Deload' : wk <= Math.ceil(total / 3) ? 'Foundation' : wk <= Math.ceil(total * 2 / 3) ? 'Build' : 'Peak';
        const phase = activeProgram.weeks?.[String(wk)]?.phase || phaseWk;
        return {
          hero: activeProgram.name || 'Program',
          sub: `Week ${wk} of ${total} · ${phase}`,
          tag: `${pct}% complete`,
          tagColor: pct >= 75 ? 'var(--color-green)' : pct >= 40 ? 'var(--color-amber)' : 'var(--color-blue)',
          state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- TODAY --------------------------------------------------
  {
    id: 'today', type: DashboardTileType.METRIC, icon: '📅', label: 'Today',
    accentVar: '--color-blue', navTarget: 'custom:today-summary', order: 0,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const weekData = appState.weeks?.[String(model.wkNum)];
        if (!weekData) return { hero: 'Rest', sub: 'No session planned.', state: 'empty' };
        const bp = activeProgram?.days?.[selectedDay] || {};
        const todayLifts = weekData.lifts?.[selectedDay] || {};
        const todayRun = weekData.runs?.[selectedDay] || {};
        let completedSets = 0, totalSets = 0;
        for (const lift in todayLifts) {
          if (Array.isArray(todayLifts[lift])) {
            totalSets += todayLifts[lift].length;
            completedSets += todayLifts[lift].filter(s => isCompletedSet(s)).length;
          }
        }
        const runDist = parseFloat(todayRun.dist) || 0;
        if (completedSets > 0 || runDist > 0) {
          const completionPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 100;
          const pctColor = completionPct >= 100 ? 'var(--color-green)' : completionPct >= 50 ? 'var(--color-amber)' : 'var(--color-red)';
          return {
            hero: totalSets > 0 ? `${completionPct}%` : '✓ Done',
            sub: `${completedSets}${totalSets > 0 ? '/' + totalSets : ''} sets${runDist > 0 ? ' · ' + (appState.settings?.distanceUnit === 'mi' ? (runDist * 0.621371).toFixed(2) + ' mi' : runDist + ' km') : ''}`,
            tag: completionPct >= 100 ? 'Complete' : `${completionPct}% done`,
            tagColor: pctColor, state: 'loaded',
          };
        }
        return {
          hero: bp.title || 'Rest Day',
          sub: (bp.desc || 'No session planned.').substring(0, 40),
          tag: bp.badge || 'Rest', tagColor: bp.color || 'var(--color-blue)',
          insight: model.rec?.headline || '', state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- FASTING (promoted) -------------------------------------
  {
    id: 'fasting', type: DashboardTileType.METRIC, icon: '⏱️', label: 'Fasting',
    accentVar: '--color-amber', navTarget: 'custom:fasting', order: 0.5,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const ctx = model.fasting;
        const durSpark = (ctx.history || []).slice(-8).map(h => h.durationHours);
        if (ctx.active) {
          return {
            hero: fmtFastDuration(ctx.hours), sub: ctx.zone.name,
            tag: `${Math.round(ctx.progressPct)}% of ${ctx.goal}h`, tagColor: ctx.zone.color,
            insight: ctx.progressPct >= 100 ? '🎉 Goal reached — end whenever you like.' : `${fmtHoursLabel(ctx.remainingHours)} to your ${ctx.goal}h goal`,
            state: 'loaded',
          };
        }
        if (ctx.history.length > 0) {
          const last = ctx.history[ctx.history.length - 1];
          return {
            hero: fmtHoursLabel(last.durationHours), sub: 'Last fast',
            tag: ctx.streak > 0 ? `${ctx.streak}d streak` : 'Tap to start',
            tagColor: ctx.streak > 0 ? 'var(--color-amber)' : 'var(--text-secondary)',
            spark: durSpark, sparkColor: 'var(--color-amber)',
            insight: 'Tap to start a fast', state: 'loaded',
          };
        }
        return { hero: '—', sub: 'Tap to start a fast', insight: 'Intermittent fasting — start your first fast', state: 'empty' };
      } catch { return { hero: '—', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- READINESS (multi-signal) -------------------------------
  {
    id: 'readiness', type: DashboardTileType.RING, icon: '❤️', label: 'Readiness',
    accentVar: '--color-green', navTarget: 'recovery-score', order: 1,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const r = model.ready;
        if (!r.hasData) return { hero: '—', sub: 'Log sessions & check-ins', ringPct: 0, ringColor: 'var(--color-blue)', state: 'empty' };
        const signals = (r.available || []).map(k => ({ hrv: 'HRV', sleep: 'Sleep', load: 'Load', restingHr: 'RHR', wellness: 'Wellness' }[k] || k)).join(' · ');
        return {
          hero: String(r.score), ringPct: r.score, ringColor: r.color,
          tag: r.status, tagColor: r.color, sub: signals || '—',
          insight: r.recommendation, state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', ringPct: 0, ringColor: 'var(--color-blue)', state: 'error' }; }
    },
  },

  // ---- TRAINING STATUS / FRESHNESS ----------------------------
  {
    id: 'recovery-score', type: DashboardTileType.METRIC, icon: '🧬', label: 'Training Status',
    accentVar: '--color-green', navTarget: 'training-status', order: 2,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const L = model.load;
        if (!L.hasData) return { hero: '--', sub: 'Log RPE + durations', tag: 'Building', tagColor: 'var(--text-secondary)', state: 'empty' };
        // Fitness / Fatigue / Form framing (CTL / ATL / TSB) — keeps ACWR the
        // coaching card's domain so the two never show conflicting numbers.
        const tsbLabel = L.tsb >= 5 ? 'Fresh' : L.tsb <= -15 ? 'Fatigued' : 'Neutral';
        const insight = L.tsb >= 5
          ? 'Carrying freshness — a good window to push intensity.'
          : L.tsb <= -15
            ? 'Fatigue is high — keep volume in check and recover well.'
            : 'Fitness and fatigue are balanced — train as planned.';
        return {
          hero: L.status,
          sub: `Fitness ${Math.round(L.ctl)} · Fatigue ${Math.round(L.atl)}`,
          tag: `Form ${L.tsb >= 0 ? '+' : ''}${Math.round(L.tsb)} · ${tsbLabel}`, tagColor: L.color,
          spark: model.series.ctl, sparkColor: L.color,
          insight, state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- CONSISTENCY -------------------------------------------
  {
    id: 'consistency', type: DashboardTileType.PROGRESS, icon: '🎯', label: 'Consistency',
    accentVar: '--color-blue', navTarget: 'progress', order: 3,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const w = model.week;
        return {
          done: w.consistencyDone, total: w.consistencyTotal, sub: 'Weekly tasks ticked',
          insight: w.consistencyTotal > 0 ? `${w.consistencyPct}% of this week's plan complete` : '',
          state: w.consistencyDone > 0 ? 'loaded' : 'empty',
        };
      } catch { return { done: 0, total: 0, sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- WEEKLY VOLUME -----------------------------------------
  {
    id: 'weekly-volume', type: DashboardTileType.METRIC, icon: '📦', label: 'Weekly Volume',
    accentVar: '--color-blue', navTarget: 'weekly-volume', order: 4,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const v = model.week.volume;
        if (v.current <= 0 && !v.delta) return { hero: '0 kg', sub: `${model.week.sets} sets · ${model.week.reps} reps`, state: 'empty' };
        const hero = v.current >= 1000 ? `${(v.current / 1000).toFixed(1)}t` : `${Math.round(v.current)} kg`;
        return {
          hero, sub: `${model.week.sets} sets · ${model.week.reps} reps`,
          delta: v.delta, spark: v.spark, sparkColor: 'var(--color-blue)',
          insight: v.delta ? (v.delta.good ? `Up ${v.delta.pctLabel} on last week` : `Down ${v.delta.pctLabel} on last week`) : '',
          state: v.current > 0 ? 'loaded' : 'empty',
        };
      } catch { return { hero: '0 kg', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- BODY WEIGHT -------------------------------------------
  {
    id: 'bodyweight', type: DashboardTileType.METRIC, icon: '⚖️', label: 'Body Weight',
    accentVar: '--color-green', navTarget: 'bodyweight', order: 5,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const b = model.bodyweight;
        if (!b.hasData) return { hero: '-- kg', sub: 'Tap to log', tag: 'No data', tagColor: 'var(--text-secondary)', state: 'empty' };
        const goal = appState.settings?.weightGoal || 'maintain';
        let delta = null;
        if (b.delta7 !== null) {
          const dir = b.delta7 > 0 ? 'up' : b.delta7 < 0 ? 'down' : 'flat';
          // Whether a weekly change is "good" depends on the body-composition goal.
          const good = goal === 'cut' ? b.delta7 <= 0
                     : goal === 'bulk' ? b.delta7 >= 0
                     : Math.abs(b.delta7) <= 1;        // maintain: holding within ~1kg/wk
          delta = { dir, good, label: `${b.delta7 > 0 ? '+' : ''}${b.delta7}kg`, usePct: false };
        }
        const goalTag = { cut: 'Cutting', maintain: 'Maintaining', bulk: 'Bulking' }[goal];
        return {
          hero: `${b.latest.toFixed(1)} kg`, sub: 'vs 7 days ago', delta,
          tag: goalTag, tagColor: 'var(--text-secondary)',
          spark: b.trend, sparkColor: 'var(--color-green)', state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- TOP LIFTS (1RM) ---------------------------------------
  {
    id: 'top-lifts', type: DashboardTileType.SPLIT_3, icon: '💪', label: 'Top Lifts (1RM)',
    accentVar: '--color-blue', navTarget: 'strength_pr', order: 6,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const { sq, bp, dl, total } = model.big3;
        const fmt = v => v > 0 ? `${Math.round(v)} kg` : '-- kg';
        return {
          rows: [{ label: 'SQ', value: fmt(sq) }, { label: 'BP', value: fmt(bp) }, { label: 'DL', value: fmt(dl) }],
          insight: total > 0 ? `Estimated big-3 total: ${total} kg` : '',
          state: total > 0 ? 'loaded' : 'empty',
        };
      } catch { return { rows: [{ label: 'SQ', value: '--' }, { label: 'BP', value: '--' }, { label: 'DL', value: '--' }], state: 'error' }; }
    },
  },

  // ---- ACTIVE FUEL -------------------------------------------
  {
    id: 'active-fuel', type: DashboardTileType.METRIC, icon: '🔥', label: 'Active Fuel',
    accentVar: '--color-amber', navTarget: 'running', order: 7,
    renderData(appState) {
      try {
        let cals = 0;
        collectRecentDays(appState, 7).forEach(rec => {
          cals += parseInt(rec.run?.cals, 10) || 0;
          cals += parseInt(rec.gymStats?.cals, 10) || 0;
        });
        return { hero: cals.toLocaleString(), sub: 'kcal · last 7 days', state: cals > 0 ? 'loaded' : 'empty' };
      } catch { return { hero: '0', sub: 'kcal · last 7 days', state: 'error' }; }
    },
  },

  // ---- AVG PACE ----------------------------------------------
  {
    id: 'avg-pace', type: DashboardTileType.METRIC, icon: '⏱️', label: 'Avg Pace',
    accentVar: '--color-pink', navTarget: 'avg-pace', order: 8,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const p = model.pace;
        if (!p.hasData) return { hero: '--:--', sub: `min/${p.unit} · recent runs`, state: 'empty' };
        return {
          hero: p.label, sub: `min/${p.unit} · recent runs`,
          spark: p.spark, sparkColor: 'var(--color-pink)', state: 'loaded',
        };
      } catch { return { hero: '--:--', sub: 'min/km · recent runs', state: 'error' }; }
    },
  },

  // ---- STRESS BALANCE ----------------------------------------
  {
    id: 'stress-balance', type: DashboardTileType.RATIO_BAR, icon: '⚖️', label: 'Stress Balance',
    accentVar: '--color-amber', navTarget: 'stress-balance', order: 9,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const weekData = appState.weeks?.[String(model.wkNum)];
        let gymTSS = 0, runTSS = 0;
        if (weekData) {
          days.forEach(d => {
            const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
            const gymMins = parseFloat(weekData.gymStats?.[d]?.time) || 0;
            const dayLifts = weekData.lifts?.[d] || {};
            let completedSets = 0;
            for (const lift in dayLifts) {
              if (Array.isArray(dayLifts[lift])) completedSets += dayLifts[lift].filter(s => isCompletedSet(s)).length;
            }
            if (gymMins > 0 && gRpe > 0) gymTSS += gymMins * gRpe;
            else if (completedSets > 0) gymTSS += completedSets * (gRpe > 0 ? gRpe : 6) * 4;
            const rDist = parseFloat(weekData.runs?.[d]?.dist) || 0;
            const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
            const rMins = parseTimeToMinutes(weekData.runs?.[d]?.time);
            if (rMins > 0 && rRpe > 0) runTSS += rMins * rRpe;
            else if (rDist > 0) runTSS += rDist * (rRpe > 0 ? rRpe : 6) * 8;
          });
        }
        if (gymTSS === 0 && runTSS === 0) return { label: 'No data logged', advice: 'Log workouts to see your bias.', liftPct: 50, runPct: 50, state: 'empty' };
        const total = gymTSS + runTSS;
        const liftPct = Math.round((gymTSS / total) * 100);
        const runPct = 100 - liftPct;
        let advice = '🏆 Balanced lift / run load.';
        if (liftPct >= 70) advice = '⚠️ Heavy lifting bias this week.';
        else if (runPct >= 70) advice = '⚠️ High running stress this week.';
        return { label: `${liftPct}% / ${runPct}%`, advice, liftPct, runPct, state: 'loaded' };
      } catch { return { label: '0% / 0%', advice: 'Unavailable', liftPct: 50, runPct: 50, state: 'error' }; }
    },
  },

  // ---- TRAINING STREAK ---------------------------------------
  {
    id: 'streak', type: DashboardTileType.METRIC, icon: '🔥', label: 'Training Streak',
    accentVar: '--color-amber', navTarget: 'streak', order: 10,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const s = model.streak;
        return {
          hero: `${s.current}d`, sub: `Longest: ${s.longest} days`,
          tag: s.current > 0 ? `🔥 ${s.current}` : 'Start today',
          tagColor: s.current >= 7 ? 'var(--color-amber)' : 'var(--color-blue)',
          insight: s.current >= 3 ? 'Consistency compounds — keep the streak alive.' : '',
          state: s.total > 0 ? 'loaded' : 'empty',
        };
      } catch { return { hero: '0d', sub: 'Longest: 0 days', state: 'error' }; }
    },
  },

  // ---- GOAL PROGRESS -----------------------------------------
  {
    id: 'goal-progress', type: DashboardTileType.METRIC, icon: '🏁', label: 'Goal Progress',
    accentVar: '--color-blue', navTarget: 'goal-progress', order: 11,
    renderData(appState, days, activeProgram, selectedDay, model) {
      try {
        const g = model.goal;
        let status, statusColor;
        if (!g.avgConsistency) { status = 'No data'; statusColor = 'var(--text-secondary)'; }
        else if (g.avgConsistency >= 80) { status = 'On Track'; statusColor = 'var(--color-green)'; }
        else if (g.avgConsistency >= 60) { status = 'Behind'; statusColor = 'var(--color-amber)'; }
        else { status = 'At Risk'; statusColor = 'var(--color-red)'; }
        return {
          hero: `${g.calPct}%`,
          sub: `Wk ${g.wk}/${g.total} · ${g.avgConsistency > 0 ? g.avgConsistency + '% avg consistency' : 'No data yet'}`,
          tag: status, tagColor: statusColor, state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- HRV (HEALTH CONNECT) ----------------------------------
  {
    id: 'hrv', type: DashboardTileType.METRIC, icon: '💓', label: 'HRV',
    accentVar: '--color-green', navTarget: 'recovery-score', order: 12, requiresHealth: true,
    renderData(appState) {
      try {
        const hc = appState.healthConnect; const log = hc?.hrv;
        if (!hc?.connected || !log?.length) return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        const sorted = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted[0].rmssd;
        const count30 = Math.min(sorted.length, 30);
        const avg30 = sorted.slice(0, count30).reduce((s, e) => s + e.rmssd, 0) / count30;
        const diff = Math.round(latest - avg30);
        // Higher HRV vs your own 30-day baseline signals better recovery.
        const delta = sorted.length > 1
          ? { dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', good: diff >= 0, label: `${diff > 0 ? '+' : ''}${diff}ms`, usePct: false }
          : null;
        return {
          hero: `${Math.round(latest)} ms`, sub: `${Math.round(avg30)} ms · 30-day avg`,
          delta, state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- RESTING HR (HEALTH CONNECT) ---------------------------
  {
    id: 'resting-hr', type: DashboardTileType.METRIC, icon: '❤️', label: 'Resting HR',
    accentVar: '--color-pink', navTarget: 'recovery-score', order: 13, requiresHealth: true,
    renderData(appState) {
      try {
        const hc = appState.healthConnect; const log = hc?.restingHR;
        if (!hc?.connected || !log?.length) return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        const sorted = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted[0].bpm;
        const count7 = Math.min(sorted.length, 7);
        const avg7 = sorted.slice(0, count7).reduce((s, e) => s + e.bpm, 0) / count7;
        const delta = latest - Math.round(avg7);
        return {
          hero: `${latest} bpm`, sub: `${Math.round(avg7)} bpm 7-day avg`,
          tag: `${delta <= 0 ? '' : '+'}${delta} vs 7d avg`, tagColor: delta <= 0 ? 'var(--color-green)' : 'var(--color-red)', state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- SLEEP (HEALTH CONNECT) --------------------------------
  {
    id: 'sleep', type: DashboardTileType.METRIC, icon: '🌙', label: 'Sleep',
    accentVar: '--color-blue', navTarget: 'recovery-score', order: 14, requiresHealth: true,
    renderData(appState) {
      try {
        const hc = appState.healthConnect; const log = hc?.sleep;
        if (!hc?.connected || !log?.length) return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        const sorted = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted[0];
        const count7 = Math.min(sorted.length, 7);
        const avg7hrs = sorted.slice(0, count7).reduce((s, e) => s + (e.totalHours || 0), 0) / count7;
        const h = Math.floor(latest.totalHours);
        const m = Math.round((latest.totalHours - h) * 60);
        return {
          hero: `${h}h ${m}m`, sub: 'Last night', tag: `${avg7hrs.toFixed(1)}h 7d avg`,
          tagColor: latest.totalHours >= 7.5 ? 'var(--color-green)' : latest.totalHours >= 6 ? 'var(--color-amber)' : 'var(--color-red)', state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- STEPS (HEALTH CONNECT) --------------------------------
  {
    id: 'steps', type: DashboardTileType.METRIC, icon: '👟', label: 'Steps',
    accentVar: '--color-amber', navTarget: 'recovery-score', order: 15, requiresHealth: true,
    renderData(appState) {
      try {
        const hc = appState.healthConnect; const log = hc?.steps;
        if (!hc?.connected || !log?.length) return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        const sorted = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const today = sorted[0].count;
        const count7 = Math.min(sorted.length, 7);
        const dailyAvg = Math.round(sorted.slice(0, count7).reduce((s, e) => s + e.count, 0) / count7);
        const goal = hc.stepGoal || 10000;
        const pctGoal = Math.min(100, Math.round((today / goal) * 100));
        return {
          hero: today.toLocaleString(), sub: `${dailyAvg.toLocaleString()} daily avg`, tag: `${pctGoal}% of goal`,
          tagColor: pctGoal >= 100 ? 'var(--color-green)' : pctGoal >= 75 ? 'var(--color-amber)' : 'var(--color-blue)', state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },

  // ---- VO₂ MAX (HEALTH CONNECT) ------------------------------
  {
    id: 'vo2max', type: DashboardTileType.METRIC, icon: '🫁', label: 'VO₂ Max',
    accentVar: '--color-pink', navTarget: 'vdot', order: 16, requiresHealth: true,
    renderData(appState) {
      try {
        const hc = appState.healthConnect; const log = hc?.vo2max;
        if (!hc?.connected || !log?.length) return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        const sorted = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted[0].value;
        const first = sorted[sorted.length - 1].value;
        const delta = latest - first;
        const fitness = latest >= 55 ? 'Excellent' : latest >= 45 ? 'Good' : latest >= 35 ? 'Average' : 'Below Avg';
        return {
          hero: `${latest.toFixed(1)}`, sub: `mL/kg/min · ${fitness}`,
          tag: sorted.length > 1 ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} all-time` : 'First reading',
          tagColor: delta >= 0 ? 'var(--color-green)' : 'var(--color-red)', state: 'loaded',
        };
      } catch { return { hero: '--', sub: 'Unavailable', state: 'error' }; }
    },
  },
];

// ==========================================
// DEFAULT-HIDDEN TILES (roadmap R4)
// New installs get a focused six — Today · Readiness · Training Status ·
// Weekly Volume · Body Weight · Streak — the tiles that drive decisions.
// Everything else stays one tap away in the tile customiser, and Insights is
// the encyclopedia. Users who have EVER saved a customisation keep their own
// list (this set only applies while dashboardTiles.hidden === null).
// ==========================================
export const DEFAULT_HIDDEN_TILES = Object.freeze([
  'program-hero', 'fasting', 'consistency', 'top-lifts', 'active-fuel',
  'avg-pace', 'stress-balance', 'goal-progress',
  'hrv', 'resting-hr', 'sleep', 'steps', 'vo2max',
]);

// Synthetic full-width tile shown in place of the five Health-Connect tiles
// when the Health app isn't linked — kills five dead "Setup" placeholders.
export const CONNECT_HEALTH_TILE = {
  id: 'connect-health', type: DashboardTileType.CONNECT, icon: '⌚', label: 'Connect Health',
  accentVar: '--color-blue', navTarget: 'custom:settings', order: 99,
  renderData() { return { state: 'loaded' }; },
};

// ==========================================
// NAVIGATION RESOLVER — emits 'app:navigate' carrying the raw navTarget.
// ==========================================
export function resolveTileNavigation(navTarget) {
  if (!navTarget) return null;
  return () => document.dispatchEvent(new CustomEvent('app:navigate', { detail: { target: navTarget } }));
}
