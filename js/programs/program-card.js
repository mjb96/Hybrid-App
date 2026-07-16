// @ts-check
// =============================================================================
// PROGRAM CARD — shared card renderer used by both the library grid and the
// program detail screen ("similar programs"). Extracted from library.js to
// break the library <-> detail circular import.
// =============================================================================
import { CATEGORIES, DIFFICULTY_LABELS } from './catalog.js';
import { isBookmarked, isProgramCompleted, appState } from '../state.js';
import { escapeHtml } from '../util.js';
import { icon as svgIcon } from '../ui/icons.js';
import { programAttribution } from './attribution.js';

export function isWod(program) {
  return program.tags?.includes('hyrox-wod');
}

// The modality glyph for a program's cover art — a designed watermark instead of
// a random emoji, so the whole catalogue reads as one system.
const COVER_GLYPHS = {
  strength: 'dumbbell', powerlifting: 'dumbbell', hypertrophy: 'dumbbell', bodybuilding: 'dumbbell',
  running: 'run', endurance: 'run', triathlon: 'run',
  hybrid: 'bolt',
  hyrox: 'flame', functional: 'flame', conditioning: 'flame', tactical: 'flame',
  fitness: 'mountain', general: 'mountain', mobility: 'mountain',
};
export function coverGlyphFor(program) {
  const cat = String(program?.category || '').toLowerCase();
  if (COVER_GLYPHS[cat]) return COVER_GLYPHS[cat];
  const tags = (program?.tags || []).map(t => String(t).toLowerCase());
  if (tags.some(t => /hyrox|wod|functional|conditioning/.test(t))) return 'flame';
  if (tags.some(t => /run|endurance|5k|10k|marathon|triathlon/.test(t))) return 'run';
  if (tags.some(t => /strength|power|hypertrophy|bodybuild/.test(t))) return 'dumbbell';
  return 'bolt';
}

const EQUIP_TIER_LABELS = {
  gym: 'Full Gym', home: 'Home Gym', garage_gym: 'Garage Gym',
  bodyweight: 'Bodyweight', minimal: 'Minimal',
};

export function renderProgramCard(program, size = 'small', showBadge = false) {
  const diff = DIFFICULTY_LABELS[program.difficulty] || DIFFICULTY_LABELS.intermediate;
  const dots = '●'.repeat(diff.dots) + '○'.repeat(4 - diff.dots);
  const isActive    = appState?.activeProgramId === program.id;
  const saved       = isBookmarked(program.id);
  const completed   = isProgramCompleted(program.id);
  const wod         = isWod(program);
  const isLarge     = size === 'large';

  const equipTierLabel = isLarge && program.equipmentTier && !wod
    ? EQUIP_TIER_LABELS[program.equipmentTier] : null;

  const durationLabel = wod && program.sessionDurationMinutes
    ? `~${program.sessionDurationMinutes.min}–${program.sessionDurationMinutes.max} min`
    : `${program.durationWeeks || program.totalWeeks || 12}w`;

  const categoryLabel = wod ? 'Workout' : (CATEGORIES[program.category]?.label || program.category || 'Custom');
  // Non-catalog (custom) programs lack visual metadata — supply safe fallbacks
  // so the shared card renderer never throws on a missing gradient/icon/accent.
  const cover = Array.isArray(program.coverGradient) && program.coverGradient.length >= 2
    ? program.coverGradient : ['#1a0e2e', '#0d1b2a'];
  const coverGlyph = svgIcon(coverGlyphFor(program), { size: 96, cls: 'prog-card-glyph__svg' });
  const accentColor = program.accentColor || '#8b5cf6';

  // No star ratings or "N athletes / % finish" until there are real users to
  // count — the catalog's rating/enrolled/completion values drive curation
  // (rails + recommendations) only, never displayed as if they were real
  // community numbers.
  const ratingHTML = '';
  const statsHTML = '';

  // Author / source attribution — large cards only, skip generic WOD entries.
  // Neutral wording only (see programAttribution); NO "verified creator" badge.
  const _attr = (isLarge && !wod) ? programAttribution(program) : null;
  const authorHTML = _attr
    ? `<div class="prog-card-author">
         <span class="prog-card-author-name">${escapeHtml(_attr.text)}</span>
       </div>`
    : '';

  return `
    <div class="prog-card prog-card--${size} ${isActive ? 'prog-card--active' : ''} ${completed ? 'prog-card--completed' : ''}"
         data-action="open-program-detail"
         data-program-id="${program.id}">
      <div class="prog-card-cover"
           style="background: linear-gradient(145deg, ${cover[0]}, ${cover[1]})">
        <div class="prog-card-glyph" aria-hidden="true">${coverGlyph}</div>
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
        <div class="prog-card-name">${escapeHtml(program.name)}</div>
        ${authorHTML}
        <div class="prog-card-meta">
          <span class="prog-card-category" style="color: ${accentColor}">${categoryLabel}</span>
          <span class="prog-card-sep">·</span>
          <span>${durationLabel}</span>
          ${!wod && program.sessionsPerWeek ? `<span class="prog-card-sep">·</span><span>${program.sessionsPerWeek}×/wk</span>` : ''}
          ${equipTierLabel ? `<span class="prog-card-sep">·</span><span class="prog-card-equip">${equipTierLabel}</span>` : ''}
        </div>
        ${statsHTML}
        <div class="prog-card-diff" style="color: ${diff.color}" title="${diff.label}">${dots}</div>
      </div>
    </div>
  `;
}
