// @ts-check
// =============================================================================
// DAY VERDICT (js/brain/day-verdict.js)
//
// The day's single disposition, computed ONCE from the shared dashboard model
// and consumed by every surface that narrates today — the morning briefing, the
// cockpit header, the forward projection, the recovery flag slot, and the
// analytics insight lines. Before this, each surface re-derived "should I train
// / rest / back off today?" independently, so on one deload rest day the app
// could say "rest well", "train and it rises to 86", "push it today" and offer
// "Apply deload" all at once. One verdict, quoted everywhere, is what "one
// coach" means mechanically.
//
// Pure: a function of (model, state, program, selectedDay). No DOM, no state.
// =============================================================================
import { resolveProgramPhase } from '../programs/phase.js';

/**
 * @param {any} model     shared dashboard model (carries .rec + .ready)
 * @param {any} state     appState
 * @param {any} program   the active program (for its week label)
 * @param {string} [selectedDay]
 * @returns {{
 *   mode: 'done'|'rest'|'deload'|'recover'|'train',
 *   isDeloadWeek: boolean, isRestDay: boolean, sessionDone: boolean,
 *   readiness: number|null, readinessLabel: string|null,
 *   canProjectGain: boolean, weekLabel: string
 * }}
 */
export function dayVerdict(model, state, program, selectedDay) {
  const rec = model?.rec || {};
  const wk = String(state?.currentWeek || '1');
  const phase = resolveProgramPhase(program, wk, state);
  const weekLabel = phase.label;
  const isDeloadWeek = phase.isDeload;

  const label = rec.sessionLabel || 'Rest Day';
  const isRestDay = label === 'Rest Day';
  const sessionDone = rec.badge === 'Session Done';

  const readiness = model?.ready?.hasData ? model.ready.score : null;
  const readinessLabel = model?.ready?.hasData ? (model.ready.status || null) : null;

  /** @type {'done'|'rest'|'deload'|'recover'|'train'} */
  let mode;
  if (sessionDone) mode = 'done';
  else if (isRestDay) mode = 'rest';
  else if (isDeloadWeek) mode = 'deload';
  else if (readiness != null && readiness < 40) mode = 'recover';
  else mode = 'train';

  // "Train today and your score rises" is only honest on a day that still has
  // trainable work — never on a rest day or once today's session is logged.
  // (Deload training days still count: doing the lighter session lifts the score.)
  const canProjectGain = !isRestDay && !sessionDone;

  return { mode, isDeloadWeek, isRestDay, sessionDone, readiness, readinessLabel, canProjectGain, weekLabel };
}

/**
 * Is the athlete's CURRENT program week a deload? A light standalone check for
 * surfaces (analytics Overviews) that only need the week disposition, without
 * building the whole dashboard model.
 * @param {any} state @param {any} program
 */
export function isProgramDeloadWeek(state, program) {
  const wk = String(state?.currentWeek || '1');
  return resolveProgramPhase(program, wk, state).isDeload;
}
