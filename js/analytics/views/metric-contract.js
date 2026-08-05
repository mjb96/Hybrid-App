// @ts-check
// =============================================================================
// METRIC DETAIL CONTRACT (analytics/views/metric-contract.js) — roadmap Phase 3C
//
// Every analytics detail screen must answer the same questions, in order:
//
//   1. What changed?                  → the value + its comparison
//   2. Is it meaningful/comparable?   → period framing + confidence + tier
//   3. What contributed to it?        → exact evidence rows
//   4. What should I do?              → the interpretation line
//   5. How was it calculated?         → this disclosure
//
// Running and Strength each hand-rolled step 5, which is how they drifted:
// Running stated Confidence, Strength did not, and neither said how much
// interpretive weight a metric deserves. This module owns that footer so the
// contract is implemented once and can be enforced by a test rather than by
// reviewers noticing a missing <dt>.
// =============================================================================

import { esc } from './screen-kit.js';
import { tierFor, TIER_DESCRIPTION } from '../metric-tiers.js';

/**
 * Human sentence for how much weight a metric deserves, from its Phase 3B tier.
 * A user reading a diagnostic should know it is a diagnostic.
 * @param {string} metricId
 */
export function tierNote(metricId) {
  const tier = tierFor(metricId);
  const label = { headline: 'Headline metric', supporting: 'Supporting metric', advanced: 'Advanced metric', diagnostic: 'Diagnostic' }[tier];
  return `${label} — ${TIER_DESCRIPTION[tier]}`;
}

/**
 * Describe what was left out, without ever implying certainty about it.
 *
 * `extra` carries domain-specific exclusions the shared shape cannot know
 * about — running's pace-ineligible activities, for instance. Without it this
 * module would silently drop a category the old hand-rolled footer showed.
 *
 * @param {{future?:number, undated?:number}} exclusions
 * @param {string[]} [extra] already-formatted phrases, e.g. "3 pace-ineligible"
 */
export function exclusionNote(exclusions, extra = []) {
  const parts = [
    exclusions?.future ? `${exclusions.future} future` : '',
    exclusions?.undated ? `${exclusions.undated} undated` : '',
    ...(Array.isArray(extra) ? extra : []),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No future or undated records found.';
}

/**
 * The shared "How this is calculated" disclosure. Every field is required by
 * the contract; a caller that cannot supply one gets an honest fallback rather
 * than a silently missing row.
 *
 * @param {{
 *   metricId: string,
 *   calculation: string,
 *   source: string,
 *   confidence?: string,
 *   recordCount?: number,
 *   recordNoun?: string,
 *   recordNounPlural?: string,
 *   exclusions?: {future?:number, undated?:number},
 *   extraExclusions?: string[],
 *   limitations?: string[],
 * }} input
 */
export function metricMethodHTML({
  metricId, calculation, source, confidence, recordCount, recordNoun = 'record',
  recordNounPlural, exclusions, extraExclusions, limitations,
}) {
  const count = Number.isFinite(Number(recordCount)) ? Number(recordCount) : null;
  // Naive `+ 's'` produced "independent activitys"; callers whose noun does not
  // pluralise that way supply the plural explicitly.
  const plural = recordNounPlural || `${recordNoun}s`;
  const history = count == null
    ? 'Record count unavailable for this metric.'
    : `${count} dated ${count === 1 ? recordNoun : plural} across all program activations.`;

  return `<details class="metric-method">
    <summary>How this is calculated</summary>
    <p>${esc(calculation || 'No calculation description is available for this metric.')}</p>
    <dl>
      <div><dt>Source</dt><dd>${esc(source || 'Source not recorded.')}</dd></div>
      <div><dt>Confidence</dt><dd>${esc(confidence || 'No explicit confidence treatment for this metric.')}</dd></div>
      <div><dt>How to read it</dt><dd>${esc(tierNote(metricId))}</dd></div>
      <div><dt>Included history</dt><dd>${esc(history)}</dd></div>
      <div><dt>Excluded</dt><dd>${esc(exclusionNote(exclusions || {}, extraExclusions))}</dd></div>
    </dl>
    ${Array.isArray(limitations) && limitations.length
      ? `<ul>${limitations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
      : ''}
  </details>`;
}

/** The section headings the contract requires, for tests to assert against. */
export const REQUIRED_METHOD_ROWS = Object.freeze([
  'Source', 'Confidence', 'How to read it', 'Included history', 'Excluded',
]);
