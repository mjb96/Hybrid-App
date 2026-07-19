// @ts-check
// Exercise and muscle drilldowns. Both retain links to the exact workouts that
// underpin the aggregate so a trend is never a dead-end number.

import { exercisePerformanceHistory } from '../../workout/exercise-history.js';
import { isE1rmExercise } from '../../strength/e1rm.js';
import { resolveExercise } from '../../exercises/catalog.js';
import { buildWeeklyStrengthVolumeDetail } from '../strength-volume-detail.js';
import { addDaysISO, localDayKey } from '../weekly-aggregate.js';
import { comparePeriodValues } from '../period-comparison.js';
import { VOLUME_LANDMARKS, zoneLabel, classifyVolume } from '../calculations/volume-landmarks.js';
import { esc } from './screen-kit.js';

let _exerciseRange = '12w';

const fmtDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const fmtVolume = (value, unit) => `${Math.round(value).toLocaleString()} ${unit}`;
const muscleName = (id) => String(id || '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const activityIdFor = (row) => row.sessionId
  ? `strength:${row.sessionId}`
  : `strength:${encodeURIComponent(row.weekKey)}:${row.day}`;

function exerciseRows(state, name) {
  const today = localDayKey(new Date());
  const days = _exerciseRange === '12w' ? 84 : _exerciseRange === '6m' ? 183 : null;
  const cutoff = days ? addDaysISO(today, -days) : null;
  return exercisePerformanceHistory(state, name)
    .filter(row => row.date <= today && (!cutoff || row.date >= cutoff))
    .map(row => {
      let volumeKg = 0, reps = 0, bestWeight = 0;
      row.workingSets.forEach(set => {
        const weight = parseFloat(set?.w) || 0;
        const setReps = parseInt(set?.r, 10) || 0;
        volumeKg += weight * setReps;
        reps += setReps;
        bestWeight = Math.max(bestWeight, weight);
      });
      return { ...row, volumeKg, reps, bestWeight, activityId: activityIdFor(row) };
    });
}

/** @param {any} state @param {{id?:string,name?:string}} entity */
export function renderExerciseDetail(state, entity = {}) {
  const root = document.getElementById('strengthEntityDetail');
  if (!root) return;
  const canonical = resolveExercise(entity.id || entity.name || '');
  const name = canonical?.name || entity.name || String(entity.id || '').replace(/^custom:/, '') || 'Exercise';
  const unit = state?.settings?.weightUnit === 'lbs' ? 'lbs' : 'kg';
  const rows = exerciseRows(state, name);
  const latest = rows[0] || null;
  const previous = rows[1] || null;
  const bestWeight = Math.max(0, ...rows.map(row => row.bestWeight));
  const bestE1rm = Math.max(0, ...rows.map(row => row.e1rm || 0));
  const chosenWeight = latest?.bestWeight || bestWeight;
  const bestRepsAtWeight = Math.max(0, ...rows.flatMap(row => row.workingSets)
    .filter(set => (parseFloat(set?.w) || 0) === chosenWeight)
    .map(set => parseInt(set?.r, 10) || 0));
  const totalVolume = rows.reduce((sum, row) => sum + row.volumeKg, 0);
  const totalSets = rows.reduce((sum, row) => sum + row.workingSets.length, 0);
  const maxVolume = Math.max(1, ...rows.map(row => row.volumeKg));
  const comparison = latest && previous
    ? comparePeriodValues({ currentValue: latest.volumeKg, previousValue: previous.volumeKg, isCurrentWeek: false })
    : null;
  const rangeButton = (id, label) => `<button class="an-segment__button ${_exerciseRange === id ? 'is-active' : ''}" data-exercise-range="${id}" aria-pressed="${_exerciseRange === id}">${label}</button>`;

  root.innerHTML = `<header class="an-detail-head"><div><span class="an-detail-kicker">Exercise analytics</span><h2>${esc(name)}</h2></div></header>
    <nav class="an-segment an-segment--three" aria-label="Exercise history range">${rangeButton('12w', '12 weeks')}${rangeButton('6m', '6 months')}${rangeButton('all', 'All time')}</nav>
    ${!rows.length ? '<div class="an-empty-state"><strong>No completed history in this range</strong><span>Try a longer range or complete a working set for this exercise.</span></div>' : `
      <section class="an-volume-summary" aria-label="Exercise summary">
        <article><span>Latest performance</span><strong>${latest ? fmtVolume(latest.volumeKg, unit) : '—'}</strong></article>
        <article><span>Best weight</span><strong>${bestWeight ? `${bestWeight} ${unit}` : '—'}</strong></article>
        <article><span>${isE1rmExercise(name) ? 'Best estimated 1RM' : 'Best reps at latest weight'}</span><strong>${isE1rmExercise(name) && bestE1rm ? `${Math.round(bestE1rm)} ${unit}` : (bestRepsAtWeight || '—')}</strong></article>
        <article><span>Frequency</span><strong>${rows.length} sessions</strong></article>
      </section>
      <article class="an-volume-compare"><div><span class="an-volume-compare__label">Latest vs previous session</span><strong class="an-volume-compare__value">${comparison?.isComparable ? `${comparison.percentageChange > 0 ? '+' : ''}${comparison.percentageChange}% volume` : (comparison?.message || 'First session in range')}</strong><span class="an-volume-compare__meta">Same exercise · aliases combined</span></div><div class="an-volume-compare__periods"><span>${totalSets} working sets</span><span>${fmtVolume(totalVolume, unit)} total</span></div></article>
      <section class="an-volume-panel"><div class="an-volume-panel__head"><h3>Session history</h3><span>Tap a session for evidence</span></div>
        <div class="an-exercise-trend" aria-label="Volume trend by session">${[...rows].reverse().map(row => `<span title="${esc(fmtDate(row.date))}: ${esc(fmtVolume(row.volumeKg, unit))}" style="height:${Math.max(5, Math.round(row.volumeKg / maxVolume * 100))}%"></span>`).join('')}</div>
        <div class="an-evidence-list">${rows.map(row => `<button class="an-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(row.activityId)}"><span class="an-evidence-row__date">${esc(fmtDate(row.date))}</span><span class="an-evidence-row__body"><span class="an-evidence-row__title">${row.bestWeight ? `${row.bestWeight} ${unit} top load · ${row.reps} total reps` : `${row.reps} total reps`}</span><span class="an-evidence-row__meta">${row.workingSets.length} sets · ${fmtVolume(row.volumeKg, unit)}${row.e1rm ? ` · ${Math.round(row.e1rm)} ${unit} e1RM` : ''}</span></span><span class="an-evidence-row__arrow" aria-hidden="true">›</span></button>`).join('')}</div>
      </section>`}
    <details class="an-method"><summary>How is this calculated?</summary><p>History follows this exercise across programs and merges only explicit catalogue aliases. Volume is weight × reps for completed working sets. Estimated 1RM is shown only for eligible loaded strength exercises; bodyweight, band and unsuitable high-rep sets are not forced into that estimate.</p></details>`;

  root.querySelectorAll('[data-exercise-range]').forEach(button => button.addEventListener('click', () => {
    _exerciseRange = button.getAttribute('data-exercise-range') || '12w';
    renderExerciseDetail(state, entity);
  }));
}

/** @param {any} state @param {{id?:string,name?:string}} entity @param {string} weekStart */
export function renderMuscleDetail(state, entity = {}, weekStart) {
  const root = document.getElementById('strengthEntityDetail');
  if (!root) return;
  const id = entity.id || '';
  const name = entity.name || muscleName(id);
  const model = buildWeeklyStrengthVolumeDetail(state, { weekStart });
  const current = model.muscles.find(item => item.id === id) || { directSets: 0, indirectSets: 0, totalSetCredits: 0, exerciseIds: [], exerciseCredits: [], workoutIds: [] };
  const previousMuscle = model.comparisonPeriod.muscles.find(item => item.id === id);
  const comparison = comparePeriodValues({ currentValue: current.totalSetCredits, previousValue: previousMuscle?.totalSetCredits ?? null, isCurrentWeek: model.isCurrentWeek });
  const landmarks = VOLUME_LANDMARKS[id];
  const zone = landmarks ? classifyVolume(current.totalSetCredits, landmarks) : 'no_data';
  const series = Array.from({ length: 8 }, (_, index) => {
    const start = addDaysISO(weekStart, (index - 7) * 7);
    const week = buildWeeklyStrengthVolumeDetail(state, { weekStart: start });
    return { start, value: week.muscles.find(item => item.id === id)?.totalSetCredits || 0 };
  });
  const max = Math.max(1, ...series.map(item => item.value));
  const workouts = model.workouts.filter(workout => current.workoutIds.includes(workout.id));
  const contributingExercises = current.exerciseCredits || [];

  root.innerHTML = `<header class="an-detail-head"><div><span class="an-detail-kicker">Muscle analytics</span><h2>${esc(name)}</h2></div><span class="an-period-status ${model.isCurrentWeek ? 'is-live' : ''}">${model.status}</span></header>
    <p class="an-detail-period">${fmtDate(model.weekStart)} – ${fmtDate(model.weekEnd)}</p>
    <section class="an-volume-summary" aria-label="Estimated muscle-set summary">
      <article><span>Total set credits</span><strong>${current.totalSetCredits.toFixed(1)}</strong></article>
      <article><span>Direct sets</span><strong>${current.directSets.toFixed(1)}</strong></article>
      <article><span>Indirect sets</span><strong>${current.indirectSets.toFixed(1)}</strong></article>
      <article><span>Current range</span><strong>${landmarks ? esc(zoneLabel(zone)) : 'No benchmark'}</strong></article>
    </section>
    <article class="an-volume-compare"><div><span class="an-volume-compare__label">Period comparison</span><strong class="an-volume-compare__value">${comparison.isComparable ? `${comparison.percentageChange > 0 ? '+' : ''}${comparison.percentageChange}%` : esc(comparison.message || 'No comparison')}</strong><span class="an-volume-compare__meta">${esc(comparison.comparisonLabel)}</span></div><div class="an-volume-compare__periods"><span>${current.totalSetCredits.toFixed(1)} selected</span><span>${comparison.previousTotal == null ? '—' : comparison.previousTotal.toFixed(1)} prior</span></div></article>
    <section class="an-volume-panel"><div class="an-volume-panel__head"><h3>8-week trend</h3><span>Estimated set credits</span></div><div class="an-muscle-trend">${series.map(item => `<div><span style="height:${Math.max(4, Math.round(item.value / max * 100))}%"></span><small>${item.value ? item.value.toFixed(1) : '0'}</small></div>`).join('')}</div></section>
    <section class="an-volume-panel"><div class="an-volume-panel__head"><h3>Contributors</h3><span>${contributingExercises.length} exercises</span></div>${contributingExercises.length ? contributingExercises.map(item => `<div class="an-metric-row"><span class="an-metric-label">${esc(item.name)}<small>${item.directSets.toFixed(1)} direct · ${item.indirectSets.toFixed(1)} indirect</small></span><span class="an-metric-value">${item.totalSetCredits.toFixed(1)} credits</span></div>`).join('') : '<div class="an-empty-inline">No mapped exercises contributed in this period.</div>'}</section>
    <section class="an-volume-panel"><div class="an-volume-panel__head"><h3>Contributing workouts</h3><span>Exact evidence</span></div><div class="an-evidence-list">${workouts.length ? workouts.map(workout => `<button class="an-evidence-row" data-action="open-activity-detail" data-activity-id="${esc(workout.id)}"><span class="an-evidence-row__date">${esc(fmtDate(workout.date))}</span><span class="an-evidence-row__body"><span class="an-evidence-row__title">${esc(workout.title)}</span><span class="an-evidence-row__meta">${workout.workingSets} total workout sets</span></span><span class="an-evidence-row__arrow">›</span></button>`).join('') : '<div class="an-empty-inline">No contributing workouts in this period.</div>'}</div></section>
    <details class="an-method"><summary>How are muscle sets estimated?</summary><p>Each completed working set gives 1.0 credit to the exercise’s main muscle and 0.5 or 0.25 to meaningful secondary muscles. Historical results use the current exercise catalogue, so a later classification update can change the retrospective breakdown.</p>${landmarks ? `<p>Typical reference bands for ${esc(name)}: maintenance ${landmarks.mv}–${landmarks.mev - 0.1}, growth ${landmarks.mev}–${landmarks.mav - 0.1}, higher volume from ${landmarks.mav}. These are general training references, not personalised medical advice.</p>` : ''}</details>`;
}
