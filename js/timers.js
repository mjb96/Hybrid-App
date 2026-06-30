// ==========================================
// TIMERS: REST TIMER + SESSION DURATION
// ==========================================
import { hapticRestDone } from './haptics.js';

// Session duration timer
let workoutStartTime = null;
let workoutTimerInt = null;

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
const REST_PRIMARY   = 180; // heavy multi-joint: squat / deadlift / bench / OHP / heavy hinge
const REST_SECONDARY = 120; // assistance compounds: rows / pulls / dips / lunges / machine presses
const REST_ISOLATION = 90;  // single-joint: curls / raises / extensions / pushdowns / calves

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
  if (ISOLATION_KEYWORDS.some(k => n.includes(k))) return REST_ISOLATION;
  if (PRIMARY_KEYWORDS.some(k => n.includes(k)))   return REST_PRIMARY;
  if (SECONDARY_KEYWORDS.some(k => n.includes(k))) return REST_SECONDARY;
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
  let duration;

  // 1. Warmup sets always get a short 45s rest, regardless of lift type.
  if (setType === 'W') {
    duration = 45;
  } else if (setType === 'F') {
    // AMRAP sets get a fixed 2-minute rest
    duration = 120;
  } else {
    // Working sets: prescribe rest by exercise type (heavy compound → isolation)
    // so a curl no longer inherits the same 3 min as a squat. Unrecognised /
    // custom lifts fall back to the user-configured default.
    const recommended = recommendedRestFor(liftName);
    duration = recommended != null ? recommended : _restDuration;

    // RPE bonus: heavier perceived effort = more rest
    const rpe = parseFloat(setRpe) || 0;
    if (rpe >= 9) duration += 30;
    else if (rpe >= 8) duration += 15;
  }

  _restTotalDuration = duration;
  _restRemaining = duration;

  const timerBar = document.getElementById('cockpitTimerBar');
  if (timerBar) {
    timerBar.classList.add('active');
    timerBar.classList.remove('rest-warning', 'rest-done');
  }

  _updateRestTimerDisplay(duration, duration);
  moveRestTimerToActiveExercise();
  _startRestCountdown();
}

export function adjustRestDuration(delta) {
  _restDuration = Math.min(300, Math.max(30, _restDuration + delta));
  // If timer is active, adjust remaining time and restart countdown
  if (restTimerInt !== null || _restRemaining > 0) {
    _restRemaining = Math.min(300, Math.max(0, _restRemaining + delta));
    _restTotalDuration = Math.max(_restTotalDuration, _restRemaining);
    _updateRestTimerDisplay(_restRemaining, _restTotalDuration);
    if (restTimerInt !== null) {
      _startRestCountdown();
    }
  }
}

export function setRestDuration(secs) {
  _restDuration = Math.min(300, Math.max(30, parseInt(secs, 10) || 90));
}

export function dismissRestTimer() {
  clearInterval(restTimerInt);
  restTimerInt = null;
  _restRemaining = _restDuration;

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
}

// ==========================================
// SESSION DURATION TIMER
// ==========================================
export function startWorkoutTimer() {
  if (!workoutStartTime) {
    workoutStartTime = Date.now();
    localStorage.setItem('hybrid_workoutStartTime', workoutStartTime.toString());
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

export function stopAndResetWorkoutTimer() {
  clearInterval(workoutTimerInt);
  workoutTimerInt = null;
  workoutStartTime = null;
  localStorage.removeItem('hybrid_workoutStartTime');

  const startBtn = document.getElementById('startWorkoutBtn');
  const durationBar = document.getElementById('workoutDurationBar');
  const durationClock = document.getElementById('workoutDurationClock');

  if (startBtn) startBtn.style.display = 'block';
  if (durationBar) durationBar.classList.remove('active');
  if (durationClock) durationClock.textContent = '00:00';
}

// Seconds the session timer has been running (0 if not started).
export function getWorkoutElapsedSeconds() {
  return workoutStartTime ? Math.max(0, Math.floor((Date.now() - workoutStartTime) / 1000)) : 0;
}

// Longest a single gym session can plausibly run. A stored start older than
// this almost certainly belongs to a session the user never tapped "Finish" on,
// so resuming it would inflate the live duration (40-min workout shows an hour+).
const MAX_SESSION_MS = 5 * 60 * 60 * 1000; // 5 hours

export function checkActiveTimerOnLoad() {
  const storedTime = localStorage.getItem('hybrid_workoutStartTime');
  if (!storedTime) return;
  const start = parseInt(storedTime, 10);
  const age = Date.now() - start;
  // Discard a stale / never-finished start instead of resuming a runaway timer.
  if (!Number.isFinite(start) || age < 0 || age > MAX_SESSION_MS) {
    localStorage.removeItem('hybrid_workoutStartTime');
    workoutStartTime = null;
    return;
  }
  workoutStartTime = start;
  resumeTimerDisplay();
}
