// @ts-check
// =============================================================================
// PROFILE STATS — pure computation + render helpers for the athlete profile.
// Extracted from athlete-profile.js. No module state: every function takes
// the data it needs (state / days) as parameters.
// =============================================================================
import { getCatalogEntry } from './programs/catalog.js';
import { getLiftDisplayName } from './engine.js';
import { getFastingContext, fmtHoursLabel, FASTING_ZONES } from './fasting.js';
import { allLiftsStats, big3Maxes } from './metrics/metrics-strength.js';

// ── Section helpers ───────────────────────────────────────────────────────────

export function _wellnessContext(state, days) {
  const ctx  = getFastingContext(state);
  days = days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const todayStr   = new Date().toISOString().slice(0, 10);
  const todayEntry = (state.wellnessLog || []).find(e => e.date === todayStr);

  const curWk  = state.currentWeek || '1';
  const wkData = (state.weeks || {})[String(curWk)];
  let totalRpe = 0, rpeCount = 0;
  if (wkData) {
    days.forEach(d => {
      const rRpe = parseInt(wkData.runs?.[d]?.rpe, 10) || 0;
      const gRpe = parseInt(wkData.gymRpe?.[d], 10) || 0;
      if (rRpe > 0) { totalRpe += rRpe; rpeCount++; }
      if (gRpe > 0) { totalRpe += gRpe; rpeCount++; }
    });
  }
  const rpeFactor = rpeCount > 0
    ? Math.max(0, Math.min(100, Math.round(((10 - totalRpe / rpeCount) / 9) * 100)))
    : null;

  let wellnessFactor = null;
  if (todayEntry) {
    const s  = Math.min(100, ((todayEntry.sleep || 0) / 8) * 100);
    const m  = ((todayEntry.mood || 3) / 5) * 100;
    const so = ((6 - (todayEntry.soreness || 3)) / 5) * 100;
    wellnessFactor = Math.max(0, Math.min(100, Math.round(s * 0.4 + m * 0.3 + so * 0.3)));
  }

  let recoveryScore = null;
  if (wellnessFactor !== null && rpeFactor !== null) recoveryScore = Math.round(rpeFactor * 0.55 + wellnessFactor * 0.45);
  else if (wellnessFactor !== null) recoveryScore = wellnessFactor;
  else if (rpeFactor !== null)      recoveryScore = rpeFactor;

  let recoveryLabel = '', recoveryColor = '#94a3b8';
  if (recoveryScore !== null) {
    if      (recoveryScore >= 80) { recoveryLabel = 'Well Recovered'; recoveryColor = '#10b981'; }
    else if (recoveryScore >= 60) { recoveryLabel = 'Moderate';       recoveryColor = '#f59e0b'; }
    else if (recoveryScore >= 40) { recoveryLabel = 'Fatigued';       recoveryColor = '#f97316'; }
    else                          { recoveryLabel = 'High Load';      recoveryColor = '#ef4444'; }
  }

  return { ctx, todayEntry, recoveryScore, recoveryLabel, recoveryColor };
}

export function _renderWellnessSection(state, days) {
  const { ctx, todayEntry, recoveryScore, recoveryLabel, recoveryColor } = _wellnessContext(state, days);

  // Summary line: fasting streak + check-in status
  const fastPart   = ctx.streak > 0 ? `🔥 ${ctx.streak}d fasting` : `${ctx.history.length} fasts logged`;
  const checkinPart = todayEntry ? '· ✓ Check-in done' : '';

  const scoreBadge = recoveryScore !== null
    ? `<span class="ws-card-score" style="color:${recoveryColor};">${recoveryScore}%</span>`
    : '';

  return `
    <div class="profile-section">
      <div class="profile-section-title">Wellness Hub</div>
      <div class="ws-summary-card profile-recent-row--clickable"
           data-action="open-wellness-detail"
           role="button" tabindex="0" aria-label="Open Wellness Hub">
        <div class="ws-summary-icon">🌿</div>
        <div class="ws-summary-info">
          <div class="ws-summary-title">${recoveryScore !== null ? recoveryLabel : 'Wellness & Fasting'}</div>
          <div class="ws-summary-sub">${fastPart} ${checkinPart}</div>
        </div>
        ${scoreBadge}
        <span class="profile-recent-chevron">›</span>
      </div>
    </div>
  `;
}

export function _renderWellnessSheetBody(state, days) {
  const { ctx, todayEntry, recoveryScore, recoveryLabel, recoveryColor } = _wellnessContext(state, days);
  const goal = state.fastingSession?.goal ?? 16;

  // ── 7-day wellness check-in grid ──────────────────────────────────────────
  const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const wellnessCells = Array.from({ length: 7 }, (_, i) => {
    const d   = new Date();
    d.setDate(d.getDate() - (6 - i));
    const ds  = d.toISOString().slice(0, 10);
    const ent = (state.wellnessLog || []).find(e => e.date === ds);
    let color = null;
    if (ent) {
      const s  = Math.min(100, ((ent.sleep || 0) / 8) * 100);
      const m  = ((ent.mood || 3) / 5) * 100;
      const so = ((6 - (ent.soreness || 3)) / 5) * 100;
      const sc = Math.round(s * 0.4 + m * 0.3 + so * 0.3);
      color = sc >= 70 ? '#10b981' : sc >= 45 ? '#f59e0b' : '#ef4444';
    }
    const cellStyle = color ? `background:${color}22;border-color:${color};` : '';
    return `<div class="ws-check-col">
      <div class="ws-check-cell${color ? ' ws-check-cell--filled' : ''}" style="${cellStyle}"></div>
      <div class="ws-check-day">${DAY_LETTERS[d.getDay()]}</div>
    </div>`;
  }).join('');

  // ── Fasting streak grid (last 14 days) ────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const streakCells = Array.from({ length: 14 }, (_, i) => {
    const day    = new Date(today.getTime() - (13 - i) * 86_400_000);
    const dayEnd = new Date(day.getTime() + 86_400_000);
    const fast   = ctx.history.find(h => { const e = new Date(h.endTime); return e >= day && e < dayEnd; });
    const isToday = i === 13;
    const filled  = fast ? (fast.durationHours >= (fast.goalHours ?? goal) ? 'full' : 'partial') : (isToday && ctx.active ? 'active' : 'empty');
    const zone    = fast ? FASTING_ZONES.find(z => fast.durationHours >= z.hoursStart && fast.durationHours < z.hoursEnd) : null;
    const color   = zone?.color ?? '#3b82f6';
    return `<div class="ws-streak-cell ws-streak-cell--${filled}" style="${filled !== 'empty' ? `background:${color}33;border-color:${color};` : ''}" title="${fast ? fmtHoursLabel(fast.durationHours) : (isToday && ctx.active ? 'In progress' : '—')}"></div>`;
  }).join('');

  const avgHours = ctx.history.length > 0
    ? ctx.history.reduce((s, h) => s + h.durationHours, 0) / ctx.history.length
    : 0;

  const hasWellnessHistory = (state.wellnessLog || []).length > 0;

  return `
    ${recoveryScore !== null ? `
      <div class="ws-recovery-row">
        <div class="ws-recovery-score" style="color:${recoveryColor};">${recoveryScore}<span class="ws-recovery-pct">%</span></div>
        <div class="ws-recovery-meta">
          <div class="ws-recovery-label" style="color:${recoveryColor};">${recoveryLabel}</div>
          <div class="ws-recovery-sub">Recovery Score</div>
        </div>
      </div>
    ` : ''}

    ${hasWellnessHistory || todayEntry ? `
      <div class="ws-subsection-title">Daily Check-In</div>
      ${todayEntry ? `
        <div class="ws-checkin-card">
          ${todayEntry.sleep    ? `<div class="ws-checkin-row"><span class="ws-checkin-lbl">Sleep</span><span class="ws-checkin-val">${todayEntry.sleep}h</span></div>` : ''}
          ${todayEntry.mood     ? `<div class="ws-checkin-row"><span class="ws-checkin-lbl">Mood</span><span class="ws-checkin-val ws-checkin-dots">${'●'.repeat(todayEntry.mood)}${'○'.repeat(5 - todayEntry.mood)}</span></div>` : ''}
          ${todayEntry.soreness ? `<div class="ws-checkin-row"><span class="ws-checkin-lbl">Soreness</span><span class="ws-checkin-val ws-checkin-dots">${'●'.repeat(todayEntry.soreness)}${'○'.repeat(5 - todayEntry.soreness)}</span></div>` : ''}
        </div>
      ` : `<p class="ws-empty ws-empty--inline">No check-in today — log one in Recovery analytics.</p>`}
      <div class="ws-check-grid">${wellnessCells}</div>
      <div class="ws-streak-legend"><span>7 days ago</span><span>Today</span></div>
    ` : ''}

    <div class="ws-subsection-title">Fasting</div>

    <div class="wellness-fast-summary">
      <div class="ws-stat"><div class="ws-stat-val">${ctx.streak}</div><div class="ws-stat-lbl">Day Streak</div></div>
      <div class="ws-stat"><div class="ws-stat-val">${fmtHoursLabel(ctx.weeklyHours)}</div><div class="ws-stat-lbl">This Week</div></div>
      <div class="ws-stat"><div class="ws-stat-val">${avgHours > 0 ? fmtHoursLabel(avgHours) : '—'}</div><div class="ws-stat-lbl">Avg Fast</div></div>
      <div class="ws-stat"><div class="ws-stat-val">${ctx.history.length}</div><div class="ws-stat-lbl">Total</div></div>
    </div>

    <div class="ws-streak-grid">${streakCells}</div>
    <div class="ws-streak-legend"><span>14 days ago</span><span>Today</span></div>

    ${ctx.history.length > 0 ? `
      <div class="ws-history-label">Recent Fasts</div>
      ${ctx.history.slice().reverse().slice(0, 5).map(h => {
        const date = new Date(h.endTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const zone = FASTING_ZONES.find(z => h.durationHours >= z.hoursStart && h.durationHours < z.hoursEnd)
                     ?? FASTING_ZONES[FASTING_ZONES.length - 1];
        const metG = h.durationHours >= (h.goalHours ?? goal);
        return `<div class="ws-fast-row">
          <span class="ws-fast-date">${date}</span>
          <span class="ws-fast-dur" style="color:${zone.color};">${zone.icon} ${fmtHoursLabel(h.durationHours)}</span>
          <span class="ws-fast-zone">${zone.name}</span>
          <span class="ws-fast-goal ${metG ? 'ws-fast-goal--met' : ''}">${metG ? '✓ Goal' : `/${h.goalHours ?? goal}h`}</span>
        </div>`;
      }).join('')}
    ` : '<p class="ws-empty">Start your first fast from the home screen.</p>'}
  `;
}

export function _renderHealthSection(state) {
  const hc = state.healthConnect;
  if (!hc?.connected) return '';

  const latestHRV   = hc.hrv?.slice(-1)[0]?.value;
  const latestRHR   = hc.restingHR?.slice(-1)[0]?.value;
  const latestVO2   = hc.vo2max?.slice(-1)[0]?.value;
  const latestSleep = hc.sleep?.slice(-1)[0]?.hours;

  if (!latestHRV && !latestRHR && !latestVO2 && !latestSleep) return '';

  return `
    <div class="profile-section">
      <div class="profile-section-title">Health Metrics</div>
      <div class="profile-stat-grid">
        ${latestHRV   ? _statCard(Math.round(latestHRV).toString(),   'HRV (ms)',   '💙', null) : ''}
        ${latestRHR   ? _statCard(Math.round(latestRHR).toString(),   'Resting HR', '❤️', null) : ''}
        ${latestVO2   ? _statCard(Math.round(latestVO2).toString(),   'VO₂ Max',   '🫀', 'var(--color-cyan)') : ''}
        ${latestSleep ? _statCard(latestSleep.toFixed(1) + 'h',      'Sleep',      '🌙', null) : ''}
      </div>
    </div>
  `;
}

const HEATMAP_ALPHA = [0, 0.32, 0.52, 0.72, 0.95];

function _heatmapCellStyle(type, level) {
  const a = HEATMAP_ALPHA[level] || 0;
  if (!type || level === 0) return '';
  if (type === 'lift') return `background:rgba(139,92,246,${a});`;
  if (type === 'run')  return `background:rgba(6,182,212,${a});`;
  // both
  return `background:linear-gradient(90deg,rgba(139,92,246,${a}),rgba(6,182,212,${a}));`;
}

// Body-weight trend section with an SVG sparkline (no chart lib needed).
export function _renderBodyWeightSection(state) {
  const bw = _bodyWeightTrend(state);
  if (!bw.hasData) return '';
  const unit = state.settings?.weightUnit || 'kg';

  const W = 300, H = 64, pad = 6;
  const pts = bw.points;
  const span = Math.max(1, bw.max - bw.min);
  const n = pts.length;
  const x = i => pad + (i / (n - 1)) * (W - pad * 2);
  const y = w => H - pad - ((w - bw.min) / span) * (H - pad * 2);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;

  const up = bw.delta > 0;
  const deltaHtml = bw.delta !== 0
    ? `<span class="profile-bw-delta profile-bw-delta--${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(bw.delta)} ${unit}</span>`
    : `<span class="profile-bw-delta">– stable</span>`;

  return `
    <div class="profile-section">
      <div class="profile-section-title">Body Weight</div>
      <div class="profile-bw-card">
        <div class="profile-bw-head">
          <div class="profile-bw-latest">${bw.latest}<span class="profile-bw-unit">${unit}</span></div>
          <div class="profile-bw-meta">${deltaHtml}<span class="profile-bw-sub">last 30 days</span></div>
        </div>
        <svg class="profile-bw-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(34,211,238,0.30)"/>
              <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#bwFill)"/>
          <path d="${line}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  `;
}

export function _renderHeatmap(rows, days) {
  const dayLetters = days.map(d => d[0].toUpperCase());
  const cols = `grid-template-columns:30px repeat(${days.length},1fr);`;

  const headCells = `<span class="profile-heatmap-rowlabel"></span>` +
    dayLetters.map(l => `<span class="profile-heatmap-day-label">${l}</span>`).join('');

  const bodyCells = rows.map(row =>
    `<span class="profile-heatmap-rowlabel">${row.label || ''}</span>` +
    row.cells.map(c => {
      const type = c.type, level = c.level;
      const cls = type && level ? ` profile-heatmap-cell--${type}` : '';
      return `<div class="profile-heatmap-cell${cls}" style="${_heatmapCellStyle(type, level)}"></div>`;
    }).join('')
  ).join('');

  return `
    <div class="profile-heatmap">
      <div class="profile-heatmap-day-labels" style="${cols}">${headCells}</div>
      <div class="profile-heatmap-grid" style="${cols}">${bodyCells}</div>
      <div class="profile-heatmap-legend">
        <span class="phm-legend-label">Less</span>
        ${[1,2,3,4].map(l => `<span class="profile-heatmap-cell phm-legend-cell" style="background:rgba(148,163,184,${HEATMAP_ALPHA[l]});"></span>`).join('')}
        <span class="phm-legend-label">More</span>
        <span class="phm-legend-sep"></span>
        <span class="phm-legend-key"><span class="phm-legend-dot" style="background:rgba(139,92,246,0.8)"></span>Lift</span>
        <span class="phm-legend-key"><span class="phm-legend-dot" style="background:rgba(6,182,212,0.8)"></span>Run</span>
      </div>
    </div>
  `;
}

// ── Data computation helpers ──────────────────────────────────────────────────

export function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function _isSet(s) {
  return (s.c === true || s.c === 'on' || s.c === 1) && !s.isWarmup;
}

export function _countTotalWorkouts(state, days) {
  let count = 0;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      const hasLifts = Object.keys(wkData?.lifts?.[d] || {}).some(l => {
        const sets = wkData.lifts[d][l];
        return Array.isArray(sets) && sets.some(_isSet);
      });
      const hasRun = parseFloat(wkData?.runs?.[d]?.dist) > 0;
      if (hasLifts || hasRun) count++;
    });
  }
  return count;
}

export function _computeWeekVolume(state, days, weekNum) {
  const wkData = (state.weeks || {})[String(weekNum)];
  if (!wkData) return 0;
  let volume = 0;
  days.forEach(d => {
    const dayLifts = wkData.lifts?.[d] || {};
    for (const lift in dayLifts) {
      if (!Array.isArray(dayLifts[lift])) continue;
      dayLifts[lift].forEach(s => {
        if (_isSet(s)) volume += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
      });
    }
  });
  return volume;
}

export function _computeWeekDistance(state, days, weekNum) {
  const wkData = (state.weeks || {})[String(weekNum)];
  if (!wkData) return 0;
  let dist = 0;
  days.forEach(d => { dist += parseFloat(wkData.runs?.[d]?.dist) || 0; });
  return dist;
}

export function _computeRunningPBs(state, days) {
  const brackets = [
    { label: '5K',       minKm: 4.5,  maxKm: 5.5  },
    { label: '10K',      minKm: 9,    maxKm: 11   },
    { label: 'Half',     minKm: 20,   maxKm: 22   },
    { label: 'Marathon', minKm: 41,   maxKm: 43   },
  ];
  const bests = {};

  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      const run = wkData?.runs?.[d];
      if (!run?.dist || !run?.time) return;
      const dist = parseFloat(run.dist);
      if (!dist) return;

      const parts = run.time.split(':').map(Number);
      let totalSecs = 0;
      if (parts.length === 2) totalSecs = parts[0] * 60 + parts[1];
      else if (parts.length === 3) totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
      if (!totalSecs) return;

      const paceSecs = totalSecs / dist;
      for (const bracket of brackets) {
        if (dist >= bracket.minKm && dist <= bracket.maxKm) {
          if (!bests[bracket.label] || totalSecs < bests[bracket.label].totalSecs) {
            bests[bracket.label] = { label: bracket.label, dist, timeStr: run.time, totalSecs, paceSecs };
          }
        }
      }
    });
  }

  return Object.values(bests).sort((a, b) => a.dist - b.dist);
}

// Latest logged body weight (canonical bodyWeightLog, newest entry). Returns
// number or null. Falls back to the most recent per-session bodyWeight entry.
export function _latestBodyWeight(state) {
  const log = (state.bodyWeightLog || []).filter(e => e && e.date && parseFloat(e.weight) > 0);
  if (log.length) {
    const latest = log.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b));
    return parseFloat(latest.weight);
  }
  // Fallback: scan per-session body weights (no reliable date, so just take any).
  for (const wkData of Object.values(state.weeks || {})) {
    for (const v of Object.values(wkData?.bodyWeight || {})) {
      const w = parseFloat(v);
      if (w > 0) return w;
    }
  }
  return null;
}

// Body-weight history for the trend chart. Returns the chronologically sorted
// points plus latest value and recent delta (vs ~30 days ago, or first point).
export function _bodyWeightTrend(state) {
  const log = (state.bodyWeightLog || [])
    .filter(e => e && e.date && parseFloat(e.weight) > 0)
    .map(e => ({ date: e.date, weight: parseFloat(e.weight) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (log.length < 2) return { hasData: false, points: log };

  const latest = log[log.length - 1];
  const target = new Date(latest.date); target.setDate(target.getDate() - 30);
  let ref = [...log].reverse().find(e => new Date(e.date) <= target) || log[0];
  const delta = Math.round((latest.weight - ref.weight) * 10) / 10;

  const weights = log.map(p => p.weight);
  return {
    hasData: true,
    points: log,
    latest: latest.weight,
    delta,
    min: Math.min(...weights),
    max: Math.max(...weights),
  };
}

// All-time totals across every logged week: lifting volume, run distance (km),
// and number of distinct training sessions.
export function _lifetimeTotals(state, days) {
  let volume = 0, distanceKm = 0, sessions = 0;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      let dayVol = 0, dayHasLift = false;
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          if (_isSet(s)) { dayVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); dayHasLift = true; }
        });
      }
      const runDist = parseFloat(wkData?.runs?.[d]?.dist) || 0;
      volume += dayVol;
      distanceKm += runDist;
      if (dayHasLift || runDist > 0) sessions++;
    });
  }
  return { volume, distanceKm, sessions };
}

// ── Athlete progression / level system ────────────────────────────────────────
// XP is earned from accumulated training. Levels follow a triangular curve so
// early levels come quickly and later ones require sustained work.
const XP_BASE = 300;

function _levelTitle(level) {
  if (level < 5)  return 'Newcomer';
  if (level < 10) return 'Rising';
  if (level < 20) return 'Committed';
  if (level < 35) return 'Seasoned';
  if (level < 50) return 'Elite';
  return 'Legend';
}

export function _athleteProgression(lifetime, completions, longestStreak, prCount) {
  const xp = Math.round(
    (lifetime.sessions || 0) * 50 +
    (lifetime.volume || 0) / 100 +
    (lifetime.distanceKm || 0) * 10 +
    (longestStreak || 0) * 20 +
    (completions || 0) * 200 +
    (prCount || 0) * 25
  );

  // Total XP to reach level L = XP_BASE * L*(L-1)/2  → invert for current level.
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / XP_BASE)) / 2));
  const xpAtLevel = XP_BASE * (level * (level - 1)) / 2;
  const xpForNext = XP_BASE * level; // span from this level to the next
  const xpIntoLevel = xp - xpAtLevel;
  const pct = Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100)));

  const milestones = [
    { icon: '🏁', label: 'First Session',   earned: (lifetime.sessions || 0) >= 1 },
    { icon: '📅', label: '50 Sessions',     earned: (lifetime.sessions || 0) >= 50 },
    { icon: '💯', label: '100 Sessions',    earned: (lifetime.sessions || 0) >= 100 },
    { icon: '🏋️', label: '100k Volume',     earned: (lifetime.volume || 0) >= 100000 },
    { icon: '🏃', label: '100km Club',      earned: (lifetime.distanceKm || 0) >= 100 },
    { icon: '🔥', label: '7-Day Streak',    earned: (longestStreak || 0) >= 7 },
    { icon: '⚡', label: '30-Day Streak',   earned: (longestStreak || 0) >= 30 },
    { icon: '🏆', label: 'Program Finisher', earned: (completions || 0) >= 1 },
  ];

  return { xp, level, title: _levelTitle(level), pct, xpIntoLevel: Math.round(xpIntoLevel), xpForNext, milestones };
}

export function _renderProgressionSection(prog) {
  const earned = prog.milestones.filter(m => m.earned).length;
  const badges = prog.milestones.map(m => `
    <div class="profile-badge${m.earned ? '' : ' profile-badge--locked'}" title="${_esc(m.label)}">
      <span class="profile-badge-icon">${m.icon}</span>
      <span class="profile-badge-label">${_esc(m.label)}</span>
    </div>
  `).join('');

  return `
    <div class="profile-section">
      <div class="profile-section-title">Athlete Level</div>
      <div class="profile-level-card">
        <div class="profile-level-top">
          <div class="profile-level-ring">
            <span class="profile-level-num">${prog.level}</span>
          </div>
          <div class="profile-level-info">
            <div class="profile-level-title">${prog.title}</div>
            <div class="profile-level-xp">${prog.xp.toLocaleString()} XP · ${prog.xpIntoLevel}/${prog.xpForNext} to Lv ${prog.level + 1}</div>
            <div class="profile-level-bar"><div class="profile-level-fill" style="width:${prog.pct}%"></div></div>
          </div>
        </div>
        <div class="profile-badges-head">Milestones <span class="profile-badges-count">${earned}/${prog.milestones.length}</span></div>
        <div class="profile-badge-grid">${badges}</div>
      </div>
    </div>
  `;
}

// Top lifts ranked by all-time e1RM (data-driven — every tracked lift, not a
// hardcoded list). Returns [{ name, displayName, e1rm }].
export function _topLiftsByE1rm(state, days, limit = 6) {
  const stats = allLiftsStats(state, days);
  return Object.entries(stats)
    .map(([name, s]) => ({ name, displayName: getLiftDisplayName(state, name), e1rm: s.allTimeMax }))
    .filter(l => l.e1rm > 0)
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, limit);
}

// Bodyweight-ratio standards per lift (ascending tier thresholds). Common
// rule-of-thumb breakpoints for Novice / Intermediate / Advanced / Elite.
const STRENGTH_STANDARDS = {
  Squat:    [1.0, 1.5, 2.0, 2.5],
  Bench:    [0.75, 1.0, 1.5, 2.0],
  Deadlift: [1.25, 1.75, 2.5, 3.0],
};
const STRENGTH_TIERS = [
  { name: 'Beginner',     color: '#94a3b8' },
  { name: 'Novice',       color: '#22d3ee' },
  { name: 'Intermediate', color: '#10b981' },
  { name: 'Advanced',     color: '#f59e0b' },
  { name: 'Elite',        color: '#ef4444' },
];

export function _strengthTier(label, ratio) {
  const thresholds = STRENGTH_STANDARDS[label];
  if (!thresholds) return STRENGTH_TIERS[0];
  let idx = 0;
  for (const t of thresholds) { if (ratio >= t) idx++; }
  return STRENGTH_TIERS[idx];
}

// Strength-to-bodyweight ratios for the big lifts, each classified into a
// strength-standard tier. Returns [{ label, e1rm, ratio, tier }].
export function _relativeStrength(state, bodyWeight) {
  if (!bodyWeight || bodyWeight <= 0) return [];
  const maxes = big3Maxes(state);
  return [
    { label: 'Squat',    e1rm: maxes.squat },
    { label: 'Bench',    e1rm: maxes.bench },
    { label: 'Deadlift', e1rm: maxes.deadlift },
  ].filter(i => i.e1rm > 0).map(i => {
    const ratio = i.e1rm / bodyWeight;
    return { ...i, ratio, tier: _strengthTier(i.label, ratio) };
  });
}

// Generic running stats so runners always see something (not just exact-bracket
// PBs). best pace is over runs ≥ 1km. Returns null fields when no data.
export function _runningStats(state, days) {
  let totalKm = 0, longestKm = 0, runCount = 0, bestPaceSecs = Infinity;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      const run  = wkData?.runs?.[d];
      const dist = parseFloat(run?.dist) || 0;
      if (dist <= 0) return;
      totalKm += dist;
      runCount++;
      if (dist > longestKm) longestKm = dist;
      if (run.time) {
        const parts = run.time.split(':').map(Number);
        let secs = 0;
        if (parts.length === 2)      secs = parts[0] * 60 + parts[1];
        else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (secs > 0 && dist >= 1) { const pace = secs / dist; if (pace < bestPaceSecs) bestPaceSecs = pace; }
      }
    });
  }
  return { totalKm, longestKm, runCount, bestPaceSecs: bestPaceSecs === Infinity ? null : bestPaceSecs };
}

// Compact number formatter for big stat values (124500 → "124.5k").
export function _compactNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000)    return Math.round(n / 1000) + 'k';
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}

// mm:ss pace formatter (seconds per km).
export function _fmtPace(secsPerKm) {
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Returns best e1RM (and lift name) across a group of lift-name variants.
export function _bestLiftFromGroup(state, days, liftNames) {
  let bestName = null, bestVal = 0;
  for (const liftName of liftNames) {
    for (const wkData of Object.values(state.weeks || {})) {
      for (const d of days) {
        const sets = wkData?.lifts?.[d]?.[liftName];
        if (!Array.isArray(sets)) continue;
        for (const s of sets) {
          if (!_isSet(s)) continue;
          const e = (parseFloat(s.w) || 0) * (1 + (parseInt(s.r, 10) || 0) / 30);
          if (e > bestVal) { bestVal = e; bestName = liftName; }
        }
      }
    }
  }
  return bestName ? { name: bestName, max: bestVal } : null;
}

// Compares best e1RM in last 4 weeks vs older history. Returns { diff, dir } or null.
export function _liftTrend(state, days, liftName) {
  const curWk = parseInt(state.currentWeek || '1', 10);
  if (curWk < 2) return null;

  const recentFrom = Math.max(2, curWk - 3);
  let recentBest = 0, olderBest = 0;

  for (const [wKey, wkData] of Object.entries(state.weeks || {})) {
    const w = parseInt(wKey, 10);
    for (const d of days) {
      const sets = wkData?.lifts?.[d]?.[liftName];
      if (!Array.isArray(sets)) continue;
      for (const s of sets) {
        if (!_isSet(s)) continue;
        const e = (parseFloat(s.w) || 0) * (1 + (parseInt(s.r, 10) || 0) / 30);
        if (e === 0) continue;
        if (w >= recentFrom) { if (e > recentBest) recentBest = e; }
        else                  { if (e > olderBest)  olderBest  = e; }
      }
    }
  }

  if (recentBest === 0 || olderBest === 0) return null;
  const diff = Math.round(recentBest - olderBest);
  if (diff === 0) return null;
  return { diff: Math.abs(diff), dir: diff > 0 ? 'up' : 'down' };
}

// Builds week × day activity data for the heatmap (newest week last). Each cell
// is { type: ''|'lift'|'run'|'both', level: 0-4 } where level grades training
// load (volume for lifts, distance for runs) relative to the period max. Rows
// carry a month label (GitHub-style: shown only when the month changes).
export function _heatmapData(state, days, numWeeks) {
  const curWk    = parseInt(state.currentWeek || '1', 10);
  const startWk  = Math.max(1, curWk - numWeeks + 1);

  // Week → representative start date (for month labels), mirroring _recentSessions.
  const DAY_JS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  let weekAnchor = null;
  if (state.weekStartedAt) {
    weekAnchor = new Date(state.weekStartedAt);
    const diff = (weekAnchor.getDay() - (DAY_JS[days[0]] ?? 1) + 7) % 7;
    weekAnchor.setDate(weekAnchor.getDate() - diff);
  }

  // First pass: raw per-day volume & distance to derive normalisation maxes.
  const raw = [];
  let maxVol = 0, maxDist = 0;
  for (let w = startWk; w <= curWk; w++) {
    const wkData = (state.weeks || {})[String(w)];
    const cells = days.map(d => {
      let vol = 0, dist = 0;
      if (wkData) {
        const dayLifts = wkData.lifts?.[d] || {};
        for (const l in dayLifts) {
          if (!Array.isArray(dayLifts[l])) continue;
          dayLifts[l].forEach(s => { if (_isSet(s)) vol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); });
        }
        dist = parseFloat(wkData.runs?.[d]?.dist) || 0;
      }
      if (vol > maxVol)   maxVol = vol;
      if (dist > maxDist) maxDist = dist;
      return { vol, dist };
    });
    raw.push({ week: w, cells });
  }

  const grade = (cell) => {
    const hasLift = cell.vol > 0, hasRun = cell.dist > 0;
    if (!hasLift && !hasRun) return { type: '', level: 0 };
    const type = hasLift && hasRun ? 'both' : hasLift ? 'lift' : 'run';
    const load = (maxVol > 0 ? cell.vol / maxVol : 0) + (maxDist > 0 ? cell.dist / maxDist : 0);
    const level = load >= 1.2 ? 4 : load >= 0.8 ? 3 : load >= 0.4 ? 2 : 1;
    return { type, level };
  };

  let prevMonth = null;
  return raw.map(row => {
    let label = '';
    if (weekAnchor) {
      const date = new Date(weekAnchor);
      date.setDate(date.getDate() - (curWk - row.week) * 7);
      const month = date.toLocaleDateString(undefined, { month: 'short' });
      if (month !== prevMonth) { label = month; prevMonth = month; }
    } else {
      label = `W${row.week}`;
    }
    return { week: row.week, label, cells: row.cells.map(grade) };
  });
}

// Per-week training summary: volume, distance, session count, training minutes.
export function _weekSummary(state, days, weekNum) {
  const wkData = (state.weeks || {})[String(weekNum)];
  let volume = 0, distanceKm = 0, sessions = 0, minutes = 0;
  if (!wkData) return { volume, distanceKm, sessions, minutes };
  days.forEach(d => {
    let dayVol = 0, dayHasLift = false;
    const dayLifts = wkData.lifts?.[d] || {};
    for (const l in dayLifts) {
      if (!Array.isArray(dayLifts[l])) continue;
      dayLifts[l].forEach(s => { if (_isSet(s)) { dayVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); dayHasLift = true; } });
    }
    const runDist = parseFloat(wkData.runs?.[d]?.dist) || 0;
    volume += dayVol;
    distanceKm += runDist;
    if (dayHasLift || runDist > 0) sessions++;
    minutes += _parseDurationMin(wkData.runs?.[d]?.time) + _parseDurationMin(wkData.gymStats?.[d]?.time);
  });
  return { volume, distanceKm, sessions, minutes };
}

// Lenient duration parser → minutes. Accepts "mm:ss", "h:mm:ss", or a plain
// number of minutes. Returns 0 for anything it can't confidently parse.
export function _parseDurationMin(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);          // plain minutes
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] + parts[1] / 60;            // mm:ss
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // h:mm:ss
  return 0;
}

// Returns last N active sessions, newest first.
export function _recentSessions(state, days, limit = 5) {
  const sessions = [];
  const curWk    = parseInt(state.currentWeek || '1', 10);

  // Normalise weekStartedAt to the start of the current logical week so that
  // date arithmetic aligns with the days[] array regardless of which weekday
  // the user happened to click "Next Week".
  const DAY_JS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  let weekAnchor = null;
  if (state.weekStartedAt) {
    weekAnchor = new Date(state.weekStartedAt);
    const jsDay    = weekAnchor.getDay();
    const firstJs  = DAY_JS[days[0]] ?? 1;
    const diff     = (jsDay - firstJs + 7) % 7;
    weekAnchor.setDate(weekAnchor.getDate() - diff);
  }

  outer: for (let w = curWk; w >= 1; w--) {
    const wkData = (state.weeks || {})[String(w)];
    if (!wkData) continue;

    for (let di = days.length - 1; di >= 0; di--) {
      const d = days[di];
      const liftDone = Object.keys(wkData.lifts?.[d] || {}).filter(l => {
        const sets = wkData.lifts[d][l];
        return Array.isArray(sets) && sets.some(_isSet);
      }).map(id => getLiftDisplayName(state, id));
      const runDist = parseFloat(wkData.runs?.[d]?.dist) || 0;
      if (liftDone.length === 0 && runDist === 0) continue;

      const type = liftDone.length > 0 && runDist > 0 ? 'both' : liftDone.length > 0 ? 'lift' : 'run';

      let dateLabel;
      if (weekAnchor) {
        const date = new Date(weekAnchor);
        date.setDate(date.getDate() - (curWk - w) * 7 + di);
        dateLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      } else {
        const dName = d.charAt(0).toUpperCase() + d.slice(1, 3);
        dateLabel = `Week ${w} · ${dName}`;
      }

      sessions.push({ type, dateLabel, liftDone, runDist, week: w, day: d });
      if (sessions.length >= limit) break outer;
    }
  }
  return sessions;
}

// ── Render helpers ────────────────────────────────────────────────────────────

export function _statCard(value, label, icon, accentColor, extra = '') {
  const style = accentColor ? `style="color: ${accentColor}"` : '';
  return `
    <div class="profile-stat-card">
      <div class="profile-stat-icon">${icon}</div>
      <div class="profile-stat-value" ${style}>${value}</div>
      <div class="profile-stat-label">${label}</div>
      ${extra}
    </div>
  `;
}

// Relative-strength tiles for the hero band (strength ÷ bodyweight), coloured
// and labelled by strength-standard tier.
export function _relStrengthBand(items, unit) {
  if (!items.length) return '';
  return `
    <div class="profile-rs-band">
      ${items.map(i => {
        const color = i.tier?.color || '#c4b5fd';
        return `
        <div class="profile-rs-tile" style="border-color:${color}38;background:linear-gradient(160deg, ${color}22, ${color}07);">
          <div class="profile-rs-ratio" style="color:${color};">${i.ratio.toFixed(2)}<span class="profile-rs-x">×BW</span></div>
          <div class="profile-rs-label">${_esc(i.label)}</div>
          <div class="profile-rs-sub" style="color:${color};">${i.tier?.name || ''}</div>
          <div class="profile-rs-e1rm">${Math.round(i.e1rm)}&nbsp;${unit}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

export function _prRow(liftName, e1rm, unit, trend, goal) {
  const safeName  = _esc(liftName);
  const trendHtml = trend
    ? `<span class="profile-pr-trend profile-pr-trend--${trend.dir}">${trend.dir === 'up' ? '↑' : '↓'} ${trend.diff}${unit}</span>`
    : '';

  const pct = goal ? Math.min(100, Math.round((e1rm / goal) * 100)) : 0;
  const goalHtml = goal ? `
    <div class="profile-pr-goal-bar"><div class="profile-pr-goal-fill" style="width:${pct}%"></div></div>
    <div class="profile-pr-goal-meta">${pct}% of ${goal}${unit} goal</div>
  ` : '';

  return `
    <div class="profile-pr-row${goal ? ' profile-pr-row--has-goal' : ''}">
      <div class="profile-pr-row-main">
        <span class="profile-pr-lift">${safeName}</span>
        <div class="profile-pr-row-right">
          <span class="profile-pr-value">${Math.round(e1rm)}&nbsp;${unit}&nbsp;<span class="profile-pr-tag">e1RM</span>${trendHtml}</span>
          <button class="profile-pr-set-goal-btn" data-action="set-pr-goal" data-lift="${safeName}" data-unit="${unit}" aria-label="Set goal for ${safeName}">${goal ? '✏' : '＋'}</button>
        </div>
      </div>
      ${goalHtml}
    </div>
  `;
}

export function _runPBRow(pb) {
  const mins = Math.floor(pb.totalSecs / 60);
  const secs = Math.round(pb.totalSecs % 60);
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const paceMin = Math.floor(pb.paceSecs / 60);
  const paceSec = Math.round(pb.paceSecs % 60);
  const paceFormatted = `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`;

  return `
    <div class="profile-pr-row">
      <span class="profile-pr-lift">${pb.label}</span>
      <span class="profile-pr-value">${timeFormatted} <span class="profile-pr-tag">${paceFormatted}</span></span>
    </div>
  `;
}

export function _recentRow(session) {
  const icons  = { lift: '🏋️', run: '🏃', both: '🔥' };
  const icon   = icons[session.type] || '🏋️';

  let desc = '';
  if (session.liftDone.length > 0) {
    const shown = session.liftDone.slice(0, 2).map(_esc).join(', ');
    const more  = session.liftDone.length > 2 ? ` +${session.liftDone.length - 2}` : '';
    desc = shown + more;
  }
  if (session.runDist > 0) {
    const runPart = `${session.runDist.toFixed(1)}km run`;
    desc = desc ? `${desc} · ${runPart}` : runPart;
  }

  return `
    <div class="profile-recent-row profile-recent-row--clickable"
         data-action="open-session-detail"
         data-week="${session.week}"
         data-day="${_esc(session.day)}"
         data-datelabel="${_esc(session.dateLabel)}"
         role="button" tabindex="0" aria-label="View ${_esc(session.dateLabel)} session details">
      <div class="profile-recent-icon profile-recent-icon--${session.type}">${icon}</div>
      <div class="profile-recent-info">
        <div class="profile-recent-date">${_esc(session.dateLabel)}</div>
        ${desc ? `<div class="profile-recent-desc">${desc}</div>` : ''}
      </div>
      <span class="profile-recent-chevron">›</span>
    </div>
  `;
}

export function _completionRow(completion) {
  const catalog = getCatalogEntry(completion.programId);
  if (!catalog) return '';
  const date = completion.completedAt
    ? new Date(completion.completedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '';
  return `
    <div class="profile-completion-row">
      <div class="profile-completion-icon" style="background: linear-gradient(135deg, ${catalog.coverGradient?.[0] || '#1a0e2e'}, ${catalog.coverGradient?.[1] || '#2d1a5c'})">
        ${catalog.icon || '📋'}
      </div>
      <div class="profile-completion-info">
        <div class="profile-completion-name">${catalog.name}</div>
        <div class="profile-completion-meta">${completion.weeksCompleted ? `${completion.weeksCompleted} weeks` : ''}${date ? ` · ${date}` : ''}</div>
      </div>
      <span class="profile-completion-badge">✓</span>
    </div>
  `;
}
