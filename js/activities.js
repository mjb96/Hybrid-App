// @ts-check
// =============================================================================
// ACTIVITIES — full-screen history and exact activity detail/deletion.
// =============================================================================
import {
  activityDestinationForDate, buildActivityHistory, filterActivityHistory,
} from './activities/model.js';
import {
  deleteRunActivity, deleteStrengthActivity,
  restoreRunActivity, restoreStrengthActivity,
} from './activities/mutations.js';
import { buildSessionRecap, renderSessionRecapHTML } from './session-recap.js';
import { deleteMapFromDB } from './db.js';
import { renderRunMap } from './workout-map.js';
import { confirmModal } from './ui/confirm-modal.js';
import { getProgramById, showToast } from './state.js';
import { getWeekModifier } from './schema.js';
import { prescribeSetsForLift } from './engine.js';

let _getState = null;
let _saveState = null;
let _filter = 'all';
let _dateFilter = null;
let _activationFilter = null;
let _activationLabel = null;
let _selected = null;
let _detailTab = 'summary';
let _pendingUndo = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function activityIcon(kind) {
  return kind === 'run' ? '🏃' : '🏋️';
}

function dateHeading(localDate) {
  if (!localDate) return 'Date unavailable';
  const date = new Date(`${localDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return localDate;
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function replacementPrescription(state, weekKey, day) {
  const week = state.weeks?.[weekKey];
  const activeSlot = /^\d+$/.test(String(weekKey))
    && (!week?.activationId || week.activationId === state.activeActivationId);
  if (!activeSlot) return { lifts: {}, liftOrder: [] };
  const program = getProgramById(state.activeProgramId);
  const blueprint = program?.days?.[day];
  const names = (blueprint?.lifts || []).filter((name) => typeof name === 'string' && name.trim());
  if (!program || !names.length) return { lifts: {}, liftOrder: [] };
  const lifts = {};
  const modifier = getWeekModifier(program, weekKey);
  for (const name of names) {
    try { lifts[name] = prescribeSetsForLift(weekKey, day, name, blueprint.desc, modifier); }
    catch (_) { /* a deleted log must not invent a broken prescription */ }
  }
  return { lifts, liftOrder: Object.keys(lifts) };
}

export function initActivities(getStateFn, saveStateFn) {
  _getState = getStateFn;
  _saveState = saveStateFn;
}

export function isActivitiesOpen() {
  const screen = document.getElementById('activitiesScreen');
  return !!screen && screen.style.display !== 'none';
}

export function openActivities(options = {}) {
  const screen = document.getElementById('activitiesScreen');
  if (!screen || !_getState) return;
  _selected = null;
  _detailTab = 'summary';
  _dateFilter = options.date || null;
  _activationFilter = options.activationId || null;
  _activationLabel = options.label || null;
  _filter = options.filter || 'all';
  if (options.directIfSingle && _dateFilter) {
    _selected = activityDestinationForDate(buildActivityHistory(_getState()), _dateFilter).activity;
  }
  screen.style.display = 'block';
  screen.scrollTop = 0;
  renderActivities();
}

export function closeActivities() {
  if (_selected) {
    _selected = null;
    renderList();
    return;
  }
  const screen = document.getElementById('activitiesScreen');
  if (screen) screen.style.display = 'none';
}

function renderRow(row) {
  return `<button class="activity-history-row activity-history-row--${row.kind}" data-action="open-activity-detail" data-activity-id="${esc(row.id)}">
    <span class="activity-history-icon" aria-hidden="true">${activityIcon(row.kind)}</span>
    <span class="activity-history-main">
      <span class="activity-history-title">${esc(row.title)}</span>
      <span class="activity-history-sub">${esc(row.subtitle || row.dateLabel)}</span>
      <span class="activity-history-date">${esc(row.dateLabel)}</span>
    </span>
    <span class="activity-history-metrics">${row.metrics.map((metric) => `<span>${esc(metric)}</span>`).join('')}</span>
    <span class="activity-history-chevron" aria-hidden="true">›</span>
  </button>`;
}

function renderList() {
  const state = _getState?.();
  const content = document.getElementById('activitiesContent');
  const title = document.getElementById('activitiesTitle');
  const back = document.getElementById('activitiesBack');
  const actions = document.getElementById('activitiesHeaderActions');
  if (!state || !content) return;
  if (title) title.textContent = 'Activities';
  if (back) back.textContent = '← Done';
  if (actions) actions.innerHTML = '';

  const all = buildActivityHistory(state);
  const rows = filterActivityHistory(all, _filter, _dateFilter, _activationFilter);
  const filterLabel = _dateFilter ? dateHeading(_dateFilter)
    : _activationFilter ? (_activationLabel || 'Previous program run')
      : 'All training history';
  content.innerHTML = `
    <div class="activity-history-hero">
      <span class="activity-history-eyebrow">Training history</span>
      <h2>${esc(filterLabel)}</h2>
      <p>${rows.length} ${rows.length === 1 ? 'activity' : 'activities'}</p>
      ${_dateFilter || _activationFilter ? '<button class="activity-date-clear" data-action="clear-activity-date">View all activities</button>' : ''}
    </div>
    <div class="activity-filter-bar" role="group" aria-label="Activity type">
      ${[['all', 'All'], ['strength', 'Strength'], ['run', 'Runs']].map(([value, label]) =>
        `<button class="activity-filter${_filter === value ? ' activity-filter--active' : ''}" data-action="filter-activities" data-filter="${value}" aria-pressed="${_filter === value}">${label}</button>`
      ).join('')}
    </div>
    <div class="activity-history-list">
      ${rows.length ? rows.map(renderRow).join('') : `<div class="activity-history-empty"><span>○</span><strong>No activities here</strong><p>Completed strength workouts and runs will appear as separate activities.</p></div>`}
    </div>`;
}

function findSelected(activityId) {
  return buildActivityHistory(_getState?.()).find((row) => row.id === activityId) || null;
}

function paintDetail() {
  const state = _getState?.();
  const content = document.getElementById('activitiesContent');
  const title = document.getElementById('activitiesTitle');
  const back = document.getElementById('activitiesBack');
  const actions = document.getElementById('activitiesHeaderActions');
  if (!state || !_selected || !content) return;
  if (title) title.textContent = _selected.title;
  if (back) back.textContent = '← Activities';
  if (actions) actions.innerHTML = `<button class="activity-menu-btn" data-action="toggle-activity-menu" aria-label="Activity actions" aria-expanded="false">•••</button>`;

  const recap = buildSessionRecap(
    state, _selected.week, _selected.day,
    _selected.kind === 'run' ? _selected.sessionId : null,
    _selected.kind,
  );
  content.innerHTML = `
    <div class="activity-action-menu" id="activityActionMenu" hidden>
      <button data-action="delete-activity" class="activity-action-delete">Delete ${_selected.kind === 'run' ? _selected.title.toLowerCase() : 'strength workout'}</button>
    </div>
    <div class="activity-detail-shell">${renderSessionRecapHTML(recap, [], state.thresholdPaceSeconds || null, _detailTab)}</div>`;
  content.querySelectorAll('[data-recap-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      _detailTab = button.getAttribute('data-recap-tab') || 'summary';
      paintDetail();
    });
  });
  if (_detailTab === 'summary' && recap.run?.distKm > 0) {
    renderRunMap(_selected.week, _selected.day, recap.run.distKm, {
      containerId: 'recapMapContainer',
      splits: recap.run.splits,
      thresholdSec: state.thresholdPaceSeconds,
      activationId: state.weeks?.[_selected.week]?.activationId || state.activeActivationId,
      sessionId: _selected.sessionId,
    });
  }
}

export function renderActivities() {
  if (_selected) paintDetail(); else renderList();
}

function showUndo(label, undoFn, finalizeFn) {
  if (_pendingUndo) {
    clearTimeout(_pendingUndo.timer);
    Promise.resolve(_pendingUndo.finalize()).catch(() => {});
  }
  const bar = document.getElementById('activityUndoBar');
  const message = document.getElementById('activityUndoMessage');
  if (message) message.textContent = `${label} deleted`;
  if (bar) { bar.hidden = false; bar.classList.add('show'); }
  const pending = { undo: undoFn, finalize: finalizeFn, timer: null };
  pending.timer = setTimeout(async () => {
    if (_pendingUndo !== pending) return;
    _pendingUndo = null;
    if (bar) { bar.classList.remove('show'); bar.hidden = true; }
    await Promise.resolve(finalizeFn());
  }, 10000);
  _pendingUndo = pending;
}

async function undoDelete() {
  const pending = _pendingUndo;
  if (!pending) return;
  clearTimeout(pending.timer);
  _pendingUndo = null;
  const bar = document.getElementById('activityUndoBar');
  if (bar) { bar.classList.remove('show'); bar.hidden = true; }
  await Promise.resolve(pending.undo());
  renderList();
  document.dispatchEvent(new CustomEvent('session:deleted', { detail: { restored: true } }));
  showToast('Activity restored');
}

async function deleteSelectedActivity() {
  const state = _getState?.();
  const activity = _selected;
  const week = activity && state?.weeks?.[activity.week];
  if (!state || !activity || !week) return;
  const label = activity.kind === 'run' ? activity.title : 'Strength workout';
  const confirmed = await confirmModal({
    title: `Delete this ${activity.kind === 'run' ? activity.title.toLowerCase() : 'strength workout'}?`,
    message: activity.kind === 'run'
      ? `Only this ${activity.title.toLowerCase()} will be removed. Other runs and strength work from ${activity.dateLabel} will stay.`
      : `Only the strength workout will be removed. Runs and body-weight data from ${activity.dateLabel} will stay.`,
    confirmLabel: `Delete ${activity.kind === 'run' ? activity.title.toLowerCase() : 'workout'}`,
    danger: true,
  });
  if (!confirmed) return;

  const activationId = week.activationId || state.activeActivationId;
  if (activity.kind === 'run') {
    const snapshot = deleteRunActivity(week, activity.day, activity.sessionId);
    if (!snapshot) { showToast('Run could not be found', true); return; }
    await Promise.resolve(_saveState?.(true));
    showUndo(label, async () => {
      restoreRunActivity(week, activity.day, snapshot);
      await Promise.resolve(_saveState?.(true));
      // The route is intentionally retained during the Undo window.
    }, () => deleteMapFromDB(activity.week, activity.day, {
      activationId, sessionId: activity.sessionId,
    }));
  } else {
    const snapshot = deleteStrengthActivity(week, activity.day, replacementPrescription(state, activity.week, activity.day));
    if (!snapshot) { showToast('Workout could not be found', true); return; }
    await Promise.resolve(_saveState?.(true));
    showUndo(label, async () => {
      restoreStrengthActivity(week, activity.day, snapshot);
      await Promise.resolve(_saveState?.(true));
    }, () => {});
  }

  _selected = null;
  renderList();
  document.dispatchEvent(new CustomEvent('session:deleted', { detail: {
    week: activity.week, day: activity.day, sessionId: activity.sessionId, kind: activity.kind,
  } }));
}

export function handleActivityAction(action, element) {
  if (action === 'open-activities') { openActivities(); return true; }
  if (action === 'close-activities') { closeActivities(); return true; }
  if (action === 'filter-activities') {
    _filter = element.getAttribute('data-filter') || 'all';
    renderList(); return true;
  }
  if (action === 'clear-activity-date') {
    _dateFilter = null; _activationFilter = null; _activationLabel = null;
    renderList(); return true;
  }
  if (action === 'open-activity-detail') {
    const found = findSelected(element.getAttribute('data-activity-id'));
    if (found) {
      const screen = document.getElementById('activitiesScreen');
      if (screen) { screen.style.display = 'block'; screen.scrollTop = 0; }
      _selected = found; _detailTab = 'summary'; paintDetail();
    }
    return true;
  }
  if (action === 'open-session-detail') {
    const week = element.getAttribute('data-week');
    const day = element.getAttribute('data-day');
    const found = buildActivityHistory(_getState?.()).find((row) =>
      row.kind === 'strength' && String(row.week) === String(week) && row.day === day
    );
    if (found) {
      const screen = document.getElementById('activitiesScreen');
      if (screen) { screen.style.display = 'block'; screen.scrollTop = 0; }
      _selected = found; _detailTab = 'summary'; paintDetail();
    }
    return true;
  }
  if (action === 'toggle-activity-menu') {
    const menu = document.getElementById('activityActionMenu');
    if (menu) {
      menu.hidden = !menu.hidden;
      element.setAttribute('aria-expanded', String(!menu.hidden));
    }
    return true;
  }
  if (action === 'delete-activity') {
    deleteSelectedActivity().catch((error) => {
      console.warn('Activity deletion failed:', error);
      showToast('Activity could not be deleted', true);
    });
    return true;
  }
  if (action === 'undo-activity-delete') { undoDelete().catch(() => showToast('Activity could not be restored', true)); return true; }
  return false;
}
