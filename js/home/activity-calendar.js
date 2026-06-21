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
    const dates = wd.dates || {};
    const lifts = wd.lifts || {};
    const runs  = wd.runs  || {};

    const allDays = new Set([...Object.keys(lifts), ...Object.keys(runs)]);

    for (const day of allDays) {
      const ds = dates[day];
      if (!ds) continue;
      if (!map[ds]) map[ds] = { gym: false, run: false };

      const dayLifts = lifts[day] || {};
      for (const ln in dayLifts) {
        if (Array.isArray(dayLifts[ln]) && dayLifts[ln].some(s => s?.c)) {
          map[ds].gym = true; break;
        }
      }
      const run = runs[day];
      if (run && parseFloat(run.dist) > 0) map[ds].run = true;
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
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const act = activityMap[ds] || {};
    const isToday = ds === today;
    const dots = [
      act.gym ? '<span class="cal-dot cal-dot-gym"></span>' : '',
      act.run ? '<span class="cal-dot cal-dot-run"></span>' : '',
    ].join('');
    cells += `<div class="cal-cell${isToday ? ' cal-today' : ''}${(act.gym||act.run) ? ' cal-has-activity' : ''}">
      <span class="cal-num">${d}</span>${dots ? `<div class="cal-dots">${dots}</div>` : ''}
    </div>`;
  }

  return `<div class="cal-month">
    <div class="cal-month-name">${FULL_MONTH[month]} ${year}</div>
    <div class="cal-grid">
      ${['M','T','W','T','F','S','S'].map(h => `<div class="cal-hdr">${h}</div>`).join('')}
      ${cells}
    </div>
  </div>`;
}

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
}
