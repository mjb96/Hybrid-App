// @ts-check
// =============================================================================
// HYBRID SCORE — FORWARD PROJECTION (js/brain/hybrid-score/project.js)
//
// V2-3, the morning hook. "Your score is 78 — it rises to 85 if you train
// today." Instead of inventing that number we simulate the single most
// controllable act (completing today's planned session) through the REAL engine:
// clone the dashboard model with one more planned session marked done — which
// lifts this week's adherence and extends the streak — and re-run
// computeHybridScore. The projected score is therefore the actual score the
// athlete would see tomorrow, not a motivational fiction; when there's nothing
// left to complete (rest day / week already done) it honestly projects no gain.
//
// Pure: a function of (model, state, days). No persistence, no DOM.
// =============================================================================
import { computeHybridScore } from './hybrid-score.js';

/**
 * @param {any} model  shared dashboard model (carries .week + .streak + .load)
 * @param {any} state  appState
 * @param {any} days   logged-days array
 * @param {{completeToday?:boolean}} [opts]
 * @returns {{ current:any, projected:any, gain:number, canProject:boolean }}
 */
export function projectScore(model, state, days, opts = {}) {
  const { completeToday = true } = opts;
  const current = computeHybridScore(model, state, days);

  const w = (model && model.week) || {};
  const total = w.consistencyTotal || 0;
  const done = w.consistencyDone || 0;
  const hasSessionToDo = completeToday && total > 0 && done < total;

  // Nothing to simulate (calibrating, or no open planned session today).
  if (!current.hasData || !hasSessionToDo) {
    return { current, projected: current, gain: 0, canProject: false };
  }

  const nextDone = done + 1;
  const projModel = {
    ...model,
    week: { ...w, consistencyDone: nextDone, consistencyPct: Math.round((nextDone / total) * 100) },
    streak: { ...(model.streak || {}), current: (model.streak?.current || 0) + 1 },
    load: model.load ? { ...model.load } : model.load,
  };

  const projected = computeHybridScore(projModel, state, days);
  const gain = (projected.score ?? 0) - (current.score ?? 0);
  return { current, projected, gain: Math.max(0, gain), canProject: gain > 0 };
}

/**
 * One forward-looking sentence for the morning push / card. Decisive, no
 * mechanism-quoting — just the number and the lever. Returns '' when there's no
 * honest gain to promise (so callers can fall back to their normal line).
 * @param {{ current:any, projected:any, gain:number, canProject:boolean }} p
 */
export function projectionLine(p) {
  if (!p || !p.canProject || p.gain < 1) return '';
  return `${p.current.score} today — train and it rises to ${p.projected.score}.`;
}
