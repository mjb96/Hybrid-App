// @ts-check
// ==========================================
// PROGRAM SCHEMA HELPERS (schema.js)
// ==========================================
// Week-modifier lookup for the v1 program shape (days{} + weeklyVolModifiers{}).
// The cockpit, verifyWeekStorageSchema, reseedActiveProgramIntoWeek and the
// builder all read this shape directly; there is no materialised "v2" form.
// ==========================================

const DEFAULT_MODIFIER = { sets: 3, reps: 10, intensityLabel: 'Working Sets' };

// Safe week-modifier accessor with fallback — use this everywhere instead of
// direct weeklyVolModifiers[wk] access so missing weeks never throw.
export function getWeekModifier(program, weekKey) {
  const mods = program && program.weeklyVolModifiers;
  return (mods && mods[String(weekKey)]) || { ...DEFAULT_MODIFIER };
}
