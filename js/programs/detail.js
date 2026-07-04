// @ts-check
// =============================================================================
// PROGRAM DETAIL PAGE — Full-screen program detail view
// =============================================================================
import { PROGRAM_CATALOG, CATEGORIES, DIFFICULTY_LABELS, getCatalogEntry } from './catalog.js';
import { buildProgramTimeline } from './timeline.js';
import { getSimilarPrograms } from './recommendations.js';
import { renderProgramCard } from './program-card.js';
import { PROGRAMS } from '../constants.js';
import { isBookmarked, toggleBookmark, isProgramCompleted, markProgramCompleted, getProgramById, getPersonalRating } from '../state.js';
import { escapeHtml } from '../util.js';

let _currentProgramId = null;
let _appState = null;
let _detailTab = 'overview';   // V2-6 — 'overview' (what/why) | 'structure' (what you'll do)

export function renderProgramDetail(programId, appState) {
  // Opening a different program always starts on Overview.
  if (_currentProgramId !== programId) _detailTab = 'overview';
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

  const similarPrograms = getSimilarPrograms(program, 6);

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
          ${outcomes.map(o => `<div class="detail-outcome-chip"><span class="detail-outcome-arrow">→</span> ${o}</div>`).join('')}
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
                data-program-id="${programId}"
                aria-label="Rate this program">⭐</button>
        <button class="detail-bookmark-btn ${saved ? 'saved' : ''}"
                data-action="detail-toggle-bookmark"
                data-program-id="${programId}"
                aria-label="${saved ? 'Remove bookmark' : 'Save program'}">
          ${saved ? '🔖' : '🤍'}
        </button>
      </div>
    </div>

    <!-- Hero -->
    <div class="detail-hero"
         style="background: linear-gradient(165deg, ${program.coverGradient?.[0] || '#1a0e2e'}, ${program.coverGradient?.[1] || '#0d1b2a'})">
      <div class="detail-hero-icon">${program.icon || '📋'}</div>
      <div class="detail-hero-content">
        <span class="detail-category-badge" style="background: ${program.accentColor || category.color}22; color: ${program.accentColor || category.color}; border-color: ${program.accentColor || category.color}40">
          ${category.icon} ${category.label}
        </span>
        <h1 class="detail-title">${escapeHtml(program.name)}</h1>
        <p class="detail-tagline">${escapeHtml(program.tagline || program.dossier?.philosophy?.slice(0, 100) || '')}</p>
        <div class="detail-author">by ${escapeHtml(program.author?.name || program.dossier?.creator || 'Unknown')}
          ${program.author?.verified ? ' <span class="detail-verified">✓</span>' : ''}
        </div>
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
        <div class="detail-stat-value">${program.rating ? `${program.rating} ★` : '—'}</div>
        <div class="detail-stat-label">Rating</div>
      </div>
      <div class="detail-stat-divider"></div>
      <div class="detail-stat">
        <div class="detail-stat-value">${program.enrolledCount ? program.enrolledCount.toLocaleString() : '—'}</div>
        <div class="detail-stat-label">Athletes</div>
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

    <!-- Program Tags (Difficulty + Goals) -->
    <div class="detail-tags-row">
      <span class="detail-tag detail-tag--difficulty" style="color: ${diff.color}; border-color: ${diff.color}40">
        ${'●'.repeat(diff.dots)}${'○'.repeat(4 - diff.dots)} ${diff.label}
      </span>
      ${program.equipmentTier ? `<span class="detail-tag detail-tag--equipment">${{ gym: '🏢 Full Gym', home: '🏠 Home Gym', garage_gym: '🔩 Garage Gym', bodyweight: '🤸 Bodyweight', minimal: '⚡ Minimal' }[program.equipmentTier] || program.equipmentTier}</span>` : ''}
      ${(program.goals || []).slice(0, 3).map(g => `<span class="detail-tag detail-tag--goal">${g.replace(/-/g, ' ')}</span>`).join('')}
    </div>

    <!-- CTA -->
    <div class="detail-cta-wrap">
      ${isActive
        ? `<button class="detail-cta-btn detail-cta-btn--active" data-action="view-active-program">
              View Active Program
           </button>`
        : completed
        ? `<button class="detail-cta-btn detail-cta-btn--completed" data-action="make-active-from-detail" data-program-id="${programId}">
              Train Again
           </button>`
        : `<button class="detail-cta-btn" data-action="make-active-from-detail" data-program-id="${programId}">
              ${wod ? 'Start This Workout' : 'Start This Program'}
           </button>`
      }
      ${isActive && !completed ? `
        <button class="detail-complete-btn" data-action="mark-program-complete" data-program-id="${programId}">
          Mark as Complete
        </button>
      ` : ''}
      <button class="detail-complete-btn" data-action="customize-program" data-program-id="${programId}">
        ✏️ Customize — make an editable copy
      </button>
      <button class="detail-complete-btn" data-action="open-compare" data-program-id="${programId}">
        ⚖️ Compare with another program
      </button>
      ${program.rating
        ? `<div class="detail-rating">
             ${renderStars(program.rating)}
             <span class="detail-rating-value">${program.rating}</span>
             <span class="detail-rating-count">${(program.ratingCount || 0).toLocaleString()} ratings</span>
           </div>`
        : `<div class="detail-rating detail-rating--empty">
             <span class="detail-rating-empty-text">No ratings yet</span>
           </div>`
      }
      ${personalRating ? `
        <div class="detail-your-rating" data-action="rate-program" data-program-id="${programId}" role="button" tabindex="0">
          <span class="detail-your-rating-label">Your rating</span>
          ${renderStars(personalRating.rating)}
          <span class="detail-rating-value">${personalRating.rating}/5</span>
        </div>` : ''}
    </div>

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
    const shown = preview.exercises.slice(0, 5);
    const extra = preview.exercises.length - shown.length;
    bodyHtml = `
      <div class="sample-exercise-list">
        ${shown.map(ex => `
          <div class="sample-exercise-row">
            <span class="sample-ex-name">${ex.exercise}</span>
            <span class="sample-ex-prescription">${ex.sets} × ${ex.reps}</span>
          </div>
        `).join('')}
        ${extra > 0 ? `<div class="sample-ex-more">+${extra} more exercises</div>` : ''}
      </div>`;
  } else if (preview?.type === 'RUNNING' && preview.phases?.length) {
    bodyHtml = `
      <div class="sample-run-phases">
        ${preview.phases.map(ph => `
          <div class="sample-run-phase">
            <span class="sample-run-phase-name">${ph.name}</span>
            <span class="sample-run-phase-detail">${ph.duration} · ${ph.pace}</span>
          </div>
        `).join('')}
      </div>`;
  } else if (chosenDay.lifts?.length) {
    const shown = chosenDay.lifts.slice(0, 5);
    const extra = chosenDay.lifts.length - shown.length;
    bodyHtml = `
      <div class="sample-exercise-list">
        ${shown.map(l => `<div class="sample-exercise-row"><span class="sample-ex-name">${l}</span></div>`).join('')}
        ${extra > 0 ? `<div class="sample-ex-more">+${extra} more exercises</div>` : ''}
      </div>`;
  } else if (chosenDay.runs && chosenDay.runs !== 'Rest') {
    bodyHtml = `<div class="sample-run-text">${chosenDay.runs}</div>`;
  }

  if (!bodyHtml) return '';

  const accentColor = chosenDay.color?.startsWith('var(') ? null : chosenDay.color;
  const badgeStyle = accentColor
    ? `color: ${accentColor}; border-color: ${accentColor}40`
    : `color: var(--text-secondary); border-color: rgba(255,255,255,0.12)`;

  // WODs: drop the day-of-week label (it's irrelevant) and use "The Workout" as section title
  const sectionTitle = wod ? 'The Workout' : 'Sample Session';
  const headerHtml = wod
    ? (chosenDay.badge ? `<span class="sample-workout-badge" style="${badgeStyle}">${chosenDay.badge}</span>` : '')
    : `<span class="sample-workout-dayname">${dayNames[chosenKey]}</span>
       ${chosenDay.badge ? `<span class="sample-workout-badge" style="${badgeStyle}">${chosenDay.badge}</span>` : ''}`;

  return `
    <div class="detail-section">
      <div class="detail-section-title">${sectionTitle}</div>
      <div class="sample-workout-card">
        ${headerHtml ? `<div class="sample-workout-header">${headerHtml}</div>` : ''}
        <div class="sample-workout-title">${isRun ? '🏃' : '🏋️'} ${chosenDay.title || 'Training Session'}</div>
        ${bodyHtml}
      </div>
    </div>
  `;
}

// A1 — the week-by-week plan. Renders the progression/deload arc that every
// program already carries in weeklyVolModifiers (with a WEEK_PHASE_NAMES
// fallback), tinted by phase so the shape of the block reads at a glance.
const PLAN_KIND_COLOR = {
  deload: '#22d3ee', peak: '#ef4444', taper: '#a78bfa',
  intensify: '#f59e0b', build: '#8b5cf6', work: '#64748b',
};
const PLAN_KIND_LABEL = {
  deload: 'Deload', peak: 'Peak', taper: 'Taper', intensify: 'Intensity', build: 'Build', work: '',
};

function renderPlanTimeline(program) {
  const rows = buildProgramTimeline(program);
  if (!rows.length) return '';

  const items = rows.map(r => {
    const color = PLAN_KIND_COLOR[r.kind] || PLAN_KIND_COLOR.work;
    const tag = PLAN_KIND_LABEL[r.kind];
    const spec = r.sets != null ? `${r.sets}×${r.reps ?? ''}` : '';
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
        const interactiveAttrs = hasPreview
          ? `data-action="open-day-preview" data-day="${dayKey}" data-program-id="${_currentProgramId}" role="button" tabindex="0"`
          : '';
        return `
          <div class="day-split-row ${isRest ? 'day-split-row--rest' : ''} ${hasPreview ? 'day-split-row--interactive' : ''}" ${interactiveAttrs}>
            <div class="day-split-day">${dayNames[dayKey]}</div>
            <div class="day-split-title">${day.title || dayKey}</div>
            <div class="day-split-badge" style="border-color: ${day.color || 'transparent'}; color: ${day.color || 'var(--text-muted)'}">
              ${day.badge || '—'}
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

export function openDayPreviewModal(dayKey, programId) {
  const resolvedId = programId || _currentProgramId;
  const catalog = getCatalogEntry(resolvedId);
  // Prefer the catalog day (richest: carries workoutPreview), then fall back to
  // the resolved program — which covers system PROGRAMS *and* custom programs
  // (getProgramById walks customPrograms → PROGRAMS → catalog).
  const day = catalog?.days?.[dayKey] || getProgramById(resolvedId)?.days?.[dayKey];
  if (!day) return;

  const isRest = !day.lifts?.length && (!day.runs || day.runs === 'Rest');
  if (isRest) return;

  const backdrop = document.getElementById('wpmBackdrop');
  const sheet    = document.getElementById('wpmSheet');
  const titleEl  = document.getElementById('wpmTitle');
  const badgeEl  = document.getElementById('wpmBadge');
  const bodyEl   = document.getElementById('wpmBody');

  if (!sheet || !backdrop) return;

  const dayLabels = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

  titleEl.textContent = day.title || dayLabels[dayKey] || dayKey;
  badgeEl.textContent = day.badge || '';
  badgeEl.style.color = day.color || 'var(--accent-blue)';
  badgeEl.style.borderColor = (day.color || 'var(--accent-blue)') + '55';

  if (day.workoutPreview?.type === 'STRENGTH') {
    bodyEl.innerHTML = renderStrengthPreview(day.workoutPreview.exercises);
  } else if (day.workoutPreview?.type === 'RUNNING') {
    bodyEl.innerHTML = renderRunningPreview(day.workoutPreview.phases);
  } else if (day.workoutPreview?.type === 'HYROX') {
    bodyEl.innerHTML = renderHyroxPreview(day.workoutPreview);
  } else {
    bodyEl.innerHTML = renderFallbackPreview(day);
  }

  backdrop.classList.add('active');
  sheet.classList.add('active');
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

function renderFallbackPreview(day) {
  let html = '';
  const hasRun = day.runs && day.runs !== 'Rest';
  const hasLifts = day.lifts?.length;

  if (hasRun) {
    html += `
      <div class="wpm-type-label wpm-type-label--running">🏃 Running</div>
      <div class="wpm-fallback-run">${day.runs}</div>
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
              <span class="wpm-ex-name">${ex.name}</span>
              <span class="wpm-ex-val">${ex.sets}</span>
              <span class="wpm-ex-val">${ex.reps}</span>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `
        <div class="wpm-exercise-list">
          ${day.lifts.map(lift => `<div class="wpm-exercise-item">${lift}</div>`).join('')}
        </div>
      `;
      if (day.desc && day.desc !== 'Rest') {
        html += `<div class="wpm-fallback-desc">${day.desc}</div>`;
      }
    }
  }

  return html || '<p class="wpm-empty">No preview available for this day.</p>';
}

export function closeDayPreviewModal() {
  document.getElementById('wpmBackdrop')?.classList.remove('active');
  document.getElementById('wpmSheet')?.classList.remove('active');
}

function renderStrengthPreview(exercises) {
  if (!exercises?.length) return '<p class="wpm-empty">No exercises listed.</p>';
  return `
    <div class="wpm-type-label wpm-type-label--strength">🏋️ Strength Session</div>
    <div class="wpm-strength-grid">
      <div class="wpm-grid-header">
        <span>Exercise</span><span>Sets</span><span>Reps</span><span>RPE</span><span>Rest</span>
      </div>
      ${exercises.map(ex => `
        <div class="wpm-grid-row">
          <span class="wpm-ex-name">${ex.exercise}</span>
          <span class="wpm-ex-val">${ex.sets}</span>
          <span class="wpm-ex-val">${ex.reps}</span>
          <span class="wpm-ex-val wpm-rpe" data-rpe="${ex.rpe}">${ex.rpe}</span>
          <span class="wpm-ex-val wpm-rest">${ex.rest}</span>
        </div>
      `).join('')}
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
    <div class="wpm-type-label wpm-type-label--hyrox">${formatLabel}</div>
    ${totalTime ? `<div class="wpm-hyrox-meta">⏱️ Est. time: <strong>${totalTime}</strong></div>` : ''}
    <div class="wpm-hyrox-legs">
      ${stations.map((s, i) => `
        ${s.run ? `<div class="wpm-hyrox-run-leg"><span class="wpm-hyrox-run-icon">🏃</span><span class="wpm-hyrox-run-text">Run ${s.run}</span></div>` : ''}
        <div class="wpm-hyrox-station-leg">
          <span class="wpm-hyrox-station-num">${i + 1}</span>
          <div class="wpm-hyrox-station-body">
            <span class="wpm-hyrox-station-name">${s.station}</span>
            ${s.weight ? `<span class="wpm-hyrox-station-weight">${s.weight}</span>` : ''}
            ${s.notes ? `<span class="wpm-hyrox-station-note">${s.notes}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ${notes ? `<div class="wpm-hyrox-notes">💡 ${notes}</div>` : ''}
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
                <span class="wpm-phase-name" style="color:${color}">${phase.name}</span>
                <span class="wpm-phase-duration">${phase.duration}</span>
              </div>
              <div class="wpm-phase-pace">${phase.pace}</div>
              <div class="wpm-phase-desc">${phase.description}</div>
              ${phase.notes ? `<div class="wpm-phase-note">💡 ${phase.notes}</div>` : ''}
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
      if (dayKey) openDayPreviewModal(dayKey, progId);
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
