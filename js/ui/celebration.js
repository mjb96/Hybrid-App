// @ts-check
// =============================================================================
// CELEBRATION — premium milestone moments (js/ui/celebration.js)
//
// One shared overlay for the app's earned moments: a PR, a streak milestone,
// a Hybrid level-up, the first 90+ score. Deliberately restrained: dark glass
// card, a short confetti burst in the app's palette, one haptic — no sounds,
// no mascots. Self-contained (injects its own styles once); honours
// prefers-reduced-motion by skipping particles and animation.
//
// API:
//   celebrate({ icon, title, subtitle })  — queued full overlay moment
//   confettiBurst()                       — burst only (e.g. over the recap)
// =============================================================================
import { hapticSuccess } from '../haptics.js';

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#f8fafc', '#8b5cf6'];
const AUTO_DISMISS_MS = 3600;

let _stylesInjected = false;
let _active = false;
/** @type {{icon:string,title:string,subtitle:string}[]} */
let _queue = [];

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

function ensureStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'celebrationStyles';
  s.textContent = `
  .celebration-overlay {
    position: fixed; inset: 0; z-index: 4000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(5, 8, 16, 0.62);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
    opacity: 0; transition: opacity .25s ease;
  }
  .celebration-overlay.celebration--in { opacity: 1; }
  .celebration-card {
    max-width: 320px; margin: 0 20px; padding: 28px 26px 24px;
    text-align: center; border-radius: 24px;
    background: linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03));
    border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
    transform: scale(.92); transition: transform .3s cubic-bezier(.34,1.4,.64,1);
  }
  .celebration--in .celebration-card { transform: scale(1); }
  .celebration-icon { font-size: 44px; line-height: 1; margin-bottom: 12px; color: #f59e0b; }
  .celebration-title { font-size: 1.25rem; font-weight: 800; letter-spacing: -0.3px; color: var(--text-inverse, #f8fafc); margin-bottom: 6px; }
  .celebration-sub { font-size: .82rem; color: var(--text-muted, #94a3b8); line-height: 1.45; }
  .celebration-hint { font-size: .62rem; color: rgba(255,255,255,0.35); margin-top: 16px; text-transform: uppercase; letter-spacing: .08em; }
  .celebration-canvas { position: fixed; inset: 0; z-index: 4001; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) {
    .celebration-overlay, .celebration-card { transition: none !important; transform: none !important; }
  }`;
  document.head.appendChild(s);
}

// Short physics confetti burst on a throwaway canvas. No-op under
// reduced-motion or where canvas is unavailable.
export function confettiBurst({ particleCount = 90, durationMs = 1700 } = {}) {
  if (typeof document === 'undefined' || reducedMotion()) return;
  ensureStyles();
  const canvas = document.createElement('canvas');
  canvas.className = 'celebration-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.width = Math.floor(innerWidth * dpr);
  const H = canvas.height = Math.floor(innerHeight * dpr);

  const parts = Array.from({ length: particleCount }, () => {
    const angle = (-90 + (Math.random() * 120 - 60)) * Math.PI / 180; // upward fan
    const speed = (7 + Math.random() * 9) * dpr;
    return {
      x: W / 2 + (Math.random() * 80 - 40) * dpr,
      y: H * 0.42,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: (4 + Math.random() * 5) * dpr,
      h: (7 + Math.random() * 7) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  });

  const started = performance.now();
  function frame(now) {
    const t = now - started;
    ctx.clearRect(0, 0, W, H);
    const fade = Math.max(0, 1 - t / durationMs);
    for (const p of parts) {
      p.vy += 0.32 * dpr;          // gravity
      p.vx *= 0.992;               // drag
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < durationMs) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

function showNext() {
  const next = _queue.shift();
  if (!next) { _active = false; return; }
  _active = true;

  ensureStyles();
  const overlay = document.createElement('div');
  overlay.className = 'celebration-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', next.title);
  overlay.innerHTML = `
    <div class="celebration-card">
      <div class="celebration-icon">${next.icon}</div>
      <div class="celebration-title">${next.title}</div>
      <div class="celebration-sub">${next.subtitle}</div>
      <div class="celebration-hint">Tap to continue</div>
    </div>`;
  document.body.appendChild(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('celebration--in');
    setTimeout(() => { overlay.remove(); showNext(); }, reducedMotion() ? 0 : 260);
  };
  overlay.addEventListener('click', close);
  setTimeout(close, AUTO_DISMISS_MS);

  requestAnimationFrame(() => overlay.classList.add('celebration--in'));
  hapticSuccess();
  confettiBurst();
}

// Queued so simultaneous milestones (e.g. level-up + streak) play in sequence
// rather than stacking. Text is app-generated only — never user input.
export function celebrate({ icon = '🎉', title = '', subtitle = '' } = {}) {
  if (typeof document === 'undefined' || !title) return;
  _queue.push({ icon, title, subtitle });
  if (!_active) showNext();
}

// Map a Hybrid Score milestone (from recordDailyScore) to a celebration.
export function celebrateMilestone(m) {
  if (!m) return;
  if (m.kind === 'level') {
    celebrate({ icon: m.icon || '◆', title: `${m.name} unlocked`, subtitle: `You've reached Hybrid Level ${m.tier}. Keep building.` });
  } else if (m.kind === 'streak') {
    celebrate({ icon: '🔥', title: `${m.days}-day streak`, subtitle: 'Consistency compounds — this is how athletes are built.' });
  } else if (m.kind === 'score') {
    celebrate({ icon: '◇', title: `Hybrid Score ${m.score}`, subtitle: 'Your first Elite-range score. Recovery, load and progress — all firing.' });
  }
}
