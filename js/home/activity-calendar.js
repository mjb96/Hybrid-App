// =============================================================================
// ACTIVITY CALENDAR — self-contained, no state closure dependency
// =============================================================================

const FULL_MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const _MN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _DN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function _resolveLiftName(appState, id) {
  return (appState.liftNames && appState.liftNames[id]) || id;
}

function _buildActivityMap(appState) {
  const map = {};
  const weeks = appState.weeks || {};

  for (const wk in weeks) {
    const wd = weeks[wk];
    if (!wd) continue;
    const dates    = wd.dates    || {};
    const lifts    = wd.lifts    || {};
    const runs     = wd.runs     || {};
    const gymStats = wd.gymStats || {};

    const allDays = new Set([...Object.keys(lifts), ...Object.keys(runs)]);

    for (const day of allDays) {
      const ds = dates[day];
      if (!ds) continue;
      if (!map[ds]) map[ds] = { gym: false, run: false, gymDetail: null, runDetail: null };

      // Gym — count completed sets and collect exercise names
      const dayLifts = lifts[day] || {};
      let completedSets = 0;
      const exercises = [];
      for (const ln in dayLifts) {
        if (Array.isArray(dayLifts[ln])) {
          const done = dayLifts[ln].filter(s => s?.c);
          if (done.length > 0) {
            completedSets += done.length;
            exercises.push(_resolveLiftName(appState, ln));
          }
        }
      }
      if (completedSets > 0) {
        map[ds].gym = true;
        const gs = gymStats[day] || {};
        map[ds].gymDetail = { completedSets, exercises, time: gs.time || '', cals: gs.cals || 0, avgHR: gs.avgHR || 0, maxHR: gs.maxHR || 0 };
      }

      // Run
      const run = runs[day];
      if (run && parseFloat(run.dist) > 0) {
        map[ds].run = true;
        map[ds].runDetail = run;
      }
    }
  }
  return map;
}

function _renderCalendarMonth(year, month, activityMap, today) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds  = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const act = activityMap[ds] || {};
    const isToday = ds === today;
    const dots = [
      act.gym ? '<span class="cal-dot cal-dot-gym"></span>' : '',
      act.run ? '<span class="cal-dot cal-dot-run"></span>' : '',
    ].join('');
    cells += `<button type="button" class="cal-cell${isToday ? ' cal-today' : ''}${(act.gym||act.run) ? ' cal-has-activity' : ''}" data-cal-date="${ds}">
      <span class="cal-num">${d}</span>${dots ? `<div class="cal-dots">${dots}</div>` : ''}
    </button>`;
  }

  return `<div class="cal-month">
    <div class="cal-month-name">${FULL_MONTH[month]} ${year}</div>
    <div class="cal-grid">
      ${['M','T','W','T','F','S','S'].map(h => `<div class="cal-hdr">${h}</div>`).join('')}
      ${cells}
    </div>
  </div>`;
}

// ── Calendar day modal ────────────────────────────────────────────────────────

function _ensureCalModal() {
  let modal = document.getElementById('calModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'calModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = '<div class="cal-msheet"><div id="calModalContent"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => {
      if (e.target === modal || e.target.closest('[data-cal-action="close"]')) {
        modal.classList.remove('cal-modal--open');
      }
    });
  }
  return modal;
}

function _fmtTime(timeStr) {
  if (!timeStr) return null;
  const p = String(timeStr).split(':').map(Number);
  if (p.some(isNaN)) return timeStr;
  if (p.length === 3 && p[0] > 0) return `${p[0]}h ${p[1]}m ${p[2]}s`;
  if (p.length === 3) return `${p[1]}m ${p[2]}s`;
  if (p.length === 2) return `${p[0]}m ${p[1]}s`;
  return timeStr;
}

function _runPace(dist, timeStr) {
  if (!dist || !timeStr) return null;
  const p = String(timeStr).split(':').map(Number);
  if (p.some(isNaN)) return null;
  let secs = p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p.length === 2 ? p[0]*60 + p[1] : 0;
  if (secs <= 0 || dist <= 0) return null;
  const pps = secs / dist;
  return `${Math.floor(pps/60)}:${String(Math.round(pps%60)).padStart(2,'0')} /km`;
}

function _stat(label, value) {
  if (!value && value !== 0) return '';
  return `<div class="cal-m-stat"><span class="cal-m-sl">${label}</span><span class="cal-m-sv">${value}</span></div>`;
}

function _openCalModal(dateStr, activityMap) {
  const modal   = _ensureCalModal();
  const content = document.getElementById('calModalContent');
  if (!content) return;

  const [y, mo, d] = dateStr.split('-').map(Number);
  const dow       = _DN[new Date(`${dateStr}T12:00:00`).getDay()];
  const dateLabel = `${dow}, ${d} ${_MN[mo]} ${y}`;

  const act = activityMap[dateStr];
  let bodyHTML = '';

  if (!act) {
    bodyHTML = '<p class="cal-m-empty">No workout logged.</p>';
  } else {
    if (act.run && act.runDetail) {
      const r    = act.runDetail;
      const dist = parseFloat(r.dist) || 0;
      bodyHTML += `<div class="cal-m-section">
        <h4 class="cal-m-type">🏃 Run</h4>
        <div class="cal-m-stats">
          ${_stat('Distance',     dist > 0 ? `${dist.toFixed(2)} km` : null)}
          ${_stat('Time',         _fmtTime(r.time))}
          ${_stat('Pace',         _runPace(dist, r.time))}
          ${_stat('Elevation',    parseFloat(r.elev)     > 0 ? `${Math.round(r.elev)} m`          : null)}
          ${_stat('Calories',     parseFloat(r.cals)     > 0 ? `${Math.round(r.cals)} kcal`       : null)}
          ${_stat('Avg HR',       parseFloat(r.avgHR)    > 0 ? `${Math.round(r.avgHR)} bpm`       : null)}
          ${_stat('Max HR',       parseFloat(r.maxHR)    > 0 ? `${Math.round(r.maxHR)} bpm`       : null)}
          ${_stat('Avg Cadence',  parseFloat(r.avgCadence) > 0 ? `${Math.round(r.avgCadence)} spm` : null)}
          ${_stat('RPE',          r.rpe ? `${r.rpe} / 10` : null)}
          ${_stat('Notes',        r.notes || null)}
        </div>
      </div>`;
    }

    if (act.gym && act.gymDetail) {
      const g = act.gymDetail;
      const exList = g.exercises.length > 0
        ? g.exercises.slice(0, 6).join(', ') + (g.exercises.length > 6 ? ` +${g.exercises.length - 6} more` : '')
        : null;
      bodyHTML += `<div class="cal-m-section">
        <h4 class="cal-m-type">🏋️ Weights</h4>
        <div class="cal-m-stats">
          ${_stat('Sets completed', g.completedSets > 0 ? String(g.completedSets) : null)}
          ${_stat('Duration',       _fmtTime(g.time))}
          ${_stat('Calories',       parseFloat(g.cals)   > 0 ? `${Math.round(g.cals)} kcal`  : null)}
          ${_stat('Avg HR',         parseFloat(g.avgHR)  > 0 ? `${Math.round(g.avgHR)} bpm`  : null)}
          ${_stat('Max HR',         parseFloat(g.maxHR)  > 0 ? `${Math.round(g.maxHR)} bpm`  : null)}
          ${_stat('Exercises',      exList)}
        </div>
      </div>`;
    }
  }

  content.innerHTML = `
    <div class="cal-mhandle"></div>
    <p class="cal-mdate">${dateLabel}</p>
    ${bodyHTML}
    <button type="button" class="cal-mclose" data-cal-action="close">Done</button>
  `;

  modal.classList.add('cal-modal--open');
}

// ── Public API ────────────────────────────────────────────────────────────────

export function renderActivityCalendar(appState, containerId = 'homeCalendarContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const map = _buildActivityMap(appState);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const y = now.getFullYear(), m = now.getMonth();
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  container.innerHTML = _renderCalendarMonth(prevY, prevM, map, today) + _renderCalendarMonth(y, m, map, today);

  container.onclick = e => {
    const cell = e.target.closest('[data-cal-date]');
    if (!cell) return;
    _openCalModal(cell.getAttribute('data-cal-date'), map);
  };
}
