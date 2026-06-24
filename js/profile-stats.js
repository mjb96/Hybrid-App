// @ts-check
// =============================================================================
// PROFILE STATS — pure computation + render helpers for the athlete profile.
// Extracted from athlete-profile.js. No module state: every function takes
// the data it needs (state / days) as parameters.
// =============================================================================
import { getCatalogEntry } from './programs/catalog.js';
import { getLiftDisplayName } from './engine.js';
import { getFastingContext, fmtHoursLabel, FASTING_ZONES } from './fasting.js';

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

export function _renderHeatmap(rows, days) {
  const dayLetters = days.map(d => d[0].toUpperCase());
  const cells = rows.flatMap(row =>
    row.cells.map(type =>
      `<div class="profile-heatmap-cell${type ? ` profile-heatmap-cell--${type}` : ''}"></div>`
    )
  ).join('');

  return `
    <div class="profile-heatmap">
      <div class="profile-heatmap-day-labels">
        ${dayLetters.map(l => `<span class="profile-heatmap-day-label">${l}</span>`).join('')}
      </div>
      <div class="profile-heatmap-grid">${cells}</div>
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

// Builds week × day activity data for heatmap (newest week last).
export function _heatmapData(state, days, numWeeks) {
  const curWk    = parseInt(state.currentWeek || '1', 10);
  const startWk  = Math.max(1, curWk - numWeeks + 1);
  const rows = [];

  for (let w = startWk; w <= curWk; w++) {
    const wkData = (state.weeks || {})[String(w)];
    const cells = days.map(d => {
      if (!wkData) return '';
      const hasLifts = Object.keys(wkData.lifts?.[d] || {}).some(l => {
        const sets = wkData.lifts[d][l];
        return Array.isArray(sets) && sets.some(_isSet);
      });
      const hasRun = parseFloat(wkData.runs?.[d]?.dist) > 0;
      return hasLifts && hasRun ? 'both' : hasLifts ? 'lift' : hasRun ? 'run' : '';
    });
    rows.push({ week: w, cells });
  }
  return rows;
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
