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

/**
 * Build one honest period comparison. Current calendar weeks compare only the
 * elapsed portion with the same elapsed days last week; completed weeks compare
 * full week with full week. A zero/missing denominator never produces NaN or
 * Infinity and is described in plain language instead.
 *
 * @param {{currentValue:number, previousValue:number|null, isCurrentWeek:boolean}} input
 */
export function comparePeriodValues({ currentValue, previousValue, isCurrentWeek }) {
  const kind = isCurrentWeek ? 'live' : 'completed';
  const label = comparisonLabel(isCurrentWeek);

  if (previousValue == null || !Number.isFinite(previousValue)) {
    return {
      type: kind, previousTotal: null, absoluteChange: null,
      percentageChange: null, direction: 'none', comparisonLabel: label,
      isComparable: false, message: 'Not enough previous data to compare',
    };
  }

  const current = Number.isFinite(currentValue) ? currentValue : 0;
  const absoluteChange = current - previousValue;
  const direction = absoluteChange > 0 ? 'up' : absoluteChange < 0 ? 'down' : 'flat';

  if (previousValue === 0) {
    return {
      type: kind,
      previousTotal: 0,
      absoluteChange,
      percentageChange: null,
      direction,
      comparisonLabel: label,
      isComparable: false,
      message: current === 0
        ? 'No activity to compare'
        : (isCurrentWeek ? 'None at this point last week' : 'None last week'),
    };
  }

  return {
    type: kind,
    previousTotal: previousValue,
    absoluteChange,
    percentageChange: Math.round((absoluteChange / previousValue) * 100),
    direction,
    comparisonLabel: label,
    isComparable: true,
    message: null,
  };
}

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
