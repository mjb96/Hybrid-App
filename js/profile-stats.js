// @ts-check
// =============================================================================
// PROFILE STATS — pure computation + render helpers for the athlete profile.
// Extracted from athlete-profile.js. No module state: every function takes
// the data it needs (state / days) as parameters.
// =============================================================================
import { getCatalogEntry } from './programs/catalog.js';
import { allLiftsStats } from './metrics/metrics-strength.js';
import { isValidWorkingSet } from './set-utils.js';
import { runDaySummary, runSessionsForDay } from './state/run-sessions.js';
import { addDaysISO, todayKey } from './dates.js';
import { indexSlotsByDate, weekStartOf } from './analytics/weekly-aggregate.js';
import { exercisePerformanceHistory } from './workout/exercise-history.js';

// ── Section helpers ───────────────────────────────────────────────────────────

export function _renderHealthSection(state) {
  const hc = state.healthConnect;
  if (!hc?.connected) return '';

  const latestHRV   = hc.hrv?.slice(-1)[0]?.value;
  const latestRHR   = hc.restingHR?.slice(-1)[0]?.value;
  const latestSteps = hc.steps?.slice(-1)[0]?.count;
  const latestSleep = hc.sleep?.slice(-1)[0]?.hours;

  if (!latestHRV && !latestRHR && !latestSteps && !latestSleep) return '';

  return `
    <div class="profile-section">
      <div class="profile-section-title">Health Metrics</div>
      <div class="profile-stat-grid">
        ${latestHRV   ? _statCard(Math.round(latestHRV).toString(),   'HRV (ms)',   '💙', null) : ''}
        ${latestRHR   ? _statCard(Math.round(latestRHR).toString(),   'Resting HR', '❤️', null) : ''}
        ${latestSteps ? _statCard(Math.round(latestSteps).toLocaleString(), 'Steps', '👟', 'var(--color-cyan)') : ''}
        ${latestSleep ? _statCard(latestSleep.toFixed(1) + 'h',      'Sleep',      '🌙', null) : ''}
      </div>
    </div>
  `;
}

const HEATMAP_ALPHA = [0, 0.32, 0.52, 0.72, 0.95];

function _heatmapCellStyle(type, level) {
  const a = HEATMAP_ALPHA[level] || 0;
  if (!type || level === 0) return '';
  if (type === 'lift') return `background:rgba(139,92,246,${a});`;
  if (type === 'run')  return `background:rgba(6,182,212,${a});`;
  // both
  return `background:linear-gradient(90deg,rgba(139,92,246,${a}),rgba(6,182,212,${a}));`;
}

// Body-weight trend section with an SVG sparkline (no chart lib needed).
export function _renderBodyWeightSection(state) {
  const bw = _bodyWeightTrend(state);
  if (!bw.hasData) return '';
  const unit = state.settings?.weightUnit || 'kg';

  const W = 300, H = 64, pad = 6;
  const pts = bw.points;
  const span = Math.max(1, bw.max - bw.min);
  const n = pts.length;
  const x = i => pad + (i / (n - 1)) * (W - pad * 2);
  const y = w => H - pad - ((w - bw.min) / span) * (H - pad * 2);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;

  const up = bw.delta > 0;
  const deltaHtml = bw.delta !== 0
    ? `<span class="profile-bw-delta profile-bw-delta--${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${Math.abs(bw.delta)} ${unit}</span>`
    : `<span class="profile-bw-delta">– stable</span>`;

  return `
    <div class="profile-section">
      <div class="profile-section-title">Body Weight</div>
      <div class="profile-bw-card">
        <div class="profile-bw-head">
          <div class="profile-bw-latest">${bw.latest}<span class="profile-bw-unit">${unit}</span></div>
          <div class="profile-bw-meta">${deltaHtml}<span class="profile-bw-sub">last 30 days</span></div>
        </div>
        <svg class="profile-bw-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="rgba(34,211,238,0.30)"/>
              <stop offset="100%" stop-color="rgba(34,211,238,0)"/>
            </linearGradient>
          </defs>
          <path d="${area}" fill="url(#bwFill)"/>
          <path d="${line}" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  `;
}

export function _renderHeatmap(rows, days) {
  const dayLetters = days.map(d => d[0].toUpperCase());
  const cols = `grid-template-columns:30px repeat(${days.length},1fr);`;

  const headCells = `<span class="profile-heatmap-rowlabel"></span>` +
    dayLetters.map(l => `<span class="profile-heatmap-day-label">${l}</span>`).join('');

  const bodyCells = rows.map(row =>
    `<span class="profile-heatmap-rowlabel">${row.label || ''}</span>` +
    row.cells.map(c => {
      const type = c.type, level = c.level;
      const cls = type && level ? ` profile-heatmap-cell--${type}` : '';
      return `<div class="profile-heatmap-cell${cls}" style="${_heatmapCellStyle(type, level)}"></div>`;
    }).join('')
  ).join('');

  return `
    <div class="profile-heatmap">
      <div class="profile-heatmap-day-labels" style="${cols}">${headCells}</div>
      <div class="profile-heatmap-grid" style="${cols}">${bodyCells}</div>
      <div class="profile-heatmap-legend">
        <span class="phm-legend-label">Less</span>
        ${[1,2,3,4].map(l => `<span class="profile-heatmap-cell phm-legend-cell" style="background:rgba(148,163,184,${HEATMAP_ALPHA[l]});"></span>`).join('')}
        <span class="phm-legend-label">More</span>
        <span class="phm-legend-sep"></span>
        <span class="phm-legend-key"><span class="phm-legend-dot" style="background:rgba(139,92,246,0.8)"></span>Lift</span>
        <span class="phm-legend-key"><span class="phm-legend-dot" style="background:rgba(6,182,212,0.8)"></span>Run</span>
      </div>
    </div>
  `;
}

// ── Data computation helpers ──────────────────────────────────────────────────

export function _esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function _isSet(s) {
  return isValidWorkingSet(s);
}

export function _countTotalWorkouts(state, days) {
  let count = 0;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      const hasLifts = Object.keys(wkData?.lifts?.[d] || {}).some(l => {
        const sets = wkData.lifts[d][l];
        return Array.isArray(sets) && sets.some(_isSet);
      });
      const hasRun = (parseFloat(runDaySummary(wkData, d).dist) || 0) > 0;
      if (hasLifts || hasRun) count++;
    });
  }
  return count;
}

export function _computeRunningPBs(state, days) {
  const brackets = [
    { label: '5K',       minKm: 4.5,  maxKm: 5.5  },
    { label: '10K',      minKm: 9,    maxKm: 11   },
    { label: 'Half',     minKm: 20,   maxKm: 22   },
    { label: 'Marathon', minKm: 41,   maxKm: 43   },
  ];
  const bests = {};

  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      runSessionsForDay(wkData, d).forEach(run => {
        if (!run?.dist || !run?.time) return;
        const dist = parseFloat(run.dist);
        if (!dist) return;

        const parts = run.time.split(':').map(Number);
        let totalSecs = 0;
        if (parts.length === 2) totalSecs = parts[0] * 60 + parts[1];
        else if (parts.length === 3) totalSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (!totalSecs) return;

        const paceSecs = totalSecs / dist;
        for (const bracket of brackets) {
          if (dist >= bracket.minKm && dist <= bracket.maxKm) {
            if (!bests[bracket.label] || totalSecs < bests[bracket.label].totalSecs) {
              bests[bracket.label] = { label: bracket.label, dist, timeStr: run.time, totalSecs, paceSecs };
            }
          }
        }
      });
    });
  }

  return Object.values(bests).sort((a, b) => a.dist - b.dist);
}

// Latest logged body weight (canonical bodyWeightLog, newest entry). Returns
// number or null. Falls back to the most recent per-session bodyWeight entry.
export function _latestBodyWeight(state) {
  const log = (state.bodyWeightLog || []).filter(e => e && e.date && parseFloat(e.weight) > 0);
  if (log.length) {
    const latest = log.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b));
    return parseFloat(latest.weight);
  }
  // Fallback: scan per-session body weights (no reliable date, so just take any).
  for (const wkData of Object.values(state.weeks || {})) {
    for (const v of Object.values(wkData?.bodyWeight || {})) {
      const w = parseFloat(v);
      if (w > 0) return w;
    }
  }
  return null;
}

// Body-weight history for the trend chart. Returns the chronologically sorted
// points plus latest value and recent delta (vs ~30 days ago, or first point).
export function _bodyWeightTrend(state) {
  const log = (state.bodyWeightLog || [])
    .filter(e => e && e.date && parseFloat(e.weight) > 0)
    .map(e => ({ date: e.date, weight: parseFloat(e.weight) }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (log.length < 2) return { hasData: false, points: log };

  const latest = log[log.length - 1];
  const target = new Date(latest.date); target.setDate(target.getDate() - 30);
  let ref = [...log].reverse().find(e => new Date(e.date) <= target) || log[0];
  const delta = Math.round((latest.weight - ref.weight) * 10) / 10;

  const weights = log.map(p => p.weight);
  return {
    hasData: true,
    points: log,
    latest: latest.weight,
    delta,
    min: Math.min(...weights),
    max: Math.max(...weights),
  };
}

// All-time totals across every logged week: lifting volume, run distance (km),
// and number of distinct training sessions.
export function _lifetimeTotals(state, days) {
  let volume = 0, distanceKm = 0, sessions = 0;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      let dayVol = 0, dayHasLift = false;
      const dayLifts = wkData?.lifts?.[d] || {};
      for (const lift in dayLifts) {
        if (!Array.isArray(dayLifts[lift])) continue;
        dayLifts[lift].forEach(s => {
          if (_isSet(s)) { dayVol += (parseFloat(s.w) || 0) * (parseInt(s.r, 10) || 0); dayHasLift = true; }
        });
      }
      const runDist = parseFloat(runDaySummary(wkData, d).dist) || 0;
      volume += dayVol;
      distanceKm += runDist;
      if (dayHasLift || runDist > 0) sessions++;
    });
  }
  return { volume, distanceKm, sessions };
}

// ── Athlete progression / level system ────────────────────────────────────────
// XP is earned from accumulated training. Levels follow a triangular curve so
// early levels come quickly and later ones require sustained work.
const XP_BASE = 300;

function _levelTitle(level) {
  if (level < 5)  return 'Newcomer';
  if (level < 10) return 'Rising';
  if (level < 20) return 'Committed';
  if (level < 35) return 'Seasoned';
  if (level < 50) return 'Elite';
  return 'Legend';
}

export function _athleteProgression(lifetime, completions, longestStreak, prCount) {
  const xp = Math.round(
    (lifetime.sessions || 0) * 50 +
    (lifetime.volume || 0) / 100 +
    (lifetime.distanceKm || 0) * 10 +
    (longestStreak || 0) * 20 +
    (completions || 0) * 200 +
    (prCount || 0) * 25
  );

  // Total XP to reach level L = XP_BASE * L*(L-1)/2  → invert for current level.
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / XP_BASE)) / 2));
  const xpAtLevel = XP_BASE * (level * (level - 1)) / 2;
  const xpForNext = XP_BASE * level; // span from this level to the next
  const xpIntoLevel = xp - xpAtLevel;
  const pct = Math.max(0, Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100)));

  const milestones = [
    { icon: '🏁', label: 'First Session',   earned: (lifetime.sessions || 0) >= 1 },
    { icon: '📅', label: '50 Sessions',     earned: (lifetime.sessions || 0) >= 50 },
    { icon: '💯', label: '100 Sessions',    earned: (lifetime.sessions || 0) >= 100 },
    { icon: '🏋️', label: '100k Volume',     earned: (lifetime.volume || 0) >= 100000 },
    { icon: '🏃', label: '100km Club',      earned: (lifetime.distanceKm || 0) >= 100 },
    { icon: '🔥', label: '7-Day Streak',    earned: (longestStreak || 0) >= 7 },
    { icon: '⚡', label: '30-Day Streak',   earned: (longestStreak || 0) >= 30 },
    { icon: '🏆', label: 'Program Finisher', earned: (completions || 0) >= 1 },
  ];

  return { xp, level, title: _levelTitle(level), pct, xpIntoLevel: Math.round(xpIntoLevel), xpForNext, milestones };
}

// Renders the identity section. `hybridLevel` (from the canonical Hybrid Score
// XP ladder — levelFromXp) is the ONE level shown, so Profile and Home never
// disagree. The milestone badges (achievement flags, not a competing level)
// stay. Falls back to the legacy derived level only if no hybridLevel is given.
export function _renderProgressionSection(prog, hybridLevel = null) {
  const earned = prog.milestones.filter(m => m.earned).length;
  const badges = prog.milestones.map(m => `
    <div class="profile-badge${m.earned ? '' : ' profile-badge--locked'}" title="${_esc(m.label)}">
      <span class="profile-badge-icon">${m.icon}</span>
      <span class="profile-badge-label">${_esc(m.label)}</span>
    </div>
  `).join('');

  const ringLabel = hybridLevel ? _esc(hybridLevel.icon) : prog.level;
  const title     = hybridLevel ? _esc(hybridLevel.name) : prog.title;
  const xpLine    = hybridLevel
    ? (hybridLevel.next
        ? `${hybridLevel.xp.toLocaleString()} XP · ${hybridLevel.next.xpToGo.toLocaleString()} to ${_esc(hybridLevel.next.name)}`
        : `${hybridLevel.xp.toLocaleString()} XP · top tier reached`)
    : `${prog.xp.toLocaleString()} XP · ${prog.xpIntoLevel}/${prog.xpForNext} to Lv ${prog.level + 1}`;
  const barPct    = hybridLevel ? hybridLevel.progressPct : prog.pct;
  const eyebrow   = hybridLevel ? 'Hybrid Level' : 'Athlete Level';

  return `
    <div class="profile-section">
      <div class="profile-section-title">${eyebrow}</div>
      <div class="profile-level-card">
        <div class="profile-level-top">
          <div class="profile-level-ring">
            <span class="profile-level-num" style="${hybridLevel ? 'font-size:1.6rem;' : ''}">${ringLabel}</span>
          </div>
          <div class="profile-level-info">
            <div class="profile-level-title">${title}</div>
            <div class="profile-level-xp">${xpLine}</div>
            <div class="profile-level-bar"><div class="profile-level-fill" style="width:${barPct}%"></div></div>
          </div>
        </div>
        <div class="profile-badges-head">Milestones <span class="profile-badges-count">${earned}/${prog.milestones.length}</span></div>
        <div class="profile-badge-grid">${badges}</div>
      </div>
    </div>
  `;
}

// Accessory/variant lifts that contain a big-3 keyword but aren't the main lift.
const BIG3_EXCLUDE = /romanian|stiff[- ]?leg|\brdl\b|split|cossack|goblet|sumo squat|single-leg|deep squat|good\s*morning|leg press|hack|jump|bbj|benchmark|hold|zercher/i;

function _big3Movement(name) {
  if (BIG3_EXCLUDE.test(name)) return null;
  const n = name.toLowerCase();
  if (n.includes('deadlift')) return 'Deadlift';
  if (n.includes('bench'))    return 'Bench';
  if (n.includes('squat'))    return 'Squat';
  return null;
}

// The big-three PRs (Squat / Bench / Deadlift) — best e1RM per movement, robust
// to variant naming (e.g. "Paused Squat", "Close-Grip Bench"). Accessory
// variants (RDLs, split squats, …) are excluded. Returns S/B/D order, each item
// tagged with its movement.
export function _big3PRs(state, days) {
  const stats = allLiftsStats(state, days);
  const best = {}; // movement → { movement, name, displayName, e1rm }
  for (const [name, s] of Object.entries(stats)) {
    if (!(s.allTimeMax > 0)) continue;
    // Lifts are stored keyed by display name.
    const displayName = name;
    const mv = _big3Movement(displayName);
    if (!mv) continue;
    if (!best[mv] || s.allTimeMax > best[mv].e1rm) {
      best[mv] = { movement: mv, name, displayName, e1rm: s.allTimeMax };
    }
  }
  return ['Squat', 'Bench', 'Deadlift'].map(m => best[m]).filter(Boolean);
}

// Bodyweight-ratio standards per lift (ascending tier thresholds). Common
// rule-of-thumb breakpoints for Novice / Intermediate / Advanced / Elite.
const STRENGTH_STANDARDS = {
  Squat:    [1.0, 1.5, 2.0, 2.5],
  Bench:    [0.75, 1.0, 1.5, 2.0],
  Deadlift: [1.25, 1.75, 2.5, 3.0],
};
const STRENGTH_TIERS = [
  { name: 'Beginner',     color: '#94a3b8' },
  { name: 'Novice',       color: '#22d3ee' },
  { name: 'Intermediate', color: '#10b981' },
  { name: 'Advanced',     color: '#f59e0b' },
  { name: 'Elite',        color: '#ef4444' },
];

export function _strengthTier(label, ratio) {
  const thresholds = STRENGTH_STANDARDS[label];
  if (!thresholds) return STRENGTH_TIERS[0];
  let idx = 0;
  for (const t of thresholds) { if (ratio >= t) idx++; }
  return STRENGTH_TIERS[idx];
}

// Strength-to-bodyweight ratios for the big lifts, each classified into a
// strength-standard tier. Uses the same robust movement matching as the PR
// list, so variant names (e.g. "Paused Squat") still count. Returns
// [{ label, e1rm, ratio, tier }].
export function _relativeStrength(state, days, bodyWeight) {
  if (!bodyWeight || bodyWeight <= 0) return [];
  return _big3PRs(state, days).map(l => {
    const ratio = l.e1rm / bodyWeight;
    return { label: l.movement, e1rm: l.e1rm, ratio, tier: _strengthTier(l.movement, ratio) };
  });
}

// Generic running stats so runners always see something (not just exact-bracket
// PBs). best pace is over runs ≥ 1km. Returns null fields when no data.
export function _runningStats(state, days) {
  let totalKm = 0, longestKm = 0, runCount = 0, bestPaceSecs = Infinity;
  for (const wkData of Object.values(state.weeks || {})) {
    days.forEach(d => {
      runSessionsForDay(wkData, d).forEach(run => {
        const dist = parseFloat(run?.dist) || 0;
        if (dist <= 0) return;
        totalKm += dist;
        runCount++;
        if (dist > longestKm) longestKm = dist;
        if (run.time) {
          const parts = run.time.split(':').map(Number);
          let secs = 0;
          if (parts.length === 2)      secs = parts[0] * 60 + parts[1];
          else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
          if (secs > 0 && dist >= 1) { const pace = secs / dist; if (pace < bestPaceSecs) bestPaceSecs = pace; }
        }
      });
    });
  }
  return { totalKm, longestKm, runCount, bestPaceSecs: bestPaceSecs === Infinity ? null : bestPaceSecs };
}

// Compact number formatter for big stat values (124500 → "124.5k").
export function _compactNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 10_000)    return Math.round(n / 1000) + 'k';
  if (n >= 1000)      return (n / 1000).toFixed(1) + 'k';
  return Math.round(n).toString();
}

// mm:ss pace formatter (seconds per km).
export function _fmtPace(secsPerKm) {
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Compares best e1RM in the four most recent dated sessions vs older dated
// history. Exact exercise identity and all-activation scope match progression.
export function _liftTrend(state, days, liftName) {
  const history = exercisePerformanceHistory(state, liftName, { days });
  if (history.length < 5) return null;
  const recentBest = Math.max(...history.slice(0, 4).map((row) => row.e1rm), 0);
  const olderBest = Math.max(...history.slice(4).map((row) => row.e1rm), 0);

  if (recentBest === 0 || olderBest === 0) return null;
  const diff = Math.round(recentBest - olderBest);
  if (diff === 0) return null;
  return { diff: Math.abs(diff), dir: diff > 0 ? 'up' : 'down' };
}

// Builds week × day activity data for the heatmap (newest week last). Each cell
// is { type: ''|'lift'|'run'|'both', level: 0-4 } where level grades training
// load (volume for lifts, distance for runs) relative to the period max. Rows
// carry a month label (GitHub-style: shown only when the month changes).
export function _heatmapData(state, days, numWeeks, options = {}) {
  const today = options.today || todayKey();
  const currentStart = weekStartOf(today);
  if (!currentStart) return [];
  const index = indexSlotsByDate(state);
  const firstStart = addDaysISO(currentStart, -7 * Math.max(0, numWeeks - 1));

  // Real calendar-week/day activity across all activations.
  const raw = [];
  let maxVol = 0, maxDist = 0;
  for (let weekOffset = 0; weekOffset < numWeeks; weekOffset++) {
    const weekStart = addDaysISO(firstStart, weekOffset * 7);
    const cells = days.map((_, dayOffset) => {
      const date = addDaysISO(weekStart, dayOffset);
      const slots = index.allByDate.get(date) || [];
      const vol = slots.reduce((sum, slot) => sum + slot.stats.volumeKg, 0);
      const dist = slots.reduce((sum, slot) => sum + (parseFloat(slot.run?.dist) || 0), 0);
      if (vol > maxVol)   maxVol = vol;
      if (dist > maxDist) maxDist = dist;
      return { vol, dist };
    });
    raw.push({ week: weekStart, cells });
  }

  const grade = (cell) => {
    const hasLift = cell.vol > 0, hasRun = cell.dist > 0;
    if (!hasLift && !hasRun) return { type: '', level: 0 };
    const type = hasLift && hasRun ? 'both' : hasLift ? 'lift' : 'run';
    const load = (maxVol > 0 ? cell.vol / maxVol : 0) + (maxDist > 0 ? cell.dist / maxDist : 0);
    const level = load >= 1.2 ? 4 : load >= 0.8 ? 3 : load >= 0.4 ? 2 : 1;
    return { type, level };
  };

  let prevMonth = null;
  return raw.map(row => {
    const date = new Date(`${row.week}T12:00:00`);
    const month = date.toLocaleDateString(undefined, { month: 'short' });
    const label = month !== prevMonth ? month : '';
    prevMonth = month;
    return { week: row.week, label, cells: row.cells.map(grade) };
  });
}

// Calendar-week summary across every dated activation/session. Strength and
// each run are independent activities, matching the Activities screen.
export function _calendarWeekSummary(state, options = {}) {
  const startDate = options.weekStart || weekStartOf(options.today || todayKey());
  const empty = { weekStart: startDate, volume: 0, distanceKm: 0, sessions: 0, minutes: 0 };
  if (!startDate) return empty;
  const index = indexSlotsByDate(state);
  const result = { ...empty };
  for (let offset = 0; offset < 7; offset++) {
    const date = addDaysISO(startDate, offset);
    const slots = index.allByDate.get(date) || [];
    for (const slot of slots) {
      const week = state?.weeks?.[slot.weekKey];
      if (slot.stats.workingSets > 0) {
        result.sessions++;
        result.volume += slot.stats.volumeKg;
        result.minutes += _parseDurationMin(week?.gymStats?.[slot.day]?.time);
      }
      for (const run of runSessionsForDay(week, slot.day)) {
        const distance = parseFloat(run?.dist) || 0;
        if (distance <= 0) continue;
        result.sessions++;
        result.distanceKm += distance;
        result.minutes += _parseDurationMin(run.time);
      }
    }
  }
  return result;
}

// Lenient duration parser → minutes. Accepts "mm:ss", "h:mm:ss", or a plain
// number of minutes. Returns 0 for anything it can't confidently parse.
export function _parseDurationMin(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);          // plain minutes
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] + parts[1] / 60;            // mm:ss
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60; // h:mm:ss
  return 0;
}

// ── Render helpers ────────────────────────────────────────────────────────────

export function _statCard(value, label, icon, accentColor, extra = '') {
  const style = accentColor ? `style="color: ${accentColor}"` : '';
  return `
    <div class="profile-stat-card">
      <div class="profile-stat-icon">${icon}</div>
      <div class="profile-stat-value" ${style}>${value}</div>
      <div class="profile-stat-label">${label}</div>
      ${extra}
    </div>
  `;
}

// Relative-strength tiles for the hero band (strength ÷ bodyweight), coloured
// and labelled by strength-standard tier.
export function _relStrengthBand(items, unit) {
  if (!items.length) return '';
  return `
    <div class="profile-rs-band">
      ${items.map(i => {
        const color = i.tier?.color || '#c4b5fd';
        return `
        <div class="profile-rs-tile" style="border-color:${color}38;background:linear-gradient(160deg, ${color}22, ${color}07);">
          <div class="profile-rs-ratio" style="color:${color};">${i.ratio.toFixed(2)}<span class="profile-rs-x">×BW</span></div>
          <div class="profile-rs-label">${_esc(i.label)}</div>
          <div class="profile-rs-sub" style="color:${color};">${i.tier?.name || ''}</div>
          <div class="profile-rs-e1rm">${Math.round(i.e1rm)}&nbsp;${unit}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}

export function _prRow(liftName, e1rm, unit, trend, goal) {
  const safeName  = _esc(liftName);
  const trendHtml = trend
    ? `<span class="profile-pr-trend profile-pr-trend--${trend.dir}">${trend.dir === 'up' ? '↑' : '↓'} ${trend.diff}${unit}</span>`
    : '';

  const pct = goal ? Math.min(100, Math.round((e1rm / goal) * 100)) : 0;
  const goalHtml = goal ? `
    <div class="profile-pr-goal-bar"><div class="profile-pr-goal-fill" style="width:${pct}%"></div></div>
    <div class="profile-pr-goal-meta">${pct}% of ${goal}${unit} goal</div>
  ` : '';

  return `
    <div class="profile-pr-row${goal ? ' profile-pr-row--has-goal' : ''}">
      <div class="profile-pr-row-main">
        <span class="profile-pr-lift">${safeName}</span>
        <div class="profile-pr-row-right">
          <span class="profile-pr-value">${Math.round(e1rm)}&nbsp;${unit}&nbsp;<span class="profile-pr-tag">e1RM</span>${trendHtml}</span>
          <button class="profile-pr-set-goal-btn" data-action="set-pr-goal" data-lift="${safeName}" data-unit="${unit}" aria-label="Set goal for ${safeName}">${goal ? '✏' : '＋'}</button>
        </div>
      </div>
      ${goalHtml}
    </div>
  `;
}

export function _runPBRow(pb) {
  const mins = Math.floor(pb.totalSecs / 60);
  const secs = Math.round(pb.totalSecs % 60);
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;
  const paceMin = Math.floor(pb.paceSecs / 60);
  const paceSec = Math.round(pb.paceSecs % 60);
  const paceFormatted = `${paceMin}:${paceSec.toString().padStart(2, '0')}/km`;

  return `
    <div class="profile-pr-row">
      <span class="profile-pr-lift">${pb.label}</span>
      <span class="profile-pr-value">${timeFormatted} <span class="profile-pr-tag">${paceFormatted}</span></span>
    </div>
  `;
}

export function _completionRow(completion) {
  const catalog = getCatalogEntry(completion.programId);
  if (!catalog) return '';
  const date = completion.completedAt
    ? new Date(completion.completedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '';
  return `
    <div class="profile-completion-row">
      <div class="profile-completion-icon" style="background: linear-gradient(135deg, ${catalog.coverGradient?.[0] || '#1a0e2e'}, ${catalog.coverGradient?.[1] || '#2d1a5c'})">
        ${catalog.icon || '📋'}
      </div>
      <div class="profile-completion-info">
        <div class="profile-completion-name">${catalog.name}</div>
        <div class="profile-completion-meta">${completion.weeksCompleted ? `${completion.weeksCompleted} weeks` : ''}${date ? ` · ${date}` : ''}</div>
      </div>
      <span class="profile-completion-badge">✓</span>
    </div>
  `;
}
