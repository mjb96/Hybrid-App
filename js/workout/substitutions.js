// @ts-check
// Exercise substitutions derive from the canonical catalogue. This keeps
// identity, movement and equipment rules aligned with search and analytics.
import { EXERCISES, resolveExercise } from '../exercises/catalog.js';

const PATTERN_BY_MOVEMENT = Object.freeze({
  squat: 'squat', lunge: 'squat', hinge: 'hinge',
  horizontal_push: 'hpush', vertical_push: 'vpush',
  horizontal_pull: 'hpull', vertical_pull: 'vpull',
  elbow_flexion: 'biceps', elbow_extension: 'triceps',
  core: 'core', carry: 'core',
});

function patternFor(item) {
  if (!item) return null;
  if (item.movement === 'shoulder_isolation') {
    if (item.muscles?.rear_delts) return 'hpull';
    if (item.muscles?.side_delts) return 'lateral';
    return 'vpush';
  }
  return PATTERN_BY_MOVEMENT[item.movement] || null;
}

/** Classify a known exercise or explicit historical alias. */
export function classifyMovement(name) {
  return patternFor(resolveExercise(name));
}

const SETTING_EQUIPMENT = new Set([
  'barbell', 'rack', 'dumbbells', 'cables', 'pullupBar', 'bands', 'kettlebells', 'ezBar',
]);

function hasEquipment(required, available) {
  const tracked = (required || []).filter((key) => SETTING_EQUIPMENT.has(key));
  if (!tracked.length) return true;
  if (!available || Object.keys(available).length === 0) return true;
  return tracked.every((key) => available[key]);
}

/**
 * Ranked substitutes from the same practical movement family. Canonical IDs
 * prevent the current exercise returning under a different alias.
 */
export function getSubstitutions(name, available = {}, limit = 6) {
  const source = resolveExercise(name);
  const pattern = patternFor(source);
  if (!source || !pattern) return [];
  return EXERCISES
    .filter((candidate) => candidate.id !== source.id)
    .filter((candidate) => candidate.category !== 'conditioning')
    .filter((candidate) => patternFor(candidate) === pattern)
    .filter((candidate) => hasEquipment(candidate.equipment, available))
    .slice(0, limit)
    .map((candidate) => ({
      name: candidate.name,
      pattern,
      equip: candidate.equipment.filter((key) => key !== 'bodyweight'),
      bodyweight: candidate.bodyweight,
    }));
}
