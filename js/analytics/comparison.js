// @ts-check
// =============================================================================
// COMPARISON DESCRIPTIONS (js/analytics/comparison.js)
//
// One place that owns the WORDING of a week-over-week comparison, so the label
// a surface shows always matches the periods the value was computed over:
//   • current (partial) week → elapsed-matched → "vs same point last week"
//   • a completed week       → full vs full    → "vs previous week"
// Used by both the In Focus graph model (week-chart-model) and the analytics
// detail stat cards, so they can never drift apart.
// =============================================================================

export const COMPARISON_LABELS = Object.freeze({
  live: 'vs same point last week',
  completed: 'vs previous week',
});

/** The canonical label for a comparison of this framing. */
export function comparisonLabel(isCurrentWeek) {
  return isCurrentWeek ? COMPARISON_LABELS.live : COMPARISON_LABELS.completed;
}

// Compatibility re-export. New production callers import the calculation owner
// directly so an older cached wording module cannot break an upgraded app.
export { comparePeriodValues } from './period-comparison.js';

/**
 * Map a week-chart-model `comparison` object to the fields a stat card needs,
 * so value + delta + sub-label all describe the same periods. Non-comparable
 * comparisons (no prior week / zero denominator) return a null delta — the card
 * then shows the honest period label with no fabricated percentage.
 * @param {{comparison:{isComparable:boolean,percentageChange:number|null,comparisonLabel:string}}} chart
 */
export function statComparisonFrom(chart) {
  const c = chart && chart.comparison ? chart.comparison : null;
  if (!c) return { deltaPct: null, sub: '', isComparable: false };
  return {
    deltaPct: c.isComparable ? c.percentageChange : null,
    sub: c.comparisonLabel,
    isComparable: c.isComparable,
  };
}
