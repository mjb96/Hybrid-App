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
    difficulty: program?.difficulty || null,
    equipment: Array.isArray(program?.equipment) ? program.equipment : [],
    metrics: program?.metrics || null,
  };
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
const fmtSets = (n) => (n ? `${n} sets/wk` : '—');

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
    { label: 'Weekly volume', a: fmtSets(sa.weeklySets),    b: fmtSets(sb.weeklySets) },
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
