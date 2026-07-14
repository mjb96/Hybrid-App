// @ts-check
// One program-week phase resolver for every product surface.

/** Classify a program-authored phase label into presentation/behavior semantics. */
export function classifyPhase(label) {
  const s = String(label || '').toLowerCase();
  if (!s) return 'work';
  if (/deload|recovery week|reduced[- ]load/.test(s)) return 'deload';
  if (/taper/.test(s)) return 'taper';
  if (/peak|test|max\b|maxes|absolute|race/.test(s)) return 'peak';
  if (/intensif|intensity|threshold intens|heavy/.test(s)) return 'intensify';
  if (/accumulat|volume|base|aerobic|hypertrophy|build|goal pace|foundation/.test(s)) return 'build';
  return 'work';
}

/**
 * Resolve the exact active program's week metadata.
 * @param {any} program
 * @param {string|number} week
 * @param {any} [state]
 */
export function resolveProgramPhase(program, week, state = null) {
  const weekKey = String(parseInt(String(week || 1), 10) || 1);
  const modifier = program?.weeklyVolModifiers?.[weekKey] || null;
  const authored = String(modifier?.intensityLabel || '').trim();
  const applied = state?.deloadApplied != null && String(state.deloadApplied) === weekKey;

  if (applied && classifyPhase(authored) !== 'deload') {
    return {
      week: Number(weekKey),
      label: authored ? `Applied deload · ${authored}` : 'Applied deload',
      authoredLabel: authored,
      kind: 'deload',
      isDeload: true,
      source: 'applied',
      modifier,
    };
  }

  const label = authored || 'Training';
  const kind = classifyPhase(label);
  return {
    week: Number(weekKey),
    label,
    authoredLabel: authored,
    kind,
    isDeload: kind === 'deload',
    source: authored ? 'program' : 'fallback',
    modifier,
  };
}
