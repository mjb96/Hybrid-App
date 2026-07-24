// @ts-check
// Canonical session completion semantics shared by workout UI and coaching.
import { liftTarget } from '../engine.js';
import { getWeekModifier } from '../schema.js';
import { isCompletedSet, isWarmupSet, isValidWorkingSet } from '../set-utils.js';
import { runSessionsForDay } from '../state/run-sessions.js';
import { explicitSessionStatus, SESSION_STATUS } from './session-status.js';
import { activeSessionLiftNames } from '../workout-order.js';

function scheduledRun(blueprint) {
  const text = String(blueprint?.runs || '').trim().toLowerCase();
  if (!text) return false;
  return !(
    text === 'rest' || text.includes('no running') || text.includes('no structured')
    || text.includes('no run')
  );
}

export function classifyPlannedSession(blueprint) {
  const hasGym = Array.isArray(blueprint?.lifts) && blueprint.lifts.length > 0;
  const hasRun = scheduledRun(blueprint);
  return {
    hasGym,
    hasRun,
    isRest: !hasGym && !hasRun,
    label: hasGym && hasRun ? 'Hybrid Session'
      : hasGym ? 'Gym Session'
      : hasRun ? 'Run Day'
      : 'Rest Day',
  };
}

function plannedWorkingSets(program, week, blueprint, dayKey) {
  if (!Array.isArray(blueprint?.lifts)) return 0;
  const modifier = getWeekModifier(program, week);
  return blueprint.lifts.reduce((total, lift) => {
    const target = liftTarget(blueprint.desc, lift, modifier, { program, week, dayKey });
    const sets = Number(target?.sets);
    return total + (Number.isFinite(sets) && sets > 0 ? Math.floor(sets) : 0);
  }, 0);
}

function currentWorkingSets(dayLifts) {
  let total = 0;
  let complete = 0;
  for (const sets of Object.values(dayLifts || {})) {
    if (!Array.isArray(sets)) continue;
    for (const set of sets) {
      if (isWarmupSet(set)) continue;
      total++;
      if (isValidWorkingSet(set)) complete++;
    }
  }
  return { total, complete };
}

function runWasLogged(weekData, day) {
  return runSessionsForDay(weekData, day).some((run) => {
    const distance = parseFloat(run?.dist) || 0;
    const time = String(run?.time || '').trim();
    return distance > 0 || /\d/.test(time);
  });
}

/**
 * @returns {{
 *  outcome:'rest'|'empty'|'partial'|'complete', complete:boolean, partial:boolean,
 *  componentOutcome:null|'strength-complete'|'run-complete',
 *  anyLogged:boolean, modified:boolean, finished:boolean, sessionStatus:'in_progress'|'finished', label:string,
 *  planned:{gym:boolean,run:boolean,sets:number,components:number},
 *  actual:{sets:number,materializedSets:number,run:boolean,components:number},
 *  progressLabel:string
 * }}
 */
export function evaluateSessionCompletion(state, program, week, day) {
  const weekKey = String(week || state?.currentWeek || '1');
  const weekData = state?.weeks?.[weekKey] || {};
  if (weekData.sessionId && (weekData.sessionKind === 'empty' || weekData.sessionKind === 'copy')) {
    const working = currentWorkingSets(weekData.lifts?.[day]);
    const anyLogged = working.complete > 0;
    const complete = anyLogged && working.total > 0 && working.complete >= working.total;
    const explicit = explicitSessionStatus(weekData, day);
    const legacyFinished = anyLogged && (complete || !!String(weekData.gymStats?.[day]?.time || '').trim());
    const finished = explicit === SESSION_STATUS.FINISHED || (!explicit && legacyFinished);
    return {
      outcome: complete ? 'complete' : anyLogged ? 'partial' : 'empty',
      complete,
      partial: anyLogged && !complete,
      componentOutcome: null,
      anyLogged,
      modified: false, finished,
      sessionStatus: finished ? SESSION_STATUS.FINISHED : SESSION_STATUS.IN_PROGRESS,
      label: 'Strength Workout',
      planned: { gym: true, run: false, sets: working.total, components: 1 },
      actual: { sets: working.complete, materializedSets: working.total, run: false, components: Number(complete) },
      progressLabel: working.total ? `${working.complete} of ${working.total} sets logged` : 'Add an exercise to begin',
    };
  }
  const blueprint = program?.days?.[day] || null;
  const plan = classifyPlannedSession(blueprint);
  const expectedSets = plan.hasGym ? plannedWorkingSets(program, weekKey, blueprint, day) : 0;
  const allDayLifts = weekData.lifts?.[day] || {};
  const activeNames = activeSessionLiftNames(weekData, day, blueprint);
  const activeDayLifts = Object.fromEntries(activeNames.map((name) => [name, allDayLifts[name]]));
  const working = currentWorkingSets(activeDayLifts);
  const run = runWasLogged(weekData, day);

  const gymComplete = !plan.hasGym || (expectedSets > 0 && working.complete >= expectedSets);
  const runComplete = !plan.hasRun || run;
  const anyLogged = working.complete > 0 || run;
  const complete = !plan.isRest && anyLogged && gymComplete && runComplete;
  const partial = !complete && !plan.isRest && anyLogged;
  // Component adherence is retained for the summary; lifecycle is decided only
  // when the athlete explicitly finishes the workout.
  const componentOutcome = !complete && plan.hasGym && plan.hasRun
    ? gymComplete && !runComplete ? 'strength-complete'
      : runComplete && !gymComplete ? 'run-complete'
      : null
    : null;
  const plannedComponents = Number(plan.hasGym) + Number(plan.hasRun);
  const actualComponents = Number(plan.hasGym && gymComplete) + Number(plan.hasRun && runComplete);
  const blueprintNames = new Set(blueprint?.lifts || []);
  const loggedNames = Object.entries(activeDayLifts)
    .filter(([, sets]) => Array.isArray(sets) && sets.some(isValidWorkingSet))
    .map(([name]) => name);
  const modified = plan.hasGym && (
    working.total !== expectedSets || loggedNames.some((name) => !blueprintNames.has(name))
  );

  const outcome = plan.isRest ? 'rest' : complete ? 'complete' : partial ? 'partial' : 'empty';
  const explicit = explicitSessionStatus(weekData, day);
  const savedDuration = !!String(weekData.gymStats?.[day]?.time || '').trim();
  const legacyFinished = anyLogged && (complete || savedDuration);
  const finished = explicit === SESSION_STATUS.FINISHED || (!explicit && legacyFinished);
  const bits = [];
  if (plan.hasGym) bits.push(gymComplete && componentOutcome === 'strength-complete'
    ? 'Strength complete'
    : `${Math.min(working.complete, expectedSets)} of ${expectedSets} planned sets`);
  if (plan.hasRun) bits.push(run ? 'run logged' : 'run not logged');
  return {
    outcome, complete, partial, componentOutcome, anyLogged, modified, finished, label: plan.label,
    sessionStatus: finished ? SESSION_STATUS.FINISHED : SESSION_STATUS.IN_PROGRESS,
    planned: { gym: plan.hasGym, run: plan.hasRun, sets: expectedSets, components: plannedComponents },
    actual: { sets: working.complete, materializedSets: working.total, run, components: actualComponents },
    progressLabel: bits.join(' · ') || 'No planned training',
  };
}

export function completionPresentation(result) {
  if (result?.anyLogged) {
    return {
      title: 'Finish workout?',
      body: 'Your completed sets will be saved. Any exercises or sets you did not complete will be treated as skipped.',
      action: 'Finish Workout',
      emitsRecap: true,
    };
  }
  return {
    title: 'No working sets recorded',
    body: 'Complete at least one working set, or discard this workout. Warm-ups and blank rows are not saved as training volume.',
    action: null,
    emitsRecap: false,
  };
}
