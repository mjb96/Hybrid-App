// @ts-check
// =============================================================================
// PROGRAM TIMELINE (js/programs/timeline.js)
//
// Pure, DOM-free. Turns a program's weekly progression into a readable
// week-by-week arc — the data the detail page's "Plan" tab renders. A1 of the
// launch-audit plan, and the fix for its headline finding: every program already
// carries this (weeklyVolModifiers), it was just never surfaced.
//
// Exercise *selection* is constant across weeks by design in this app — only
// sets/reps/intensity change — so a "week" here is (sets, reps, phase label),
// not a different set of movements. Programs without a semantic label use the
// honest neutral "Training" fallback from the shared phase resolver.
// =============================================================================
import { classifyPhase, resolveProgramPhase } from './phase.js';

/** Classify a week from its phase label into a kind used for tint + volume. */
export function classifyWeek(label) {
  return classifyPhase(label);
}

// Volume when a week carries no explicit set count — a sensible shape by kind.
const KIND_VOLUME = { deload: 35, taper: 45, peak: 70, intensify: 85, build: 70, work: 60 };

/**
 * Build the week-by-week timeline for a program.
 * @returns {{ week:number, label:string, sets:(number|null), reps:(string|number|null), volumeScore:number, kind:string, deload:boolean }[]}
 */
export function buildProgramTimeline(program) {
  const mods = (program && program.weeklyVolModifiers && typeof program.weeklyVolModifiers === 'object')
    ? program.weeklyVolModifiers : null;

  const total = Number(program?.durationWeeks || program?.totalWeeks)
    || (mods ? Object.keys(mods).length : 0)
    || 12;

  // Peak set count across the program → scales the volume bars honestly.
  let maxSets = 0;
  if (mods) {
    for (const m of Object.values(mods)) {
      const s = Number(m?.sets);
      if (Number.isFinite(s) && s > maxSets) maxSets = s;
    }
  }

  const rows = [];
  for (let i = 1; i <= total; i++) {
    const key = String(i);
    const mod = mods ? mods[key] : null;
    const phase = resolveProgramPhase(program, key);
    const label = phase.label;
    const kind = phase.kind;
    const sets = (mod && Number.isFinite(Number(mod.sets))) ? Number(mod.sets) : null;
    const reps = (mod && mod.reps != null) ? mod.reps : null;

    let volumeScore;
    if (sets != null && maxSets > 0) {
      volumeScore = Math.max(12, Math.round((sets / maxSets) * 100));
    } else {
      volumeScore = KIND_VOLUME[kind] ?? 60;
    }

    rows.push({ week: i, label, sets, reps, volumeScore, kind, deload: kind === 'deload' });
  }
  return rows;
}
