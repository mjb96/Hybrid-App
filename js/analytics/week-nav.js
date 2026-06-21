// ==========================================
// WEEK NAVIGATOR (analytics/week-nav.js)
// ==========================================

let _offset = 0;

export function getWeekOffset() { return _offset; }

export function getSelectedWeek(currentWeekStr) {
  const current = parseInt(currentWeekStr, 10) || 1;
  return Math.max(1, current + _offset);
}

export function resetWeekNav() { _offset = 0; }

export function initWeekNav(getState, onNavigate) {
  const analyticsView = document.getElementById('view-analytics');
  if (!analyticsView) return;

  analyticsView.addEventListener('click', e => {
    const prevBtn = e.target.closest('#weekNavPrev');
    const nextBtn = e.target.closest('#weekNavNext');

    if (prevBtn) {
      const appState = getState();
      if (getSelectedWeek(appState.currentWeek) > 1) {
        _offset--;
        updateWeekNavDisplay(getState);
        onNavigate();
      }
    } else if (nextBtn) {
      const appState = getState();
      const currentWeek = parseInt(appState.currentWeek, 10) || 1;
      if (getSelectedWeek(appState.currentWeek) < currentWeek) {
        _offset++;
        updateWeekNavDisplay(getState);
        onNavigate();
      }
    }
  });
}

export function updateWeekNavDisplay(getState) {
  const appState      = getState();
  const currentWeekNum = parseInt(appState.currentWeek, 10) || 1;
  const selectedWeek  = getSelectedWeek(appState.currentWeek);
  const isCurrent     = selectedWeek === currentWeekNum;

  const labelEl = document.getElementById('weekNavLabel');
  const datesEl = document.getElementById('weekNavDates');
  const prevBtn = document.getElementById('weekNavPrev');
  const nextBtn = document.getElementById('weekNavNext');

  if (labelEl) {
    labelEl.textContent = isCurrent
      ? `Week ${selectedWeek} · Current`
      : `Week ${selectedWeek}`;
  }

  if (datesEl) {
    if (appState.weekStartedAt) {
      const { start, end } = _weekDateRange(selectedWeek, appState);
      const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      datesEl.textContent = `${fmt(start)} – ${fmt(end)}`;
    } else {
      datesEl.textContent = isCurrent
        ? 'This week'
        : `${Math.abs(_offset)} week${Math.abs(_offset) !== 1 ? 's' : ''} ago`;
    }
  }

  if (prevBtn) prevBtn.disabled = selectedWeek <= 1;
  if (nextBtn) nextBtn.disabled = isCurrent;
}

export function getWeekDateRange(weekNum, appState) {
  return _weekDateRange(weekNum, appState);
}

function _weekDateRange(weekNum, appState) {
  const currentWeek = parseInt(appState?.currentWeek ?? '1', 10);
  const startDate = new Date(appState.weekStartedAt || Date.now());
  const weekStart = new Date(startDate);
  weekStart.setDate(startDate.getDate() + (weekNum - currentWeek) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { start: weekStart, end: weekEnd };
}
