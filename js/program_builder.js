// @ts-check
// Mobile-first custom program editor. Stored programs intentionally retain the
// v1 bare-string exercise shape; the deeper per-exercise prescription contract
// remains R20. This surface only exposes behaviour the workout engine supports.

import {
  saveStateToLocalStorage, getProgramById, appState, reconcileActiveProgramEdits,
} from './state.js';
import { escapeHtml } from './util.js';
import { EXERCISES, canonicalExerciseId, normaliseExerciseName } from './exercises/catalog.js';
import {
  ensureWeeklyMods, setWeekField, markWeekDeload, isDeloadWeek, weekKeys,
} from './programs/progression.js';
import {
  EDITOR_DAYS, EDITOR_DAY_LABELS, copyProgramDay, dayTrainingSummary,
  previewProgramWeek, programEditorSummary, validateProgramDraft,
} from './programs/editor-model.js';
import { confirmModal } from './ui/confirm-modal.js';
import { closeManagedModal, openManagedModal } from './ui/modal-stack.js';

let activeBuilderId = null;
let activeSection = 'schedule';
let selectedDay = 'mon';
let previewWeek = '1';
let pickerTarget = null;
let saveTimer = null;
let reconciliation = { updatedDays: 0, preservedDays: 0 };

function getProgram() { return getProgramById(activeBuilderId); }

function ensureDays(program) {
  if (!program.days || Array.isArray(program.days)) program.days = {};
  EDITOR_DAYS.forEach((day) => {
    if (!program.days[day] || typeof program.days[day] !== 'object') {
      program.days[day] = { title: 'Rest', badge: 'Rest', color: 'var(--text-muted)', desc: '', runs: 'Rest', lifts: [] };
    }
    if (!Array.isArray(program.days[day].lifts)) program.days[day].lifts = [];
    if (typeof program.days[day].runs !== 'string') program.days[day].runs = 'Rest';
  });
}

function setSaveStatus(label) {
  const status = document.getElementById('builderSaveStatus');
  if (status) status.textContent = label;
}

function persistProgram({ reconcile = true } = {}) {
  const program = getProgram();
  if (!program) return;
  if (reconcile) reconciliation = reconcileActiveProgramEdits(program.id);
  saveStateToLocalStorage(true);
  setSaveStatus('Saving on this device…');
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => setSaveStatus('Saved on this device'), 550);
}

export function openBuilder(programId) {
  activeBuilderId = programId;
  const program = getProgram();
  if (!program) return;
  ensureDays(program);
  ensureWeeklyMods(program);
  selectedDay = EDITOR_DAYS.find((day) => dayTrainingSummary(program.days[day]).training) || 'mon';
  activeSection = 'schedule';
  previewWeek = '1';
  reconciliation = { updatedDays: 0, preservedDays: 0 };

  const container = document.getElementById('builderViewContainer');
  if (container) container.style.display = 'block';
  for (const id of ['programLibraryScreen', 'programDetailScreen', 'progActivePlanView']) {
    const sibling = document.getElementById(id);
    if (sibling) sibling.style.display = 'none';
  }
  renderBuilderUI();
}

function renderBuilderUI() {
  const program = getProgram();
  const container = document.getElementById('builderViewContainer');
  if (!program || !container) return;
  ensureDays(program);
  ensureWeeklyMods(program);
  const summary = programEditorSummary(program);
  const active = appState.activeProgramId === program.id;

  container.innerHTML = `
    <div class="program-editor">
      <div class="program-editor__topbar">
        <button class="subview-back-btn program-editor__back" data-action="close-builder">← Programs</button>
        <span id="builderSaveStatus" class="program-editor__save" role="status">Saved on this device</span>
      </div>

      <section class="program-editor__hero" aria-labelledby="programEditorTitle">
        <div class="program-editor__eyebrow">CUSTOM PROGRAM</div>
        <input id="programEditorTitle" class="program-editor__title-input" type="text" maxlength="70"
          value="${escapeHtml(program.name || '')}" data-action="b-program-name" aria-label="Program name">
        <div class="program-editor__details-grid">
          <label><span>Focus</span><input type="text" maxlength="80" value="${escapeHtml(program.dossier?.focus || '')}" data-action="b-program-focus" placeholder="e.g. Strength + 10K"></label>
          <label><span>Length</span><div class="program-editor__weeks-input"><input type="number" min="1" max="52" value="${escapeHtml(String(program.totalWeeks || 12))}" data-action="b-program-weeks" aria-label="Program length in weeks"><span>weeks</span></div></label>
        </div>
        <div class="program-editor__summary" aria-label="Program summary">
          <span><strong>${summary.strengthDays}</strong> strength day${summary.strengthDays === 1 ? '' : 's'}</span>
          <span><strong>${summary.runDays}</strong> run day${summary.runDays === 1 ? '' : 's'}</span>
          <span><strong>${summary.totalExercises}</strong> exercises</span>
        </div>
        ${active ? `<div class="program-editor__active-note"><strong>Active plan</strong><span>Untouched workouts update automatically. Logged or started sessions are preserved.</span></div>` : ''}
      </section>

      <nav class="program-editor__tabs" aria-label="Program editor sections">
        ${renderTab('schedule', 'Schedule')}
        ${renderTab('progression', 'Progression')}
        ${renderTab('preview', 'Preview')}
      </nav>

      <div class="program-editor__body">
        ${activeSection === 'schedule' ? renderSchedule(program) : ''}
        ${activeSection === 'progression' ? renderProgression(program) : ''}
        ${activeSection === 'preview' ? renderPreview(program) : ''}
      </div>
    </div>
  `;
}

function renderTab(id, label) {
  const selected = activeSection === id;
  return `<button class="program-editor__tab${selected ? ' is-active' : ''}" data-action="b-section" data-section="${id}" role="tab" aria-selected="${selected}">${label}</button>`;
}

function renderSchedule(program) {
  const day = program.days[selectedDay];
  const summary = dayTrainingSummary(day);
  return `
    <section aria-labelledby="builderScheduleTitle">
      <div class="program-editor__section-heading">
        <div><div class="program-editor__eyebrow">WEEKLY SCHEDULE</div><h2 id="builderScheduleTitle">Choose a day to edit</h2></div>
      </div>
      <div class="program-editor__day-strip" role="tablist" aria-label="Training days">
        ${EDITOR_DAYS.map((key) => {
          const item = dayTrainingSummary(program.days[key]);
          const selected = key === selectedDay;
          return `<button class="program-editor__day${selected ? ' is-active' : ''}${item.training ? ' has-training' : ''}" data-action="b-select-day" data-day="${key}" role="tab" aria-selected="${selected}">
            <span>${EDITOR_DAY_LABELS[key].slice(0, 3)}</span><small>${item.training ? item.lifts || 'Run' : 'Rest'}</small>
          </button>`;
        }).join('')}
      </div>

      <article class="program-editor__day-card">
        <div class="program-editor__day-heading">
          <div><span>${EDITOR_DAY_LABELS[selectedDay]}</span><strong>${escapeHtml(summary.label)}</strong></div>
          <button class="program-editor__rest-toggle${summary.training ? '' : ' is-rest'}" data-action="${summary.training ? 'b-mark-rest' : 'b-mark-training'}">${summary.training ? 'Make rest day' : 'Add training'}</button>
        </div>

        <label class="program-editor__field"><span>Session name</span><input type="text" maxlength="70" value="${escapeHtml(day.title || '')}" data-action="b-day-title" data-day="${selectedDay}" placeholder="e.g. Upper strength"></label>
        <label class="program-editor__field"><span>Run / cardio <small>Optional</small></span><input type="text" maxlength="120" value="${escapeHtml(day.runs || 'Rest')}" data-action="b-day-runs" data-day="${selectedDay}" placeholder="e.g. 5 km easy or 6 × 800 m"></label>

        <div class="program-editor__list-heading"><div><span>Exercises</span><small>${day.lifts.length} in workout order</small></div><button class="program-editor__add" data-action="b-open-picker" data-day="${selectedDay}">+ Add exercise</button></div>
        <div class="program-editor__exercise-list">
          ${day.lifts.length ? day.lifts.map((name, index) => renderExerciseRow(selectedDay, name, index, day.lifts.length)).join('') : `
            <button class="program-editor__empty" data-action="b-open-picker" data-day="${selectedDay}"><strong>No exercises yet</strong><span>Add the first exercise to this session</span></button>
          `}
        </div>

        <div class="program-editor__copy-row">
          <label><span>Copy another day</span><select id="builderCopySource" aria-label="Day to copy">${EDITOR_DAYS.filter((key) => key !== selectedDay).map((key) => `<option value="${key}">${EDITOR_DAY_LABELS[key]} · ${escapeHtml(dayTrainingSummary(program.days[key]).label)}</option>`).join('')}</select></label>
          <button class="btn-pad" data-action="b-copy-day" data-day="${selectedDay}">Copy</button>
        </div>
      </article>
    </section>
  `;
}

function renderExerciseRow(day, name, index, count) {
  return `
    <div class="program-editor__exercise-row">
      <div class="program-editor__order-controls" aria-label="Reorder ${escapeHtml(name)}">
        <button data-action="b-move-up" data-day="${day}" data-i="${index}" aria-label="Move ${escapeHtml(name)} up" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button data-action="b-move-down" data-day="${day}" data-i="${index}" aria-label="Move ${escapeHtml(name)} down" ${index === count - 1 ? 'disabled' : ''}>↓</button>
      </div>
      <button class="program-editor__exercise-name" data-action="b-open-picker" data-day="${day}" data-i="${index}"><strong>${escapeHtml(name)}</strong><span>Tap to replace</span></button>
      <button class="program-editor__remove" data-action="b-remove-lift" data-day="${day}" data-i="${index}" aria-label="Remove ${escapeHtml(name)}">×</button>
    </div>
  `;
}

function renderProgression(program) {
  return `
    <section aria-labelledby="builderProgressionTitle">
      <div class="program-editor__section-heading"><div><div class="program-editor__eyebrow">WEEK BY WEEK</div><h2 id="builderProgressionTitle">Progression</h2><p>These targets apply to every lift in that week. Per-exercise targets are coming in the structured-programming upgrade.</p></div></div>
      <div class="program-editor__week-list">
        ${weekKeys(program).map((week) => renderWeekRow(program, week)).join('')}
      </div>
    </section>
  `;
}

function renderWeekRow(program, week) {
  const modifier = program.weeklyVolModifiers[week] || { sets: 3, reps: 10, intensityLabel: '' };
  const deload = isDeloadWeek(modifier);
  return `
    <article class="program-editor__week${deload ? ' is-deload' : ''}">
      <div class="program-editor__week-title"><strong>Week ${week}</strong>${deload ? '<span>DELOAD</span>' : ''}${Number(week) > 1 ? `<button data-action="b-copy-week" data-wk="${week}">Copy W${Number(week) - 1}</button>` : ''}</div>
      <div class="program-editor__week-fields">
        <label><span>Sets</span><input type="number" min="1" max="12" value="${escapeHtml(String(modifier.sets))}" data-action="b-week-sets" data-wk="${week}"></label>
        <label><span>Reps</span><input type="text" maxlength="24" value="${escapeHtml(String(modifier.reps))}" data-action="b-week-reps" data-wk="${week}" placeholder="8–10"></label>
        <label class="program-editor__phase-field"><span>Phase</span><input type="text" maxlength="50" value="${escapeHtml(String(modifier.intensityLabel || ''))}" data-action="b-week-label" data-wk="${week}" placeholder="Build, Peak…"></label>
      </div>
      <button class="program-editor__deload${deload ? ' is-active' : ''}" data-action="b-week-deload" data-wk="${week}" ${deload ? 'disabled' : ''}>${deload ? 'Deload applied ✓' : 'Make this a deload'}</button>
    </article>
  `;
}

function renderPreview(program) {
  const issues = validateProgramDraft(program);
  const days = previewProgramWeek(program, previewWeek).filter((day) => day.lifts.length || day.run);
  return `
    <section aria-labelledby="builderPreviewTitle">
      <div class="program-editor__section-heading program-editor__preview-heading">
        <div><div class="program-editor__eyebrow">LOGGER PREVIEW</div><h2 id="builderPreviewTitle">What you will train</h2><p>Targets below use the same resolver as the workout logger.</p></div>
        <label><span>Week</span><select data-action="b-preview-week">${weekKeys(program).map((week) => `<option value="${week}" ${week === previewWeek ? 'selected' : ''}>${week}</option>`).join('')}</select></label>
      </div>
      ${issues.length ? `<div class="program-editor__issues" role="status">${issues.map((issue) => `<button data-action="b-open-issue" data-day="${issue.day || ''}" data-field="${issue.field || ''}" class="is-${issue.level}">${issue.level === 'error' ? 'Fix' : 'Check'} · ${escapeHtml(issue.message)}</button>`).join('')}</div>` : `<div class="program-editor__valid">Ready to train · no schedule issues found</div>`}
      <div class="program-editor__preview-list">
        ${days.length ? days.map((day) => `<article class="program-editor__preview-day"><div><span>${day.label}</span><strong>${escapeHtml(day.title)}</strong></div>${day.run ? `<p class="program-editor__preview-run">Run · ${escapeHtml(day.run)}</p>` : ''}<ul>${day.lifts.map((lift) => `<li><span>${escapeHtml(lift.name)}</span><strong>${escapeHtml(String(lift.sets))} × ${escapeHtml(String(lift.reps))}</strong></li>`).join('')}</ul></article>`).join('') : `<div class="program-editor__empty-static"><strong>No training sessions yet</strong><span>Add a workout in Schedule.</span></div>`}
      </div>
      ${reconciliation.preservedDays ? `<p class="program-editor__preserved">${reconciliation.preservedDays} started or logged workout slot${reconciliation.preservedDays === 1 ? ' was' : 's were'} preserved while this plan changed.</p>` : ''}
    </section>
  `;
}

function ensurePicker() {
  let root = document.getElementById('builderExercisePicker');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'builderExercisePicker';
  root.className = 'modal-overlay program-editor__picker-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-labelledby', 'builderExercisePickerTitle');
  root.setAttribute('data-modal-root', '');
  root.setAttribute('data-modal-close-action', 'b-close-picker');
  root.setAttribute('inert', '');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="modal-content program-editor__picker"><div class="program-editor__picker-head"><div><div class="program-editor__eyebrow">EXERCISE LIBRARY</div><h2 id="builderExercisePickerTitle">Add exercise</h2></div><button data-action="b-close-picker" aria-label="Close exercise picker">×</button></div><label class="program-editor__picker-search"><span class="sr-only">Search exercises</span><input id="builderExerciseSearch" type="search" autocomplete="off" placeholder="Search bench, squat, row…"></label><div id="builderExerciseResults" class="program-editor__picker-results"></div></div>`;
  document.body.appendChild(root);
  return root;
}

function openExercisePicker(day, index = null) {
  pickerTarget = { day, index: Number.isInteger(index) ? index : null };
  const root = ensurePicker();
  const title = root.querySelector('#builderExercisePickerTitle');
  if (title) title.textContent = pickerTarget.index == null ? 'Add exercise' : 'Replace exercise';
  const search = /** @type {HTMLInputElement|null} */ (root.querySelector('#builderExerciseSearch'));
  if (search) search.value = '';
  renderPickerResults('');
  root.classList.add('active');
  openManagedModal(root, { initialFocus: '#builderExerciseSearch' });
}

function closeExercisePicker() {
  const root = document.getElementById('builderExercisePicker');
  if (!root) return;
  root.classList.remove('active');
  closeManagedModal(root);
  pickerTarget = null;
}

function renderPickerResults(query) {
  const target = document.getElementById('builderExerciseResults');
  if (!target) return;
  const needle = normaliseExerciseName(query);
  const matches = EXERCISES.filter((item) => !needle || normaliseExerciseName(`${item.name} ${item.aliases.join(' ')}`).includes(needle)).slice(0, 40);
  target.innerHTML = `${matches.map((item) => `<button data-action="b-pick-exercise" data-name="${escapeHtml(item.name)}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.movement.replaceAll('_', ' '))} · ${escapeHtml(item.equipment.join(', '))}</small></span><b>+</b></button>`).join('')}${String(query || '').trim() ? `<button class="program-editor__custom-exercise" data-action="b-pick-custom" data-name="${escapeHtml(String(query).trim().slice(0, 80))}"><span><strong>Use “${escapeHtml(String(query).trim().slice(0, 80))}”</strong><small>Create a custom exercise name</small></span><b>+</b></button>` : ''}${!matches.length && !String(query || '').trim() ? '<p>No exercises found.</p>' : ''}`;
}

function sameExercise(a, b) {
  const aId = canonicalExerciseId(a);
  const bId = canonicalExerciseId(b);
  return aId && bId ? aId === bId : normaliseExerciseName(a) === normaliseExerciseName(b);
}

function chooseExercise(name) {
  const program = getProgram();
  if (!program || !pickerTarget || !String(name || '').trim()) return;
  const lifts = program.days[pickerTarget.day].lifts;
  const duplicate = lifts.some((existing, index) => index !== pickerTarget.index && sameExercise(existing, name));
  if (duplicate) {
    const results = document.getElementById('builderExerciseResults');
    if (results) results.insertAdjacentHTML('afterbegin', `<p class="program-editor__picker-error">${escapeHtml(name)} is already in this workout.</p>`);
    return;
  }
  if (pickerTarget.index == null) lifts.push(name);
  else lifts[pickerTarget.index] = name;
  persistProgram();
  closeExercisePicker();
  renderBuilderUI();
}

function setDayField(day, field, value) {
  const program = getProgram();
  if (!program) return;
  program.days[day][field] = value;
  persistProgram();
}

function moveLift(day, index, direction) {
  const program = getProgram();
  const lifts = program?.days?.[day]?.lifts;
  const next = index + direction;
  if (!Array.isArray(lifts) || next < 0 || next >= lifts.length) return;
  [lifts[index], lifts[next]] = [lifts[next], lifts[index]];
  persistProgram();
  renderBuilderUI();
}

async function removeLift(day, index) {
  const program = getProgram();
  const lifts = program?.days?.[day]?.lifts;
  if (!Array.isArray(lifts) || !lifts[index]) return;
  const ok = await confirmModal({ title: `Remove ${lifts[index]}?`, message: 'Logged workout history will remain safe.', confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  lifts.splice(index, 1);
  persistProgram();
  renderBuilderUI();
}

async function makeRestDay(day) {
  const program = getProgram();
  if (!program) return;
  const ok = await confirmModal({ title: `Make ${EDITOR_DAY_LABELS[day]} a rest day?`, message: 'This removes the exercises and run from the plan. Logged workouts remain safe.', confirmLabel: 'Make rest day', danger: true });
  if (!ok) return;
  Object.assign(program.days[day], { title: 'Rest', runs: 'Rest', lifts: [] });
  persistProgram();
  renderBuilderUI();
}

async function copyDay(targetDay) {
  const program = getProgram();
  const select = /** @type {HTMLSelectElement|null} */ (document.getElementById('builderCopySource'));
  const sourceDay = select?.value;
  if (!program || !sourceDay) return;
  const targetSummary = dayTrainingSummary(program.days[targetDay]);
  if (targetSummary.training) {
    const ok = await confirmModal({ title: `Replace ${EDITOR_DAY_LABELS[targetDay]}?`, message: `Copying ${EDITOR_DAY_LABELS[sourceDay]} replaces this planned day. Logged workout history remains safe.`, confirmLabel: 'Replace day', danger: true });
    if (!ok) return;
  }
  if (copyProgramDay(program, sourceDay, targetDay)) {
    persistProgram();
    renderBuilderUI();
  }
}

function copyPreviousWeek(week) {
  const program = getProgram();
  const prior = program?.weeklyVolModifiers?.[String(Number(week) - 1)];
  if (!program || !prior) return;
  program.weeklyVolModifiers[week] = { ...prior };
  persistProgram();
  renderBuilderUI();
}

function closeBuilder() {
  closeExercisePicker();
  const container = document.getElementById('builderViewContainer');
  if (container) container.style.display = 'none';
  const library = document.getElementById('programLibraryScreen');
  if (library) library.style.display = 'block';
  document.dispatchEvent(new CustomEvent('app:library-updated'));
}

document.addEventListener('click', async (event) => {
  const target = /** @type {HTMLElement|null} */ (event.target instanceof Element ? event.target.closest('[data-action]') : null);
  if (!target) return;
  const action = target.dataset.action;
  const day = target.dataset.day;
  const index = Number.parseInt(target.dataset.i || '', 10);

  if (action === 'b-close-picker') closeExercisePicker();
  else if (action === 'b-pick-exercise' || action === 'b-pick-custom') chooseExercise(target.dataset.name || '');
  else if (!target.closest('#builderViewContainer')) return;
  else if (action === 'close-builder') closeBuilder();
  else if (action === 'b-section') { activeSection = target.dataset.section || 'schedule'; renderBuilderUI(); }
  else if (action === 'b-select-day' && day) { selectedDay = day; renderBuilderUI(); }
  else if (action === 'b-open-picker' && day) openExercisePicker(day, Number.isNaN(index) ? null : index);
  else if (action === 'b-move-up' && day) moveLift(day, index, -1);
  else if (action === 'b-move-down' && day) moveLift(day, index, 1);
  else if (action === 'b-remove-lift' && day) await removeLift(day, index);
  else if (action === 'b-mark-rest' && day) await makeRestDay(day);
  else if (action === 'b-mark-training' && day) {
    const program = getProgram();
    if (program) { program.days[day].title = 'Training'; persistProgram(); renderBuilderUI(); openExercisePicker(day); }
  }
  else if (action === 'b-copy-day' && day) await copyDay(day);
  else if (action === 'b-copy-week') copyPreviousWeek(target.dataset.wk || '');
  else if (action === 'b-week-deload') {
    const program = getProgram();
    if (program) { markWeekDeload(program, target.dataset.wk); persistProgram(); renderBuilderUI(); }
  }
  else if (action === 'b-open-issue') {
    if (day) { selectedDay = day; activeSection = 'schedule'; renderBuilderUI(); }
    else if (target.dataset.field === 'name') document.getElementById('programEditorTitle')?.focus();
    else { activeSection = 'schedule'; renderBuilderUI(); }
  }
});

document.addEventListener('input', (event) => {
  const target = /** @type {HTMLInputElement|null} */ (event.target instanceof HTMLInputElement ? event.target : null);
  if (!target) return;
  if (target.id === 'builderExerciseSearch') { renderPickerResults(target.value); return; }
  if (!target.closest('#builderViewContainer')) return;
  const action = target.dataset.action;
  const program = getProgram();
  if (!program) return;
  if (action === 'b-program-name') { program.name = target.value; persistProgram({ reconcile: false }); }
  else if (action === 'b-program-focus') {
    if (!program.dossier) program.dossier = {};
    program.dossier.focus = target.value;
    persistProgram({ reconcile: false });
  }
  else if (action === 'b-day-title') setDayField(target.dataset.day, 'title', target.value);
  else if (action === 'b-day-runs') setDayField(target.dataset.day, 'runs', target.value);
  else if (action === 'b-week-sets') { setWeekField(program, target.dataset.wk, 'sets', target.value); persistProgram(); }
  else if (action === 'b-week-reps') { setWeekField(program, target.dataset.wk, 'reps', target.value); persistProgram(); }
  else if (action === 'b-week-label') { setWeekField(program, target.dataset.wk, 'intensityLabel', target.value); persistProgram(); }
});

document.addEventListener('change', (event) => {
  const target = /** @type {HTMLInputElement|HTMLSelectElement|null} */ (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ? event.target : null);
  if (!target?.closest('#builderViewContainer')) return;
  const program = getProgram();
  if (!program) return;
  if (target.dataset.action === 'b-program-weeks') {
    const minimum = appState.activeProgramId === program.id ? Math.max(1, Number(appState.currentWeek) || 1) : 1;
    program.totalWeeks = Math.max(minimum, Math.min(52, Math.round(Number(target.value) || 12)));
    ensureWeeklyMods(program);
    persistProgram();
    renderBuilderUI();
  } else if (target.dataset.action === 'b-preview-week') {
    previewWeek = target.value;
    renderBuilderUI();
  }
});
