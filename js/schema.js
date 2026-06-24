// @ts-check
// ==========================================
// PROGRAM SCHEMA v2 (schema.js)
// ==========================================
// v1 programs store lifts as a flat days{} map + weeklyVolModifiers{}.
// v2 materialises those into a weeks[] array where each week has a days{}
// map of block[] entries already expanded with sets/reps from the modifier.
//
// The migration is non-destructive — the original program object is never
// mutated. resolveProgramV2 memoises so each program is migrated at most once.
// ==========================================
export const SCHEMA_VERSION = 2;

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DEFAULT_MODIFIER = { sets: 3, reps: 10, intensityLabel: 'Working Sets' };

// ---- run type classifier --------------------------------------------------

function classifyRunType(runsStr) {
  if (!runsStr) return null;
  const s = runsStr.toLowerCase().trim();
  if (s === 'rest' || s === '') return null;
  if (s.includes('interval') || s.includes('vo2') || s.includes('repeat')) return 'intervals';
  if (s.includes('tempo') || s.includes('threshold') || s.includes('lactate')) return 'tempo';
  if (s.includes('hard')) return 'tempo';
  if (s.includes('long') || s.includes('zone 2') || s.includes('aerobic')) return 'long';
  if (s.includes('easy') || s.includes('conversation') || s.includes('recovery')) return 'easy';
  if (s.includes('parkrun') || s.includes('race')) return 'race';
  return 'generic';
}

// ---- internal helpers -----------------------------------------------------

function resolveModifier(weeklyVolModifiers, weekIdx) {
  const key = String(weekIdx + 1);
  return (weeklyVolModifiers && weeklyVolModifiers[key]) || DEFAULT_MODIFIER;
}

function buildDayBlock(daySpec, modifier) {
  const block = [];
  if (daySpec.lifts && daySpec.lifts.length > 0) {
    for (const name of daySpec.lifts) {
      block.push({ kind: 'lift', name, sets: modifier.sets, reps: modifier.reps });
    }
  }
  const runType = classifyRunType(daySpec.runs);
  if (runType) {
    block.push({ kind: 'run', run: { type: runType, label: daySpec.runs } });
  }
  return block;
}

// ---- public API -----------------------------------------------------------

// Safe week-modifier accessor with fallback — use this everywhere instead of
// direct weeklyVolModifiers[wk] access so missing weeks never throw.
export function getWeekModifier(program, weekKey) {
  const mods = program && program.weeklyVolModifiers;
  return (mods && mods[String(weekKey)]) || { ...DEFAULT_MODIFIER };
}

// Migrate a v1 program (days{} + weeklyVolModifiers{}) to a v2 program with
// a materialised weeks[] array. Returns null/undefined unchanged.
// If already v2, returns the same reference (idempotent).
export function migrateProgramToV2(program) {
  if (program == null) return program;
  if ((program.schemaVersion || 0) >= SCHEMA_VERSION) return program;

  const totalWeeks = program.totalWeeks || 12;
  const srcDays = program.days || {};
  const mods = program.weeklyVolModifiers || {};

  const weeks = [];
  for (let i = 0; i < totalWeeks; i++) {
    const modifier = resolveModifier(mods, i);
    const days = {};
    for (const dk of DAY_KEYS) {
      const daySpec = srcDays[dk] || { lifts: [], runs: 'Rest' };
      days[dk] = { block: buildDayBlock(daySpec, modifier) };
    }
    weeks.push({ label: modifier.intensityLabel || '', days });
  }

  return { ...program, schemaVersion: SCHEMA_VERSION, weeks };
}

// Same as migrateProgramToV2 but intended for custom programs saved via the
// builder. Handles the case where program.days{} is the template and any
// pre-existing builder weeks[] is superseded by the schema weeks[].
export function migrateCustomProgramToV2(program) {
  if (program == null) return program;
  if ((program.schemaVersion || 0) >= SCHEMA_VERSION) return program;
  return migrateProgramToV2(program);
}

// WeakMap-memoised resolver — each program object is migrated at most once.
const _memo = new WeakMap();

export function resolveProgramV2(program) {
  if (program == null) return program;
  if ((program.schemaVersion || 0) >= SCHEMA_VERSION) return program;
  if (_memo.has(program)) return _memo.get(program);
  const v2 = migrateProgramToV2(program);
  _memo.set(program, v2);
  return v2;
}

// Returns { day } for a given 1-based weekNum and dayKey.
// Clamps weekNum to [1, totalWeeks]. Returns { day: null } for unknown dayKey.
export function getDayV2(program, weekNum, dayKey) {
  const v2 = resolveProgramV2(program);
  if (!v2 || !Array.isArray(v2.weeks) || v2.weeks.length === 0) return { day: null };
  const idx = Math.min(Math.max(weekNum - 1, 0), v2.weeks.length - 1);
  const week = v2.weeks[idx];
  if (!week || !week.days || !(dayKey in week.days)) return { day: null };
  return { day: week.days[dayKey] };
}
