// ==========================================
// MATH UTILITIES — analytics/calculations/math-utils.js
// Pure functions. No DOM, no side effects.
// ==========================================

// Simple linear regression on [y0, y1, ...] indexed by position.
// Returns { slope, intercept, r2 }.
export function linearRegression(series) {
  const pts = series.map((y, x) => ({ x, y })).filter(p => p.y > 0 && isFinite(p.y));
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0, r2: 0 };

  const sumX  = pts.reduce((s, p) => s + p.x, 0);
  const sumY  = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const yMean = sumY / n;
  const ssTot = pts.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2    = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

// Project value at index `targetIdx` using the regression.
export function projectValue(regression, targetIdx) {
  return regression.slope * targetIdx + regression.intercept;
}

// Build a full trend-line array (same length as series, including future points).
// `extendBy` adds that many future points beyond the series length.
export function trendLine(series, extendBy = 0) {
  const reg = linearRegression(series);
  const len = series.length + extendBy;
  return Array.from({ length: len }, (_, i) => reg.slope * i + reg.intercept);
}

// Rolling average with given window size. Returns same-length array.
// Leading entries (< window) use a shorter window (expanding).
export function rollingAverage(series, window) {
  if (window <= 1) return [...series];
  return series.map((_, i) => {
    const slice = series.slice(Math.max(0, i - window + 1), i + 1).filter(v => v > 0);
    return slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
  });
}

// Percentage change from a to b. Returns null if a is 0.
export function pctChange(a, b) {
  if (!a || !isFinite(a)) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

// Moving sum over window. Used for training stress trends.
export function rollingSum(series, window) {
  return series.map((_, i) => {
    return series.slice(Math.max(0, i - window + 1), i + 1).reduce((a, b) => a + b, 0);
  });
}

// Clamp value between min and max.
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Return the index of the maximum value in an array (ignoring zeros).
export function maxIndex(arr) {
  let best = -1, bestVal = -Infinity;
  arr.forEach((v, i) => { if (v > bestVal) { bestVal = v; best = i; } });
  return best;
}
