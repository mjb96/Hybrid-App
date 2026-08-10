// @ts-check
// =============================================================================
// RUN DISTANCE AND PACE — unit conversion at the UI boundary.
//
// Split out of js/workout.js. Pure functions with no DOM and no app state: the
// athlete's unit setting arrives as an argument, never read from a module global.
// That is why this is the easiest seam in the file and why it goes early — it
// also makes these testable for the first time. They were private helpers, so
// nothing could reach them, and the suite had no coverage of the mile path at all.
//
// THE INVARIANT: distance is STORED canonically in km, everywhere. These convert
// only for display and back on input. A rounded display value fed back through
// `_displayDistToKm` will not return the exact original km, so never round-trip
// a stored value through the UI representation to "normalise" it.
// =============================================================================

// ── Distance-unit helpers ──────────────────────────────────────────────────────
// Distance is stored canonically in km everywhere. The cockpit run panel accepts
// and displays the user's configured unit (km|mi) and converts on the boundary.
export const KM_TO_MI = 0.621371;
export function _runDistUnit(appState) {
  return appState?.settings?.distanceUnit === 'mi' ? 'mi' : 'km';
}
export function _kmToDisplayDist(km, unit) {
  const n = parseFloat(km);
  if (!isFinite(n)) return '';
  const v = unit === 'mi' ? n * KM_TO_MI : n;
  return String(Math.round(v * 100) / 100);
}
export function _displayDistToKm(val, unit) {
  const n = parseFloat(val);
  if (!isFinite(n)) return '';
  const km = unit === 'mi' ? n / KM_TO_MI : n;
  return String(Math.round(km * 1000) / 1000);
}

// ── Pace helpers ──────────────────────────────────────────────────────────────
// Note: _paceFromDistTime divides time by whatever distance number it is given,
// so passing a display-unit distance yields a per-display-unit pace.
export function _paceFromDistTime(distKm, timeStr) {
  const dist = parseFloat(distKm);
  if (!dist || dist <= 0 || !timeStr) return '';
  const parts = String(timeStr).trim().split(':');
  let secs = 0;
  if (parts.length === 3) secs = +parts[0] * 3600 + +parts[1] * 60 + parseFloat(parts[2]);
  else if (parts.length === 2) secs = +parts[0] * 60 + parseFloat(parts[1]);
  if (!secs) return '';
  const secPerKm = secs / dist;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function _timeFromPaceDist(paceStr, distKm) {
  const dist = parseFloat(distKm);
  if (!dist || dist <= 0 || !paceStr) return '';
  const parts = String(paceStr).trim().replace(/\/km.*/i, '').trim().split(':');
  if (parts.length !== 2) return '';
  const secPerKm = +parts[0] * 60 + parseFloat(parts[1]);
  if (!secPerKm) return '';
  const totalSecs = secPerKm * dist;
  const m = Math.floor(totalSecs / 60);
  const s = Math.round(totalSecs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
