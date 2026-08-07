// @ts-check
// =============================================================================
// RECOMMENDATION ENGINE — Goal and context-aware program suggestions
// =============================================================================
import { PROGRAM_CATALOG } from './catalog.js';
import {
  athleteProfile, distinguishingReasons, programFit, recentWeeklySessions,
} from './recommendation-fit.js';
import { loggedDateSet } from '../analytics/logged-days.js';
import { todayKey } from '../dates.js';

// Local, as in `brain/hybrid-score/history.js`: importing DEFAULT_DAYS would
// drag the whole state module (and its storage side effects) into the programs
// layer for a seven-item constant.
const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Programmes that actually fit THIS athlete, most fitting first.
 *
 * Every entry carries the reasons it was chosen, and an entry with no true
 * personal reason is not returned at all — so an athlete who has told the app
 * nothing gets an empty list rather than a popularity chart labelled
 * "Recommended For You". Callers must handle that empty case by not claiming a
 * personalised row (see `renderCollectionRows`).
 *
 * @param {any} appState
 * @param {number} [limit]
 * @returns {{program:any, score:number, reason:string, reasons:string[],
 *            cautions:string[]}[]}
 */
export function getRecommendations(appState, limit = 6) {
  const activeProgramId = appState?.activeProgramId;
  const profile = athleteProfile(appState, {
    weeklySessions: recentWeeklySessions(
      loggedDateSet(appState, WEEK_DAYS), todayKey(),
    ),
  });

  const ranked = PROGRAM_CATALOG
    .filter(p => p.id !== activeProgramId) // Don't recommend current program
    .map((program) => ({ program, fit: programFit(program, profile) }))
    .filter(({ fit }) => fit.eligible)
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, limit);

  // The headline reason is chosen across the whole row, not per programme: five
  // cards all reading "Matches your endurance goal" is true and useless.
  const headlines = distinguishingReasons(ranked.map(({ fit }) => fit.reasons));

  return ranked.map(({ program, fit }, i) => ({
    program,
    score: fit.score,
    // `reason` stays a single string for the existing card renderers; the full
    // list is there for surfaces that can show more than one line.
    reason: headlines[i],
    reasons: fit.reasons,
    cautions: fit.cautions,
  }));
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
