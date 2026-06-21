// =============================================================================
// ATHLETE PROFILE — Personal training identity and performance summary
// =============================================================================
import { getCatalogEntry, DIFFICULTY_LABELS } from './programs/catalog.js';
import { big3Maxes } from './metrics/metrics-strength.js';
import { getLiftDisplayName } from './engine.js';
import { getFastingContext, fmtHoursLabel, FASTING_ZONES } from './fasting.js';

let _getState  = null;
let _getDays   = null;
let _saveState = null;

const OHP_NAMES = ['Standing Barbell OHP', 'Standing OHP', 'Seated DB Shoulder Press'];
const ROW_NAMES = ['Barbell Bent-Over Row', 'Barbell Row', 'Chest Supported Dumbbell Row', 'Chest Supported Row', 'Single-Arm DB Row', 'Single Arm DB Row'];

export function initAthleteProfile(getStateFn, getDaysFn, saveStateFn) {
  _getState  = getStateFn;
  _getDays   = getDaysFn;
  _saveState = saveStateFn;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderAthleteProfile() {
  const container = document.getElementById('profileContent');
  if (!container || !_getState) return;

  const state = _getState();
  const days  = _getDays ? _getDays() : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const name    = state.settings?.name?.trim() || 'Athlete';
  const initials = name !== 'Athlete'
    ? name.split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';

  const activeCatalog = state.activeProgramId ? getCatalogEntry(state.activeProgramId) : null;
  const streak        = state.streakData?.current || 0;
  const longestStreak = state.streakData?.longest || 0;
  const completions   = state.programLibrary?.completions || [];
  const totalWorkouts = _countTotalWorkouts(state, days);
  const weightUnit    = state.settings?.weightUnit || 'kg';
  const prGoals       = state.prGoals || {};

  // Strength PRs + trends
  const maxes        = big3Maxes(state);
  const ohpBest      = _bestLiftFromGroup(state, days, OHP_NAMES);
  const rowBest      = _bestLiftFromGroup(state, days, ROW_NAMES);
  const hasStrengthData = maxes.squat > 0 || maxes.bench > 0 || maxes.deadlift > 0 || !!ohpBest || !!rowBest;

  const squatTrend    = _liftTrend(state, days, 'Back Squat');
  const benchTrend    = _liftTrend(state, days, 'Bench Press');
  const deadliftTrend = _liftTrend(state, days, 'Deadlift');
  const ohpTrend      = ohpBest ? _liftTrend(state, days, ohpBest.name) : null;
  const rowTrend      = rowBest ? _liftTrend(state, days, rowBest.name) : null;

  // Running PBs
  const runningPBs    = _computeRunningPBs(state, days);
  const hasRunningData = runningPBs.length > 0;

  // Weekly volumes + trend
  const curWkStr      = state.currentWeek || '1';
  const prevWkStr     = String(Math.max(1, parseInt(curWkStr, 10) - 1));
  const currentWeekVolume = _computeWeekVolume(state, days, curWkStr);
  const prevWeekVolume    = parseInt(curWkStr, 10) > 1 ? _computeWeekVolume(state, days, prevWkStr) : 0;
  const weeklyDistKm  = _computeWeekDistance(state, days, curWkStr);
  const volumeTrendPct = (prevWeekVolume > 0 && currentWeekVolume > 0)
    ? Math.round(((currentWeekVolume - prevWeekVolume) / prevWeekVolume) * 100)
    : null;

  // Heatmap + recent sessions
  const heatmapRows    = _heatmapData(state, days, 12);
  const recentSessions = _recentSessions(state, days, 5);

  container.innerHTML = `
    <!-- Profile Hero -->
    <div class="profile-hero">
      <div class="profile-hero-avatar">${initials}</div>
      <div class="profile-hero-info">
        <h1 class="profile-hero-name">${name}</h1>
        <div class="profile-hero-sub">Hybrid Athlete</div>
      </div>
      <button class="profile-settings-btn" data-action="open-settings" aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>

    <!-- Athlete Summary -->
    <div class="profile-section">
      <div class="profile-section-title">Athlete Summary</div>
      <div class="profile-stat-grid">
        ${_statCard(streak > 0 ? streak.toString() : '0', 'Day Streak', streak > 0 ? '🔥' : '💤', streak > 0 ? 'var(--color-amber)' : null)}
        ${_statCard(completions.length.toString(), 'Programs', '🏆', completions.length > 0 ? 'var(--color-green)' : null)}
        ${_statCard(totalWorkouts > 0 ? totalWorkouts.toString() : '0', 'Workouts', '🏋️', null)}
        ${_statCard(longestStreak > 0 ? longestStreak.toString() : '0', 'Best Streak', '⚡', null)}
      </div>
    </div>

    <!-- Activity Heatmap -->
    ${heatmapRows.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Training Activity</div>
        ${_renderHeatmap(heatmapRows, days)}
      </div>
    ` : ''}

    <!-- Active Program -->
    ${activeCatalog ? `
      <div class="profile-section">
        <div class="profile-section-title">Current Program</div>
        <div class="profile-active-program" data-action="switch-tab" data-target="program">
          <div class="profile-active-prog-cover"
               style="background: linear-gradient(135deg, ${activeCatalog.coverGradient?.[0] || '#1a0e2e'}, ${activeCatalog.coverGradient?.[1] || '#2d1a5c'})">
            <span class="profile-active-prog-icon">${activeCatalog.icon || '📋'}</span>
          </div>
          <div class="profile-active-prog-info">
            <div class="profile-active-prog-name">${activeCatalog.name}</div>
            <div class="profile-active-prog-meta">
              Week ${state.currentWeek || 1} of ${activeCatalog.durationWeeks || 12}
              · ${DIFFICULTY_LABELS[activeCatalog.difficulty]?.label || 'Intermediate'}
            </div>
            <div class="profile-active-prog-bar">
              <div class="profile-active-prog-fill"
                   style="width: ${Math.min(100, Math.round(((state.currentWeek || 1) / (activeCatalog.durationWeeks || 12)) * 100))}%;
                          background: ${activeCatalog.accentColor || '#8b5cf6'}">
              </div>
            </div>
          </div>
          <span class="profile-active-prog-arrow">›</span>
        </div>
      </div>
    ` : `
      <div class="profile-section">
        <div class="profile-section-title">Current Program</div>
        <div class="profile-empty-card">
          <div class="profile-empty-icon">📋</div>
          <div class="profile-empty-text">No active program</div>
          <button class="profile-empty-cta" data-action="switch-tab" data-target="program">Browse Programs</button>
        </div>
      </div>
    `}

    <!-- Performance Summary -->
    ${hasStrengthData || hasRunningData ? `
      <div class="profile-section">
        <div class="profile-section-title">Performance</div>

        ${hasStrengthData ? `
          <div class="profile-subsection-title">Strength PRs (e1RM)</div>
          <div class="profile-pr-list">
            ${maxes.squat    > 0 ? _prRow('Back Squat',   maxes.squat,    weightUnit, squatTrend,    prGoals['Back Squat'])    : ''}
            ${maxes.bench    > 0 ? _prRow('Bench Press',  maxes.bench,    weightUnit, benchTrend,    prGoals['Bench Press'])   : ''}
            ${maxes.deadlift > 0 ? _prRow('Deadlift',     maxes.deadlift, weightUnit, deadliftTrend, prGoals['Deadlift'])      : ''}
            ${ohpBest             ? _prRow(ohpBest.name,  ohpBest.max,    weightUnit, ohpTrend,      prGoals[ohpBest.name])    : ''}
            ${rowBest             ? _prRow(rowBest.name,  rowBest.max,    weightUnit, rowTrend,      prGoals[rowBest.name])    : ''}
          </div>
        ` : ''}

        ${hasRunningData ? `
          <div class="profile-subsection-title" style="margin-top: 16px;">Running PBs</div>
          <div class="profile-pr-list">
            ${runningPBs.map(pb => _runPBRow(pb)).join('')}
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- Training Overview (current week) -->
    ${(currentWeekVolume > 0 || weeklyDistKm > 0) ? `
      <div class="profile-section">
        <div class="profile-section-title">This Week</div>
        <div class="profile-stat-grid profile-stat-grid--2">
          ${currentWeekVolume > 0 ? _statCard(
            `${Math.round(currentWeekVolume).toLocaleString()} ${weightUnit}`,
            'Lifting Volume',
            '🏋️',
            null,
            volumeTrendPct !== null
              ? `<span class="profile-trend-chip profile-trend-chip--${volumeTrendPct >= 0 ? 'up' : 'down'}">${volumeTrendPct >= 0 ? '↑' : '↓'} ${Math.abs(volumeTrendPct)}% vs last wk</span>`
              : ''
          ) : ''}
          ${weeklyDistKm > 0 ? _statCard(
            `${weeklyDistKm.toFixed(1)} ${state.settings?.distanceUnit || 'km'}`,
            'Distance Run',
            '🏃',
            null
          ) : ''}
        </div>
      </div>
    ` : ''}

    <!-- Health Metrics -->
    ${_renderHealthSection(state)}

    <!-- Wellness Hub -->
    ${_renderWellnessSection(state)}

    <!-- Recent Sessions -->
    ${recentSessions.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Recent Sessions</div>
        <div class="profile-recent-list">
          ${recentSessions.map(s => _recentRow(s)).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Completed Programs -->
    ${completions.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Completed Programs</div>
        <div class="profile-completions-list">
          ${completions.slice().reverse().slice(0, 5).map(c => _completionRow(c)).join('')}
        </div>
      </div>
    ` : ''}

    <div style="height: 80px;"></div>
  `;
}

// ── Section helpers ───────────────────────────────────────────────────────────

function _wellnessContext(state) {
  const ctx  = getFastingContext(state);
  const days = _getDays ? _getDays() : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

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

function _renderWellnessSection(state) {
  const { ctx, todayEntry, recoveryScore, recoveryLabel, recoveryColor } = _wellnessContext(state);

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

function _renderWellnessSheetBody(state) {
  const { ctx, todayEntry, recoveryScore, recoveryLabel, recoveryColor } = _wellnessContext(state);
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

function _renderHealthSection(state) {
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

function _renderHeatmap(rows, days) {
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

function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _isSet(s) {
  return (s.c === true || s.c === 'on' || s.c === 1) && !s.isWarmup;
}

function _countTotalWorkouts(state, days) {
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

function _computeWeekVolume(state, days, weekNum) {
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

function _computeWeekDistance(state, days, weekNum) {
  const wkData = (state.weeks || {})[String(weekNum)];
  if (!wkData) return 0;
  let dist = 0;
  days.forEach(d => { dist += parseFloat(wkData.runs?.[d]?.dist) || 0; });
  return dist;
}

function _computeRunningPBs(state, days) {
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
function _bestLiftFromGroup(state, days, liftNames) {
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
function _liftTrend(state, days, liftName) {
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
function _heatmapData(state, days, numWeeks) {
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
function _recentSessions(state, days, limit = 5) {
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

function _statCard(value, label, icon, accentColor, extra = '') {
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

function _prRow(liftName, e1rm, unit, trend, goal) {
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

function _runPBRow(pb) {
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

function _recentRow(session) {
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

function _completionRow(completion) {
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

// ── Session detail modal ──────────────────────────────────────────────────────

function openSessionDetailModal(el) {
  if (!_getState) return;
  const week      = el.getAttribute('data-week');
  const day       = el.getAttribute('data-day');
  const dateLabel = el.getAttribute('data-datelabel') || `Week ${week}`;
  if (!week || !day) return;

  const state      = _getState();
  const weekData   = (state.weeks || {})[week];
  const modal      = document.getElementById('sessionDetailModal');
  const body       = document.getElementById('sessionDetailBody');
  const dateEl     = document.getElementById('sessionDetailDate');
  if (!modal || !body) return;

  if (dateEl) dateEl.textContent = dateLabel;

  const weightUnit = state.settings?.weightUnit || 'kg';
  let html = '';

  if (weekData) {
    // ── Lifts ─────────────────────────────────────────────────────────────────
    const dayLifts  = weekData.lifts?.[day] || {};
    const liftMeta  = weekData.liftMeta?.[day] || {};

    // Build superset group map (mirrors cockpit render logic)
    const groupMap = {};
    for (const ln of Object.keys(dayLifts)) {
      const gId = liftMeta[ln]?.groupId;
      if (gId) {
        if (!groupMap[gId]) groupMap[gId] = [];
        if (!groupMap[gId].includes(ln)) groupMap[gId].push(ln);
      }
    }

    // Produce ordered list matching cockpit render order exactly:
    // iterate storage order, but when a superset is first encountered pull all
    // its members together (same as the cockpit does with renderedLifts).
    const seen = new Set();
    const orderedLifts = [];
    for (const liftName of Object.keys(dayLifts)) {
      if (seen.has(liftName)) continue;
      const gId     = liftMeta[liftName]?.groupId;
      const members = gId && groupMap[gId]?.length > 1 ? groupMap[gId] : null;
      if (members) {
        members.forEach(m => { if (!seen.has(m)) { orderedLifts.push(m); seen.add(m); } });
      } else {
        orderedLifts.push(liftName);
        seen.add(liftName);
      }
    }

    // Keep only exercises that have at least one completed set
    const liftNames = orderedLifts.filter(l => {
      const sets = dayLifts[l];
      return Array.isArray(sets) && sets.some(s => s && s.c);
    });

    if (liftNames.length > 0) {
      html += `<div class="sds-section"><div class="sds-section-title">Exercises</div>`;
      liftNames.forEach(lift => {
        const allSets       = dayLifts[lift];
        const completedSets = allSets.filter(s => s && s.c);
        if (completedSets.length === 0) return;
        const displayName = getLiftDisplayName(state, lift);
        html += `<div class="sds-lift"><div class="sds-lift-name">${_esc(displayName)}</div>`;
        let workingSetNum = 0;
        completedSets.forEach(s => {
          const isWarmup = s.type === 'W';
          if (!isWarmup) workingSetNum++;
          const typeLabel = isWarmup ? 'Warmup' : s.type === 'D' ? `Drop ${workingSetNum}` : s.type === 'F' ? 'Fail' : `Set ${workingSetNum}`;
          const wt        = parseFloat(s.w) || 0;
          const reps      = parseInt(s.r, 10) || 0;
          const prBadge   = s.isPR ? ' <span class="sds-pr-badge">PR</span>' : '';
          const rpeText   = s.rpe ? ` · RPE ${_esc(String(s.rpe))}` : '';
          html += `<div class="sds-set-row${isWarmup ? ' sds-set-row--warmup' : ''}">
            <span class="sds-set-label">${typeLabel}</span>
            <span class="sds-set-detail">${wt}&nbsp;${weightUnit}&nbsp;×&nbsp;${reps}&nbsp;reps${rpeText}${prBadge}</span>
          </div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;

      // Gym stats
      const gymStats    = weekData.gymStats?.[day] || {};
      const gymRpe      = weekData.gymRpe?.[day] || '';
      const hasGymStats = gymStats.time || gymStats.avgHR || gymStats.maxHR || gymStats.cals || gymRpe;
      if (hasGymStats) {
        html += `<div class="sds-section"><div class="sds-section-title">Gym Stats</div>`;
        if (gymStats.time)  html += `<div class="sds-stat-row"><span class="sds-stat-label">Duration</span><span class="sds-stat-value">${_esc(gymStats.time)}</span></div>`;
        if (gymStats.avgHR) html += `<div class="sds-stat-row"><span class="sds-stat-label">Avg HR</span><span class="sds-stat-value">${_esc(gymStats.avgHR)} bpm</span></div>`;
        if (gymStats.maxHR) html += `<div class="sds-stat-row"><span class="sds-stat-label">Max HR</span><span class="sds-stat-value">${_esc(gymStats.maxHR)} bpm</span></div>`;
        if (gymStats.cals)  html += `<div class="sds-stat-row"><span class="sds-stat-label">Calories</span><span class="sds-stat-value">${_esc(gymStats.cals)} kcal</span></div>`;
        if (gymRpe)         html += `<div class="sds-stat-row"><span class="sds-stat-label">Session RPE</span><span class="sds-stat-value">${_esc(gymRpe)} / 10</span></div>`;
        html += `</div>`;
      }
    }

    // ── Run ───────────────────────────────────────────────────────────────────
    const runData = weekData.runs?.[day] || {};
    const runDist = parseFloat(runData.dist) || 0;
    if (runDist > 0 || runData.time) {
      html += `<div class="sds-section"><div class="sds-section-title">Run</div>`;
      if (runDist > 0)   html += `<div class="sds-stat-row"><span class="sds-stat-label">Distance</span><span class="sds-stat-value">${runDist.toFixed(2)} km</span></div>`;
      if (runData.time)  html += `<div class="sds-stat-row"><span class="sds-stat-label">Time</span><span class="sds-stat-value">${_esc(runData.time)}</span></div>`;
      if (runData.pace)  html += `<div class="sds-stat-row"><span class="sds-stat-label">Pace</span><span class="sds-stat-value">${_esc(runData.pace)} /km</span></div>`;
      if (runData.avgHR) html += `<div class="sds-stat-row"><span class="sds-stat-label">Avg HR</span><span class="sds-stat-value">${_esc(runData.avgHR)} bpm</span></div>`;
      if (runData.maxHR) html += `<div class="sds-stat-row"><span class="sds-stat-label">Max HR</span><span class="sds-stat-value">${_esc(runData.maxHR)} bpm</span></div>`;
      if (runData.elev)  html += `<div class="sds-stat-row"><span class="sds-stat-label">Elevation</span><span class="sds-stat-value">${_esc(runData.elev)} m</span></div>`;
      if (runData.cals)  html += `<div class="sds-stat-row"><span class="sds-stat-label">Calories</span><span class="sds-stat-value">${_esc(runData.cals)} kcal</span></div>`;
      if (runData.rpe)   html += `<div class="sds-stat-row"><span class="sds-stat-label">RPE</span><span class="sds-stat-value">${_esc(runData.rpe)} / 10</span></div>`;
      if (runData.notes?.trim()) html += `<div class="sds-stat-row sds-stat-row--notes"><span class="sds-stat-label">Notes</span><span class="sds-stat-value sds-notes-value">${_esc(runData.notes)}</span></div>`;
      html += `</div>`;
    }

    // ── Body weight ───────────────────────────────────────────────────────────
    const bw = weekData.bodyWeight?.[day];
    if (bw) {
      html += `<div class="sds-section"><div class="sds-section-title">Body</div>`;
      html += `<div class="sds-stat-row"><span class="sds-stat-label">Body Weight</span><span class="sds-stat-value">${_esc(bw)} ${weightUnit}</span></div>`;
      html += `</div>`;
    }

    // ── Session notes ─────────────────────────────────────────────────────────
    const sessionNotes = weekData.notes?.[day] || '';
    if (sessionNotes.trim()) {
      html += `<div class="sds-section"><div class="sds-section-title">Notes</div>`;
      html += `<p class="sds-notes-value">${_esc(sessionNotes)}</p>`;
      html += `</div>`;
    }
  }

  if (!html) {
    html = '<p class="text-sm text-muted">No data found for this session.</p>';
  }

  body.innerHTML = html;
  modal.classList.add('active');
}

function closeSessionDetailModal() {
  document.getElementById('sessionDetailModal')?.classList.remove('active');
}

// ── Action handler ────────────────────────────────────────────────────────────

export function handleProfileAction(action, el) {
  if (action === 'set-pr-goal') {
    if (!_getState) return;
    const liftName = el.getAttribute('data-lift');
    const unit     = el.getAttribute('data-unit') || 'kg';
    if (!liftName) return;

    const current = (_getState().prGoals || {})[liftName];
    const titleEl    = document.getElementById('prGoalTitle');
    const subtitleEl = document.getElementById('prGoalSubtitle');
    const inputEl    = document.getElementById('prGoalInput');
    const modal      = document.getElementById('prGoalModal');
    if (!modal || !inputEl) return;

    if (titleEl)    titleEl.textContent    = current != null ? `Update PR Goal` : `Set PR Goal`;
    if (subtitleEl) subtitleEl.textContent = `Target e1RM for ${liftName} (${unit})`;
    inputEl.value            = current != null ? String(current) : '';
    inputEl.dataset.lift     = liftName;
    inputEl.dataset.unit     = unit;
    modal.classList.add('active');
    requestAnimationFrame(() => inputEl.focus());
    return;
  }

  if (action === 'confirm-pr-goal') {
    if (!_getState) return;
    const inputEl = document.getElementById('prGoalInput');
    if (!inputEl) return;

    const liftName = inputEl.dataset.lift;
    const unit     = inputEl.dataset.unit || 'kg';
    if (!liftName) return;

    const val   = parseFloat(inputEl.value);
    const state = _getState();
    if (!state.prGoals) state.prGoals = {};

    if (!isNaN(val) && val > 0) {
      state.prGoals[liftName] = val;
    } else if (!isNaN(val) && val === 0) {
      delete state.prGoals[liftName];
    } else {
      document.getElementById('prGoalModal')?.classList.remove('active');
      return;
    }

    document.getElementById('prGoalModal')?.classList.remove('active');
    if (_saveState) _saveState(true);
    renderAthleteProfile();
    return;
  }

  if (action === 'close-pr-goal-modal') {
    document.getElementById('prGoalModal')?.classList.remove('active');
    return;
  }

  if (action === 'open-session-detail') {
    openSessionDetailModal(el);
    return;
  }

  if (action === 'close-session-detail') {
    closeSessionDetailModal();
    return;
  }

  if (action === 'open-wellness-detail') {
    if (!_getState) return;
    const body     = document.getElementById('wellnessSheetBody');
    const sheet    = document.getElementById('wellnessSheet');
    const backdrop = document.getElementById('wellnessSheetBackdrop');
    if (!sheet || !body) return;
    body.innerHTML = _renderWellnessSheetBody(_getState());
    sheet.classList.add('active');
    if (backdrop) backdrop.classList.add('active');
    return;
  }

  if (action === 'close-wellness-detail') {
    document.getElementById('wellnessSheet')?.classList.remove('active');
    document.getElementById('wellnessSheetBackdrop')?.classList.remove('active');
    return;
  }
}
