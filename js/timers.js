// ==========================================
// TIMERS: REST TIMER + SESSION DURATION
// ==========================================
import { hapticRestDone } from './haptics.js';

// Session duration timer
let workoutStartTime = null;
let workoutTimerInt = null;
let workoutSessionKey = null;
const WORKOUT_START_KEY = 'hybrid_workoutStartTime';
const WORKOUT_SESSION_KEY = 'hybrid_workoutSessionKey';

// Rest timer
let restTimerInt = null;
let _restDuration = 90;       // module-level baseline duration in seconds
let _restRemaining = 90;      // current countdown remaining
let _restTotalDuration = 90;  // total for progress bar calculation

// ==========================================
// EXERCISE-TYPE REST PRESCRIPTION
// ==========================================
// Rest need scales with how systemically taxing a lift is, not with a single
// global default. Evidence (Schoenfeld 2016; Grgic 2017 meta-analysis; de Salles
// 2009 review) supports ~3 min between heavy multi-joint sets for strength and
// hypertrophy, ~2 min for secondary/assistance compounds, and ~60–90 s for
// single-joint isolation work (which recovers far faster). We classify by name
// and fall back to the user's configured default for anything unrecognised.
// Tier defaults (seconds), tunable from Settings (settings.restPeriods). Pushed
// in via setRestTiers on boot/change so this leaf module needs no state import.
let _restTiers = { compound: 180, accessory: 120, isolation: 90 };
let _restTimerEnabled = true;
let _restOverrides = {};       // { liftName: seconds } — remembered ± adjustments
let _currentLift = null;       // exercise whose rest is currently running
let _currentWorking = false;   // is that set a working set (override-eligible)?
let _onOverridesChange = null; // persistence callback (app layer owns the save)
let _restPaused = false;       // countdown deliberately held by the athlete

const _clampRest = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 30 && n <= 600 ? n : fallback;
};

export function setRestTiers(t) {
  if (!t || typeof t !== 'object') return;
  _restTiers = {
    compound:  _clampRest(t.compound,  _restTiers.compound),
    accessory: _clampRest(t.accessory, _restTiers.accessory),
    isolation: _clampRest(t.isolation, _restTiers.isolation),
  };
}
export function getRestTiers() { return { ..._restTiers }; }
export function setRestTimerEnabled(b) { _restTimerEnabled = b !== false; }
export function setRestOverrides(o) { _restOverrides = (o && typeof o === 'object') ? { ...o } : {}; }
export function initRestPersistence(cb) { _onOverridesChange = typeof cb === 'function' ? cb : null; }

// Checked isolation-first so "leg extension" / "leg curl" don't fall through to
// the broad "press"/"row" compound keywords.
const ISOLATION_KEYWORDS = [
  'curl', 'raise', 'fly', 'flye', 'extension', 'pushdown', 'push-down', 'kickback',
  'calf', 'shrug', 'face pull', 'pec deck', 'lateral', 'rear delt', 'reverse fly',
  'concentration', 'preacher', 'wrist', 'crunch', 'sit-up', 'sit up', 'plank',
  'pull-apart', 'pull apart', 'cable cross', 'adduction', 'abduction',
];
const PRIMARY_KEYWORDS = [
  'squat', 'deadlift', 'bench', 'overhead press', 'ohp', 'military press',
  'barbell row', 'pendlay', 'rdl', 'romanian', 'hip thrust', 'good morning',
  'clean', 'snatch', 'jerk',
];
const SECONDARY_KEYWORDS = [
  'press', 'row', 'pull-up', 'pullup', 'pull up', 'chin', 'dip', 'lunge',
  'pulldown', 'pull-down', 'pull down', 'thruster', 'split squat', 'step-up',
  'step up', 'push press', 't-bar',
];

// Recommended rest (seconds) for a lift by name, or null if unrecognised.
export function recommendedRestFor(liftName) {
  if (!liftName || typeof liftName !== 'string') return null;
  const n = liftName.toLowerCase();
  if (ISOLATION_KEYWORDS.some(k => n.includes(k))) return _restTiers.isolation;
  if (PRIMARY_KEYWORDS.some(k => n.includes(k)))   return _restTiers.compound;
  if (SECONDARY_KEYWORDS.some(k => n.includes(k))) return _restTiers.accessory;
  return null;
}

// ==========================================
// REST TIMER
// ==========================================
export function moveRestTimerToActiveExercise() {
  const timerBar = document.getElementById('cockpitTimerBar');
  if (!timerBar || !timerBar.classList.contains('active')) return;

  const openCard = document.querySelector('.cockpit-exercise:not(.collapsed) .local-timer-placeholder');
  if (openCard) {
    openCard.appendChild(timerBar);
    timerBar.style.position = "relative";
    timerBar.style.margin = "0 0 12px 0";
    timerBar.style.width = "100%";
    timerBar.style.bottom = "auto";
    timerBar.style.left = "auto";
  } else {
    document.getElementById('view-workout')?.appendChild(timerBar);
    timerBar.style.position = "fixed";
    timerBar.style.bottom = "85px";
    timerBar.style.width = "calc(100% - 32px)";
    timerBar.style.margin = "0";
    timerBar.style.left = "16px";
  }
}

function playRestDoneBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.14);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.15);
    });
  } catch(e) { /* Web Audio not supported */ }
}

function _updateRestTimerDisplay(remaining, total) {
  const clockDisplay = document.getElementById('cockpitTimerClock');
  const progressFill = document.getElementById('restProgressFill');
  const timerBar = document.getElementById('cockpitTimerBar');

  const m = Math.floor(remaining / 60);
  const s = (remaining % 60).toString().padStart(2, '0');
  if (clockDisplay) clockDisplay.textContent = m + ':' + s;

  if (progressFill) {
    const pct = total > 0 ? (remaining / total) * 100 : 100;
    progressFill.style.width = pct + '%';
  }

  if (timerBar) {
    timerBar.classList.toggle('rest-warning', remaining <= 10 && remaining > 0);
    timerBar.classList.remove('rest-done');
  }
}

function _startRestCountdown() {
  const startTime = Date.now();
  const startRemaining = _restRemaining;

  clearInterval(restTimerInt);
  restTimerInt = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const remaining = Math.max(0, Math.round(startRemaining - elapsed));
    _restRemaining = remaining;
    _updateRestTimerDisplay(remaining, _restTotalDuration);

    if (remaining <= 0) {
      clearInterval(restTimerInt);
      restTimerInt = null;
      playRestDoneBeep();
      hapticRestDone();
      // When the screen is off / app backgrounded, Web Audio + haptics are
      // suspended — fire a native Android notification instead (no-op on web).
      if (typeof document !== 'undefined' && document.hidden) {
        try {
          window.HybridHealthBridge?.notifyRestComplete?.('Rest complete', 'Time for your next set 💪');
        } catch (_) { /* bridge absent */ }
      }
      const timerBar = document.getElementById('cockpitTimerBar');
      if (timerBar) {
        timerBar.classList.remove('rest-warning');
        timerBar.classList.add('rest-done');
      }
    }
  }, 250);
}

// liftName: the exercise name string (e.g. "Back Squat")
// setRpe:   optional numeric RPE of the completed set
// setType:  optional set type char — 'W' = warmup, 'F' = AMRAP, '' = working set
export function triggerRestTimerEngine(liftName, setRpe, setType) {
  if (!_restTimerEnabled) return; // auto rest timer turned off in Settings

  let duration;
  _currentLift = liftName || null;
  _currentWorking = (setType !== 'W' && setType !== 'F');

  // 1. Warmup sets always get a short 45s rest, regardless of lift type.
  if (setType === 'W') {
    duration = 45;
  } else if (setType === 'F') {
    // AMRAP sets get a fixed 2-minute rest
    duration = 120;
  } else if (liftName && _restOverrides[liftName] != null) {
    // A remembered per-exercise adjustment is an explicit choice — use it as-is
    // (no RPE bonus on top, since the user already dialled in this value).
    duration = _restOverrides[liftName];
  } else {
    // Working sets: prescribe rest by exercise type (heavy compound → isolation)
    // so a curl no longer inherits the same 3 min as a squat. Unrecognised /
    // custom lifts fall back to the accessory tier.
    duration = recommendedRestFor(liftName) ?? _restTiers.accessory;

    // RPE bonus: heavier perceived effort = more rest
    const rpe = parseFloat(setRpe) || 0;
    if (rpe >= 9) duration += 30;
    else if (rpe >= 8) duration += 15;
  }

  _restDuration = duration; // last prescribed — used by idle display / dismiss reset
  _restTotalDuration = duration;
  _restRemaining = duration;

  const timerBar = document.getElementById('cockpitTimerBar');
  if (timerBar) {
    timerBar.classList.add('active');
    timerBar.classList.remove('rest-warning', 'rest-done');
  }

  // A new set's rest always starts running — a pause held over from the last
  // set would silently stop this one from counting down at all.
  _restPaused = false;
  _syncRestPauseUi();

  _updateRestTimerDisplay(duration, duration);
  moveRestTimerToActiveExercise();
  _startRestCountdown();
}

/**
 * Reflect the paused/running state on the control. The label doubles AS the
 * control: it previously rendered a decorative "⏸ REST" with no pause behind
 * it, which is a worse lie than having no pause at all.
 */
function _syncRestPauseUi() {
  const button = document.getElementById('restPauseBtn');
  const timerBar = document.getElementById('cockpitTimerBar');
  timerBar?.classList.toggle('rest-paused', _restPaused);
  if (!button) return;
  button.setAttribute('aria-pressed', String(_restPaused));
  button.setAttribute('aria-label', _restPaused ? 'Resume rest timer' : 'Pause rest timer');
  button.textContent = _restPaused ? '▶ PAUSED' : '⏸ REST';
}

/**
 * Hold or resume the countdown. Rest is not always uninterrupted — a machine is
 * taken, someone talks to you — and without this the only options were to watch
 * it run out or dismiss it and lose the prescription.
 *
 * Resuming re-derives from `_restRemaining`, so a pause of any length costs
 * exactly the time it was held and nothing else.
 * @returns {boolean} whether the timer is now paused
 */
export function toggleRestPause() {
  const timerBar = document.getElementById('cockpitTimerBar');
  // Nothing to pause when no rest is running, or when it has already finished —
  // "pausing" a completed timer would show a held countdown at 0:00.
  if (!timerBar || !timerBar.classList.contains('active') || _restRemaining <= 0) return false;

  if (restTimerInt !== null) {
    clearInterval(restTimerInt);
    restTimerInt = null;
    _restPaused = true;
  } else {
    _restPaused = false;
    _startRestCountdown();
  }
  _syncRestPauseUi();
  return _restPaused;
}

export function isRestPaused() { return _restPaused; }

export function adjustRestDuration(delta) {
  // Adjust ONLY the running countdown — never a hidden global baseline (which
  // used to leak one exercise's nudge into every later unrecognised lift).
  const newTotal = Math.min(600, Math.max(30, _restTotalDuration + delta));
  _restTotalDuration = newTotal;
  _restDuration = newTotal;
  _restRemaining = Math.min(newTotal, Math.max(0, _restRemaining + delta));
  _updateRestTimerDisplay(_restRemaining, _restTotalDuration);
  if (restTimerInt !== null) _startRestCountdown();

  // Remember the adjustment for this exercise (working sets only) so it
  // auto-applies next set and next session.
  if (_currentWorking && _currentLift) {
    _restOverrides[_currentLift] = newTotal;
    if (_onOverridesChange) _onOverridesChange({ ..._restOverrides });
  }
}

export function dismissRestTimer() {
  clearInterval(restTimerInt);
  restTimerInt = null;
  _restRemaining = _restDuration;
  // Dismissing ends the rest entirely, so a held pause ends with it — otherwise
  // the next set's timer would inherit a "PAUSED" label it never earned.
  _restPaused = false;

  const timerBar = document.getElementById('cockpitTimerBar');
  const clockDisplay = document.getElementById('cockpitTimerClock');
  const progressFill = document.getElementById('restProgressFill');

  if (timerBar) {
    timerBar.classList.remove('active', 'rest-warning', 'rest-done');
    document.getElementById('view-workout')?.appendChild(timerBar);
    timerBar.style.position = "fixed";
    timerBar.style.bottom = "85px";
    timerBar.style.width = "calc(100% - 32px)";
    timerBar.style.margin = "0";
    timerBar.style.left = "16px";
  }
  if (clockDisplay) {
    const m = Math.floor(_restDuration / 60);
    const s = (_restDuration % 60).toString().padStart(2, '0');
    clockDisplay.textContent = m + ':' + s;
  }
  if (progressFill) progressFill.style.width = '100%';
  _syncRestPauseUi();
}

// ==========================================
// SESSION DURATION TIMER
// ==========================================
export function startWorkoutTimer(sessionKey = 'legacy') {
  const requested = String(sessionKey || 'legacy');
  if (!workoutStartTime || workoutSessionKey !== requested) {
    workoutStartTime = Date.now();
    workoutSessionKey = requested;
    localStorage.setItem(WORKOUT_START_KEY, workoutStartTime.toString());
    localStorage.setItem(WORKOUT_SESSION_KEY, workoutSessionKey);
    resumeTimerDisplay();
  }
}

export function resumeTimerDisplay() {
  const startBtn = document.getElementById('startWorkoutBtn');
  const durationBar = document.getElementById('workoutDurationBar');
  const durationClock = document.getElementById('workoutDurationClock');

  if (startBtn) startBtn.style.display = 'none';
  if (durationBar) durationBar.classList.add('active');

  clearInterval(workoutTimerInt);
  workoutTimerInt = setInterval(() => {
    const diff = Math.floor((Date.now() - workoutStartTime) / 1000);
    const h = Math.floor(diff / 3600).toString().padStart(2, '0');
    const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
    const s = (diff % 60).toString().padStart(2, '0');
    if (durationClock) {
      durationClock.textContent = h === '00' ? m + ':' + s : h + ':' + m + ':' + s;
    }
  }, 1000);
}

export function stopAndResetWorkoutTimer(sessionKey = null) {
  if (sessionKey != null && workoutSessionKey !== String(sessionKey)) return false;
  clearInterval(workoutTimerInt);
  workoutTimerInt = null;
  workoutStartTime = null;
  workoutSessionKey = null;
  localStorage.removeItem(WORKOUT_START_KEY);
  localStorage.removeItem(WORKOUT_SESSION_KEY);

  const startBtn = document.getElementById('startWorkoutBtn');
  const durationBar = document.getElementById('workoutDurationBar');
  const durationClock = document.getElementById('workoutDurationClock');

  if (startBtn) startBtn.style.display = 'block';
  if (durationBar) durationBar.classList.remove('active');
  if (durationClock) durationClock.textContent = '00:00';
  return true;
}

// Seconds the session timer has been running (0 if not started).
export function getWorkoutElapsedSeconds(sessionKey = null) {
  if (sessionKey != null && workoutSessionKey !== String(sessionKey)) return 0;
  return workoutStartTime ? Math.max(0, Math.floor((Date.now() - workoutStartTime) / 1000)) : 0;
}

export function getWorkoutTimerSessionKey() { return workoutSessionKey; }

// Keep the duration chrome honest when the athlete navigates to another
// workout. The prior clock remains owned by its session until a new one starts,
// but it is never displayed as the new session's elapsed time.
export function bindWorkoutTimerSession(sessionKey) {
  const matches = !!workoutStartTime && workoutSessionKey === String(sessionKey || 'legacy');
  const startBtn = document.getElementById('startWorkoutBtn');
  const durationBar = document.getElementById('workoutDurationBar');
  const durationClock = document.getElementById('workoutDurationClock');
  if (matches) {
    resumeTimerDisplay();
    return true;
  }
  if (startBtn) startBtn.style.display = 'block';
  if (durationBar) durationBar.classList.remove('active');
  if (durationClock) durationClock.textContent = '00:00';
  return false;
}

// Longest a single gym session can plausibly run. A stored start older than
// this almost certainly belongs to a session the user never tapped "Finish" on,
// so resuming it would inflate the live duration (40-min workout shows an hour+).
const MAX_SESSION_MS = 5 * 60 * 60 * 1000; // 5 hours

export function checkActiveTimerOnLoad(sessionKey = null) {
  const storedTime = localStorage.getItem(WORKOUT_START_KEY);
  if (!storedTime) return;
  const storedSession = localStorage.getItem(WORKOUT_SESSION_KEY);
  const start = parseInt(storedTime, 10);
  const age = Date.now() - start;
  // Discard a stale / never-finished start instead of resuming a runaway timer.
  if (!Number.isFinite(start) || age < 0 || age > MAX_SESSION_MS ||
      (sessionKey != null && storedSession !== String(sessionKey))) {
    localStorage.removeItem(WORKOUT_START_KEY);
    localStorage.removeItem(WORKOUT_SESSION_KEY);
    workoutStartTime = null;
    workoutSessionKey = null;
    return;
  }
  workoutStartTime = start;
  workoutSessionKey = storedSession || 'legacy';
  resumeTimerDisplay();
}
