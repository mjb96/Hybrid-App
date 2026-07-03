// @ts-check
// =============================================================================
// FASTING RING — pure HTML-string builder (js/fasting/fasting-ring.js)
//
// The signature fasting hero, modelled on the Hybrid Score gaugeSVG so fasting
// speaks the same premium circular-gauge language. No DOM, no side effects — the
// live ticker in fasting-card.js updates the arc/text by id afterwards.
// =============================================================================
import { fmtFastDuration, fmtHoursLabel } from '../fasting.js';

const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Arc stroke-dashoffset for a given progress %. Pure so the builder, the live
// ticker, and tests all agree on the geometry.
export function ringArcOffset(progressPct) {
  const pct = Math.max(0, Math.min(100, progressPct ?? 0));
  return CIRC * (1 - pct / 100);
}

// Build the ring SVG. `ctx` = getFastingContext(state) output. `size` in px.
export function fastingRingSVG(ctx, size = 200) {
  const pct    = Math.max(0, Math.min(100, ctx?.progressPct ?? 0));
  const offset = ringArcOffset(pct);
  const color  = ctx?.zone?.color ?? '#6b7280';
  const time   = fmtFastDuration(ctx?.hours ?? 0);
  const stage  = ctx?.zone?.name ?? 'Fed State';
  const target = `Target ${ctx?.goal ?? 16}h`;
  return `
  <svg class="fasting-ring__svg" width="${size}" height="${size}" viewBox="0 0 120 120"
       role="img" aria-label="Fasting ${esc(time)}, ${esc(stage)}">
    <circle cx="60" cy="60" r="${RADIUS}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="9"/>
    <circle class="fasting-ring__arc" id="fastingRingArc" cx="60" cy="60" r="${RADIUS}" fill="none"
            stroke="${color}" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${CIRC.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
            transform="rotate(-90 60 60)"/>
    <text x="60" y="55" text-anchor="middle" class="fasting-ring__time" id="fastingSheetTimer"
          fill="var(--text-inverse,#f8fafc)">${esc(time)}</text>
    <text x="60" y="71" text-anchor="middle" class="fasting-ring__stage" id="fastingRingStage"
          fill="${color}">${esc(stage)}</text>
    <text x="60" y="83" text-anchor="middle" class="fasting-ring__target"
          fill="var(--text-muted,#94a3b8)">${esc(target)}</text>
  </svg>`;
}

// The one-line caption under the ring: goal state while active, prompt when idle.
export function ringCaption(ctx) {
  if (ctx?.progressPct >= 100) return '🎉 Goal reached';
  if (ctx?.active) return `${fmtHoursLabel(ctx.remainingHours)} to goal`;
  return 'Ready to start';
}
