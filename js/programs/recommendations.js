// @ts-check
// =============================================================================
// RECOMMENDATION ENGINE — Goal and context-aware program suggestions
// =============================================================================
import { PROGRAM_CATALOG } from './catalog.js';

// Recommendation rules: given user context, score programs
// appState is passed in to read goals, history, active program, etc.
export function getRecommendations(appState, limit = 6) {
  const activeProgramId = appState?.activeProgramId;

  // Score each program
  const scored = PROGRAM_CATALOG
    .filter(p => p.id !== activeProgramId) // Don't recommend current program
    .map(p => ({
      program: p,
      score: scoreForUser(p, appState),
      reason: getRecommendationReason(p, appState),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

function scoreForUser(program, appState) {
  let score = 0;

  // Base popularity score (everyone sees popular programs)
  score += (program.popularity / 100) * 20;

  // Completion rate bonus — completable programs are more valuable
  score += (program.completionRate || 0) * 15;

  // Rating bonus
  score += (program.rating || 0) * 5;

  // Featured bonus
  if (program.featured) score += 10;

  // Helyx official bonus (we trust our own programs)
  if (program.author.type === 'official') score += 8;

  // If no state, just return popularity-based score
  if (!appState) return score;

  // Context-aware scoring based on active program
  const activeProg = appState.activeProgramId;
  if (activeProg) {
    // If user is running a strength program, suggest hybrid or running next
    if (activeProg.includes('strength') || activeProg.includes('nsuns') || activeProg.includes('gzclp')) {
      if (program.category === 'hybrid' || program.category === 'running') score += 20;
    }
    // If user is running a running program, suggest hybrid next
    if (activeProg.includes('run') || activeProg.includes('marathon') || activeProg === 'couch_to_5k') {
      if (program.category === 'hybrid' || program.category === 'strength') score += 20;
    }
    // If user is on Helyx program, recommend other official programs
    if (activeProg === 'hybridhq_foundations') {
      if (program.id === 'hybrid_engine' || program.id === 'hybrid_strength_5k') score += 25;
    }
    // If user is on Hyrox program, recommend another Hyrox
    if (activeProg.includes('hyrox')) {
      if (program.category === 'hyrox') score += 15;
    }
  }

  // Beginner-friendly boost for new users
  const weekCount = Object.keys(appState.weeks || {}).length;
  if (weekCount <= 4 && program.difficulty === 'beginner') score += 15;

  return score;
}

function getRecommendationReason(program, appState) {
  const activeProg = appState?.activeProgramId;

  // Editorial curation only — no fabricated rating/enrolled/completion numbers
  // are surfaced as reasons (the catalog values drive ranking silently).
  if (program.featured) return 'Staff Pick';
  if (program.author?.type === 'official') return 'Helyx Certified';

  if (activeProg) {
    if ((activeProg.includes('strength') || activeProg.includes('nsuns')) &&
        (program.category === 'hybrid' || program.category === 'running')) {
      return 'Great next step after strength training';
    }
    if ((activeProg.includes('run') || activeProg.includes('marathon')) &&
        (program.category === 'hybrid' || program.category === 'strength')) {
      return 'Add strength to your running base';
    }
  }

  return `${program.sessionsPerWeek} days/week · ${program.durationWeeks} weeks`;
}

// Get a "Similar Programs" list for a given program
export function getSimilarPrograms(program, limit = 6) {
  return PROGRAM_CATALOG
    .filter(p => p.id !== program.id)
    .map(p => ({
      program: p,
      score: similarityScore(program, p),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ program }) => program);
}

function similarityScore(source, candidate) {
  let score = 0;

  // Same category
  if (source.category === candidate.category) score += 30;
  // Same subcategory
  if (source.subcategory === candidate.subcategory) score += 20;
  // Same difficulty
  if (source.difficulty === candidate.difficulty) score += 10;
  // Similar sessions per week (within 1)
  if (Math.abs(source.sessionsPerWeek - candidate.sessionsPerWeek) <= 1) score += 10;
  // Similar duration (within 4 weeks)
  if (Math.abs(source.durationWeeks - candidate.durationWeeks) <= 4) score += 8;
  // Shared tags
  const sharedTags = source.tags?.filter(t => candidate.tags?.includes(t)).length || 0;
  score += sharedTags * 5;
  // Shared goals
  const sharedGoals = source.goals?.filter(g => candidate.goals?.includes(g)).length || 0;
  score += sharedGoals * 8;
  // Popularity bonus
  score += (candidate.popularity / 100) * 5;

  return score;
}
