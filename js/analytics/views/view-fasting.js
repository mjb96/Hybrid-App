// @ts-check
// ==========================================
// FASTING ANALYTICS VIEW — analytics/views/view-fasting.js
// Renders into #analytics-fasting (.analytics-section)
// ==========================================
import { computeFastingAnalytics, buildCalendarData } from '../../fasting/fasting-calcs.js';
import { generateFastingInsights, renderFastingInsightsHTML } from '../../fasting/fasting-insights.js';
import { getUnlockedAchievements } from '../../fasting/fasting-achievements.js';
import { statCard, deltaBadge } from '../charts/chart-primitives.js';
import {
  renderFastingHoursBarChart,
  renderFastingDurationTrend,
  renderGoalCompletionTrend,
  renderZoneDistributionChart,
  renderMonthlyAdherenceChart,
  renderFastingFrequencyChart,
  renderFastingScoreRing,
} from '../charts/fasting-charts.js';
import { FASTING_ZONES, fmtHoursLabel } from '../../fasting.js';

const AMBER  = '#f59e0b';
const ORANGE = '#f97316';
const GREEN  = '#10b981';
const BLUE   = '#3b82f6';
const PURPLE = '#8b5cf6';
const RED    = '#ef4444';

let _calendarMonth = null;
let _fastingTab = 'overview'; // 'overview' (lean, ring-led) | 'stats' (the deep analytics)

// Allow the education deep-link to jump straight into the Stats tab.
export function setFastingTab(tab) { _fastingTab = tab === 'stats' ? 'stats' : 'overview'; }

function qs(id) { return document.getElementById(id); }

function _fmt(n, decimals = 1) {
  if (!n && n !== 0) return '—';
  return n % 1 === 0 ? n.toString() : n.toFixed(decimals);
}

function _fmtHHMMSS(hours) {
  const totalSec = Math.floor(hours * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const p = n => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(s)}`;
}

// ── Fasting Score hero ─────────────────────────────────────────────────────────

function _renderFastingScore(el, calcs) {
  const { fastingScore, fastingScoreLabel, fastingScoreColor,
          consistencyScore, adherenceScore, goalCompletionPct,
          weeklyTrend, weeklyHours, monthlyHours, currentStreak, longestStreak } = calcs;

  // Weekly frequency component (same logic as in calcs)
  const recentWeeks   = weeklyTrend.slice(-4).filter(w => w.count > 0);
  const avgCount      = recentWeeks.length > 0
    ? recentWeeks.reduce((s, w) => s + w.count, 0) / recentWeeks.length : 0;
  const frequencyPct  = Math.min(100, (avgCount / 5) * 100);

  const scoreColor = fastingScoreColor;

  const componentBar = (value) => {
    const bColor = value >= 70 ? GREEN : value >= 40 ? AMBER : RED;
    return `<div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;margin-top:3px;">
      <div style="height:100%;width:${value.toFixed(1)}%;background:${bColor};border-radius:2px;"></div>
    </div>`;
  };

  const components = [
    { label: 'Consistency',       value: consistencyScore,   weight: 30 },
    { label: 'Adherence',         value: adherenceScore,     weight: 25 },
    { label: 'Completion Rate',   value: goalCompletionPct,  weight: 25 },
    { label: 'Weekly Frequency',  value: frequencyPct,       weight: 20 },
  ];

  const compRows = components.map(c => `
    <div style="margin-bottom:9px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="fa-comp-label">${c.label}</span>
        <span class="fa-comp-value">${c.value.toFixed(0)}%</span>
      </div>
      ${componentBar(c.value)}
    </div>`).join('');

  const ringContainer = `<div id="fa-score-ring"></div>`;

  el.innerHTML = `
    <article class="card-dark p-4 mb-3 fa-score-card" style="border-top:2px solid ${scoreColor};">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex-shrink:0;">${ringContainer}</div>
        <div style="flex:1;min-width:160px;">
          <div class="fa-comp-section-label">Score Components</div>
          ${compRows}
        </div>
      </div>
    </article>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Weekly Hours',   value: _fmt(weeklyHours),  unit: 'h', color: AMBER,  sub: 'last 7 days' })}
      ${statCard({ label: 'Monthly Hours',  value: _fmt(monthlyHours), unit: 'h', color: ORANGE, sub: 'this month' })}
      ${statCard({ label: 'Current Streak', value: currentStreak,      unit: ' d', color: GREEN, sub: 'consecutive days' })}
      ${statCard({ label: 'Longest Streak', value: longestStreak,      unit: ' d', color: BLUE,  sub: 'all time' })}
    </div>
  `;

  renderFastingScoreRing(qs('fa-score-ring'), fastingScore, fastingScoreLabel ?? 'Score', scoreColor);
}

// ── Active fast hero (SVG ring) ────────────────────────────────────────────────

function _renderActiveFast(el, calcs) {
  const { active, currentHours, currentZone, goal } = calcs;
  if (!active) { el.innerHTML = ''; return; }

  const progressPct = Math.min(100, (currentHours / goal) * 100);
  const remaining   = Math.max(0, goal - currentHours);

  const r = 54, cx = 70, cy = 70;
  const circ = 2 * Math.PI * r;
  const dash = (progressPct / 100) * circ;
  const gap  = circ - dash;

  const nextZone = FASTING_ZONES.find(z => z.hoursStart > currentHours);
  const phaseProgress = currentZone && currentZone.hoursEnd !== Infinity
    ? Math.min(100, ((currentHours - currentZone.hoursStart) / (currentZone.hoursEnd - currentZone.hoursStart)) * 100)
    : 100;

  const nextPhaseHtml = nextZone
    ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:0.70rem;color:rgba(255,255,255,0.35);">Next: <span style="color:${nextZone.color};font-weight:700;">${nextZone.icon} ${nextZone.name}</span></div>
          <div style="font-size:0.68rem;font-weight:700;color:rgba(255,255,255,0.35);">in ${fmtHoursLabel(Math.max(0, nextZone.hoursStart - currentHours))}</div>
        </div>
        <div style="height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;">
          <div id="fa-phase-bar" style="height:100%;width:${phaseProgress.toFixed(1)}%;background:${currentZone.color};border-radius:2px;transition:width 1s linear;"></div>
        </div>
        <div style="font-size:0.67rem;color:rgba(255,255,255,0.28);margin-top:6px;">${currentZone.description}</div>
      </div>`
    : `<div style="margin-top:12px;font-size:0.67rem;color:rgba(255,255,255,0.28);">${currentZone.description}</div>`;

  el.innerHTML = `
    <article class="card-dark p-4 mb-3 fa-active-card" style="border:1px solid ${currentZone.color}28;border-left:3px solid ${currentZone.color};">
      <div style="font-size:0.62rem;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.30);margin-bottom:12px;">Current Fast</div>
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="flex-shrink:0;">
          <svg viewBox="0 0 140 140" style="width:120px;height:120px;">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="10"/>
            <circle id="fa-live-ring" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${currentZone.color}" stroke-width="10"
              stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
              stroke-linecap="round"
              transform="rotate(-90 ${cx} ${cy})"/>
            <text id="fa-live-timer" x="${cx}" y="${cy + 8}" text-anchor="middle" font-size="20" font-weight="900" fill="rgba(255,255,255,0.95)" font-variant-numeric="tabular-nums">${_fmtHHMMSS(currentHours)}</text>
          </svg>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:1rem;font-weight:800;color:${currentZone.color};margin-bottom:4px;">${currentZone.icon} ${currentZone.name}</div>
          <div style="font-size:0.72rem;color:rgba(255,255,255,0.40);margin-bottom:10px;">${progressPct.toFixed(0)}% of ${goal}h goal</div>
          ${remaining > 0.05
            ? `<div style="font-size:0.70rem;color:rgba(255,255,255,0.35);">
                <span style="font-weight:700;color:rgba(255,255,255,0.60);">${fmtHoursLabel(remaining)}</span> to goal
               </div>`
            : `<div style="font-size:0.72rem;color:${GREEN};font-weight:700;">Goal reached!</div>`
          }
        </div>
      </div>
      ${nextPhaseHtml}
    </article>
  `;
}

// ── Key Metrics ────────────────────────────────────────────────────────────────

function _renderOverview(el, calcs) {
  const { avgDuration, goalCompletionPct, goalsCompleted, totalFasts,
          consistencyScore, adherenceScore, totalHours, avgStartTime, avgEndTime } = calcs;

  el.innerHTML = `
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Avg Duration',     value: _fmt(avgDuration), unit: 'h', color: AMBER,  sub: 'per fast' })}
      ${statCard({ label: 'Goal Completion',  value: _fmt(goalCompletionPct, 0), unit: '%', color: GREEN,
                   sub: `${goalsCompleted} of ${totalFasts} fasts` })}
      ${statCard({ label: 'Consistency',      value: _fmt(consistencyScore, 0),  unit: '%', color: PURPLE,
                   sub: '30-day score',
                   status: consistencyScore >= 70 ? 'Strong' : consistencyScore >= 40 ? 'Building' : 'Low' })}
      ${statCard({ label: 'Adherence',        value: _fmt(adherenceScore, 0), unit: '%', color: BLUE,
                   sub: '30-day goal rate' })}
    </div>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Total Fasts',      value: totalFasts, color: AMBER, sub: 'all time' })}
      ${statCard({ label: 'Lifetime Hours',   value: _fmt(totalHours, 0), unit: 'h', color: ORANGE,
                   sub: 'total fasting time' })}
      ${avgStartTime ? statCard({ label: 'Avg Start Time', value: avgStartTime, color: PURPLE, sub: 'typical fast start' }) : ''}
      ${avgEndTime   ? statCard({ label: 'Avg End Time',   value: avgEndTime,   color: BLUE,   sub: 'typical fast end'   }) : ''}
    </div>
  `;
}

// ── Advanced Analytics ─────────────────────────────────────────────────────────

function _renderAdvancedMetrics(el, calcs) {
  const { weeklyMomentum, monthlyMomentum, routineStabilityScore, habitStrengthScore,
          fastingLoad, longestFast, mostCommonSchedule } = calcs;

  const mColor = (pct) => pct > 5 ? GREEN : pct < -5 ? RED : AMBER;
  const mArrow = (pct) => pct > 0 ? '↑' : pct < 0 ? '↓' : '→';

  const loadColor = fastingLoad.status === 'High' ? RED
    : fastingLoad.status === 'Elevated' ? AMBER
    : fastingLoad.status === 'Low' ? BLUE : GREEN;

  const stabilityStatus = routineStabilityScore >= 70 ? 'Consistent'
    : routineStabilityScore >= 40 ? 'Variable' : 'Irregular';

  el.innerHTML = `
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({
        label: 'Weekly Momentum',
        value: `${weeklyMomentum > 0 ? '+' : ''}${weeklyMomentum.toFixed(0)}`, unit: '%',
        color: mColor(weeklyMomentum),
        sub:   weeklyMomentum > 5 ? 'Trending up' : weeklyMomentum < -5 ? 'Trending down' : 'Stable',
        status: mArrow(weeklyMomentum),
      })}
      ${statCard({
        label: 'Monthly Momentum',
        value: `${monthlyMomentum > 0 ? '+' : ''}${monthlyMomentum.toFixed(0)}`, unit: '%',
        color: mColor(monthlyMomentum),
        sub:   'month-over-month hours',
        status: mArrow(monthlyMomentum),
      })}
      ${statCard({
        label: 'Routine Stability', value: _fmt(routineStabilityScore, 0), unit: '%',
        color: PURPLE, sub: 'start time consistency', status: stabilityStatus,
      })}
      ${statCard({
        label: 'Habit Strength', value: _fmt(habitStrengthScore, 0), unit: '/100',
        color: GREEN, sub: 'streak + consistency index',
      })}
    </div>
    <article class="card-dark p-3 mb-2">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:0.62rem;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.30);margin-bottom:6px;">Fasting Load</div>
          <div style="display:flex;align-items:baseline;gap:8px;">
            <div style="font-size:1.7rem;font-weight:900;letter-spacing:-0.03em;color:${loadColor};">${fastingLoad.currentLoad}h</div>
            <div style="font-size:0.72rem;color:rgba(255,255,255,0.38);">this week</div>
          </div>
          <div style="font-size:0.70rem;color:rgba(255,255,255,0.35);margin-top:3px;">
            4-week avg ${fastingLoad.avgLoad}h &middot;
            <span style="color:${loadColor};font-weight:700;">${fastingLoad.status}</span>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.30);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.07em;">Load Ratio</div>
          <div style="font-size:1.3rem;font-weight:800;color:rgba(255,255,255,0.85);">${fastingLoad.ratio}×</div>
          ${mostCommonSchedule
            ? `<div style="font-size:0.68rem;color:rgba(255,255,255,0.30);margin-top:6px;">Pattern: ${mostCommonSchedule}</div>`
            : ''
          }
        </div>
      </div>
    </article>
    ${longestFast >= 24 ? `
      <div class="fa-edu-tip">
        <span class="fa-edu-tip__icon">⚡</span>
        <span>Your longest fast of ${_fmt(longestFast)}h reached the Ketosis Progression phase. Autophagy — the cellular recycling process — begins around 24 hours.</span>
      </div>` : ''
    }
  `;
}

// ── Trends ────────────────────────────────────────────────────────────────────

function _renderTrends(el, calcs) {
  el.innerHTML = `
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Weekly Fasting Hours</div>
      <div class="an-chart__subtitle">Total hours fasted per week · dashed line = personal average</div>
      <div id="fa-chart-weekly-hours"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Average Fast Duration</div>
      <div class="an-chart__subtitle">Mean fast length per week</div>
      <div id="fa-chart-duration"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Goal Completion Rate</div>
      <div class="an-chart__subtitle">% of fasts that met target per week · shaded region = strong (≥80%)</div>
      <div id="fa-chart-goal"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Fasting Frequency</div>
      <div class="an-chart__subtitle">Fasts per week · dashed line = 5/week target</div>
      <div id="fa-chart-frequency"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Monthly Fasting Volume</div>
      <div class="an-chart__subtitle">Total fasting hours by calendar month</div>
      <div id="fa-chart-monthly"></div>
    </article>
    <div class="fa-edu-tip">
      <span class="fa-edu-tip__icon">💡</span>
      <span>Consistency over intensity. Research shows that regular shorter fasts produce better long-term metabolic outcomes than occasional extended fasts.</span>
    </div>
  `;

  renderFastingHoursBarChart(qs('fa-chart-weekly-hours'),  calcs.weeklyTrend);
  renderFastingDurationTrend(qs('fa-chart-duration'),      calcs.weeklyTrend);
  renderGoalCompletionTrend( qs('fa-chart-goal'),          calcs.weeklyTrend);
  renderFastingFrequencyChart(qs('fa-chart-frequency'),    calcs.weeklyTrend);
  renderMonthlyAdherenceChart(qs('fa-chart-monthly'),      calcs.monthlyTrend);
}

// ── Calendar ──────────────────────────────────────────────────────────────────

function _renderCalendar(el, calcs, appState) {
  const history   = appState.fastingSession?.history ?? [];
  const startTime = appState.fastingSession?.startTime;

  const now = new Date();
  const viewYear  = _calendarMonth?.year  ?? now.getFullYear();
  const viewMonth = _calendarMonth?.month ?? now.getMonth();

  const { days, firstDayOfWeek, year, month } = buildCalendarData(history, calcs.active, startTime, viewYear, viewMonth);

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const monthName = new Date(year, month, 1).toLocaleDateString('en', { month: 'long', year: 'numeric' });
  const dayHeaders = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const statusStyles = {
    completed: { bg: '#f59e0b22', border: '#f59e0b', text: '#f59e0b', dot: '#f59e0b' },
    partial:   { bg: '#3b82f622', border: '#3b82f6', text: '#3b82f6', dot: '#3b82f6' },
    active:    { bg: '#10b98122', border: '#10b981', text: '#10b981', dot: '#10b981' },
    missed:    { bg: 'transparent', border: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.25)', dot: 'transparent' },
    future:    { bg: 'transparent', border: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.12)', dot: 'transparent' },
    none:      { bg: 'transparent', border: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.25)', dot: 'transparent' },
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(`<div></div>`);

  days.forEach(d => {
    const s = statusStyles[d.status] || statusStyles.none;
    const title = d.hours > 0 ? `${fmtHoursLabel(d.hours)} ${d.zoneName ? '· ' + d.zoneName : ''}` : d.status === 'missed' ? 'No fast' : '';
    const pulse = d.status === 'active' ? 'fa-cal-pulse' : '';
    cells.push(`<div class="fa-cal-cell ${pulse}" style="background:${s.bg};border:1px solid ${s.border};" title="${title}" aria-label="${d.date}: ${d.status}">
      <span style="color:${s.text};font-size:0.72rem;font-weight:${d.goalMet ? '800' : '500'};">${d.day}</span>
      ${d.hours > 0 ? `<span class="fa-cal-dot" style="background:${s.dot};"></span>` : ''}
    </div>`);
  });

  const headerCells = dayHeaders.map(h => `<div style="text-align:center;font-size:0.62rem;font-weight:700;letter-spacing:0.07em;color:rgba(255,255,255,0.3);padding-bottom:4px;">${h}</div>`).join('');

  const legend = `<div class="fa-cal-legend">
    <span class="fa-cal-legend-item"><span class="fa-cal-legend-dot" style="background:${AMBER};"></span> Goal met</span>
    <span class="fa-cal-legend-item"><span class="fa-cal-legend-dot" style="background:${BLUE};"></span> Partial</span>
    <span class="fa-cal-legend-item"><span class="fa-cal-legend-dot" style="background:rgba(255,255,255,0.15);"></span> Missed</span>
    ${calcs.active ? `<span class="fa-cal-legend-item"><span class="fa-cal-legend-dot" style="background:${GREEN};"></span> Active</span>` : ''}
  </div>`;

  const completed = days.filter(d => d.status === 'completed').length;
  const partial   = days.filter(d => d.status === 'partial').length;
  const missed    = days.filter(d => d.status === 'missed').length;
  const pastDays  = days.filter(d => d.status !== 'future').length;
  const adherence = pastDays > 0 ? Math.round(((completed + partial) / pastDays) * 100) : 0;

  const navBtnStyle = 'background:none;border:none;color:rgba(255,255,255,0.45);font-size:1.1rem;cursor:pointer;padding:0 6px;line-height:1;';

  el.innerHTML = `
    <article class="card-dark p-3 mb-3">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:4px;">
          <button data-action="fa-cal-prev" style="${navBtnStyle}" aria-label="Previous month">‹</button>
          <div class="an-chart__title" style="margin-bottom:0;">${monthName}</div>
          <button data-action="fa-cal-next" style="${navBtnStyle}${isCurrentMonth ? 'opacity:0.2;cursor:default;pointer-events:none;' : ''}" aria-label="Next month">›</button>
        </div>
        <div style="font-size:0.75rem;font-weight:700;color:${AMBER};">${adherence}% adherence</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">
        ${headerCells}
        ${cells.join('')}
      </div>
      ${legend}
      <div class="an-divider" style="margin:12px 0;"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center;">
        <div><div style="font-size:1.1rem;font-weight:800;color:${AMBER};">${completed}</div><div style="font-size:0.65rem;color:rgba(255,255,255,0.38);margin-top:2px;">COMPLETED</div></div>
        <div><div style="font-size:1.1rem;font-weight:800;color:${BLUE};">${partial}</div><div style="font-size:0.65rem;color:rgba(255,255,255,0.38);margin-top:2px;">PARTIAL</div></div>
        <div><div style="font-size:1.1rem;font-weight:800;color:rgba(255,255,255,0.3);">${missed}</div><div style="font-size:0.65rem;color:rgba(255,255,255,0.38);margin-top:2px;">MISSED</div></div>
      </div>
    </article>
  `;
}

// ── Distribution ──────────────────────────────────────────────────────────────

function _renderDistribution(el, calcs) {
  el.innerHTML = `
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title" style="margin-bottom:12px;">Metabolic Zone Distribution</div>
      <div id="fa-zone-dist"></div>
    </article>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Weekday Rate', value: calcs.weekdayAdherence.weekdayRate > 0 ? `${calcs.weekdayAdherence.weekdayRate.toFixed(0)}` : '0', unit: '%', sub: `${calcs.weekdayAdherence.weekdayCount} fasts Mon–Fri`, color: AMBER })}
      ${statCard({ label: 'Weekend Rate', value: calcs.weekdayAdherence.weekendRate > 0 ? `${calcs.weekdayAdherence.weekendRate.toFixed(0)}` : '0', unit: '%', sub: `${calcs.weekdayAdherence.weekendCount} fasts Sat–Sun`, color: ORANGE })}
    </div>
    <div class="fa-edu-tip">
      <span class="fa-edu-tip__icon">🔥</span>
      <span>The Fat Adaptation phase (16–24h) is reached by most intermittent fasters. Spending more fasting time here may improve insulin sensitivity over time.</span>
    </div>
  `;
  renderZoneDistributionChart(qs('fa-zone-dist'), calcs.zoneDistribution);
}

// ── Correlations ──────────────────────────────────────────────────────────────

function _renderIntegrations(el, calcs) {
  const { bwCorrelation, recoveryCorrelation, sleepCorrelation, hrvCorrelation } = calcs;
  const iconMap = { alert: '!', good: '↑', info: 'i' };
  const rows = [];

  // Body weight
  if (bwCorrelation.hasData) {
    const dir = bwCorrelation.direction;
    rows.push({
      text: dir === 'decreasing'
        ? `Body weight averages ${Math.abs(bwCorrelation.diffKg)} kg lower during high-fasting weeks — a positive metabolic signal.`
        : dir === 'increasing'
          ? `Body weight trends slightly higher on high-fasting weeks. Review nutrient density in your eating window.`
          : `Body weight is consistent across different fasting frequencies.`,
      priority: dir === 'decreasing' ? 'good' : 'info',
    });
  } else {
    rows.push({ text: 'Log body weight to see how fasting adherence correlates with body composition trends.', priority: 'info' });
  }

  // Mood
  if (recoveryCorrelation.hasData) {
    const effect = recoveryCorrelation.moodEffect;
    if (effect > 5) {
      rows.push({ text: `Mood scores average ${effect.toFixed(0)}% higher on fasting days (${recoveryCorrelation.avgFastMood}/5 vs ${recoveryCorrelation.avgNonFastMood}/5 non-fasting).`, priority: 'good' });
    } else if (effect < -10) {
      rows.push({ text: `Mood averages lower on fasting days. Prioritise nutrient density in your eating window and consider electrolyte intake.`, priority: 'alert' });
    } else {
      rows.push({ text: `Mood and wellbeing scores are consistent across fasting and non-fasting days.`, priority: 'info' });
    }
  }

  // Sleep
  if (sleepCorrelation.hasData) {
    const { fastSleep, nonFastSleep, diff, direction } = sleepCorrelation;
    if (direction === 'better') {
      rows.push({
        text: `Sleep duration averages ${fastSleep}h on fasting days vs ${nonFastSleep}h on non-fasting days (+${diff.toFixed(2)}h). Closing your eating window earlier may support sleep quality.`,
        priority: 'good',
      });
    } else if (direction === 'worse') {
      rows.push({
        text: `Sleep duration averages ${fastSleep}h on fasting days vs ${nonFastSleep}h non-fasting. Consider whether extended fasting affects your sleep onset or quality.`,
        priority: 'info',
      });
    } else {
      rows.push({ text: `Sleep duration is consistent between fasting and non-fasting days (${fastSleep}h vs ${nonFastSleep}h).`, priority: 'info' });
    }
  } else if (!recoveryCorrelation.hasData) {
    rows.push({ text: 'Log daily wellness check-ins to see fasting\'s impact on sleep and recovery.', priority: 'info' });
  }

  // HRV
  if (hrvCorrelation.hasData) {
    const { fastHrv, nonFastHrv, diffPct, direction } = hrvCorrelation;
    if (direction === 'better') {
      rows.push({
        text: `HRV averages ${diffPct.toFixed(0)}% higher on fasting days (${fastHrv} ms vs ${nonFastHrv} ms). Fasting may be supporting autonomic recovery.`,
        priority: 'good',
      });
    } else if (direction === 'worse') {
      rows.push({
        text: `HRV is ${Math.abs(diffPct).toFixed(0)}% lower on fasting days (${fastHrv} ms vs ${nonFastHrv} ms). Monitor whether extended fasts are creating physiological stress.`,
        priority: 'alert',
      });
    } else {
      rows.push({ text: `HRV is stable across fasting and non-fasting days — fasting appears well-tolerated by your autonomic nervous system.`, priority: 'info' });
    }
  }

  // Sleep on fasting days (from recoveryCorrelation legacy path)
  if (recoveryCorrelation.hasData && !sleepCorrelation.hasData &&
      recoveryCorrelation.avgFastSleep > 0 && recoveryCorrelation.avgNonFastSleep > 0) {
    const diff = recoveryCorrelation.avgFastSleep - recoveryCorrelation.avgNonFastSleep;
    if (Math.abs(diff) > 0.3) {
      rows.push({
        text: `Sleep averages ${recoveryCorrelation.avgFastSleep}h on fasting days vs ${recoveryCorrelation.avgNonFastSleep}h on non-fasting days.`,
        priority: diff > 0 ? 'good' : 'info',
      });
    }
  }

  const items = rows.map(r => `<div class="an-insight an-insight--${r.priority}">
    <div class="an-insight__icon">${iconMap[r.priority] || '·'}</div>
    <span>${r.text}</span>
  </div>`).join('');

  el.innerHTML = `
    <div class="an-insights" style="margin-bottom:12px;">
      <div class="an-insights__title">Cross-System Correlations</div>
      ${items}
    </div>
    <div class="fa-edu-tip">
      <span class="fa-edu-tip__icon">📊</span>
      <span>Correlations improve with more data. Log wellness, sleep, and body weight consistently for the most accurate personal insights.</span>
    </div>
  `;
}

// ── Achievements ──────────────────────────────────────────────────────────────

function _renderAchievements(el, achievements) {
  const tierColors = { gold: '#f59e0b', silver: '#94a3b8', bronze: '#b45309' };
  const tierBg     = { gold: 'rgba(245,158,11,0.08)', silver: 'rgba(148,163,184,0.08)', bronze: 'rgba(180,83,9,0.08)' };

  const items = achievements.map(a => {
    const c  = tierColors[a.tier] || AMBER;
    const bg = a.unlocked ? (tierBg[a.tier] || '') : 'transparent';
    return `<div class="fa-achievement" style="opacity:${a.unlocked ? 1 : 0.3};background:${bg};border:1px solid ${a.unlocked ? c + '30' : 'rgba(255,255,255,0.06)'};">
      <div class="fa-achievement__icon">${a.icon}</div>
      <div class="fa-achievement__label">${a.label}</div>
      <div class="fa-achievement__desc">${a.description}</div>
      ${a.unlocked
        ? `<div class="fa-achievement__tier" style="color:${c};">${a.tier}</div>`
        : '<div class="fa-achievement__tier" style="color:rgba(255,255,255,0.2);">locked</div>'}
    </div>`;
  }).join('');

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <span style="font-size:0.72rem;color:rgba(255,255,255,0.4);">${unlockedCount} of ${achievements.length} unlocked</span>
    </div>
    <div class="fa-achievements-grid">${items}</div>
  `;
}

// ── Performance table ─────────────────────────────────────────────────────────

function _renderPerformance(el, calcs) {
  const { totalFasts, totalHours, avgDuration, longestFast, shortestFast,
          weekdayAdherence, mostCommonSchedule, avgStartTime, avgEndTime } = calcs;

  const rows = [
    { label: 'Total Fasts',           value: totalFasts.toString() },
    { label: 'Total Hours Fasted',    value: `${_fmt(totalHours, 0)}h` },
    { label: 'Average Fast',          value: `${_fmt(avgDuration)}h` },
    { label: 'Longest Fast',          value: `${_fmt(longestFast)}h` },
    { label: 'Shortest Fast',         value: `${_fmt(shortestFast)}h` },
    { label: 'Most Common Schedule',  value: mostCommonSchedule ? `${mostCommonSchedule}` : '—' },
    { label: 'Average Start Time',    value: avgStartTime ?? '—' },
    { label: 'Average End Time',      value: avgEndTime   ?? '—' },
    { label: 'Weekday Adherence',     value: weekdayAdherence.weekdayRate > 0 ? `${weekdayAdherence.weekdayRate.toFixed(0)}%` : '—' },
    { label: 'Weekend Adherence',     value: weekdayAdherence.weekendRate  > 0 ? `${weekdayAdherence.weekendRate.toFixed(0)}%`  : '—' },
  ].map(r => `<div class="an-metric-row">
    <span class="an-metric-label">${r.label}</span>
    <span class="an-metric-value">${r.value}</span>
  </div>`).join('');

  el.innerHTML = `<article class="card-dark p-4 mb-3">${rows}</article>`;
}

// ── Live ticker ───────────────────────────────────────────────────────────────

let _analyticsLiveTicker = null;

function _startAnalyticsTicker(getState) {
  if (_analyticsLiveTicker) return;
  _analyticsLiveTicker = setInterval(() => {
    const section = qs('analytics-fasting');
    if (!section?.classList.contains('active')) { _stopAnalyticsTicker(); return; }
    const state = getState();
    if (!state?.fastingSession?.active) { _stopAnalyticsTicker(); return; }
    const hours = (Date.now() - new Date(state.fastingSession.startTime).getTime()) / 3_600_000;

    const timerEl = qs('fa-live-timer');
    if (timerEl) timerEl.textContent = _fmtHHMMSS(hours);

    // Update SVG ring dasharray
    const ringEl = document.getElementById('fa-live-ring');
    if (ringEl) {
      const goal  = state.fastingSession.goal ?? 16;
      const pct   = Math.min(100, (hours / goal) * 100);
      const r     = 54;
      const circ  = 2 * Math.PI * r;
      const dash  = (pct / 100) * circ;
      const gap   = circ - dash;
      ringEl.setAttribute('stroke-dasharray', `${dash.toFixed(2)} ${gap.toFixed(2)}`);
    }

    // Update phase progress bar
    const phaseBar = document.getElementById('fa-phase-bar');
    if (phaseBar) {
      const zone = FASTING_ZONES.find(z => hours >= z.hoursStart && hours < z.hoursEnd)
        ?? FASTING_ZONES[FASTING_ZONES.length - 1];
      if (zone.hoursEnd !== Infinity) {
        const phasePct = ((hours - zone.hoursStart) / (zone.hoursEnd - zone.hoursStart)) * 100;
        phaseBar.style.width = `${Math.min(100, phasePct).toFixed(1)}%`;
      }
    }
  }, 1000);
}

function _stopAnalyticsTicker() {
  clearInterval(_analyticsLiveTicker);
  _analyticsLiveTicker = null;
}

// ── Calendar navigation (called from app.js) ──────────────────────────────────

export function handleFastingCalAction(action, getState) {
  const calEl = qs('fa-calendar');
  if (!calEl) return;
  const now = new Date();
  const cur = _calendarMonth ?? { year: now.getFullYear(), month: now.getMonth() };

  if (action === 'fa-cal-prev') {
    const d = new Date(cur.year, cur.month - 1, 1);
    _calendarMonth = { year: d.getFullYear(), month: d.getMonth() };
  } else if (action === 'fa-cal-next') {
    const next = new Date(cur.year, cur.month + 1, 1);
    if (next <= new Date(now.getFullYear(), now.getMonth(), 1)) {
      _calendarMonth = { year: next.getFullYear(), month: next.getMonth() };
    } else {
      return;
    }
  }

  const appState = getState();
  const calcs    = computeFastingAnalytics(appState);
  _renderCalendar(calEl, calcs, appState);
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderFastingAnalytics(getState) {
  _stopAnalyticsTicker();

  const appState = getState();
  const section  = qs('analytics-fasting');
  if (!section) return;

  const fs      = appState.fastingSession;
  const history = fs?.history ?? [];

  if (!history.length && !fs?.active) {
    section.innerHTML = `
      <h2 class="section-header">Fasting</h2>
      <article class="card-dark p-4 mb-3" style="text-align:center;padding:36px 20px;">
        <div style="font-size:2rem;margin-bottom:12px;">⏱️</div>
        <div style="font-size:0.95rem;font-weight:700;color:rgba(255,255,255,0.7);margin-bottom:8px;">No fasting data yet</div>
        <div style="font-size:0.8rem;color:rgba(255,255,255,0.38);line-height:1.6;">Start your first fast from the home screen.<br>Analytics will appear here once you have data.</div>
      </article>
    `;
    return;
  }

  const calcs        = computeFastingAnalytics(appState);
  const insights     = generateFastingInsights(calcs);
  const achievements = getUnlockedAchievements(calcs);

  section.innerHTML = _tabBar(_fastingTab) + `<div id="fa-tab-body"></div>`;
  const body = qs('fa-tab-body');

  if (_fastingTab === 'stats') {
    _renderStatsTab(body, calcs, achievements, appState);
  } else {
    _renderOverviewTab(body, calcs, insights);
    if (calcs.active) _startAnalyticsTicker(getState);
  }
}

// ── Tab bar + bodies (S1c: lean Overview, deep Stats) ───────────────────────────

function _tabBar(active) {
  const tab = (id, label) =>
    `<button class="fa-tab ${active === id ? 'fa-tab--active' : ''}" data-action="fa-tab-${id}">${label}</button>`;
  return `<div class="fa-tab-bar">${tab('overview', 'Overview')}${tab('stats', 'Stats')}</div>`;
}

// Overview: the ring-led hero, current fast, the daily insights, and the ONE
// fasting×recovery line — the hybrid-athlete angle a pure fasting app can't give.
function _renderOverviewTab(body, calcs, insights) {
  body.innerHTML = `
    <h2 class="section-header">Fasting Score</h2>
    <div id="fa-score"></div>
    ${calcs.active ? '<h2 class="section-header">Current Fast</h2><div id="fa-active-fast"></div>' : ''}
    <div id="fa-insights"></div>
    ${_fastingRecoveryLine(calcs)}
  `;
  _renderFastingScore(qs('fa-score'), calcs);
  if (calcs.active) _renderActiveFast(qs('fa-active-fast'), calcs);
  qs('fa-insights').innerHTML = renderFastingInsightsHTML(insights);
}

// Stats: everything deeper, one tap away — the power the owner chose to keep.
function _renderStatsTab(body, calcs, achievements, appState) {
  body.innerHTML = `
    <h2 class="section-header">Key Metrics</h2><div id="fa-overview"></div>
    <h2 class="section-header">Advanced Analytics</h2><div id="fa-advanced"></div>
    <h2 class="section-header">Trends</h2><div id="fa-trends"></div>
    <h2 class="section-header">Correlations</h2><div id="fa-integrations"></div>
    <h2 class="section-header">Calendar</h2><div id="fa-calendar"></div>
    <h2 class="section-header">Distribution</h2><div id="fa-distribution"></div>
    <h2 class="section-header">All-Time Stats</h2><div id="fa-performance"></div>
    <h2 class="section-header">Achievements</h2><div id="fa-achievements"></div>
  `;
  _renderOverview(qs('fa-overview'), calcs);
  _renderAdvancedMetrics(qs('fa-advanced'), calcs);
  _renderTrends(qs('fa-trends'), calcs);
  _renderIntegrations(qs('fa-integrations'), calcs);
  _renderCalendar(qs('fa-calendar'), calcs, appState);
  _renderDistribution(qs('fa-distribution'), calcs);
  _renderPerformance(qs('fa-performance'), calcs);
  _renderAchievements(qs('fa-achievements'), achievements);
}

// One sentence from the strongest available fasting↔recovery signal (HRV → sleep →
// mood), or a prompt to log the data. Pure string builder.
function _fastingRecoveryLine(calcs) {
  const hrv = calcs.hrvCorrelation, sleep = calcs.sleepCorrelation, rec = calcs.recoveryCorrelation;
  let text = null, tone = 'info';
  if (hrv?.hasData && hrv.direction !== 'neutral') {
    tone = hrv.direction === 'better' ? 'good' : 'alert';
    text = hrv.direction === 'better'
      ? `Your HRV runs ${Math.abs(hrv.diffPct).toFixed(0)}% higher on fasting days — fasting is supporting your recovery.`
      : `Your HRV runs ${Math.abs(hrv.diffPct).toFixed(0)}% lower on fasting days — watch that extended fasts aren't adding stress.`;
  } else if (sleep?.hasData && sleep.direction !== 'neutral') {
    tone = sleep.direction === 'better' ? 'good' : 'info';
    text = sleep.direction === 'better'
      ? `You sleep ${Math.abs(sleep.diff).toFixed(1)}h more on fasting days — an earlier eating window is paying off.`
      : `You sleep ${Math.abs(sleep.diff).toFixed(1)}h less on fasting days — consider closing your fast earlier.`;
  } else if (rec?.hasData && Math.abs(rec.moodEffect) > 5) {
    tone = rec.moodEffect > 0 ? 'good' : 'alert';
    text = rec.moodEffect > 0
      ? `Your mood scores average ${rec.moodEffect.toFixed(0)}% higher on fasting days.`
      : `Your mood dips on fasting days — prioritise nutrient density in your eating window.`;
  }
  if (!text) {
    text = 'Log wellness, sleep, or HRV to see how fasting affects your recovery — the insight a workout app can give that a fasting app can\'t.';
  }
  return `<article class="card-dark p-4 mb-3 fa-recovery-line fa-recovery-line--${tone}">
    <div class="fa-recovery-line__label">Fasting × Recovery</div>
    <div class="fa-recovery-line__text">${text}</div>
  </article>`;
}

// Tab switch (routed from app.js via fasting-actions).
export function handleFastingTabAction(action, getState) {
  _fastingTab = action === 'fa-tab-stats' ? 'stats' : 'overview';
  renderFastingAnalytics(getState);
}
