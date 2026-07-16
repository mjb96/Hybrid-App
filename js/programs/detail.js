// @ts-check
// =============================================================================
// PROGRAM DETAIL PAGE — Full-screen program detail view
// =============================================================================
import { PROGRAM_CATALOG, CATEGORIES, DIFFICULTY_LABELS, getCatalogEntry } from './catalog.js';
import { buildProgramTimeline } from './timeline.js';
import { buildWeekSchedule, summarizeProgression, diffWeekPrescription } from './schedule.js';
import { programStats, equipmentFit, programHasLifts } from './compare.js';
import { getSimilarPrograms } from './recommendations.js';
import { renderProgramCard, coverGlyphFor } from './program-card.js';
import { programAttribution } from './attribution.js';
import { icon as svgIcon } from '../ui/icons.js';
import { PROGRAMS } from '../constants.js';
import { resolveProgramPhase } from './phase.js';
import { getWeekModifier } from '../schema.js';
import { liftTarget } from '../engine.js';
import { isBookmarked, toggleBookmark, isProgramCompleted, markProgramCompleted, getProgramById, getPersonalRating } from '../state.js';
import { escapeHtml, safeCssColor } from '../util.js';

let _currentProgramId = null;
let _appState = null;
let _detailTab = 'overview';   // V2-6 — 'overview' (what/why) | 'structure' (what you'll do)
// The week the "This week at a glance" schedule is previewing. PREVIEW ONLY —
// this never touches appState.currentWeek or program progress. 0 = "pick a
// sensible default on next render" (active week if active, else Week 1).
let _scheduleWeek = 0;
let _scheduleTotalWeeks = 1;

// Neutral origin line for the detail hero. Uses the centralised attribution
// mapping; falls back to a dossier creator name as "Inspired by …". Never
// implies verification/endorsement.
function _detailAttribution(program) {
  const attr = programAttribution(program);
  if (attr) return attr.text;
  const creator = program?.dossier?.creator && String(program.dossier.creator).trim();
  return creator ? `Inspired by ${creator}` : '';
}

export function renderProgramDetail(programId, appState) {
  // Opening a different program always starts on Overview and resets the
  // schedule preview to its default week.
  if (_currentProgramId !== programId) { _detailTab = 'overview'; _scheduleWeek = 0; }
  _currentProgramId = programId;
  _appState = appState;

  const container = document.getElementById('programDetailContent');
  if (!container) return;

  const catalog = getCatalogEntry(programId);
  const programData = PROGRAMS[programId] || appState?.customPrograms?.find(p => p.id === programId);

  // Merge: use catalog for rich metadata, programData for workout structure
  const program = {
    ...(programData || {}),
    ...(catalog || {}),
    name: (catalog?.name || programData?.name || 'Unknown Program'),
  };

  const isActive = appState?.activeProgramId === programId;
  const saved = isBookmarked(programId);
  const completed = isProgramCompleted(programId);
  const personalRating = getPersonalRating(programId);
  const diff = DIFFICULTY_LABELS[program.difficulty] || DIFFICULTY_LABELS.intermediate;
  const category = CATEGORIES[program.category] || { label: program.category || 'Program', icon: '📋', color: '#8b5cf6' };
  const wod = program.tags?.includes('hyrox-wod');
  const safeProgramId = escapeHtml(programId || '');
  const cover = [
    safeCssColor(program.coverGradient?.[0], '#1a0e2e'),
    safeCssColor(program.coverGradient?.[1], '#0d1b2a'),
  ];
  const accent = safeCssColor(program.accentColor || category.color, '#8b5cf6');

  const similarPrograms = getSimilarPrograms(program, 6);

  // Week-at-a-glance + progression: derived only from real week data. Preview
  // week defaults to the active week (if this is the active program) else Week 1,
  // and is clamped whenever the program changes or its length differs.
  const totalWeeks = Number(program.durationWeeks || program.totalWeeks) || 12;
  _scheduleTotalWeeks = totalWeeks;
  if (!_scheduleWeek || _scheduleWeek < 1 || _scheduleWeek > totalWeeks) {
    _scheduleWeek = isActive ? Math.min(totalWeeks, Math.max(1, parseInt(appState?.currentWeek, 10) || 1)) : 1;
  }
  const weekScheduleHTML = wod ? '' : renderWeekAtAGlance(program, isActive, appState, totalWeeks, _scheduleWeek);
  const progressionHTML  = wod ? '' : renderProgressionOverview(program);

  // V2-6 — collapse the ~13-section marketing stack into a lean identity header
  // (hero · stats · tags · CTA · one description) + an Overview | Structure tab
  // body. Dedup: rating shows once (by the CTA), author once (in the hero),
  // level/equipment once (stat + tag rows) — the old social-proof + author-card +
  // duplicate-highlights blocks are gone.
  const outcomes = program.expectedOutcomes?.length ? program.expectedOutcomes : (program.highlights || []);
  const outcomesTitle = program.expectedOutcomes?.length ? "What you'll achieve" : 'Program highlights';

  const overviewHTML = `
    ${outcomes.length ? `
      <div class="detail-section">
        <div class="detail-section-title">${outcomesTitle}</div>
        <div class="detail-outcomes">
          ${outcomes.map(o => `<div class="detail-outcome-chip"><span class="detail-outcome-arrow">→</span> ${escapeHtml(o)}</div>`).join('')}
        </div>
      </div>` : ''}
    ${program.metrics ? `
      <div class="detail-section">
        <div class="detail-section-title">Training focus</div>
        ${renderFocusBars(program.metrics)}
      </div>` : ''}
    ${program.equipment?.length ? `
      <div class="detail-section">
        <div class="detail-section-title">Equipment</div>
        <div class="detail-equipment">${program.equipment.map(e => `<span class="detail-equipment-chip">${formatEquipment(e)}</span>`).join('')}</div>
      </div>` : ''}
  `;

  const structureHTML = `
    ${!wod && (program.days || programData?.days) ? `
      <div class="detail-section">
        <div class="detail-section-title">Weekly structure</div>
        ${renderDaySplit(program.days || programData?.days)}
      </div>` : ''}
    ${renderSampleWorkout(program, programData, wod)}
  `;

  const planHTML = renderPlanTimeline(program);
  const hasPlan = !wod && !!planHTML;

  const detailTabBar = `
    <div class="an-tabbar detail-tabbar">
      <button class="an-tab ${_detailTab === 'overview' ? 'an-tab--active' : ''}" data-detail-tab="overview">Overview</button>
      <button class="an-tab ${_detailTab === 'structure' ? 'an-tab--active' : ''}" data-detail-tab="structure">Structure</button>
      ${hasPlan ? `<button class="an-tab ${_detailTab === 'plan' ? 'an-tab--active' : ''}" data-detail-tab="plan">Plan</button>` : ''}
    </div>`;

  container.innerHTML = `
    <!-- Back + Header -->
    <div class="detail-back-bar">
      <button class="detail-back-btn" data-action="close-program-detail">
        <span class="detail-back-icon">‹</span> Library
      </button>
      <div class="detail-back-actions">
        ${isActive ? '<span class="detail-active-badge">ACTIVE</span>' : ''}
        ${completed ? '<span class="detail-completed-badge">COMPLETED</span>' : ''}
        <button class="detail-bookmark-btn"
                data-action="rate-program"
                data-program-id="${safeProgramId}"
                aria-label="Rate this program">⭐</button>
        <button class="detail-bookmark-btn ${saved ? 'saved' : ''}"
                data-action="detail-toggle-bookmark"
                data-program-id="${safeProgramId}"
                aria-label="${saved ? 'Remove bookmark' : 'Save program'}">
          ${saved ? '🔖' : '🤍'}
        </button>
      </div>
    </div>

    <!-- Hero -->
    <div class="detail-hero"
         style="background: linear-gradient(165deg, ${cover[0]}, ${cover[1]})">
      <div class="detail-hero-icon" aria-hidden="true">${svgIcon(coverGlyphFor(program), { size: 72 })}</div>
      <div class="detail-hero-content">
        <span class="detail-category-badge" style="background: ${accent}22; color: ${accent}; border-color: ${accent}40">
          ${escapeHtml(category.icon)} ${escapeHtml(category.label)}
        </span>
        <h1 class="detail-title">${escapeHtml(program.name)}</h1>
        <p class="detail-tagline">${escapeHtml(program.tagline || program.dossier?.philosophy?.slice(0, 100) || '')}</p>
        <div class="detail-author">${escapeHtml(_detailAttribution(program))}</div>
      </div>
    </div>

    <!-- Quick Stats Row -->
    <div class="detail-stats-row">
      ${wod ? `
      <div class="detail-stat">
        <div class="detail-stat-value">${program.sessionDurationMinutes ? `${program.sessionDurationMinutes.min}–${program.sessionDurationMinutes.max}m` : '—'}</div>
        <div class="detail-stat-label">Duration</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value" style="color: ${diff.color}">${diff.label}</div>
        <div class="detail-stat-label">Level</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value">${program.sessionDurationMinutes ? program.sessionDurationMinutes.max + 'm' : '—'}</div>
        <div class="detail-stat-label">Per Session</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value">${{ 'full-gym': 'Full Gym', gym: 'Full Gym', home: 'Home', garage_gym: 'Garage', bodyweight: 'Bodyweight', minimal: 'Minimal' }[program.equipmentTier] || '—'}</div>
        <div class="detail-stat-label">Equipment</div>
      </div>
      ` : `
      <div class="detail-stat">
        <div class="detail-stat-value">${program.durationWeeks || program.totalWeeks || '12'}</div>
        <div class="detail-stat-label">Weeks</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value">${program.sessionsPerWeek || '—'}</div>
        <div class="detail-stat-label">Days/Week</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value" style="color: ${diff.color}">${diff.label}</div>
        <div class="detail-stat-label">Level</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value">${program.sessionDurationMinutes ? program.sessionDurationMinutes.max + 'm' : '—'}</div>
        <div class="detail-stat-label">Per Session</div>
      </div>
      `}
    </div>

    ${wod ? '' : renderCommitmentStrip(program, appState?.settings)}

    <!-- Program Tags (Difficulty + Goals) -->
    <div class="detail-tags-row">
      <span class="detail-tag detail-tag--difficulty" style="color: ${diff.color}; border-color: ${diff.color}40">
        ${'●'.repeat(diff.dots)}${'○'.repeat(4 - diff.dots)} ${diff.label}
      </span>
      ${program.equipmentTier ? `<span class="detail-tag detail-tag--equipment">${escapeHtml({ gym: '🏢 Full Gym', home: '🏠 Home Gym', garage_gym: '🔩 Garage Gym', bodyweight: '🤸 Bodyweight', minimal: '⚡ Minimal' }[program.equipmentTier] || program.equipmentTier)}</span>` : ''}
      ${(program.goals || []).slice(0, 3).map(g => `<span class="detail-tag detail-tag--goal">${escapeHtml(String(g).replace(/-/g, ' '))}</span>`).join('')}
    </div>

    <!-- CTA -->
    <div class="detail-cta-wrap">
      ${isActive
        ? `<button class="detail-cta-btn detail-cta-btn--active" data-action="view-active-program">
              View Active Program
           </button>`
        : completed
        ? `<button class="detail-cta-btn detail-cta-btn--completed" data-action="make-active-from-detail" data-program-id="${safeProgramId}">
              Train Again
           </button>`
        : `<button class="detail-cta-btn" data-action="make-active-from-detail" data-program-id="${safeProgramId}">
              ${wod ? 'Start This Workout' : 'Start This Program'}
           </button>`
      }
      ${isActive && !completed ? `
        <button class="detail-complete-btn" data-action="mark-program-complete" data-program-id="${safeProgramId}">
          Mark as Complete
        </button>
      ` : ''}
      <div class="detail-cta-secondary" style="display:flex;gap:8px;margin-top:8px;">
        <button class="detail-complete-btn" style="flex:1;margin-top:0;" data-action="customize-program" data-program-id="${safeProgramId}">✏️ Customize</button>
        <button class="detail-complete-btn" style="flex:1;margin-top:0;" data-action="open-compare" data-program-id="${safeProgramId}">⚖️ Compare</button>
      </div>
      ${personalRating
        ? `<div class="detail-your-rating" data-action="rate-program" data-program-id="${safeProgramId}" role="button" tabindex="0">
             <span class="detail-your-rating-label">Your rating</span>
             ${renderStars(personalRating.rating)}
             <span class="detail-rating-value">${personalRating.rating}/5</span>
           </div>`
        : `<button class="detail-rating detail-rating--empty" data-action="rate-program" data-program-id="${safeProgramId}">
             <span class="detail-rating-empty-text">☆ Rate this program</span>
           </button>`
      }
    </div>

    <!-- Week-at-a-glance + progression — the actual training, before prose -->
    ${weekScheduleHTML}
    ${progressionHTML}

    <!-- Description — the one-line "what it is" -->
    <div class="detail-section">
      <p class="detail-description">${escapeHtml(program.description || program.dossier?.philosophy || '')}</p>
    </div>

    <!-- Overview | Structure | Plan -->
    ${detailTabBar}
    <div class="detail-tabbody">${
      _detailTab === 'plan' && hasPlan ? planHTML
      : _detailTab === 'structure' ? structureHTML
      : overviewHTML
    }</div>

    <!-- Similar Programs -->
    ${similarPrograms.length > 0 ? `
      <div class="detail-section">
        <div class="detail-section-title">Similar programs</div>
        <div class="card-scroll-row">
          ${similarPrograms.map(p => renderProgramCard(p, 'small')).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Bottom spacer -->
    <div style="height: 48px;"></div>
  `;

  // Self-contained tab switching (re-render on switch, like the analytics/profile screens).
  container.querySelectorAll('[data-detail-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      _detailTab = btn.getAttribute('data-detail-tab');
      renderProgramDetail(programId, appState);
    });
  });
}

function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return `<span class="detail-stars" aria-label="${rating} out of 5 stars">
    ${'★'.repeat(full)}${half ? '⯨' : ''}${'☆'.repeat(empty)}
  </span>`;
}

function renderFocusBars(metrics) {
  const qualLabel = v => v >= 80 ? 'Very High' : v >= 60 ? 'High' : v >= 35 ? 'Moderate' : 'Low';
  const bars = [
    { label: 'Strength',     value: metrics.strengthEmphasis,     color: '#ef4444' },
    { label: 'Hypertrophy',  value: metrics.hypertrophyEmphasis,  color: '#3b82f6' },
    { label: 'Endurance',    value: metrics.enduranceEmphasis,    color: '#22d3ee' },
    { label: 'Conditioning', value: metrics.conditioningEmphasis, color: '#f59e0b' },
    { label: 'Recovery',     value: metrics.recoveryDemand,       color: '#8b5cf6' },
  ].filter(b => b.value > 0);

  if (!bars.length) return '';

  return `
    <div class="focus-bars">
      ${bars.map((bar, i) => `
        <div class="focus-bar-row">
          <div class="focus-bar-label">${bar.label}</div>
          <div class="focus-bar-track">
            <div class="focus-bar-fill"
                 style="--bar-target: ${bar.value}%; background: ${bar.color}; animation-delay: ${i * 70}ms">
            </div>
          </div>
          <div class="focus-bar-qual">${qualLabel(bar.value)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSampleWorkout(program, programData, wod = false) {
  const days = program.days || programData?.days;
  if (!days) return '';

  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayNames = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  let chosenDay = null, chosenKey = null;
  for (const key of dayOrder) {
    const day = days[key];
    if (!day) continue;
    const isRest = !day.lifts?.length && (!day.runs || day.runs === 'Rest');
    if (!isRest && day.workoutPreview) { chosenDay = day; chosenKey = key; break; }
  }
  // Fallback: any non-rest day without a structured preview
  if (!chosenDay) {
    for (const key of dayOrder) {
      const day = days[key];
      if (!day) continue;
      const isRest = !day.lifts?.length && (!day.runs || day.runs === 'Rest');
      if (!isRest) { chosenDay = day; chosenKey = key; break; }
    }
  }
  if (!chosenDay) return '';

  const preview = chosenDay.workoutPreview;
  const isRun = preview?.type === 'RUNNING' || (!preview?.type && chosenDay.runs && chosenDay.runs !== 'Rest' && !chosenDay.lifts?.length);
  let bodyHtml = '';

  if (preview?.type === 'STRENGTH' && preview.exercises?.length) {
    // Show the SAME target the cockpit prescribes — liftTarget resolves an
    // inline "(4×8–10)" spec when the program carries one, else the week-1
    // modifier's uniform sets×reps. Reading the hand-written workoutPreview
    // sets/reps would promise a per-lift prescription the engine never
    // delivers. Names come from day.lifts (what the cockpit renders).
    const mod1 = getWeekModifier(program, 1) || {};
    const names = (chosenDay.lifts?.length ? chosenDay.lifts : preview.exercises.map(e => e.exercise))
      .filter(n => typeof n === 'string' && n.trim());
    const shown = names.slice(0, 5);
    const extra = names.length - shown.length;
    bodyHtml = `
      <div class="sample-exercise-list">
        ${shown.map(name => {
          const t = liftTarget(chosenDay.desc, name, mod1);
          return `
          <div class="sample-exercise-row">
            <span class="sample-ex-name">${escapeHtml(name)}</span>
            <span class="sample-ex-prescription">${t.sets} × ${t.reps}</span>
          </div>`;
        }).join('')}
        ${extra > 0 ? `<div class="sample-ex-more">+${extra} more exercises</div>` : ''}
      </div>`;
  } else if (preview?.type === 'RUNNING' && preview.phases?.length) {
    bodyHtml = `
      <div class="sample-run-phases">
        ${preview.phases.map(ph => `
          <div class="sample-run-phase">
            <span class="sample-run-phase-name">${escapeHtml(ph.name)}</span>
            <span class="sample-run-phase-detail">${escapeHtml(ph.duration)} · ${escapeHtml(ph.pace)}</span>
          </div>
        `).join('')}
      </div>`;
  } else if (chosenDay.lifts?.length) {
    const shown = chosenDay.lifts.slice(0, 5);
    const extra = chosenDay.lifts.length - shown.length;
    bodyHtml = `
      <div class="sample-exercise-list">
        ${shown.map(l => `<div class="sample-exercise-row"><span class="sample-ex-name">${escapeHtml(l)}</span></div>`).join('')}
        ${extra > 0 ? `<div class="sample-ex-more">+${extra} more exercises</div>` : ''}
      </div>`;
  } else if (chosenDay.runs && chosenDay.runs !== 'Rest') {
    bodyHtml = `<div class="sample-run-text">${escapeHtml(chosenDay.runs)}</div>`;
  }

  if (!bodyHtml) return '';

  const accentColor = chosenDay.color?.startsWith('var(') ? null : safeCssColor(chosenDay.color, '');
  const badgeStyle = accentColor
    ? `color: ${accentColor}; border-color: ${accentColor}40`
    : `color: var(--text-secondary); border-color: rgba(255,255,255,0.12)`;

  // WODs: drop the day-of-week label (it's irrelevant) and use "The Workout" as section title
  const sectionTitle = wod ? 'The Workout' : 'Sample Session';
  const headerHtml = wod
    ? (chosenDay.badge ? `<span class="sample-workout-badge" style="${badgeStyle}">${escapeHtml(chosenDay.badge)}</span>` : '')
    : `<span class="sample-workout-dayname">${dayNames[chosenKey]}</span>
       ${chosenDay.badge ? `<span class="sample-workout-badge" style="${badgeStyle}">${escapeHtml(chosenDay.badge)}</span>` : ''}`;

  return `
    <div class="detail-section">
      <div class="detail-section-title">${sectionTitle}</div>
      <div class="sample-workout-card">
        ${headerHtml ? `<div class="sample-workout-header">${headerHtml}</div>` : ''}
        <div class="sample-workout-title">${isRun ? '🏃' : '🏋️'} ${escapeHtml(chosenDay.title || 'Training Session')}</div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

// A1 — the week-by-week plan. Renders the progression/deload arc that every
// program already carries in weeklyVolModifiers, tinted by phase so the shape
// of the block reads at a glance.
const PLAN_KIND_COLOR = {
  deload: '#22d3ee', peak: '#ef4444', taper: '#a78bfa',
  intensify: '#f59e0b', build: '#8b5cf6', work: '#64748b',
};
const PLAN_KIND_LABEL = {
  deload: 'Deload', peak: 'Peak', taper: 'Taper', intensify: 'Intensity', build: 'Build', work: '',
};

// A2 — the commitment strip: the numbers that actually decide "can/should I do
// this?" — total time cost, weekly working volume, and whether the athlete owns
// the kit. Reuses the pure programStats + equipmentFit helpers.
function renderCommitmentStrip(program, settings) {
  const s = programStats(program);
  const fit = equipmentFit(s.equipment, settings?.equipment);

  const tiles = [];
  if (s.totalHours) {
    tiles.push({ v: `~${s.totalHours}h`, l: `over ${s.weeks} wks`, c: 'var(--text-inverse)' });
  }
  if (s.weeklySets && s.hasLifts) {
    // This is the week modifier's sets-per-lift, not total weekly sets — label
    // it honestly (a 5-day program obviously isn't "4 sets a week"). Only shown
    // for programs that actually lift; a run block's sets/reps are an internal
    // volume hack, not a prescription (the real one lives in the day/plan label).
    tiles.push({ v: `~${s.weeklySets}`, l: 'sets per lift', c: 'var(--text-inverse)' });
  } else if (s.daysPerWeek && !s.hasLifts) {
    // Running/endurance block: show the session cadence instead of a phantom
    // "sets per lift" so the strip still reads as three honest decision numbers.
    tiles.push({ v: `${s.daysPerWeek}×`, l: 'runs per week', c: 'var(--text-inverse)' });
  }
  if (s.equipment.length) {
    if (fit.missing.length) {
      const names = fit.missing.map(t => t.replace(/-/g, ' ')).join(', ');
      tiles.push({ v: `✗ ${fit.missing.length} missing`, l: names, c: '#f59e0b' });
    } else if (fit.owned.length) {
      tiles.push({ v: '✓ Ready', l: 'you have the kit', c: '#10b981' });
    }
  }
  if (!tiles.length) return '';

  return `
    <div class="detail-commitment-strip" style="display:flex;gap:8px;margin:14px 16px 0;">
      ${tiles.map(t => `
        <div style="flex:1;background:var(--overlay-sm);border-radius:12px;padding:10px 12px;text-align:center;">
          <div style="font-family:ui-monospace,monospace;font-weight:800;font-size:1.05rem;letter-spacing:-0.02em;color:${t.c};">${t.v}</div>
          <div style="font-size:0.66rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-muted);margin-top:2px;">${escapeHtml(t.l)}</div>
        </div>
      `).join('')}
    </div>`;
}

// ── Week-at-a-glance schedule (main page, week-stepped, tappable) ────────────
const _WAG_TYPE_ICON = { strength: '🏋️', running: '🏃', mixed: '🔀', rest: '💤' };

function _todayDayKey() {
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
}

// Which days of a given week have been trained (any completed set, or a logged
// run) — used only to mark the ACTIVE program's current week. Never counts
// prescriptions, previews, or rest days as sessions.
function _dayCompletionMap(appState, week) {
  const out = {};
  const wk = appState?.weeks?.[String(week)];
  if (!wk) return out;
  const lifts = wk.lifts || {}, runs = wk.runs || {};
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    let done = false;
    const dl = lifts[d];
    if (dl && typeof dl === 'object') {
      for (const k in dl) { if (Array.isArray(dl[k]) && dl[k].some(s => s && s.c)) { done = true; break; } }
    }
    if (!done && runs[d] && (runs[d].dist || runs[d].time)) done = true;
    if (done) out[d] = 'done';
  }
  return out;
}

function renderWeekAtAGlance(program, isActive, appState, totalWeeks, week) {
  const rows = buildWeekSchedule(program, week);
  if (!rows.length) return '';

  const activeWeek = isActive ? Math.max(1, parseInt(appState?.currentWeek, 10) || 1) : null;
  const isCurrent = activeWeek === week;
  const completion = isCurrent ? _dayCompletionMap(appState, week) : null;
  const todayKey = isCurrent ? _todayDayKey() : null;

  const changes = week !== 1 ? diffWeekPrescription(program, 1, week) : null;
  const showChanges = changes && !(changes.length === 1 && /^No prescription changes$/.test(changes[0]));

  const stepper = totalWeeks > 1 ? `
    <div class="wag-weekbar">
      <button class="wag-week-btn" data-action="detail-week-step" data-delta="-1" aria-label="Previous week"${week <= 1 ? ' disabled' : ''}>‹</button>
      <div class="wag-week-label">
        <span class="wag-week-num">Week ${week} <span class="wag-week-total">of ${totalWeeks}</span></span>
        ${isCurrent
          ? '<span class="wag-week-pill">You are here</span>'
          : (isActive ? '<button class="wag-week-reset" data-action="detail-week-current">Back to current</button>' : '')}
      </div>
      <button class="wag-week-btn" data-action="detail-week-step" data-delta="1" aria-label="Next week"${week >= totalWeeks ? ' disabled' : ''}>›</button>
    </div>` : '';

  const rowsHTML = rows.map(r => {
    const icon = _WAG_TYPE_ICON[r.type] || '•';
    const isToday = todayKey === r.dayKey && !r.isRest;
    const status = completion && completion[r.dayKey] === 'done'
      ? '<span class="wag-status wag-status--done">✓ Done</span>'
      : (isToday ? '<span class="wag-status wag-status--today">Today</span>' : '');
    const attrs = r.interactive
      ? `data-action="open-day-preview" data-day="${r.dayKey}" data-week="${week}" data-program-id="${_currentProgramId}" role="button" tabindex="0"`
      : '';
    return `
      <div class="wag-row${r.isRest ? ' wag-row--rest' : ''}${r.interactive ? ' wag-row--interactive' : ''}${isToday ? ' wag-row--today' : ''}" ${attrs}>
        <div class="wag-day">${r.dayShort}</div>
        <div class="wag-body">
          <div class="wag-title-line">
            <span class="wag-type-icon" aria-hidden="true">${icon}</span>
            <span class="wag-title">${escapeHtml(r.title)}</span>
            ${status}
          </div>
          <div class="wag-summary">${escapeHtml(r.summary)}</div>
        </div>
        ${r.interactive ? '<span class="wag-chevron" aria-hidden="true">›</span>' : ''}
      </div>`;
  }).join('');

  return `
    <div class="detail-section">
      <div class="detail-section-title">This week at a glance</div>
      ${stepper}
      ${showChanges ? `<div class="wag-changes"><span class="wag-changes-label">Changes from Week 1</span>${changes.map(c => `<span class="wag-change">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
      <div class="wag-list">${rowsHTML}</div>
    </div>`;
}

// ── "How this program progresses" — phased, truthful, above the deep Plan tab ─
function renderProgressionOverview(program) {
  const { headline, phases, weeks } = summarizeProgression(program);
  if (!weeks) return '';

  const phasesHTML = phases.map(p => {
    const color = PLAN_KIND_COLOR[p.kind] || PLAN_KIND_COLOR.work;
    const range = p.from === p.to ? `Wk ${p.from}` : `Wk ${p.from}–${p.to}`;
    const tag = PLAN_KIND_LABEL[p.kind];
    return `
      <div class="prog-phase" style="--phase-color:${color}">
        <span class="prog-phase-range">${range}</span>
        <div class="prog-phase-body">
          <span class="prog-phase-label">${escapeHtml(p.label)}</span>
          ${p.spec ? `<span class="prog-phase-spec">${escapeHtml(p.spec)}</span>` : ''}
        </div>
        ${tag ? `<span class="prog-phase-tag" style="color:${color};border-color:${color}55">${tag}</span>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="detail-section">
      <div class="detail-section-title">How this program progresses</div>
      <p class="prog-headline">${escapeHtml(headline)}</p>
      ${phases.length > 1 ? `<div class="prog-phase-list">${phasesHTML}</div>` : ''}
    </div>`;
}

function renderPlanTimeline(program) {
  const rows = buildProgramTimeline(program);
  if (!rows.length) return '';

  // A run block's weekly sets/reps are an internal volume hack (sets:1) — the real
  // per-week prescription is the row label ("Week 3: 2×(90s run/90s walk…)"), so
  // suppress the meaningless "1×8" badge on lift-less programs.
  const showSpec = programHasLifts(program);
  const items = rows.map(r => {
    const color = PLAN_KIND_COLOR[r.kind] || PLAN_KIND_COLOR.work;
    const tag = PLAN_KIND_LABEL[r.kind];
    const spec = (showSpec && r.sets != null) ? `${r.sets}×${r.reps ?? ''}` : '';
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--overlay-sm);${r.deload ? 'border-left:3px solid ' + color + ';padding-left:8px;' : ''}">
        <span style="width:38px;font-family:ui-monospace,monospace;font-size:0.72rem;color:var(--text-muted);font-variant-numeric:tabular-nums;">Wk ${r.week}</span>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.82rem;color:var(--text-inverse);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.label || '—')}</span>
            ${tag ? `<span style="font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase;color:${color};border:1px solid ${color}55;border-radius:99px;padding:1px 6px;flex-shrink:0;">${tag}</span>` : ''}
          </div>
          <div style="height:5px;border-radius:99px;background:var(--overlay-sm);overflow:hidden;margin-top:5px;">
            <div style="height:100%;width:${r.volumeScore}%;background:${color};border-radius:99px;"></div>
          </div>
        </div>
        ${spec ? `<span style="font-family:ui-monospace,monospace;font-size:0.72rem;color:var(--text-secondary);flex-shrink:0;">${escapeHtml(spec)}</span>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="detail-section">
      <div class="detail-section-title">Week-by-week plan</div>
      <p class="text-xs text-muted" style="margin:-6px 0 10px;">How volume and intensity move across the ${rows.length}-week block — including deloads. Bars show relative weekly working volume.</p>
      <div class="plan-timeline">${items}</div>
    </div>`;
}

function renderDaySplit(days) {
  if (!days) return '';
  const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayNames = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

  return `
    <div class="day-split-list">
      ${dayOrder.map(dayKey => {
        const day = days[dayKey];
        if (!day) return '';
        const isRest = !day.lifts?.length && (!day.runs || day.runs === 'Rest');
        const hasPreview = !isRest && !!(day.workoutPreview || day.lifts?.length || (day.runs && day.runs !== 'Rest'));
        const dayColor = safeCssColor(day.color, 'var(--text-muted)');
        const interactiveAttrs = hasPreview
          ? `data-action="open-day-preview" data-day="${dayKey}" data-program-id="${escapeHtml(_currentProgramId || '')}" role="button" tabindex="0"`
          : '';
        return `
          <div class="day-split-row ${isRest ? 'day-split-row--rest' : ''} ${hasPreview ? 'day-split-row--interactive' : ''}" ${interactiveAttrs}>
            <div class="day-split-day">${dayNames[dayKey]}</div>
            <div class="day-split-title">${escapeHtml(day.title || dayKey)}</div>
            <div class="day-split-badge" style="border-color: ${dayColor}; color: ${dayColor}">
              ${escapeHtml(day.badge || '—')}
            </div>
            ${hasPreview ? `<span class="day-split-chevron">›</span>` : ''}
          </div>
        `;
      }).filter(Boolean).join('')}
    </div>
    <p class="day-split-hint">Tap a day to preview the full workout</p>
  `;
}

function formatEquipment(eq) {
  const labels = {
    'barbell': '🏋️ Barbell', 'rack': '🔧 Rack', 'bench': '🪑 Bench',
    'dumbbells': '💪 Dumbbells', 'cables': '⚙️ Cables', 'running-shoes': '👟 Running Shoes',
    'ski-erg': '🎿 Ski Erg', 'rowing-machine': '🚣 Rowing Machine', 'sled': '🛷 Sled',
    'kettlebell': '🔔 Kettlebell', 'sandbag': '🎒 Sandbag', 'pull-up-bar': '🔝 Pull-up Bar',
  };
  return labels[eq] || eq;
}

export function closeProgramDetail() {
  // Decoupled from library.js (avoids a circular import); app.js owns the
  // library:return handler and calls returnToLibrary().
  document.dispatchEvent(new CustomEvent('library:return'));
}

// ── Workout Preview Modal ─────────────────────────────────────────────────────

// A3 — the previewed day is now anchored to a WEEK. A stepper walks the block so
// you can see how a given day's phase/volume shifts across the program (e.g. the
// deload), instead of only ever seeing week 1.
let _preview = { dayKey: null, programId: null, week: 1 };

// ── Day-preview sheet a11y + scroll lifecycle ────────────────────────────────
// The sheet is a body-level `position: fixed` bottom-sheet. Two things it must
// get right on a phone, independent of the day content:
//   • the background must not scroll behind it, and closing must land the user
//     back at the exact library/detail scroll position they opened from;
//   • it must open at the top with the header visible, take focus, close on
//     Escape / Android back, and return focus to the day that opened it.
// These were all missing; the state below drives them. `_sheetOpen` guards the
// one-time setup so week-stepping (which re-renders the same open sheet) doesn't
// re-lock, re-push history, or steal the user's inner scroll position.
let _sheetOpen = false;
let _sheetTrigger = null;      // element to restore focus to on close
let _sheetLockedScrollY = 0;   // background scroll position captured at open
let _sheetHistoryPushed = false;
let _sheetKeyHandler = null;
let _sheetPopHandler = null;

function _lockBodyScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  _sheetLockedScrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
  const body = document.body;
  body.classList.add('sheet-scroll-locked');
  // position:fixed + negative top pins the page without losing the position, so
  // the background can't scroll and nothing reflows/jumps on lock.
  body.style.top = `-${_sheetLockedScrollY}px`;
}

function _unlockBodyScroll() {
  if (typeof document === 'undefined' || !document.body) return;
  const body = document.body;
  body.classList.remove('sheet-scroll-locked');
  body.style.top = '';
  if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, _sheetLockedScrollY);
}

export function stepPreviewWeek(delta) {
  if (!_preview.dayKey) return;
  // Same day, different week: keep the reader's place in the sheet.
  openDayPreviewModal(_preview.dayKey, _preview.programId, _preview.week + delta, { preserveScroll: true });
}

export function openDayPreviewModal(dayKey, programId, weekIndex, opts = {}) {
  const resolvedId = programId || _currentProgramId;
  const catalog = getCatalogEntry(resolvedId);
  const program = getProgramById(resolvedId);
  // Prefer the catalog day (richest: carries workoutPreview), then fall back to
  // the resolved program — which covers system PROGRAMS *and* custom programs
  // (getProgramById walks customPrograms → PROGRAMS → catalog).
  const day = catalog?.days?.[dayKey] || program?.days?.[dayKey];
  if (!day) return;

  const isRest = !day.lifts?.length && (!day.runs || day.runs === 'Rest');
  if (isRest) return;

  const backdrop = document.getElementById('wpmBackdrop');
  const sheet    = document.getElementById('wpmSheet');
  const titleEl  = document.getElementById('wpmTitle');
  const badgeEl  = document.getElementById('wpmBadge');
  const bodyEl   = document.getElementById('wpmBody');

  if (!sheet || !backdrop) return;

  const totalWeeks = Number(catalog?.durationWeeks || program?.totalWeeks) || 12;
  const wk = Math.max(1, Math.min(totalWeeks, Number(weekIndex) || 1));
  _preview = { dayKey, programId: resolvedId, week: wk };

  const mod = getWeekModifier(catalog || program, wk);
  const phaseLabel = resolveProgramPhase(catalog || program, wk).label;

  const dayLabels = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  titleEl.textContent = day.title || dayLabels[dayKey] || dayKey;
  badgeEl.textContent = day.badge || '';
  const dayColor = safeCssColor(day.color, 'var(--accent-blue)');
  badgeEl.style.color = dayColor;
  badgeEl.style.borderColor = dayColor + '55';

  // Week context bar with a stepper (only when the program spans >1 week).
  const weekBar = totalWeeks > 1 ? `
    <div class="wpm-weekbar" style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--overlay-sm);border-radius:10px;padding:8px 10px;margin-bottom:12px;">
      <button data-action="preview-week-step" data-delta="-1" aria-label="Previous week" style="background:none;border:none;color:var(--text-secondary);font-size:1.1rem;padding:2px 8px;cursor:pointer;${wk <= 1 ? 'opacity:0.3;pointer-events:none;' : ''}">‹</button>
      <div style="text-align:center;flex:1;min-width:0;">
        <div style="font-family:ui-monospace,monospace;font-size:0.72rem;color:var(--text-muted);">WEEK ${wk} / ${totalWeeks}</div>
        <div style="font-size:0.82rem;color:var(--text-inverse);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(phaseLabel || '—')}</div>
      </div>
      <button data-action="preview-week-step" data-delta="1" aria-label="Next week" style="background:none;border:none;color:var(--text-secondary);font-size:1.1rem;padding:2px 8px;cursor:pointer;${wk >= totalWeeks ? 'opacity:0.3;pointer-events:none;' : ''}">›</button>
    </div>` : '';

  let previewHtml;
  if (day.workoutPreview?.type === 'STRENGTH') {
    previewHtml = renderStrengthPreview(day, mod, day.workoutPreview.exercises);
  } else if (day.workoutPreview?.type === 'RUNNING') {
    previewHtml = renderRunningPreview(day.workoutPreview.phases);
  } else if (day.workoutPreview?.type === 'HYROX') {
    previewHtml = renderHyroxPreview(day.workoutPreview);
  } else {
    previewHtml = renderFallbackPreview(day, mod);
  }

  bodyEl.innerHTML = weekBar + previewHtml;

  backdrop.classList.add('active');
  sheet.classList.add('active');

  // Inner scroll: start at the top on a fresh open (header + first exercise
  // visible); preserve the reader's place only on a same-day week-step.
  if (!opts.preserveScroll) {
    if (bodyEl.scrollTo) bodyEl.scrollTo(0, 0); else bodyEl.scrollTop = 0;
    if (sheet.scrollTo) sheet.scrollTo(0, 0); else sheet.scrollTop = 0;
  }

  // One-time setup per open (not re-run while week-stepping the open sheet).
  if (!_sheetOpen) {
    _sheetOpen = true;
    _sheetTrigger = _sheetTrigger ||
      (typeof document !== 'undefined' ? /** @type {any} */ (document.activeElement) : null);
    _lockBodyScroll();

    // Escape closes.
    _sheetKeyHandler = (e) => { if (e.key === 'Escape') closeDayPreviewModal(); };
    document.addEventListener('keydown', _sheetKeyHandler);

    // Android/browser Back closes the sheet instead of leaving the page. We push
    // one history entry on open and pop it on close; the popstate handler runs
    // teardown without pushing back (guarded by _sheetHistoryPushed).
    if (typeof history !== 'undefined' && history.pushState) {
      try {
        history.pushState({ wpmSheet: true }, '');
        _sheetHistoryPushed = true;
        _sheetPopHandler = () => { _sheetHistoryPushed = false; closeDayPreviewModal(); };
        window.addEventListener('popstate', _sheetPopHandler);
      } catch (_) { /* history unavailable */ }
    }

    // Move focus into the sheet so keyboard/screen-reader users land inside it.
    const closeBtn = /** @type {HTMLElement|null} */ (sheet.querySelector('.sheet-close-btn'));
    if (closeBtn && closeBtn.focus) { try { closeBtn.focus(); } catch (_) {} }
  }
}

function _parseDescExercises(desc) {
  if (!desc || desc === 'Rest') return [];
  // Match "Exercise Name (4×8–10)" — handles × or x, en-dash or hyphen in reps
  const rx = /([A-Za-z][^(,\n]+?)\s*\((\d+)\s*[×xX]\s*([^)]+)\)/g;
  const results = [];
  let m;
  while ((m = rx.exec(desc)) !== null) {
    results.push({ name: m[1].trim(), sets: m[2], reps: m[3].trim().replace(/\.$/, '') });
  }
  return results;
}

function renderFallbackPreview(day, mod) {
  let html = '';
  const hasRun = day.runs && day.runs !== 'Rest';
  const hasLifts = day.lifts?.length;
  // A3 — when the day carries no per-lift spec, show THIS week's prescription
  // (sets × reps) from the week modifier so the name list isn't week-blind.
  const wkSpec = (mod && mod.sets) ? `${mod.sets} × ${mod.reps ?? ''}` : '';

  if (hasRun) {
    html += `
      <div class="wpm-type-label wpm-type-label--running">🏃 Running</div>
      <div class="wpm-fallback-run">${escapeHtml(day.runs)}</div>
    `;
  }

  if (hasLifts) {
    const parsed = _parseDescExercises(day.desc);
    html += `
      <div class="wpm-type-label wpm-type-label--strength" style="${hasRun ? 'margin-top:16px;' : ''}">🏋️ Strength Session</div>
    `;
    if (parsed.length > 0) {
      html += `
        <div class="wpm-strength-grid wpm-strength-grid--compact">
          <div class="wpm-grid-header">
            <span>Exercise</span><span>Sets</span><span>Reps</span>
          </div>
          ${parsed.map(ex => `
            <div class="wpm-grid-row">
              <span class="wpm-ex-name">${escapeHtml(ex.name)}</span>
              <span class="wpm-ex-val">${escapeHtml(ex.sets)}</span>
              <span class="wpm-ex-val">${escapeHtml(ex.reps)}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="wpm-exercise-list">
          ${day.lifts.map(lift => `<div class="wpm-exercise-item" style="display:flex;justify-content:space-between;gap:10px;">
            <span>${escapeHtml(lift)}</span>${wkSpec ? `<span style="font-family:ui-monospace,monospace;color:var(--text-secondary);flex-shrink:0;">${escapeHtml(wkSpec)}</span>` : ''}
          </div>`).join('')}
        </div>
      `;
      if (day.desc && day.desc !== 'Rest') {
        html += `<div class="wpm-fallback-desc">${escapeHtml(day.desc)}</div>`;
      }
    }
  }

  return html || '<p class="wpm-empty">No preview available for this day.</p>';
}

export function closeDayPreviewModal() {
  document.getElementById('wpmBackdrop')?.classList.remove('active');
  document.getElementById('wpmSheet')?.classList.remove('active');

  if (!_sheetOpen) return; // already torn down (e.g. double close)
  _sheetOpen = false;

  // Detach listeners.
  if (_sheetKeyHandler) { document.removeEventListener('keydown', _sheetKeyHandler); _sheetKeyHandler = null; }
  if (_sheetPopHandler) { window.removeEventListener('popstate', _sheetPopHandler); _sheetPopHandler = null; }

  // Consume the history entry we pushed, unless we're already here because the
  // user hit Back (popstate cleared the flag) — that avoids a double-pop loop.
  if (_sheetHistoryPushed) {
    _sheetHistoryPushed = false;
    if (typeof history !== 'undefined' && history.back) { try { history.back(); } catch (_) {} }
  }

  // Unlock the background and restore the exact prior scroll position.
  _unlockBodyScroll();

  // Return focus to the day button that opened the sheet.
  const trigger = _sheetTrigger;
  _sheetTrigger = null;
  if (trigger && trigger.focus) { try { trigger.focus(); } catch (_) {} }
}

// Prescription-truthful: renders the SAME sets×reps the cockpit will show for
// THIS week via liftTarget(desc, name, mod) — an inline "(4×8–10)" spec when the
// program carries one, otherwise the week modifier's uniform target. Reading the
// hand-written workoutPreview sets/reps/RPE/rest instead promised a per-lift
// prescription the engine never delivers, and the columns never changed as you
// stepped weeks. RPE/Rest columns dropped (the engine produces neither).
function renderStrengthPreview(day, mod, fallbackExercises) {
  const names = (day?.lifts?.length ? day.lifts : (fallbackExercises || []).map(e => e.exercise))
    .filter(n => typeof n === 'string' && n.trim());
  if (!names.length) return '<p class="wpm-empty">No exercises listed.</p>';
  return `
    <div class="wpm-type-label wpm-type-label--strength">🏋️ Strength Session</div>
    <div class="wpm-strength-grid wpm-strength-grid--compact">
      <div class="wpm-grid-header">
        <span>Exercise</span><span>Sets</span><span>Reps</span>
      </div>
      ${names.map(name => {
        const t = liftTarget(day?.desc, name, mod || {});
        return `
        <div class="wpm-grid-row">
          <span class="wpm-ex-name">${escapeHtml(name)}</span>
          <span class="wpm-ex-val">${t.sets}</span>
          <span class="wpm-ex-val">${t.reps}</span>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderHyroxPreview(preview) {
  const { stations, format, totalTime, notes } = preview;
  const formatLabels = {
    race: '🏟️ HYROX Singles',
    half: '🏟️ HYROX Half',
    doubles: '👥 HYROX Doubles',
    pro: '🏅 HYROX PRO',
    wod: '💪 HYROX WOD',
    circuit: '⚡ Station Circuit',
  };
  const formatLabel = formatLabels[format] || '🏟️ HYROX';

  return `
    <div class="wpm-type-label wpm-type-label--hyrox">${escapeHtml(formatLabel)}</div>
    ${totalTime ? `<div class="wpm-hyrox-meta">⏱️ Est. time: <strong>${escapeHtml(totalTime)}</strong></div>` : ''}
    <div class="wpm-hyrox-legs">
      ${(Array.isArray(stations) ? stations : []).map((s, i) => `
        ${s.run ? `<div class="wpm-hyrox-run-leg"><span class="wpm-hyrox-run-icon">🏃</span><span class="wpm-hyrox-run-text">Run ${escapeHtml(s.run)}</span></div>` : ''}
        <div class="wpm-hyrox-station-leg">
          <span class="wpm-hyrox-station-num">${i + 1}</span>
          <div class="wpm-hyrox-station-body">
            <span class="wpm-hyrox-station-name">${escapeHtml(s.station || '')}</span>
            ${s.weight ? `<span class="wpm-hyrox-station-weight">${escapeHtml(s.weight)}</span>` : ''}
            ${s.notes ? `<span class="wpm-hyrox-station-note">${escapeHtml(s.notes)}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ${notes ? `<div class="wpm-hyrox-notes">💡 ${escapeHtml(notes)}</div>` : ''}
  `;
}

function renderRunningPreview(phases) {
  if (!phases?.length) return '<p class="wpm-empty">No phases listed.</p>';
  const phaseIcons = { warmup: '🌡️', mainSet: '⚡', strength: '🏋️', cooldown: '🧊' };
  const phaseColors = { warmup: '#22d3ee', mainSet: '#ef4444', strength: '#8b5cf6', cooldown: '#10b981' };

  return `
    <div class="wpm-type-label wpm-type-label--running">🏃 Running Session</div>
    <div class="wpm-running-timeline">
      ${phases.map((phase, i) => {
        const icon  = phaseIcons[phase.type] || '●';
        const color = phaseColors[phase.type] || '#94a3b8';
        const isLast = i === phases.length - 1;
        return `
          <div class="wpm-phase ${isLast ? 'wpm-phase--last' : ''}">
            <div class="wpm-phase-connector" style="--phase-color:${color}">
              <div class="wpm-phase-dot">${icon}</div>
              ${!isLast ? '<div class="wpm-phase-line"></div>' : ''}
            </div>
            <div class="wpm-phase-content">
              <div class="wpm-phase-header">
                <span class="wpm-phase-name" style="color:${color}">${escapeHtml(phase.name || '')}</span>
                <span class="wpm-phase-duration">${escapeHtml(phase.duration || '')}</span>
              </div>
              <div class="wpm-phase-pace">${escapeHtml(phase.pace || '')}</div>
              <div class="wpm-phase-desc">${escapeHtml(phase.description || '')}</div>
              ${phase.notes ? `<div class="wpm-phase-note">💡 ${escapeHtml(phase.notes)}</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function handleDetailAction(action, el) {
  switch (action) {
    case 'close-program-detail':
      closeProgramDetail();
      break;
    case 'make-active-from-detail': {
      const id = el.getAttribute('data-program-id');
      if (id) {
        document.dispatchEvent(new CustomEvent('library:make-active', { detail: { id } }));
      }
      break;
    }
    case 'view-active-program': {
      closeProgramDetail();
      document.dispatchEvent(new CustomEvent('library:view-active'));
      break;
    }
    case 'open-program-detail': {
      const id = el.closest('[data-program-id]')?.getAttribute('data-program-id');
      if (id) renderProgramDetail(id, _appState);
      break;
    }
    case 'open-day-preview': {
      const dayKey   = el.getAttribute('data-day');
      const progId   = el.getAttribute('data-program-id');
      const wkAttr   = parseInt(el.getAttribute('data-week'), 10);
      // Remember the exact trigger so focus returns here when the sheet closes.
      _sheetTrigger = el;
      // Open at the previewed week when the schedule row carries one (preview
      // only — never mutates program progress).
      if (dayKey) openDayPreviewModal(dayKey, progId, Number.isFinite(wkAttr) ? wkAttr : undefined);
      break;
    }
    case 'detail-week-step': {
      const delta = parseInt(el.getAttribute('data-delta'), 10);
      if (!isNaN(delta) && _currentProgramId) {
        const next = (_scheduleWeek || 1) + delta;
        _scheduleWeek = Math.min(_scheduleTotalWeeks, Math.max(1, next));
        renderProgramDetail(_currentProgramId, _appState);
      }
      break;
    }
    case 'detail-week-current': {
      // Jump the schedule PREVIEW back to the active week (does not change it).
      _scheduleWeek = Math.max(1, parseInt(_appState?.currentWeek, 10) || 1);
      renderProgramDetail(_currentProgramId, _appState);
      break;
    }
    case 'preview-week-step': {
      const delta = parseInt(el.getAttribute('data-delta'), 10);
      if (!isNaN(delta)) stepPreviewWeek(delta);
      break;
    }
    case 'close-day-preview':
      closeDayPreviewModal();
      break;
    case 'detail-toggle-bookmark': {
      const id = el.getAttribute('data-program-id');
      if (!id) break;
      const nowSaved = toggleBookmark(id);
      el.className = `detail-bookmark-btn ${nowSaved ? 'saved' : ''}`;
      el.setAttribute('aria-label', nowSaved ? 'Remove bookmark' : 'Save program');
      el.textContent = nowSaved ? '🔖' : '🤍';
      break;
    }
    case 'mark-program-complete': {
      const id = el.getAttribute('data-program-id');
      if (!id) break;
      const weeks = _appState?.currentWeek ? parseInt(_appState.currentWeek, 10) : undefined;
      markProgramCompleted(id, weeks);
      renderProgramDetail(id, _appState);
      break;
    }
  }
}
