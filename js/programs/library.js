// =============================================================================
// PROGRAM LIBRARY — Netflix-style discovery UI
// =============================================================================
import { PROGRAM_CATALOG, CATEGORIES, DIFFICULTY_LABELS, getCatalogEntry } from './catalog.js';
import { getHomeCollections, filterByCategory } from './collections.js';
import { searchPrograms, POPULAR_SEARCHES } from './search.js';
import { getRecommendations } from './recommendations.js';
import { renderProgramDetail, closeProgramDetail } from './detail.js';

let _appState = null;
let _activeFilter = 'all';
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
  renderFilterChips();
  renderLibraryContent();
  setupLibraryEvents();
}

// ── Active program banner ─────────────────────────────────────────────────────

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
  const currentWeek = _appState.currentWeek || '1';
  const totalWeeks = catalog?.durationWeeks || 12;

  banner.style.display = 'block';
  banner.innerHTML = `
    <div class="active-prog-card" data-action="open-program-detail" data-program-id="${activeId}">
      <div class="active-prog-glow" style="background: ${catalog?.accentColor || '#8b5cf6'}20"></div>
      <div class="active-prog-inner">
        <div class="active-prog-left">
          <span class="active-prog-badge">NOW TRAINING</span>
          <div class="active-prog-name">${programName}</div>
          <div class="active-prog-meta">Week ${currentWeek} of ${totalWeeks}</div>
        </div>
        <div class="active-prog-right">
          <div class="active-prog-progress-ring">
            <svg width="44" height="44" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3"/>
              <circle cx="22" cy="22" r="18" fill="none"
                stroke="${catalog?.accentColor || '#8b5cf6'}" stroke-width="3"
                stroke-dasharray="${Math.round((currentWeek / totalWeeks) * 113)} 113"
                stroke-linecap="round"
                transform="rotate(-90 22 22)"/>
            </svg>
            <span class="active-prog-pct">${Math.round((currentWeek / totalWeeks) * 100)}%</span>
          </div>
          <span class="active-prog-arrow">›</span>
        </div>
      </div>
    </div>
  `;
}

// ── Filter chips ──────────────────────────────────────────────────────────────

const FILTER_CHIPS = [
  { key: 'all',             label: 'All' },
  { key: 'hybrid',          label: '⚡ Hybrid' },
  { key: 'strength',        label: '🏋️ Strength' },
  { key: 'hyrox',           label: '🏟️ Hyrox' },
  { key: 'running',         label: '🏃 Running' },
  { key: 'hypertrophy',     label: '💪 Muscle' },
  { key: 'body_composition',label: '🔥 Fat Loss' },
  { key: 'endurance',       label: '🫀 Endurance' },
  { key: 'general_fitness', label: '🎯 General' },
  { key: 'tactical',        label: '🎖️ Tactical' },
];

function renderFilterChips() {
  const container = document.getElementById('progFilterChips');
  if (!container) return;

  container.innerHTML = FILTER_CHIPS.map(chip => `
    <button class="filter-chip ${_activeFilter === chip.key ? 'active' : ''}"
            data-action="prog-filter"
            data-filter="${chip.key}">
      ${chip.label}
    </button>
  `).join('');
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
    <button class="hero-dot-btn ${i === 0 ? 'active' : ''}" data-slide="${i}"></button>
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
  const programs = filterByCategory(_activeFilter);
  const categoryInfo = CATEGORIES[_activeFilter] || { label: _activeFilter, icon: '📋' };

  const cards = programs.map(p => renderProgramCard(p, 'large')).join('');

  container.innerHTML = `
    <div class="filtered-grid-header mb-4">
      <div class="filtered-grid-title">${categoryInfo.icon} ${categoryInfo.label}</div>
      <div class="filtered-grid-count">${programs.length} programs</div>
    </div>
    <div class="program-grid">
      ${cards || '<div class="empty-state text-muted">No programs found.</div>'}
    </div>
  `;
}

// ── Program cards ─────────────────────────────────────────────────────────────

export function renderProgramCard(program, size = 'small', showBadge = false) {
  const diff = DIFFICULTY_LABELS[program.difficulty] || DIFFICULTY_LABELS.beginner;
  const dots = '●'.repeat(diff.dots) + '○'.repeat(4 - diff.dots);
  const isActive = _appState?.activeProgramId === program.id;

  return `
    <div class="prog-card prog-card--${size} ${isActive ? 'prog-card--active' : ''}"
         data-action="open-program-detail"
         data-program-id="${program.id}">
      <div class="prog-card-cover"
           style="background: linear-gradient(145deg, ${program.coverGradient[0]}, ${program.coverGradient[1]})">
        <div class="prog-card-icon">${program.icon}</div>
        <div class="prog-card-badges">
          ${isActive ? '<span class="prog-badge prog-badge--active">ACTIVE</span>' : ''}
          ${program.featured && !isActive ? '<span class="prog-badge prog-badge--featured">FEATURED</span>' : ''}
          ${program.isNew && !isActive ? '<span class="prog-badge prog-badge--new">NEW</span>' : ''}
        </div>
        ${showBadge && program.rating ? `
          <div class="prog-card-rating">
            <span class="rating-star">★</span> ${program.rating}
          </div>
        ` : ''}
      </div>
      <div class="prog-card-info">
        <div class="prog-card-name">${program.name}</div>
        <div class="prog-card-meta">
          <span class="prog-card-category" style="color: ${program.accentColor}">${CATEGORIES[program.category]?.label || program.category}</span>
          <span class="prog-card-sep">·</span>
          <span>${program.durationWeeks}w</span>
        </div>
        <div class="prog-card-diff" style="color: ${diff.color}">${dots}</div>
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
  }
}

function setActiveFilter(filter) {
  _activeFilter = filter;
  _searchQuery = '';
  const inp = document.getElementById('progSearchInput');
  if (inp) inp.value = '';
  renderFilterChips();
  renderLibraryContent();
}

function openProgramDetail(programId) {
  const libraryScreen = document.getElementById('programLibraryScreen');
  const detailScreen = document.getElementById('programDetailScreen');
  if (!libraryScreen || !detailScreen) return;

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
