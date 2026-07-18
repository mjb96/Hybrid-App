// @ts-check
// =============================================================================
// ATHLETE PROFILE — Personal training identity and performance summary
// =============================================================================
import { getCatalogEntry, DIFFICULTY_LABELS } from './programs/catalog.js';
import { getFastingContext, fmtHoursLabel, FASTING_ZONES } from './fasting.js';
import { showToast } from './state.js';
import { computeStreak } from './home/dashboard-model.js';
import { levelFromXp } from './brain/hybrid-score/levels.js';
import { screenTabBar, mountScreenTabs } from './analytics/views/screen-kit.js';
import { buildActivityHistory } from './activities/model.js';
import { addDaysISO } from './dates.js';

// V2-6 — curated Overview | Stats split (no user customiser): the lean glance vs
// the full depth. Fixed, curated order — the doctrine is "simple front, powerful
// behind", not "configurable".
const PROFILE_OVERVIEW_IDS = ['progression', 'program', 'summary'];
const PROFILE_STATS_IDS = ['performance', 'thisweek', 'heatmap', 'bodyweight', 'health', 'sessions', 'completed'];
let _profileTab = 'overview';

let _getState  = null;
let _getDays   = null;
let _saveState = null;


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
  // Streak is derived live from logged training days (single source of truth,
  // shared with the dashboard) — the legacy state.streakData was never written.
  const liveStreak    = computeStreak(state.weeks || {}, days, state);
  const streak        = liveStreak.current;
  const longestStreak = liveStreak.longest;
  const completions   = state.programLibrary?.completions || [];
  const totalWorkouts = _countTotalWorkouts(state, days);
  const weightUnit    = state.settings?.weightUnit || 'kg';
  const prGoals       = state.prGoals || {};

  // Body weight + lifetime totals (drive the hero band and headline stats)
  const bodyWeight    = _latestBodyWeight(state);
  const lifetime      = _lifetimeTotals(state, days);
  const relStrength   = _relativeStrength(state, days, bodyWeight);

  // Strength PRs — the big three only (Squat / Bench / Deadlift), best e1RM per
  // movement and robust to variant naming.
  const topLifts = _big3PRs(state, days);
  const hasStrengthData = topLifts.length > 0;

  // Running: generic stats (always shown when any run exists) + exact-bracket PBs
  const runStats      = _runningStats(state, days);
  const runningPBs    = _computeRunningPBs(state, days);
  const hasRunningData = runStats.runCount > 0;

  // New athlete: nothing logged yet → show a focused onboarding card instead of
  // a stack of empty sections.
  const isNewAthlete  = lifetime.sessions === 0 && !activeCatalog && completions.length === 0;

  // Athlete progression / level (XP from accumulated training + milestones)
  const prCount       = Object.keys(prGoals).length; // goals set ≈ tracked PRs of interest
  const progression   = _athleteProgression(lifetime, completions.length, longestStreak, prCount);

  // Weekly summaries (this vs last) — volume, distance, sessions, time + trends
  const thisWk        = _calendarWeekSummary(state);
  const prevWk        = _calendarWeekSummary(state, { weekStart: addDaysISO(thisWk.weekStart, -7) });
  const currentWeekVolume = thisWk.volume;
  const weeklyDistKm  = thisWk.distanceKm;
  const volumeTrendPct = (prevWk.volume > 0 && currentWeekVolume > 0)
    ? Math.round(((currentWeekVolume - prevWk.volume) / prevWk.volume) * 100)
    : null;
  const distTrendPct  = (prevWk.distanceKm > 0 && weeklyDistKm > 0)
    ? Math.round(((weeklyDistKm - prevWk.distanceKm) / prevWk.distanceKm) * 100)
    : null;

  // Heatmap + recent sessions
  const heatmapRows    = _heatmapData(state, days, 12);
  const recentSessions = buildActivityHistory(state).slice(0, 5);

  // Profile hero — always shown
  const avatarUrl  = state.settings?.avatarDataUrl || null;
  const avatarInner = avatarUrl
    ? `<img src="${avatarUrl}" alt="Avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
    : initials;

  // Dynamic subtitle: identity + key live facts (bodyweight, current streak).
  const subParts = ['Hybrid Athlete'];
  if (bodyWeight)  subParts.push(`${bodyWeight} ${weightUnit}`);
  if (streak > 0)  subParts.push(`🔥 ${streak}-day streak`);
  const heroSub = subParts.join('  ·  ');

  const heroHTML = `
    <div class="profile-hero">
      <div class="profile-hero-avatar" id="profileHeroAvatar">${avatarInner}</div>
      <div class="profile-hero-info">
        <h1 class="profile-hero-name">${_esc(name)}</h1>
        <div class="profile-hero-sub">${heroSub}</div>
      </div>
      <button class="profile-settings-btn" data-action="share-profile" aria-label="Share profile card">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/>
        </svg>
      </button>
      <button class="profile-settings-btn" data-action="open-settings" aria-label="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
    ${_relStrengthBand(relStrength, weightUnit)}
  `;

  // Build section HTML map
  const sectionHTML = {
    summary: `
      <div class="profile-section">
        <div class="profile-section-title">Lifetime</div>
        <div class="profile-stat-grid">
          ${_statCard(longestStreak > 0 ? longestStreak.toString() : '0', 'Best Streak', longestStreak > 0 ? '🔥' : '💤', longestStreak > 0 ? 'var(--color-amber)' : null)}
          ${_statCard((lifetime.sessions || totalWorkouts).toString(), 'Sessions', '🏋️', null)}
          ${_statCard(lifetime.volume > 0 ? `${_compactNum(lifetime.volume)}` : '0', `Volume (${weightUnit})`, '📊', lifetime.volume > 0 ? 'var(--color-violet)' : null)}
          ${_statCard(lifetime.distanceKm > 0 ? lifetime.distanceKm.toFixed(0) : '0', `${state.settings?.distanceUnit || 'km'} Run`, '🏃', lifetime.distanceKm > 0 ? 'var(--color-cyan)' : null)}
        </div>
      </div>
    `,
    progression: lifetime.sessions > 0 ? _renderProgressionSection(progression, levelFromXp(state.hybridScore?.xp)) : '',
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
            ${topLifts.map(l => _prRow(
              l.displayName,
              l.e1rm,
              weightUnit,
              _liftTrend(state, days, l.name),
              prGoals[l.displayName]
            )).join('')}
          </div>
        ` : ''}
        ${hasRunningData ? `
          <div class="profile-subsection-title" style="margin-top: 16px;">Running</div>
          <div class="profile-stat-grid">
            ${_statCard(`${runStats.longestKm.toFixed(1)}`, `Longest (${state.settings?.distanceUnit || 'km'})`, '🏁', null)}
            ${runStats.bestPaceSecs ? _statCard(_fmtPace(runStats.bestPaceSecs), 'Best Pace /km', '⚡', 'var(--color-cyan)') : ''}
            ${_statCard(`${runStats.totalKm.toFixed(0)}`, `Total ${state.settings?.distanceUnit || 'km'}`, '🏃', null)}
            ${_statCard(runStats.runCount.toString(), 'Runs', '👟', null)}
          </div>
          ${runningPBs.length > 0 ? `
            <div class="profile-subsection-title" style="margin-top: 16px;">Distance PBs</div>
            <div class="profile-pr-list">
              ${runningPBs.map(pb => _runPBRow(pb)).join('')}
            </div>
          ` : ''}
        ` : ''}
      </div>
    ` : '',
    thisweek: (thisWk.sessions > 0) ? `
      <div class="profile-section">
        <div class="profile-section-title">This Week</div>
        <div class="profile-stat-grid">
          ${_statCard(thisWk.sessions.toString(), 'Sessions', '📅', null)}
          ${_statCard(
            currentWeekVolume > 0 ? `${_compactNum(currentWeekVolume)}` : '0',
            `Vol (${weightUnit})`,
            '🏋️',
            null,
            volumeTrendPct !== null
              ? `<span class="profile-trend-chip profile-trend-chip--${volumeTrendPct >= 0 ? 'up' : 'down'}">${volumeTrendPct >= 0 ? '↑' : '↓'} ${Math.abs(volumeTrendPct)}%</span>`
              : ''
          )}
          ${_statCard(
            `${weeklyDistKm.toFixed(1)}`,
            `${state.settings?.distanceUnit || 'km'} Run`,
            '🏃',
            null,
            distTrendPct !== null
              ? `<span class="profile-trend-chip profile-trend-chip--${distTrendPct >= 0 ? 'up' : 'down'}">${distTrendPct >= 0 ? '↑' : '↓'} ${Math.abs(distTrendPct)}%</span>`
              : ''
          )}
          ${_statCard(
            thisWk.minutes > 0 ? (thisWk.minutes >= 60 ? `${Math.floor(thisWk.minutes / 60)}h${Math.round(thisWk.minutes % 60).toString().padStart(2, '0')}` : `${Math.round(thisWk.minutes)}m`) : '—',
            'Time',
            '⏱️',
            null
          )}
        </div>
      </div>
    ` : '',
    bodyweight: _renderBodyWeightSection(state),
    health:    _renderHealthSection(state),
    sessions: recentSessions.length > 0 ? `
      <div class="profile-section">
        <div class="profile-section-title">Recent Sessions</div>
        <div class="profile-recent-list">
          ${recentSessions.map(s => _activityRecentRow(s)).join('')}
        </div>
        <button class="btn-history-link" data-action="open-activities"><span>View all activities</span><span class="btn-history-arrow">→</span></button>
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

  // New athlete: skip the section stack (it would be mostly empty) and show a
  // focused onboarding card with the two highest-value next actions.
  let body;
  if (isNewAthlete) {
    body = `
      <div class="profile-section">
        <div class="profile-onboard-card">
          <div class="profile-onboard-icon">🏋️</div>
          <div class="profile-onboard-title">Build your athlete profile</div>
          <div class="profile-onboard-text">Log your first session or start a program — your PRs, strength-to-bodyweight ratios and training history will appear here.</div>
          <div class="profile-onboard-actions">
            <button class="profile-empty-cta" data-action="switch-tab" data-target="program">Browse Programs</button>
            <button class="profile-empty-cta profile-empty-cta--ghost" data-action="switch-tab" data-target="workout">Log a Workout</button>
          </div>
        </div>
      </div>
    `;
  } else {
    // V2-6 — curated Overview | Stats. Overview is the lean identity glance
    // (level · program · lifetime); Stats holds the full depth. Empty sections
    // drop out so a tab is never a wall of blanks.
    const pick = (ids) => ids.map(id => sectionHTML[id]).filter(Boolean).join('');
    const overview = pick(PROFILE_OVERVIEW_IDS);
    const stats    = pick(PROFILE_STATS_IDS);
    body = `
      ${screenTabBar(_profileTab)}
      <div class="profile-tabbody">${_profileTab === 'stats' ? stats : overview}</div>
    `;
  }

  container.innerHTML = heroHTML + body + `<div style="height: 80px;"></div>`;

  if (!isNewAthlete) {
    mountScreenTabs('profileContent', (tab) => { _profileTab = tab; renderAthleteProfile(); });
  }
}

// ── Profile Customiser ────────────────────────────────────────────────────────

// ── Shareable profile card ────────────────────────────────────────────────────
// Renders a 1080×1350 summary card to an offscreen canvas, then shares it via
// the Web Share API (files) or falls back to a PNG download.
function shareProfileCard() {
  if (!_getState) return;
  const state = _getState();
  const days  = _getDays ? _getDays() : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  const canvas = document.createElement('canvas');
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) { showToast('Sharing not supported on this device'); return; }

  const name = state.settings?.name?.trim() || 'Athlete';
  const unit = state.settings?.weightUnit || 'kg';
  const distUnit = state.settings?.distanceUnit || 'km';
  const bodyWeight = _latestBodyWeight(state);
  const lifetime   = _lifetimeTotals(state, days);
  const rel        = _relativeStrength(state, days, bodyWeight);

  // Background + accent glow
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0612'); bg.addColorStop(0.5, '#140a2c'); bg.addColorStop(1, '#05060f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 280, 0, W / 2, 280, 620);
  glow.addColorStop(0, 'rgba(139,92,246,0.32)'); glow.addColorStop(1, 'rgba(139,92,246,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  ctx.textAlign = 'center';

  // Brand
  ctx.fillStyle = 'rgba(196,181,253,0.92)';
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText('⚡ HELYX', W / 2, 116);

  // Avatar
  ctx.beginPath(); ctx.arc(W / 2, 262, 82, 0, Math.PI * 2);
  const ag = ctx.createLinearGradient(W / 2 - 82, 180, W / 2 + 82, 344);
  ag.addColorStop(0, '#4f46e5'); ag.addColorStop(1, '#7c3aed');
  ctx.fillStyle = ag; ctx.fill();
  const initials = name !== 'Athlete'
    ? name.split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';
  ctx.fillStyle = '#fff'; ctx.font = `800 66px ${FONT}`;
  ctx.textBaseline = 'middle'; ctx.fillText(initials, W / 2, 268); ctx.textBaseline = 'alphabetic';

  // Name + Hybrid Level (the canonical identity, shared with Home/Profile)
  const shareLevel = levelFromXp(state.hybridScore?.xp);
  ctx.fillStyle = '#f8fafc'; ctx.font = `800 62px ${FONT}`;
  ctx.fillText(name, W / 2, 430);
  ctx.fillStyle = '#f59e0b'; ctx.font = `700 30px ${FONT}`;
  ctx.fillText(`LV ${shareLevel.tier} · ${shareLevel.name.toUpperCase()}`, W / 2, 480);

  // Relative-strength tiles
  const drawTile = (cx, cy, big, small, sub, color) => {
    const tw = 280, th = 200;
    const x = cx - tw / 2, y = cy;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    _roundRect(ctx, x, y, tw, th, 24); ctx.fill();
    ctx.strokeStyle = color + '55'; ctx.lineWidth = 2;
    _roundRect(ctx, x, y, tw, th, 24); ctx.stroke();
    ctx.fillStyle = color; ctx.font = `800 64px ${FONT}`;
    ctx.fillText(big, cx, y + 92);
    ctx.fillStyle = '#f8fafc'; ctx.font = `800 26px ${FONT}`;
    ctx.fillText(small, cx, y + 134);
    ctx.fillStyle = color; ctx.font = `700 22px ${FONT}`;
    ctx.fillText(sub, cx, y + 168);
  };

  if (rel.length) {
    const yT = 560;
    const cols = rel.length;
    const gap = 24, tw = 280;
    const totalW = cols * tw + (cols - 1) * gap;
    let sx = W / 2 - totalW / 2 + tw / 2;
    rel.forEach(r => {
      drawTile(sx, yT, `${r.ratio.toFixed(2)}×`, r.label, r.tier?.name || '', r.tier?.color || '#c4b5fd');
      sx += tw + gap;
    });
  } else {
    ctx.fillStyle = '#94a3b8'; ctx.font = `600 30px ${FONT}`;
    ctx.fillText('Building strength…', W / 2, 660);
  }

  // Lifetime stat row
  const stats = [
    [shareLevel.xp >= 1000 ? `${(shareLevel.xp / 1000).toFixed(1)}k` : String(shareLevel.xp), 'XP'],
    [String(lifetime.sessions), 'SESSIONS'],
    [_compactNum(lifetime.volume), `VOLUME ${unit.toUpperCase()}`],
    [lifetime.distanceKm.toFixed(0), `${distUnit.toUpperCase()} RUN`],
  ];
  const sy = 880;
  const colW = W / stats.length;
  stats.forEach((s, i) => {
    const cx = colW * i + colW / 2;
    ctx.fillStyle = '#f8fafc'; ctx.font = `800 52px ${FONT}`;
    ctx.fillText(s[0], cx, sy);
    ctx.fillStyle = '#7c8aa0'; ctx.font = `700 22px ${FONT}`;
    ctx.fillText(s[1], cx, sy + 40);
  });

  // Divider + footer
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(120, 1180); ctx.lineTo(W - 120, 1180); ctx.stroke();
  ctx.fillStyle = '#64748b'; ctx.font = `600 26px ${FONT}`;
  ctx.fillText(bodyWeight ? `${bodyWeight} ${unit} · Hybrid Athlete` : 'Hybrid Athlete', W / 2, 1250);

  const finish = (blob) => {
    const file = blob && typeof File !== 'undefined' ? new File([blob], 'helyx-profile.png', { type: 'image/png' }) : null;
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'My Helyx Profile', text: `${name} · ${shareLevel.name} (Lv ${shareLevel.tier})` })
        .catch(() => {});
    } else {
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'helyx-profile.png';
      a.click();
      showToast('Profile card saved');
    }
  };
  if (canvas.toBlob) canvas.toBlob(finish, 'image/png'); else finish(null);
}

// Canvas rounded-rect path helper (no fill/stroke — caller decides).
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Pure helpers extracted to ./profile-stats.js
import {
  _renderHealthSection,
  _renderHeatmap,
  _esc,
  _isSet,
  _countTotalWorkouts,
  _computeRunningPBs,
  _liftTrend,
  _heatmapData,
  _statCard,
  _prRow,
  _runPBRow,
  _completionRow,
  _latestBodyWeight,
  _lifetimeTotals,
  _big3PRs,
  _relativeStrength,
  _relStrengthBand,
  _runningStats,
  _compactNum,
  _fmtPace,
  _calendarWeekSummary,
  _renderBodyWeightSection,
  _athleteProgression,
  _renderProgressionSection,
} from './profile-stats.js';

function _activityRecentRow(activity) {
  const isRun = activity.kind === 'run';
  return `
    <button class="profile-recent-row profile-recent-row--clickable"
         data-action="open-activity-detail" data-activity-id="${_esc(activity.id)}"
         aria-label="View ${_esc(activity.title)} from ${_esc(activity.dateLabel)}">
      <span class="profile-recent-icon profile-recent-icon--${isRun ? 'run' : 'lift'}">${isRun ? '🏃' : '🏋️'}</span>
      <span class="profile-recent-info">
        <span class="profile-recent-date">${_esc(activity.title)}</span>
        <span class="profile-recent-desc">${_esc(activity.dateLabel)}${activity.metrics.length ? ` · ${_esc(activity.metrics.join(' · '))}` : ''}</span>
      </span>
      <span class="profile-recent-chevron">›</span>
    </button>`;
}

// ── Action handler ────────────────────────────────────────────────────────────

export function handleProfileAction(action, el) {
  if (action === 'share-profile') {
    shareProfileCard();
    return;
  }

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

}
