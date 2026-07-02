// ==========================================
// SESSION RECAP (js/session-recap.js)
// A full-screen review of one day's completed session: headline stats, a
// per-lift strength breakdown, run/walk details, and a few honest,
// session-derived insights. Opened after finishing a session and by tapping a
// completed day in the calendar.
//
// buildSessionRecap() is pure (state, week, day) → structured summary — unit
// tested. Rendering + show/hide touch the DOM.
// ==========================================
import { isCompletedSet, isWarmupSet, setVolume } from './set-utils.js';
import { renderRunMap } from './workout-map.js';
import { insightsForSession } from './analytics/insights/build-insights.js';
import { paceZoneColour } from './analytics/utils.js';

let _getState = null;
export function initSessionRecap(getStateFn) { _getState = getStateFn; }

// Epley estimated 1RM (matches the app's convention: 1-rep sets are exact).
function e1rm(w, r) {
  const weight = parseFloat(w), reps = parseFloat(r);
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

// Best working-set e1RM for a lift across every OTHER logged session (all
// weeks/days except the one being recapped). Used to decide if this session set
// a new personal best. Pure scan of state; tolerates sparse data.
function priorBestE1rm(state, week, day, liftName) {
  let best = 0;
  const weeks = state?.weeks || {};
  for (const w in weeks) {
    const dayLifts = weeks[w]?.lifts || {};
    for (const d in dayLifts) {
      if (String(w) === String(week) && d === day) continue; // exclude this session
      const sets = dayLifts[d]?.[liftName];
      if (!Array.isArray(sets)) continue;
      sets.forEach((s) => {
        if (!isCompletedSet(s) || isWarmupSet(s)) return;
        const est = e1rm(s.w, s.r);
        if (est > best) best = est;
      });
    }
  }
  return best;
}

function timeToSeconds(t) {
  if (!t) return 0;
  const p = String(t).split(':').map(Number);
  if (p.some(isNaN)) return 0;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] || 0;
}

function pacePerKm(distKm, timeStr) {
  const secs = timeToSeconds(timeStr);
  if (!secs || !distKm || distKm <= 0) return null;
  const per = secs / distKm;
  return `${Math.floor(per / 60)}:${String(Math.round(per % 60)).padStart(2, '0')}`;
}

// Pure: assemble the recap for one (week, day). Never throws on sparse data.
export function buildSessionRecap(state, week, day) {
  const wd       = state?.weeks?.[week] || {};
  const dayLifts = wd.lifts?.[day] || {};
  const run      = wd.runs?.[day] || null;
  const gymStats = wd.gymStats?.[day] || {};
  const gymRpe   = wd.gymRpe?.[day] || '';
  const dateISO  = wd.dates?.[day] || null;

  // ── Strength ──
  let tonnage = 0, workingSets = 0;
  const lifts = [];
  for (const name in dayLifts) {
    const sets = dayLifts[name];
    if (!Array.isArray(sets)) continue;
    const done = sets.filter((s) => isCompletedSet(s) && !isWarmupSet(s));
    if (!done.length) continue;
    let liftVol = 0, bestE1 = 0, topSet = null;
    done.forEach((s) => {
      liftVol += setVolume(s);
      const est = e1rm(s.w, s.r);
      if (est > bestE1) { bestE1 = est; topSet = { w: parseFloat(s.w) || 0, r: parseFloat(s.r) || 0 }; }
    });
    tonnage += liftVol;
    workingSets += done.length;
    // PR: this session's best e1RM beats the lift's best in every prior session
    // (needs an established previous best — a first-ever lift isn't a "PR").
    const prior = priorBestE1rm(state, week, day, name);
    const pr = prior > 0 && bestE1 > prior + 0.5;
    lifts.push({ name, sets: done.length, volume: Math.round(liftVol), topSet, e1rm: Math.round(bestE1), pr });
  }
  lifts.sort((a, b) => b.volume - a.volume);

  // ── Run / walk ──
  let runOut = null;
  const runDist = run ? (parseFloat(run.dist) || 0) : 0;
  if (run && (runDist > 0 || run.time)) {
    runOut = {
      type:   run.type === 'walk' ? 'walk' : 'run',
      distKm: runDist,
      time:   run.time || '',
      pace:   pacePerKm(runDist, run.time),
      rpe:    run.rpe || '',
      avgHR:  run.avgHR || '',
      splits: Array.isArray(run.splits) ? run.splits : [],
    };
  }

  const types = [];
  if (workingSets > 0) types.push('gym');
  if (runOut) types.push(runOut.type);

  // Insights are NOT hand-rolled here — they come from the shared insight
  // engine (see insightsForSession), so there's one source of truth. This
  // builder only assembles the session's factual summary.
  return {
    dateISO, types,
    tonnage: Math.round(tonnage), workingSets,
    duration: gymStats.time || '', gymRpe, gymHR: gymStats.avgHR || '',
    lifts, run: runOut,
    empty: workingSets === 0 && !runOut,
  };
}

// ── Rendering ──
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtDate(iso) {
  if (!iso) return 'Session';
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return `${DOW[d.getDay()]}, ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function typeBadge(t) {
  const map = { gym: ['🏋️', 'Strength', '#60a5fa'], run: ['🏃', 'Run', '#f472b6'], walk: ['🚶', 'Walk', '#34d399'] };
  const [icon, label, color] = map[t] || ['•', t, '#94a3b8'];
  return `<span class="recap-badge" style="--c:${color}">${icon} ${label}</span>`;
}

function statTile(label, value) {
  if (value === '' || value == null) return '';
  return `<div class="recap-stat"><span class="recap-stat__v">${value}</span><span class="recap-stat__l">${label}</span></div>`;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtPace(secs) {
  if (!secs || secs <= 0) return '—';
  return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`;
}

export function renderSessionRecapHTML(r, insights = [], thresholdSec = null) {
  if (r.empty) {
    return `<div class="recap-empty">Nothing logged for this day yet.</div>`;
  }
  const tiles = [
    r.tonnage > 0 ? statTile('Volume', `${r.tonnage.toLocaleString()} kg`) : '',
    r.workingSets > 0 ? statTile('Working sets', r.workingSets) : '',
    statTile('Duration', r.duration),
    statTile('Gym RPE', r.gymRpe ? `${r.gymRpe}/10` : ''),
    r.run ? statTile('Distance', r.run.distKm > 0 ? `${r.run.distKm.toFixed(2)} km` : '') : '',
    r.run ? statTile('Pace', r.run.pace ? `${r.run.pace} /km` : '') : '',
    r.run ? statTile('Run time', r.run.time) : '',
  ].join('');

  const liftRows = r.lifts.map((l) => `
    <div class="recap-lift">
      <div class="recap-lift__name">${esc(l.name)}${l.pr ? ` <span class="recap-pr" title="New estimated 1RM best">🏆 PR</span>` : ''}</div>
      <div class="recap-lift__detail">
        ${l.topSet ? `${l.topSet.w} kg × ${l.topSet.r}` : `${l.sets} sets`}
        <span class="recap-lift__e1rm">est. 1RM ${l.e1rm} kg</span>
      </div>
    </div>`).join('');

  // Pace-per-km bar chart: bar length is relative to the fastest split (fastest
  // = fullest), each bar coloured by its pace zone. Falls back to plain rows if
  // no per-km times exist.
  let splitRows = '';
  if (r.run && r.run.splits.length) {
    const paces = r.run.splits.map((s, i) => ({ km: s.lap ?? i + 1, secs: parseFloat(s.time) || 0 }));
    const timed = paces.filter((p) => p.secs > 0);
    if (timed.length) {
      const fastest = Math.min(...timed.map((p) => p.secs));
      splitRows = `<div class="recap-pacechart">${paces.map((p) => {
        const pct = p.secs > 0 ? Math.max(12, Math.round((fastest / p.secs) * 100)) : 0;
        const col = p.secs > 0 ? paceZoneColour(p.secs, thresholdSec) : '#334155';
        return `<div class="recap-pacerow">
          <span class="recap-pacerow__km">${p.km}</span>
          <span class="recap-pacerow__track"><span class="recap-pacerow__bar" style="width:${pct}%;background:${col}"></span></span>
          <span class="recap-pacerow__val">${fmtPace(p.secs)}</span>
        </div>`;
      }).join('')}</div>`;
    } else {
      splitRows = `<div class="recap-splits">${paces.map((p) =>
        `<div class="recap-split"><span>${p.km} km</span><span>—</span></div>`).join('')}</div>`;
    }
  }

  return `
    <div class="recap-head">
      <div class="recap-date">${fmtDate(r.dateISO)}</div>
      <div class="recap-badges">${r.types.map(typeBadge).join('')}</div>
    </div>
    <div class="recap-stats">${tiles}</div>
    ${r.run && r.run.distKm > 0 ? `<div id="recapMapContainer" class="recap-map"></div>` : ''}
    ${insights.length ? `<div class="recap-section-title">Insights</div>
      <ul class="recap-insights">${insights.map((i) =>
        `<li class="recap-insight--${esc(i.priority || 'info')}">${esc(i.text)}</li>`).join('')}</ul>` : ''}
    ${r.lifts.length ? `<div class="recap-section-title">Lifts</div>${liftRows}` : ''}
    ${splitRows ? `<div class="recap-section-title">Pace / km</div>${splitRows}` : ''}
  `;
}

export function openSessionRecap(week, day) {
  const state = _getState?.();
  if (!state) return;
  const recap = buildSessionRecap(state, week, day);
  // Insights come from the shared engine, filtered to this session's categories.
  let insights = [];
  try { insights = insightsForSession(state, recap.types); } catch (_) { insights = []; }
  const content = document.getElementById('sessionRecapContent');
  if (content) content.innerHTML = renderSessionRecapHTML(recap, insights, state.thresholdPaceSeconds || null);
  const screen = document.getElementById('sessionRecapScreen');
  if (screen) { screen.style.display = 'block'; screen.scrollTop = 0; }

  // Draw the saved GPS route for a run/walk (async — loads coords + Leaflet).
  if (recap.run && recap.run.distKm > 0) {
    try {
      renderRunMap(week, day, recap.run.distKm, {
        containerId: 'recapMapContainer',
        splits: recap.run.splits,
        thresholdSec: state.thresholdPaceSeconds,
      });
    } catch (_) { /* map is best-effort */ }
  }
}

export function closeSessionRecap() {
  const screen = document.getElementById('sessionRecapScreen');
  if (screen) screen.style.display = 'none';
}

export function isSessionRecapOpen() {
  const screen = document.getElementById('sessionRecapScreen');
  return !!screen && screen.style.display !== 'none';
}
