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
import { runDaySummary, runSessionsForDay } from './state/run-sessions.js';
import { insightsForSession } from './analytics/insights/build-insights.js';
import { paceZoneColour } from './analytics/utils.js';
import { confettiBurst } from './ui/celebration.js';
import { hapticSuccess } from './haptics.js';
import { MUSCLE_MAP } from './metrics/metrics-strength.js';
import { sharePRCard, topPR } from './brain/pr-share.js';
import { showToast } from './state.js';

let _getState = null;
export function initSessionRecap(getStateFn) { _getState = getStateFn; }

// C6b — share the session's biggest PR as an image (from the recap Share button).
export function sharePRFromRecap() {
  const state = _getState?.();
  if (!state) return;
  const { week, day, sessionId } = _recapCtx;
  const recap = buildSessionRecap(state, week, day, sessionId);
  const pr = topPR(recap.lifts);
  if (!pr) { showToast('No PR to share from this session'); return; }
  sharePRCard(pr, state, { showToast });
}

// V2 — Summary | Breakdown, remembered across a single recap's open lifetime.
let _recapTab = 'summary';
let _recapCtx = { week: null, day: null, sessionId: null };

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
export function buildSessionRecap(state, week, day, sessionId = null) {
  const wd       = state?.weeks?.[week] || {};
  const dayLifts = wd.lifts?.[day] || {};
  const exactRun = sessionId
    ? runSessionsForDay(wd, day).find(run => run.sessionId === sessionId)
    : null;
  const runSummary = sessionId ? (exactRun || {}) : runDaySummary(wd, day);
  const run      = Object.keys(runSummary).length ? runSummary : null;
  const gymStats = wd.gymStats?.[day] || {};
  const gymRpe   = wd.gymRpe?.[day] || '';
  const dateISO  = wd.dates?.[day] || null;

  // ── Strength ──
  let tonnage = 0, workingSets = 0, totalReps = 0;
  const lifts = [];
  const muscleCredits = {};   // muscle → weighted working-set credits (primary 1, secondary 0.5)
  for (const name in dayLifts) {
    const sets = dayLifts[name];
    if (!Array.isArray(sets)) continue;
    const done = sets.filter((s) => isCompletedSet(s) && !isWarmupSet(s));
    if (!done.length) continue;
    let liftVol = 0, bestE1 = 0, topSet = null, liftReps = 0;
    done.forEach((s) => {
      liftVol += setVolume(s);
      liftReps += parseInt(s.r, 10) || 0;
      const est = e1rm(s.w, s.r);
      if (est > bestE1) { bestE1 = est; topSet = { w: parseFloat(s.w) || 0, r: parseFloat(s.r) || 0 }; }
    });
    tonnage += liftVol;
    workingSets += done.length;
    totalReps += liftReps;

    // Full per-set list (working + warm-ups, in order) for the Breakdown grid.
    const setList = sets
      .filter((s) => isCompletedSet(s))
      .map((s) => ({
        w: parseFloat(s.w) || 0, r: parseInt(s.r, 10) || 0,
        warmup: isWarmupSet(s), type: s.type || '',
        rir: s.rir != null ? s.rir : (s.rpe != null ? 10 - s.rpe : null),
        vol: Math.round(setVolume(s)),
      }));

    // Weighted muscle credits (primary 1.0, secondary 0.5) × working set count.
    const mm = MUSCLE_MAP[name];
    if (mm) {
      (mm.primary || []).forEach((m) => { muscleCredits[m] = (muscleCredits[m] || 0) + done.length; });
      (mm.secondary || []).forEach((m) => { muscleCredits[m] = (muscleCredits[m] || 0) + done.length * 0.5; });
    }

    // PR: this session's best e1RM beats the lift's best in every prior session
    // (needs an established previous best — a first-ever lift isn't a "PR").
    const prior = priorBestE1rm(state, week, day, name);
    const pr = prior > 0 && bestE1 > prior + 0.5;
    lifts.push({ name, sets: done.length, reps: liftReps, volume: Math.round(liftVol), topSet, e1rm: Math.round(bestE1), pr, setList });
  }
  lifts.sort((a, b) => b.volume - a.volume);
  const muscles = Object.entries(muscleCredits)
    .map(([muscle, credits]) => ({ muscle, credits }))
    .sort((a, b) => b.credits - a.credits);

  // ── Run / walk ──
  let runOut = null;
  const runDist = run ? (parseFloat(run.dist) || 0) : 0;
  if (run && (runDist > 0 || run.time)) {
    runOut = {
      sessionId: run.sessionId || null,
      type:    run.type === 'walk' ? 'walk' : 'run',
      distKm:  runDist,
      time:    run.time || '',
      pace:    pacePerKm(runDist, run.time),
      rpe:     run.rpe || '',
      avgHR:   run.avgHR || '',
      maxHR:   run.maxHR || '',
      cadence: run.avgCadence || run.cadence || '',
      elev:    run.elev || '',
      descent: run.descent || '',
      cals:    run.cals || '',
      te:      run.trainingEffect || run.te || '',
      hrZones: Array.isArray(run.hrZones) ? run.hrZones : null,
      splits:  Array.isArray(run.splits) ? run.splits : [],
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
    tonnage: Math.round(tonnage), workingSets, totalReps,
    duration: gymStats.time || '', gymRpe,
    gymHR: gymStats.avgHR || '', gymMaxHR: gymStats.maxHR || '',
    gymCals: gymStats.cals || '', gymTE: gymStats.trainingEffect || gymStats.te || '',
    lifts, muscles, run: runOut,
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

const UNIT = 'kg';
const ZONE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f97316', '#ef4444'];

function _summaryTiles(r) {
  return [
    r.tonnage > 0 ? statTile('Volume', `${r.tonnage.toLocaleString()} ${UNIT}`) : '',
    r.workingSets > 0 ? statTile('Sets', r.workingSets) : '',
    r.duration ? statTile('Duration', r.duration) : '',
    r.gymRpe ? statTile('Gym RPE', `${r.gymRpe}/10`) : '',
    r.run ? statTile('Distance', r.run.distKm > 0 ? `${r.run.distKm.toFixed(2)} km` : '') : '',
    r.run ? statTile('Pace', r.run.pace ? `${r.run.pace} /km` : '') : '',
    r.run ? statTile('Run time', r.run.time) : '',
    r.run && r.run.avgHR ? statTile('Avg HR', `${r.run.avgHR} bpm`) : '',
  ].join('');
}

function _liftSummaryRows(r) {
  return r.lifts.map((l) => `
    <div class="recap-lift">
      <div class="recap-lift__name">${esc(l.name)}${l.pr ? ` <span class="recap-pr" title="New estimated 1RM best">🏆 PR</span>` : ''}</div>
      <div class="recap-lift__detail">
        ${l.topSet ? `${l.topSet.w} ${UNIT} × ${l.topSet.r}` : `${l.sets} sets`}
        <span class="recap-lift__e1rm">est. 1RM ${l.e1rm} ${UNIT}</span>
      </div>
    </div>`).join('');
}

// Pace-per-km bar chart: bar length relative to the fastest split, coloured by
// pace zone. Falls back to plain rows if no per-km times exist.
function _paceChart(r, thresholdSec) {
  if (!r.run || !r.run.splits.length) return '';
  const paces = r.run.splits.map((s, i) => ({ km: s.lap ?? i + 1, secs: parseFloat(s.time) || 0 }));
  const timed = paces.filter((p) => p.secs > 0);
  if (!timed.length) {
    return `<div class="recap-splits">${paces.map((p) =>
      `<div class="recap-split"><span>${p.km} km</span><span>—</span></div>`).join('')}</div>`;
  }
  const fastest = Math.min(...timed.map((p) => p.secs));
  return `<div class="recap-pacechart">${paces.map((p) => {
    const pct = p.secs > 0 ? Math.max(12, Math.round((fastest / p.secs) * 100)) : 0;
    const col = p.secs > 0 ? paceZoneColour(p.secs, thresholdSec) : '#334155';
    return `<div class="recap-pacerow">
      <span class="recap-pacerow__km">${p.km}</span>
      <span class="recap-pacerow__track"><span class="recap-pacerow__bar" style="width:${pct}%;background:${col}"></span></span>
      <span class="recap-pacerow__val">${fmtPace(p.secs)}</span>
    </div>`;
  }).join('')}</div>`;
}

// ── Breakdown helpers ──
function _setTag(s) {
  if (s.warmup || s.type === 'W') return '<span class="rc-set__tag rc-set__tag--w">warm</span>';
  if (s.type === 'D') return '<span class="rc-set__tag rc-set__tag--d">drop</span>';
  if (s.type === 'F') return '<span class="rc-set__tag rc-set__tag--f">amrap</span>';
  return '';
}
function _liftSetGrid(r) {
  return r.lifts.map((l) => `
    <div class="rc-exercise">
      <div class="rc-exercise__head">
        <span class="rc-exercise__name">${esc(l.name)}${l.pr ? ' 🏆' : ''}</span>
        <span class="rc-exercise__meta">${l.sets} sets · ${l.reps} reps · ${l.volume.toLocaleString()} ${UNIT}</span>
      </div>
      <div class="rc-sets">
        ${l.setList.map((s, i) => `
          <div class="rc-set${s.warmup ? ' rc-set--warm' : ''}">
            <span class="rc-set__n">${i + 1}</span>
            <span class="rc-set__wr">${s.w} ${UNIT} × ${s.r}</span>
            ${_setTag(s)}
            ${s.rir != null ? `<span class="rc-set__rir">RIR ${s.rir}</span>` : ''}
            <span class="rc-set__vol">${s.vol.toLocaleString()} ${UNIT}</span>
          </div>`).join('')}
      </div>
    </div>`).join('');
}
function _sessionTotals(r) {
  const tiles = [
    r.workingSets > 0 ? statTile('Sets', r.workingSets) : '',
    r.totalReps > 0 ? statTile('Reps', r.totalReps) : '',
    r.tonnage > 0 ? statTile('Volume', `${r.tonnage.toLocaleString()} ${UNIT}`) : '',
    r.gymHR ? statTile('Avg HR', `${r.gymHR} bpm`) : '',
    r.gymMaxHR ? statTile('Max HR', `${r.gymMaxHR} bpm`) : '',
    r.gymCals ? statTile('Calories', r.gymCals) : '',
    r.gymTE ? statTile('Training effect', r.gymTE) : '',
  ].join('');
  return tiles ? `<div class="recap-stats">${tiles}</div>` : '';
}
function _muscleBar(r) {
  if (!r.muscles || !r.muscles.length) return '';
  const max = Math.max(...r.muscles.map((m) => m.credits)) || 1;
  return `<div class="rc-muscles">${r.muscles.slice(0, 8).map((m) => `
    <div class="rc-muscle">
      <span class="rc-muscle__lbl">${esc(String(m.muscle).replace(/_/g, ' '))}</span>
      <span class="rc-muscle__track"><span class="rc-muscle__bar" style="width:${Math.round((m.credits / max) * 100)}%"></span></span>
      <span class="rc-muscle__v">${m.credits % 1 === 0 ? m.credits : m.credits.toFixed(1)}</span>
    </div>`).join('')}</div>`;
}
function _hrZoneBar(r) {
  const z = r.run && r.run.hrZones;
  if (!z || !z.some((v) => v > 0)) return '';
  const fmtZ = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`);
  return `
    <div class="recap-section-title">Heart-rate zones</div>
    <div class="rc-hrzbar">${z.map((v, i) => (v > 0 ? `<span class="rc-hrzseg" style="flex:${v};background:${ZONE_COLORS[i]}"></span>` : '')).join('')}</div>
    <div class="rc-hrzlabels">${z.map((v, i) => `<span class="rc-hrzlabel"><b style="color:${ZONE_COLORS[i]}">Z${i + 1}</b> ${v > 0 ? fmtZ(v) : '—'}</span>`).join('')}</div>`;
}
function _runTilesFull(r) {
  if (!r.run) return '';
  const run = r.run;
  const tiles = [
    run.avgHR ? statTile('Avg HR', `${run.avgHR} bpm`) : '',
    run.maxHR ? statTile('Max HR', `${run.maxHR} bpm`) : '',
    run.cadence ? statTile('Cadence', `${run.cadence} spm`) : '',
    run.elev ? statTile('Elev gain', `${run.elev} m`) : '',
    run.descent ? statTile('Elev loss', `${run.descent} m`) : '',
    run.te ? statTile('Training effect', run.te) : '',
    run.cals ? statTile('Calories', run.cals) : '',
    run.rpe ? statTile('RPE', `${run.rpe}/10`) : '',
  ].join('');
  return tiles ? `<div class="recap-stats">${tiles}</div>` : '';
}
function _splitTableFull(r, thresholdSec) {
  if (!r.run || !r.run.splits.length) return '';
  const rows = r.run.splits.map((s, i) => {
    const secs = parseFloat(s.time) || 0;
    const col = secs > 0 ? paceZoneColour(secs, thresholdSec) : '#334155';
    return `<div class="rc-split">
      <span class="rc-split__km">${s.lap ?? i + 1}</span>
      <span class="rc-split__pace" style="color:${col}">${fmtPace(secs)}</span>
      <span class="rc-split__hr">${s.avgHR ? `${s.avgHR} bpm` : '—'}</span>
    </div>`;
  }).join('');
  return `<div class="recap-section-title">Splits</div>
    <div class="rc-splittable"><div class="rc-split rc-split--head"><span>KM</span><span>Pace</span><span>Avg HR</span></div>${rows}</div>`;
}

// V2 — Summary (the story + essentials) | Breakdown (every set · muscle focus ·
// full run detail). All from data we already capture — the front got leaner, the
// depth got deeper. `tab` selects which face to render.
export function renderSessionRecapHTML(r, insights = [], thresholdSec = null, tab = 'summary') {
  if (r.empty) {
    return `<div class="recap-empty">Nothing logged for this day yet.</div>`;
  }
  const hasPR = (r.lifts || []).some(l => l.pr);
  const head = `
    <div class="recap-head">
      <div class="recap-date">${fmtDate(r.dateISO)}</div>
      <div class="recap-badges">${r.types.map(typeBadge).join('')}</div>
    </div>
    ${hasPR ? `<button class="recap-share-pr tactile-scale" data-action="share-pr-card" style="display:flex;align-items:center;gap:8px;justify-content:center;width:100%;margin:6px 0 4px;background:color-mix(in srgb, var(--accent-blue, #8b5cf6) 14%, transparent);border:1px solid color-mix(in srgb, var(--accent-blue, #8b5cf6) 40%, transparent);color:var(--text-inverse);border-radius:12px;padding:11px;font-weight:700;font-size:0.9rem;cursor:pointer;">🏆 Share your PR</button>` : ''}`;
  const tabBar = `
    <div class="an-tabbar recap-tabbar">
      <button class="an-tab ${tab === 'summary' ? 'an-tab--active' : ''}" data-recap-tab="summary">Summary</button>
      <button class="an-tab ${tab === 'breakdown' ? 'an-tab--active' : ''}" data-recap-tab="breakdown">Breakdown</button>
    </div>`;

  let body;
  if (tab === 'breakdown') {
    body = `
      ${r.lifts.length ? `<div class="recap-section-title">Every set</div>${_liftSetGrid(r)}${_sessionTotals(r)}` : ''}
      ${r.muscles && r.muscles.length ? `<div class="recap-section-title">Muscle focus · weighted sets</div>${_muscleBar(r)}` : ''}
      ${r.run ? `<div class="recap-section-title">Run detail</div>${_runTilesFull(r)}${_hrZoneBar(r)}${_splitTableFull(r, thresholdSec)}` : ''}
    `;
  } else {
    body = `
      <div class="recap-stats">${_summaryTiles(r)}</div>
      ${r.run && r.run.distKm > 0 ? `<div id="recapMapContainer" class="recap-map"></div>` : ''}
      ${insights.length ? `<div class="recap-section-title">Insights</div>
        <ul class="recap-insights">${insights.map((i) =>
          `<li class="recap-insight--${esc(i.priority || 'info')}">${esc(i.text)}</li>`).join('')}</ul>` : ''}
      ${r.lifts.length ? `<div class="recap-section-title">Lifts</div>${_liftSummaryRows(r)}` : ''}
      ${r.run && r.run.splits.length ? `<div class="recap-section-title">Pace / km</div>${_paceChart(r, thresholdSec)}` : ''}
    `;
  }
  return `${head}${tabBar}<div class="recap-tabbody">${body}</div>`;
}

// Paint the current recap tab into the panel, wire the Summary|Breakdown tabs,
// and (Summary only) mount the GPS map. Re-run on every tab switch.
function _paintRecap() {
  const state = _getState?.();
  if (!state) return null;
  const { week, day, sessionId } = _recapCtx;
  const recap = buildSessionRecap(state, week, day, sessionId);
  let insights = [];
  try { insights = insightsForSession(state, recap.types); } catch (_) { insights = []; }

  const content = document.getElementById('sessionRecapContent');
  if (!content) return recap;
  content.innerHTML = renderSessionRecapHTML(recap, insights, state.thresholdPaceSeconds || null, _recapTab);
  content.querySelectorAll('[data-recap-tab]').forEach((btn) => {
    btn.addEventListener('click', () => { _recapTab = btn.getAttribute('data-recap-tab'); _paintRecap(); });
  });

  // The map lives on the Summary tab (async — loads coords + Leaflet).
  if (_recapTab === 'summary' && recap.run && recap.run.distKm > 0) {
    try {
      renderRunMap(week, day, recap.run.distKm, {
        containerId: 'recapMapContainer', splits: recap.run.splits, thresholdSec: state.thresholdPaceSeconds,
        activationId: state.activeActivationId,
        sessionId: recap.run.sessionId,
      });
    } catch (_) { /* map is best-effort */ }
  }
  return recap;
}

export function openSessionRecap(week, day, sessionId = null) {
  const state = _getState?.();
  if (!state) return;
  _recapCtx = { week, day, sessionId };
  _recapTab = 'summary';
  const recap = _paintRecap();

  const screen = document.getElementById('sessionRecapScreen');
  if (screen) { screen.style.display = 'block'; screen.scrollTop = 0; }

  // A PR deserves a moment: haptic + a short confetti burst over the recap.
  // (Reduced-motion users get the haptic + the 🏆 badge only.)
  if (recap && recap.lifts?.some(l => l.pr)) {
    try { hapticSuccess(); confettiBurst(); } catch (_) { /* best-effort */ }
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
