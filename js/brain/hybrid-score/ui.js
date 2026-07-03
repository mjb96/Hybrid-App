// @ts-check
// =============================================================================
// HYBRID SCORE — UI BUILDERS (js/brain/hybrid-score/ui.js)
//
// Pure HTML-string builders (no DOM ops) shared by the Home hero card and the
// Insights detail view, so the gauge/markup is defined once. The engine stays
// DOM-free; these turn a score result into premium markup.
// =============================================================================
import { PILLAR_META } from './config.js';
import { dailySeries, bucketedTrend } from './history.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Circular SVG gauge. `size` px. score null → calibrating dashes.
export function gaugeSVG(score, color, size = 132) {
  const r = 52, C = 2 * Math.PI * r;
  const pct = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : 0;
  const offset = C * (1 - pct / 100);
  const shown = typeof score === 'number' ? score : '· ·';
  return `
  <svg class="hs-gauge__svg" width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="Hybrid Score ${esc(shown)} out of 100">
    <circle cx="60" cy="60" r="${r}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="10"/>
    <circle class="hs-gauge__arc" cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="10"
            stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
            transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" class="hs-gauge__num" fill="var(--text-inverse,#f8fafc)">${esc(shown)}</text>
    <text x="60" y="76" text-anchor="middle" class="hs-gauge__den" fill="var(--text-muted,#94a3b8)">/ 100</text>
  </svg>`;
}

function deltaChip(delta) {
  if (delta == null) return `<span class="hs-delta hs-delta--flat">New today</span>`;
  if (delta === 0) return `<span class="hs-delta hs-delta--flat">± 0 today</span>`;
  const up = delta > 0;
  return `<span class="hs-delta hs-delta--${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${delta} today</span>`;
}

function momentumChip(m) {
  const icon = m.dir === 'up' ? '↗' : m.dir === 'down' ? '↘' : '→';
  return `<span class="hs-momentum hs-momentum--${m.dir}">${icon} ${esc(m.label)}</span>`;
}

// ---- HOME HERO -------------------------------------------------------------
// `showAction:false` suppresses the bottom action row — used on Home, where the
// Morning Briefing directly below owns the day's single action (one voice).
// The Insights detail keeps its own "Do this next" row.
/** @param {{showAction?:boolean}} [opts] */
export function heroHTML(r, opts = {}) {
  const showAction = opts.showAction !== false;
  const color = r.band.color;
  const gauge = gaugeSVG(r.score, color);
  const levelStr = r.level ? `${r.level.icon} ${esc(r.level.name)}` : '';

  if (!r.hasData) {
    return `
    <article class="hs-hero hs-hero--calibrating" role="button" tabindex="0"
             data-action="open-analytics" data-context="hybrid-score"
             aria-label="Hybrid Score is calibrating — tap to learn more">
      <div class="hs-hero__head"><div class="hs-brand"><span class="hs-brand__mark">◇</span> Hybrid Score</div><div class="hs-level">${levelStr}</div></div>
      <div class="hs-hero__body">
        <div class="hs-gauge">${gauge}</div>
        <div class="hs-hero__side">
          <div class="hs-status" style="color:${color}">Calibrating</div>
          <p class="hs-calib">Log a few sessions and a wellness check-in to unlock your Hybrid Score.</p>
        </div>
      </div>
    </article>`;
  }

  const contributor = r.topContributor
    ? `<div class="hs-contrib"><span class="hs-contrib__k">Biggest lift</span><span class="hs-contrib__v">${esc(r.topContributor.label)} <b style="color:var(--color-green)">+${r.topContributor.points}</b></span></div>`
    : '';

  const actionRow = showAction
    ? `<div class="hs-action">
      <span class="hs-action__k">Today</span>
      <span class="hs-action__v">${esc(r.recommendation)}</span>
      <span class="hs-action__chev">›</span>
    </div>`
    : '';

  return `
  <article class="hs-hero${showAction ? '' : ' hs-hero--noaction'}" role="button" tabindex="0" style="--hs-accent:${color}"
           data-action="open-analytics" data-context="hybrid-score"
           aria-label="Hybrid Score ${r.score}, ${esc(r.band.status)} — tap for the full breakdown">
    <div class="hs-hero__head">
      <div class="hs-brand"><span class="hs-brand__mark">◇</span> Hybrid Score</div>
      <div class="hs-level">${levelStr}</div>
    </div>
    <div class="hs-hero__body">
      <div class="hs-gauge">${gauge}<div class="hs-status" style="color:${color}">${esc(r.band.status)}</div></div>
      <div class="hs-hero__side">
        <div class="hs-chips">${deltaChip(r.delta)} ${momentumChip(r.momentum)}</div>
        <div class="hs-confidence" title="How much of the model your data currently covers">
          <div class="hs-confidence__row"><span>Confidence</span><span>${r.confidence}%</span></div>
          <div class="hs-confidence__track"><div class="hs-confidence__fill" style="width:${r.confidence}%"></div></div>
        </div>
        ${contributor}
      </div>
    </div>
    ${actionRow}
  </article>`;
}

// ---- INSIGHTS DETAIL -------------------------------------------------------
function driverRow(d) {
  const up = d.points > 0;
  return `<li class="hs-driver hs-driver--${d.tone}">
    <span class="hs-driver__pts" style="color:${up ? 'var(--color-green)' : 'var(--color-red)'}">${up ? '+' : ''}${d.points}</span>
    <span class="hs-driver__label">${esc(d.label)}</span>
  </li>`;
}

function pillarBar(key, p) {
  const meta = PILLAR_META[key];
  if (!p || p.score == null) {
    return `<div class="hs-pillar hs-pillar--empty"><span class="hs-pillar__label">${meta.icon} ${meta.label}</span><span class="hs-pillar__na">No data</span></div>`;
  }
  const contrib = p.contribution || 0;
  const chip = contrib === 0 ? '±0' : `${contrib > 0 ? '+' : ''}${contrib}`;
  const chipColor = contrib > 0 ? 'var(--color-green)' : contrib < 0 ? 'var(--color-red)' : 'var(--text-muted)';
  return `
  <div class="hs-pillar">
    <div class="hs-pillar__top">
      <span class="hs-pillar__label">${meta.icon} ${meta.label}</span>
      <span class="hs-pillar__score">${p.score}<span class="hs-pillar__chip" style="color:${chipColor}">${chip}</span></span>
    </div>
    <div class="hs-pillar__track"><div class="hs-pillar__fill" style="width:${p.score}%;background:${meta.color}"></div></div>
    ${p.signals?.[0] ? `<div class="hs-pillar__sig">${esc(p.signals[0])}</div>` : ''}
  </div>`;
}

export function sparkline(values, color) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values, 100), min = Math.min(...values, 0);
  const span = max - min || 1;
  const w = 100, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`).join(' ');
  return `<svg class="hs-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function detailHTML(r, state) {
  const color = r.band.color;
  if (!r.hasData) {
    return `<div class="hs-detail">
      <div class="hs-detail__hero">${gaugeSVG(r.score, color, 150)}<div class="hs-status" style="color:${color}">Calibrating</div></div>
      <p class="hs-calib center">${esc(r.recommendation)}</p>
    </div>`;
  }

  const lvl = r.level;
  const levelBar = lvl?.next
    ? `<div class="hs-levelbar">
         <div class="hs-levelbar__row"><span>${lvl.icon} ${esc(lvl.name)}</span><span>${esc(lvl.next.name)}</span></div>
         <div class="hs-levelbar__track"><div class="hs-levelbar__fill" style="width:${lvl.progressPct}%"></div></div>
         <div class="hs-levelbar__hint">${lvl.next.xpToGo} XP to ${esc(lvl.next.name)}</div>
       </div>`
    : `<div class="hs-levelbar__hint center">${lvl ? esc(lvl.name) + ' — top tier reached' : ''}</div>`;

  const drivers = r.drivers.slice(0, 6).map(driverRow).join('');
  const pillarKeys = ['consistency', 'recovery', 'strength', 'endurance', 'load', 'momentum', 'body', 'lifestyle'];
  const pillars = pillarKeys.map(k => pillarBar(k, r.pillars[k])).join('');

  const daily = dailySeries(state, 30);
  const weekly = bucketedTrend(state, 'week').slice(-8);
  const weeklyBars = weekly.map(b => `<div class="hs-wk"><div class="hs-wk__bar" style="height:${b.avg}%;background:${color}"></div><span class="hs-wk__lbl">${esc(b.label)}</span></div>`).join('');

  // E7 — "why it changed": the pillars that moved the score since yesterday.
  const whyChanged = (r.delta != null && Array.isArray(r.deltaBreakdown) && r.deltaBreakdown.length)
    ? `<article class="card-dark p-3 mb-3">
         <div class="hs-why__head">
           <span class="hs-why__k">Since yesterday</span>
           <span class="hs-why__total ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}">${r.delta > 0 ? '+' : ''}${r.delta}</span>
         </div>
         <ul class="hs-why">${r.deltaBreakdown.slice(0, 5).map(d => `
           <li class="hs-why__row">
             <span class="hs-why__pts" style="color:${d.delta > 0 ? 'var(--color-green)' : 'var(--color-red)'}">${d.delta > 0 ? '+' : ''}${d.delta}</span>
             <span class="hs-why__label">${esc(d.label)} ${d.delta > 0 ? 'improved' : 'slipped'}</span>
           </li>`).join('')}</ul>
       </article>`
    : '';

  return `
  <div class="hs-detail">
    <div class="hs-detail__hero">
      ${gaugeSVG(r.score, color, 150)}
      <div class="hs-detail__meta">
        <div class="hs-status" style="color:${color}">${esc(r.band.status)}</div>
        <div class="hs-chips">${deltaChip(r.delta)} ${momentumChip(r.momentum)}</div>
        <div class="hs-confidence__row muted">Confidence ${r.confidence}% · based on the data you've logged</div>
      </div>
    </div>

    ${whyChanged}
    ${levelBar}

    <div class="hs-action hs-action--detail">
      <span class="hs-action__k">Do this next</span>
      <span class="hs-action__v">${esc(r.recommendation)}</span>
    </div>

    <h3 class="section-header">Why your score is ${r.score} today</h3>
    <ul class="hs-drivers">${drivers || '<li class="hs-driver hs-driver--neutral">Balanced day — no single factor dominated.</li>'}</ul>

    <h3 class="section-header mt-4">The eight pillars</h3>
    <div class="hs-pillars">${pillars}</div>

    ${daily.length >= 2 ? `<h3 class="section-header mt-4">Trend</h3>
    <article class="card-dark p-3">
      <div class="hs-trend__label">Last ${daily.length} days</div>
      ${sparkline(daily, color)}
      ${weekly.length >= 2 ? `<div class="hs-weekly">${weeklyBars}</div>` : ''}
    </article>` : ''}
  </div>`;
}
