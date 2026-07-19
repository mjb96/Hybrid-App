// @ts-check
// =============================================================================
// PERIOD COMPARISON — analytics/period-comparison.js
//
// Numeric comparison logic lives at a new module URL so an app upgrade cannot
// combine an older cached comparison.js (wording-only) with new callers that
// require comparePeriodValues. comparison.js keeps the public re-export for
// source compatibility; production callers import this owner directly.
// =============================================================================

import { comparisonLabel } from './comparison.js';

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
