// ==========================================
// PROGRAM BUILDER LOGIC (program_builder.js)
//
// Edits a custom program's *trainable* shape: days{} object map (mon..sun),
// each day carrying { title, runs, lifts[] }. This is exactly what the cockpit
// and verifyWeekStorageSchema/reseedActiveProgramIntoWeek seed from (state.js),
// so a program built here loads as real, loggable exercises when made active.
// Sets/reps come from the program's weekly modifiers (createCustomProgram seeds
// them), not from per-exercise overrides — keep it honest about what the engine
// actually reads.
// ==========================================
import { saveStateToLocalStorage, getProgramById } from './state.js';
import { escapeHtml } from './util.js';
import { ensureWeeklyMods, setWeekField, markWeekDeload, isDeloadWeek, weekKeys } from './programs/progression.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

let activeBuilderId = null;

export function openBuilder(programId) {
  activeBuilderId = programId;
  const program = getProgramById(programId);
  if (!program) return;

  const container = document.getElementById('builderViewContainer');
  if (container) container.style.display = 'block';

  // Hide the sibling program sub-screens so the builder owns the view.
  const libraryScreen = document.getElementById('programLibraryScreen');
  if (libraryScreen) libraryScreen.style.display = 'none';
  const detailScreen = document.getElementById('programDetailScreen');
  if (detailScreen) detailScreen.style.display = 'none';
  const activePlan = document.getElementById('progActivePlanView');
  if (activePlan) activePlan.style.display = 'none';

  renderBuilderUI(program);
}

// Guarantee the day map exists with the trainable shape before we render/edit.
function ensureDays(program) {
  if (!program.days || Array.isArray(program.days)) program.days = {};
  DAYS.forEach(d => {
    if (!program.days[d] || typeof program.days[d] !== 'object') {
      program.days[d] = { title: 'Rest', badge: 'Rest', color: 'var(--text-muted)', desc: '', runs: 'Rest', lifts: [] };
    }
    if (!Array.isArray(program.days[d].lifts)) program.days[d].lifts = [];
  });
}

// ==========================================
// UI GENERATORS (Pure DOM String Builders)
// ==========================================

function renderBuilderUI(program) {
  const container = document.getElementById('builderViewContainer');
  if (!container) return;
  ensureDays(program);
  ensureWeeklyMods(program);

  container.innerHTML = `
    <button class="subview-back-btn" data-action="close-builder">← Back to Library</button>
    <div class="card-dark p-4 mb-4">
      <h2 class="text-xl font-heavy text-inverse">${escapeHtml(program.name || 'Custom Program')}</h2>
      <p class="text-sm text-muted">${escapeHtml(program.dossier?.focus || 'Custom Program')} · ${program.totalWeeks || 12} weeks</p>
      <p class="text-xs text-muted" style="margin-top:8px;">Add the lifts you want to train on each day, then set how sets &amp; reps progress week to week below. Leave a day on "Rest" with no lifts for a rest day.</p>
      <p class="text-xs text-muted" style="margin-top:6px;opacity:0.85;">✓ Changes save automatically as you type.</p>
    </div>
    <div id="builderDaysContainer">
      ${DAYS.map(d => renderDayCard(program, d)).join('')}
    </div>
    ${renderProgressionSection(program)}
  `;
}

// ── Weekly progression editor (edits weeklyVolModifiers → read by the cockpit) ──
function renderProgressionSection(program) {
  return `
    <div class="card-dark p-4 mb-4" style="border: 1px solid var(--overlay-sm);">
      <div class="flex-between mb-2">
        <h3 class="font-heavy text-lg">Weekly progression</h3>
      </div>
      <p class="text-xs text-muted" style="margin-bottom:12px;">Sets &amp; reps apply to every lift trained that week. Set the arc across your ${weekKeys(program).length} weeks and mark deloads — this is exactly what the workout screen prescribes.</p>
      <div class="flex-col gap-2" id="builderWeeksContainer">
        ${weekKeys(program).map(wk => renderWeekRow(program, wk)).join('')}
      </div>
    </div>
  `;
}

function renderWeekRow(program, wk) {
  const m = program.weeklyVolModifiers[wk] || { sets: 3, reps: 10, intensityLabel: '' };
  const deload = isDeloadWeek(m);
  const inputBase = 'background: rgba(0,0,0,0.3); border: 1px solid var(--overlay-sm); color: var(--text-inverse); padding: 6px; border-radius: 4px; font-size: 0.8rem;';
  return `
    <div class="flex gap-2 align-center" style="flex-wrap:wrap;${deload ? 'border-left:3px solid var(--accent-cyan);padding-left:8px;' : ''}">
      <span class="text-xs text-muted" style="min-width:34px;font-variant-numeric:tabular-nums;">Wk ${wk}</span>
      <input type="number" min="1" max="12" value="${escapeHtml(String(m.sets))}" data-action="b-week-sets" data-wk="${wk}" aria-label="Week ${wk} sets" title="Sets" style="${inputBase} width:52px; text-align:center;">
      <span class="text-xs text-muted">×</span>
      <input type="text" value="${escapeHtml(String(m.reps))}" data-action="b-week-reps" data-wk="${wk}" aria-label="Week ${wk} reps" title="Reps (e.g. 5 or 8-10)" style="${inputBase} width:60px; text-align:center;">
      <input type="text" value="${escapeHtml(String(m.intensityLabel || ''))}" data-action="b-week-label" data-wk="${wk}" aria-label="Week ${wk} phase label" placeholder="Phase label (e.g. Build, Peak)" style="${inputBase} flex:1; min-width:120px;">
      <button class="btn-pad tactile-scale" style="font-size:0.7rem;${deload ? 'color:var(--accent-cyan);border-color:rgba(34,211,238,0.4);' : ''}" data-action="b-week-deload" data-wk="${wk}">${deload ? 'Deload ✓' : 'Deload'}</button>
    </div>
  `;
}

function renderDayCard(program, dayKey) {
  const day = program.days[dayKey];
  const lifts = day.lifts || [];

  return `
    <div class="card-dark p-4 mb-4" style="border: 1px solid var(--overlay-sm);">
      <div class="flex-between mb-3">
        <h3 class="font-heavy text-lg">${DAY_LABELS[dayKey]}</h3>
      </div>

      <div class="mb-2">
        <label class="block text-muted" style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Day name</label>
        <input type="text" value="${escapeHtml(day.title || '')}" data-action="b-day-title" data-day="${dayKey}" placeholder="e.g. Push Day — or 'Rest' for a rest day" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--overlay-sm); color: var(--accent-blue); padding: 6px; border-radius: 4px; font-size: 0.85rem;">
      </div>

      <div class="mb-3">
        <label class="block text-muted" style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px;">Run / cardio <span style="font-weight:400;text-transform:none;letter-spacing:0;">— leave "Rest" for none</span></label>
        <input type="text" value="${escapeHtml(day.runs || 'Rest')}" data-action="b-day-runs" data-day="${dayKey}" placeholder="e.g. 5km Easy — or 'Rest'" style="width: 100%; background: rgba(0,0,0,0.3); border: 1px solid var(--overlay-sm); color: var(--accent-cyan); padding: 6px; border-radius: 4px; font-size: 0.8rem;">
      </div>

      <div class="flex-col gap-2 mb-3">
        ${lifts.map((name, i) => renderLiftRow(dayKey, name, i, lifts.length)).join('')}
      </div>

      <button class="btn-pad" style="font-size: 0.75rem;" data-action="b-add-lift" data-day="${dayKey}">+ Add Lift</button>
      ${lifts.length ? `<p class="text-xs text-muted" style="margin-top:8px;opacity:0.85;">Sets &amp; reps for these lifts are set per week in <strong>Weekly progression</strong> below — not per lift.</p>` : ''}
    </div>
  `;
}

function renderLiftRow(dayKey, name, i, count) {
  const upDisabled = i === 0;
  const downDisabled = i === count - 1;
  const arrowStyle = 'width:34px;min-width:34px;height:28px;padding:0;font-size:0.75rem;display:flex;align-items:center;justify-content:center;';
  return `
    <div class="flex gap-2 align-center">
      <div class="flex-col" style="justify-content: center; gap: 4px;">
        <button class="btn-pad tactile-scale" aria-label="Move up" style="${arrowStyle}${upDisabled ? 'opacity:0.3;' : ''}" data-action="b-move-up" data-day="${dayKey}" data-i="${i}" ${upDisabled ? 'disabled' : ''}>▲</button>
        <button class="btn-pad tactile-scale" aria-label="Move down" style="${arrowStyle}${downDisabled ? 'opacity:0.3;' : ''}" data-action="b-move-down" data-day="${dayKey}" data-i="${i}" ${downDisabled ? 'disabled' : ''}>▼</button>
      </div>
      <input type="text" value="${escapeHtml(name || '')}" data-action="b-lift-name" data-day="${dayKey}" data-i="${i}" placeholder="Exercise name" style="flex: 2;">
      <button class="btn-pad" aria-label="Remove lift" style="width:38px;min-width:38px;height:38px;padding:0;color: var(--accent-red);" data-action="b-remove-lift" data-day="${dayKey}" data-i="${i}">✕</button>
    </div>
  `;
}

// ==========================================
// PRIVATE ACTION CONTROLLERS
// ==========================================

const getProg = () => getProgramById(activeBuilderId);

function setDayField(dayKey, field, val) {
  const prog = getProg();
  if (!prog) return;
  ensureDays(prog);
  prog.days[dayKey][field] = val;
  saveStateToLocalStorage(true);
  // No re-render: keep the input focused while typing/blurring.
}

function addLift(dayKey) {
  const prog = getProg();
  if (!prog) return;
  ensureDays(prog);
  prog.days[dayKey].lifts.push('');
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
}

function removeLift(dayKey, i) {
  const prog = getProg();
  const lifts = prog?.days?.[dayKey]?.lifts;
  if (!Array.isArray(lifts) || i < 0 || i >= lifts.length) return;
  lifts.splice(i, 1);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
}

function updateLift(dayKey, i, val) {
  const prog = getProg();
  const lifts = prog?.days?.[dayKey]?.lifts;
  if (!Array.isArray(lifts) || i < 0 || i >= lifts.length) return;
  lifts[i] = val;
  saveStateToLocalStorage(true);
  // No re-render: preserve input focus.
}

function moveLift(dayKey, i, dir) {
  const prog = getProg();
  const lifts = prog?.days?.[dayKey]?.lifts;
  if (!Array.isArray(lifts)) return;
  const j = i + dir;
  if (j < 0 || j >= lifts.length) return;
  [lifts[i], lifts[j]] = [lifts[j], lifts[i]];
  saveStateToLocalStorage(true);
  renderBuilderUI(prog);
}

// ── Weekly progression edits (delegate to the pure progression module) ────────
function updateWeekField(wk, field, val) {
  const prog = getProg();
  if (!prog) return;
  setWeekField(prog, wk, field, val);
  saveStateToLocalStorage(true);
  // No re-render: preserve input focus while typing/blurring.
}

function toggleWeekDeload(wk) {
  const prog = getProg();
  if (!prog) return;
  markWeekDeload(prog, wk);
  saveStateToLocalStorage(true);
  renderBuilderUI(prog); // structural: updates the sets input + button state
}

const closeBuilder = () => {
  const container = document.getElementById('builderViewContainer');
  if (container) container.style.display = 'none';
  const libraryScreen = document.getElementById('programLibraryScreen');
  if (libraryScreen) libraryScreen.style.display = 'block';
  document.dispatchEvent(new CustomEvent('app:library-updated'));
};

// ==========================================
// EVENT DELEGATION ROUTER (scoped to #builderViewContainer)
// ==========================================

document.addEventListener('click', (e) => {
  const target = e.target.closest('#builderViewContainer [data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const dayKey = target.getAttribute('data-day');
  const i = parseInt(target.getAttribute('data-i'), 10);

  if (action === 'close-builder') closeBuilder();
  else if (action === 'b-add-lift') addLift(dayKey);
  else if (action === 'b-remove-lift') removeLift(dayKey, i);
  else if (action === 'b-move-up') moveLift(dayKey, i, -1);
  else if (action === 'b-move-down') moveLift(dayKey, i, 1);
  else if (action === 'b-week-deload') toggleWeekDeload(target.getAttribute('data-wk'));
});

// Listen on `input` (not `change`) so edits persist per keystroke — this is what
// makes the "changes save automatically as you type" promise literally true, and
// stops the last field being lost if the app is backgrounded before a blur fires.
// None of these handlers re-render, so the focused input is never disturbed.
document.addEventListener('input', (e) => {
  const target = e.target.closest('#builderViewContainer [data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const dayKey = target.getAttribute('data-day');
  const i = parseInt(target.getAttribute('data-i'), 10);
  const val = target.value;

  if (action === 'b-day-title') setDayField(dayKey, 'title', val);
  else if (action === 'b-day-runs') setDayField(dayKey, 'runs', val);
  else if (action === 'b-lift-name') updateLift(dayKey, i, val);
  else if (action === 'b-week-sets') updateWeekField(target.getAttribute('data-wk'), 'sets', val);
  else if (action === 'b-week-reps') updateWeekField(target.getAttribute('data-wk'), 'reps', val);
  else if (action === 'b-week-label') updateWeekField(target.getAttribute('data-wk'), 'intensityLabel', val);
});
