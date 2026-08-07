// @ts-check
// =============================================================================
// PROGRAMME DETAIL — "WHO IT'S FOR"
// -----------------------------------------------------------------------------
// Phase 4B asks programme detail to answer "who is this for" FIRST. The page
// could not answer it at all: the closest it came was a marketing tagline and a
// "What you'll achieve" list, neither of which knows anything about the athlete
// reading them.
//
// The app already scores exactly this. `programFit` (recommendation-fit.js) is
// the same model the Plans recommendations use, so a programme cannot be
// described as fitting here and unfitting there.
//
// The one deliberate difference: the recommendation ROW shows reasons only and
// drops an unfitting programme entirely — an invented recommendation is worse
// than none. On the detail page the athlete has *chosen* to look, so the
// CAUTIONS are the most useful thing on the screen ("Needs cables, bands",
// "Built for advanced athletes"). Withholding them here would be the dishonest
// choice, not the polite one.
//
// Pure: no DOM, no state writes.
// =============================================================================
import { DIFFICULTY_LABELS } from './catalog.js';
import { athleteProfile, programFit } from './recommendation-fit.js';

const LEVEL_AUDIENCE = Object.freeze({
  beginner: 'new lifters and anyone rebuilding a base',
  intermediate: 'athletes with a season or two of consistent training',
  advanced: 'experienced athletes who already train hard',
  elite: 'competitive athletes at the top of their sport',
});

/**
 * Who the programme is written for, and whether that is this athlete.
 *
 * `audience` is a property of the PROGRAMME and always renders. `verdict`,
 * `reasons` and `cautions` are about the athlete and only appear once there is
 * something true to say — an athlete who has answered nothing gets the audience
 * line alone rather than a fabricated match.
 *
 * @param {any} program
 * @param {any} state
 * @param {{ weeklySessions?: number }} [derived]
 * @returns {{
 *   audience:string,
 *   verdict:null|{ tone:'fits'|'stretch'|'mismatch', label:string },
 *   reasons:string[], cautions:string[],
 * }}
 */
export function buildWhoItsFor(program, state, derived = {}) {
  const audience = audienceLine(program);
  const profile = athleteProfile(state, derived);
  // Nothing the athlete has told us ⇒ nothing to compare against. Say what the
  // programme is for and stop; a "great fit" badge with no basis is the exact
  // claim Phase 4A removed from the recommendations row.
  if (!profile?.goal && !profile?.level && !hasEquipmentAnswer(profile)) {
    return { audience, verdict: null, reasons: [], cautions: [] };
  }

  const fit = programFit(program, profile);
  const reasons = [...(fit.reasons || [])];
  const cautions = [...(fit.cautions || [])];
  if (!reasons.length && !cautions.length) {
    return { audience, verdict: null, reasons, cautions };
  }

  return { audience, verdict: verdictFor(fit, reasons, cautions), reasons, cautions };
}

/** Does the profile carry any usable equipment answer at all? */
function hasEquipmentAnswer(profile) {
  if (profile?.tier) return true;
  const equipment = profile?.equipment;
  return !!equipment && typeof equipment === 'object' && Object.keys(equipment).length > 0;
}

/**
 * The programme's own audience, from its authored level — never from the
 * athlete. A programme is written for whoever it is written for whether or not
 * the person reading matches.
 */
function audienceLine(program) {
  const level = String(program?.difficulty || '').toLowerCase();
  const named = LEVEL_AUDIENCE[level];
  const label = DIFFICULTY_LABELS[level]?.label || null;
  if (named) return `Written for ${named}.`;
  if (label) return `Written for ${label.toLowerCase()} athletes.`;
  return 'Suits a range of training experience.';
}

/**
 * One word for the fit, decided by the SAME personal score that orders the
 * recommendations — not by counting reasons, which would call a programme with
 * three weak matches and one disqualifying caution a good fit.
 *
 * @returns {{ tone:'fits'|'stretch'|'mismatch', label:string }}
 */
function verdictFor(fit, reasons, cautions) {
  const score = Number(fit?.personalScore) || 0;
  if (!reasons.length) return { tone: 'mismatch', label: 'Not a match for your profile' };
  if (score <= 0) return { tone: 'mismatch', label: 'Probably not your programme' };
  if (cautions.length) return { tone: 'stretch', label: 'Fits, with caveats' };
  return { tone: 'fits', label: 'Fits your profile' };
}
