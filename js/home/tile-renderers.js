// @ts-check
// =============================================================================
// TILE RENDERERS — pure functions, no state closure dependency.
// Tiles are presenters of the dashboard model: hero value + optional
// delta chip + optional sparkline + optional one-line brain insight.
// =============================================================================
import { DashboardTileType } from '../dashboard.js';

export function renderTileError(label) {
  return `
    <div class="card-icon-title text-muted"><span>⚠️</span> ${label}</div>
    <div class="font-heavy" style="font-size:1.1rem;color:var(--color-red);">Error</div>
    <div class="text-muted" style="font-size:0.6rem;">Could not load data</div>
  `;
}

// ── Shared sub-components ────────────────────────────────────────────────────

// Tiny inline bar sparkline. `values` is a numeric array; the last bar is
// highlighted. Degrades to nothing when there's <2 points of signal.
export function renderSparkline(values, color = 'var(--color-blue)') {
  if (!Array.isArray(values)) return '';
  const vals = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (vals.length < 2) return '';
  const max = Math.max(...vals, 0.0001);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const bars = vals.map((v, i) => {
    const h = Math.max(8, Math.round(((v - min) / range) * 100));
    const last = i === vals.length - 1;
    return `<span class="spark-bar" style="height:${h}%;background:${last ? color : 'rgba(255,255,255,0.18)'};"></span>`;
  }).join('');
  return `<div class="tile-spark" aria-hidden="true">${bars}</div>`;
}

// Coloured week-over-week delta chip. `delta` is the model's makeDelta() output.
export function renderDelta(delta) {
  if (!delta) return '';
  const arrow = delta.dir === 'up' ? '▲' : delta.dir === 'down' ? '▼' : '→';
  const color = delta.dir === 'flat'
    ? 'var(--text-secondary)'
    : delta.good ? 'var(--color-green)' : 'var(--color-red)';
  const text = delta.usePct === false ? delta.label : (delta.pctLabel || delta.label);
  return `<span class="tile-delta" style="color:${color};">${arrow} ${text}</span>`;
}

function insightLine(insight) {
  if (!insight) return '';
  return `<div class="tile-insight">${insight}</div>`;
}

// ── Tile types ───────────────────────────────────────────────────────────────

export function renderMetricTile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  const tagHTML = data.tag
    ? `<div class="tile-tag font-bold" style="font-size:0.7rem;color:${data.tagColor || accentColor};">${data.tag}</div>`
    : '';
  const heroColor = data.state === 'empty' ? 'var(--text-secondary)' : 'var(--text-primary)';
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div class="tile-body">
      <div class="tile-hero-row">
        <div class="font-heavy tile-hero" style="font-size:1.3rem;line-height:1.05;color:${heroColor};">${data.hero ?? '--'}</div>
        ${renderDelta(data.delta)}
      </div>
      ${tagHTML}
      ${data.spark ? renderSparkline(data.spark, data.sparkColor || accentColor) : `<div class="text-muted tile-sub" style="font-size:0.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.sub || ''}</div>`}
      ${data.spark && data.sub ? `<div class="text-muted tile-sub" style="font-size:0.58rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.sub}</div>` : ''}
    </div>
    ${insightLine(data.insight)}
  `;
}

export function renderRingTile(config, data) {
  const ringColor = data.ringColor || 'var(--color-blue)';
  const pct = data.ringPct || 0;
  const isLight = document.documentElement.dataset.theme === 'light';
  const trackColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)';
  const grad = `conic-gradient(${ringColor} ${pct}%, ${trackColor} 0)`;
  return `
    <div class="card-icon-title" style="color:var(${config.accentVar});"><span>${config.icon}</span> ${config.label}</div>
    <div class="ring-tile-grid">
      <div class="readiness-ring green" style="background:${grad};">
        <div class="readiness-ring-inner">
          <span class="font-heavy text-inverse" style="font-size:0.8rem;">${data.hero ?? '--'}</span>
        </div>
      </div>
      <div class="ring-tile-meta">
        ${data.tag ? `<div class="font-bold" style="font-size:0.72rem;color:${data.tagColor || ringColor};">${data.tag}</div>` : ''}
        <div class="text-muted" style="font-size:0.58rem;line-height:1.25;">${data.sub || ''}</div>
      </div>
    </div>
    ${insightLine(data.insight)}
  `;
}

export function renderSplit3Tile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  const rows = (data.rows || []).map(r => `
    <div class="flex-between mb-1" style="font-size:0.75rem;">
      <span class="text-muted">${r.label}</span>
      <strong class="text-inverse">${r.value}</strong>
    </div>
  `).join('');
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div class="tile-body">${rows}</div>
    ${insightLine(data.insight)}
  `;
}

export function renderRatioBarTile(config, data) {
  return `
    <div class="card-icon-title" style="color:var(${config.accentVar});"><span>${config.icon}</span> ${config.label}</div>
    <div class="tile-body">
      <div class="font-heavy text-inverse mb-1" style="font-size:0.95rem;">${data.label || '0% / 0%'}</div>
      <div class="ratio-bar-track mb-1" style="height:6px;border-radius:3px;">
        <div class="ratio-fill-blue" style="width:${data.liftPct || 50}%;background:#3b82f6;"></div>
        <div class="ratio-fill-pink" style="width:${data.runPct || 50}%;background:#ec4899;"></div>
      </div>
      <div class="text-muted" style="font-size:0.6rem;">${data.advice || 'Lift / Run bias'}</div>
    </div>
    ${insightLine(data.insight)}
  `;
}

export function renderProgressTile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div class="tile-body">
      <div class="tile-hero-row">
        <div class="font-heavy text-inverse" style="font-size:1.3rem;line-height:1.05;">
          ${data.done || 0} <span class="text-muted" style="font-size:0.9rem;">/ ${data.total || 0}</span>
        </div>
        <span class="tile-delta" style="color:${pct >= 80 ? 'var(--color-green)' : pct >= 50 ? 'var(--color-amber)' : 'var(--text-secondary)'};">${pct}%</span>
      </div>
      <div class="tile-progress-track"><div class="tile-progress-fill" style="width:${pct}%;background:${accentColor};"></div></div>
      <div class="text-muted" style="font-size:0.6rem;">${data.sub || ''}</div>
    </div>
    ${insightLine(data.insight)}
  `;
}

// Connect-Health placeholder — replaces five dead "Setup" tiles when the
// Health app isn't linked. Spans the full grid width.
export function renderConnectHealthTile(config, data) {
  return `
    <div class="connect-health-tile__inner">
      <span class="connect-health-tile__icon">⌚</span>
      <div class="connect-health-tile__text">
        <div class="connect-health-tile__title">Connect your Health app</div>
        <div class="connect-health-tile__sub">Unlock HRV, resting HR, sleep, steps &amp; VO₂ max</div>
      </div>
      <span class="connect-health-tile__arrow">›</span>
    </div>
  `;
}

export function renderTileContent(config, data) {
  if (data.state === 'error') return renderTileError(config.label);
  switch (config.type) {
    case DashboardTileType.RING:      return renderRingTile(config, data);
    case DashboardTileType.SPLIT_3:   return renderSplit3Tile(config, data);
    case DashboardTileType.RATIO_BAR: return renderRatioBarTile(config, data);
    case DashboardTileType.PROGRESS:  return renderProgressTile(config, data);
    case DashboardTileType.CONNECT:   return renderConnectHealthTile(config, data);
    default:                          return renderMetricTile(config, data);
  }
}
