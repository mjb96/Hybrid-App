// ==========================================
// HYBRID ENGINE — FASTING TRACKER (js/fasting.js)
//
// Pure data layer: zone definitions, elapsed-time helpers, start/stop.
// No DOM access. All UI lives in home.js and athlete-profile.js.
// ==========================================

// Metabolic zones — ordered by ascending elapsed hours.
// Sources:
//   Cahill (2006) "Fuel Metabolism in Starvation" – Annu Rev Nutr
//   Ho et al. (1988) "Fasting Enhances Growth Hormone Secretion" – J Clin Invest
export const FASTING_ZONES = [
  {
    id: 'fed',
    name: 'Anabolic',
    hoursStart: 0,
    hoursEnd: 4,
    color: '#6b7280',
    icon: '🍽️',
    description: 'Digestion active. Insulin elevated, glucose is the primary fuel source.',
  },
  {
    id: 'catabolic',
    name: 'Catabolic',
    hoursStart: 4,
    hoursEnd: 12,
    color: '#3b82f6',
    icon: '🔄',
    description: 'Glycogen stores depleting. Insulin falling as liver glycogenolysis begins.',
  },
  {
    id: 'gluconeo',
    name: 'Gluconeogenesis',
    hoursStart: 12,
    hoursEnd: 18,
    color: '#8b5cf6',
    icon: '⚗️',
    description: 'Liver converting amino acids and glycerol to glucose. Fat oxidation rising significantly.',
  },
  {
    id: 'fat_adapt',
    name: 'Fat Adaptation',
    hoursStart: 18,
    hoursEnd: 24,
    color: '#f59e0b',
    icon: '🔥',
    description: 'Ketone bodies rising. Fat is now the dominant energy substrate.',
  },
  {
    id: 'ketosis',
    name: 'Ketosis',
    hoursStart: 24,
    hoursEnd: 48,
    color: '#f97316',
    icon: '⚡',
    description: 'Significant ketone production. Autophagy begins — cellular repair and recycling.',
  },
  {
    id: 'deep_ketosis',
    name: 'Deep Ketosis',
    hoursStart: 48,
    hoursEnd: Infinity,
    color: '#ef4444',
    icon: '🧬',
    description: 'Extended fast. Deep autophagy, growth hormone markedly elevated (Ho et al., 1988).',
  },
];

export const FAST_GOAL_OPTIONS = [12, 14, 16, 18, 20, 24, 36, 48, 72];

// ── Time helpers ──────────────────────────────────────────────────────────────

// Returns elapsed fasting hours (fractional). Returns 0 if not active.
export function getFastingHours(fastingSession) {
  if (!fastingSession?.active || !fastingSession.startTime) return 0;
  return (Date.now() - new Date(fastingSession.startTime).getTime()) / 3_600_000;
}

// Returns the zone object matching the given hour count.
export function getCurrentZone(hours) {
  for (const zone of FASTING_ZONES) {
    if (hours >= zone.hoursStart && hours < zone.hoursEnd) return zone;
  }
  return FASTING_ZONES[FASTING_ZONES.length - 1];
}

// Formats elapsed hours as "H:MM:SS".
export function fmtFastDuration(hours) {
  const totalSec = Math.floor(hours * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}`;
}

// Formats a fractional-hours number as "Xh Ym" for static display.
export function fmtHoursLabel(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ── State helpers ─────────────────────────────────────────────────────────────

// Returns a summary object consumed by home tile and brain recommendations.
export function getFastingContext(state) {
  const fs = state.fastingSession;
  const active = fs?.active ?? false;
  const hours = getFastingHours(fs);
  const zone = getCurrentZone(hours);
  const goal = fs?.goal ?? 16;
  const progressPct = Math.min(100, (hours / goal) * 100);
  const remainingHours = Math.max(0, goal - hours);
  const history = fs?.history ?? [];

  // Fasting streak — count consecutive days that have a completed fast entry
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const dayStart = new Date(today.getTime() - i * 86_400_000);
    const dayEnd   = new Date(dayStart.getTime() + 86_400_000);
    const hadFast  = history.some(h => {
      const end = new Date(h.endTime);
      return end >= dayStart && end < dayEnd;
    });
    if (hadFast || (i === 0 && active)) { streak++; } else { break; }
  }

  // Total hours fasted in the last 7 days (including current fast)
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const weeklyHours = history
    .filter(h => new Date(h.endTime).getTime() >= sevenDaysAgo)
    .reduce((sum, h) => sum + h.durationHours, 0)
    + (active ? hours : 0);

  return { active, hours, zone, goal, progressPct, remainingHours, history, streak, weeklyHours };
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function startFast(state, goalHours, saveStateFn) {
  if (!state.fastingSession) {
    state.fastingSession = { active: false, startTime: null, goal: 16, history: [] };
  }
  state.fastingSession.active    = true;
  state.fastingSession.startTime = new Date().toISOString();
  state.fastingSession.goal      = goalHours ?? state.fastingSession.goal ?? 16;
  saveStateFn();
}

export function editFastStartTime(state, newStartTimeISO, saveStateFn) {
  if (!state.fastingSession?.active) return;
  const newStart = new Date(newStartTimeISO);
  if (isNaN(newStart.getTime())) return;
  if (newStart > new Date()) return; // can't set a future start time
  state.fastingSession.startTime = newStart.toISOString();
  saveStateFn();
}

export function stopFastAtTime(state, endTimeISO, saveStateFn) {
  if (!state.fastingSession?.active) return;
  const endTime  = new Date(endTimeISO);
  const start    = new Date(state.fastingSession.startTime);
  if (isNaN(endTime.getTime()) || endTime <= start || endTime > new Date()) return;
  const durationHours = (endTime - start) / 3_600_000;
  if (!state.fastingSession.history) state.fastingSession.history = [];
  state.fastingSession.history.push({
    startTime:     state.fastingSession.startTime,
    endTime:       endTime.toISOString(),
    durationHours: parseFloat(durationHours.toFixed(2)),
    goalHours:     state.fastingSession.goal,
  });
  if (state.fastingSession.history.length > 365) {
    state.fastingSession.history = state.fastingSession.history.slice(-365);
  }
  state.fastingSession.active    = false;
  state.fastingSession.startTime = null;
  saveStateFn();
}

export function stopFast(state, saveStateFn) {
  if (!state.fastingSession?.active) return;
  const hours = getFastingHours(state.fastingSession);
  if (!state.fastingSession.history) state.fastingSession.history = [];
  state.fastingSession.history.push({
    startTime:     state.fastingSession.startTime,
    endTime:       new Date().toISOString(),
    durationHours: parseFloat(hours.toFixed(2)),
    goalHours:     state.fastingSession.goal,
  });
  // Keep last 30 sessions
  if (state.fastingSession.history.length > 365) {
    state.fastingSession.history = state.fastingSession.history.slice(-365);
  }
  state.fastingSession.active    = false;
  state.fastingSession.startTime = null;
  saveStateFn();
}
