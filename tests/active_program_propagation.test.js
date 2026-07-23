// ==========================================
// ACTIVE-PROGRAM PROPAGATION
// Editing the ACTIVE personal program must update future (untouched) workout
// prescriptions while leaving started/completed sessions as immutable history.
// Future prescriptions resolve through the stable program ID + the reconcile
// reseed of untouched numeric weeks — never a stale embedded snapshot.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';

const mem = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}

// Static named imports are LIVE bindings, so `appState` tracks setAppState's
// reassignment (a destructured dynamic import would freeze the initial value).
import { setAppState, appState, getProgramById, reconcileActiveProgramEdits, saveStateToLocalStorage, STORAGE_KEY } from '../js/state.js';

function activeProgramState() {
  return {
    schemaVersion: 5,
    activeProgramId: 'prog_active',
    activeActivationId: 'act1',
    currentWeek: '1',
    settings: { bandWeights: { L: 10, M: 20, H: 30 } },
    exerciseStats: {},
    bodyWeightLog: [{ weight: 80 }],
    customPrograms: [{
      id: 'prog_active', name: 'My Active Plan', totalWeeks: 4,
      isPrimaryCustomization: true, sourceProgramId: 'stronglifts_5x5',
      days: {
        mon: { title: 'Upper', runs: 'Rest', lifts: ['Bench Press', 'Barbell Row'] },
        tue: { title: 'Rest', runs: 'Rest', lifts: [] },
        wed: { title: 'Rest', runs: 'Rest', lifts: [] },
        thu: { title: 'Rest', runs: 'Rest', lifts: [] },
        fri: { title: 'Rest', runs: 'Rest', lifts: [] },
        sat: { title: 'Rest', runs: 'Rest', lifts: [] },
        sun: { title: 'Rest', runs: 'Rest', lifts: [] },
      },
      weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: '' }, '2': { sets: 3, reps: 5, intensityLabel: '' } },
    }],
    weeks: {
      // Week 1 Monday: a COMPLETED session (logged working sets + finished).
      '1': {
        activationId: 'act1',
        sessionStatus: { mon: 'finished' },
        dates: { mon: '2026-07-20' },
        lifts: { mon: { 'Bench Press': [{ w: '80', r: '5', c: true }], 'Barbell Row': [{ w: '60', r: '5', c: true }] } },
        liftOrder: { mon: ['Bench Press', 'Barbell Row'] },
        runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {},
      },
      // Week 2 Monday: untouched future scaffolding (old blueprint, no logs).
      '2': {
        activationId: 'act1',
        lifts: { mon: { 'Bench Press': [{ w: '', r: '', c: false }] } },
        liftOrder: { mon: ['Bench Press'] },
        runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, dates: {}, liftMeta: {},
      },
    },
  };
}

test('editing the active program reseeds FUTURE untouched workouts with the new exercises', () => {
  setAppState(activeProgramState());

  // Edit in place (same stable id) — swap Bench for Dumbbell Bench + add Face Pull.
  getProgramById('prog_active').days.mon.lifts = ['Dumbbell Bench Press', 'Face Pull'];
  reconcileActiveProgramEdits('prog_active');

  // Week 2 (untouched) now prescribes the edited exercises.
  assert.deepEqual(
    appState.weeks['2'].liftOrder.mon,
    ['Dumbbell Bench Press', 'Face Pull'],
    'future untouched week picks up the new prescription',
  );
  assert.deepEqual(
    Object.keys(appState.weeks['2'].lifts.mon),
    ['Dumbbell Bench Press', 'Face Pull'],
    'stale Bench Press scaffolding is replaced in the future week',
  );
});

test('a completed session is immutable history — the edit never rewrites it', () => {
  setAppState(activeProgramState());
  const before = JSON.stringify(appState.weeks['1'].lifts.mon);

  getProgramById('prog_active').days.mon.lifts = ['Dumbbell Bench Press', 'Face Pull'];
  reconcileActiveProgramEdits('prog_active');

  assert.equal(JSON.stringify(appState.weeks['1'].lifts.mon), before,
    'completed Week 1 exercises/sets/weights/reps are untouched');
  assert.deepEqual(appState.weeks['1'].lifts.mon['Bench Press'], [{ w: '80', r: '5', c: true }],
    'the logged working set is preserved verbatim');
  assert.equal(appState.weeks['1'].sessionStatus.mon, 'finished', 'completion status preserved');
});

test('an in-progress session started BEFORE the edit is preserved, not reseeded', () => {
  const state = activeProgramState();
  // Week 2 Monday is now an in-progress session (started before the edit).
  state.weeks['2'].sessionStatus = { mon: 'in_progress' };
  state.weeks['2'].lifts.mon = { 'Bench Press': [{ w: '82.5', r: '5', c: true }] };
  setAppState(state);

  getProgramById('prog_active').days.mon.lifts = ['Dumbbell Bench Press', 'Face Pull'];
  reconcileActiveProgramEdits('prog_active');

  assert.deepEqual(appState.weeks['2'].lifts.mon, { 'Bench Press': [{ w: '82.5', r: '5', c: true }] },
    'the in-progress session keeps its own snapshot until the user explicitly refreshes it');
});

test('the edited prescription survives a storage reload (hydration)', () => {
  setAppState(activeProgramState());
  getProgramById('prog_active').days.mon.lifts = ['Dumbbell Bench Press', 'Face Pull'];
  reconcileActiveProgramEdits('prog_active');
  saveStateToLocalStorage(true);

  const raw = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY));
  const prog = raw.customPrograms.find(p => p.id === 'prog_active');
  assert.deepEqual(prog.days.mon.lifts, ['Dumbbell Bench Press', 'Face Pull'], 'definition persisted');
  assert.deepEqual(raw.weeks['2'].liftOrder.mon, ['Dumbbell Bench Press', 'Face Pull'], 'reseeded future week persisted');
  assert.deepEqual(raw.weeks['1'].lifts.mon['Bench Press'], [{ w: '80', r: '5', c: true }], 'completed history persisted unchanged');
});

test('future prescriptions resolve through the stable program ID, not a copy', () => {
  setAppState(activeProgramState());
  // The active program id never changes on edit; getProgramById returns the same
  // live record every reader uses.
  const a = getProgramById('prog_active');
  a.days.mon.lifts = ['Dumbbell Bench Press', 'Face Pull'];
  const b = getProgramById('prog_active');
  assert.strictEqual(a, b, 'one canonical record instance');
  assert.deepEqual(b.days.mon.lifts, ['Dumbbell Bench Press', 'Face Pull'], 'edit visible to every reader immediately');
});
