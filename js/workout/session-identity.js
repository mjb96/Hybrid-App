// @ts-check

/**
 * Stable owner for the live workout clock. A timer must never float between
 * program weeks, weekdays or one-off sessions.
 */
export function workoutSessionKey(state, weekKey, day) {
  const week = state?.weeks?.[weekKey];
  if (!week || !day) return null;
  if (week.sessionId) return `session:${week.sessionId}:${day}`;
  const activation = week.activationId || state?.activeActivationId || 'legacy';
  return `program:${activation}:${weekKey}:${day}`;
}
