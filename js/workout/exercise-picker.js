// @ts-check
// =============================================================================
// EXERCISE SELECTION — the add-exercise library and the in-session swap.
//
// Split out of js/workout.js (2,670 lines, 44 exports). This is the roadmap's
// "exercise selection" seam: choosing what goes into today's session, as
// distinct from rendering it, logging it or finishing it.
//
// HOW IT REACHES THE APP
// State, the selected day and saving come from ./context.js, not from
// workout.js — importing workout.js here would create a cycle, since workout.js
// imports this module. `rerenderWorkout()` is the same story for redrawing the
// cockpit: workout.js registers its own renderWorkout with the context and this
// module asks for a redraw without owning how one happens.
//
// `weightUnitLabel` moved to ./units.js for the same reason: workout.js reads it
// too, so neither side can own it.
//
// WHAT STAYED BEHIND
// `renderExerciseLibraryList` is exported because workout.js's `change` router
// re-renders the list when a filter select changes. That router is the next thing
// worth moving; until then this export is the seam between them, and naming it
// (rather than reaching back into a private) is what keeps the direction clear.
// =============================================================================
import { getProgramById, saveNewCustomExerciseToLibrary, showToast } from '../state.js';
import { escapeHtml } from '../util.js';
import { isE1rmExercise } from '../strength/e1rm.js';
import {
  browseExercises, equipmentLabel, exerciseStatForName, EXERCISE_CATEGORY_LABELS,
} from '../exercises/catalog.js';
import { activeWorkoutDay, activeWorkoutWeekKey, oneOffBlueprint } from './one-off-session.js';
import { applyExerciseSwap } from '../workout-order.js';
import { getSubstitutions } from './substitutions.js';
import {
  getState as _getState,
  getSelectedDay as _getSelectedDay,
  saveState as _saveState,
  rerenderWorkout,
} from './context.js';
import { weightUnitLabel } from './units.js';


/**
 * Best estimated 1RM on record for a lift. `allTimeMax` is derived from the
 * stored sets (so edits and deletions propagate); `legacyMax` is rescued
 * pre-catalogue history whose source sets are not in state.weeks.
 */
function _bestKnownE1rm(appState, name) {
  const stat = exerciseStatForName(appState?.exerciseStats, name);
  return Math.max(Number(stat?.allTimeMax) || 0, Number(stat?.legacyMax) || 0);
}

function _exChip(item, appState) {
  const pr = isE1rmExercise(item.name) ? _bestKnownE1rm(appState, item.name) : 0;
  const prStr = pr ? `<span class="el-pr">${Math.round(pr)}${weightUnitLabel(appState)} PR</span>` : '';
  const meta = `${item.movement.replaceAll('_', ' ')} · ${item.equipment.map(equipmentLabel).join(', ')}`;
  return `<div class="el-exercise-row">
    <button class="el-chip tactile-scale" data-action="el-pick" data-exname="${escapeHtml(item.name)}">
      <span class="el-chip-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(meta)}</small></span>${prStr}
    </button>
    <button class="el-info-btn" data-action="el-info" data-exname="${escapeHtml(item.name)}" aria-label="View details for ${escapeHtml(item.name)}">i</button>
  </div>`;
}

function _customExChip(name, appState) {
  const pr = isE1rmExercise(name) ? _bestKnownE1rm(appState, name) : 0;
  const prStr = pr ? `<span class="el-pr">${Math.round(pr)}${weightUnitLabel(appState)} PR</span>` : '';
  return `<div class="el-exercise-row el-exercise-row--custom"><button class="el-chip tactile-scale" data-action="el-pick" data-exname="${escapeHtml(name)}"><span class="el-chip-copy"><strong>${escapeHtml(name)}</strong><small>Custom exercise</small></span>${prStr}</button></div>`;
}

export function renderExerciseLibraryList(query = '') {
  const container = document.getElementById('elList');
  if (!container) return;
  const appState = _getState();
  const q = String(query || '').trim();
  const category = /** @type {HTMLSelectElement|null} */ (document.getElementById('elCategoryFilter'))?.value || '';
  const equipment = /** @type {HTMLSelectElement|null} */ (document.getElementById('elEquipmentFilter'))?.value || '';
  const muscleGroup = /** @type {HTMLSelectElement|null} */ (document.getElementById('elMuscleFilter'))?.value || '';
  const matches = browseExercises({ query: q, category, equipment, muscleGroup }, 500);
  // Custom exercises carry no catalogue muscle data, so a muscle filter cannot
  // honestly include them — same reasoning as the existing category/equipment
  // filters. They stay first-class whenever no such filter is applied.
  const customMatches = !category && !equipment && !muscleGroup
    ? (appState.customExercises || []).filter((name) => !q || name.toLowerCase().includes(q.toLowerCase()))
    : [];
  let html = '';

  if (!matches.length && !customMatches.length) {
    html = '<div class="el-empty">No matches. Try another search or clear a filter.</div>';
  } else if (q || category || equipment || muscleGroup) {
    html = matches.map((item) => _exChip(item, appState)).join('');
    if (customMatches.length) {
      html += '<div class="el-cat-label">⭐ Custom</div>';
      html += [...customMatches].sort().map((name) => _customExChip(name, appState)).join('');
    }
  } else {
    for (const categoryKey of Object.keys(EXERCISE_CATEGORY_LABELS)) {
      const items = matches.filter((item) => item.category === categoryKey);
      if (!items.length) continue;
      html += `<div class="el-cat-label">${EXERCISE_CATEGORY_LABELS[categoryKey]}</div>`;
      html += items.map((item) => _exChip(item, appState)).join('');
    }
    if (appState.customExercises?.length) {
      html += `<div class="el-cat-label">⭐ Custom</div>`;
      html += [...appState.customExercises].sort().map((name) => _customExChip(name, appState)).join('');
    }
  }
  container.innerHTML = html;
  const summary = document.getElementById('elResultSummary');
  if (summary) {
    const total = matches.length + customMatches.length;
    summary.textContent = `${total} exercise${total === 1 ? '' : 's'}${equipment ? ` · ${equipmentLabel(equipment)}` : ''}`;
  }
}

export function handleExerciseSearch(query) {
  renderExerciseLibraryList(query);
}

export function addExerciseToDayFromLibrary(name) {
  if (!name) return;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  if (!appState.weeks[wk].lifts[selectedDay]) appState.weeks[wk].lifts[selectedDay] = {};
  if (!appState.weeks[wk].lifts[selectedDay][name]) {
    appState.weeks[wk].lifts[selectedDay][name] = [{ w: '', r: '10', c: false }];
  }
  if (!appState.weeks[wk].liftMeta) appState.weeks[wk].liftMeta = {};
  if (!appState.weeks[wk].liftMeta[selectedDay]) appState.weeks[wk].liftMeta[selectedDay] = {};
  appState.weeks[wk].liftMeta[selectedDay][name] = {
    ...(appState.weeks[wk].liftMeta[selectedDay][name] || {}),
    origin: 'added',
  };
  // Append to the explicit display order so the new exercise lands at the bottom.
  if (!appState.weeks[wk].liftOrder) appState.weeks[wk].liftOrder = {};
  if (!Array.isArray(appState.weeks[wk].liftOrder[selectedDay])) appState.weeks[wk].liftOrder[selectedDay] = [];
  if (!appState.weeks[wk].liftOrder[selectedDay].includes(name)) {
    appState.weeks[wk].liftOrder[selectedDay].push(name);
  }
  _saveState(true);
  closeAddExerciseModal();
  rerenderWorkout();
  showToast(`Added: ${name}`);
}

// ── Exercise swap (B3) ────────────────────────────────────────────────────────
// Re-keys the day's logged entry from the old exercise to the new one, so the
// prescribed target and any sets already logged carry across intact, and keeps
// the exercise in its original position in the day.
let _swapSourceLift = null;

export function openSwapModal(liftName) {
  if (!liftName) return;
  _swapSourceLift = liftName;
  const modal = document.getElementById('swapExerciseModal');
  if (!modal) return;
  const subtitle = document.getElementById('swapSubtitle');
  if (subtitle) subtitle.textContent = `Swapping "${liftName}" — same movement, kit you have. Your target and logged sets carry over.`;
  _renderSwapList(liftName);
  modal.classList.add('active');
}

export function closeSwapModal() {
  _swapSourceLift = null;
  document.getElementById('swapExerciseModal')?.classList.remove('active');
}

function _renderSwapList(liftName) {
  const list = document.getElementById('swapList');
  if (!list) return;
  const appState = _getState();
  const equipment = appState?.settings?.equipment || {};
  const subs = getSubstitutions(liftName, equipment, 8);

  if (subs.length === 0) {
    list.innerHTML = `<div class="text-sm text-muted" style="padding:16px;">No direct swaps for this movement with your equipment. Use the full list below to pick any exercise.</div>`;
    return;
  }
  list.innerHTML = subs.map(s => `
    <button class="el-chip tactile-scale" data-action="swap-pick" data-exname="${escapeHtml(s.name)}">
      ${escapeHtml(s.name)}<span class="el-pr">${s.bodyweight ? 'Bodyweight' : escapeHtml(s.equip.map(labelEquip).join(' · '))}</span>
    </button>
  `).join('');
}

function labelEquip(k) {
  return ({ barbell: 'Barbell', ezBar: 'EZ bar', rack: 'Rack', dumbbells: 'Dumbbells', cables: 'Cables', pullupBar: 'Pull-up bar', bands: 'Bands', kettlebells: 'Kettlebell' })[k] || k;
}

// Perform the swap: old → new, preserving the sets array (target + logged data)
// and the exercise's position in the day. Thin wrapper over the pure
// applyExerciseSwap so the state logic stays unit-testable.
export function executeSwapExercise(newName) {
  const oldName = _swapSourceLift;
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const wk = activeWorkoutWeekKey(appState);
  const blueprint = oneOffBlueprint(appState,
    getProgramById(appState.activeProgramId)?.days?.[selectedDay] || {});

  const res = applyExerciseSwap(appState.weeks?.[wk], selectedDay, oldName, newName, blueprint);
  if (!res.ok) {
    if (res.reason === 'duplicate') showToast(`${newName} is already in today's session`, true);
    else closeSwapModal();
    return;
  }
  _saveState(true);
  closeSwapModal();
  rerenderWorkout();
  showToast(`Swapped to ${newName}`);
}

export function confirmCustomSwap() {
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('swapCustomInput'));
  const name = input?.value?.trim();
  if (!name) { showToast('Type an exercise name to swap in'); return; }
  saveNewCustomExerciseToLibrary(name);
  if (input) input.value = '';
  executeSwapExercise(name);
}

export function openAddExerciseModal() {
  const modal = document.getElementById('addExerciseModal');
  if (!modal) return;
  const searchInput = /** @type {HTMLInputElement|null} */ (document.getElementById('elSearchInput'));
  const customInput = /** @type {HTMLInputElement|null} */ (document.getElementById('customExerciseTextInput'));
  const categoryFilter = /** @type {HTMLSelectElement|null} */ (document.getElementById('elCategoryFilter'));
  const equipmentFilter = /** @type {HTMLSelectElement|null} */ (document.getElementById('elEquipmentFilter'));
  const muscleFilter = /** @type {HTMLSelectElement|null} */ (document.getElementById('elMuscleFilter'));
  if (searchInput) searchInput.value = '';
  if (customInput) customInput.value = '';
  if (categoryFilter) categoryFilter.value = '';
  if (equipmentFilter) equipmentFilter.value = '';
  if (muscleFilter) muscleFilter.value = '';
  renderExerciseLibraryList('');
  modal.classList.add('active');
  setTimeout(() => searchInput?.focus(), 80);
}

export function closeAddExerciseModal() {
  const modal = document.getElementById('addExerciseModal');
  if (modal) modal.classList.remove('active');
}

export function confirmAddExercise() {
  const customInput = /** @type {HTMLInputElement|null} */ (document.getElementById('customExerciseTextInput'));
  const name = customInput?.value?.trim();
  if (!name) { showToast('Type a custom exercise name first'); return; }
  saveNewCustomExerciseToLibrary(name);
  addExerciseToDayFromLibrary(name);
}
