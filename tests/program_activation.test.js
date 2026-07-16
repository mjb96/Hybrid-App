// ==========================================
// PROGRAM ACTIVATION TESTS (tests/program_activation.test.js)
//
// Covers the safe-activation logic that replaced the silent one-tap program
// swap: the pure buildActivationPlan() summary/impact/start-week computation and
// the activateProgramWithConfirm() orchestrator (confirm → apply, cancel → no
// apply, missing program → onError). The confirmation dialog's DOM is verified
// separately by the real-browser screenshot in the session log.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildActivationPlan, buildResumePlan,
  activateProgramWithConfirm, resumeActivationWithConfirm,
} from '../js/programs/activation.js';

const PROGRAMS = {
  hybridhq_foundations: { name: 'Helyx Foundations', durationWeeks: 12, sessionsPerWeek: 5, difficulty: 'intermediate', category: 'hybrid' },
  sub20_5k_hybrid:      { name: 'Sub-20 5K Hybrid Engine', durationWeeks: 9, sessionsPerWeek: 6, difficulty: 'advanced', category: 'hybrid' },
  sparse_prog:          { name: 'Sparse Program' }, // no weeks/days/difficulty/category
};
const deps = {
  resolveProgram: (id) => PROGRAMS[id] || null,
  resolveName: (id) => PROGRAMS[id]?.name,
};

// ---- buildActivationPlan: modes --------------------------------------------

test('first activation (no current program) reads as "Start", no replace warning', () => {
  const plan = buildActivationPlan({ activeProgramId: null, currentWeek: '1' }, 'hybridhq_foundations', deps);
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'first');
  assert.match(plan.title, /^Start Helyx Foundations\?$/);
  assert.equal(plan.impact.some(i => /Replaces/.test(i.text)), false);
  assert.equal(plan.impact.some(i => /history and completed weeks are kept/.test(i.text)), true);
});

test('switching from another program names the program being replaced', () => {
  const plan = buildActivationPlan({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '3' }, 'hybridhq_foundations', deps);
  assert.equal(plan.mode, 'switch');
  assert.match(plan.title, /^Switch to Helyx Foundations\?$/);
  const replace = plan.impact.find(i => i.tone === 'warn' && /Replaces/.test(i.text));
  assert.ok(replace, 'a replace warning exists');
  assert.match(replace.text, /Sub-20 5K Hybrid Engine/);
});

test('reactivating the current program reads as "Restart"', () => {
  const plan = buildActivationPlan({ activeProgramId: 'hybridhq_foundations', currentWeek: '4' }, 'hybridhq_foundations', deps);
  assert.equal(plan.mode, 'restart');
  assert.match(plan.title, /^Restart Helyx Foundations\?$/);
});

// ---- Natural-language summary + missing-metadata fallbacks -----------------

test('summary is natural language derived from real metadata', () => {
  const plan = buildActivationPlan({ activeProgramId: null }, 'hybridhq_foundations', deps);
  assert.equal(plan.summary.join(' · '), '12-week hybrid block · 5 days/week · Intermediate');
});

test('missing metadata never renders "undefined", "0", or "NaN"', () => {
  const plan = buildActivationPlan({ activeProgramId: null }, 'sparse_prog', deps);
  const blob = JSON.stringify(plan);
  assert.equal(/undefined|NaN/.test(blob), false);
  assert.equal(plan.summary.some(s => /\b0\b/.test(s)), false);
  assert.equal(plan.weeks, null);
  assert.equal(plan.daysPerWeek, null);
  // Still a usable plan with a title + the history-kept reassurance.
  assert.match(plan.title, /Sparse Program/);
  assert.equal(plan.startWeekChoices[0].label, 'Start at Week 1');
});

// ---- Start-week choices ----------------------------------------------------

test('start-week default is Week 1; "Keep Week N" offered only when switching mid-program', () => {
  const fresh = buildActivationPlan({ activeProgramId: null, currentWeek: '5' }, 'hybridhq_foundations', deps);
  assert.deepEqual(fresh.startWeekChoices.map(c => c.week), [1]);      // first activation → Week 1 only

  const switchMid = buildActivationPlan({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '5' }, 'hybridhq_foundations', deps);
  assert.deepEqual(switchMid.startWeekChoices.map(c => c.week), [1, 5]);
  assert.equal(switchMid.startWeekChoices[0].primary, true);
  assert.match(switchMid.startWeekChoices[1].label, /Keep Week 5/);

  const switchWeek1 = buildActivationPlan({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '1' }, 'hybridhq_foundations', deps);
  assert.deepEqual(switchWeek1.startWeekChoices.map(c => c.week), [1]); // no "keep week 1"
});

// ---- In-progress workout guard ---------------------------------------------

test('an in-progress workout requires an explicit save or discard choice', () => {
  const plan = buildActivationPlan({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '2' }, 'hybridhq_foundations',
    { ...deps, workoutStatus: { unresolved: true, hasDraft: true, timerActive: false } });
  assert.equal(plan.workoutInProgress, true);
  assert.equal(plan.requiresWorkoutResolution, true);
  assert.ok(plan.impact.some(i => i.tone === 'warn' && /saved or discarded/i.test(i.text)));
  assert.ok(plan.startWeekChoices.length >= 1, 'activation is still offered');
});

test('resume plan names the prior program and restores its last week', () => {
  const state = {
    activeProgramId: 'sub20_5k_hybrid', activeActivationId: 'act_new', currentWeek: '2',
    activations: [{ id: 'act_old', programId: 'hybridhq_foundations', startWeek: 1, lastWeek: 5 }],
  };
  const plan = buildResumePlan(state, 'act_old', deps);
  assert.equal(plan.ok, true);
  assert.equal(plan.mode, 'resume');
  assert.match(plan.title, /^Resume Helyx Foundations\?$/);
  assert.equal(plan.defaultStartWeek, 5);
  assert.deepEqual(plan.startWeekChoices.map((choice) => choice.week), [5]);
  assert.ok(plan.impact.some((item) => /original logged weeks/.test(item.text)));
});

// ---- No raw internal IDs surface -------------------------------------------

test('no raw program id leaks into any user-facing string', () => {
  const plan = buildActivationPlan({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '3' }, 'hybridhq_foundations', deps);
  const faces = [plan.title, ...plan.summary, ...plan.impact.map(i => i.text), ...plan.startWeekChoices.map(c => c.label)].join(' | ');
  assert.equal(faces.includes('hybridhq_foundations'), false);
  assert.equal(faces.includes('sub20_5k_hybrid'), false);
});

// ---- unknown program -------------------------------------------------------

test('an unknown program id yields an un-ok plan', () => {
  const plan = buildActivationPlan({ activeProgramId: null }, 'does_not_exist', deps);
  assert.equal(plan.ok, false);
});

// ---- Orchestrator: confirm → apply -----------------------------------------

test('activateProgramWithConfirm applies with the chosen start week on confirm', async () => {
  let applied = null;
  const ok = await activateProgramWithConfirm({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '4' }, 'hybridhq_foundations', {
    ...deps,
    confirm: async () => ({ activate: true, startWeek: 4 }),
    apply: (id, wk) => { applied = { id, wk }; },
  });
  assert.equal(ok, true);
  assert.deepEqual(applied, { id: 'hybridhq_foundations', wk: 4 });
});

test('activation resolves a current workout before applying the switch', async () => {
  const events = [];
  const ok = await activateProgramWithConfirm({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '4' }, 'hybridhq_foundations', {
    ...deps,
    workoutStatus: () => ({ unresolved: true, hasDraft: true }),
    confirm: async () => ({ activate: true, startWeek: 1, sessionAction: 'save' }),
    resolveWorkout: async (action) => { events.push(`resolve:${action}`); return true; },
    apply: () => { events.push('apply'); },
  });
  assert.equal(ok, true);
  assert.deepEqual(events, ['resolve:save', 'apply']);
});

test('activation is blocked if an unresolved workout has no resolution action', async () => {
  let applied = false;
  const ok = await activateProgramWithConfirm({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '4' }, 'hybridhq_foundations', {
    ...deps,
    workoutStatus: () => ({ unresolved: true, hasDraft: true }),
    confirm: async () => ({ activate: true, startWeek: 1 }),
    resolveWorkout: async () => true,
    apply: () => { applied = true; },
  });
  assert.equal(ok, false);
  assert.equal(applied, false);
});

test('failed discard cannot activate a new program', async () => {
  let applied = false;
  const ok = await activateProgramWithConfirm({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '4' }, 'hybridhq_foundations', {
    ...deps,
    workoutStatus: () => ({ unresolved: true, hasDraft: true }),
    confirm: async () => ({ activate: true, startWeek: 1, sessionAction: 'discard' }),
    resolveWorkout: async () => false,
    apply: () => { applied = true; },
  });
  assert.equal(ok, false);
  assert.equal(applied, false);
});

test('resume resolves the workout before restoring the previous activation', async () => {
  const state = {
    activeProgramId: 'sub20_5k_hybrid', activeActivationId: 'act_new', currentWeek: '2',
    activations: [{ id: 'act_old', programId: 'hybridhq_foundations', startWeek: 1, lastWeek: 5 }],
  };
  const events = [];
  const ok = await resumeActivationWithConfirm(state, 'act_old', {
    ...deps,
    workoutStatus: () => ({ unresolved: true, timerActive: true }),
    confirm: async () => ({ activate: true, startWeek: 5, sessionAction: 'save' }),
    resolveWorkout: async (action) => { events.push(`resolve:${action}`); return true; },
    apply: async (id) => { events.push(`resume:${id}`); return true; },
  });
  assert.equal(ok, true);
  assert.deepEqual(events, ['resolve:save', 'resume:act_old']);
});

test('activateProgramWithConfirm does NOT apply when cancelled', async () => {
  let applied = false;
  const ok = await activateProgramWithConfirm({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '4' }, 'hybridhq_foundations', {
    ...deps,
    confirm: async () => ({ activate: false, startWeek: 1 }),
    apply: () => { applied = true; },
  });
  assert.equal(ok, false);
  assert.equal(applied, false, 'the active program is never silently replaced');
});

test('activateProgramWithConfirm reports an error and does not apply for a missing program', async () => {
  let applied = false, errored = null;
  const ok = await activateProgramWithConfirm({ activeProgramId: null }, 'ghost', {
    ...deps,
    confirm: async () => ({ activate: true, startWeek: 1 }),
    apply: () => { applied = true; },
    onError: (m) => { errored = m; },
  });
  assert.equal(ok, false);
  assert.equal(applied, false);
  assert.ok(errored && /could not be found/i.test(errored));
});

test('workoutInProgress deps callback is consulted for the plan', async () => {
  let consulted = false;
  await activateProgramWithConfirm({ activeProgramId: 'sub20_5k_hybrid', currentWeek: '2' }, 'hybridhq_foundations', {
    ...deps,
    workoutInProgress: () => { consulted = true; return true; },
    confirm: async (plan) => {
      assert.equal(plan.workoutInProgress, true);
      return { activate: false, startWeek: 1 };
    },
    apply: () => {},
  });
  assert.equal(consulted, true);
});
