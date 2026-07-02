// =============================================================================
// ACTIVITY CALENDAR — self-contained, no state closure dependency
// =============================================================================

const FULL_MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
      if (!map[ds]) map[ds] = { gym: false, run: false, gymDetail: null, runDetail: null, week: wk, day };

      // Gym — count completed sets and collect exercise names
      const dayLifts = lifts[day] || {};
      let completedSets = 0;
      const exercises = [];
      for (const ln in dayLifts) {
        if (Array.isArray(dayLifts[ln])) {
          const done = dayLifts[ln].filter(s => s?.c);
          if (done.length > 0) {
            completedSets += done.length;
            exercises.push(ln);
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

function _renderCalendarMonth(year, month, activityMap, today, weekStartDay = 'mon') {
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const sunStart     = weekStartDay === 'sun';
  // JS getDay(): 0=Sun … 6=Sat. For Mon-start offset by 1 so Mon=0; for Sun-start Sun=0.
  const firstDow     = sunStart
    ? new Date(year, month, 1).getDay()
    : (new Date(year, month, 1).getDay() + 6) % 7;
  const headers      = sunStart ? ['S','M','T','W','T','F','S'] : ['M','T','W','T','F','S','S'];

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
      ${headers.map(h => `<div class="cal-hdr">${h}</div>`).join('')}
      ${cells}
    </div>
  </div>`;
}


// ── Public API ────────────────────────────────────────────────────────────────

export function renderActivityCalendar(appState, containerId = 'homeCalendarContainer') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const map          = _buildActivityMap(appState);
  const weekStartDay = appState.settings?.weekStartDay || 'mon';
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const y = now.getFullYear(), m = now.getMonth();
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  container.innerHTML = _renderCalendarMonth(prevY, prevM, map, today, weekStartDay) + _renderCalendarMonth(y, m, map, today, weekStartDay);

  container.onclick = e => {
    const cell = e.target.closest('[data-cal-date]');
    if (!cell) return;
    const ds    = cell.getAttribute('data-cal-date');
    const entry = map[ds];
    // Logged day → open the full session recap; empty day → nothing.
    if (entry && entry.day) {
      document.dispatchEvent(new CustomEvent('app:open-recap', { detail: { week: entry.week, day: entry.day } }));
    }
  };
}
