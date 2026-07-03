// @ts-check
// =============================================================================
// HYBRID SCORE — SHAREABLE CARD (js/brain/hybrid-score/share-card.js)
//
// V2-5 — the one shareable thing. Renders the Hybrid Score card's visual
// language (gauge + number + level + the 3 dials + streak) to a 1080×1350 canvas
// and shares it via the Web Share API (files), falling back to a PNG download —
// the same pattern as the athlete profile card. A weekly variant rides on the
// same builder with a "This week" banner + the week's focus line.
//
// Presentation module (touches canvas + navigator) — not part of the pure engine.
// The number itself comes from the real computeHybridScore result the caller
// already holds, so the shared card can never disagree with the app.
// =============================================================================
import { computeDials } from './dials.js';
import { scoreBand } from './config.js';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const DIAL_COLOR = { train: '#3b82f6', recover: '#10b981', progress: '#f59e0b' };

// Pure share caption (also the Web Share `text`). Exported for testing.
export function shareCaption(result, state, opts = {}) {
  const name = (state?.settings?.name || '').trim();
  const who = name ? `${name} · ` : '';
  if (!result || result.score == null) return `${who}Hybrid Score — calibrating on Helyx`;
  const lvl = result.level ? ` · ${result.level.name}` : '';
  const scope = opts.variant === 'weekly' ? ' this week' : '';
  return `${who}Hybrid Score ${result.score}${scope} — ${result.band?.status || ''}${lvl} on Helyx`.trim();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Draw the whole card onto a provided 2D context sized W×H. Pure drawing (no
// share) so it can be reused by the weekly variant and, in future, previews.
export function drawScoreCard(ctx, W, H, result, state, opts = {}) {
  const color = (result.band && result.band.color) || scoreBand(result.score).color;
  const name = (state?.settings?.name || '').trim() || 'Athlete';
  const streak = state?.streakData?.current || 0;
  const weekly = opts.variant === 'weekly';

  // Background + accent glow tinted by the band colour.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0612'); bg.addColorStop(0.5, '#120a24'); bg.addColorStop(1, '#05060f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 470, 0, W / 2, 470, 680);
  glow.addColorStop(0, hexA(color, 0.30)); glow.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';

  // Brand + scope banner
  ctx.fillStyle = 'rgba(226,232,240,0.92)';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText('◇ HYBRID SCORE', W / 2, 120);
  if (weekly && opts.weekLabel) {
    ctx.fillStyle = hexA(color, 0.9); ctx.font = `700 30px ${FONT}`;
    ctx.fillText(opts.weekLabel.toUpperCase(), W / 2, 168);
  }

  // Gauge — background ring + score-proportional arc.
  const cx = W / 2, cy = 470, R = 200, lw = 34;
  const pct = Math.max(0, Math.min(100, result.score == null ? 0 : result.score)) / 100;
  ctx.lineWidth = lw; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  if (result.score != null) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.stroke();
  }
  // Number + /100 + status
  ctx.fillStyle = '#f8fafc'; ctx.font = `800 180px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(result.score == null ? '· ·' : String(result.score), cx, cy - 10);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#8b97a8'; ctx.font = `700 40px ${FONT}`;
  ctx.fillText('/ 100', cx, cy + 96);
  ctx.fillStyle = color; ctx.font = `800 44px ${FONT}`;
  ctx.fillText((result.band?.status || '').toUpperCase(), cx, cy + 250);

  // Level chip
  if (result.level) {
    ctx.fillStyle = '#f59e0b'; ctx.font = `700 32px ${FONT}`;
    ctx.fillText(`${result.level.icon} LV ${result.level.tier} · ${String(result.level.name).toUpperCase()}`, W / 2, cy + 316);
  }

  // 3 dials
  const dials = computeDials(result);
  const dy = 900, tw = 300, gap = 24;
  const totalW = dials.length * tw + (dials.length - 1) * gap;
  let sx = W / 2 - totalW / 2;
  dials.forEach(d => {
    const c = DIAL_COLOR[d.id] || '#94a3b8';
    const x = sx, w = tw;
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; roundRect(ctx, x, dy, w, 190, 24); ctx.fill();
    ctx.strokeStyle = hexA(c, 0.34); ctx.lineWidth = 2; roundRect(ctx, x, dy, w, 190, 24); ctx.stroke();
    ctx.fillStyle = c; ctx.font = `800 68px ${FONT}`;
    ctx.fillText(d.score == null ? '· ·' : String(d.score), x + w / 2, dy + 84);
    ctx.fillStyle = '#cbd5e1'; ctx.font = `700 24px ${FONT}`;
    ctx.fillText(d.label, x + w / 2, dy + 128);
    // mini bar
    const bw = w - 80, bx = x + 40, by = dy + 150, val = d.score == null ? 0 : d.score;
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; roundRect(ctx, bx, by, bw, 10, 5); ctx.fill();
    ctx.fillStyle = c; roundRect(ctx, bx, by, bw * val / 100, 10, 5); ctx.fill();
    sx += tw + gap;
  });

  // Divider + footer (name · streak)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(120, 1200); ctx.lineTo(W - 120, 1200); ctx.stroke();
  const footer = streak > 0 ? `${name} · 🔥 ${streak}-day streak` : `${name} · ⚡ Helyx`;
  ctx.fillStyle = '#94a3b8'; ctx.font = `700 32px ${FONT}`;
  ctx.fillText(footer, W / 2, 1268);
}

// hex (#rrggbb) → rgba string with alpha; passes through non-hex (e.g. rgba()).
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Render + share the card. `result` is a computeHybridScore result the caller
 * already holds. variant='weekly' + weekLabel tune the weekly ride-along;
 * showToast is injected to avoid a hard import.
 * @param {any} result
 * @param {any} state
 * @param {{showToast?:Function, variant?:string, weekLabel?:string}} [opts]
 */
export function shareHybridScoreCard(result, state, { showToast, variant, weekLabel } = {}) {
  const toast = showToast || (() => {});
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  const W = 1080, H = 1350;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) { toast('Sharing not supported on this device'); return; }

  drawScoreCard(ctx, W, H, result, state, { variant, weekLabel });

  const caption = shareCaption(result, state, { variant });
  const fname = variant === 'weekly' ? 'helyx-week.png' : 'helyx-score.png';
  const finish = (blob) => {
    const file = blob && typeof File !== 'undefined' ? new File([blob], fname, { type: 'image/png' }) : null;
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'My Hybrid Score', text: caption }).catch(() => {});
    } else {
      try {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = fname;
        a.click();
        toast('Score card saved');
      } catch (_) { toast('Could not create the card'); }
    }
  };
  if (canvas.toBlob) canvas.toBlob(finish, 'image/png'); else finish(null);
}
