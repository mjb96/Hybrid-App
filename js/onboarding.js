// ==========================================
// ONBOARDING FLOW
// ==========================================
import { saveStateToLocalStorage } from './state.js';

let _getState;

export function initOnboarding(getStateFn) {
  _getState = getStateFn;
}

export function shouldShowOnboarding() {
  const s = _getState();
  if (s.settings?.onboardingComplete) return false;

  // Existing user: has logged data or a saved name — skip onboarding and mark done
  const hasData = s.settings?.name
    || Object.keys(s.weeks || {}).length > 0
    || (s.bodyWeightLog || []).length > 0
    || (s.customExercises || []).length > 0;

  if (hasData) {
    if (!s.settings) s.settings = {};
    s.settings.onboardingComplete = true;
    import('./state.js').then(({ saveStateToLocalStorage }) => saveStateToLocalStorage(true));
    return false;
  }

  return true;
}

export function startOnboarding() {
  const overlay = document.getElementById('onboardingOverlay');
  if (!overlay) return;
  _showStep(1);
  overlay.classList.add('active');
}

const GOAL_PROGRAMS = {
  strength:  ['ppl_hypertrophy', 'jacked_and_tan_2', 'reddit_ppl', 'nsuns_531'],
  hybrid:    ['hybrid_engine', 'hybrid_strength_5k', 'kong_savage_size'],
  endurance: ['hybrid_engine', 'hybrid_strength_5k'],
};

const PROGRAM_META = {
  hybrid_engine:       { name: 'Sub-20 5K Hybrid Engine',       desc: 'Balanced running performance & strength' },
  hybrid_strength_5k:  { name: 'Hybrid Strength & 5K Builder',  desc: 'Strength-first with structured aerobic work' },
  kong_savage_size:    { name: 'KONG: Savage Size',             desc: 'Intensity-focused hypertrophy' },
  ppl_hypertrophy:     { name: 'Push Pull Legs',                desc: 'Classic 6-day hypertrophy split' },
  jacked_and_tan_2:    { name: 'GZCL: Jacked & Tan 2.0',       desc: 'Tier-based powerlifting progression' },
  reddit_ppl:          { name: 'Reddit PPL',                    desc: 'High-volume 6-day proven program' },
  nsuns_531:           { name: 'nSuns 5/3/1',                   desc: 'Autoregulated strength + accessory work' },
};

let _selectedGoal    = 'hybrid';
let _selectedProgram = 'hybrid_engine';
let _weightUnit      = 'kg';
let _distUnit        = 'km';

function _showStep(n) {
  document.querySelectorAll('.ob-step').forEach((el, i) => {
    el.classList.toggle('ob-step-active', i + 1 === n);
  });
}

function _renderProgramList() {
  const list = document.getElementById('obProgramList');
  if (!list) return;
  const ids = GOAL_PROGRAMS[_selectedGoal] || [];
  list.innerHTML = ids.map(id => {
    const m = PROGRAM_META[id] || { name: id, desc: '' };
    return `<button class="ob-prog-card${id === _selectedProgram ? ' active' : ''}" data-action="ob-program" data-program="${id}">
      <span class="ob-prog-name">${m.name}</span>
      <span class="ob-prog-desc">${m.desc}</span>
    </button>`;
  }).join('');
}

export function handleOnboardingAction(action, target) {
  if (action === 'ob-next') {
    const toStep = parseInt(target.dataset.to, 10);
    if (toStep === 2) {
      const name = document.getElementById('obName')?.value?.trim();
      if (!name) { document.getElementById('obName')?.focus(); return; }
    }
    _showStep(toStep);
  } else if (action === 'ob-back') {
    _showStep(parseInt(target.dataset.to, 10));
  } else if (action === 'ob-goal') {
    _selectedGoal = target.dataset.goal;
    document.querySelectorAll('[data-action="ob-goal"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
    _selectedProgram = GOAL_PROGRAMS[_selectedGoal]?.[0] || 'hybrid_engine';
    _renderProgramList();
    setTimeout(() => _showStep(3), 120);
  } else if (action === 'ob-program') {
    _selectedProgram = target.dataset.program;
    document.querySelectorAll('[data-action="ob-program"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
    setTimeout(() => _showStep(4), 180);
  } else if (action === 'ob-unit') {
    _weightUnit = target.dataset.unit;
    document.querySelectorAll('[data-action="ob-unit"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-dist-unit') {
    _distUnit = target.dataset.unit;
    document.querySelectorAll('[data-action="ob-dist-unit"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-finish') {
    _finish();
  }
}

function _finish() {
  const appState = _getState();
  if (!appState.settings) appState.settings = {};

  const name = document.getElementById('obName')?.value?.trim();
  if (name) appState.settings.name = name;

  appState.activeProgramId         = _selectedProgram;
  appState.settings.weightUnit     = _weightUnit;
  appState.settings.distanceUnit   = _distUnit;
  appState.settings.onboardingComplete = true;
  document.documentElement.dataset.theme = appState.settings.theme || 'dark';

  const bw = parseFloat(document.getElementById('obBodyWeight')?.value);
  if (!isNaN(bw) && bw > 0) {
    appState.settings.defaultBodyWeight = bw;
    if (!appState.bodyWeightLog) appState.bodyWeightLog = [];
    const today = new Date().toISOString().slice(0, 10);
    const idx = appState.bodyWeightLog.findIndex(l => l.date === today);
    if (idx >= 0) appState.bodyWeightLog[idx].weight = bw;
    else appState.bodyWeightLog.push({ date: today, weight: bw });
  }

  saveStateToLocalStorage(true);

  const initials = name
    ? name.trim().split(/\s+/).map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : '?';
  ['profileAvatarInitials', 'settingsAvatarLarge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });
  const nameDisplay = document.getElementById('settingsNameDisplay');
  if (nameDisplay) nameDisplay.textContent = name || 'Athlete';

  document.getElementById('onboardingOverlay')?.classList.remove('active');
  document.dispatchEvent(new Event('app:storage-loaded'));
}
