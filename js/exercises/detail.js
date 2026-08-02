// @ts-check
// Shared exercise technique/details surface for logging and program building.

import { escapeHtml } from '../util.js';
import {
  EXERCISE_CATEGORY_LABELS, equipmentLabel, resolveExercise,
} from './catalog.js';
import { closeManagedModal, openManagedModal } from '../ui/modal-stack.js';

let obscuredParentModal = null;

function label(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Render supported catalogue metadata without inventing guidance for legacy
 * entries that have not yet been editorially reviewed.
 */
export function exerciseDetailHtml(value) {
  const item = resolveExercise(value);
  if (!item) return '<p class="exercise-detail__empty">Exercise details are not available.</p>';
  const primary = Object.keys(item.muscles).filter((muscle) => item.muscles[muscle] === 1);
  const secondary = Object.keys(item.muscles).filter((muscle) => item.muscles[muscle] > 0 && item.muscles[muscle] < 1);
  const chips = [
    EXERCISE_CATEGORY_LABELS[item.category] || label(item.category),
    item.difficulty ? label(item.difficulty) : '',
    label(item.movement),
    ...item.equipment.map(equipmentLabel),
  ].filter(Boolean);
  const guidance = item.instructions.length
    ? `<ol class="exercise-detail__steps">${item.instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
    : '<p class="exercise-detail__empty">Technique guidance has not been added for this exercise yet.</p>';
  const safety = item.safetyNotes.length
    ? `<ul class="exercise-detail__safety">${item.safetyNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
    : '<p class="exercise-detail__empty">No exercise-specific safety notes are available.</p>';
  return `<header class="exercise-detail__hero">
      <p class="exercise-detail__eyebrow">EXERCISE GUIDE</p>
      <h2 id="exerciseDetailTitle">${escapeHtml(item.name)}</h2>
      <div class="exercise-detail__chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>
    </header>
    <section class="exercise-detail__section">
      <h3>Muscles</h3>
      <dl class="exercise-detail__muscles">
        <div><dt>Primary</dt><dd>${primary.length ? primary.map(label).join(', ') : 'Not classified'}</dd></div>
        <div><dt>Secondary</dt><dd>${secondary.length ? secondary.map(label).join(', ') : 'None listed'}</dd></div>
      </dl>
    </section>
    <section class="exercise-detail__section"><h3>How to perform it</h3>${guidance}</section>
    <section class="exercise-detail__section exercise-detail__section--safety"><h3>Safety</h3>${safety}</section>`;
}

export function openExerciseDetail(value) {
  const modal = document.getElementById('exerciseDetailModal');
  const body = document.getElementById('exerciseDetailBody');
  if (!modal || !body || !resolveExercise(value)) return;
  obscuredParentModal = document.activeElement instanceof Element
    ? document.activeElement.closest('[data-modal-root]')
    : null;
  if (obscuredParentModal === modal) obscuredParentModal = null;
  body.innerHTML = exerciseDetailHtml(value);
  modal.classList.add('active');
  openManagedModal(modal, { initialFocus: '[data-action="close-exercise-detail"]' });
  // Only the topmost dialog is exposed to assistive technology. The shared
  // modal stack restores background interaction; this explicit parent state
  // keeps a nested picker/detail pair from simultaneously claiming aria-modal.
  if (obscuredParentModal) {
    obscuredParentModal.setAttribute('inert', '');
    obscuredParentModal.setAttribute('aria-hidden', 'true');
    obscuredParentModal.removeAttribute('aria-modal');
  }
}

export function closeExerciseDetail() {
  const modal = document.getElementById('exerciseDetailModal');
  if (!modal) return;
  modal.classList.remove('active');
  closeManagedModal(modal);
  if (obscuredParentModal) {
    obscuredParentModal.removeAttribute('inert');
    obscuredParentModal.setAttribute('aria-hidden', 'false');
    obscuredParentModal.setAttribute('aria-modal', 'true');
    obscuredParentModal = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (target?.getAttribute('data-action') === 'close-exercise-detail') closeExerciseDetail();
  });
}
