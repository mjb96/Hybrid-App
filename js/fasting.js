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
//   Longo & Mattson (2014) "Fasting: Molecular Mechanisms and Clinical Applications" – Cell Metab
export const FASTING_ZONES = [
  {
    id: 'fed',
    name: 'Fed State',
    hoursStart: 0,
    hoursEnd: 4,
    color: '#6b7280',
    icon: '🍽️',
    description: 'Digestion active. Insulin elevated, glucose is the primary fuel source. The body is in an anabolic, nutrient-processing state.',
  },
  {
    id: 'blood_sugar',
    name: 'Blood Sugar Stabilisation',
    hoursStart: 4,
    hoursEnd: 12,
    color: '#3b82f6',
    icon: '📉',
    description: 'Blood glucose stabilising. Insulin falling as liver glycogenolysis begins to maintain blood sugar. Glycogen stores begin depleting.',
  },
  {
    id: 'glycogen',
    name: 'Glycogen Depletion',
    hoursStart: 12,
    hoursEnd: 16,
    color: '#8b5cf6',
    icon: '⚗️',
    description: 'Liver glycogen significantly depleted. Fat oxidation rising sharply. The liver begins gluconeogenesis — converting glycerol and amino acids to glucose.',
  },
  {
    id: 'fat_adapt',
    name: 'Fat Adaptation',
    hoursStart: 16,
    hoursEnd: 24,
    color: '#f59e0b',
    icon: '🔥',
    description: 'Ketone bodies rising. Fat is now the dominant energy substrate. Insulin at its lowest. This is the metabolic sweet spot for most intermittent fasters.',
  },
  {
    id: 'ketosis',
    name: 'Ketosis Progression',
    hoursStart: 24,
    hoursEnd: 36,
    color: '#f97316',
    icon: '⚡',
    description: 'Significant ketone production underway. Autophagy begins in earnest — cellular repair, recycling of damaged proteins and organelles accelerates.',
  },
  {
    id: 'deep_fast',
    name: 'Deep Fasting State',
    hoursStart: 36,
    hoursEnd: Infinity,
    color: '#ef4444',
    icon: '🧬',
    description: 'Extended fast. Deep autophagy and cellular renewal. Growth hormone markedly elevated (Ho et al., 1988). Not recommended without medical supervision.',
  },
];

export const FAST_GOAL_OPTIONS = [12, 14, 16, 18, 20, 23, 24, 36, 48, 72];

// Named fasting protocols (Zero-style presets). `goal` is still stored as plain
// fast-hours on the session for back-compat — a protocol is just a named window that
// maps onto a goal-hours value. `eatHours` is the complementary daily eating window
// (0 for full-day+ fasts). `extended` fasts (≥24h) carry a `caution` flag so the UI
// can surface the medical-supervision note that the deep-fasting zone already states.
export const FASTING_PROTOCOLS = [
  { id: '14:10', label: '14:10',  fastHours: 14, eatHours: 10, blurb: 'Gentle daily window' },
  { id: '16:8',  label: '16:8',   fastHours: 16, eatHours: 8,  blurb: 'The classic' },
  { id: '18:6',  label: '18:6',   fastHours: 18, eatHours: 6,  blurb: 'Deeper fat-burn' },
  { id: '20:4',  label: '20:4',   fastHours: 20, eatHours: 4,  blurb: 'Warrior' },
  { id: 'omad',  label: 'OMAD',   fastHours: 23, eatHours: 1,  blurb: 'One meal a day' },
  { id: '24h',   label: '24h',    fastHours: 24, eatHours: 0,  blurb: 'Full day', extended: true, caution: true },
  { id: '36h',   label: '36h',    fastHours: 36, eatHours: 0,  blurb: 'Monk fast', extended: true, caution: true },
  { id: '48h',   label: '48h',    fastHours: 48, eatHours: 0,  blurb: 'Extended',  extended: true, caution: true },
];

// Look up a protocol by its id. Returns null for unknown/custom ids.
export function protocolById(id) {
  return FASTING_PROTOCOLS.find(p => p.id === id) ?? null;
}

// Map a numeric goal-hours value onto its named protocol, if one matches exactly.
// A goal that doesn't line up with a preset (a custom window) returns null — callers
// render that as "Custom · Nh".
export function protocolForGoalHours(goalHours) {
  return FASTING_PROTOCOLS.find(p => p.fastHours === goalHours) ?? null;
}

// Display label for a session's current goal: the protocol name when it matches a
// preset, else a "Custom · Nh" fallback. Pure — safe for both UI and notifications.
export function protocolLabelForGoal(goalHours) {
  const p = protocolForGoalHours(goalHours);
  return p ? p.label : `Custom · ${goalHours}h`;
}

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

export function editHistoryFast(state, historyIndex, newStartISO, newEndISO, saveStateFn) {
  const entry = state.fastingSession?.history?.[historyIndex];
  if (!entry) return false;
  const start = new Date(newStartISO);
  const end   = new Date(newEndISO);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  if (end <= start || end > new Date()) return false;
  entry.startTime     = start.toISOString();
  entry.endTime       = end.toISOString();
  entry.durationHours = parseFloat(((end - start) / 3_600_000).toFixed(2));
  saveStateFn();
  return true;
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
