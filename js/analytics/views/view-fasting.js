// ==========================================
// FASTING ANALYTICS VIEW — analytics/views/view-fasting.js
// Renders into #analytics-fasting (.analytics-section)
// ==========================================
import { computeFastingAnalytics, buildCalendarData } from '../../fasting/fasting-calcs.js';
import { generateFastingInsights, renderFastingInsightsHTML } from '../../fasting/fasting-insights.js';
import { getUnlockedAchievements } from '../../fasting/fasting-achievements.js';
import { EDUCATION_CONTENT, EDUCATION_CATEGORIES } from '../../fasting/fasting-education.js';
import { statCard } from '../charts/chart-primitives.js';
import {
  renderFastingHoursBarChart,
  renderFastingDurationTrend,
  renderGoalCompletionTrend,
  renderZoneDistributionChart,
  renderMonthlyAdherenceChart,
} from '../charts/fasting-charts.js';
import { fmtHoursLabel } from '../../fasting.js';

const AMBER  = '#f59e0b';
const ORANGE = '#f97316';
const GREEN  = '#10b981';
const BLUE   = '#3b82f6';
const PURPLE = '#8b5cf6';
const RED    = '#ef4444';

let _calendarMonth = null; // { year, month } — null = current month; set by prev/next nav
let _eduState = { category: 'articles', articleId: null };

function qs(id) { return document.getElementById(id); }

function _ensureDiv(parent, id, className = '') {
  let el = parent.querySelector(`#${id}`);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    if (className) el.className = className;
    parent.appendChild(el);
  }
  return el;
}

function _fmt(n, decimals = 1) {
  if (!n && n !== 0) return '—';
  return n % 1 === 0 ? n.toString() : n.toFixed(decimals);
}

// ── Overview ──────────────────────────────────────────────────────────────────

function _renderOverview(el, calcs, appState) {
  const fs = appState.fastingSession;
  const { active, currentHours, currentZone, goal } = calcs;
  const progressPct = active ? Math.min(100, (currentHours / goal) * 100) : 0;
  const remaining   = active ? Math.max(0, goal - currentHours) : 0;

  const currentFastCard = active
    ? `<article class="card-dark p-4 mb-3" style="border:1px solid ${currentZone.color}28;border-left:3px solid ${currentZone.color};">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <div>
            <div style="font-size:0.65rem;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:5px;">Current Fast</div>
            <div id="fa-live-timer" style="font-size:2rem;font-weight:900;letter-spacing:-0.04em;font-variant-numeric:tabular-nums;color:rgba(255,255,255,0.95);">${_fmtHHMMSS(currentHours)}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1rem;font-weight:800;color:${currentZone.color};">${currentZone.icon} ${currentZone.name}</div>
            <div style="font-size:0.75rem;color:rgba(255,255,255,0.45);margin-top:3px;">${fmtHoursLabel(remaining)} to goal</div>
          </div>
        </div>
        <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;margin-bottom:8px;">
          <div id="fa-live-bar" style="height:100%;width:${progressPct.toFixed(1)}%;background:${currentZone.color};border-radius:3px;transition:width 1s linear;"></div>
        </div>
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.38);">${progressPct.toFixed(0)}% of ${goal}h goal</div>
      </article>`
    : '';

  el.innerHTML = `
    ${currentFastCard}
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Weekly Hours', value: _fmt(calcs.weeklyHours), unit: 'h', color: AMBER, sub: 'last 7 days' })}
      ${statCard({ label: 'Monthly Hours', value: _fmt(calcs.monthlyHours), unit: 'h', color: ORANGE, sub: 'this month' })}
      ${statCard({ label: 'Current Streak', value: calcs.currentStreak, unit: ' d', color: GREEN, sub: 'consecutive days' })}
      ${statCard({ label: 'Longest Streak', value: calcs.longestStreak, unit: ' d', color: BLUE, sub: 'all time' })}
    </div>
    <div class="grid-2-col gap-2 mb-2">
      ${statCard({ label: 'Avg Duration', value: _fmt(calcs.avgDuration), unit: 'h', color: AMBER, sub: 'per fast' })}
      ${statCard({ label: 'Goal Completion', value: _fmt(calcs.goalCompletionPct, 0), unit: '%', color: GREEN, sub: 'fasts meeting goal' })}
      ${statCard({ label: 'Consistency', value: _fmt(calcs.consistencyScore, 0), unit: '%', color: PURPLE, sub: '30-day score', status: calcs.consistencyScore >= 70 ? 'Strong' : calcs.consistencyScore >= 40 ? 'Building' : 'Low' })}
      ${statCard({ label: 'Adherence', value: _fmt(calcs.adherenceScore, 0), unit: '%', color: BLUE, sub: '30-day goal rate' })}
    </div>
  `;
}

// ── Trends ────────────────────────────────────────────────────────────────────

function _renderTrends(el, calcs) {
  el.innerHTML = `
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Weekly Fasting Hours</div>
      <div class="an-chart__subtitle">Total hours fasted per week, last 12 weeks</div>
      <div id="fa-chart-weekly-hours"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Average Fast Duration</div>
      <div class="an-chart__subtitle">Mean fast duration per week</div>
      <div id="fa-chart-duration"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Goal Completion Rate</div>
      <div class="an-chart__subtitle">% of fasts that met the goal, per week</div>
      <div id="fa-chart-goal"></div>
    </article>
    <article class="card-dark p-3 mb-3">
      <div class="an-chart__title">Monthly Fasting Volume</div>
      <div class="an-chart__subtitle">Total fasting hours by month</div>
      <div id="fa-chart-monthly"></div>
    </article>
  `;

  renderFastingHoursBarChart(qs('fa-chart-weekly-hours'),  calcs.weeklyTrend);
  renderFastingDurationTrend(qs('fa-chart-duration'),      calcs.weeklyTrend);
  renderGoalCompletionTrend( qs('fa-chart-goal'),          calcs.weeklyTrend);
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

// ── Performance ───────────────────────────────────────────────────────────────

function _renderPerformance(el, calcs) {
  const { totalFasts, totalHours, avgDuration, longestFast, shortestFast, weekdayAdherence, mostCommonSchedule } = calcs;

  const rows = [
    { label: 'Total Fasts',         value: totalFasts.toString() },
    { label: 'Total Hours Fasted',  value: `${_fmt(totalHours, 0)}h` },
    { label: 'Average Fast',        value: `${_fmt(avgDuration)}h` },
    { label: 'Longest Fast',        value: `${_fmt(longestFast)}h` },
    { label: 'Shortest Fast',       value: `${_fmt(shortestFast)}h` },
    { label: 'Most Common Schedule', value: mostCommonSchedule ? `${mostCommonSchedule} (${mostCommonSchedule.split(':')[0]}h fast)` : '—' },
    { label: 'Weekday Adherence',   value: weekdayAdherence.weekdayRate > 0 ? `${weekdayAdherence.weekdayRate.toFixed(0)}%` : '—' },
    { label: 'Weekend Adherence',   value: weekdayAdherence.weekendRate > 0 ? `${weekdayAdherence.weekendRate.toFixed(0)}%` : '—' },
  ].map(r => `<div class="an-metric-row">
    <span class="an-metric-label">${r.label}</span>
    <span class="an-metric-value">${r.value}</span>
  </div>`).join('');

  el.innerHTML = `<article class="card-dark p-4 mb-3">${rows}</article>`;
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
  `;
  renderZoneDistributionChart(qs('fa-zone-dist'), calcs.zoneDistribution);
}

// ── Achievements ──────────────────────────────────────────────────────────────

function _renderAchievements(el, achievements) {
  const tierColors = { gold: '#f59e0b', silver: '#94a3b8', bronze: '#b45309' };
  const tierBg     = { gold: 'rgba(245,158,11,0.08)', silver: 'rgba(148,163,184,0.08)', bronze: 'rgba(180,83,9,0.08)' };

  const items = achievements.map(a => {
    const c = tierColors[a.tier] || AMBER;
    const bg = a.unlocked ? (tierBg[a.tier] || '') : 'transparent';
    const opacity = a.unlocked ? 1 : 0.3;
    return `<div class="fa-achievement" style="opacity:${opacity};background:${bg};border:1px solid ${a.unlocked ? c + '30' : 'rgba(255,255,255,0.06)'};">
      <div class="fa-achievement__icon">${a.icon}</div>
      <div class="fa-achievement__label">${a.label}</div>
      <div class="fa-achievement__desc">${a.description}</div>
      ${a.unlocked ? `<div class="fa-achievement__tier" style="color:${c};">${a.tier}</div>` : '<div class="fa-achievement__tier" style="color:rgba(255,255,255,0.2);">locked</div>'}
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

// ── Integrations / Correlations ────────────────────────────────────────────────

function _renderIntegrations(el, calcs) {
  const { bwCorrelation, recoveryCorrelation } = calcs;
  const rows = [];

  if (bwCorrelation.hasData) {
    const dirLabel = bwCorrelation.direction === 'decreasing'
      ? `Body weight trends favourably on high-fasting weeks (avg ${Math.abs(bwCorrelation.diffKg)} kg lower).`
      : bwCorrelation.direction === 'increasing'
        ? `Body weight trends higher on high-fasting weeks. Review eating window nutrition.`
        : `Body weight is consistent regardless of fasting frequency.`;
    const p = bwCorrelation.direction === 'decreasing' ? 'good' : bwCorrelation.direction === 'increasing' ? 'info' : 'info';
    rows.push({ text: dirLabel, priority: p });
  } else {
    rows.push({ text: 'Log body weight to see correlations with fasting adherence.', priority: 'info' });
  }

  if (recoveryCorrelation.hasData) {
    if (recoveryCorrelation.moodEffect > 5) {
      rows.push({ text: `Mood averages ${recoveryCorrelation.moodEffect.toFixed(0)}% higher on fasting days (${recoveryCorrelation.avgFastMood}/5 vs ${recoveryCorrelation.avgNonFastMood}/5 on non-fasting days).`, priority: 'good' });
    } else if (recoveryCorrelation.moodEffect < -10) {
      rows.push({ text: `Mood averages lower on fasting days. Prioritise nutrition density in your eating window.`, priority: 'alert' });
    } else {
      rows.push({ text: `Mood and wellness scores are consistent on fasting and non-fasting days.`, priority: 'info' });
    }
    if (recoveryCorrelation.avgFastSleep > 0 && recoveryCorrelation.avgNonFastSleep > 0) {
      const diff = recoveryCorrelation.avgFastSleep - recoveryCorrelation.avgNonFastSleep;
      if (Math.abs(diff) > 0.3) {
        rows.push({
          text: `Sleep averages ${recoveryCorrelation.avgFastSleep}h on fasting days vs ${recoveryCorrelation.avgNonFastSleep}h on non-fasting days.`,
          priority: diff > 0 ? 'good' : 'info',
        });
      }
    }
  } else {
    rows.push({ text: 'Log daily wellness check-ins to see fasting\'s impact on recovery and sleep.', priority: 'info' });
  }

  const iconMap = { alert: '!', good: '↑', info: 'i' };
  const items = rows.map(r => `<div class="an-insight an-insight--${r.priority}">
    <div class="an-insight__icon">${iconMap[r.priority] || '·'}</div>
    <span>${r.text}</span>
  </div>`).join('');

  el.innerHTML = `<div class="an-insights" style="margin-bottom:0;">
    <div class="an-insights__title">Cross-System Correlations</div>
    ${items}
  </div>`;
}

// ── Education hub ─────────────────────────────────────────────────────────────

function _renderEducation(el) {
  _renderEduList(el);
}

function _renderEduList(el) {
  const { category } = _eduState;

  const catTabs = EDUCATION_CATEGORIES.map(c =>
    `<button class="fa-edu-tab ${c.id === category ? 'fa-edu-tab--active' : ''}" data-action="fa-edu-cat" data-cat="${c.id}">
      ${c.icon} ${c.label}
    </button>`
  ).join('');

  let content = '';
  if (category === 'articles') {
    content = EDUCATION_CONTENT.articles.map(a => `
      <div class="fa-edu-card" data-action="fa-edu-article" data-article="${a.id}" data-cat="articles" role="button" tabindex="0">
        <div class="fa-edu-card__meta">${a.readTime}</div>
        <div class="fa-edu-card__title">${a.title}</div>
        <div class="fa-edu-card__tagline">${a.tagline}</div>
        <div class="fa-edu-card__arrow">→</div>
      </div>`).join('');
  } else if (category === 'studies') {
    content = EDUCATION_CONTENT.studies.map(s => `
      <div class="fa-edu-card" data-action="fa-edu-article" data-article="${s.id}" data-cat="studies" role="button" tabindex="0">
        <div class="fa-edu-card__meta">${s.year} · ${s.studyType}${s.sampleSize ? ` · n=${s.sampleSize}` : ''}</div>
        <div class="fa-edu-card__title">${s.title}</div>
        <div class="fa-edu-card__tagline">${s.journal}</div>
        <div class="fa-edu-card__arrow">→</div>
      </div>`).join('');
  } else if (category === 'guides') {
    content = EDUCATION_CONTENT.guides.map(g => `
      <div class="fa-edu-card" data-action="fa-edu-article" data-article="${g.id}" data-cat="guides" role="button" tabindex="0">
        <div class="fa-edu-card__meta">${g.readTime}</div>
        <div class="fa-edu-card__title">${g.title}</div>
        <div class="fa-edu-card__tagline">${g.tagline}</div>
        <div class="fa-edu-card__arrow">→</div>
      </div>`).join('');
  } else if (category === 'glossary') {
    content = `<div class="fa-edu-glossary">${EDUCATION_CONTENT.glossary.map(g => `
      <div class="fa-edu-gterm">
        <div class="fa-edu-gterm__term">${g.term}</div>
        <div class="fa-edu-gterm__def">${g.definition}</div>
      </div>`).join('')}</div>`;
  }

  el.innerHTML = `
    <div class="fa-edu-tabs">${catTabs}</div>
    <div class="fa-edu-list" id="fa-edu-list">${content}</div>
  `;
}

function _renderEduArticle(el, articleId, cat) {
  const items = cat === 'studies' ? EDUCATION_CONTENT.studies : cat === 'guides' ? EDUCATION_CONTENT.guides : EDUCATION_CONTENT.articles;
  const item  = items.find(a => a.id === articleId);
  if (!item) { _renderEduList(el); return; }

  const isStudy = cat === 'studies';

  let body = '';
  if (isStudy) {
    body = `
      <div class="fa-edu-article__meta">
        ${item.year} · ${item.studyType}${item.sampleSize ? ` · n = ${item.sampleSize}` : ''} · ${item.journal}
        ${item.authors ? `<br><span style="opacity:0.6;">${item.authors}</span>` : ''}
      </div>
      <div class="fa-edu-article__section-head">Key Findings</div>
      <ul class="fa-edu-article__list">${item.keyFindings.map(f => `<li>${f}</li>`).join('')}</ul>
      <div class="fa-edu-article__section-head">Practical Takeaways</div>
      <ul class="fa-edu-article__list">${item.practicalTakeaways.map(t => `<li>${t}</li>`).join('')}</ul>
      ${item.disclaimer ? `<div class="fa-edu-disclaimer">${item.disclaimer}</div>` : ''}
    `;
  } else {
    body = item.sections.map(s => {
      if (s.type === 'paragraph') return `<p class="fa-edu-article__p">${s.text}</p>`;
      if (s.type === 'heading')   return `<div class="fa-edu-article__section-head">${s.text}</div>`;
      if (s.type === 'list')      return `<ul class="fa-edu-article__list">${s.items.map(i => `<li>${i}</li>`).join('')}</ul>`;
      if (s.type === 'callout')   return `<div class="fa-edu-callout">${s.text}</div>`;
      return '';
    }).join('');
  }

  el.innerHTML = `
    <button class="fa-edu-back" data-action="fa-edu-back">← Fasting Knowledge</button>
    <div class="fa-edu-article">
      ${isStudy ? '' : `<div class="fa-edu-article__read-time">${item.readTime || ''}</div>`}
      <h3 class="fa-edu-article__title">${item.title}</h3>
      ${body}
    </div>
  `;
}

// ── Live ticker for analytics view ────────────────────────────────────────────

let _analyticsLiveTicker = null;

function _startAnalyticsTicker(getState) {
  if (_analyticsLiveTicker) return;
  _analyticsLiveTicker = setInterval(() => {
    // Stop if fasting section is no longer visible (user navigated to another analytics tab)
    const section = qs('analytics-fasting');
    if (!section?.classList.contains('active')) { _stopAnalyticsTicker(); return; }
    const state = getState();
    if (!state?.fastingSession?.active) { _stopAnalyticsTicker(); return; }
    const hours = (Date.now() - new Date(state.fastingSession.startTime).getTime()) / 3_600_000;
    const timerEl = qs('fa-live-timer');
    const barEl   = qs('fa-live-bar');
    if (timerEl) timerEl.textContent = _fmtHHMMSS(hours);
    if (barEl) {
      const goal = state.fastingSession.goal ?? 16;
      barEl.style.width = `${Math.min(100, (hours / goal) * 100).toFixed(1)}%`;
    }
  }, 1000);
}

function _stopAnalyticsTicker() {
  clearInterval(_analyticsLiveTicker);
  _analyticsLiveTicker = null;
}

function _fmtHHMMSS(hours) {
  const totalSec = Math.floor(hours * 3600);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const p = n => String(n).padStart(2, '0');
  return `${h}:${p(m)}:${p(s)}`;
}

// ── Education event handlers (called from app.js) ─────────────────────────────

export function handleFastingEduAction(action, target, getState) {
  const section = qs('analytics-fasting');
  if (!section) return;
  const eduEl = qs('fa-edu');
  if (!eduEl) return;

  if (action === 'fa-edu-cat') {
    _eduState.category  = target.dataset.cat;
    _eduState.articleId = null;
    _renderEduList(eduEl);
  } else if (action === 'fa-edu-article') {
    _eduState.articleId = target.dataset.article;
    _eduState.category  = target.dataset.cat || _eduState.category;
    _renderEduArticle(eduEl, _eduState.articleId, _eduState.category);
  } else if (action === 'fa-edu-back') {
    _eduState.articleId = null;
    _renderEduList(eduEl);
  }
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
    // Don't navigate past the current month
    if (next <= new Date(now.getFullYear(), now.getMonth(), 1)) {
      _calendarMonth = { year: next.getFullYear(), month: next.getMonth() };
    } else {
      return;
    }
  }

  const appState = getState();
  const calcs = computeFastingAnalytics(appState);
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
      <h2 class="section-header">Fasting Analytics</h2>
      <article class="card-dark p-4" style="text-align:center;padding:40px 20px;">
        <div style="font-size:2rem;margin-bottom:12px;">⏱️</div>
        <div style="font-size:0.95rem;font-weight:700;color:rgba(255,255,255,0.7);margin-bottom:8px;">No fasting data yet</div>
        <div style="font-size:0.8rem;color:rgba(255,255,255,0.38);line-height:1.6;">Start your first fast from the home screen.<br>Analytics will appear here once you have data.</div>
      </article>
      <h2 class="section-header">Fasting Knowledge</h2>
      <div id="fa-edu"></div>
    `;
    _renderEducation(qs('fa-edu'));
    return;
  }

  const calcs        = computeFastingAnalytics(appState);
  const insights     = generateFastingInsights(calcs);
  const achievements = getUnlockedAchievements(calcs);

  section.innerHTML = `
    <h2 class="section-header">Overview</h2>
    <div id="fa-overview"></div>

    <div id="fa-insights"></div>

    <h2 class="section-header">Trends</h2>
    <div id="fa-trends"></div>

    <h2 class="section-header">Calendar</h2>
    <div id="fa-calendar"></div>

    <h2 class="section-header">Performance</h2>
    <div id="fa-performance"></div>

    <h2 class="section-header">Distribution</h2>
    <div id="fa-distribution"></div>

    <h2 class="section-header">Achievements</h2>
    <div id="fa-achievements"></div>

    <h2 class="section-header">Correlations</h2>
    <div id="fa-integrations"></div>

    <h2 class="section-header">Fasting Knowledge</h2>
    <div id="fa-edu"></div>
  `;

  _renderOverview(qs('fa-overview'), calcs, appState);
  qs('fa-insights').innerHTML = renderFastingInsightsHTML(insights);
  _renderTrends(qs('fa-trends'), calcs);
  _renderCalendar(qs('fa-calendar'), calcs, appState);
  _renderPerformance(qs('fa-performance'), calcs);
  _renderDistribution(qs('fa-distribution'), calcs);
  _renderAchievements(qs('fa-achievements'), achievements);
  _renderIntegrations(qs('fa-integrations'), calcs);
  _renderEducation(qs('fa-edu'));

  if (calcs.active) _startAnalyticsTicker(getState);
}
