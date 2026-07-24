// @ts-check
// =============================================================================
// PROGRAM → TEXT (GPT-friendly export)
//
// A pure, DOM-free serializer that turns a resolved program object into clean,
// deterministic Markdown a person can paste into ChatGPT for review. It follows
// the same canonical rules as the rest of the editor:
//   • day.lifts owns exercise NAMES and ORDER — never day.desc;
//   • per-lift targets use liftTarget (the SAME resolver as the preview/cockpit);
//   • the caller passes the ALREADY-RESOLVED program (personal wins over catalog);
//   • unknown custom exercise names are kept verbatim, never dropped;
//   • no personal history/health/account data is included — only the plan.
//
// It never touches the DOM, clipboard, or app state, so it is fully unit-testable.
// =============================================================================

import { liftTarget } from '../engine.js';
import { getWeekModifier } from '../schema.js';
import { DIFFICULTY_LABELS } from './catalog.js';
import { weekKeys, isDeloadWeek } from './progression.js';
import { EDITOR_DAYS, EDITOR_DAY_LABELS, dayTrainingSummary, isRunPlanned } from './editor-model.js';
import { equipmentLabel } from '../exercises/catalog.js';

// The instruction block prepended in "AI review" mode. Kept as an exported
// constant so both the formatter and its tests reference one source of truth.
export const PROGRAM_REVIEW_HEADER = [
  'Please review and improve the training program below.',
  '',
  'Keep the listed equipment constraints. Assess:',
  '- exercise selection and redundancy;',
  '- muscle-group balance;',
  '- weekly volume and frequency;',
  '- fatigue and recovery;',
  '- progression;',
  '- session length;',
  '- suitability for the stated goal.',
  '',
  'Explain any recommended changes and then provide a revised version.',
].join('\n');

// Program-level equipment tokens use a slightly broader vocabulary than the
// exercise catalogue (e.g. running-shoes, ski-erg). Fall back to a de-kebabed
// label so an unknown token still reads cleanly.
const PROGRAM_EQUIPMENT_LABELS = {
  barbell: 'Barbell', ezbar: 'EZ bar', 'ez-bar': 'EZ bar', rack: 'Squat rack',
  bench: 'Adjustable bench', dumbbells: 'Dumbbells', bands: 'Resistance bands',
  cables: 'Cable machine', machine: 'Machine', 'pull-up-bar': 'Pull-up bar',
  pullupbar: 'Pull-up bar', kettlebell: 'Kettlebell', kettlebells: 'Kettlebells',
  'running-shoes': 'Running shoes', 'ski-erg': 'Ski erg', 'rowing-machine': 'Rowing machine',
  sled: 'Sled', sandbag: 'Sandbag', treadmill: 'Treadmill',
};

function labelProgramEquipment(token) {
  const key = String(token || '').trim();
  if (!key) return '';
  return PROGRAM_EQUIPMENT_LABELS[key.toLowerCase()]
    || equipmentLabel(key) // catalogue camelCase keys (ezBar → EZ bar)
    || key.replace(/[-_]/g, ' ');
}

function titleCaseGoal(value) {
  return String(value || '').replace(/[-_]/g, ' ').trim();
}

function programGoalText(program) {
  const goals = Array.isArray(program?.goals) ? program.goals.filter(Boolean) : [];
  if (goals.length) {
    const readable = goals.map(titleCaseGoal);
    const first = readable[0].charAt(0).toUpperCase() + readable[0].slice(1);
    return [first, ...readable.slice(1)].join(', ');
  }
  const focus = String(program?.dossier?.focus || '').trim();
  return focus;
}

// The session-notes line: the program-authored NARRATIVE only. Anything from the
// first per-lift "(N×…)" prescription onward is dropped, so a stale exercise name
// buried in the description can never leak into the export (the exercise list is
// owned by day.lifts). Returns '' when there is no narrative prefix.
export function extractSessionNotes(desc) {
  const text = String(desc || '').replace(/\s+/g, ' ').trim();
  if (!text || /^rest\.?$/i.test(text)) return '';
  const specIdx = text.search(/\(\s*\d+\s*[×xX]/);
  if (specIdx < 0) return text; // no per-lift labels: the whole desc is narrative
  const before = text.slice(0, specIdx);
  // Keep only up to the sentence boundary before the first labelled exercise, so
  // the exercise name that carries the label is not mistaken for narrative.
  const cut = before.lastIndexOf('. ');
  return cut >= 0 ? before.slice(0, cut + 1).trim() : '';
}

function repsLabel(reps) {
  const value = reps == null ? '' : String(reps).trim();
  if (!value) return '';
  if (/^max/i.test(value)) return value; // "max reps"
  return `${value} reps`;
}

function formatLiftLine(index, name, target) {
  const sets = target?.sets != null ? `${target.sets} set${Number(target.sets) === 1 ? '' : 's'}` : '';
  const reps = repsLabel(target?.reps);
  const spec = sets && reps ? `${sets} × ${reps}` : (sets || reps);
  return spec ? `${index}. ${name} — ${spec}` : `${index}. ${name}`;
}

function renderDay(program, dayKey, modifier) {
  const day = program?.days?.[dayKey] || {};
  const summary = dayTrainingSummary(day);
  const label = EDITOR_DAY_LABELS[dayKey];
  const title = String(day.title || '').trim();

  if (!summary.training) {
    // Rest days are kept succinct but never omitted — layout/recovery matter.
    return `### ${label} — ${title && !/^rest$/i.test(title) ? title : 'Rest'}`;
  }

  const lines = [`### ${label} — ${title || 'Training'}`, ''];

  const lifts = (Array.isArray(day.lifts) ? day.lifts : [])
    .filter((n) => typeof n === 'string' && n.trim());
  lifts.forEach((name, i) => {
    lines.push(formatLiftLine(i + 1, name, liftTarget(day.desc, name, modifier)));
  });

  if (lifts.length) lines.push('');
  // Cardio: an explicit prescription for run days; "Rest" for pure strength days
  // (never label Rest as a running workout).
  lines.push(isRunPlanned(day.runs) ? `Cardio: ${String(day.runs).trim()}` : 'Cardio: Rest');

  const notes = extractSessionNotes(day.desc);
  if (notes) lines.push(`Session notes: ${notes}`);

  return lines.join('\n');
}

function renderProgression(program) {
  const lines = ['## Week-by-Week Progression', ''];
  for (const wk of weekKeys(program)) {
    const mod = program?.weeklyVolModifiers?.[wk] || {};
    const rows = [`Week ${wk}:`];
    if (mod.sets != null && mod.sets !== '') rows.push(`- Sets: ${mod.sets}`);
    if (mod.reps != null && mod.reps !== '') rows.push(`- Reps: ${mod.reps}`);
    const phase = String(mod.intensityLabel || '').trim();
    if (phase) rows.push(`- Phase: ${phase}`);
    if (isDeloadWeek(mod)) rows.push('- Deload week');
    lines.push(rows.join('\n'));
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Serialize a resolved program into deterministic Markdown (no AI header).
 * @param {any} program the ALREADY-RESOLVED program (personal wins over catalog)
 * @param {{ activeWeek?: number|string|null, sourceName?: string|null }} [context]
 */
export function serializeProgram(program, context = {}) {
  if (!program || typeof program !== 'object') return '';
  const blocks = [];

  blocks.push(`# ${String(program.name || 'Training Program').trim()}`);

  // ── Metadata (each line omitted when empty) ──────────────────────────────
  const meta = [];
  const goal = programGoalText(program);
  if (goal) meta.push(`Goal: ${goal}`);
  const difficulty = DIFFICULTY_LABELS[program.difficulty]?.label;
  if (difficulty) meta.push(`Level: ${difficulty}`);
  const weeks = parseInt(program.totalWeeks ?? program.durationWeeks, 10);
  if (Number.isFinite(weeks) && weeks > 0) meta.push(`Length: ${weeks} week${weeks === 1 ? '' : 's'}`);
  const sessions = parseInt(program.sessionsPerWeek, 10);
  if (Number.isFinite(sessions) && sessions > 0) meta.push(`Sessions per week: ${sessions}`);
  const equipment = Array.isArray(program.equipment)
    ? program.equipment.map(labelProgramEquipment).filter(Boolean)
    : [];
  if (equipment.length) meta.push(`Equipment: ${equipment.join(', ')}`);
  if (meta.length) blocks.push(meta.join('\n'));

  // ── Weekly schedule ──────────────────────────────────────────────────────
  const modifier = getWeekModifier(program, 1) || {};
  const dayBlocks = EDITOR_DAYS.map((key) => renderDay(program, key, modifier));
  blocks.push(['## Weekly Schedule', '', dayBlocks.join('\n\n')].join('\n'));

  // ── Progression ──────────────────────────────────────────────────────────
  if (weekKeys(program).length) blocks.push(renderProgression(program));

  // ── Additional notes (philosophy, active week, source) ───────────────────
  const notes = [];
  const philosophy = String(program?.dossier?.philosophy || program?.description || '').trim();
  if (philosophy) notes.push(`- ${philosophy}`);
  const sourceName = String(context.sourceName || '').trim();
  if (sourceName) notes.push(`- Adapted from: ${sourceName}`);
  const activeWeek = context.activeWeek != null ? parseInt(String(context.activeWeek), 10) : null;
  if (Number.isFinite(activeWeek) && activeWeek > 0) {
    notes.push(`- Current active week: Week ${activeWeek}`);
    notes.push('- Untouched future workouts follow this definition.');
  }
  if (notes.length) blocks.push(['## Additional Program Notes', '', notes.join('\n')].join('\n'));

  return blocks.join('\n\n') + '\n';
}

/**
 * Build the full copyable text for a program.
 * @param {any} program the ALREADY-RESOLVED program (never the catalog source)
 * @param {{ mode?: 'ai'|'plain', activeWeek?: number|string|null, sourceName?: string|null }} [options]
 */
export function buildProgramExportText(program, options = {}) {
  const body = serializeProgram(program, options);
  if (!body) return '';
  if (options.mode === 'plain') return body;
  return `${PROGRAM_REVIEW_HEADER}\n\n${body}`;
}
