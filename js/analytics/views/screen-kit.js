// @ts-check
// =============================================================================
// V2 ANALYTICS SCREEN KIT (analytics/views/screen-kit.js)
//
// The shared pieces every rebuilt analytics screen (Strength / Running /
// Recovery & Load / Review) uses, so the "simple front, powerful behind"
// pattern comes from one source: the Overview | Stats tab bar, a data-scaled
// headline sparkline, and small helpers.
// =============================================================================

export const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Overview | Stats pill bar. Each screen re-renders itself on switch (see
// mountScreenTabs), so the buttons carry a generic `data-an-tab` marker.
export function screenTabBar(active) {
  const tab = (id, label) =>
    `<button class="an-tab ${active === id ? 'an-tab--active' : ''}" data-an-tab="${id}">${label}</button>`;
  return `<div class="an-tabbar">${tab('overview', 'Overview')}${tab('stats', 'Stats')}</div>`;
}

// Wire the tab buttons inside a section to a switch handler (self-contained —
// no global action-router changes).
export function mountScreenTabs(sectionId, onSwitch) {
  document.getElementById(sectionId)?.querySelectorAll('[data-an-tab]').forEach(btn => {
    btn.addEventListener('click', () => onSwitch(btn.getAttribute('data-an-tab')));
  });
}

// A sparkline scaled to its own data's min/max (works for kg, km, VDOT — unlike
// the score gauge's fixed 0–100 spark). Zeros drop to the baseline.
export function spark(values, color) {
  const nz = (values || []).filter(v => v > 0);
  if (nz.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...nz), span = (max - min) || 1;
  const w = 100, h = 30;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = v > 0 ? h - ((v - min) / span) * h : h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="an-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
