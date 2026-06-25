// @ts-check
// =============================================================================
// TILE RENDERERS — pure functions, no state closure dependency
// =============================================================================
import { DashboardTileType } from '../dashboard.js';

export function renderTileLoading() {
  return `
    <div class="tile-skeleton-line" style="width:60%;height:12px;border-radius:4px;margin-bottom:8px;"></div>
    <div class="tile-skeleton-line" style="width:40%;height:22px;border-radius:4px;margin-bottom:6px;"></div>
    <div class="tile-skeleton-line" style="width:80%;height:10px;border-radius:4px;"></div>
  `;
}

export function renderTileError(label) {
  return `
    <div class="card-icon-title text-muted"><span>⚠️</span> ${label}</div>
    <div class="font-heavy" style="font-size:1.1rem;color:var(--color-red);">Error</div>
    <div class="text-muted" style="font-size:0.6rem;">Could not load data</div>
  `;
}

export function renderMetricTile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  const tagHTML = data.tag
    ? `<div class="tile-tag font-bold mb-1" style="font-size:0.75rem;color:${data.tagColor || accentColor};">${data.tag}</div>`
    : '';
  const heroColor = data.state === 'empty' ? 'var(--text-secondary)' : 'var(--text-primary)';
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div>
      ${tagHTML}
      <div class="font-heavy tile-hero" style="font-size:1.3rem;line-height:1.1;color:${heroColor};">${data.hero || '--'}</div>
      <div class="text-muted tile-sub" style="font-size:0.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.sub || ''}</div>
    </div>
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
    <div class="readiness-ring-container">
      <div class="readiness-ring green" style="background:${grad};">
        <div class="readiness-ring-inner">
          <span class="font-heavy text-inverse" style="font-size:0.75rem;">${data.hero || '--'}</span>
        </div>
      </div>
    </div>
    <div class="text-muted text-center" style="font-size:0.6rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${data.sub || ''}</div>
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
    <div>${rows}</div>
  `;
}

export function renderRatioBarTile(config, data) {
  return `
    <div class="card-icon-title" style="color:var(${config.accentVar});"><span>${config.icon}</span> ${config.label}</div>
    <div>
      <div class="font-heavy text-inverse mb-1" style="font-size:0.95rem;">${data.label || '0% / 0%'}</div>
      <div class="ratio-bar-track mb-1" style="height:5px;border-radius:3px;">
        <div class="ratio-fill-blue" id="tileRatioLiftBar" style="width:${data.liftPct || 50}%;background:#3b82f6;"></div>
        <div class="ratio-fill-pink" id="tileRatioRunBar" style="width:${data.runPct || 50}%;background:#ec4899;"></div>
      </div>
      <div class="text-muted" style="font-size:0.6rem;">${data.advice || 'Lift / Run bias'}</div>
    </div>
  `;
}

export function renderProgressTile(config, data) {
  const accentColor = `var(${config.accentVar})`;
  return `
    <div class="card-icon-title" style="color:${accentColor};"><span>${config.icon}</span> ${config.label}</div>
    <div>
      <div class="font-heavy text-inverse mb-1" style="font-size:1.3rem;line-height:1.1;">
        ${data.done || 0} <span class="text-muted" style="font-size:0.9rem;">/ ${data.total || 0}</span>
      </div>
      <div class="text-muted" style="font-size:0.6rem;">${data.sub || ''}</div>
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
    default:                          return renderMetricTile(config, data);
  }
}
