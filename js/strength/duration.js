// @ts-check
// =============================================================================
// STRENGTH SESSION DURATION
//
// Workout finish stores modern values as M:SS (FIT imports use the same shape),
// while legacy/manual records may be a bare number meaning whole minutes. Keep
// that compatibility in one place so charts, activity history and load models
// cannot disagree about whether "60" means one minute or one hour.
// =============================================================================

/**
 * Parse a persisted strength-session duration into seconds.
 * Accepts legacy whole minutes, M:SS, and H:MM:SS. Invalid/negative values are 0.
 * @param {unknown} value
 */
export function parseStrengthDurationSeconds(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const minutes = Number(raw);
    return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 60) : 0;
  }
  const parts = raw.split(':');
  if (parts.length !== 2 && parts.length !== 3) return 0;
  if (!parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))) return 0;
  const values = parts.map(Number);
  if (values.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  const seconds = parts.length === 3
    ? values[0] * 3600 + values[1] * 60 + values[2]
    : values[0] * 60 + values[1];
  return Number.isFinite(seconds) ? Math.round(seconds) : 0;
}

/** @param {unknown} value */
export function parseStrengthDurationMinutes(value) {
  return parseStrengthDurationSeconds(value) / 60;
}

/** @param {unknown} value */
export function formatStrengthDuration(value) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
