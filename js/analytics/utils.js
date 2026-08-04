// @ts-check
// ==========================================
// ANALYTICS UTILS (analytics/utils.js)
// ==========================================
import { CONFIG } from '../constants.js';

const KM_TO_MI = 0.621371;

// Returns display string e.g. "5.2 km" or "3.2 mi"
// unit comes from appState.settings?.distanceUnit ('km' | 'mi')
export function formatDist(km, unit = 'km', decimals = 1) {
  if (!km || isNaN(km)) return unit === 'mi' ? '0.0 mi' : '0.0 km';
  const val = unit === 'mi' ? km * KM_TO_MI : km;
  return val.toFixed(decimals) + ' ' + unit;
}

/**
 * The athlete's weight unit, normalised. Settings stores 'kg' or 'lbs'.
 *
 * Note this LABELS rather than converts: the app has no weight conversion
 * anywhere by design — a set is stored in whatever unit it was entered in, so
 * the stored number is already in the athlete's unit and only needs naming
 * correctly. Hardcoding 'kg' therefore mislabels an lbs athlete's own numbers.
 *
 * @param {any} state
 */
export function weightUnitOf(state) {
  return state?.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';
}

/**
 * Format a weight for display in the athlete's unit.
 * @param {number|string|null|undefined} value
 * @param {string} unit  from weightUnitOf
 * @param {{decimals?:number, empty?:string}} [opts]
 */
export function formatWeight(value, unit = 'kg', { decimals = 0, empty = '--' } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return empty;
  return `${decimals > 0 ? number.toFixed(decimals) : Math.round(number).toLocaleString()} ${unit}`;
}

export function parsePaceSeconds(distKm, timeStr) {
  if (!distKm || !timeStr || parseFloat(distKm) === 0) return 0;
  const parts = timeStr.split(':').map(Number);
  let totalSecs = 0;
  if (parts.length === 2) totalSecs = parts[0] * 60 + parts[1];
  else if (parts.length === 3) totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (totalSecs === 0) return 0;
  return totalSecs / parseFloat(distKm);
}

export function formatPace(secsPerKm) {
  if (!secsPerKm || secsPerKm === 0) return '--';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60).toString().padStart(2, '0');
  return `${m}:${s}/km`;
}

export function rpeColour(rpe) {
  if (rpe === 0) return '#3b82f6';
  if (rpe < 6)  return '#10b981';
  if (rpe < 8)  return '#f59e0b';
  return '#ef4444';
}

export function paceZoneColour(secsPerKm, thresholdSecs) {
  const easy      = thresholdSecs ? thresholdSecs + 60  : (CONFIG.paceZoneEasy      || 360);
  const tempo     = thresholdSecs ? thresholdSecs + 30  : (CONFIG.paceZoneTempo     || 300);
  const threshold = thresholdSecs                       || (CONFIG.paceZoneThreshold || 270);
  if (secsPerKm === 0) return '#3b82f6';
  if (secsPerKm > easy)      return '#10b981';
  if (secsPerKm > tempo)     return '#f59e0b';
  if (secsPerKm > threshold) return '#ef4444';
  return '#a855f7';
}
