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

let _getState = null;
export function initSessionRecap(getStateFn) { _getState = getStateFn; }

// Epley estimated 1RM (matches the app's convention: 1-rep sets are exact).
function e1rm(w, r) {
  const weight = parseFloat(w), reps = parseFloat(r);
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
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
    lifts.push({ name, sets: done.length, volume: Math.round(liftVol), topSet, e1rm: Math.round(bestE1) });
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

  // ── Insights (honest, derived from this session only) ──
  const insights = [];
  if (tonnage > 0) insights.push(`Moved ${Math.round(tonnage).toLocaleString()} kg across ${workingSets} working set${workingSets === 1 ? '' : 's'}.`);
  if (lifts[0]?.topSet?.w) {
    insights.push(`Top lift: ${lifts[0].name} — ${lifts[0].topSet.w} kg × ${lifts[0].topSet.r} (est. 1RM ~${lifts[0].e1rm} kg).`);
  }
  const rpeVal = parseFloat(gymRpe || (runOut && runOut.rpe));
  if (Number.isFinite(rpeVal) && rpeVal > 0) {
    if (rpeVal >= 9)      insights.push(`Session RPE ${rpeVal}/10 — very hard. Prioritise sleep and recovery.`);
    else if (rpeVal >= 7) insights.push(`Session RPE ${rpeVal}/10 — a solid, productive effort.`);
    else                  insights.push(`Session RPE ${rpeVal}/10 — comfortable. Room to push next time.`);
  }
  if (runOut && runOut.pace) {
    insights.push(`${runOut.type === 'walk' ? 'Walk' : 'Run'}: ${runOut.distKm.toFixed(2)} km at ${runOut.pace} /km.`);
  }

  return {
    dateISO, types,
    tonnage: Math.round(tonnage), workingSets,
    duration: gymStats.time || '', gymRpe, gymHR: gymStats.avgHR || '',
    lifts, run: runOut, insights,
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

export function renderSessionRecapHTML(r) {
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
      <div class="recap-lift__name">${esc(l.name)}</div>
      <div class="recap-lift__detail">
        ${l.topSet ? `${l.topSet.w} kg × ${l.topSet.r}` : `${l.sets} sets`}
        <span class="recap-lift__e1rm">est. 1RM ${l.e1rm} kg</span>
      </div>
    </div>`).join('');

  const splitRows = (r.run && r.run.splits.length)
    ? `<div class="recap-splits">${r.run.splits.map((s, i) =>
        `<div class="recap-split"><span>${s.lap ?? i + 1} km</span><span>${s.time ? `${Math.floor(s.time / 60)}:${String(Math.round(s.time % 60)).padStart(2, '0')}` : '—'}</span></div>`).join('')}</div>`
    : '';

  return `
    <div class="recap-head">
      <div class="recap-date">${fmtDate(r.dateISO)}</div>
      <div class="recap-badges">${r.types.map(typeBadge).join('')}</div>
    </div>
    <div class="recap-stats">${tiles}</div>
    ${r.insights.length ? `<div class="recap-section-title">Insights</div>
      <ul class="recap-insights">${r.insights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${r.lifts.length ? `<div class="recap-section-title">Lifts</div>${liftRows}` : ''}
    ${splitRows ? `<div class="recap-section-title">Splits</div>${splitRows}` : ''}
  `;
}

export function openSessionRecap(week, day) {
  const state = _getState?.();
  if (!state) return;
  const recap = buildSessionRecap(state, week, day);
  const content = document.getElementById('sessionRecapContent');
  if (content) content.innerHTML = renderSessionRecapHTML(recap);
  const screen = document.getElementById('sessionRecapScreen');
  if (screen) { screen.style.display = 'block'; screen.scrollTop = 0; }
}

export function closeSessionRecap() {
  const screen = document.getElementById('sessionRecapScreen');
  if (screen) screen.style.display = 'none';
}

export function isSessionRecapOpen() {
  const screen = document.getElementById('sessionRecapScreen');
  return !!screen && screen.style.display !== 'none';
}
