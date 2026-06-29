// @ts-check
// =============================================================================
// PROGRAM CATALOG — aggregator. Individual programs live in ./catalog/*.js
// Add a new program by creating/editing the relevant category file below.
// Workout execution data lives in js/constants.js (PROGRAMS object) — preserved.
// =============================================================================

import hybridPrograms        from './catalog/hybrid.js';
import strengthPrograms      from './catalog/strength.js';
import hypertrophyPrograms   from './catalog/hypertrophy.js';
import runningPrograms       from './catalog/running.js';
import fitnessPrograms       from './catalog/fitness.js';
import hyroxPrograms         from './catalog/hyrox.js';

export const CATEGORIES = {
  hybrid:          { label: 'Hybrid',           icon: '⚡', color: '#8b5cf6' },
  strength:        { label: 'Strength',          icon: '🏋️', color: '#ef4444' },
  hypertrophy:     { label: 'Hypertrophy',       icon: '💪', color: '#3b82f6' },
  powerlifting:    { label: 'Powerlifting',      icon: '🔱', color: '#dc2626' },
  running:         { label: 'Running',           icon: '🏃', color: '#22d3ee' },
  hyrox:           { label: 'Hyrox',             icon: '🏟️', color: '#7c3aed' },
  endurance:       { label: 'Endurance',         icon: '🫀', color: '#10b981' },
  body_composition:{ label: 'Body Composition',  icon: '🔥', color: '#f59e0b' },
  general_fitness: { label: 'General Fitness',   icon: '🎯', color: '#06b6d4' },
  tactical:        { label: 'Tactical',          icon: '🎖️', color: '#84cc16' },
  bodybuilding:    { label: 'Bodybuilding',      icon: '🏛️', color: '#e879f9' },
  triathlon:       { label: 'Triathlon',         icon: '🏊', color: '#0ea5e9' },
  mobility:        { label: 'Mobility',          icon: '🧘', color: '#86efac' },
  functional:      { label: 'Functional',        icon: '⚙️', color: '#fb923c' },
  sport_specific:  { label: 'Sport-Specific',    icon: '🎽', color: '#38bdf8' },
};

export const DIFFICULTY_LABELS = {
  beginner:     { label: 'Beginner',     dots: 1, color: '#10b981' },
  intermediate: { label: 'Intermediate', dots: 2, color: '#f59e0b' },
  advanced:     { label: 'Advanced',     dots: 3, color: '#ef4444' },
  elite:        { label: 'Elite',        dots: 4, color: '#dc2626' },
};

export const PROGRAM_CATALOG = [
  ...hybridPrograms,
  ...strengthPrograms,
  ...hypertrophyPrograms,
  ...runningPrograms,
  ...fitnessPrograms,
  ...hyroxPrograms,
];

// Quick lookup map by ID
export const CATALOG_MAP = Object.fromEntries(
  PROGRAM_CATALOG.map(p => [p.id, p])
);

// Get catalog entry for a program ID
export function getCatalogEntry(id) {
  return CATALOG_MAP[id] || null;
}
