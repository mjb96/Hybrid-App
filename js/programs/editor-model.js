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
  program.days[targetKey] = JSON.parse(JSON.stringify(source));
  return true;
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
