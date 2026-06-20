// =============================================================================
// ATHLETE PROFILE — Personal training identity and performance summary
// =============================================================================
import { getCatalogEntry, DIFFICULTY_LABELS } from './programs/catalog.js';
import { big3Maxes } from './metrics/metrics-strength.js';

let _getState = null;
let _getDays = null;

export function initAthleteProfile(getStateFn, getDaysFn) {
  _getState = getStateFn;
  _getDays = getDaysFn;
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderAthleteProfile() {
  const container = document.getElementById('profileContent');
  if (!container || !_getState) return;

  const state = _getState();
  const days = _getDays ? _getDays() : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const name = state.settings?.name?.trim() || 'Athlete';
  const initials = name !== 'Athlete'
    ? name.split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';

  const activeCatalog = state.activeProgramId ? getCatalogEntry(state.activeProgramId) : null;
  const streak = state.streakData?.current || 0;
  const longestStreak = state.streakData?.longest || 0;
  const completions = state.programLibrary?.completions || [];
  const totalWorkouts = _countTotalWorkouts(state, days);
  const weightUnit = state.settings?.weightUnit || 'kg';

  // Performance data — only computed from real logged sets
  const maxes = big3Maxes(state);
  const hasStrengthData = maxes.squat > 0 || maxes.bench > 0 || maxes.deadlift > 0;
  const runningPBs = _computeRunningPBs(state, days);
  const hasRunningData = runningPBs.length > 0;

  // Weekly volume (current week only)
  const currentWeekVolume = _computeWeekVolume(state, days, state.currentWeek || '1');
  const weeklyDistKm = _computeWeekDistance(state, days, state.currentWeek || '1');

  container.innerHTML = `
    <!-- Profile Hero -->
    <div class="profile-hero">
      <div class="profile-hero-avatar">${initials}</div>
      <div class="profile-hero-info">
        <h1 class="profile-hero-name">${name}</h1>
        <div class="profile-hero-sub">Hybrid Athlete</div>
      </div>
      <button class="profile-settings-btn" data-action="open-settings" aria-label="Settings">
        ⚙️
      </button>
    </div>

    <!-- Athlete Summary -->
    <div class="profile-section">
      <div class="profile-section-title">Athlete Summary</div>
      <div class="profile-stat-grid">
        ${_statCard(streak > 0 ? streak.toString() : '0', 'Day Streak', streak > 0 ? '🔥' : '💤', streak > 0 ? 'var(--color-amber)' : null)}
        ${_statCard(completions.length.toString(), 'Programs Completed', '🏆', completions.length > 0 ? 'var(--color-green)' : null)}
        ${_statCard(totalWorkouts > 0 ? totalWorkouts.toString() : '0', 'Total Workouts', '🏋️', null)}
        ${_statCard(longestStreak > 0 ? longestStreak.toString() : '0', 'Longest Streak', '⚡', null)}
      </div>
    </div>

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
        <div class="profile-section-title">Performance Summary</div>

        ${hasStrengthData ? `
          <div class="profile-subsection-title">Strength PRs (e1RM)</div>
          <div class="profile-pr-list">
            ${maxes.squat > 0 ? _prRow('Back Squat', maxes.squat, weightUnit) : ''}
            ${maxes.bench > 0 ? _prRow('Bench Press', maxes.bench, weightUnit) : ''}
            ${maxes.deadlift > 0 ? _prRow('Deadlift', maxes.deadlift, weightUnit) : ''}
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
            null
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

    <!-- Health Metrics (Health Connect data if available) -->
    ${_renderHealthSection(state)}

    <!-- Recent Program Completions -->
    ${completions.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Completed Programs</div>
        <div class="profile-completions-list">
          ${completions.slice().reverse().slice(0, 5).map(c => _completionRow(c)).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Bottom spacer -->
    <div style="height: 80px;"></div>
  `;
}

// ── Section helpers ───────────────────────────────────────────────────────────

function _renderHealthSection(state) {
  const hc = state.healthConnect;
  if (!hc?.connected) return '';

  const latestHRV = hc.hrv?.slice(-1)[0]?.value;
  const latestRHR = hc.restingHR?.slice(-1)[0]?.value;
  const latestVO2 = hc.vo2max?.slice(-1)[0]?.value;
  const latestSleep = hc.sleep?.slice(-1)[0]?.hours;

  if (!latestHRV && !latestRHR && !latestVO2 && !latestSleep) return '';

  return `
    <div class="profile-section">
      <div class="profile-section-title">Health Metrics</div>
      <div class="profile-stat-grid">
        ${latestHRV ? _statCard(Math.round(latestHRV).toString(), 'HRV (ms)', '💙', null) : ''}
        ${latestRHR ? _statCard(Math.round(latestRHR).toString(), 'Resting HR', '❤️', null) : ''}
        ${latestVO2 ? _statCard(Math.round(latestVO2).toString(), 'VO₂ Max', '🫀', 'var(--color-cyan)') : ''}
        ${latestSleep ? _statCard(latestSleep.toFixed(1) + 'h', 'Sleep', '🌙', null) : ''}
      </div>
    </div>
  `;
}

// ── Data computation helpers ──────────────────────────────────────────────────

function _countTotalWorkouts(state, days) {
  let count = 0;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      const hasLifts = Object.keys(wkData?.lifts?.[d] || {}).some(l => {
        const sets = wkData.lifts[d][l];
        return Array.isArray(sets) && sets.some(s => s.c === true || s.c === 'on' || s.c === 1);
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
        const completed = s.c === true || s.c === 'on' || s.c === 1;
        if (completed && !s.isWarmup) {
          volume += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0);
        }
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
  // Find the fastest pace per approximate distance bracket
  const brackets = [
    { label: '5K', minKm: 4.5, maxKm: 5.5 },
    { label: '10K', minKm: 9, maxKm: 11 },
    { label: 'Half', minKm: 20, maxKm: 22 },
    { label: 'Marathon', minKm: 41, maxKm: 43 },
  ];

  const bests = {}; // label → { dist, timeStr, paceSecs }

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

// ── Render helpers ────────────────────────────────────────────────────────────

function _statCard(value, label, icon, accentColor) {
  const style = accentColor ? `style="color: ${accentColor}"` : '';
  return `
    <div class="profile-stat-card">
      <div class="profile-stat-icon">${icon}</div>
      <div class="profile-stat-value" ${style}>${value}</div>
      <div class="profile-stat-label">${label}</div>
    </div>
  `;
}

function _prRow(liftName, e1rm, unit) {
  return `
    <div class="profile-pr-row">
      <span class="profile-pr-lift">${liftName}</span>
      <span class="profile-pr-value">${Math.round(e1rm)} ${unit} <span class="profile-pr-tag">e1RM</span></span>
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

export function handleProfileAction(action, el) {
  // Profile actions are handled by the global event delegation (open-settings, switch-tab)
  // This hook is reserved for future profile-specific interactions
}
