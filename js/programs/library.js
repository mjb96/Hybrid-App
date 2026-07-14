// =============================================================================
// PROGRAM LIBRARY — Training program discovery and management
// =============================================================================
import { PROGRAM_CATALOG, CATEGORIES, DIFFICULTY_LABELS, getCatalogEntry } from './catalog.js';
import { getHomeCollections, filterByCategory, getCollectionDef } from './collections.js';
import { searchPrograms, POPULAR_SEARCHES } from './search.js';
import { getRecommendations } from './recommendations.js';
import { renderProgramDetail, closeProgramDetail } from './detail.js';
import { renderProgramCard, isWod, coverGlyphFor } from './program-card.js';
import { icon as svgIcon } from '../ui/icons.js';
import { toggleBookmark, recordRecentlyViewed, getProgramById, getActiveProgramIssue, saveStateToLocalStorage } from '../state.js';
import { escapeHtml, programProgressPct } from '../util.js';

// V2-6 — the curated home rails (in order) shown on the lean Discover surface.
// Everything else stays reachable via the category chips + Browse-all grid.
const CURATED_HOME_COLLECTIONS = ['hybridhq-picks', 'highest-rated', 'trending'];

let _appState = null;
let _activeFilter = 'all';
let _activeDifficulty = null; // null | 'beginner' | 'intermediate' | 'advanced' | 'elite'
let _activeTab = 'discover'; // 'discover' | 'saved' | 'completed'
let _searchQuery = '';
let _searchDebounce = null;

export function initProgramLibrary(appState) {
  _appState = appState;
}

export function updateLibraryState(appState) {
  _appState = appState;
}

// Resolve a program id to its display metadata WITHOUT getProgramById's
// hybrid_engine fallback — a bookmark/completion for a deleted id should drop
// out of the list, not silently masquerade as the default program. Covers
// catalog + system (catalog entries exist for system programs) and custom.
function resolveProgramMeta(id) {
  return getCatalogEntry(id) || _appState?.customPrograms?.find(p => p.id === id) || null;
}

// ── Persisted filter state (programLibrary.activeFilters) ─────────────────────
let _filtersRestored = false;

function restoreFilters() {
  const f = _appState?.programLibrary?.activeFilters;
  if (!f || typeof f !== 'object') return;
  if (typeof f.filter === 'string') _activeFilter = f.filter;
  if (f.difficulty === null || typeof f.difficulty === 'string') _activeDifficulty = f.difficulty || null;
  if (typeof f.tab === 'string') _activeTab = f.tab;
}

function persistFilters() {
  if (!_appState?.programLibrary) return;
  _appState.programLibrary.activeFilters = {
    filter: _activeFilter,
    difficulty: _activeDifficulty,
    tab: _activeTab,
  };
  saveStateToLocalStorage(true);
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderLibrary() {
  const screen = document.getElementById('programLibraryScreen');
  if (!screen) return;

  // Restore the user's last filter/tab once per session (persisted across reloads).
  if (!_filtersRestored) { restoreFilters(); _filtersRestored = true; }

  renderActiveProgramBanner();
  renderLibraryTabs();
  if (_activeTab === 'discover') {
    renderFilterChips();
    renderDifficultyChips();
    renderLibraryContent();
  } else if (_activeTab === 'saved') {
    renderSavedPrograms();
  } else if (_activeTab === 'completed') {
    renderCompletedPrograms();
  }
  setupLibraryEvents();
}

// ── Active program banner ─────────────────────────────────────────────────────

function getNextWorkoutInfo(programId) {
  const catalog = getCatalogEntry(programId);
  const programData = getProgramById(programId);
  const days = catalog?.days || programData?.days;
  if (!days) return null;

  const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const todayIdx = new Date().getDay();

  for (let i = 0; i < 7; i++) {
    const dayKey = DAY_KEYS[(todayIdx + i) % 7];
    const day = days[dayKey];
    if (!day) continue;
    const isRest = !day.lifts?.length && (!day.runs || day.runs === 'Rest');
    if (!isRest) {
      return {
        label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : 'Next',
        title: day.title || day.badge || dayKey,
      };
    }
  }
  return null;
}

export function renderActiveProgramBanner() {
  const banner = document.getElementById('activeProgBanner');
  if (!banner || !_appState) return;

  const activeId = _appState.activeProgramId;
  if (!activeId) {
    banner.innerHTML = '';
    banner.style.display = 'none';
    return;
  }

  const issue = getActiveProgramIssue(_appState);
  if (issue) {
    banner.style.display = 'block';
    banner.innerHTML = `
      <div class="active-prog-card active-prog-card--recovery" role="status" aria-live="polite">
        <div class="active-prog-inner">
          <div class="active-prog-left">
            <span class="active-prog-badge">ACTION NEEDED</span>
            <div class="active-prog-name">${escapeHtml(issue.title)}</div>
            <div class="active-prog-meta">${escapeHtml(issue.message)}</div>
          </div>
          <button class="create-cta-btn" data-action="open-create-program">Create new</button>
        </div>
      </div>`;
    return;
  }

  const catalog = getCatalogEntry(activeId);
  const programName = catalog?.name || _appState.customPrograms?.find(p => p.id === activeId)?.name || 'My Program';
  const currentWeek = parseInt(_appState.currentWeek || '1', 10);
  // Fall back to the resolved program's totalWeeks so custom/system programs
  // without a catalog duration don't all collapse to a hard-coded "of 12".
  const totalWeeks = catalog?.durationWeeks || getProgramById(activeId)?.totalWeeks || 12;
  const pct = programProgressPct(currentWeek, totalWeeks);
  const accent = catalog?.accentColor || '#8b5cf6';
  const circumference = 113;
  const dashArray = Math.round((pct / 100) * circumference);
  const nextWorkout = getNextWorkoutInfo(activeId);

  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="active-prog-card" data-action="open-program-detail" data-program-id="${activeId}">
      <div class="active-prog-glow" style="background: ${accent}22"></div>
      <div class="active-prog-inner">
        <div class="active-prog-left">
          <span class="active-prog-badge">NOW TRAINING</span>
          <div class="active-prog-name">${programName}</div>
          <div class="active-prog-meta">Week ${currentWeek} of ${totalWeeks}
            ${nextWorkout ? `<span class="active-prog-meta-sep">·</span> <span class="active-prog-next-label">${nextWorkout.label}: ${nextWorkout.title}</span>` : ''}
          </div>
        </div>
        <div class="active-prog-right">
          <div class="active-prog-progress-ring">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" class="active-prog-ring-track" stroke-width="3"/>
              <circle cx="22" cy="22" r="18" fill="none"
                stroke="${accent}" stroke-width="3"
                stroke-dasharray="${dashArray} ${circumference}"
                stroke-linecap="round"
                transform="rotate(-90 22 22)"/>
            </svg>
            <span class="active-prog-pct">${pct}%</span>
          </div>
        </div>
      </div>
      <div class="active-prog-progress-bar">
        <div class="active-prog-progress-fill" style="width: ${pct}%; background: ${accent}"></div>
      </div>
      <div class="active-prog-footer">
        <span class="active-prog-complete-text">${pct}% Complete</span>
        <button class="active-prog-continue-btn" data-action="continue-active-program" style="--accent: ${accent}">Continue →</button>
      </div>
    </div>
  `;
}

// ── Library tabs ─────────────────────────────────────────────────────────────

function renderLibraryTabs() {
  const container = document.getElementById('progLibraryTabs');
  if (!container) return;

  const savedCount = _appState?.programLibrary?.bookmarks?.length || 0;
  const completedCount = _appState?.programLibrary?.completions?.length || 0;

  container.innerHTML = `
    <button class="lib-tab ${_activeTab === 'discover' ? 'active' : ''}" data-action="lib-tab" data-tab="discover">
      Discover
    </button>
    <button class="lib-tab ${_activeTab === 'saved' ? 'active' : ''}" data-action="lib-tab" data-tab="saved">
      Saved${savedCount > 0 ? ` <span class="lib-tab-count">${savedCount}</span>` : ''}
    </button>
    <button class="lib-tab ${_activeTab === 'completed' ? 'active' : ''}" data-action="lib-tab" data-tab="completed">
      Completed${completedCount > 0 ? ` <span class="lib-tab-count">${completedCount}</span>` : ''}
    </button>
  `;
}

function renderSavedPrograms() {
  const filterEl = document.getElementById('progFilterChips');
  const content = document.getElementById('progLibraryContent');
  const searchResults = document.getElementById('progSearchResults');
  if (filterEl) filterEl.innerHTML = '';
  if (searchResults) searchResults.style.display = 'none';
  if (!content) return;

  const bookmarkIds = _appState?.programLibrary?.bookmarks || [];
  const allSaved = bookmarkIds.map(resolveProgramMeta).filter(Boolean);

  if (allSaved.length === 0) {
    content.style.display = 'block';
    content.innerHTML = `
      <div class="lib-empty-state">
        <div class="lib-empty-icon">🔖</div>
        <div class="lib-empty-title">No saved programs yet</div>
        <div class="lib-empty-sub">Tap the bookmark icon on any program or workout to save it here</div>
        <button class="lib-empty-cta" data-action="lib-tab" data-tab="discover">Browse Programs</button>
      </div>
    `;
    return;
  }

  const savedPrograms = allSaved.filter(p => !isWod(p));
  const savedWorkouts = allSaved.filter(p => isWod(p));

  let html = '';

  if (savedPrograms.length > 0) {
    html += `
      <div class="filtered-grid-header mb-4">
        <div class="filtered-grid-title">🔖 Saved Programs</div>
        <div class="filtered-grid-count">${savedPrograms.length} program${savedPrograms.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="program-grid${savedWorkouts.length > 0 ? ' mb-6' : ''}">
        ${savedPrograms.map(p => renderProgramCard(p, 'large')).join('')}
      </div>
    `;
  }

  if (savedWorkouts.length > 0) {
    html += `
      <div class="filtered-grid-header mb-4${savedPrograms.length > 0 ? ' mt-4' : ''}">
        <div class="filtered-grid-title">⚡ Saved Workouts</div>
        <div class="filtered-grid-count">${savedWorkouts.length} workout${savedWorkouts.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="program-grid">
        ${savedWorkouts.map(p => renderProgramCard(p, 'large')).join('')}
      </div>
    `;
  }

  content.style.display = 'block';
  content.innerHTML = html;
}

function renderCompletedPrograms() {
  const filterEl = document.getElementById('progFilterChips');
  const content = document.getElementById('progLibraryContent');
  const searchResults = document.getElementById('progSearchResults');
  if (filterEl) filterEl.innerHTML = '';
  if (searchResults) searchResults.style.display = 'none';
  if (!content) return;

  const completions = _appState?.programLibrary?.completions || [];
  const completed = completions
    .map(c => ({ completion: c, program: resolveProgramMeta(c.programId) }))
    .filter(x => x.program)
    .sort((a, b) => new Date(b.completion.completedAt) - new Date(a.completion.completedAt));

  if (completed.length === 0) {
    content.style.display = 'block';
    content.innerHTML = `
      <div class="lib-empty-state">
        <div class="lib-empty-icon">🏆</div>
        <div class="lib-empty-title">No completed programs yet</div>
        <div class="lib-empty-sub">Finish a program and mark it complete to track your progress</div>
        <button class="lib-empty-cta" data-action="lib-tab" data-tab="discover">Find a Program</button>
      </div>
    `;
    return;
  }

  content.style.display = 'block';
  content.innerHTML = `
    <div class="filtered-grid-header mb-4">
      <div class="filtered-grid-title">🏆 Completed Programs</div>
      <div class="filtered-grid-count">${completed.length} programs</div>
    </div>
    <div class="program-grid">
      ${completed.map(({ program }) => renderProgramCard(program, 'large')).join('')}
    </div>
  `;
}

// ── Filter chips ──────────────────────────────────────────────────────────────

const FILTER_CHIPS = [
  { key: 'all',             label: 'All' },
  { key: 'hybrid',          label: '⚡ Hybrid' },
  { key: 'strength',        label: '🏋️ Strength' },
  { key: 'hypertrophy',     label: '💪 Hypertrophy' },
  { key: 'body_composition',label: '🔥 Fat Loss' },
  { key: 'running',         label: '🏃 Running' },
  { key: 'hyrox',           label: '🏟️ Hyrox' },
  { key: 'endurance',       label: '🫀 Endurance' },
  { key: 'home_gym',        label: '🏠 Home Gym' },
  { key: 'bodybuilding',    label: '🏛️ Bodybuilding' },
  { key: 'powerlifting',    label: '🔱 Powerlifting' },
  { key: 'triathlon',       label: '🏊 Triathlon' },
  { key: 'mobility',        label: '🧘 Mobility' },
  { key: 'functional',      label: '⚙️ Functional' },
  { key: 'general_fitness', label: '🎯 General' },
  { key: 'tactical',        label: '🎖️ Tactical' },
];

const DIFFICULTY_CHIPS = [
  { key: null,           label: 'All Levels', color: null },
  { key: 'beginner',     label: 'Beginner',   color: '#10b981' },
  { key: 'intermediate', label: 'Intermediate', color: '#f59e0b' },
  { key: 'advanced',     label: 'Advanced',   color: '#ef4444' },
  { key: 'elite',        label: 'Elite',      color: '#dc2626' },
];

function renderFilterChips() {
  const container = document.getElementById('progFilterChips');
  if (!container) return;

  if (_activeTab !== 'discover') {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = FILTER_CHIPS.map(chip => `
    <button class="filter-chip ${_activeFilter === chip.key ? 'active' : ''}"
            data-action="prog-filter"
            data-filter="${chip.key}">
      ${chip.label}
    </button>
  `).join('');
}

function renderDifficultyChips() {
  const container = document.getElementById('progDifficultyChips');
  if (!container) return;

  if (_activeTab !== 'discover') {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = DIFFICULTY_CHIPS.map(chip => {
    const isActive = _activeDifficulty === chip.key;
    const colorStyle = chip.color && isActive ? `style="border-color: ${chip.color}; color: ${chip.color};"` : '';
    return `
      <button class="filter-chip filter-chip--sm ${isActive ? 'active' : ''}"
              data-action="diff-filter"
              data-difficulty="${chip.key || ''}"
              ${colorStyle}>
        ${chip.label}
      </button>
    `;
  }).join('');
}

// ── Library content ───────────────────────────────────────────────────────────

function renderLibraryContent() {
  const content = document.getElementById('progLibraryContent');
  const searchResults = document.getElementById('progSearchResults');
  if (!content || !searchResults) return;

  if (_searchQuery.length >= 2) {
    content.style.display = 'none';
    searchResults.style.display = 'block';
    renderSearchResults(_searchQuery);
  } else {
    content.style.display = 'block';
    searchResults.style.display = 'none';
    if (_activeFilter === 'all') {
      renderCollectionRows(content);
    } else {
      renderFilteredGrid(content);
    }
  }
}

function renderCollectionRows(container) {
  const recommendations = getRecommendations(_appState, 8);
  // Don't pass recommendedIds into getHomeCollections: we render the
  // personalised row ourselves below, and letting getHomeCollections inject its
  // own "recommended-for-you" collection too would duplicate the row.
  const collections = getHomeCollections();

  // Featured hero (first 3 featured programs)
  const featuredPrograms = PROGRAM_CATALOG.filter(p => p.featured).slice(0, 3);

  let html = '';

  // Hero banner
  if (featuredPrograms.length > 0) {
    html += renderHeroBanner(featuredPrograms);
  }

  // Recently viewed — surfaces the (previously write-only) recentlyViewed log
  const recentlyViewed = (_appState?.programLibrary?.recentlyViewed || [])
    .map(v => resolveProgramMeta(v.programId))
    .filter(Boolean)
    .slice(0, 10);
  if (recentlyViewed.length > 0) {
    html += renderCollectionRow({
      id: 'recently-viewed',
      label: 'Recently Viewed',
      subtitle: 'Pick up where you left off',
      icon: '🕘',
      hideSeeAll: true,
    }, recentlyViewed);
  }

  // Your custom programs (created in the builder) — only place they surface
  const customPrograms = _appState?.customPrograms || [];
  if (customPrograms.length > 0) {
    html += renderCustomProgramsSection(customPrograms);
  }

  // De-dupe across the discovery rails: a program appears in at most one of
  // Recommended / the curated rails per render, so the same card can't fill
  // three rows on one Discover screen. (Recently-Viewed and your custom programs
  // are a different, clearly-labelled context and stay outside this.)
  const shown = new Set(_appState?.activeProgramId ? [_appState.activeProgramId] : []);

  // Personalised recommendations row. hideSeeAll: recommendations aren't a
  // static collection, so there's no valid "see all" target for them.
  if (recommendations.length > 0) {
    const recPrograms = recommendations.map(r => r.program).filter(p => p && !shown.has(p.id));
    if (recPrograms.length > 0) {
      recPrograms.forEach(p => shown.add(p.id));
      html += renderCollectionRow({
        id: 'recommended',
        label: 'Recommended For You',
        subtitle: 'Based on your training',
        icon: '✨',
        hideSeeAll: true,
      }, recPrograms, true);
    }
  }

  // V2-6 — a curated few rails, not the whole catalogue. The old surface stacked
  // ~25 collection rows into an endless wall; the full library is one tap away via
  // the category chips (and the Browse-all grid below), so Discover stays lean.
  const byId = new Map(collections.map(c => [c.id, c]));
  for (const id of CURATED_HOME_COLLECTIONS) {
    const collection = byId.get(id);
    if (!collection || !collection.programs || collection.programs.length === 0) continue;
    const fresh = collection.programs.filter(p => p && !shown.has(p.id));
    if (fresh.length === 0) continue;
    fresh.forEach(p => shown.add(p.id));
    html += renderCollectionRow(collection, fresh);
  }

  // Browse-all: every category is reachable here (and via the chips up top), so
  // no program is buried — it's just not on the surface by default.
  html += `
    <div class="collection-row mb-5">
      <div class="collection-header mb-2">
        <div class="collection-title-wrap">
          <span class="collection-icon">🗂️</span>
          <div>
            <div class="collection-title">Browse all categories</div>
            <div class="collection-subtitle">${PROGRAM_CATALOG.length} programs across every discipline</div>
          </div>
        </div>
      </div>
      <div class="prog-browse-grid">
        ${FILTER_CHIPS.filter(c => c.key !== 'all').map(c => `
          <button class="filter-chip" data-action="prog-filter" data-filter="${c.key}">${c.label}</button>
        `).join('')}
      </div>
    </div>
  `;

  // Create custom program CTA
  html += `
    <div class="create-program-cta">
      <div class="create-cta-inner">
        <div class="create-cta-text">
          <div class="create-cta-title">Build Your Own</div>
          <div class="create-cta-subtitle">Create a custom program from scratch</div>
        </div>
        <button class="create-cta-btn" data-action="open-create-program">+ Create</button>
      </div>
    </div>
  `;

  container.innerHTML = html;
  initHeroCarousel();
}

// ── Custom programs ("My Programs") ───────────────────────────────────────────

function renderCustomProgramsSection(customPrograms) {
  return `
    <div class="collection-row mb-5">
      <div class="collection-header mb-2">
        <div class="collection-title-wrap">
          <span class="collection-icon">🛠️</span>
          <div>
            <div class="collection-title">My Programs</div>
            <div class="collection-subtitle">Programs you've built</div>
          </div>
        </div>
      </div>
      <div class="flex-col gap-2">
        ${customPrograms.map(renderCustomProgramCard).join('')}
      </div>
    </div>
  `;
}

function renderCustomProgramCard(p) {
  const isActive = _appState?.activeProgramId === p.id;
  const focus = p.dossier?.focus || 'Custom Program';
  const weeks = p.totalWeeks || 12;
  const trainingDays = Object.values(p.days || {}).filter(d =>
    (d?.lifts || []).some(n => typeof n === 'string' && n.trim()) ||
    (d?.runs && d.runs !== 'Rest')
  ).length;

  return `
    <div class="card-dark p-3" style="border:1px solid var(--overlay-sm);${isActive ? 'border-color:var(--accent-blue);' : ''}">
      <div class="flex-between align-center mb-2" data-action="open-program-detail" data-program-id="${p.id}" role="button" tabindex="0" style="cursor:pointer;">
        <div>
          <div class="font-heavy text-inverse">${escapeHtml(p.name)}${isActive ? ' <span class="prog-badge prog-badge--active">ACTIVE</span>' : ''}</div>
          <div class="text-xs text-muted">${escapeHtml(focus)} · ${weeks}w · ${trainingDays} training day${trainingDays !== 1 ? 's' : ''}</div>
        </div>
        <span class="text-muted" aria-hidden="true">›</span>
      </div>
      <div class="flex gap-2" style="flex-wrap:wrap;">
        ${isActive ? '' : `<button class="btn-pad btn-blue" style="font-size:0.75rem;" data-action="make-active-program" data-program-id="${p.id}">Make Active</button>`}
        <button class="btn-pad" style="font-size:0.75rem;" data-action="open-builder" data-program-id="${p.id}">Edit</button>
        <button class="btn-pad" style="font-size:0.75rem;" data-action="duplicate-program" data-program-id="${p.id}">Duplicate</button>
        <button class="btn-pad" style="font-size:0.75rem;color:var(--accent-red);border-color:rgba(239,68,68,0.2);" data-action="delete-program" data-program-id="${p.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderHeroBanner(programs) {
  const slides = programs.map((p, i) => `
    <div class="hero-slide ${i === 0 ? 'active' : ''}"
         style="background: linear-gradient(145deg, ${p.coverGradient[0]}, ${p.coverGradient[1]})"
         data-action="open-program-detail"
         data-program-id="${p.id}">
      <div class="hero-slide-overlay"></div>
      <div class="hero-slide-icon" aria-hidden="true">${svgIcon(coverGlyphFor(p), { size: 104 })}</div>
      <div class="hero-slide-content">
        <span class="hero-badge">${CATEGORIES[p.category]?.label || p.category}</span>
        <h2 class="hero-title">${p.name}</h2>
        <p class="hero-tagline">${p.tagline}</p>
        <div class="hero-meta">
          <span>${p.durationWeeks} weeks</span>
          <span class="hero-dot">·</span>
          <span>${p.sessionsPerWeek} days/week</span>
          <span class="hero-dot">·</span>
          <span>${DIFFICULTY_LABELS[p.difficulty]?.label}</span>
        </div>
      </div>
    </div>
  `).join('');

  const dots = programs.map((_, i) => `
    <button class="hero-dot-btn ${i === 0 ? 'active' : ''}" data-action="hero-dot" data-slide="${i}"></button>
  `).join('');

  return `
    <div class="hero-banner mb-4">
      <div class="hero-slides" id="heroSlides">${slides}</div>
      <div class="hero-dots" id="heroDots">${dots}</div>
    </div>
  `;
}

function renderCollectionRow(collection, programs, withReasonBadge = false) {
  const cards = programs.map(p => renderProgramCard(p, 'small', withReasonBadge)).join('');

  return `
    <div class="collection-row mb-5">
      <div class="collection-header mb-2">
        <div class="collection-title-wrap">
          <span class="collection-icon">${collection.icon}</span>
          <div>
            <div class="collection-title">${collection.label}</div>
            ${collection.subtitle ? `<div class="collection-subtitle">${collection.subtitle}</div>` : ''}
          </div>
        </div>
        ${collection.hideSeeAll ? '' : `<button class="collection-see-all" data-action="prog-filter" data-filter="${collection.id}">See all</button>`}
      </div>
      <div class="card-scroll-row">
        ${cards}
      </div>
    </div>
  `;
}

function renderFilteredGrid(container) {
  let programs;
  let titleText;

  const collectionDef = getCollectionDef(_activeFilter);
  if (collectionDef) {
    // "See All" came from a collection row — apply that collection's filter without a limit
    programs = PROGRAM_CATALOG.filter(collectionDef.filter).sort(collectionDef.sort);
    titleText = `${collectionDef.icon} ${collectionDef.label}`;
  } else {
    programs = filterByCategory(_activeFilter);
    const categoryInfo = _activeFilter === 'home_gym'
      ? { label: 'Home Gym', icon: '🏠' }
      : (CATEGORIES[_activeFilter] || { label: _activeFilter, icon: '📋' });
    const titleParts = [categoryInfo.icon, categoryInfo.label];
    const diffLabel = _activeDifficulty ? DIFFICULTY_LABELS[_activeDifficulty]?.label : null;
    if (diffLabel) titleParts.push(`· ${diffLabel}`);
    titleText = titleParts.join(' ');
  }

  if (_activeDifficulty) {
    programs = programs.filter(p => p.difficulty === _activeDifficulty);
  }

  const allWods = programs.length > 0 && programs.every(p => isWod(p));
  const countNoun = allWods ? 'workout' : 'program';
  const countLabel = `${programs.length} ${countNoun}${programs.length !== 1 ? 's' : ''}`;

  const cards = programs.map(p => renderProgramCard(p, 'large')).join('');

  container.innerHTML = `
    <div class="filtered-grid-header mb-4">
      <div class="filtered-grid-title">${titleText}</div>
      <div class="filtered-grid-count">${countLabel}</div>
    </div>
    <div class="program-grid">
      ${cards || '<div class="lib-empty-state"><div class="lib-empty-icon">🔍</div><div class="lib-empty-title">No programs found</div><div class="lib-empty-sub">Try adjusting your filters</div></div>'}
    </div>
  `;
}

// ── Program cards ─────────────────────────────────────────────────────────────

// ── Search results ─────────────────────────────────────────────────────────────

function renderSearchResults(query) {
  const container = document.getElementById('progSearchResults');
  if (!container) return;

  const results = searchPrograms(query);

  if (results.length === 0) {
    container.innerHTML = `
      <div class="search-empty">
        <div class="search-empty-icon">🔍</div>
        <div class="search-empty-title">No programs found</div>
        <div class="search-empty-sub">Try different keywords or browse collections</div>
        ${renderPopularSearches()}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="search-results-count mb-3">${results.length} programs for "<strong>${query}</strong>"</div>
    <div class="program-grid">
      ${results.map(p => renderProgramCard(p, 'large')).join('')}
    </div>
  `;
}

function renderPopularSearches() {
  return `
    <div class="popular-searches mt-4">
      <div class="popular-searches-title">Popular searches</div>
      <div class="popular-searches-chips">
        ${POPULAR_SEARCHES.map(s => `
          <button class="popular-search-chip" data-action="prog-quick-search" data-query="${s.query}">
            ${s.label}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderSearchEmpty() {
  const container = document.getElementById('progSearchResults');
  if (!container) return;

  container.innerHTML = `
    <div class="search-landing">
      ${renderPopularSearches()}
    </div>
  `;
}

// ── Hero carousel ─────────────────────────────────────────────────────────────

let _heroInterval = null;
let _heroIndex = 0;

function prefersReducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  catch (_) { return false; }
}

// Start (or restart) autoplay — but never auto-advance for users who asked for
// reduced motion; they still get manual dot navigation.
function startHeroAutoplay() {
  clearInterval(_heroInterval);
  if (prefersReducedMotion()) return;
  _heroInterval = setInterval(advanceHero, 4000);
}

function initHeroCarousel() {
  _heroIndex = 0;
  startHeroAutoplay();
  // Pause on hover/focus (a native carousel courtesy), resume on leave/blur.
  const banner = document.querySelector('.hero-banner');
  if (banner && !banner._pauseWired) {
    banner._pauseWired = true;
    banner.addEventListener('mouseenter', () => clearInterval(_heroInterval));
    banner.addEventListener('mouseleave', startHeroAutoplay);
    banner.addEventListener('focusin', () => clearInterval(_heroInterval));
    banner.addEventListener('focusout', startHeroAutoplay);
  }
}

function advanceHero() {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dot-btn');
  if (slides.length === 0) return;

  slides[_heroIndex].classList.remove('active');
  dots[_heroIndex]?.classList.remove('active');
  _heroIndex = (_heroIndex + 1) % slides.length;
  slides[_heroIndex].classList.add('active');
  dots[_heroIndex]?.classList.add('active');
}

// ── Event handling ─────────────────────────────────────────────────────────────

function setupLibraryEvents() {
  // Search input
  const searchInput = document.getElementById('progSearchInput');
  const searchClear = document.getElementById('progSearchClear');

  if (searchInput && !searchInput._libEvt) {
    searchInput._libEvt = true;

    searchInput.addEventListener('focus', () => {
      if (searchInput.value.length === 0) {
        document.getElementById('progLibraryContent').style.display = 'none';
        document.getElementById('progSearchResults').style.display = 'block';
        renderSearchEmpty();
      }
    });

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      _searchQuery = q;
      searchClear.style.display = q ? 'flex' : 'none';

      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        renderLibraryContent();
      }, 180);
    });
  }

  if (searchClear && !searchClear._libEvt) {
    searchClear._libEvt = true;
    searchClear.addEventListener('click', () => {
      const inp = document.getElementById('progSearchInput');
      if (inp) inp.value = '';
      _searchQuery = '';
      searchClear.style.display = 'none';
      renderLibraryContent();
    });
  }
}

function jumpHeroSlide(index) {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dot-btn');
  if (index < 0 || index >= slides.length) return;
  slides[_heroIndex].classList.remove('active');
  dots[_heroIndex]?.classList.remove('active');
  _heroIndex = index;
  slides[_heroIndex].classList.add('active');
  dots[_heroIndex]?.classList.add('active');
  // Reset the auto-advance timer (respecting reduced-motion).
  startHeroAutoplay();
}

// ── Event delegation entry point (called from app.js) ─────────────────────────

export function handleLibraryAction(action, el, event) {
  switch (action) {
    case 'open-program-detail': {
      const id = el.closest('[data-program-id]')?.getAttribute('data-program-id');
      if (id) openProgramDetail(id);
      break;
    }
    case 'prog-filter': {
      const filter = el.getAttribute('data-filter');
      setActiveFilter(filter);
      break;
    }
    case 'diff-filter': {
      const diff = el.getAttribute('data-difficulty') || null;
      setActiveDifficulty(diff || null);
      break;
    }
    case 'continue-active-program': {
      document.dispatchEvent(new CustomEvent('library:continue-training'));
      break;
    }
    case 'hero-dot': {
      const slide = parseInt(el.getAttribute('data-slide'), 10);
      if (!isNaN(slide)) jumpHeroSlide(slide);
      break;
    }
    case 'prog-quick-search': {
      const q = el.getAttribute('data-query');
      const inp = document.getElementById('progSearchInput');
      if (inp) {
        inp.value = q;
        _searchQuery = q;
        document.getElementById('progSearchClear').style.display = 'flex';
        renderLibraryContent();
      }
      break;
    }
    case 'lib-tab': {
      const tab = el.getAttribute('data-tab');
      if (tab && tab !== _activeTab) {
        _activeTab = tab;
        _searchQuery = '';
        _activeDifficulty = null;
        const inp = document.getElementById('progSearchInput');
        if (inp) inp.value = '';
        renderLibrary();
        persistFilters();
      }
      break;
    }
    case 'toggle-bookmark': {
      event?.stopPropagation();
      const id = el.getAttribute('data-program-id');
      if (!id) break;
      const nowSaved = toggleBookmark(id);
      el.className = `prog-card-bookmark ${nowSaved ? 'saved' : ''}`;
      el.setAttribute('aria-label', nowSaved ? 'Remove bookmark' : 'Save program');
      el.textContent = nowSaved ? '🔖' : '🤍';
      renderLibraryTabs();
      break;
    }
  }
}

function setActiveFilter(filter) {
  _activeFilter = filter;
  _activeDifficulty = null;
  _searchQuery = '';
  const inp = document.getElementById('progSearchInput');
  if (inp) inp.value = '';
  renderFilterChips();
  renderDifficultyChips();
  renderLibraryContent();
  persistFilters();
}

function setActiveDifficulty(difficulty) {
  _activeDifficulty = difficulty || null;
  renderDifficultyChips();
  renderLibraryContent();
  persistFilters();
}

function openProgramDetail(programId) {
  const libraryScreen = document.getElementById('programLibraryScreen');
  const detailScreen = document.getElementById('programDetailScreen');
  if (!libraryScreen || !detailScreen) return;

  recordRecentlyViewed(programId);
  libraryScreen.style.display = 'none';
  detailScreen.style.display = 'block';
  detailScreen.scrollTop = 0;
  renderProgramDetail(programId, _appState);
}

export function returnToLibrary() {
  const libraryScreen = document.getElementById('programLibraryScreen');
  const detailScreen = document.getElementById('programDetailScreen');
  if (!libraryScreen || !detailScreen) return;

  detailScreen.style.display = 'none';
  libraryScreen.style.display = 'block';
  renderActiveProgramBanner();
}

// Expose for use from detail page
export { openProgramDetail };
