// ==========================================
// ONBOARDING FLOW
// ==========================================
import { saveStateToLocalStorage } from './state.js';
import { requestNotificationPermission } from './notifications.js';
import { provisionalScore } from './onboarding/provisional-score.js';
import { recommendStarterPrograms } from './onboarding/starter-programs.js';
import { heroHTML } from './brain/hybrid-score/ui.js';

let _getState;

export function initOnboarding(getStateFn) {
  _getState = getStateFn;
}

export function shouldShowOnboarding() {
  const s = _getState();
  if (s.settings?.onboardingComplete) return false;

  // Existing user: had a saved state blob on load (or real logged data) — skip
  // onboarding and mark done. We deliberately DON'T test `weeks` here: boot seeds
  // an empty week scaffold before this runs, so a weeks-key check would flag every
  // brand-new install as "existing" and suppress onboarding entirely.
  const hasData = s._hadStoredState
    || s.settings?.name
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
let _fitnessLevel    = 'intermediate';
let _equipmentTier   = 'gym';
// V2-2 — the two self-reports (alongside experience level) that seed the
// provisional Hybrid Score reveal at the end of onboarding.
let _weeklyFrequency = 'some';   // low | some | high | daily
let _recoveryFeel    = 'ok';     // low | ok | fresh

function _showStep(n) {
  document.querySelectorAll('.ob-step').forEach((el, i) => {
    el.classList.toggle('ob-step-active', i + 1 === n);
  });
}

// C1 — the picker is now level- and equipment-aware. Rank the catalog against
// the three self-reports (goal · level · equipment) so the first program fits;
// fall back to the curated goal list if the recommender comes back empty.
function _renderProgramList() {
  const list = document.getElementById('obProgramList');
  if (!list) return;

  const recs = recommendStarterPrograms({
    goal: _selectedGoal, level: _fitnessLevel, equipmentTier: _equipmentTier,
  });

  let cards;
  if (recs.length) {
    // Keep the current selection if it's still in the list, else pick the top.
    if (!recs.some(p => p.id === _selectedProgram)) _selectedProgram = recs[0].id;
    cards = recs.map(p => ({ id: p.id, name: p.name, desc: p.tagline || p.dossier?.focus || '' }));
  } else {
    const ids = GOAL_PROGRAMS[_selectedGoal] || [];
    if (!ids.includes(_selectedProgram)) _selectedProgram = ids[0] || 'hybrid_engine';
    cards = ids.map(id => ({ id, ...(PROGRAM_META[id] || { name: id, desc: '' }) }));
  }

  list.innerHTML = cards.map(c =>
    `<button class="ob-prog-card${c.id === _selectedProgram ? ' active' : ''}" data-action="ob-program" data-program="${c.id}">
      <span class="ob-prog-name">${c.name}</span>
      <span class="ob-prog-desc">${c.desc}</span>
    </button>`).join('');
}

export function handleOnboardingAction(action, target) {
  if (action === 'ob-next') {
    const toStep = parseInt(target.dataset.to, 10);
    if (toStep === 2) {
      const name = document.getElementById('obName')?.value?.trim();
      if (!name) { document.getElementById('obName')?.focus(); return; }
    }
    // Entering the program picker: re-rank now that level + equipment are known.
    if (toStep === 4) _renderProgramList();
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
  } else if (action === 'ob-level') {
    _fitnessLevel = target.dataset.level;
    document.querySelectorAll('[data-action="ob-level"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-frequency') {
    _weeklyFrequency = target.dataset.freq;
    document.querySelectorAll('[data-action="ob-frequency"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-recovery') {
    _recoveryFeel = target.dataset.recovery;
    document.querySelectorAll('[data-action="ob-recovery"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-equipment') {
    _equipmentTier = target.dataset.tier;
    document.querySelectorAll('[data-action="ob-equipment"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-program') {
    _selectedProgram = target.dataset.program;
    document.querySelectorAll('[data-action="ob-program"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
    setTimeout(() => _showStep(5), 180);
  } else if (action === 'ob-unit') {
    _weightUnit = target.dataset.unit;
    document.querySelectorAll('[data-action="ob-unit"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-dist-unit') {
    _distUnit = target.dataset.unit;
    document.querySelectorAll('[data-action="ob-dist-unit"]').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
  } else if (action === 'ob-notif-enable') {
    // Daily-coach step: ask for the OS permission, then reveal the provisional
    // Score either way — a denial must never trap the user in onboarding.
    // Granting arms the morning briefing reminder (notifications.js _armAll).
    target.disabled = true;
    requestNotificationPermission()
      .catch(() => ({ granted: false }))
      .then(() => _revealProvisionalScore());
  } else if (action === 'ob-notif-skip') {
    _revealProvisionalScore();
  } else if (action === 'ob-finish') {
    _finish();
  }
}

// V2-2 — the finale: turn the three self-reports into an instant Hybrid Score,
// rendered in the exact card language they'll meet on Home, before they enter.
function _revealProvisionalScore() {
  const mount = document.getElementById('obScoreReveal');
  if (mount) {
    const r = provisionalScore({
      level: _fitnessLevel,
      frequency: _weeklyFrequency,
      recovery: _recoveryFeel,
    });
    mount.innerHTML = heroHTML(r, { showAction: false });
  }
  _showStep(7);
}

function _finish() {
  const appState = _getState();
  if (!appState.settings) appState.settings = {};

  const name = document.getElementById('obName')?.value?.trim();
  if (name) appState.settings.name = name;

  appState.activeProgramId              = _selectedProgram;
  appState.settings.weightUnit          = _weightUnit;
  appState.settings.distanceUnit        = _distUnit;
  appState.settings.fitnessLevel        = _fitnessLevel;
  appState.settings.equipmentTier       = _equipmentTier;
  appState.settings.onboardingComplete  = true;
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

  // R14 — hand off to the first session: land on Home (where the Morning
  // Briefing's mission is the clear next action) and mark a guided-CTA on it.
  appState._justOnboarded = true;
  document.dispatchEvent(new CustomEvent('onboarding:finished', { detail: { name: name || '' } }));
}
