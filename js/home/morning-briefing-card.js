// @ts-check
// =============================================================================
// MORNING BRIEFING CARD (js/home/morning-briefing-card.js)
//
// Presenter for the daily briefing — the ONE coaching surface on Home,
// replacing the old coaching card + insight banner pair. Sits directly under
// the Hybrid Score hero, so it deliberately does NOT repeat the score number;
// it carries the narrative: greeting, today's session, the mission, and the
// coach's line. Pure HTML builder; no DOM ops.
// =============================================================================

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SEVERITY_COLOR = Object.freeze({
  positive: 'var(--color-green)',
  neutral:  'var(--color-blue)',
  caution:  'var(--color-amber)',
  warning:  'var(--color-red)',
});

export function briefingCardHTML(b) {
  if (!b) return '';
  const sev = SEVERITY_COLOR[b.coach.severity] || SEVERITY_COLOR.neutral;

  const sessionRow = !b.session.isRest
    ? `<div class="mbrief__session">
         <span class="mbrief__session-k">Today</span>
         <span class="mbrief__session-v">${esc(b.session.label)}${b.session.title ? ` — ${esc(b.session.title)}` : ''}</span>
         ${b.session.done ? '<span class="mbrief__session-done">✓</span>' : ''}
       </div>`
    : `<div class="mbrief__session">
         <span class="mbrief__session-k">Today</span>
         <span class="mbrief__session-v">Rest day${b.readinessLine ? ` · ${esc(b.readinessLine)}` : ''}</span>
       </div>`;

  // V2-3 — forward-looking hook: the upside of training today, simulated through
  // the real engine. The gauge just above already shows today's number, so the
  // card carries only the climb.
  const forwardRow = b.forward
    ? `<div class="mbrief__forward">
         <span class="mbrief__forward-icon">↑</span>
         <span class="mbrief__forward-text">Train today and your score climbs to <b>${esc(b.forward.to)}</b></span>
       </div>`
    : '';

  // V2-4 — the coach's memory: a true callback to the athlete's own history.
  const memoryRow = b.memory
    ? `<div class="mbrief__memory"><span class="mbrief__memory-icon">🧠</span><span class="mbrief__memory-text">${esc(b.memory)}</span></div>`
    : '';

  // Streak-at-stake (loss aversion) — only when a real streak is unprotected.
  const streakRow = b.streakRisk?.text
    ? `<div class="mbrief__streak mbrief__streak--${esc(b.streakRisk.tone || 'caution')}">${esc(b.streakRisk.text)}</div>`
    : '';

  const coachRow = b.coach.headline
    ? `<div class="mbrief__coach" style="--mb-sev:${sev}">
         <span class="mbrief__coach-dot"></span>
         <span class="mbrief__coach-text"><b>${esc(b.coach.headline)}</b>${b.coach.advice ? ` — ${esc(b.coach.advice)}` : ''}</span>
       </div>`
    : '';

  // The mission routes to where it gets done: session missions → the workout
  // cockpit; the rest-day check-in → the recovery-score view (where the
  // wellness check-in lives). A completed mission is inert (a static row).
  const missionInner = `
      <span class="mbrief__mission-icon">${b.mission.icon}</span>
      <span class="mbrief__mission-k">Mission</span>
      <span class="mbrief__mission-v">${esc(b.mission.text)}</span>`;
  const missionRow = b.mission.done
    ? `<div class="mbrief__mission mbrief__mission--done">${missionInner}</div>`
    : `<button class="mbrief__mission"
            data-action="${b.session.isRest ? 'open-analytics' : 'start-today-workout'}"
            ${b.session.isRest ? 'data-context="recovery-score"' : ''}
            aria-label="Today's mission: ${esc(b.mission.text)}">${missionInner}<span class="mbrief__mission-chev">›</span></button>`;

  return `
  <article class="mbrief" aria-label="Morning briefing">
    <div class="mbrief__head">
      <span class="mbrief__greet">${esc(b.greeting)}</span>
      <span class="mbrief__ctx">${esc(b.context)}</span>
    </div>
    ${sessionRow}
    ${forwardRow}
    ${missionRow}
    ${memoryRow}
    ${streakRow}
    ${coachRow}
  </article>`;
}
