// @ts-check
// Weekly Volume: summary → breakdown → exact workout evidence.

import { buildWeeklyStrengthVolumeDetail } from '../strength-volume-detail.js';
import { getSelectedWeekStart } from '../week-nav.js';
import { MUSCLE_LABELS } from '../calculations/volume-landmarks.js';
import { esc } from './screen-kit.js';
import { weightUnitOf } from '../utils.js';

let _activeBreakdown = 'days';
let _selectedDay = null;

const fmtDate = (iso, year = false) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
  day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}),
});
const fmtVolume = (value, unit) => `${Math.round(value).toLocaleString()} ${unit}`;
const fmtDuration = (seconds) => {
  if (!seconds) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
};
const muscleName = (id) => MUSCLE_LABELS[id] || String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

function workoutButton(workout, unit) {
  const subtitle = `${workout.workingSets} sets · ${fmtVolume(workout.volumeKg, unit)}${workout.durationSeconds ? ` · ${fmtDuration(workout.durationSeconds)}` : ''}`;
  return `<button class="an-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(workout.id)}">
    <span class="an-evidence-row__date">${esc(fmtDate(workout.date))}</span>
    <span class="an-evidence-row__body">
      <span class="an-evidence-row__title">${esc(workout.title)}</span>
      <span class="an-evidence-row__meta">${esc(subtitle)}</span>
    </span>
    <span class="an-evidence-row__arrow" aria-hidden="true">›</span>
  </button>`;
}

function comparisonHTML(model, unit) {
  const comparison = model.comparison;
  const value = comparison.percentageChange == null
    ? comparison.message
    : `${comparison.percentageChange > 0 ? '+' : ''}${comparison.percentageChange}%`;
  const tone = comparison.direction === 'up' ? 'up' : comparison.direction === 'down' ? 'down' : 'flat';
  return `<article class="an-volume-compare">
    <div>
      <span class="an-volume-compare__label">Period comparison</span>
      <strong class="an-volume-compare__value an-volume-compare__value--${tone}">${esc(value || 'No comparison')}</strong>
      <span class="an-volume-compare__meta">${esc(comparison.comparisonLabel)}</span>
    </div>
    <div class="an-volume-compare__periods">
      <span>${fmtVolume(model.totals.volumeKg, unit)} selected</span>
      <span>${comparison.previousTotal == null ? '—' : fmtVolume(comparison.previousTotal, unit)} prior</span>
    </div>
  </article>`;
}

function dayBreakdown(model, unit) {
  const max = Math.max(1, ...model.days.map(day => day.volumeKg));
  const selectedKey = _selectedDay && model.days.some(day => day.dayKey === _selectedDay)
    ? _selectedDay
    : (model.days.find(day => day.date === model.today)?.dayKey || model.days.find(day => day.workoutCount)?.dayKey || 'mon');
  _selectedDay = selectedKey;
  const selected = model.days.find(day => day.dayKey === selectedKey);
  const workouts = model.workouts.filter(workout => workout.date === selected.date);
  const bars = model.days.map(day => {
    const height = day.volumeKg ? Math.max(10, Math.round((day.volumeKg / max) * 100)) : 4;
    const isFuture = model.isCurrentWeek && day.date > model.today;
    return `<button class="an-volume-bar ${day.dayKey === selectedKey ? 'is-selected' : ''} ${isFuture ? 'is-future' : ''}"
      data-volume-day="${day.dayKey}" aria-pressed="${day.dayKey === selectedKey}" aria-label="${day.label}, ${fmtVolume(day.volumeKg, unit)}">
      <span class="an-volume-bar__value">${day.volumeKg ? Math.round(day.volumeKg).toLocaleString() : '0'}</span>
      <span class="an-volume-bar__track"><span style="height:${height}%"></span></span>
      <span class="an-volume-bar__label">${day.label}</span>
    </button>`;
  }).join('');
  return `<section class="an-volume-panel" aria-labelledby="volumeDaysTitle">
    <div class="an-volume-panel__head"><h3 id="volumeDaysTitle">Volume by day</h3><span>${esc(unit)}</span></div>
    <div class="an-volume-bars">${bars}</div>
    <div class="an-volume-selection" aria-live="polite">
      <div class="an-volume-selection__head">
        <strong>${esc(selected.label)} · ${esc(fmtDate(selected.date, true))}</strong>
        <span>${fmtVolume(selected.volumeKg, unit)}</span>
      </div>
      <p>${selected.workingSets} working sets · ${selected.reps} reps · ${selected.workoutCount} ${selected.workoutCount === 1 ? 'workout' : 'workouts'}</p>
      ${workouts.length ? workouts.map(workout => workoutButton(workout, unit)).join('') : '<div class="an-empty-inline">No strength workout logged on this day.</div>'}
    </div>
  </section>`;
}

function workoutsBreakdown(model, unit) {
  if (!model.workouts.length) return '<div class="an-empty-state"><strong>No strength workouts in this period</strong><span>Completed working sets will appear here with a link to the exact workout.</span></div>';
  return `<section class="an-volume-panel"><div class="an-volume-panel__head"><h3>Contributing workouts</h3><span>${model.workouts.length} sessions</span></div>
    <div class="an-evidence-list">${model.workouts.map(workout => workoutButton(workout, unit)).join('')}</div></section>`;
}

function exercisesBreakdown(model, unit) {
  if (!model.exercises.length) return '<div class="an-empty-state"><strong>No exercise data yet</strong><span>Complete a working set to start an exercise trend.</span></div>';
  const max = Math.max(1, ...model.exercises.map(item => item.volumeKg));
  return `<section class="an-volume-panel"><div class="an-volume-panel__head"><h3>Exercise contribution</h3><span>Aliases combined</span></div>
    <div class="an-ranked-list">${model.exercises.map(item => `<button class="an-ranked-row" data-action="open-analytics" data-context="exercise" data-entity="${esc(item.id)}" data-entity-name="${esc(item.name)}" data-parent-context="weekly-volume">
      <span class="an-ranked-row__head"><strong>${esc(item.name)}</strong><span>${fmtVolume(item.volumeKg, unit)}</span></span>
      <span class="an-ranked-row__track"><span style="width:${Math.round((item.volumeKg / max) * 100)}%"></span></span>
      <span class="an-ranked-row__meta">${item.workingSets} sets · ${item.reps} reps · ${item.workoutCount} ${item.workoutCount === 1 ? 'workout' : 'workouts'} <b>View trend ›</b></span>
    </button>`).join('')}</div></section>`;
}

function musclesBreakdown(model) {
  if (!model.muscles.length) return '<div class="an-empty-state"><strong>No mapped muscle data yet</strong><span>Custom or conditioning exercises may not have estimated muscle credits.</span></div>';
  const max = Math.max(1, ...model.muscles.map(item => item.totalSetCredits));
  return `<section class="an-volume-panel"><div class="an-volume-panel__head"><h3>Estimated muscle sets</h3><span>Direct + indirect</span></div>
    <div class="an-ranked-list">${model.muscles.map(item => `<button class="an-ranked-row" data-action="open-analytics" data-context="muscle" data-entity="${esc(item.id)}" data-entity-name="${esc(muscleName(item.id))}" data-parent-context="weekly-volume">
      <span class="an-ranked-row__head"><strong>${esc(muscleName(item.id))}</strong><span>${item.totalSetCredits.toFixed(1)} sets</span></span>
      <span class="an-ranked-row__track an-ranked-row__track--muscle"><span style="width:${Math.round((item.totalSetCredits / max) * 100)}%"></span></span>
      <span class="an-ranked-row__meta">${item.directSets.toFixed(1)} direct · ${item.indirectSets.toFixed(1)} indirect <b>Explain ›</b></span>
    </button>`).join('')}</div>
    <details class="an-method"><summary>How are muscle sets estimated?</summary><p>A working set gives 1.0 credit to its main muscle and 0.5 or 0.25 to meaningful secondary muscles. These are training estimates, not a medical measurement.</p></details>
  </section>`;
}

/**
 * Render the weekly breakdown into a caller-supplied container. Phase 3B made
 * this a TAB of the merged Strength Volume screen rather than its own
 * destination, so the container is passed in instead of looked up by id.
 * @param {HTMLElement|null} root
 * @param {any} state
 */
export function renderWeeklyVolumeBody(root, state) {
  if (!root) return;
  const weekStart = getSelectedWeekStart();
  const model = buildWeeklyStrengthVolumeDetail(state, { weekStart });
  const unit = weightUnitOf(state);
  const tab = (id, label) => `<button class="an-segment__button ${_activeBreakdown === id ? 'is-active' : ''}" data-volume-tab="${id}" aria-pressed="${_activeBreakdown === id}">${label}</button>`;
  const content = _activeBreakdown === 'workouts' ? workoutsBreakdown(model, unit)
    : _activeBreakdown === 'exercises' ? exercisesBreakdown(model, unit)
      : _activeBreakdown === 'muscles' ? musclesBreakdown(model)
        : dayBreakdown(model, unit);

  root.innerHTML = `<div class="an-detail-substatus">
      <span class="an-period-status ${model.isCurrentWeek ? 'is-live' : ''}">${model.status}</span>
    </div>
    <p class="an-detail-period">${fmtDate(model.weekStart, true)} – ${fmtDate(model.weekEnd, true)}${model.isCurrentWeek ? ` · through ${fmtDate(model.today)}` : ''}</p>
    <section class="an-volume-summary" aria-label="Weekly strength summary">
      <article><span>Total tonnage</span><strong>${fmtVolume(model.totals.volumeKg, unit)}</strong></article>
      <article><span>Working sets</span><strong>${model.totals.workingSets}</strong></article>
      <article><span>Sessions</span><strong>${model.workouts.length}</strong></article>
      <article><span>Exercises</span><strong>${model.exercises.length}</strong></article>
    </section>
    ${comparisonHTML(model, unit)}
    ${model.excludedFutureRecords ? `<div class="an-data-note">${model.excludedFutureRecords} future-dated ${model.excludedFutureRecords === 1 ? 'record was' : 'records were'} excluded from this live week.</div>` : ''}
    <nav class="an-segment" aria-label="Weekly volume breakdown">${tab('days', 'Day')}${tab('workouts', 'Workouts')}${tab('exercises', 'Exercises')}${tab('muscles', 'Muscles')}</nav>
    ${content}
    <details class="an-method"><summary>How is weekly volume calculated?</summary><p>Total tonnage is weight × completed reps across working sets dated inside this Monday–Sunday calendar week. Warm-ups, incomplete sets, undated legacy records and future-dated records in a live week are excluded.</p></details>`;

  root.querySelectorAll('[data-volume-tab]').forEach(button => button.addEventListener('click', () => {
    _activeBreakdown = button.getAttribute('data-volume-tab') || 'days';
    renderWeeklyVolumeBody(root, state);
  }));
  root.querySelectorAll('[data-volume-day]').forEach(button => button.addEventListener('click', () => {
    _selectedDay = button.getAttribute('data-volume-day');
    renderWeeklyVolumeBody(root, state);
  }));
}

/**
 * Backwards-compatible entry point for the standalone container. Retained so
 * any caller still targeting #weeklyVolumeDetail keeps working.
 * @param {any} state
 */
export function renderWeeklyVolume(state) {
  renderWeeklyVolumeBody(document.getElementById('weeklyVolumeDetail'), state);
}
