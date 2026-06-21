// =============================================================================
// PROGRAM LIBRARY — Training program discovery and management
// =============================================================================
import { PROGRAM_CATALOG, CATEGORIES, DIFFICULTY_LABELS, getCatalogEntry } from './catalog.js';
import { getHomeCollections, filterByCategory, getCollectionDef } from './collections.js';
import { searchPrograms, POPULAR_SEARCHES } from './search.js';
import { getRecommendations } from './recommendations.js';
import { renderProgramDetail, closeProgramDetail } from './detail.js';
import { isBookmarked, toggleBookmark, isProgramCompleted, recordRecentlyViewed, getProgramById } from '../state.js';

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

// ── Main render ───────────────────────────────────────────────────────────────

export function renderLibrary() {
  const screen = document.getElementById('programLibraryScreen');
  if (!screen) return;

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

function renderActiveProgramBanner() {
  const banner = document.getElementById('activeProgBanner');
  if (!banner || !_appState) return;

  const activeId = _appState.activeProgramId;
  if (!activeId) {
    banner.innerHTML = '';
    banner.style.display = 'none';
    return;
  }

  const catalog = getCatalogEntry(activeId);
  const programName = catalog?.name || _appState.customPrograms?.find(p => p.id === activeId)?.name || 'My Program';
  const currentWeek = parseInt(_appState.currentWeek || '1', 10);
  const totalWeeks = catalog?.durationWeeks || 12;
  const pct = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));
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
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="3"/>
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
  const allSaved = PROGRAM_CATALOG.filter(p => bookmarkIds.includes(p.id));

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
    .map(c => ({ completion: c, program: PROGRAM_CATALOG.find(p => p.id === c.programId) }))
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
  const recommendedIds = recommendations.map(r => r.program.id);
  const collections = getHomeCollections(recommendedIds);

  // Featured hero (first 3 featured programs)
  const featuredPrograms = PROGRAM_CATALOG.filter(p => p.featured).slice(0, 3);

  let html = '';

  // Hero banner
  if (featuredPrograms.length > 0) {
    html += renderHeroBanner(featuredPrograms);
  }

  // Personalised recommendations row
  if (recommendations.length > 0) {
    html += renderCollectionRow({
      id: 'recommended',
      label: 'Recommended For You',
      subtitle: 'Based on your training',
      icon: '✨',
    }, recommendations.map(r => r.program), true);
  }

  // All other collection rows
  for (const collection of collections) {
    if (!collection.programs || collection.programs.length === 0) continue;
    html += renderCollectionRow(collection, collection.programs);
  }

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

function renderHeroBanner(programs) {
  const slides = programs.map((p, i) => `
    <div class="hero-slide ${i === 0 ? 'active' : ''}"
         style="background: linear-gradient(145deg, ${p.coverGradient[0]}, ${p.coverGradient[1]})"
         data-action="open-program-detail"
         data-program-id="${p.id}">
      <div class="hero-slide-overlay"></div>
      <div class="hero-slide-icon">${p.icon}</div>
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
        <button class="collection-see-all" data-action="prog-filter" data-filter="${collection.id}">See all</button>
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

function isWod(program) {
  return program.tags?.includes('hyrox-wod');
}

const EQUIP_TIER_LABELS = {
  gym: 'Full Gym', home: 'Home Gym', garage_gym: 'Garage Gym',
  bodyweight: 'Bodyweight', minimal: 'Minimal',
};

export function renderProgramCard(program, size = 'small', showBadge = false) {
  const diff = DIFFICULTY_LABELS[program.difficulty] || DIFFICULTY_LABELS.intermediate;
  const dots = '●'.repeat(diff.dots) + '○'.repeat(4 - diff.dots);
  const isActive    = _appState?.activeProgramId === program.id;
  const saved       = isBookmarked(program.id);
  const completed   = isProgramCompleted(program.id);
  const wod         = isWod(program);
  const isLarge     = size === 'large';

  const equipTierLabel = isLarge && program.equipmentTier && !wod
    ? EQUIP_TIER_LABELS[program.equipmentTier] : null;

  const durationLabel = wod && program.sessionDurationMinutes
    ? `~${program.sessionDurationMinutes.min}–${program.sessionDurationMinutes.max} min`
    : `${program.durationWeeks}w`;

  const categoryLabel = wod ? 'Workout' : (CATEGORIES[program.category]?.label || program.category);

  // Rating shown on all cards; count only on large
  const ratingHTML = program.rating
    ? `<div class="prog-card-rating">
         <span class="rating-star">★</span> ${program.rating}${isLarge && program.ratingCount ? ` <span class="rating-count">(${program.ratingCount.toLocaleString()})</span>` : ''}
       </div>`
    : '';

  // Social proof row — large cards only
  const statsHTML = isLarge && !wod ? (() => {
    const parts = [];
    if (program.enrolledCount)   parts.push(`${program.enrolledCount.toLocaleString()} athletes`);
    if (program.completionRate)  parts.push(`${Math.round(program.completionRate * 100)}% finish`);
    return parts.length
      ? `<div class="prog-card-stats">${parts.join('<span class="prog-card-sep">·</span>')}</div>`
      : '';
  })() : '';

  // Author / coach attribution — large cards only, skip generic WOD entries
  const authorHTML = isLarge && program.author && program.author.name && !wod
    ? `<div class="prog-card-author">
         <span class="prog-card-author-name">by ${program.author.name}</span>
         ${program.author.verified ? '<span class="prog-card-verified" title="Verified creator">✓</span>' : ''}
       </div>`
    : '';

  return `
    <div class="prog-card prog-card--${size} ${isActive ? 'prog-card--active' : ''} ${completed ? 'prog-card--completed' : ''}"
         data-action="open-program-detail"
         data-program-id="${program.id}">
      <div class="prog-card-cover"
           style="background: linear-gradient(145deg, ${program.coverGradient[0]}, ${program.coverGradient[1]})">
        <div class="prog-card-icon">${program.icon}</div>
        <div class="prog-card-badges">
          ${isActive ? '<span class="prog-badge prog-badge--active">ACTIVE</span>' : ''}
          ${completed && !isActive ? '<span class="prog-badge prog-badge--completed">DONE</span>' : ''}
          ${wod && !isActive && !completed ? '<span class="prog-badge prog-badge--wod">WOD</span>' : ''}
          ${program.featured && !isActive && !completed && !wod ? '<span class="prog-badge prog-badge--featured">FEATURED</span>' : ''}
          ${program.isNew && !isActive && !completed ? '<span class="prog-badge prog-badge--new">NEW</span>' : ''}
        </div>
        <button class="prog-card-bookmark ${saved ? 'saved' : ''}"
                data-action="toggle-bookmark"
                data-program-id="${program.id}"
                aria-label="${saved ? 'Remove bookmark' : 'Save program'}">
          ${saved ? '🔖' : '🤍'}
        </button>
        ${ratingHTML}
      </div>
      <div class="prog-card-info">
        <div class="prog-card-name">${program.name}</div>
        ${authorHTML}
        <div class="prog-card-meta">
          <span class="prog-card-category" style="color: ${program.accentColor}">${categoryLabel}</span>
          <span class="prog-card-sep">·</span>
          <span>${durationLabel}</span>
          ${equipTierLabel ? `<span class="prog-card-sep">·</span><span class="prog-card-equip">${equipTierLabel}</span>` : ''}
        </div>
        ${statsHTML}
        <div class="prog-card-diff" style="color: ${diff.color}" title="${diff.label}">${dots}</div>
      </div>
    </div>
  `;
}

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

function initHeroCarousel() {
  clearInterval(_heroInterval);
  _heroIndex = 0;
  _heroInterval = setInterval(advanceHero, 4000);
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
  // Reset the auto-advance timer
  clearInterval(_heroInterval);
  _heroInterval = setInterval(advanceHero, 4000);
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
}

function setActiveDifficulty(difficulty) {
  _activeDifficulty = difficulty || null;
  renderDifficultyChips();
  renderLibraryContent();
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
