// @ts-check
// =============================================================================
// PROGRAM COMPARISON (js/programs/compare.js)
//
// Pure, DOM-free. Distils a program into decision stats and diffs two programs
// side by side — so choosing between (say) StrongLifts and Starting Strength is
// an informed call, not a coin toss. B4 of the launch-audit plan.
//
// `programStats` is also the commitment helper A2 will reuse for the detail
// page's time-cost / weekly-volume / equipment strip.
// =============================================================================

/**
 * Does the program prescribe any barbell/dumbbell work at all? Running- and
 * endurance-only programs carry `weeklyVolModifiers.sets/reps` purely to hold an
 * `intensityLabel` (the real run prescription) — so "sets × reps" and "sets per
 * lift" are meaningless for them. Detect the lift-less case by the days: a run
 * program's days are all `lifts: []`.
 */
export function programHasLifts(program) {
  const days = program?.days;
  if (!days || typeof days !== 'object') return false;
  return Object.values(days).some(d => Array.isArray(d?.lifts) && d.lifts.length > 0);
}

/** Average working sets prescribed across a program's weeks, or null. */
function avgWeeklySets(program) {
  const mods = program?.weeklyVolModifiers;
  if (!mods || typeof mods !== 'object') return null;
  const vals = Object.values(mods).map(m => Number(m?.sets)).filter(n => Number.isFinite(n));
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Decision stats for one program. Tolerant of the two shapes in play (rich
 * catalog entry vs a trainable custom program), falling back sensibly.
 */
export function programStats(program) {
  const weeks = Number(program?.durationWeeks || program?.totalWeeks) || null;
  const daysPerWeek = Number(program?.sessionsPerWeek) || null;
  const sd = program?.sessionDurationMinutes;
  const sessionMin = (sd && typeof sd === 'object') ? { min: Number(sd.min) || null, max: Number(sd.max) || null } : null;

  // Total time commitment (hours) from days × avg session × weeks.
  let totalHours = null;
  if (weeks && daysPerWeek && sessionMin && (sessionMin.min || sessionMin.max)) {
    const avgSession = ((sessionMin.min || sessionMin.max) + (sessionMin.max || sessionMin.min)) / 2;
    totalHours = Math.round((daysPerWeek * avgSession * weeks) / 60);
  }

  return {
    weeks,
    daysPerWeek,
    sessionMin,
    totalHours,
    weeklySets: avgWeeklySets(program),
    hasLifts: programHasLifts(program),
    difficulty: program?.difficulty || null,
    equipment: Array.isArray(program?.equipment) ? program.equipment : [],
    metrics: program?.metrics || null,
  };
}

// Map a program's equipment tokens onto the athlete's owned-equipment keys
// (settings.equipment). Tokens with no owned-equipment equivalent (bench, sled,
// running shoes, ergs…) are "unknown" — we don't red-flag what we can't judge.
const EQUIP_KEY = {
  barbell: 'barbell', rack: 'rack', dumbbells: 'dumbbells', cables: 'cables',
  'pull-up-bar': 'pullupBar', pullups: 'pullupBar', kettlebell: 'kettlebells',
  kettlebells: 'kettlebells', bands: 'bands', treadmill: 'treadmill',
};

/**
 * Fit between a program's equipment needs and what the athlete owns.
 * @param {string[]} programEquipment
 * @param {Record<string, boolean>} [owned] settings.equipment
 * @returns {{ owned: string[], missing: string[], unknown: string[] }}
 */
export function equipmentFit(programEquipment, owned = {}) {
  const result = { owned: [], missing: [], unknown: [] };
  const known = owned && Object.keys(owned).length > 0;
  for (const token of (programEquipment || [])) {
    const key = EQUIP_KEY[token];
    if (!key) { result.unknown.push(token); continue; }
    if (!known) { result.unknown.push(token); continue; }
    if (owned[key]) result.owned.push(token);
    else result.missing.push(token);
  }
  return result;
}

const EMPHASIS = [
  ['strengthEmphasis', 'Strength'],
  ['hypertrophyEmphasis', 'Hypertrophy'],
  ['enduranceEmphasis', 'Endurance'],
  ['conditioningEmphasis', 'Conditioning'],
  ['recoveryDemand', 'Recovery demand'],
];

const fmtWeeks = (n) => (n ? `${n} weeks` : '—');
const fmtDays = (n) => (n ? `${n}×/week` : '—');
const fmtSession = (s) => (s && (s.min || s.max)) ? (s.min && s.max && s.min !== s.max ? `${s.min}–${s.max} min` : `${s.max || s.min} min`) : '—';
const fmtHours = (n) => (n ? `~${n} h total` : '—');
const fmtSets = (n) => (n ? `~${n} sets/lift` : '—');

/**
 * Build a side-by-side comparison model of two programs.
 * @returns {{ a: any, b: any, rows: {label:string, a:string, b:string}[], metrics: {label:string, a:number, b:number}[] }}
 */
export function buildComparison(programA, programB) {
  const sa = programStats(programA);
  const sb = programStats(programB);

  const rows = [
    { label: 'Length',        a: fmtWeeks(sa.weeks),        b: fmtWeeks(sb.weeks) },
    { label: 'Frequency',     a: fmtDays(sa.daysPerWeek),   b: fmtDays(sb.daysPerWeek) },
    { label: 'Session',       a: fmtSession(sa.sessionMin), b: fmtSession(sb.sessionMin) },
    { label: 'Time cost',     a: fmtHours(sa.totalHours),   b: fmtHours(sb.totalHours) },
    { label: 'Set volume',    a: fmtSets(sa.hasLifts ? sa.weeklySets : null),    b: fmtSets(sb.hasLifts ? sb.weeklySets : null) },
    { label: 'Level',         a: sa.difficulty || '—',      b: sb.difficulty || '—' },
    { label: 'Equipment',     a: sa.equipment.join(', ') || '—', b: sb.equipment.join(', ') || '—' },
  ];

  const metrics = EMPHASIS.map(([key, label]) => ({
    label,
    a: Number(sa.metrics?.[key]) || 0,
    b: Number(sb.metrics?.[key]) || 0,
  })).filter(m => m.a > 0 || m.b > 0);

  return {
    a: { name: programA?.name || 'Program A', ...sa },
    b: { name: programB?.name || 'Program B', ...sb },
    rows,
    metrics,
  };
}
