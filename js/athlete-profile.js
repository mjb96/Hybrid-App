// @ts-check
// =============================================================================
// ATHLETE PROFILE — Personal training identity and performance summary
// =============================================================================
import { getCatalogEntry, DIFFICULTY_LABELS } from './programs/catalog.js';
import { big3Maxes } from './metrics/metrics-strength.js';
import { getLiftDisplayName } from './engine.js';
import { getFastingContext, fmtHoursLabel, FASTING_ZONES } from './fasting.js';
import { showToast } from './state.js';
import { createSortable } from './ui/sortable.js';

let _getState  = null;
let _getDays   = null;
let _saveState = null;

export const PROFILE_SECTIONS = [
  { id: 'summary',     label: 'Athlete Summary',    icon: '📊' },
  { id: 'heatmap',    label: 'Training Activity',   icon: '🔥' },
  { id: 'program',    label: 'Current Program',     icon: '📋' },
  { id: 'performance',label: 'Performance',         icon: '💪' },
  { id: 'thisweek',   label: 'This Week',           icon: '📅' },
  { id: 'health',     label: 'Health Metrics',      icon: '❤️' },
  { id: 'wellness',   label: 'Wellness Hub',        icon: '🌿' },
  { id: 'sessions',   label: 'Recent Sessions',     icon: '📝' },
  { id: 'completed',  label: 'Completed Programs',  icon: '🏆' },
];

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

  // Profile hero — always shown
  const avatarUrl  = state.settings?.avatarDataUrl || null;
  const avatarInner = avatarUrl
    ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  const heroHTML = `
    <div class="profile-hero">
      <div class="profile-hero-avatar" id="profileHeroAvatar">${avatarInner}</div>
      <div class="profile-hero-info">
        <h1 class="profile-hero-name">${name}</h1>
        <div class="profile-hero-sub">Hybrid Athlete</div>
      </div>
      <button class="profile-customise-btn" data-action="open-profile-customiser" aria-label="Customise dashboard">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="11" y2="18"/></svg>
        Edit
      </button>
      <button class="profile-settings-btn" data-action="open-settings" aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  `;

  // Build section HTML map
  const sectionHTML = {
    summary: `
      <div class="profile-section">
        <div class="profile-section-title">Athlete Summary</div>
        <div class="profile-stat-grid">
          ${_statCard(streak > 0 ? streak.toString() : '0', 'Day Streak', streak > 0 ? '🔥' : '💤', streak > 0 ? 'var(--color-amber)' : null)}
          ${_statCard(completions.length.toString(), 'Programs', '🏆', completions.length > 0 ? 'var(--color-green)' : null)}
          ${_statCard(totalWorkouts > 0 ? totalWorkouts.toString() : '0', 'Workouts', '🏋️', null)}
          ${_statCard(longestStreak > 0 ? longestStreak.toString() : '0', 'Best Streak', '⚡', null)}
        </div>
      </div>
    `,
    heatmap: heatmapRows.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Training Activity</div>
        ${_renderHeatmap(heatmapRows, days)}
      </div>
    ` : '',
    program: activeCatalog ? `
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
    `,
    performance: (hasStrengthData || hasRunningData) ? `
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
    ` : '',
    thisweek: (currentWeekVolume > 0 || weeklyDistKm > 0) ? `
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
    ` : '',
    health:    _renderHealthSection(state),
    wellness:  _renderWellnessSection(state, days),
    sessions: recentSessions.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Recent Sessions</div>
        <div class="profile-recent-list">
          ${recentSessions.map(s => _recentRow(s)).join('')}
        </div>
      </div>
    ` : '',
    completed: completions.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Completed Programs</div>
        <div class="profile-completions-list">
          ${completions.slice().reverse().slice(0, 5).map(c => _completionRow(c)).join('')}
        </div>
      </div>
    ` : '',
  };

  // Apply stored order + hidden preferences
  const profileSections = state.profileSections || { order: null, hidden: [] };
  const order  = profileSections.order || PROFILE_SECTIONS.map(s => s.id);
  const hidden = new Set(profileSections.hidden || []);

  const body = order
    .filter(id => !hidden.has(id) && sectionHTML[id])
    .map(id => sectionHTML[id])
    .join('');

  container.innerHTML = heroHTML + body + `<div style="height: 80px;"></div>`;
}

// ── Profile Customiser ────────────────────────────────────────────────────────

export function openProfileCustomiser() {
  if (!_getState) return;
  const state = _getState();
  const psSt  = state.profileSections || { order: null, hidden: [] };
  const order  = psSt.order  || PROFILE_SECTIONS.map(s => s.id);
  const hidden = new Set(psSt.hidden || []);

  const list = document.getElementById('profileCustomiserList');
  if (list) {
    list.innerHTML = order.map(id => {
      const sec = PROFILE_SECTIONS.find(s => s.id === id);
      if (!sec) return '';
      return `
        <div class="pcs-item" data-section-id="${id}">
          <span class="pcs-handle" aria-hidden="true">⠿</span>
          <span class="pcs-icon" aria-hidden="true">${sec.icon}</span>
          <span class="pcs-label">${sec.label}</span>
          <label class="settings-switch pcs-toggle" aria-label="Show ${sec.label}">
            <input type="checkbox" class="pcs-visibility-toggle" data-section-id="${id}" ${hidden.has(id) ? '' : 'checked'}>
            <span class="settings-switch-track"></span>
          </label>
        </div>
      `;
    }).join('');
    _mountCustomiserDragDrop(list);
  }

  const overlay = document.getElementById('profileCustomiserOverlay');
  const sheet   = document.getElementById('profileCustomiserSheet');
  if (overlay) { overlay.classList.add('active'); overlay.removeAttribute('aria-hidden'); }
  if (sheet)   sheet.classList.add('active');
}

export function closeProfileCustomiser() {
  const list = document.getElementById('profileCustomiserList');
  if (list && _getState && _saveState) {
    const state = _getState();
    if (!state.profileSections) state.profileSections = { order: null, hidden: [] };
    const items  = list.querySelectorAll('.pcs-item[data-section-id]');
    const newOrder = Array.from(items).map(el => /** @type {HTMLElement} */ (el).dataset.sectionId);
    const newHidden = Array.from(list.querySelectorAll('.pcs-visibility-toggle:not(:checked)')).map(el => /** @type {HTMLElement} */ (el).dataset.sectionId);
    state.profileSections.order  = newOrder;
    state.profileSections.hidden = newHidden;
    _saveState(true);
    renderAthleteProfile();
  }
  document.getElementById('profileCustomiserOverlay')?.classList.remove('active');
  document.getElementById('profileCustomiserOverlay')?.setAttribute('aria-hidden', 'true');
  document.getElementById('profileCustomiserSheet')?.classList.remove('active');
}

export function resetProfileCustomiser() {
  if (!_getState || !_saveState) return;
  const state = _getState();
  state.profileSections = { order: null, hidden: [] };
  _saveState(true);
  showToast('Dashboard reset to default');
  openProfileCustomiser();
  renderAthleteProfile();
}

function _mountCustomiserDragDrop(list) {
  // Grab the ⠿ handle to reorder. The shared engine reorders the DOM in place;
  // closeProfileCustomiser() reads the resulting order on apply.
  createSortable(list, {
    itemSelector: '.pcs-item',
    handleSelector: '.pcs-handle',
    layout: 'list',
  });
}

// Pure helpers extracted to ./profile-stats.js
import {
  _wellnessContext,
  _renderWellnessSection,
  _renderWellnessSheetBody,
  _renderHealthSection,
  _renderHeatmap,
  _esc,
  _isSet,
  _countTotalWorkouts,
  _computeWeekVolume,
  _computeWeekDistance,
  _computeRunningPBs,
  _bestLiftFromGroup,
  _liftTrend,
  _heatmapData,
  _recentSessions,
  _statCard,
  _prRow,
  _runPBRow,
  _recentRow,
  _completionRow,
} from './profile-stats.js';

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
    const inputEl    = /** @type {HTMLInputElement} */ (document.getElementById('prGoalInput'));
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
    const inputEl = /** @type {HTMLInputElement} */ (document.getElementById('prGoalInput'));
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
    body.innerHTML = _renderWellnessSheetBody(_getState(), _getDays());
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
