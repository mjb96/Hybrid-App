// @ts-check
// =============================================================================
// PROGRAM FIT (Phase 4A)
//
// Why this exists: "Recommended For You · Based on your training" was neither.
// `scoreForUser` read popularity, completionRate, rating, `featured` and
// `author.type` — all catalogue constants, identical for every athlete — plus
// the active program id and a beginner boost for new accounts. It never read
// `settings.fitnessGoal`, `fitnessLevel`, `equipmentTier`, `equipment` or
// `weightGoal`, every one of which onboarding collects. A dedicated advanced
// runner with bodyweight-only kit and a beginner with a full gym received
// byte-identical recommendations. The row was a popularity chart wearing a
// personalisation label.
//
// The rules this module enforces:
//
//  1. A reason must be a TRUE statement about this athlete's own inputs.
//     "Staff Pick" and "Helyx Certified" are badges about the programme; they
//     say nothing about fit and are no longer reasons. Editorial signal still
//     breaks ties, but it can never earn a place in the personalised row on its
//     own and never appears as a reason.
//  2. If nothing personal matches, the programme is NOT a recommendation.
//     `eligible` is false, and the caller must not present it as one — showing
//     an empty row is honest, inventing a reason is not.
//  3. A mismatch is stated, not hidden. Missing equipment and a level the
//     athlete has not reached are surfaced as cautions rather than quietly
//     scored down, because "why is this being suggested to me?" is exactly the
//     question the old row could not answer.
// =============================================================================
import { equipmentFit } from './compare.js';

/** Athlete goals, as the onboarding/settings toggles actually store them. */
export const ATHLETE_GOALS = /** @type {const} */ (['strength', 'hybrid', 'endurance']);

/** Programme categories that serve each athlete goal. */
const GOAL_CATEGORIES = {
  strength: ['strength', 'powerlifting', 'hypertrophy', 'bodybuilding'],
  hybrid: ['hybrid', 'hyrox', 'functional', 'general_fitness', 'tactical'],
  endurance: ['running', 'endurance', 'triathlon'],
};

const GOAL_LABEL = { strength: 'strength', hybrid: 'hybrid training', endurance: 'endurance' };

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced', 'elite'];

/** Programme equipment tiers an athlete on "home basics" can actually run. */
const HOME_FRIENDLY_TIERS = ['home', 'home-gym', 'minimal', 'bodyweight'];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/**
 * The athlete facts a recommendation is allowed to reason from — all of them
 * things the athlete themselves told the app.
 *
 * @param {any} state appState
 * @param {{weeklySessions?:number|null}} [derived]
 * @returns {{goal:string|null, level:string|null, tier:string|null,
 *            equipment:Record<string,boolean>, weightGoal:string|null,
 *            weeklySessions:number|null, activeProgramId:string|null}}
 */
export function athleteProfile(state, derived = {}) {
  const s = state?.settings || {};
  const goal = ATHLETE_GOALS.includes(s.fitnessGoal) ? s.fitnessGoal : null;
  const level = LEVEL_ORDER.includes(s.fitnessLevel) ? s.fitnessLevel : null;
  const tier = s.equipmentTier === 'home' || s.equipmentTier === 'gym' ? s.equipmentTier : null;
  const weightGoal = ['cut', 'maintain', 'bulk'].includes(s.weightGoal) ? s.weightGoal : null;
  const weeklySessions = Number.isFinite(derived.weeklySessions) && derived.weeklySessions > 0
    ? Number(derived.weeklySessions) : null;
  return {
    goal, level, tier, weightGoal, weeklySessions,
    equipment: (s.equipment && typeof s.equipment === 'object') ? s.equipment : {},
    activeProgramId: state?.activeProgramId || null,
  };
}

/**
 * Does this programme's own goal vocabulary back up the category match?
 * The catalogue's `goals` are free text (~80 tokens), so this is a supporting
 * signal only — never the sole basis for a claimed match.
 */
function goalTokensMatch(program, goal) {
  const tokens = (program?.goals || []).join(' ').toLowerCase();
  if (!tokens) return false;
  if (goal === 'strength') return /strength|powerlift|hypertroph|muscle|physique|size|1rm/.test(tokens);
  if (goal === 'endurance') return /run|endurance|aerobic|marathon|5k|10k|vo2|triathlon|race/.test(tokens);
  if (goal === 'hybrid') return /hybrid|hyrox|conditioning|work-capacity|athletic|functional|tactical/.test(tokens);
  return false;
}

/**
 * Score one programme against one athlete.
 *
 * @param {any} program
 * @param {ReturnType<typeof athleteProfile>} profile
 * @returns {{score:number, personalScore:number, eligible:boolean,
 *            reasons:string[], cautions:string[],
 *            factors:{id:string, delta:number, matched:boolean}[]}}
 */
export function programFit(program, profile) {
  /** @type {{id:string, delta:number, matched:boolean}[]} */
  const factors = [];
  /** @type {string[]} */
  const reasons = [];
  /** @type {string[]} */
  const cautions = [];
  let personal = 0;

  const add = (id, delta, matched) => {
    factors.push({ id, delta, matched });
    personal += delta;
  };

  // ── Goal ──────────────────────────────────────────────────────────────────
  if (profile.goal) {
    const categories = GOAL_CATEGORIES[profile.goal] || [];
    const categoryHit = categories.includes(program?.category) ||
      categories.includes(program?.subcategory);
    const tokenHit = goalTokensMatch(program, profile.goal);
    if (categoryHit) {
      add('goal', tokenHit ? 45 : 38, true);
      reasons.push(`Matches your ${GOAL_LABEL[profile.goal]} goal`);
    } else if (tokenHit) {
      add('goal', 12, true);
      reasons.push(`Supports your ${GOAL_LABEL[profile.goal]} goal`);
    } else {
      add('goal', -18, false);
    }
  }

  // ── Experience level ──────────────────────────────────────────────────────
  if (profile.level && LEVEL_ORDER.includes(program?.difficulty)) {
    const gap = LEVEL_ORDER.indexOf(program.difficulty) - LEVEL_ORDER.indexOf(profile.level);
    if (gap === 0) {
      add('level', 25, true);
      reasons.push(`Written for ${profile.level} athletes`);
    } else if (gap === 1) {
      add('level', 8, true);
      reasons.push('A step up from your current level');
    } else if (gap > 1) {
      // Two rungs above is not a stretch goal, it is a bad first week.
      add('level', -35, false);
      cautions.push(`Built for ${program.difficulty} athletes`);
    } else {
      // Easier than the athlete, and the penalty must SCALE: one rung down is a
      // deload-ish option worth offering, but Couch to 5K for an advanced
      // runner is not a recommendation however politely it is captioned.
      add('level', clamp(-12 * Math.abs(gap), -32, 0), false);
      cautions.push(gap <= -2
        ? `Well below your ${profile.level} level`
        : `Easier than your ${profile.level} level`);
    }
  }

  // ── Equipment ─────────────────────────────────────────────────────────────
  const fit = equipmentFit(program?.equipment || [], profile.equipment);
  const known = fit.owned.length + fit.missing.length;
  if (known > 0) {
    if (fit.missing.length === 0) {
      add('equipment', 20, true);
      reasons.push('Uses only equipment you have');
    } else {
      add('equipment', clamp(-9 * fit.missing.length, -30, 0), false);
      const named = fit.missing.slice(0, 2).join(', ');
      const extra = fit.missing.length > 2 ? ` +${fit.missing.length - 2} more` : '';
      cautions.push(`Needs ${named}${extra}`);
    }
  } else if (profile.tier === 'home' && program?.equipmentTier) {
    // No usable equipment tokens: fall back to the coarse tier.
    if (HOME_FRIENDLY_TIERS.includes(program.equipmentTier)) {
      add('equipment', 15, true);
      reasons.push('Works with home basics');
    } else {
      add('equipment', -22, false);
      cautions.push('Needs a full gym');
    }
  }

  // ── Body-composition goal ─────────────────────────────────────────────────
  if (profile.weightGoal === 'cut' &&
      (program?.category === 'body_composition' || (program?.goals || []).includes('fat-loss'))) {
    add('weightGoal', 15, true);
    reasons.push('Built around a cut');
  }

  // ── Availability, from what the athlete ACTUALLY trains ───────────────────
  // This is the part that earns the words "based on your training".
  const perWeek = Number(program?.sessionsPerWeek) || 0;
  if (profile.weeklySessions && perWeek > 0) {
    const gap = perWeek - profile.weeklySessions;
    if (Math.abs(gap) <= 1) {
      add('schedule', 18, true);
      reasons.push(`${perWeek} days/week, like your recent training`);
    } else if (gap >= 2) {
      add('schedule', clamp(-6 * gap, -24, 0), false);
      cautions.push(`Asks for ${perWeek} days/week`);
    } else {
      add('schedule', -4, false);
    }
  }

  // ── Editorial — a tiebreaker, never a reason ─────────────────────────────
  // Deliberately small and kept OUT of `personal`, so it can order two equally
  // fitting programmes but can never promote an unfitting one into the row.
  let editorial = 0;
  editorial += ((Number(program?.popularity) || 0) / 100) * 6;
  editorial += (Number(program?.rating) || 0) * 1.5;
  if (program?.featured) editorial += 3;
  if (program?.author?.type === 'official') editorial += 2;

  // Eligible = at least one true personal reason. Without one there is nothing
  // to tell the athlete except "this is popular", which is not a recommendation.
  const eligible = reasons.length > 0 && personal > 0;

  return {
    score: personal + editorial,
    personalScore: personal,
    eligible,
    reasons,
    cautions,
    factors,
  };
}

/**
 * What is missing before this athlete can be given a real recommendation.
 *
 * The companion to `eligible`: refusing to invent a recommendation leaves a
 * hole, and the honest thing to put in it is the specific question that would
 * fill it — not a generic "complete your profile". Ordered by how much each
 * answer unlocks, and only ever asks for what is actually absent.
 *
 * @param {ReturnType<typeof athleteProfile>} profile
 * @returns {{id:string, question:string, why:string,
 *            options:{value:string, label:string}[]}[]}
 */
const PROFILE_QUESTIONS = [
  {
    id: 'goal', field: 'goal', question: 'What are you training for?',
    options: [
      { value: 'strength', label: 'Strength' },
      { value: 'hybrid', label: 'Hybrid' },
      { value: 'endurance', label: 'Endurance' },
    ],
  },
  {
    id: 'level', field: 'level', question: 'How much training is behind you?',
    options: [
      { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'advanced', label: 'Advanced' },
    ],
  },
  {
    id: 'equipment', field: 'tier', question: 'What can you train with?',
    options: [
      { value: 'home', label: 'Home basics' },
      { value: 'gym', label: 'Full gym' },
    ],
  },
];

/**
 * The inputs the recommendations rest on, each with its current answer and the
 * options to change it.
 *
 * Why this is not a "complete your profile" prompt: `settings` is SEEDED with
 * `fitnessGoal: 'hybrid'`, `fitnessLevel: 'intermediate'`, `equipmentTier:
 * 'gym'`, and `shouldShowOnboarding` auto-completes onboarding for anyone with
 * stored data — so an upgrading athlete has never answered these questions and
 * nothing in state distinguishes an assumption from a choice. A prompt for
 * "missing" values would therefore never fire, while the row would still be
 * telling that athlete it was built on *their* goal.
 *
 * Showing the basis and making it changeable in place is the honest version:
 * it states exactly what the recommendations assumed, and one tap corrects it.
 *
 * @param {ReturnType<typeof athleteProfile>} profile
 * @returns {{id:string, question:string, current:string|null,
 *            currentLabel:string, options:{value:string, label:string}[]}[]}
 */
export function recommendationBasis(profile) {
  return PROFILE_QUESTIONS.map((q) => {
    const current = profile?.[q.field] ?? null;
    const match = q.options.find((o) => o.value === current);
    return {
      id: q.id,
      question: q.question,
      current,
      currentLabel: match ? match.label : 'Not set',
      options: q.options,
    };
  });
}

/**
 * Choose the one reason to headline on each card.
 *
 * Taking `reasons[0]` gave every card in the row the same line — "Matches your
 * endurance goal" five times — which is true, and useless for choosing between
 * them. The reason worth showing is the one that sets a programme APART from
 * the others on screen, so the rarest reason wins and the shared goal line is
 * the fallback for a card that has nothing else to say.
 *
 * @param {string[][]} reasonLists one entry per recommendation, in rank order
 * @returns {string[]} one headline per recommendation, same order
 */
export function distinguishingReasons(reasonLists) {
  const frequency = new Map();
  for (const list of reasonLists) {
    for (const reason of new Set(list)) {
      frequency.set(reason, (frequency.get(reason) || 0) + 1);
    }
  }
  return reasonLists.map((list) => {
    if (list.length === 0) return '';
    let best = list[0];
    let bestCount = frequency.get(best) ?? 0;
    for (const reason of list.slice(1)) {
      const count = frequency.get(reason) ?? 0;
      if (count < bestCount) { best = reason; bestCount = count; }
    }
    return best;
  });
}

/**
 * Average training days per week over the recent past, or null when there is
 * not enough history to claim anything.
 *
 * @param {Set<string>|string[]} loggedDates ISO day keys
 * @param {string} todayISO
 * @param {number} [windowDays]
 */
export function recentWeeklySessions(loggedDates, todayISO, windowDays = 28) {
  const dates = loggedDates instanceof Set ? [...loggedDates] : (loggedDates || []);
  const end = Date.parse(`${todayISO}T00:00:00Z`);
  if (!Number.isFinite(end)) return null;
  const start = end - (windowDays - 1) * 86400000;
  let count = 0;
  for (const iso of dates) {
    const t = Date.parse(`${iso}T00:00:00Z`);
    if (Number.isFinite(t) && t >= start && t <= end) count += 1;
  }
  // Two sessions in a month is not a frequency worth reasoning from.
  if (count < 3) return null;
  return Math.round((count / (windowDays / 7)) * 10) / 10;
}
