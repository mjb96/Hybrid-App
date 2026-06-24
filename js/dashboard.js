// ==========================================
// DASHBOARD TILE REGISTRY (dashboard.js)
// ==========================================
// Architecture: add a new tile by adding one entry to TILE_REGISTRY.
// Each entry is a DashboardTileConfig object — no other files need touching
// for basic tiles that navigate to an existing analytics context.
//
// DashboardTileConfig shape:
// {
//   id:          string          — unique key, matches HTML element id prefix
//   type:        DashboardTileType
//   icon:        string          — emoji icon
//   label:       string          — uppercase micro-label
//   accentVar:   string          — CSS var name for the icon/accent colour
//   navTarget:   string | null   — analytics context string, or 'custom' for special handlers
//   order:       number          — render order (lower = first)
//   renderData:  (appState, defaultDays) => DashboardTileData
// }
//
// DashboardTileData shape:
// {
//   hero:        string          — large primary value
//   sub?:        string          — optional secondary line
//   tag?:        string          — optional small tag/badge (coloured)
//   tagColor?:   string          — CSS colour string for the tag
//   extraHTML?:  string          — raw HTML injected below hero (for progress bars, etc.)
//   state:       'loaded'|'empty'|'error'
// }

import { dateKey } from './dates.js';
import { getFastingContext, fmtFastDuration, fmtHoursLabel } from './fasting.js';

// ==========================================
// TILE TYPE ENUM
// ==========================================
export const DashboardTileType = Object.freeze({
  METRIC:    'metric',    // Simple hero number + subtitle
  RING:      'ring',      // Progress ring (readiness)
  SPLIT_3:   'split_3',  // 3-row mini-table (top lifts)
  RATIO_BAR: 'ratio_bar', // Dual fill bar (stress balance)
  PROGRESS:  'progress',  // Count / total (consistency)
});

// ==========================================
// HELPER — parse run time string → total minutes
// ==========================================
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parseFloat(timeStr) || 0;
}

// ==========================================
// TILE REGISTRY
// To add a tile: push a new config object into this array.
// ==========================================
export const TILE_REGISTRY = [

  // ---- PROGRAM HERO -------------------------------------------
  {
    id:        'program-hero',
    type:      DashboardTileType.METRIC,
    icon:      '📋',
    label:     'Active Program',
    accentVar: '--color-blue',
    navTarget: 'goal-progress',
    order:     -1,
    renderData(appState, defaultDays, activeProgram) {
      try {
        if (!activeProgram) return { hero: 'No Program', sub: 'Select a program to begin.', state: 'empty' };
        const wk    = parseInt(appState.currentWeek, 10) || 1;
        const total = activeProgram.totalWeeks || 12;
        const pct   = Math.round((wk / total) * 100);
        const phaseWk = wk % 4 === 0 ? 'Deload' : wk <= Math.ceil(total / 3) ? 'Foundation' : wk <= Math.ceil(total * 2 / 3) ? 'Build' : 'Peak';
        const phase = activeProgram.weeks?.[String(wk)]?.phase || phaseWk;
        return {
          hero:     activeProgram.name || 'Program',
          sub:      `Week ${wk} of ${total} · ${phase}`,
          tag:      `${pct}% complete`,
          tagColor: pct >= 75 ? 'var(--color-green)' : pct >= 40 ? 'var(--color-amber)' : 'var(--color-blue)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- TODAY --------------------------------------------------
  {
    id:        'today',
    type:      DashboardTileType.METRIC,
    icon:      '📅',
    label:     'Today',
    accentVar: '--color-blue',
    navTarget: 'custom:today-summary',
    order:     0,
    renderData(appState, defaultDays, activeProgram, selectedDay) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: 'Rest', sub: 'No session planned.', state: 'empty' };

        const prog = activeProgram;
        const bp   = prog?.days?.[selectedDay] || {};

        const todayLifts = weekData.lifts?.[selectedDay] || {};
        const todayRun   = weekData.runs?.[selectedDay]  || {};
        let completedSets = 0, totalSets = 0;
        for (const lift in todayLifts) {
          if (Array.isArray(todayLifts[lift])) {
            totalSets     += todayLifts[lift].length;
            completedSets += todayLifts[lift].filter(s => s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)).length;
          }
        }
        const runDist = parseFloat(todayRun.dist) || 0;
        const isLogged = completedSets > 0 || runDist > 0;

        if (isLogged) {
          const completionPct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 100;
          const pctColor = completionPct >= 100 ? 'var(--color-green)' : completionPct >= 50 ? 'var(--color-amber)' : 'var(--color-red)';
          return {
            hero:     totalSets > 0 ? `${completionPct}%` : '✓ Done',
            sub:      `${completedSets}${totalSets > 0 ? '/' + totalSets : ''} sets${runDist > 0 ? ' · ' + (appState.settings?.distanceUnit === 'mi' ? (runDist * 0.621371).toFixed(2) + ' mi' : runDist + ' km') : ''}`,
            tag:      completionPct >= 100 ? 'Complete' : `${completionPct}% done`,
            tagColor: pctColor,
            state:    'loaded',
          };
        }

        return {
          hero:     bp.title || 'Rest Day',
          sub:      (bp.desc || 'No session planned.').substring(0, 40),
          tag:      bp.badge || 'Rest',
          tagColor: bp.color || 'var(--color-blue)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- READINESS ----------------------------------------------
  {
    id:        'readiness',
    type:      DashboardTileType.RING,
    icon:      '❤️',
    label:     'Readiness',
    accentVar: '--color-green',
    navTarget: 'recovery',
    order:     1,
    renderData(appState, defaultDays) {
      try {
        const wk       = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];

        // RPE signal — this week's average perceived exertion
        let totalRpe = 0, rpeCount = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
            const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
            if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
            if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
          });
        }
        const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : 0;

        // Load balance signal — EWMA ATL/CTL stored on every save
        const { atl = 0, ctl = 0 } = appState.loadMetrics || {};
        const hasLoad = ctl > 0;
        const tsb  = hasLoad ? ctl - atl : 0;   // positive = fresher than baseline
        const acwr = hasLoad ? Math.round((atl / ctl) * 100) / 100 : 0;

        if (!hasLoad && rpeCount === 0) {
          return { hero: 'Adpt', sub: 'Log sessions for readiness.', ringPct: 0, ringColor: 'var(--color-blue)', state: 'empty' };
        }

        // Overreach zone: ACWR > 1.5 is an immediate flag regardless of RPE
        if (hasLoad && acwr > 1.5) {
          return { hero: 'Risk', sub: `ACWR ${acwr} — reduce load now.`, ringPct: 15, ringColor: 'var(--color-red)', state: 'loaded' };
        }

        // Composite: TSB + ACWR driving primary state, RPE as secondary modifier
        if (hasLoad) {
          const sub = `ACWR ${acwr} · RPE ${rpeCount > 0 ? avgRpe.toFixed(1) : '--'}`;
          if (tsb > 0 && (rpeCount === 0 || avgRpe < 7)) {
            return { hero: 'Prime', sub, ringPct: 95, ringColor: 'var(--color-green)', state: 'loaded' };
          }
          if (acwr <= 1.0 || (tsb >= -5 && (rpeCount === 0 || avgRpe < 8))) {
            return { hero: 'Good',  sub, ringPct: 72, ringColor: 'var(--color-green)', state: 'loaded' };
          }
          if (acwr <= 1.3) {
            return { hero: 'Fair',  sub, ringPct: 48, ringColor: 'var(--color-amber)', state: 'loaded' };
          }
          return   { hero: 'Taxed', sub, ringPct: 25, ringColor: 'var(--color-red)',   state: 'loaded' };
        }

        // Fallback: RPE only (no session duration logged yet for EWMA)
        if (avgRpe < 6) return { hero: 'High',  sub: 'Well rested. Push intensity.',  ringPct: 90, ringColor: 'var(--color-green)', state: 'loaded' };
        if (avgRpe < 8) return { hero: 'Fair',  sub: 'Fatigue building. Sleep well.', ringPct: 55, ringColor: 'var(--color-amber)', state: 'loaded' };
        return                 { hero: 'Warn',  sub: 'High fatigue. Drop volume.',     ringPct: 25, ringColor: 'var(--color-red)',   state: 'loaded' };
      } catch {
        return { hero: '--', sub: 'Unavailable', ringPct: 0, ringColor: 'var(--color-blue)', state: 'error' };
      }
    },
  },

  // ---- CONSISTENCY -------------------------------------------
  {
    id:        'consistency',
    type:      DashboardTileType.PROGRESS,
    icon:      '🎯',
    label:     'Consistency',
    accentVar: '--color-blue',
    navTarget: 'progress',
    order:     2,
    renderData(appState, defaultDays, activeProgram) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { done: 0, total: 0, sub: 'Weekly tasks ticked', state: 'empty' };

        let total = 0, done = 0;
        defaultDays.forEach(dKey => {
          const bp = activeProgram?.days?.[dKey];
          const isRunScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
          if (isRunScheduled) total++;
          const rDist = parseFloat(weekData.runs?.[dKey]?.dist) || 0;
          if (isRunScheduled && rDist > 0) done++;

          const dayLifts = weekData.lifts?.[dKey] || {};
          for (const lift in dayLifts) {
            if (Array.isArray(dayLifts[lift])) {
              dayLifts[lift].forEach(s => {
                total++;
                if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) done++;
              });
            }
          }
        });

        return { done, total, sub: 'Weekly tasks ticked', state: done > 0 ? 'loaded' : 'empty' };
      } catch {
        return { done: 0, total: 0, sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- BODY WEIGHT -------------------------------------------
  {
    id:        'bodyweight',
    type:      DashboardTileType.METRIC,
    icon:      '⚖️',
    label:     'Body Weight',
    accentVar: '--color-green',
    navTarget: 'bodyweight',
    order:     3,
    renderData(appState) {
      try {
        const bwLog = appState.bodyWeightLog || [];
        if (bwLog.length === 0) return { hero: '-- kg', sub: 'vs 7 days ago', tag: '-- 7d', tagColor: 'var(--text-secondary)', state: 'empty' };

        const sorted = [...bwLog].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest = sorted[0];
        const targetDate = new Date(latest.date);
        targetDate.setDate(targetDate.getDate() - 7);
        let old = sorted.find(e => new Date(e.date) <= targetDate);
        if (!old && sorted.length > 1) old = sorted[sorted.length - 1];

        let tag = '-- 7d', tagColor = 'var(--text-secondary)';
        if (old && old.date !== latest.date) {
          const diff = latest.weight - old.weight;
          const sign = diff > 0 ? '+' : '';
          tag      = `${sign}${diff.toFixed(1)} kg 7d`;
          tagColor = diff > 0 ? 'var(--color-red)' : 'var(--color-green)';
        }

        return { hero: `${latest.weight.toFixed(1)} kg`, sub: 'vs 7 days ago', tag, tagColor, state: 'loaded' };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- TOP LIFTS (1RM) ---------------------------------------
  {
    id:        'top-lifts',
    type:      DashboardTileType.SPLIT_3,
    icon:      '💪',
    label:     'Top Lifts (1RM)',
    accentVar: '--color-blue',
    navTarget: 'strength_pr',
    order:     4,
    renderData(appState) {
      try {
        // Inline 1RM estimation — mirrors computeEstimated1RMs logic
        let sq = 0, bp = 0, dl = 0;
        const sqNames = ['back squat', 'squat', 'front squat'];
        const bpNames = ['bench press', 'incline bench press', 'incline barbell press'];
        const dlNames = ['deadlift', 'romanian deadlift', 'deficit deadlift'];

        const check = (name, weight, reps) => {
          const e1rm = weight * (1 + reps / 30);
          const n = name.toLowerCase();
          if (sqNames.some(k => n.includes(k))) { if (e1rm > sq) sq = e1rm; }
          else if (bpNames.some(k => n.includes(k))) { if (e1rm > bp) bp = e1rm; }
          else if (dlNames.some(k => n.includes(k))) { if (e1rm > dl) dl = e1rm; }
        };

        for (const wk in appState.weeks || {}) {
          const lifts = appState.weeks[wk]?.lifts || {};
          for (const day in lifts) {
            for (const lift in lifts[day]) {
              if (Array.isArray(lifts[day][lift])) {
                // Resolve opaque ID → display name so keyword matching works
                const displayName = appState.liftNames?.[lift] || lift;
                lifts[day][lift].forEach(s => {
                  if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1) && s.type !== 'W' && !s.isWarmup) {
                    const w = parseFloat(s.w) || 0;
                    const r = parseInt(s.r, 10) || 0;
                    if (w > 0 && r > 0) check(displayName, w, r);
                  }
                });
              }
            }
          }
        }

        const fmt = v => v > 0 ? `${Math.round(v)} kg` : '-- kg';
        return {
          rows: [
            { label: 'SQ', value: fmt(sq) },
            { label: 'BP', value: fmt(bp) },
            { label: 'DL', value: fmt(dl) },
          ],
          state: (sq > 0 || bp > 0 || dl > 0) ? 'loaded' : 'empty',
        };
      } catch {
        return { rows: [{ label: 'SQ', value: '--' }, { label: 'BP', value: '--' }, { label: 'DL', value: '--' }], state: 'error' };
      }
    },
  },

  // ---- ACTIVE FUEL -------------------------------------------
  {
    id:        'active-fuel',
    type:      DashboardTileType.METRIC,
    icon:      '🔥',
    label:     'Active Fuel',
    accentVar: '--color-amber',
    navTarget: 'running',
    order:     5,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        let cals = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            cals += parseInt(weekData.runs?.[d]?.cals, 10) || 0;
            cals += parseInt(weekData.gymStats?.[d]?.cals, 10) || 0;
          });
        }
        return { hero: cals.toLocaleString(), sub: 'kcal burned this week', state: cals > 0 ? 'loaded' : 'empty' };
      } catch {
        return { hero: '0', sub: 'kcal burned this week', state: 'error' };
      }
    },
  },

  // ---- AVG PACE ----------------------------------------------
  {
    id:        'avg-pace',
    type:      DashboardTileType.METRIC,
    icon:      '⏱️',
    label:     'Avg Pace',
    accentVar: '--color-pink',
    navTarget: 'avg-pace',
    order:     6,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        let totalDist = 0, totalMins = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            const r = weekData.runs?.[d];
            if (!r) return;
            const dist = parseFloat(r.dist) || 0;
            const mins = parseTimeToMinutes(r.time);
            if (dist > 0 && mins > 0) { totalDist += dist; totalMins += mins; }
          });
        }
        if (totalDist > 0 && totalMins > 0) {
          const distUnit = appState.settings?.distanceUnit || 'km';
          const displayDist = distUnit === 'mi' ? totalDist * 0.621371 : totalDist;
          const paceMin = totalMins / displayDist;
          const pm = Math.floor(paceMin);
          const ps = Math.round((paceMin - pm) * 60).toString().padStart(2, '0');
          return { hero: `${pm}:${ps}`, sub: `min/${distUnit} this week`, state: 'loaded' };
        }
        return { hero: '--:--', sub: `min/${appState.settings?.distanceUnit || 'km'} this week`, state: 'empty' };
      } catch {
        return { hero: '--:--', sub: 'min/km this week', state: 'error' };
      }
    },
  },

  // ---- STRESS BALANCE ----------------------------------------
  {
    id:        'stress-balance',
    type:      DashboardTileType.RATIO_BAR,
    icon:      '⚖️',
    label:     'Stress Balance',
    accentVar: '--color-amber',
    navTarget: 'stress-balance',
    order:     7,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        let gymTSS = 0, runTSS = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            // Gym TSS: prefer sRPE × duration (mins); fall back to sets × RPE × 4 (est. ~4 min/set)
            const gRpe    = parseInt(weekData.gymRpe?.[d], 10) || 0;
            const gymMins = parseFloat(weekData.gymStats?.[d]?.time) || 0;
            const dayLifts = weekData.lifts?.[d] || {};
            let completedSets = 0;
            for (const lift in dayLifts) {
              if (Array.isArray(dayLifts[lift])) {
                completedSets += dayLifts[lift].filter(s => s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)).length;
              }
            }
            if (gymMins > 0 && gRpe > 0) {
              gymTSS += gymMins * gRpe;
            } else if (completedSets > 0) {
              gymTSS += completedSets * (gRpe > 0 ? gRpe : 6) * 4;
            }

            // Run TSS: prefer sRPE × duration (mins); fall back to dist × RPE × 8 (est. ~8 min/km)
            const rDist = parseFloat(weekData.runs?.[d]?.dist) || 0;
            const rRpe  = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
            const rMins = parseTimeToMinutes(weekData.runs?.[d]?.time);
            if (rMins > 0 && rRpe > 0) {
              runTSS += rMins * rRpe;
            } else if (rDist > 0) {
              runTSS += rDist * (rRpe > 0 ? rRpe : 6) * 8;
            }
          });
        }

        if (gymTSS === 0 && runTSS === 0) {
          return { label: 'No data logged', advice: 'Log workouts to see your bias.', liftPct: 50, runPct: 50, state: 'empty' };
        }
        const total = gymTSS + runTSS;
        const liftPct = Math.round((gymTSS / total) * 100);
        const runPct  = 100 - liftPct;
        let advice = '🏆 Perfect balance.';
        if (liftPct >= 70) advice = '⚠️ Heavy lifting bias.';
        else if (runPct >= 70) advice = '⚠️ High running stress.';
        return { label: `${liftPct}% / ${runPct}%`, advice, liftPct, runPct, state: 'loaded' };
      } catch {
        return { label: '0% / 0%', advice: 'Unavailable', liftPct: 50, runPct: 50, state: 'error' };
      }
    },
  },

  // ---- RECOVERY SCORE (NEW) ----------------------------------
  {
    id:        'recovery-score',
    type:      DashboardTileType.METRIC,
    icon:      '🛌',
    label:     'Recovery Score',
    accentVar: '--color-green',
    navTarget: 'recovery-score',
    order:     8,
    renderData(appState, defaultDays) {
      try {
        const wk       = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];

        // Component 1: RPE fatigue factor (0-100, higher = better recovered)
        let totalRpe = 0, rpeCount = 0;
        if (weekData) {
          defaultDays.forEach(d => {
            const rRpe = parseInt(weekData.runs?.[d]?.rpe, 10) || 0;
            const gRpe = parseInt(weekData.gymRpe?.[d], 10) || 0;
            if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
            if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
          });
        }
        const avgRpe    = rpeCount > 0 ? totalRpe / rpeCount : 0;
        const rpeFactor = rpeCount > 0 ? Math.round(Math.max(0, Math.min(100, ((10 - avgRpe) / 9) * 100))) : null;

        // Component 2: Load balance factor from ACWR (0-100)
        const { atl = 0, ctl = 0 } = appState.loadMetrics || {};
        const hasLoad = ctl > 0;
        let acwrFactor = null;
        if (hasLoad) {
          const acwr = atl / ctl;
          if      (acwr <= 0.8) acwrFactor = 80;
          else if (acwr <= 1.0) acwrFactor = 100;
          else if (acwr <= 1.3) acwrFactor = Math.round(100 - ((acwr - 1.0) / 0.3) * 60);
          else if (acwr <= 1.5) acwrFactor = Math.round(40  - ((acwr - 1.3) / 0.2) * 35);
          else                  acwrFactor = 5;
          acwrFactor = Math.max(0, Math.min(100, acwrFactor));
        }

        // Component 3: Wellness factor (sleep, mood, soreness) — 0-100
        const today = new Date().toISOString().slice(0, 10);
        const todayWellness = (appState.wellnessLog || []).find(e => e.date === today);
        let wellnessFactor = null;
        if (todayWellness) {
          const sleepScore    = Math.min(100, ((todayWellness.sleep || 0) / 8) * 100);
          const moodScore     = ((todayWellness.mood || 3) / 5) * 100;
          const sorenessScore = ((6 - (todayWellness.soreness || 3)) / 5) * 100;
          wellnessFactor = Math.round(sleepScore * 0.4 + moodScore * 0.3 + sorenessScore * 0.3);
          wellnessFactor = Math.max(0, Math.min(100, wellnessFactor));
        }

        // Composite score — weights shift when wellness data is present
        let score, subLine;
        const components = [rpeFactor, acwrFactor, wellnessFactor].filter(v => v !== null).length;
        if (components === 0) {
          return { hero: '--', sub: 'Log sessions for score', tag: 'N/A', tagColor: 'var(--text-secondary)', state: 'empty' };
        }
        if (wellnessFactor !== null && rpeFactor !== null && acwrFactor !== null) {
          score   = Math.round(rpeFactor * 0.35 + acwrFactor * 0.25 + wellnessFactor * 0.40);
          subLine = `Fatigue ${rpeFactor}%  ·  Load ${acwrFactor}%  ·  Wellness ${wellnessFactor}%`;
        } else if (wellnessFactor !== null && rpeFactor !== null) {
          score   = Math.round(rpeFactor * 0.55 + wellnessFactor * 0.45);
          subLine = `Fatigue ${rpeFactor}%  ·  Wellness ${wellnessFactor}%`;
        } else if (wellnessFactor !== null && acwrFactor !== null) {
          score   = Math.round(acwrFactor * 0.45 + wellnessFactor * 0.55);
          subLine = `Load ${acwrFactor}%  ·  Wellness ${wellnessFactor}%`;
        } else if (wellnessFactor !== null) {
          score   = wellnessFactor;
          subLine = `Wellness check-in only · log workouts for full score`;
        } else if (rpeFactor !== null && acwrFactor !== null) {
          score   = Math.round(rpeFactor * 0.6 + acwrFactor * 0.4);
          subLine = `Fatigue ${rpeFactor}%  ·  Load ${acwrFactor}%`;
        } else if (rpeFactor !== null) {
          score   = rpeFactor;
          subLine = `RPE fatigue index · add session duration for full score`;
        } else {
          score   = acwrFactor;
          subLine = `Load balance score · log RPE for full data`;
        }

        let tagColor = 'var(--color-green)';
        if (score < 40) tagColor = 'var(--color-red)';
        else if (score < 70) tagColor = 'var(--color-amber)';

        return { hero: `${score}%`, sub: subLine, tag: `${score}%`, tagColor, state: 'loaded' };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- WEEKLY VOLUME (NEW) -----------------------------------
  {
    id:        'weekly-volume',
    type:      DashboardTileType.METRIC,
    icon:      '📦',
    label:     'Weekly Volume',
    accentVar: '--color-blue',
    navTarget: 'weekly-volume',
    order:     9,
    renderData(appState, defaultDays) {
      try {
        const wk = appState.currentWeek || '1';
        const weekData = appState.weeks?.[wk];
        if (!weekData) return { hero: '0 kg', sub: '0 sets · 0 reps', state: 'empty' };

        let totalVol = 0, totalSets = 0, totalReps = 0;
        defaultDays.forEach(d => {
          const dayLifts = weekData.lifts?.[d] || {};
          for (const lift in dayLifts) {
            if (Array.isArray(dayLifts[lift])) {
              dayLifts[lift].forEach(s => {
                if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) {
                  const w = parseFloat(s.w) || 0;
                  const r = parseInt(s.r, 10) || 0;
                  totalVol  += w * r;
                  totalSets += 1;
                  totalReps += r;
                }
              });
            }
          }
        });

        const heroStr = totalVol >= 1000
          ? `${(totalVol / 1000).toFixed(1)}t`
          : `${Math.round(totalVol)} kg`;

        return {
          hero:  heroStr,
          sub:   `${totalSets} sets · ${totalReps} reps`,
          state: totalVol > 0 ? 'loaded' : 'empty',
        };
      } catch {
        return { hero: '0 kg', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- TRAINING STREAK (NEW) ---------------------------------
  {
    id:        'streak',
    type:      DashboardTileType.METRIC,
    icon:      '🔥',
    label:     'Training Streak',
    accentVar: '--color-amber',
    navTarget: 'streak',
    order:     10,
    renderData(appState, defaultDays) {
      try {
        // Build a sorted list of dates with any completed activity
        const activeDates = new Set();
        for (const wk in appState.weeks || {}) {
          const wkData = appState.weeks[wk];
          defaultDays.forEach(d => {
            const rDist = parseFloat(wkData?.runs?.[d]?.dist) || 0;
            let completedSets = 0;
            const dayLifts = wkData?.lifts?.[d] || {};
            for (const lift in dayLifts) {
              if (Array.isArray(dayLifts[lift])) {
                completedSets += dayLifts[lift].filter(s => s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)).length;
              }
            }
            if (rDist > 0 || completedSets > 0) {
              // Use week number & day position as a proxy since we don't store absolute dates per set
              // We'll use the week-day combo with a deterministic offset from weekStartedAt if available
              const weekNum = parseInt(wk, 10) || 1;
              const dayIdx  = defaultDays.indexOf(d);
              // Generate an approximate ISO date string
              const base  = appState.weekStartedAt ? new Date(appState.weekStartedAt) : new Date();
              const approx = new Date(base);
              approx.setDate(base.getDate() - ((parseInt(appState.currentWeek, 10) - weekNum) * 7) + dayIdx);
              activeDates.add(dateKey(approx));
            }
          });
        }

        // Compute current streak (consecutive days back from today)
        const today = new Date();
        let streak = 0, longest = 0, tempStreak = 0;
        const sorted = [...activeDates].sort();

        // Simple consecutive-day streak from today going backwards
        for (let i = 0; i <= 90; i++) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const ds = dateKey(d);
          if (activeDates.has(ds)) {
            if (i === streak) streak++;
          } else {
            if (i === streak) break;
          }
        }

        // Longest streak over all data
        let prev = null;
        sorted.forEach(ds => {
          if (prev) {
            const diff = (new Date(ds) - new Date(prev)) / 86400000;
            tempStreak = diff === 1 ? tempStreak + 1 : 1;
          } else {
            tempStreak = 1;
          }
          if (tempStreak > longest) longest = tempStreak;
          prev = ds;
        });

        return {
          hero:  `${streak}d`,
          sub:   `Longest: ${longest} days`,
          tag:   streak > 0 ? `🔥 ${streak}` : 'Start today',
          tagColor: streak >= 7 ? 'var(--color-amber)' : 'var(--color-blue)',
          state: activeDates.size > 0 ? 'loaded' : 'empty',
        };
      } catch {
        return { hero: '0d', sub: 'Longest: 0 days', state: 'error' };
      }
    },
  },

  // ---- GOAL PROGRESS (NEW) -----------------------------------
  {
    id:        'goal-progress',
    type:      DashboardTileType.METRIC,
    icon:      '🏁',
    label:     'Goal Progress',
    accentVar: '--color-blue',
    navTarget: 'goal-progress',
    order:     11,
    renderData(appState, defaultDays, activeProgram) {
      try {
        const wk    = parseInt(appState.currentWeek, 10) || 1;
        const total = activeProgram?.totalWeeks || 12;
        const calPct = Math.round((wk / total) * 100);

        // Performance consistency: average across every logged week so far
        let totalConsistency = 0, weeksWithData = 0;
        for (let w = 1; w <= wk; w++) {
          const wData = appState.weeks?.[String(w)];
          if (!wData) continue;
          let wDone = 0, wTotal = 0;
          defaultDays.forEach(dKey => {
            const bp = activeProgram?.days?.[dKey];
            const isRunScheduled = bp?.runs && !bp.runs.toLowerCase().includes('no structured') && bp.runs.toLowerCase() !== 'rest';
            if (isRunScheduled) wTotal++;
            const rDist = parseFloat(wData.runs?.[dKey]?.dist) || 0;
            if (isRunScheduled && rDist > 0) wDone++;
            const dayLifts = wData.lifts?.[dKey] || {};
            for (const lift in dayLifts) {
              if (Array.isArray(dayLifts[lift])) {
                dayLifts[lift].forEach(s => {
                  wTotal++;
                  if (s && (s.c === true || s.c === 'true' || s.c === 'on' || s.c === 1)) wDone++;
                });
              }
            }
          });
          if (wTotal > 0) { totalConsistency += wDone / wTotal; weeksWithData++; }
        }
        const avgConsistency = weeksWithData > 0 ? Math.round((totalConsistency / weeksWithData) * 100) : 0;

        let status, statusColor;
        if (!weeksWithData)          { status = 'No data';   statusColor = 'var(--text-secondary)'; }
        else if (avgConsistency >= 80) { status = 'On Track';  statusColor = 'var(--color-green)'; }
        else if (avgConsistency >= 60) { status = 'Behind';    statusColor = 'var(--color-amber)'; }
        else                           { status = 'At Risk';   statusColor = 'var(--color-red)'; }

        return {
          hero:     `${calPct}%`,
          sub:      `Wk ${wk}/${total} · ${weeksWithData > 0 ? avgConsistency + '% avg consistency' : 'No data yet'}`,
          tag:      status,
          tagColor: statusColor,
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },
  // ---- HRV (HEALTH CONNECT) ----------------------------------------
  {
    id:        'hrv',
    type:      DashboardTileType.RING,
    icon:      '💓',
    label:     'HRV',
    accentVar: '--color-green',
    navTarget: 'recovery-score',
    order:     12,
    renderData(appState) {
      try {
        const hc  = appState.healthConnect;
        const log = hc?.hrv;
        if (!hc?.connected || !log?.length) {
          return { hero: '--', sub: 'Connect Health app', ringPct: 0, ringColor: 'var(--color-blue)', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        }
        const sorted  = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest  = sorted[0].rmssd;
        const count30 = Math.min(sorted.length, 30);
        const avg30   = sorted.slice(0, count30).reduce((s, e) => s + e.rmssd, 0) / count30;
        const delta   = latest - avg30;
        const ringPct = Math.min(100, Math.round((latest / 100) * 100));
        return {
          hero:      `${Math.round(latest)}ms`,
          sub:       `${Math.round(avg30)}ms 30-day avg`,
          tag:       `${delta >= 0 ? '+' : ''}${Math.round(delta)} vs 30d`,
          tagColor:  delta >= 0 ? 'var(--color-green)' : 'var(--color-red)',
          ringPct,
          ringColor: delta >= 0 ? 'var(--color-green)' : 'var(--color-amber)',
          state:     'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', ringPct: 0, ringColor: 'var(--color-blue)', state: 'error' };
      }
    },
  },

  // ---- RESTING HR (HEALTH CONNECT) ---------------------------------
  {
    id:        'resting-hr',
    type:      DashboardTileType.METRIC,
    icon:      '❤️',
    label:     'Resting HR',
    accentVar: '--color-pink',
    navTarget: 'recovery-score',
    order:     13,
    renderData(appState) {
      try {
        const hc  = appState.healthConnect;
        const log = hc?.restingHR;
        if (!hc?.connected || !log?.length) {
          return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        }
        const sorted  = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest  = sorted[0].bpm;
        const count7  = Math.min(sorted.length, 7);
        const avg7    = sorted.slice(0, count7).reduce((s, e) => s + e.bpm, 0) / count7;
        const delta   = latest - Math.round(avg7);
        return {
          hero:     `${latest} bpm`,
          sub:      `${Math.round(avg7)} bpm 7-day avg`,
          tag:      `${delta <= 0 ? '' : '+'}${delta} vs 7d avg`,
          tagColor: delta <= 0 ? 'var(--color-green)' : 'var(--color-red)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- SLEEP (HEALTH CONNECT) --------------------------------------
  {
    id:        'sleep',
    type:      DashboardTileType.METRIC,
    icon:      '🌙',
    label:     'Sleep',
    accentVar: '--color-blue',
    navTarget: 'recovery-score',
    order:     14,
    renderData(appState) {
      try {
        const hc  = appState.healthConnect;
        const log = hc?.sleep;
        if (!hc?.connected || !log?.length) {
          return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        }
        const sorted  = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest  = sorted[0];
        const count7  = Math.min(sorted.length, 7);
        const avg7hrs = sorted.slice(0, count7).reduce((s, e) => s + (e.totalHours || 0), 0) / count7;
        const h = Math.floor(latest.totalHours);
        const m = Math.round((latest.totalHours - h) * 60);
        return {
          hero:     `${h}h ${m}m`,
          sub:      'Last night',
          tag:      `${avg7hrs.toFixed(1)}h 7d avg`,
          tagColor: latest.totalHours >= 7.5 ? 'var(--color-green)' : latest.totalHours >= 6 ? 'var(--color-amber)' : 'var(--color-red)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- STEPS (HEALTH CONNECT) --------------------------------------
  {
    id:        'steps',
    type:      DashboardTileType.METRIC,
    icon:      '👟',
    label:     'Steps',
    accentVar: '--color-amber',
    navTarget: 'recovery-score',
    order:     15,
    renderData(appState) {
      try {
        const hc  = appState.healthConnect;
        const log = hc?.steps;
        if (!hc?.connected || !log?.length) {
          return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        }
        const sorted   = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const today    = sorted[0].count;
        const count7   = Math.min(sorted.length, 7);
        const dailyAvg = Math.round(sorted.slice(0, count7).reduce((s, e) => s + e.count, 0) / count7);
        const goal     = hc.stepGoal || 10000;
        const pctGoal  = Math.min(100, Math.round((today / goal) * 100));
        return {
          hero:     today.toLocaleString(),
          sub:      `${dailyAvg.toLocaleString()} daily avg`,
          tag:      `${pctGoal}% of goal`,
          tagColor: pctGoal >= 100 ? 'var(--color-green)' : pctGoal >= 75 ? 'var(--color-amber)' : 'var(--color-blue)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- FASTING -----------------------------------------------------
  {
    id:        'fasting',
    type:      DashboardTileType.METRIC,
    icon:      '⏱️',
    label:     'Fasting',
    accentVar: '--color-amber',
    navTarget: 'custom:fasting',
    order:     17,
    renderData(appState) {
      try {
        const ctx = getFastingContext(appState);
        if (ctx.active) {
          return {
            hero:     fmtFastDuration(ctx.hours),
            sub:      ctx.zone.name,
            tag:      `${Math.round(ctx.progressPct)}% of ${ctx.goal}h`,
            tagColor: ctx.zone.color,
            state:    'loaded',
          };
        }
        if (ctx.history.length > 0) {
          const last = ctx.history[ctx.history.length - 1];
          return {
            hero:  fmtHoursLabel(last.durationHours),
            sub:   'Last fast',
            tag:   `${ctx.streak}d streak`,
            tagColor: ctx.streak > 0 ? 'var(--color-amber)' : 'var(--text-secondary)',
            state: 'loaded',
          };
        }
        return { hero: '—', sub: 'Tap to start a fast', state: 'empty' };
      } catch {
        return { hero: '—', sub: 'Unavailable', state: 'error' };
      }
    },
  },

  // ---- VO₂ MAX (HEALTH CONNECT) ------------------------------------
  {
    id:        'vo2max',
    type:      DashboardTileType.METRIC,
    icon:      '🫁',
    label:     'VO₂ Max',
    accentVar: '--color-pink',
    navTarget: 'vdot',
    order:     16,
    renderData(appState) {
      try {
        const hc  = appState.healthConnect;
        const log = hc?.vo2max;
        if (!hc?.connected || !log?.length) {
          return { hero: '--', sub: 'Connect Health app', tag: 'Setup', tagColor: 'var(--color-blue)', state: 'empty' };
        }
        const sorted  = [...log].sort((a, b) => new Date(b.date) - new Date(a.date));
        const latest  = sorted[0].value;
        const first   = sorted[sorted.length - 1].value;
        const delta   = latest - first;
        const fitness = latest >= 55 ? 'Excellent' : latest >= 45 ? 'Good' : latest >= 35 ? 'Average' : 'Below Avg';
        return {
          hero:     `${latest.toFixed(1)}`,
          sub:      `mL/kg/min · ${fitness}`,
          tag:      sorted.length > 1 ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} all-time` : 'First reading',
          tagColor: delta >= 0 ? 'var(--color-green)' : 'var(--color-red)',
          state:    'loaded',
        };
      } catch {
        return { hero: '--', sub: 'Unavailable', state: 'error' };
      }
    },
  },
];

// ==========================================
// NAVIGATION RESOLVER
// Emits an 'app:navigate' event carrying the raw navTarget.
// app.js owns the routing (sentinel 'custom:today-summary' → modal,
// any other target → analytics context). No reverse import on app.js.
// ==========================================
export function resolveTileNavigation(navTarget) {
  if (!navTarget) return null;
  return () => document.dispatchEvent(
    new CustomEvent('app:navigate', { detail: { target: navTarget } })
  );
}