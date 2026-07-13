// ==========================================
// PROGRAM SESSION ISOLATION (tests/program_isolation.test.js)
//
// Proves the fix for the cross-program leak: after switching programs, a previous
// program's COMPLETED exercises must never appear in the new program's active
// workout. The root cause was that logged training was keyed only by program-week
// number + weekday, so Program A "Week 1 / Monday" and Program B "Week 1 / Monday"
// shared one storage slot and the new program inherited the old one's DONE rows.
//
// The fix gives every program run a stable ACTIVATION IDENTITY. A switch/restart
// begins a new activation and archives the previous run's weeks (kept for history
// & analytics, cleared from the live program-week slots). These tests exercise the
// state-layer switch path (startProgramActivation + reseedActiveProgramIntoWeek) —
// exactly what applyProgramSwitch() calls — plus the pure helpers and migration.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  setAppState, appState,
  verifyWeekStorageSchema, reseedActiveProgramIntoWeek, startProgramActivation,
} from '../js/state.js';
import {
  newActivationId, isArchivedWeekKey, weekHasLoggedData, archiveForeignWeeks,
} from '../js/state/activation-identity.js';
import { migrateState } from '../js/state/migrations.js';
import { indexSlotsByDate } from '../js/analytics/weekly-aggregate.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
}

// ---- fixtures (mirror the reported screenshot) ------------------------------

// Program A: the PREVIOUS program whose completed lifts leaked.
const progA = {
  id: 'progA', name: 'Old Split', totalWeeks: 4,
  days: {
    mon: {
      title: 'Pull', desc: '', runs: 'Rest',
      lifts: ['Deadlift', 'Pull-Ups', 'Face Pull', 'Hammer Curl', 'Rear Delt Fly', 'Chest Supported Row'],
    },
  },
  weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: 'A' } },
};

// Program B: the NEW program (from the screenshot's top-of-list prescription).
const progB = {
  id: 'progB', name: 'New Block', totalWeeks: 6,
  days: {
    mon: {
      title: 'Legs', desc: '', runs: 'Rest',
      lifts: ['Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Weighted Sit-Up'],
    },
  },
  weeklyVolModifiers: { '1': { sets: 4, reps: 8, intensityLabel: 'B' } },
};

// A program that SHARES a lift with B (Deadlift-family) for previous-performance tests.
const progC = {
  id: 'progC', name: 'Shared', totalWeeks: 4,
  days: { mon: { title: 'Pull', desc: '', runs: 'Rest', lifts: ['Romanian Deadlift'] } },
  weeklyVolModifiers: { '1': { sets: 5, reps: 5, intensityLabel: 'C' } },
};

const done = (w, r) => ({ w, r, c: true });

function freshState(activeId) {
  return {
    activeProgramId: activeId,
    customPrograms: [structuredClone(progA), structuredClone(progB), structuredClone(progC)],
    settings: {},
    weeks: {},
    currentWeek: '1',
    weekStartedAt: new Date().toISOString(),
    schemaVersion: 3,
  };
}

// Log Program A's six exercises as completed sets on Week 1 / Monday, dated.
function logProgramAMonday(date = '2026-07-05') {
  verifyWeekStorageSchema('1');
  const mon = appState.weeks['1'].lifts.mon;
  mon['Deadlift']            = [done(120, 5), done(120, 5), done(120, 5)];
  mon['Pull-Ups']           = [done(86.1, 5), done(86.1, 5), done(86.1, 5), done(86.1, 5)];
  mon['Face Pull']          = [done(20, 20), done(20, 20), done(20, 20)];
  mon['Hammer Curl']        = [done(12.5, 12), done(12.5, 12), done(12.5, 12)];
  mon['Rear Delt Fly']      = [done(5, 15), done(5, 15), done(5, 15)];
  mon['Chest Supported Row'] = [done(40, 10), done(40, 10), done(40, 10)];
  appState.weeks['1'].liftOrder.mon = Object.keys(mon);
  appState.weeks['1'].dates.mon = date;
}

// The real switch path, mirroring applyProgramSwitch().
function switchProgram(newId, startWeek = 1) {
  appState.activeProgramId = newId;
  appState.currentWeek = String(startWeek);
  appState.weekStartedAt = new Date().toISOString();
  startProgramActivation(newId, startWeek);
  reseedActiveProgramIntoWeek(String(startWeek));
}

const PROG_A_LIFTS = ['Deadlift', 'Pull-Ups', 'Face Pull', 'Hammer Curl', 'Rear Delt Fly', 'Chest Supported Row'];
const PROG_B_LIFTS = ['Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Weighted Sit-Up'];

// ---- SCREENSHOT-SPECIFIC REGRESSION -----------------------------------------

test('SCREENSHOT: after switching programs, the new workout contains ONLY the new prescription', () => {
  setAppState(freshState('progA'));
  logProgramAMonday();

  switchProgram('progB', 1);

  const mon = appState.weeks['1'].lifts.mon;
  const names = Object.keys(mon);

  // Only Program B's four prescribed exercises are in the ACTIVE session model.
  assert.deepEqual(names.sort(), [...PROG_B_LIFTS].sort(),
    'active workout must be exactly Program B — no leaked Program A rows');
  for (const leaked of PROG_A_LIFTS) {
    assert.ok(!(leaked in mon), `Program A exercise "${leaked}" must not appear in Program B's workout`);
  }

  // None of the new program's exercises start DONE.
  for (const lift of PROG_B_LIFTS) {
    assert.ok(Array.isArray(mon[lift]), `${lift} seeded`);
    assert.ok(mon[lift].every(s => !s.c), `${lift} begins uncompleted`);
  }
});

test('SCREENSHOT: Program A history is preserved (archived) and still counts in analytics', () => {
  setAppState(freshState('progA'));
  logProgramAMonday('2026-07-05');
  switchProgram('progB', 1);

  // The six completed lifts survive under an archive key, dates intact.
  const archKeys = Object.keys(appState.weeks).filter(isArchivedWeekKey);
  assert.equal(archKeys.length, 1, 'exactly one archived week for the old run');
  const archived = appState.weeks[archKeys[0]];
  assert.equal(archived.dates.mon, '2026-07-05', 'archived date preserved');
  assert.equal(archived.lifts.mon['Deadlift'][0].w, 120, 'archived logged weight preserved');
  assert.equal(archived.lifts.mon['Pull-Ups'].length, 4, 'archived set counts preserved');

  // The canonical calendar-analytics index still attributes that session by date.
  const { byDate } = indexSlotsByDate(appState);
  const slot = byDate.get('2026-07-05');
  assert.ok(slot, 'archived session is indexed by its real date');
  assert.ok(slot.stats.workingSets >= 19, 'all completed working sets still counted');
  assert.ok(slot.lifts['Deadlift'], 'Deadlift session available to history/analytics');
});

// ---- CORE ISOLATION ---------------------------------------------------------

test('Program A Week 3 → Program B Week 1: no leak (every day clean)', () => {
  setAppState(freshState('progA'));
  appState.currentWeek = '3';
  logProgramAMonday();                       // logs into week 1 slot
  verifyWeekStorageSchema('3');              // A also materialised week 3
  switchProgram('progB', 1);
  const mon = appState.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(mon).sort(), [...PROG_B_LIFTS].sort());
});

test('restarting the SAME program begins a clean run (no prior completions)', () => {
  setAppState(freshState('progA'));
  logProgramAMonday();
  const beforeAct = appState.activeActivationId;

  switchProgram('progA', 1);                 // restart A

  assert.notEqual(appState.activeActivationId, beforeAct, 'restart mints a new activation');
  const mon = appState.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(mon).sort(), [...PROG_A_LIFTS].sort(), 'A prescribed again');
  for (const lift of PROG_A_LIFTS) {
    assert.ok(mon[lift].every(s => !s.c), `${lift} starts uncompleted in the new run`);
  }
  // Old run's completions are archived, not live.
  assert.ok(Object.keys(appState.weeks).some(isArchivedWeekKey), 'previous run archived');
});

test('a shared exercise starts fresh but its history is retrievable', () => {
  setAppState(freshState('progB'));
  // Log Romanian Deadlift under Program B run #1.
  verifyWeekStorageSchema('1');
  appState.weeks['1'].lifts.mon['Romanian Deadlift'] = [done(150, 5), done(150, 5)];
  appState.weeks['1'].dates.mon = '2026-07-01';

  // Switch to Program C which ALSO has Romanian Deadlift.
  switchProgram('progC', 1);

  const cur = appState.weeks['1'].lifts.mon['Romanian Deadlift'];
  assert.ok(cur.every(s => !s.c), 'shared lift begins uncompleted in the new program');

  // Previous performance still discoverable via the date index.
  const { byDate } = indexSlotsByDate(appState);
  const prior = byDate.get('2026-07-01');
  assert.ok(prior && prior.lifts['Romanian Deadlift'], 'prior Romanian Deadlift session still available');
  assert.equal(prior.lifts['Romanian Deadlift'][0].w, 150, 'prior weight intact');
});

test('new-program adherence starts at zero; old run stays historical', () => {
  setAppState(freshState('progA'));
  logProgramAMonday();
  switchProgram('progB', 1);
  // No completed sets in any LIVE (numeric) week of the new run.
  let liveCompleted = 0;
  for (const k of Object.keys(appState.weeks)) {
    if (isArchivedWeekKey(k)) continue;
    const lifts = appState.weeks[k].lifts || {};
    for (const d in lifts) for (const l in lifts[d]) {
      if (Array.isArray(lifts[d][l])) liveCompleted += lifts[d][l].filter(s => s.c).length;
    }
  }
  assert.equal(liveCompleted, 0, 'the new run has zero completed sets');
});

// ---- IMMUTABILITY / SHARED REFERENCES ---------------------------------------

test('the new program does not share set-array references with the archived run', () => {
  setAppState(freshState('progA'));
  logProgramAMonday();
  const archivedDeadlift = appState.weeks['1'].lifts.mon['Deadlift'];
  switchProgram('progB', 1);

  const liveArrays = new Set();
  const mon = appState.weeks['1'].lifts.mon;
  for (const l of Object.keys(mon)) liveArrays.add(mon[l]);
  assert.ok(!liveArrays.has(archivedDeadlift), 'no live array is the same reference as an archived one');

  // Mutating the new run must not change archived history.
  mon['Romanian Deadlift'][0].w = 999;
  const archKey = Object.keys(appState.weeks).find(isArchivedWeekKey);
  assert.equal(appState.weeks[archKey].lifts.mon['Deadlift'][0].w, 120, 'archived data untouched by live edits');
});

test('program definitions are never mutated by a switch', () => {
  const frozenA = structuredClone(progA);
  setAppState(freshState('progA'));
  logProgramAMonday();
  switchProgram('progB', 1);
  assert.deepEqual(appState.customPrograms.find(p => p.id === 'progA').days, frozenA.days,
    'Program A blueprint unchanged');
});

// ---- PERSISTENCE / RELOAD ---------------------------------------------------

test('isolation survives a reload (JSON round-trip)', () => {
  setAppState(freshState('progA'));
  logProgramAMonday();
  switchProgram('progB', 1);

  const reloaded = JSON.parse(JSON.stringify(appState));
  const mon = reloaded.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(mon).sort(), [...PROG_B_LIFTS].sort(), 'no leak after reload');
  assert.ok(Object.keys(reloaded.weeks).some(isArchivedWeekKey), 'archive persists across reload');
});

// ---- PURE HELPERS -----------------------------------------------------------

test('newActivationId is unique and shaped', () => {
  const a = newActivationId(), b = newActivationId();
  assert.notEqual(a, b);
  assert.match(a, /^act_/);
});

test('weekHasLoggedData distinguishes history from scaffolding', () => {
  assert.equal(weekHasLoggedData({ lifts: { mon: { Squat: [{ w: '', r: '', c: false }] } } }), false);
  assert.equal(weekHasLoggedData({ lifts: { mon: { Squat: [{ w: 100, r: 5, c: true }] } } }), true);
  assert.equal(weekHasLoggedData({ runs: { tue: { dist: 5, time: '25:00' } } }), true);
  assert.equal(weekHasLoggedData({}), false);
});

test('archiveForeignWeeks keeps owned weeks, archives logged foreign, drops empty foreign', () => {
  const state = {
    activeActivationId: 'act_new',
    weeks: {
      '1': { activationId: 'act_new', lifts: {}, dates: {} },                          // owned → keep
      '2': { activationId: 'act_old', lifts: { mon: { Squat: [done(100, 5)] } }, dates: { mon: '2026-06-01' } }, // logged foreign → archive
      '3': { activationId: 'act_old', lifts: { mon: { Squat: [{ w: '', r: '', c: false }] } }, dates: {} },       // empty foreign → drop
    },
  };
  const res = archiveForeignWeeks(state);
  assert.ok(state.weeks['1'], 'owned week 1 stays live');
  assert.ok(!state.weeks['2'], 'foreign week 2 vacated from numeric slot');
  assert.ok(!state.weeks['3'], 'foreign empty week 3 dropped');
  assert.equal(res.archived.length, 1);
  assert.equal(res.dropped.length, 1);
  assert.equal(state.weeks[res.archived[0]].lifts.mon['Squat'][0].w, 100, 'archived history intact');
});

// ---- MIGRATION --------------------------------------------------------------

test('v3 migration adopts legacy weeks into one activation without leaking', () => {
  const legacy = {
    schemaVersion: 2,
    activeProgramId: 'progA',
    currentWeek: '1',
    weeks: { '1': { lifts: { mon: { Deadlift: [done(120, 5)] } }, dates: { mon: '2026-05-01' } } },
  };
  migrateState(legacy);
  assert.ok(legacy.activeActivationId, 'legacy state gets an activation id');
  assert.equal(legacy.weeks['1'].activationId, legacy.activeActivationId, 'existing week adopted by it');
  // Same-owner: a re-render does not archive today's data.
  assert.ok(!Object.keys(legacy.weeks).some(isArchivedWeekKey), 'nothing archived on adoption');
  assert.equal(legacy.weeks['1'].lifts.mon['Deadlift'][0].w, 120, 'legacy data preserved in place');
});

test('v3 migration is idempotent', () => {
  const s = { schemaVersion: 2, activeProgramId: 'progA', currentWeek: '1', weeks: {} };
  migrateState(s);
  const firstId = s.activeActivationId;
  s.schemaVersion = 2;                        // pretend to re-run only v3
  migrateState(s);
  assert.equal(s.activeActivationId, firstId, 're-running does not mint a new activation');
});
