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
// COMPOUND LIFT DETECTION
// ==========================================
const COMPOUND_KEYWORDS = [
  'squat', 'deadlift', 'bench', 'press', 'row', 'pull-up', 'pullup',
  'chin', 'rdl', 'lunge', 'hip thrust', 'snatch', 'clean', 'jerk'
];

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
    // Working sets start from the user-configured baseline
    duration = _restDuration;

    // RPE bonus: heavier perceived effort = more rest
    const rpe = parseFloat(setRpe) || 0;
    if (rpe >= 9) duration += 30;
    else if (rpe >= 8) duration += 15;

    // Compound lifts get at least 180s rest, but respect a higher user baseline
    const isCompound = liftName &&
      COMPOUND_KEYWORDS.some(k => liftName.toLowerCase().includes(k));
    if (isCompound) duration = Math.max(duration, 180);
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

export function checkActiveTimerOnLoad() {
  const storedTime = localStorage.getItem('hybrid_workoutStartTime');
  if (storedTime) {
    workoutStartTime = parseInt(storedTime, 10);
    resumeTimerDisplay();
  }
}
