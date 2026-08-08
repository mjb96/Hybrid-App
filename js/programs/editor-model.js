// @ts-check
// Pure helpers for the custom-program editor. The stored program shape remains
// legacy-compatible (bare lift-name strings + week-wide modifiers); this module
// only gives the UI a safer, clearer view of that shape.

import { canonicalExerciseId, normaliseExerciseName } from '../exercises/catalog.js';
import { liftTarget } from '../engine.js';
import { getWeekModifier } from '../schema.js';

export const EDITOR_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
export const EDITOR_DAY_LABELS = Object.freeze({
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
});

// ── Editor undo (Phase 4C "direct and reversible") ───────────────────────────
//
// Interaction principle 5 prefers Undo over repeated confirmation dialogs, and
// the builder had the dialogs but no Undo — so removing an exercise, wiping a day
// to rest, or copying over a planned day each cost a modal and still could not be
// taken back.
//
// The captured draft is deliberately the WHOLE editable plan (`days` +
// `weeklyVolModifiers`) rather than the one field an action touches: a single
// shape is impossible to get subtly wrong per action, and the plan is seven days
// and a week table — cloning it is nothing next to a re-render.
//
// It captures the PLAN ONLY. Logged workouts live in `state.weeks` and are never
// part of a snapshot, so an undo can restore a template without ever rewriting
// training history.

/**
 * @param {any} program
 * @param {string} label  what was done, in the athlete's language
 * @returns {null | { label:string, days:any, weeklyVolModifiers:any }}
 */
export function captureProgramDraft(program, label) {
  if (!program) return null;
  return {
    label: String(label || 'Last change'),
    days: JSON.parse(JSON.stringify(program.days || {})),
    weeklyVolModifiers: JSON.parse(JSON.stringify(program.weeklyVolModifiers || {})),
  };
}

/**
 * Put a captured draft back. Clones again on the way in, so the snapshot stays
 * usable and later edits cannot reach back into it.
 * @returns {boolean} whether anything was restored
 */
export function restoreProgramDraft(program, snapshot) {
  if (!program || !snapshot?.days) return false;
  program.days = JSON.parse(JSON.stringify(snapshot.days));
  program.weeklyVolModifiers = JSON.parse(JSON.stringify(snapshot.weeklyVolModifiers || {}));
  return true;
}

export function isRunPlanned(value) {
  const text = String(value || '').trim();
  return !!text && !/^rest$/i.test(text) && !/^none$/i.test(text);
}

export function dayTrainingSummary(day) {
  const lifts = Array.isArray(day?.lifts)
    ? day.lifts.filter((name) => typeof name === 'string' && name.trim())
    : [];
  const hasRun = isRunPlanned(day?.runs);
  return {
    lifts: lifts.length,
    hasRun,
    training: lifts.length > 0 || hasRun,
    label: lifts.length && hasRun
      ? `${lifts.length} exercise${lifts.length === 1 ? '' : 's'} + run`
      : lifts.length
        ? `${lifts.length} exercise${lifts.length === 1 ? '' : 's'}`
        : hasRun ? 'Run' : 'Rest',
  };
}

export function programEditorSummary(program) {
  let strengthDays = 0;
  let runDays = 0;
  let totalExercises = 0;
  for (const key of EDITOR_DAYS) {
    const summary = dayTrainingSummary(program?.days?.[key]);
    if (summary.lifts) strengthDays++;
    if (summary.hasRun) runDays++;
    totalExercises += summary.lifts;
  }
  return { strengthDays, runDays, totalExercises };
}

function exerciseIdentity(name) {
  return canonicalExerciseId(name) || `custom:${normaliseExerciseName(name)}`;
}

export function validateProgramDraft(program) {
  const issues = [];
  if (!String(program?.name || '').trim()) {
    issues.push({ level: 'error', field: 'name', message: 'Add a program name.' });
  }

  let trainingDays = 0;
  for (const key of EDITOR_DAYS) {
    const day = program?.days?.[key] || {};
    const summary = dayTrainingSummary(day);
    if (summary.training) trainingDays++;
    const rawLifts = Array.isArray(day.lifts) ? day.lifts : [];
    if (rawLifts.some((name) => !String(name || '').trim())) {
      issues.push({ level: 'error', day: key, message: `${EDITOR_DAY_LABELS[key]} has a blank exercise.` });
    }
    const seen = new Set();
    for (const name of rawLifts.filter((item) => String(item || '').trim())) {
      const id = exerciseIdentity(name);
      if (seen.has(id)) {
        issues.push({ level: 'error', day: key, message: `${EDITOR_DAY_LABELS[key]} contains ${String(name).trim()} twice.` });
        break;
      }
      seen.add(id);
    }
    if (/^rest$/i.test(String(day.title || '').trim()) && summary.training) {
      issues.push({ level: 'warning', day: key, message: `${EDITOR_DAY_LABELS[key]} is named Rest but contains training.` });
    }
  }
  if (!trainingDays) {
    issues.push({ level: 'error', field: 'schedule', message: 'Add at least one training day.' });
  }
  return issues;
}

export function copyProgramDay(program, sourceKey, targetKey) {
  if (!program?.days || !EDITOR_DAYS.includes(sourceKey) || !EDITOR_DAYS.includes(targetKey) || sourceKey === targetKey) {
    return false;
  }
  const source = program.days[sourceKey];
  if (!source || typeof source !== 'object') return false;
  // A whole-day deep copy carries desc + workoutPreview together with lifts, so
  // the copied day's duplicated representations stay internally consistent.
  program.days[targetKey] = JSON.parse(JSON.stringify(source));
  return true;
}

// =============================================================================
// CANONICAL EXERCISE MUTATIONS
//
// `day.lifts` is the single source of truth for exercise names and order on
// every surface. But some catalog days ALSO duplicate exercise information in
// `day.desc` ("Back Squat (4×5-8). …") and `day.workoutPreview.exercises`.
// Editing only `day.lifts` left those duplicates stale, so a preview could keep
// showing a removed/renamed exercise (and a broad desc parser could even render
// narrative prose as an exercise). These central helpers own every structural
// edit and keep the duplicated representations aligned — or, where a safe update
// can't be proven, leave the text alone (it is never authoritative over lifts).
// =============================================================================

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Find the exact "<name> (<spec>)" prescription label for a KNOWN current lift
// inside a day description. Anchored on the labelled "(…)" form so narrative
// prose ("Squat + hinge foundation.") can never match. Returns null when the
// lift has no explicit label in the description.
export function findDescPrescriptionLabel(desc, name) {
  const text = String(desc || '');
  const lift = String(name || '').trim();
  if (!text || !lift) return null;
  try {
    const rx = new RegExp(escapeRegExp(lift) + '\\s*\\(([^)]*)\\)');
    const m = text.match(rx);
    if (!m) return null;
    return { full: m[0], spec: m[1], index: m.index ?? -1 };
  } catch { return null; }
}

// True when two exercise labels refer to the same exercise identity. Uses the
// canonical resolver first, then a normalised-name fall back for custom names.
function sameExerciseIdentity(a, b) {
  const aId = canonicalExerciseId(a);
  const bId = canonicalExerciseId(b);
  if (aId && bId) return aId === bId;
  return normaliseExerciseName(a) === normaliseExerciseName(b);
}

function previewExercises(day) {
  const list = day?.workoutPreview?.exercises;
  return Array.isArray(list) ? list : null;
}

// Rename the structured-preview entry that matches `oldName` to `newName`,
// preserving its other fields (sets/reps/notes). Only the FIRST identity match
// is touched, so an unrelated entry is never rewritten.
function renamePreviewExercise(day, oldName, newName) {
  const list = previewExercises(day);
  if (!list) return;
  const entry = list.find((ex) => ex && typeof ex.exercise === 'string' && sameExerciseIdentity(ex.exercise, oldName));
  if (entry) entry.exercise = newName;
}

function removePreviewExercise(day, name) {
  const list = previewExercises(day);
  if (!list) return;
  const idx = list.findIndex((ex) => ex && typeof ex.exercise === 'string' && sameExerciseIdentity(ex.exercise, name));
  if (idx >= 0) list.splice(idx, 1);
}

// Replace the exact "<oldName> (<spec>)" label in the description with
// "<newName> (<spec>)", preserving the prescription and leaving all surrounding
// narrative untouched. A no-op when the old lift had no labelled prescription.
function renameDescLabel(day, oldName, newName) {
  if (typeof day?.desc !== 'string' || !day.desc) return;
  const label = findDescPrescriptionLabel(day.desc, oldName);
  if (!label) return;
  const spec = label.spec != null ? `(${label.spec})` : '';
  day.desc = day.desc.slice(0, label.index)
    + `${newName} ${spec}`.trim()
    + day.desc.slice(label.index + label.full.length);
}

/**
 * Replace the exercise at `index` in `day.lifts`, keeping its workout position
 * and synchronising the duplicated preview entry and description label so the
 * old exercise cannot reappear and the new one inherits the old slot's
 * prescription where the description carried one.
 * @returns {boolean} whether the replacement was applied.
 */
export function replaceProgramExercise(day, index, replacement) {
  if (!day || !Array.isArray(day.lifts)) return false;
  const old = day.lifts[index];
  if (typeof old !== 'string') return false;
  const next = String(replacement || '').trim();
  if (!next) return false;
  day.lifts[index] = next;
  renamePreviewExercise(day, old, next);
  renameDescLabel(day, old, next);
  return true;
}

/**
 * Append an exercise to the end of `day.lifts`.
 * @returns {boolean} whether the exercise was added.
 */
export function addProgramExercise(day, name) {
  if (!day) return false;
  if (!Array.isArray(day.lifts)) day.lifts = [];
  const next = String(name || '').trim();
  if (!next) return false;
  day.lifts.push(next);
  // The structured preview and description are only ever a NAME fallback when
  // `day.lifts` is empty; a new lift needs no synthetic prescription entry, and
  // fabricating one risks disagreeing with the engine's resolved target.
  return true;
}

/**
 * Remove the exercise at `index` from `day.lifts` and drop its aligned preview
 * entry so a stale structured-preview row can never reappear. The description's
 * narrative is intentionally left untouched (it is never authoritative over
 * `day.lifts`), so removing a lift can't corrupt surrounding prose.
 * @returns {boolean} whether an exercise was removed.
 */
export function removeProgramExercise(day, index) {
  if (!day || !Array.isArray(day.lifts)) return false;
  const removed = day.lifts[index];
  if (typeof removed !== 'string') return false;
  day.lifts.splice(index, 1);
  removePreviewExercise(day, removed);
  return true;
}

/**
 * Move the exercise at `fromIndex` to `toIndex` within `day.lifts`, keeping the
 * structured preview ordered to match so the two representations never disagree.
 * @returns {boolean} whether the move was applied.
 */
export function moveProgramExercise(day, fromIndex, toIndex) {
  if (!day || !Array.isArray(day.lifts)) return false;
  const len = day.lifts.length;
  if (fromIndex < 0 || fromIndex >= len || toIndex < 0 || toIndex >= len || fromIndex === toIndex) return false;
  const [item] = day.lifts.splice(fromIndex, 1);
  day.lifts.splice(toIndex, 0, item);
  reorderPreviewToLifts(day);
  return true;
}

// Reorder the structured preview to follow `day.lifts`. Entries that no longer
// match any current lift are dropped (they would otherwise be stale); entries
// are kept as-is otherwise (prescription data preserved).
function reorderPreviewToLifts(day) {
  const list = previewExercises(day);
  if (!list) return;
  const used = new Array(list.length).fill(false);
  const ordered = [];
  for (const name of day.lifts) {
    const idx = list.findIndex((ex, i) => !used[i] && ex && typeof ex.exercise === 'string' && sameExerciseIdentity(ex.exercise, name));
    if (idx >= 0) { used[idx] = true; ordered.push(list[idx]); }
  }
  day.workoutPreview.exercises = ordered;
}

/**
 * Turn a day into a rest day: clear its lifts, run and the duplicated
 * exercise representations (desc/workoutPreview) so nothing stale can leak into
 * a later preview if the day is turned back into a training day.
 */
export function makeProgramDayRest(day) {
  if (!day) return;
  day.title = 'Rest';
  day.runs = 'Rest';
  day.lifts = [];
  day.desc = '';
  if (day.workoutPreview) delete day.workoutPreview;
}

export function previewProgramWeek(program, weekKey = '1') {
  const modifier = getWeekModifier(program, weekKey);
  return EDITOR_DAYS.map((key) => {
    const day = program?.days?.[key] || {};
    const lifts = (Array.isArray(day.lifts) ? day.lifts : [])
      .filter((name) => typeof name === 'string' && name.trim())
      .map((name) => ({ name, ...liftTarget(day.desc, name, modifier) }));
    return {
      key,
      label: EDITOR_DAY_LABELS[key],
      title: String(day.title || '').trim() || (lifts.length || isRunPlanned(day.runs) ? 'Training' : 'Rest'),
      run: isRunPlanned(day.runs) ? String(day.runs).trim() : null,
      lifts,
    };
  });
}
