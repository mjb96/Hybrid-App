// @ts-check
// Canonical session completion semantics shared by workout UI and coaching.
import { liftTarget } from '../engine.js';
import { getWeekModifier } from '../schema.js';
import { isCompletedSet, isWarmupSet } from '../set-utils.js';
import { runSessionsForDay } from '../state/run-sessions.js';

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

function plannedWorkingSets(program, week, blueprint) {
  if (!Array.isArray(blueprint?.lifts)) return 0;
  const modifier = getWeekModifier(program, week);
  return blueprint.lifts.reduce((total, lift) => {
    const target = liftTarget(blueprint.desc, lift, modifier);
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
      if (isCompletedSet(set)) complete++;
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
 *  anyLogged:boolean, modified:boolean, label:string,
 *  planned:{gym:boolean,run:boolean,sets:number,components:number},
 *  actual:{sets:number,materializedSets:number,run:boolean,components:number},
 *  progressLabel:string
 * }}
 */
export function evaluateSessionCompletion(state, program, week, day) {
  const weekKey = String(week || state?.currentWeek || '1');
  const weekData = state?.weeks?.[weekKey] || {};
  const blueprint = program?.days?.[day] || null;
  const plan = classifyPlannedSession(blueprint);
  const expectedSets = plan.hasGym ? plannedWorkingSets(program, weekKey, blueprint) : 0;
  const working = currentWorkingSets(weekData.lifts?.[day]);
  const run = runWasLogged(weekData, day);

  const gymComplete = !plan.hasGym || (expectedSets > 0 && working.complete >= expectedSets);
  const runComplete = !plan.hasRun || run;
  const anyLogged = working.complete > 0 || run;
  const complete = !plan.isRest && anyLogged && gymComplete && runComplete;
  const partial = !complete && !plan.isRest && anyLogged;
  const plannedComponents = Number(plan.hasGym) + Number(plan.hasRun);
  const actualComponents = Number(plan.hasGym && gymComplete) + Number(plan.hasRun && runComplete);
  const blueprintNames = new Set(blueprint?.lifts || []);
  const loggedNames = Object.entries(weekData.lifts?.[day] || {})
    .filter(([, sets]) => Array.isArray(sets) && sets.some(isCompletedSet))
    .map(([name]) => name);
  const modified = plan.hasGym && (
    working.total !== expectedSets || loggedNames.some((name) => !blueprintNames.has(name))
  );

  const outcome = plan.isRest ? 'rest' : complete ? 'complete' : partial ? 'partial' : 'empty';
  const bits = [];
  if (plan.hasGym) bits.push(`${Math.min(working.complete, expectedSets)} of ${expectedSets} planned sets`);
  if (plan.hasRun) bits.push(run ? 'run logged' : 'run not logged');
  return {
    outcome, complete, partial, anyLogged, modified, label: plan.label,
    planned: { gym: plan.hasGym, run: plan.hasRun, sets: expectedSets, components: plannedComponents },
    actual: { sets: working.complete, materializedSets: working.total, run, components: actualComponents },
    progressLabel: bits.join(' · ') || 'No planned training',
  };
}

export function completionPresentation(result) {
  if (result?.complete) {
    return {
      title: 'Session complete',
      body: 'All planned work is logged. Review the details before returning home.',
      action: 'Complete Session & Return Home',
      emitsRecap: true,
    };
  }
  if (result?.partial) {
    return {
      title: 'Save partial session?',
      body: 'Your logged work stays in history, but this session will not be marked complete.',
      action: 'Save Partial & Return Home',
      emitsRecap: false,
    };
  }
  return {
    title: 'No training logged yet',
    body: 'Nothing will be marked complete. You can return home or cancel and keep logging.',
    action: 'Return Home',
    emitsRecap: false,
  };
}
