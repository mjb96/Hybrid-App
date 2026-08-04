// @ts-check
// =============================================================================
// PROGRESS LANDING MODEL (js/analytics/progress-landing.js) — roadmap Phase 3A
//
// The Progress hub used to be a static index: eight equal links and no data, so
// the only way to learn whether anything had changed was to open all eight. This
// module turns it into a decision surface by answering the roadmap's ordered
// questions for each domain — what changed, is it comparable, what does it mean,
// and where is the evidence — BEFORE the user taps anything.
//
// Four headline domains, in the roadmap's priority order:
//   1. Consistency     — did I show up, against what I planned
//   2. Strength        — same-exercise estimated 1RM, calendar-week
//   3. Running         — weekly distance
//   4. Recovery & Load — readiness and its confidence
//
// Everything else (Hybrid Score, Review, Fasting, Body Weight, Projections) is
// demoted to a secondary group: valid, but not the definition of progress.
//
// PURE. Readiness is injected rather than recomputed here so this module stays
// cheap to test and so Progress can never disagree with Home about the same
// number (the dashboard model is the one owner — see CLAUDE.md §analytics).
//
// Every period here is a CALENDAR week (never state.currentWeek, which is a
// program-week counter that only advances on an explicit step).
// =============================================================================

import { weekStartOf, localDayKey, addDaysISO, DAY_KEYS } from './weekly-aggregate.js';
import { loggedDateSet } from './logged-days.js';
import { comparePeriodValues } from './period-comparison.js';
import { calendarStrengthSummary } from './strength-calendar.js';
import { classifyPlannedSession } from '../workout/completion-policy.js';

/** Days of a Monday-based week that have already elapsed, 1..7. */
function elapsedDayCount(weekStartISO, todayISO) {
  for (let i = 0; i < 7; i++) {
    if (addDaysISO(weekStartISO, i) === todayISO) return i + 1;
  }
  return 7; // the week is fully in the past (or ahead — callers clamp elsewhere)
}

/**
 * Count the logged training days that fall inside one calendar week, optionally
 * limited to the first `limitDays` days so a live week can be compared against
 * the same elapsed portion of the previous week rather than a full one.
 * @param {Set<string>} dates
 * @param {string} weekStartISO
 * @param {number} [limitDays]
 */
function trainedDaysIn(dates, weekStartISO, limitDays = 7) {
  let n = 0;
  for (let i = 0; i < Math.min(7, Math.max(0, limitDays)); i++) {
    if (dates.has(/** @type {string} */ (addDaysISO(weekStartISO, i)))) n++;
  }
  return n;
}

/**
 * How many days of an authored program week are training days.
 *
 * Uses the SAME classifier the Today card, coach and cockpit use rather than a
 * second reading of `day.runs` — otherwise Progress could tell you a session is
 * planned on a day Home calls a rest day. Returns null (not 0) when there is no
 * usable program, so callers can drop the "of N planned" framing entirely
 * instead of claiming a plan of zero sessions.
 *
 * @param {any} program
 */
export function plannedTrainingDays(program) {
  const days = program?.days;
  if (!days || typeof days !== 'object') return null;
  let n = 0;
  for (const key of DAY_KEYS) {
    const day = days[key];
    if (!day || typeof day !== 'object') continue;
    if (!classifyPlannedSession(day).isRest) n++;
  }
  return n > 0 ? n : null;
}

/** Shared shape so every domain card renders from identical fields. */
function domain(config) {
  return {
    id: config.id,
    title: config.title,
    context: config.context,
    parentContext: 'hub',
    headline: config.headline,          // { value:string, unit:string|null }
    support: config.support || null,    // one short supporting fact
    delta: config.delta || null,        // { text:string, tone:'up'|'down'|'flat'|'none' }
    interpretation: config.interpretation,
    empty: !!config.empty,
  };
}

/** Direction → tone, respecting metrics where lower is better. */
function toneFor(direction, inverse = false) {
  if (direction === 'up') return inverse ? 'down' : 'up';
  if (direction === 'down') return inverse ? 'up' : 'down';
  return direction === 'flat' ? 'flat' : 'none';
}

/**
 * Consistency — the roadmap's first domain and the one the hub was missing
 * entirely. Built from real stamped dates via loggedDateSet, so an archived
 * activation's sessions still count and nothing is attributed to a guessed date.
 */
function consistencyDomain(state, { days, program, todayISO, weekStart }) {
  const dates = loggedDateSet(state, days);
  const prevWeekStart = /** @type {string} */ (addDaysISO(weekStart, -7));
  const isCurrentWeek = weekStart === weekStartOf(todayISO);
  const elapsed = isCurrentWeek ? elapsedDayCount(weekStart, todayISO) : 7;

  const trained = trainedDaysIn(dates, weekStart, elapsed);
  const previous = trainedDaysIn(dates, prevWeekStart, elapsed);
  const planned = plannedTrainingDays(program);

  const comparison = comparePeriodValues({
    currentValue: trained,
    previousValue: previous,
    isCurrentWeek,
  });

  if (trained === 0 && previous === 0) {
    return domain({
      id: 'consistency',
      title: 'Consistency',
      context: 'weekly-review',
      headline: { value: '0', unit: planned ? `of ${planned} planned` : 'sessions' },
      interpretation: 'No training logged this week yet. One session is enough to start the comparison.',
      empty: true,
    });
  }

  const remaining = planned != null ? Math.max(0, planned - trained) : null;
  const interpretation = planned == null
    ? `${trained} training day${trained === 1 ? '' : 's'} logged this week.`
    : remaining === 0
      ? `You have hit all ${planned} planned session${planned === 1 ? '' : 's'} this week.`
      : isCurrentWeek
        ? `${remaining} of ${planned} planned session${planned === 1 ? '' : 's'} still to go this week.`
        : `${trained} of ${planned} planned session${planned === 1 ? '' : 's'} completed that week.`;

  return domain({
    id: 'consistency',
    title: 'Consistency',
    context: 'weekly-review',
    headline: { value: String(trained), unit: planned ? `of ${planned} planned` : `session${trained === 1 ? '' : 's'}` },
    delta: comparison.isComparable
      ? {
        // "0 vs same point last week" is technically true and reads badly; a
        // level week is stated in words instead.
        text: comparison.absoluteChange === 0
          ? `Level with ${comparison.comparisonLabel.replace(/^vs /, '')}`
          : `${comparison.absoluteChange > 0 ? '+' : ''}${comparison.absoluteChange} session${Math.abs(comparison.absoluteChange) === 1 ? '' : 's'} ${comparison.comparisonLabel}`,
        tone: toneFor(comparison.direction),
      }
      : { text: comparison.message || comparison.comparisonLabel, tone: 'none' },
    interpretation,
  });
}

/**
 * Strength — same-exercise estimated 1RM over the calendar week. Never compares
 * two different lifts, and says so plainly when there is no prior week to
 * compare the same exercise against.
 */
function strengthDomain(state, { weekStart }) {
  const cs = calendarStrengthSummary(state, { weekStart });

  if (!cs.hasCurrentWork) {
    return domain({
      id: 'strength',
      title: 'Strength',
      context: 'strength',
      headline: { value: '—', unit: null },
      interpretation: 'No strength work logged this week. Complete working sets to track estimated 1RM.',
      empty: true,
    });
  }

  const prSupport = cs.prCount > 0
    ? `${cs.prCount} new PR${cs.prCount === 1 ? '' : 's'} this week`
    : cs.improvedCount > 0
      ? `${cs.improvedCount} lift${cs.improvedCount === 1 ? '' : 's'} up on last week`
      : null;

  if (cs.topChange) {
    const delta = Math.round(cs.topChange.deltaKg);
    return domain({
      id: 'strength',
      title: 'Strength',
      context: 'strength',
      headline: { value: `${delta >= 0 ? '+' : ''}${delta}`, unit: 'kg est. 1RM' },
      support: prSupport,
      delta: {
        text: `${cs.topChange.exerciseName} vs last week`,
        tone: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
      },
      interpretation: delta > 0
        ? `Your biggest same-exercise gain this week is ${cs.topChange.exerciseName}, up ${delta} kg on its own previous best.`
        : delta < 0
          ? `${cs.topChange.exerciseName} is ${Math.abs(delta)} kg below last week. One lighter week is normal — check the trend before changing the plan.`
          : `${cs.topChange.exerciseName} matched last week exactly.`,
    });
  }

  return domain({
    id: 'strength',
    title: 'Strength',
    context: 'strength',
    headline: { value: String(Math.round(cs.bestThisWeek.e1rm)), unit: 'kg est. 1RM' },
    support: prSupport,
    delta: { text: 'No prior week for the same lift', tone: 'none' },
    interpretation: `Best estimated 1RM this week is ${cs.bestThisWeek.exerciseName}. Repeat it next week to get a like-for-like comparison.`,
  });
}

/**
 * Running — weekly distance. The running metric engine already owns the honest
 * elapsed-matched comparison, empty states and interpretation, so this reuses
 * that model rather than recomputing distance a second way.
 * @param {(id:string)=>any} runningMetric  injected buildRunningMetricDetail binding
 */
function runningDomain(runningMetric) {
  const model = runningMetric ? runningMetric('running.weekly-distance') : null;

  if (!model || model.empty) {
    return domain({
      id: 'running',
      title: 'Running',
      context: 'running',
      headline: { value: '—', unit: null },
      interpretation: model?.interpretation
        || 'No runs logged this week. Your first dated run unlocks distance, pace and comparisons.',
      empty: true,
    });
  }

  const comparison = model.comparison;
  return domain({
    id: 'running',
    title: 'Running',
    context: 'running',
    headline: { value: model.formattedValue, unit: null },
    delta: comparison?.isComparable
      ? {
        text: `${comparison.percentageChange > 0 ? '+' : ''}${comparison.percentageChange}% ${comparison.comparisonLabel}`,
        tone: toneFor(comparison.direction),
      }
      : comparison
        ? { text: comparison.message || comparison.comparisonLabel, tone: 'none' }
        : null,
    interpretation: model.interpretation,
  });
}

/**
 * Recovery & Load — readiness with its confidence stated, because a readiness
 * score built from one signal must not read like one built from five.
 * @param {any} readiness  model.ready from the shared dashboard model
 */
function recoveryDomain(readiness) {
  if (!readiness || !(Number(readiness.score) > 0)) {
    return domain({
      id: 'recovery',
      title: 'Recovery & Load',
      context: 'recovery',
      headline: { value: '—', unit: null },
      interpretation: 'Not enough recent training or wellness data to estimate readiness.',
      empty: true,
    });
  }

  const inputs = Number(readiness.inputCount) || 0;
  return domain({
    id: 'recovery',
    title: 'Recovery & Load',
    context: 'recovery',
    headline: { value: String(Math.round(readiness.score)), unit: readiness.status || null },
    support: `${readiness.confidence || 'low'} confidence · ${inputs} signal${inputs === 1 ? '' : 's'}`,
    interpretation: readiness.recommendation
      || 'Readiness combines your logged training load with any sleep or HRV data you provide.',
  });
}

/**
 * Secondary destinations. These stay one tap away but lose their equal footing
 * with the four headline domains: Hybrid Score is an optional synthesis rather
 * than the definition of progress (roadmap §3B), and Fasting only appears for
 * users who actually fast.
 * @param {any} state
 */
export function secondaryDestinations(state) {
  // Deliberately NOT listing Review here: the Consistency domain card already
  // owns that destination, and two entries to one screen is the duplicate
  // ownership the roadmap's Phase 0 audit set out to remove.
  const items = [
    { id: 'hybrid-score', title: 'Hybrid Score', desc: 'Optional synthesis of strength, running and recovery' },
  ];
  if (fastingIsEnabled(state)) {
    items.push({ id: 'fasting', title: 'Fasting', desc: 'Your fast, protocols and metabolic stages' });
  }
  items.push({ id: 'bodyweight', title: 'Body Weight', desc: 'Weight trend and log' });
  items.push({ id: 'projections', title: 'Projections', desc: 'Predicted race times and milestone ETAs' });
  return items;
}

/**
 * Fasting is optional (roadmap §3A): it appears for people who actually fast,
 * never by default. There is no settings toggle today, so real usage — an
 * active fast or any completed one — is the honest signal. The explicit
 * settings flag is respected first so Phase 5's "choose your domains" work can
 * drive this without changing callers.
 * @param {any} state
 */
export function fastingIsEnabled(state) {
  if (state?.settings?.fastingEnabled === true) return true;
  if (state?.settings?.fastingEnabled === false) return false;
  const session = state?.fastingSession;
  if (session?.active) return true;
  return Array.isArray(session?.history) && session.history.length > 0;
}

/**
 * Build the whole Progress landing model.
 *
 * @param {any} state
 * @param {{
 *   days?: string[],
 *   program?: any,
 *   readiness?: any,
 *   runningMetric?: (id:string)=>any,
 *   today?: string,
 *   weekStart?: string,
 *   tz?: string,
 * }} [opts]
 */
export function buildProgressLanding(state, opts = {}) {
  const days = opts.days && opts.days.length ? opts.days : DAY_KEYS;
  const todayISO = opts.today || /** @type {string} */ (localDayKey(new Date(), opts.tz));
  const weekStart = opts.weekStart || weekStartOf(todayISO);
  const weekEnd = /** @type {string} */ (addDaysISO(weekStart, 6));
  const isCurrentWeek = weekStart === weekStartOf(todayISO);

  const domains = [
    consistencyDomain(state, { days, program: opts.program, todayISO, weekStart }),
    strengthDomain(state, { weekStart }),
    runningDomain(opts.runningMetric),
    recoveryDomain(opts.readiness),
  ];

  return {
    weekStart,
    weekEnd,
    isCurrentWeek,
    periodLabel: isCurrentWeek ? 'This week so far' : `Week of ${weekStart}`,
    domains,
    secondary: secondaryDestinations(state),
    // True when nothing at all has been logged — the hub then leads with a
    // single honest empty state instead of four separate dashes.
    allEmpty: domains.every((entry) => entry.empty),
  };
}
