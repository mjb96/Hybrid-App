// @ts-check
// =============================================================================
// RUNNING ANALYTICS
// A concise Overview and a complete, metric-specific Stats index. Every number
// comes from running-detail.js, so Home/Profile links, summaries, detail charts
// and exact Activity evidence share one date-strict all-activation source.
// =============================================================================
import { statCard } from '../charts/chart-primitives.js';
import { buildRunningMetricDetail, collectRunningHistory } from '../running-detail.js';
import { mountScreenTabs, screenTabBar, esc } from './screen-kit.js';

let _runningTab = 'overview';
export function setRunningTab(tab) { _runningTab = tab === 'stats' ? 'stats' : 'overview'; }

const STAT_GROUPS = Object.freeze([
  {
    title: 'Volume & frequency',
    ids: [
      'running.weekly-distance', 'running.four-week-distance', 'running.total-distance',
      'running.weekly-duration', 'running.weekly-run-count', 'running.total-run-count',
      'running.longest-run', 'running.weekly-elevation',
    ],
  },
  {
    title: 'Pace & performance',
    ids: [
      'running.endurance-score', 'running.average-pace', 'running.best-pace', 'running.vdot', 'running.fitness-trend',
      'running.race-projections', 'running.personal-bests',
    ],
  },
  {
    title: 'Heart rate & mechanics',
    ids: [
      'running.average-heart-rate', 'running.max-heart-rate', 'running.threshold-pace',
      'running.threshold-heart-rate', 'running.cadence', 'running.intensity-distribution',
      'running.aerobic-training-effect', 'running.anaerobic-training-effect',
      'running.running-economy', 'running.aerobic-efficiency', 'running.pace-heart-rate',
    ],
  },
  {
    title: 'Running load',
    ids: ['running.training-load', 'running.load-ratio', 'running.form', 'running.training-stress'],
  },
]);

function metricModel(state, history, id) {
  return buildRunningMetricDetail(state, id, { history, includeSeries: false });
}

function compactScope(model) {
  const scope = model?.definition?.scope;
  if (scope === 'calendar-week') return 'live calendar week';
  if (scope === 'rolling-7d') return 'trailing 7 days';
  if (scope === 'rolling-28d') return 'trailing 28 days';
  if (scope === 'rolling-12w') return 'trailing 12 weeks';
  if (scope === 'recent-8w') return 'trailing 8 weeks';
  if (scope === 'rolling-ewma') return '7d / 28d rolling';
  if (scope === 'configured') return 'current setting';
  if (scope === 'current-model') return 'current model';
  return 'all dated history';
}

function metricCard(model) {
  if (!model) return '';
  return statCard({
    label: model.definition.label,
    value: model.formattedValue,
    sub: compactScope(model),
    color: model.definition.color,
    action: 'open-analytics', context: 'running-metric', entity: model.metricId,
    entityName: model.definition.label, parentContext: 'running', preserveWeek: true,
    metricId: model.metricId,
  });
}

function overviewHero(model) {
  if (!model) return '';
  return `<button type="button" class="card-dark an-hero an-hero--action" data-action="open-analytics" data-context="running-metric" data-entity="${esc(model.metricId)}" data-entity-name="${esc(model.definition.label)}" data-parent-context="running" data-preserve-week="true" data-metric-id="${esc(model.metricId)}" aria-label="View ${esc(model.definition.label)} details">
    <div class="an-hero__k">${esc(model.definition.label)} · running fitness</div>
    <div class="an-hero__val" style="color:${model.definition.color}">${esc(model.formattedValue)}</div>
    <div class="an-hero__empty">${esc(compactScope(model))}</div>
    <span class="an-stat__drill">View history & evidence ›</span>
  </button>`;
}

function renderOverview(body, state, history) {
  const vdot = metricModel(state, history, 'running.vdot');
  const weeklyDistance = metricModel(state, history, 'running.weekly-distance');
  const bestPace = metricModel(state, history, 'running.best-pace');
  const primaryInsight = weeklyDistance?.empty
    ? 'Your first dated run will unlock calendar-week distance, comparisons and exact activity evidence.'
    : weeklyDistance?.interpretation;
  body.innerHTML = `
    ${overviewHero(vdot)}
    <div class="grid-2-col gap-2 mb-3">
      ${metricCard(weeklyDistance)}
      ${metricCard(bestPace)}
    </div>
    <article class="an-insight-card">
      <span class="an-insight-card__eyebrow">What this says</span>
      <p>${esc(primaryInsight || 'Open a metric to inspect its history and source activities.')}</p>
    </article>`;
}

function renderStats(body, state, history) {
  body.innerHTML = STAT_GROUPS.map((group) => `
    <section class="running-metric-group" aria-labelledby="running-${group.title.toLowerCase().replace(/[^a-z]+/g, '-')}">
      <h2 id="running-${group.title.toLowerCase().replace(/[^a-z]+/g, '-')}" class="section-header">${esc(group.title)}</h2>
      <div class="grid-2-col gap-2 mb-4">
        ${group.ids.map((id) => metricCard(metricModel(state, history, id))).join('')}
      </div>
    </section>`).join('');
}

export function renderRunningAnalytics(data, getState) {
  const state = getState ? getState() : {};
  const section = document.getElementById('analytics-running');
  if (!section) return;
  const history = collectRunningHistory(state);
  section.innerHTML = screenTabBar(_runningTab) + '<div id="running-tab-body"></div>';
  const body = document.getElementById('running-tab-body');
  if (!body) return;
  if (_runningTab === 'stats') renderStats(body, state, history);
  else renderOverview(body, state, history);
  mountScreenTabs('analytics-running', (tab) => {
    _runningTab = tab;
    renderRunningAnalytics(data, getState);
  });
}
