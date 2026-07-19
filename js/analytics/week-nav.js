// =============================================================================
// WEEK NAVIGATOR (analytics/week-nav.js)
//
// Selects the CALENDAR week the strength / running detail views display. This is
// deliberately independent of the program-week counter (`state.currentWeek`):
//   • offset 0  = the current calendar week (resolved from today's real date),
//   • offset -1 = the previous calendar week, and so on.
// The offset is EPHEMERAL (reset on view entry via resetWeekNav) so "This week"
// always resolves from the live date on resume — a stale/future selection can
// never persist, and stepping the analytics week never touches the program week.
//
// All calendar maths goes through the canonical helpers in weekly-aggregate.js;
// this module never invents a second date system and never reads program weeks.
// =============================================================================
import { weekStartOf, addDaysISO, localDayKey, indexSlotsByDate } from './weekly-aggregate.js';

let _calOffset = 0; // 0 = current calendar week, negative = older weeks

/** The selected calendar-week offset (0 = this week). Consumed by buildWeekChart. */
export function getCalendarWeekOffset() { return _calOffset; }

/** Reset to the current calendar week (called whenever the analytics view opens). */
export function resetWeekNav() { _calOffset = 0; }

/** Return from any historical selection to the live calendar week. */
export function returnToCurrentWeek() { _calOffset = 0; }

/** Monday (YYYY-MM-DD) of the currently selected calendar week. */
export function getSelectedWeekStart(today) {
  const base = weekStartOf(today || localDayKey(new Date()));
  return addDaysISO(base, _calOffset * 7);
}

// Earliest calendar date on which anything was logged (null when nothing is).
function _earliestLoggedDate(state) {
  let earliest = null;
  for (const d of indexSlotsByDate(state).byDate.keys()) {
    if (earliest === null || d < earliest) earliest = d;
  }
  return earliest;
}

// Back-navigation is offered only while real logged activity exists in an older
// calendar week — never a jump straight to the last populated program week.
function _canGoBack(state, today) {
  const start = getSelectedWeekStart(today);
  const earliest = _earliestLoggedDate(state);
  return !!earliest && earliest < start;
}

export function initWeekNav(getState, onNavigate) {
  const analyticsView = document.getElementById('view-analytics');
  if (!analyticsView) return;

  analyticsView.addEventListener('click', e => {
    if (e.target.closest('#weekNavPrev')) {
      if (_canGoBack(getState())) { _calOffset--; updateWeekNavDisplay(getState); onNavigate(); }
    } else if (e.target.closest('#weekNavNext')) {
      if (_calOffset < 0) { _calOffset++; updateWeekNavDisplay(getState); onNavigate(); } // never past the current week
    } else if (e.target.closest('#weekNavToday')) {
      if (_calOffset !== 0) { returnToCurrentWeek(); updateWeekNavDisplay(getState); onNavigate(); }
    }
  });
}

const _MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function _fmt(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${_MONTH[m - 1]} ${d}`;
}

export function updateWeekNavDisplay(getState) {
  const state = getState();
  const today = localDayKey(new Date());
  const start = getSelectedWeekStart(today);
  const end   = addDaysISO(start, 6);
  const isCurrent = _calOffset === 0;

  const labelEl = document.getElementById('weekNavLabel');
  const datesEl = document.getElementById('weekNavDates');
  const prevBtn = document.getElementById('weekNavPrev');
  const nextBtn = document.getElementById('weekNavNext');
  const todayBtn = document.getElementById('weekNavToday');

  if (labelEl) {
    labelEl.textContent = isCurrent
      ? 'This week'
      : _calOffset === -1
        ? 'Previous week'
        : `${Math.abs(_calOffset)} weeks ago`;
  }
  // The label's date range is the REAL Monday–Sunday span, never derived from the
  // min/max of whatever activity happens to be present.
  if (datesEl) datesEl.textContent = `${_fmt(start)} – ${_fmt(end)}`;

  if (prevBtn) prevBtn.disabled = !_canGoBack(state, today);
  if (nextBtn) nextBtn.disabled = isCurrent;
  if (todayBtn) todayBtn.hidden = isCurrent;
}
