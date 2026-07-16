// ==========================================
// DRAG & DROP — thin wiring over the shared sortable engine (js/ui/sortable.js)
// ==========================================
import { showToast } from './state.js';
import { createSortable } from './ui/sortable.js';
import { DEFAULT_HIDDEN_TILES } from './dashboard.js';
import { activeWorkoutDay, activeWorkoutWeekKey } from './workout/one-off-session.js';

let _getState;
let _getSelectedDay;
let _saveState;

export function initDragDrop(getStateFn, getSelectedDayFn, saveStateFn) {
  _getState = getStateFn;
  _getSelectedDay = getSelectedDayFn;
  _saveState = saveStateFn;
}

// ==========================================
// WORKOUT EXERCISE / SUPERSET REORDER
// Grab the grip (or a superset header) and drag. Supersets are top-level units;
// their nested exercises are not independently sortable (directChildrenOnly).
// ==========================================
export function mountExerciseDragAndDropSystems() {
  const container = document.getElementById('cockpitExercisesContainer');
  if (!container) return;
  createSortable(container, {
    itemSelector: '.cockpit-exercise, .superset-group',
    handleSelector: '.drag-handle-grip, .superset-group-header',
    layout: 'list',
    directChildrenOnly: true,
    onReorder: () => commitReorderedDOMStateToStorage(),
  });
}

export function commitReorderedDOMStateToStorage() {
  const appState = _getState();
  const selectedDay = activeWorkoutDay(appState, _getSelectedDay());
  const container = document.getElementById('cockpitExercisesContainer');
  if (!container) return;
  const wk = activeWorkoutWeekKey(appState);
  const dayLifts = appState.weeks?.[wk]?.lifts?.[selectedDay] || {};

  // Persist the new sequence as an explicit `liftOrder` array. We deliberately
  // do NOT rebuild the lifts object: JS re-sorts integer-like keys to the front
  // on enumeration, which silently reverts the user's reorder. The order array
  // is the single source of truth the renderer reads.
  const newOrder = [];
  Array.from(container.children).forEach(child => {
    if (child.classList.contains('superset-group')) {
      child.querySelectorAll('.cockpit-exercise').forEach(card => {
        const liftName = card.getAttribute('data-liftname');
        if (liftName && dayLifts[liftName] && !newOrder.includes(liftName)) newOrder.push(liftName);
      });
    } else if (child.classList.contains('cockpit-exercise')) {
      const liftName = child.getAttribute('data-liftname');
      if (liftName && dayLifts[liftName] && !newOrder.includes(liftName)) newOrder.push(liftName);
    }
  });
  Object.keys(dayLifts).forEach(n => { if (!newOrder.includes(n)) newOrder.push(n); });

  if (!appState.weeks[wk].liftOrder) appState.weeks[wk].liftOrder = {};
  appState.weeks[wk].liftOrder[selectedDay] = newOrder;
  _saveState(true);
  showToast('Order updated ✓');
}

// ==========================================
// DASHBOARD TILE LAYOUT PERSISTENCE
// Order + hidden live in appState (appState.dashboardTiles) so they export and
// cloud-sync with the rest of the user's data. Legacy standalone localStorage
// keys are migrated once on load in state.js.
// ==========================================
function _dashboardTiles() {
  const st = _getState?.();
  if (!st) return null;
  if (!st.dashboardTiles) st.dashboardTiles = { order: null, hidden: null };
  return st.dashboardTiles;
}

export function loadTileOrder() {
  const t = _dashboardTiles();
  return t && Array.isArray(t.order) ? t.order : null;
}

export function saveTileOrder(orderedIds) {
  const t = _dashboardTiles();
  if (!t) return;
  t.order = orderedIds;
  _saveState?.(true);
}

export function resetTileOrder() {
  const t = _dashboardTiles();
  if (!t) return;
  t.order = null;
  _saveState?.(true);
}

// ==========================================
// DASHBOARD TILE REORDER
// Press-and-hold a tile to pick it up; the grid reflows around it. The synthetic
// tile id prefix (glance-tile-) maps back to the registry id we persist.
// ==========================================
export function mountTileDragAndDrop() {
  const grid = document.getElementById('glanceGrid');
  if (!grid) return;
  createSortable(grid, {
    itemSelector: '.glance-card',
    layout: 'grid',
    holdDelay: 230,
    onReorder: (items) => {
      const ids = items
        .map(t => t.id.replace('glance-tile-', ''))
        .filter(id => id && id !== 'connect-health');
      saveTileOrder(ids);
      showToast('Tile order saved ✓');
    },
  });
}

// ==========================================
// HIDDEN TILES PERSISTENCE (appState-backed)
// ==========================================
// hidden === null means "never customised" → the focused default set (R4).
// Any saved array — including [] (user chose to show everything) — wins.
export function loadHiddenTiles() {
  const t = _dashboardTiles();
  if (t && Array.isArray(t.hidden)) return new Set(t.hidden);
  return new Set(DEFAULT_HIDDEN_TILES);
}

export function saveHiddenTiles(hiddenSet) {
  const t = _dashboardTiles();
  if (!t) return;
  t.hidden = [...hiddenSet];
  _saveState?.(true);
}

export function resetHiddenTiles() {
  const t = _dashboardTiles();
  if (!t) return;
  t.hidden = null;   // back to the focused default set
  _saveState?.(true);
}
