// ==========================================
// DRAG & DROP — thin wiring over the shared sortable engine (js/ui/sortable.js)
// ==========================================
import { showToast } from './state.js';
import { createSortable } from './ui/sortable.js';

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
  const selectedDay = _getSelectedDay();
  const container = document.getElementById('cockpitExercisesContainer');
  if (!container) return;
  const wk = appState.currentWeek;
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
// DASHBOARD TILE ORDER PERSISTENCE
// ==========================================
const TILE_ORDER_KEY = 'dashboardTileOrder';

export function loadTileOrder() {
  try {
    const raw = localStorage.getItem(TILE_ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTileOrder(orderedIds) {
  try {
    localStorage.setItem(TILE_ORDER_KEY, JSON.stringify(orderedIds));
  } catch {}
}

export function resetTileOrder() {
  try {
    localStorage.removeItem(TILE_ORDER_KEY);
  } catch {}
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

// Retained as a no-op for backward compatibility with older call sites.
export function exitTileEditMode() {}

// ==========================================
// HIDDEN TILES PERSISTENCE
// ==========================================
const TILE_HIDDEN_KEY = 'dashboardTilesHidden';

export function loadHiddenTiles() {
  try {
    const raw = localStorage.getItem(TILE_HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveHiddenTiles(hiddenSet) {
  try {
    localStorage.setItem(TILE_HIDDEN_KEY, JSON.stringify([...hiddenSet]));
  } catch {}
}

export function resetHiddenTiles() {
  try {
    localStorage.removeItem(TILE_HIDDEN_KEY);
  } catch {}
}
