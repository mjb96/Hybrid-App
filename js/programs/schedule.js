// @ts-check
// =============================================================================
// PROGRAM SCHEDULE + PROGRESSION SUMMARY (js/programs/schedule.js)
//
// Pure, DOM-free helpers that turn a program's REAL data into the two things a
// user needs to understand a training block without opening every day:
//
//   • buildWeekSchedule(program, week) — the week-at-a-glance: each defined day
//     with a truthful one-line summary (exercise count + total working sets for
//     strength, the actual run prescription string for running). Working-set
//     counts come from liftTarget() for THAT week's modifier, so they shift with
//     the plan (e.g. a deload shows fewer sets) — the same source the cockpit
//     uses, never the catalogue's decorative workoutPreview rpe/rest.
//
//   • summarizeProgression(program) — groups the week timeline into the program's
//     own named phases (Foundation → Build → Deload → Peak → Taper …) with an
//     honest headline. Falls back to a truthful "same schedule, load-driven"
//     message when the block has no week-to-week prescription change.
//
//   • diffWeekPrescription(program, a, b) — what actually changed between two
//     weeks (working sets, reps, reduced-load), from the week modifiers. Never
//     compares exercise order or ids.
//
// Running distance/mileage is NOT stored per-week in this app's single-week
// day-template model, so we never fabricate a per-week distance progression —
// running progression is expressed through the phase labels the program carries.
// =============================================================================
import { getWeekModifier } from '../schema.js';
import { liftTarget } from '../engine.js';
import { buildProgramTimeline, classifyWeek } from './timeline.js';
import { programHasLifts } from './compare.js';

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DAY_SHORT = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const KIND_LABEL = { deload: 'Deload', peak: 'Peak', taper: 'Taper', intensify: 'Intensity', build: 'Build', work: 'Work' };

/** A day is rest when it has no lifts and no (non-"Rest") run. */
function isRestDay(day) {
  return !day || (!(day.lifts && day.lifts.length) && (!day.runs || day.runs === 'Rest'));
}

const _lifts = (day) => (day && Array.isArray(day.lifts) ? day.lifts : []).filter(n => typeof n === 'string' && n.trim());

/**
 * Build the ordered week-at-a-glance schedule for a program week.
 * @param {any} program  resolved program (days{} + weeklyVolModifiers)
 * @param {number} week
 * @returns {{ dayKey:string, dayName:string, dayShort:string, title:string, badge:string,
 *   color:string, type:'strength'|'running'|'mixed'|'rest', summary:string, isRest:boolean,
 *   interactive:boolean }[]}
 */
export function buildWeekSchedule(program, week = 1) {
  const days = (program && program.days) || {};
  const mod = getWeekModifier(program, week) || {};

  const out = [];
  for (const key of DAY_ORDER) {
    const day = days[key];
    if (!day) continue; // program defines only some days — mirror renderDaySplit

    const rest = isRestDay(day);
    const lifts = _lifts(day);
    const hasRun = !!(day.runs && day.runs !== 'Rest');
    /** @type {'strength'|'running'|'mixed'|'rest'} */
    const type = rest ? 'rest' : (lifts.length && hasRun ? 'mixed' : lifts.length ? 'strength' : hasRun ? 'running' : 'rest');

    let summary;
    if (rest) {
      summary = 'Rest day';
    } else {
      const parts = [];
      if (lifts.length) {
        let totalSets = 0;
        for (const n of lifts) {
          const t = liftTarget(day.desc, n, mod);
          const s = Number(t && t.sets);
          if (Number.isFinite(s)) totalSets += s;
        }
        parts.push(`${lifts.length} exercise${lifts.length !== 1 ? 's' : ''}`);
        if (totalSets > 0) parts.push(`${totalSets} working sets`);
      }
      if (hasRun) parts.push(String(day.runs).trim());
      summary = parts.join(' · ') || 'Session details unavailable';
    }

    out.push({
      dayKey: key,
      dayName: DAY_NAMES[key],
      dayShort: DAY_SHORT[key],
      title: (day.title && String(day.title).trim()) || DAY_NAMES[key],
      badge: (day.badge && String(day.badge).trim()) || '',
      color: day.color || '',
      type, summary, isRest: rest, interactive: !rest,
    });
  }
  return out;
}

/** Phase spec (e.g. "4 × 6") when a phase's weeks share a set/rep prescription. */
function phaseSpec(rows, hasLifts) {
  if (!hasLifts) return '';
  const sets = new Set(rows.map(r => r.sets));
  const reps = new Set(rows.map(r => (r.reps == null ? null : String(r.reps))));
  if (sets.size === 1 && reps.size === 1) {
    const s = rows[0].sets, r = rows[0].reps;
    if (s != null && r != null) return `${s} × ${r}`;
    if (s != null) return `${s} sets`;
  } else if (sets.size === 1 && rows[0].sets != null) {
    return `${rows[0].sets} sets`;
  }
  return '';
}

/**
 * Summarise how the program progresses, grouped into its own named phases.
 * @param {any} program
 * @returns {{ hasVariation:boolean, headline:string, weeks:number,
 *   phases:{ from:number, to:number, label:string, kind:string, deload:boolean, spec:string }[] }}
 */
export function summarizeProgression(program) {
  const timeline = buildProgramTimeline(program);
  const weeks = timeline.length;
  const hasLifts = programHasLifts(program);

  // Group consecutive weeks that share a phase label (the program's own wording,
  // e.g. "Strength Block"), falling back to the classified kind.
  const groups = [];
  for (const row of timeline) {
    const label = (row.label && row.label.trim()) || KIND_LABEL[row.kind] || 'Training';
    const last = groups[groups.length - 1];
    if (last && last.label === label) { last.to = row.week; last.rows.push(row); }
    else groups.push({ from: row.week, to: row.week, label, kind: row.kind, deload: row.deload, rows: [row] });
  }

  const phases = groups.map(g => ({
    from: g.from, to: g.to, label: g.label, kind: g.kind, deload: g.deload,
    spec: phaseSpec(g.rows, hasLifts),
  }));

  const distinct = new Set(timeline.map(r => (r.label && r.label.trim()) || r.kind));
  const hasVariation = distinct.size > 1;

  let headline;
  if (!weeks) {
    headline = 'Duration not specified for this program.';
  } else if (!hasVariation) {
    headline = 'The weekly schedule stays the same across the block — progression comes from adding load as you get stronger, not from changing the plan.';
  } else {
    const deloadWeeks = timeline.filter(r => r.deload).map(r => r.week);
    const hasTaper = timeline.some(r => r.kind === 'taper');
    const hasPeak = timeline.some(r => r.kind === 'peak');
    const bits = [`${weeks}-week block in ${phases.length} phase${phases.length !== 1 ? 's' : ''}`];
    if (deloadWeeks.length === 1) bits.push(`a deload in Week ${deloadWeeks[0]}`);
    else if (deloadWeeks.length > 1) bits.push(`deloads in Weeks ${deloadWeeks.join(' & ')}`);
    if (hasPeak) bits.push('peak work near the end');
    if (hasTaper) bits.push('a taper to finish');
    headline = bits.join(' · ') + '.';
  }

  return { hasVariation, headline, weeks, phases };
}

/**
 * Concise, truthful list of what changed in the prescription between two weeks.
 * Uses the week modifiers only — never exercise order or ids. For lift-less
 * (running) blocks, set/rep numbers are an internal volume hack, so we compare
 * the phase label instead of showing misleading "sets" deltas.
 * @returns {string[]}
 */
export function diffWeekPrescription(program, weekA, weekB) {
  if (!weekA || !weekB || Number(weekA) === Number(weekB)) return ['No prescription changes'];
  const a = getWeekModifier(program, weekA) || {};
  const b = getWeekModifier(program, weekB) || {};
  const hasLifts = programHasLifts(program);
  const lines = [];

  if (hasLifts) {
    const sA = Number(a.sets), sB = Number(b.sets);
    if (Number.isFinite(sA) && Number.isFinite(sB) && sA !== sB) {
      lines.push(`Working sets per lift: ${sA} → ${sB}`);
    }
    const rA = a.reps, rB = b.reps;
    if (rA != null && rB != null && String(rA) !== String(rB)) {
      lines.push(`Reps: ${rA} → ${rB}`);
    }
  }

  if (classifyWeek(b.intensityLabel) === 'deload') lines.push('Reduced-load week');
  else if (a.intensityLabel && b.intensityLabel && a.intensityLabel !== b.intensityLabel) {
    lines.push(`Phase: ${a.intensityLabel} → ${b.intensityLabel}`);
  }

  if (!lines.length) lines.push('No prescription changes');
  return lines;
}
