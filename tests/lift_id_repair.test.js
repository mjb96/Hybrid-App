// ==========================================
// LIFT-IDENTITY LEAK REPAIR TESTS (tests/lift_id_repair.test.js)
//
// Regression coverage for the "phantom lift_* rows" bug: the removed lift
// identity subsystem left workout sets keyed by generated ids (`lift_<base36>`)
// that the render path surfaced verbatim as exercise names ("DONE · 5 sets ·
// top 120 kg"). The v1 → v2 migration (js/state/migrations.js) renames those id
// keys back to real exercise names — recovered from the persisted
// liftNames/liftIdMap resolver maps — merging with any name-keyed prescription
// without losing logged history, and falling back to an honest label rather
// than the raw id (or a silent delete) when the id can't be resolved.
//
// Also covers the render-time guard (isInternalLiftId / UNKNOWN_LIFT_NAME) that
// prevents an un-migrated id (e.g. from an old device's cloud blob) from ever
// being shown as a name.
//
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrateState, CURRENT_SCHEMA_VERSION } from '../js/state/migrations.js';
import { isInternalLiftId, UNKNOWN_LIFT_NAME } from '../js/state/lift-id.js';
import { _setErrorHook } from '../js/monitoring/report-error.js';

// A completed working set, and a blank prescribed row, for building fixtures.
const done = (w, r) => ({ w: String(w), r: String(r), c: true });
const blank = () => ({ w: '', r: '', c: false });

// Build a realistic screenshot-shaped state: today's four prescribed lifts are
// name-keyed and unlogged, while several completed instances survive under the
// old `lift_*` ids, resolvable via liftNames.
function screenshotState() {
  return {
    schemaVersion: 1,
    currentWeek: '4',
    exerciseStats: {},
    liftNames: {
      lift_76dsje3t: 'Romanian Deadlift',
      lift_f62ge8z4: 'Dumbbell Bulgarian Split Squat',
      lift_jukqtifa: 'Dumbbell Calf Raise',
      lift_t9ac5n07: 'Weighted Sit-Up',
    },
    liftIdMap: {
      'Romanian Deadlift': 'lift_76dsje3t',
      'Dumbbell Bulgarian Split Squat': 'lift_f62ge8z4',
      'Dumbbell Calf Raise': 'lift_jukqtifa',
      'Weighted Sit-Up': 'lift_t9ac5n07',
    },
    weeks: {
      '4': {
        lifts: {
          mon: {
            // Four legitimate upcoming (freshly re-seeded, unlogged) exercises…
            'Romanian Deadlift': [blank(), blank(), blank()],
            'Dumbbell Bulgarian Split Squat': [blank(), blank(), blank()],
            'Dumbbell Calf Raise': [blank(), blank(), blank()],
            'Weighted Sit-Up': [blank(), blank(), blank()],
            // …plus the leaked completed id-keyed instances from the D8 era.
            lift_76dsje3t: [done(120, 5), done(120, 5), done(120, 5), done(120, 5), done(120, 5)],
            lift_f62ge8z4: [done(0, 12), done(0, 12), done(0, 12), done(0, 12)],
            lift_jukqtifa: [done(0, 15), done(0, 15), done(0, 15)],
            lift_t9ac5n07: [done(12.5, 12), done(12.5, 12), done(12.5, 12)],
          },
        },
        liftOrder: {
          mon: ['Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Weighted Sit-Up'],
        },
        liftMeta: { mon: {} },
      },
    },
  };
}

// ---- isInternalLiftId predicate ---------------------------------------------

test('isInternalLiftId matches only the generated lift_<base36> shape', () => {
  assert.equal(isInternalLiftId('lift_76dsje3t'), true);
  assert.equal(isInternalLiftId('lift_f62ge8z4'), true);
  assert.equal(isInternalLiftId('lift_abcd'), true);          // 4-char minimum
  // Genuine exercise names — including unusual custom ones — must never match.
  assert.equal(isInternalLiftId('Romanian Deadlift'), false);
  assert.equal(isInternalLiftId('Zercher Squat'), false);
  assert.equal(isInternalLiftId('lift_'), false);             // no suffix
  assert.equal(isInternalLiftId('lift_ABCDEF'), false);       // uppercase → not the shape
  assert.equal(isInternalLiftId('deadlift_variation'), false);
  assert.equal(isInternalLiftId(null), false);
  assert.equal(isInternalLiftId(42), false);
});

// ---- 6. Exercise-instance ids never rendered/stored as names -----------------

test('no lift_* id survives as a key after migration', () => {
  const state = screenshotState();
  migrateState(state);
  const keys = Object.keys(state.weeks['4'].lifts.mon);
  assert.equal(keys.some(isInternalLiftId), false, 'every internal id key must be renamed');
});

// ---- Screenshot scenario: leaked instances resolve, legit exercises remain ---

test('screenshot scenario: four legit exercises, leaked completed instances merged in by real name', () => {
  const state = screenshotState();
  migrateState(state);
  const day = state.weeks['4'].lifts.mon;
  const keys = Object.keys(day);

  // Exactly the four real exercises — the id-keyed completed instances merged
  // into their name-keyed prescriptions rather than rendering as phantom rows.
  assert.deepEqual(
    keys.sort(),
    ['Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Romanian Deadlift', 'Weighted Sit-Up'].sort(),
  );

  // History wins over the empty prescription: the completed sets are preserved.
  assert.equal(day['Romanian Deadlift'].length, 5);
  assert.equal(day['Romanian Deadlift'].every(s => s.c === true), true);
  assert.equal(day['Romanian Deadlift'][0].w, '120');
  assert.equal(day['Weighted Sit-Up'][0].w, '12.5');
});

// ---- 7. Historical sets not inserted into the active exercise list -----------
// ---- 18. Previous-performance lookup remains correct -------------------------

test('previous-performance from an earlier week still resolves after repair', () => {
  const state = screenshotState();
  // Prior week logged the RDL under its id too — it should be readable by name.
  state.weeks['3'] = {
    lifts: { mon: { lift_76dsje3t: [done(115, 5), done(115, 5)] } },
    liftOrder: { mon: [] },
    liftMeta: { mon: {} },
  };
  migrateState(state);
  const prev = state.weeks['3'].lifts.mon;
  assert.equal(Object.keys(prev).some(isInternalLiftId), false);
  assert.ok(Array.isArray(prev['Romanian Deadlift']));
  assert.equal(prev['Romanian Deadlift'][0].w, '115');
});

// ---- 13. Missing exercise metadata → honest fallback (not the raw id) --------

test('an unresolvable id becomes an honest Unknown label, never the raw id, never deleted', () => {
  const state = {
    schemaVersion: 1,
    weeks: { '1': { lifts: { mon: { lift_deadbeef: [done(60, 8)] } }, liftOrder: { mon: [] }, liftMeta: { mon: {} } } },
    // No liftNames / liftIdMap available (maps were lost).
  };
  migrateState(state);
  const day = state.weeks['1'].lifts.mon;
  const keys = Object.keys(day);
  assert.equal(keys.length, 1);
  assert.equal(keys[0], UNKNOWN_LIFT_NAME);
  assert.notEqual(keys[0], 'lift_deadbeef');       // raw id never shown
  assert.equal(day[UNKNOWN_LIFT_NAME][0].w, '60'); // history preserved, not deleted
});

test('two unresolvable ids in one day get distinct honest labels (no clobber)', () => {
  const state = {
    schemaVersion: 1,
    weeks: { '1': { lifts: { mon: { lift_aaaa11: [done(50, 5)], lift_bbbb22: [done(70, 5)] } } } },
  };
  migrateState(state);
  const day = state.weeks['1'].lifts.mon;
  const keys = Object.keys(day).sort();
  assert.deepEqual(keys, [UNKNOWN_LIFT_NAME, `${UNKNOWN_LIFT_NAME} 2`]);
  const weights = keys.map(k => day[k][0].w).sort();
  assert.deepEqual(weights, ['50', '70']); // both histories survive
});

// ---- Merge rules -------------------------------------------------------------

test('empty id stub is dropped when a real prescription already exists', () => {
  const state = {
    schemaVersion: 1,
    liftNames: { lift_aaaa11: 'Bench Press' },
    weeks: { '1': { lifts: { mon: {
      'Bench Press': [blank(), blank(), blank()],
      lift_aaaa11: [blank()], // no logged data → just a leftover stub
    } } } },
  };
  migrateState(state);
  const day = state.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(day), ['Bench Press']);
  assert.equal(day['Bench Press'].length, 3); // untouched prescription
});

test('both-logged collision keeps existing name entry AND recovers id history under a distinct honest key', () => {
  const state = {
    schemaVersion: 1,
    liftNames: { lift_aaaa11: 'Bench Press' },
    weeks: { '1': { lifts: { mon: {
      'Bench Press': [done(100, 5)],   // already-logged name entry
      lift_aaaa11: [done(95, 5)],      // different logged history under the id
    } } } },
  };
  migrateState(state);
  const day = state.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(day).sort(), ['Bench Press', 'Bench Press (recovered)'].sort());
  assert.equal(day['Bench Press'][0].w, '100');             // existing preserved
  assert.equal(day['Bench Press (recovered)'][0].w, '95');  // id history not lost
});

// ---- liftOrder / liftMeta references re-pointed ------------------------------

test('liftOrder ids are re-pointed to real names and stay de-duplicated', () => {
  const state = {
    schemaVersion: 1,
    liftNames: { lift_aaaa11: 'Squat' },
    weeks: { '1': {
      lifts: { mon: { lift_aaaa11: [done(140, 3)], 'Squat': [blank()] } },
      liftOrder: { mon: ['lift_aaaa11', 'Squat'] }, // id + name both listed
      liftMeta: { mon: { lift_aaaa11: { groupId: 'A' } } },
    } },
  };
  migrateState(state);
  const wk = state.weeks['1'];
  assert.deepEqual(wk.liftOrder.mon, ['Squat']);        // single, de-duped entry
  assert.equal(wk.liftMeta.mon['Squat'].groupId, 'A');  // meta moved to the name
  assert.equal(wk.liftMeta.mon.lift_aaaa11, undefined);
});

// ---- 14/15. Legacy repair is safe + idempotent -------------------------------

test('migration is idempotent — a second run changes nothing', () => {
  const state = screenshotState();
  migrateState(state);
  const first = JSON.stringify(state.weeks);
  migrateState(state);
  assert.equal(JSON.stringify(state.weeks), first);
  assert.equal(state.schemaVersion, CURRENT_SCHEMA_VERSION);
});

// ---- 12. Genuine custom exercises are never touched --------------------------

test('a real custom exercise name is left completely untouched', () => {
  const state = {
    schemaVersion: 1,
    weeks: { '1': { lifts: { mon: { 'Zercher Squat': [done(80, 5)], 'My lift_thing': [done(40, 10)] } } } },
  };
  migrateState(state);
  const day = state.weeks['1'].lifts.mon;
  assert.deepEqual(Object.keys(day).sort(), ['My lift_thing', 'Zercher Squat']);
  assert.equal(day['Zercher Squat'][0].w, '80');
});

// ---- derived exerciseStats id keys are dropped / remapped --------------------

test('id-keyed exerciseStats are remapped to the display name and the id key removed', () => {
  const state = {
    schemaVersion: 1,
    liftNames: { lift_aaaa11: 'Deadlift' },
    exerciseStats: { lift_aaaa11: { allTimeMax: 200 } },
    weeks: {},
  };
  migrateState(state);
  assert.equal(state.exerciseStats.lift_aaaa11, undefined);
  assert.equal(state.exerciseStats['Deadlift'].allTimeMax, 200);
});

// ---- 16. Cloud/local merge does not reintroduce stale exercises --------------
// A blob already stamped at the current version is treated as clean (a migrated
// device cleaned its data before uploading), so migration is a no-op on it.

test('a blob already at the current schema version is not re-migrated', () => {
  const state = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    weeks: { '1': { lifts: { mon: { lift_aaaa11: [done(60, 8)] } } } },
  };
  migrateState(state);
  // Untouched: the version stamp asserts this device already ran the repair.
  assert.ok(state.weeks['1'].lifts.mon.lift_aaaa11);
});

// ---- 9/10. Program prescriptions / templates are never mutated ---------------
// The migration only ever reads/writes state.weeks & derived state; a caller's
// program blueprint object passed alongside is out of its reach.

test('migration touches only state, never a shared program/template object', () => {
  const program = Object.freeze({ days: Object.freeze({ mon: Object.freeze({ lifts: Object.freeze(['Squat']) }) }) });
  const state = { schemaVersion: 1, program, weeks: { '1': { lifts: { mon: { lift_aaaa11: [done(1, 1)] } } } } };
  // Would throw if the frozen program were mutated.
  assert.doesNotThrow(() => migrateState(state));
  assert.deepEqual(program.days.mon.lifts, ['Squat']);
});

// ---- Error observability -----------------------------------------------------

test('a repair is observable (summary only: counts + day count, no ids or set data)', () => {
  const seen = [];
  _setErrorHook((ctx, payload) => seen.push({ ctx, payload }));
  try {
    migrateState(screenshotState());
  } finally {
    _setErrorHook(null);
  }
  // Scope to the v2 repair report — later structural migrations (e.g. v3 activation
  // identity) legitimately emit their own summary, which this contract ignores.
  const v2 = seen.filter(s => s.ctx === 'migration:v2-lift-id-repair');
  assert.equal(v2.length, 1);
  assert.equal(v2[0].payload.repaired, 4);
  assert.equal(v2[0].payload.days, 1);
  // Never leak raw ids or set contents through telemetry.
  const json = JSON.stringify(v2[0].payload);
  assert.equal(/lift_[0-9a-z]{4,}/.test(json), false);
  assert.equal(json.includes('120'), false);
});

test('a clean state raises no repair report', () => {
  const seen = [];
  _setErrorHook((ctx) => seen.push(ctx));
  try {
    migrateState({ schemaVersion: 1, weeks: { '1': { lifts: { mon: { 'Squat': [done(100, 5)] } } } } });
  } finally {
    _setErrorHook(null);
  }
  // No lift-id REPAIR report on clean data (a v3 activation-adoption summary may
  // fire — that's structural, not a repair).
  assert.equal(seen.includes('migration:v2-lift-id-repair'), false);
});
