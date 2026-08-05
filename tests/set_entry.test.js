// =============================================================================
// SET ENTRY — roadmap Phase 2A.
//
// The set row is the single most-used control in the app, and until now its
// only entry rule was "is this field non-empty?". That let `-50` and `0` reps
// through. A negative weight is not a display bug: setVolume is
// parseFloat(w) * parseInt(r), so it SUBTRACTS from tonnage, weekly volume,
// muscle set credits and every landmark comparison built on top of them. One
// mistyped minus quietly corrupts the analytics the whole app is about.
//
// These tests pin both halves of the bargain: impossible values are refused,
// and merely unusual ones are not. A logger that argues with a real 120-rep set
// is a logger people stop using.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSetEntry,
  primarySetEntryMessage,
  previousSetLabel,
  SET_ENTRY_LIMITS,
} from '../js/workout/set-entry.js';

const fieldsOf = (list) => list.map((m) => m.field);
const textOf = (list) => list.map((m) => m.text).join(' | ');

// ---- the defect this module exists for --------------------------------------

test('a negative weight is refused, because it would subtract from tonnage', () => {
  const r = validateSetEntry({ weight: '-50', reps: '5' });
  assert.equal(r.ok, false);
  assert.deepEqual(fieldsOf(r.errors), ['weight']);
  assert.match(textOf(r.errors), /negative/i);
  assert.equal(r.firstErrorField, 'weight');
});

test('zero reps is refused — a completed set of no reps did not happen', () => {
  // It would also read as done in the cockpit while isValidWorkingSet drops it
  // from analytics, so the screen and the numbers would disagree.
  const r = validateSetEntry({ weight: '100', reps: '0' });
  assert.equal(r.ok, false);
  assert.deepEqual(fieldsOf(r.errors), ['reps']);
});

test('negative reps are refused too, not just zero', () => {
  assert.equal(validateSetEntry({ weight: '100', reps: '-3' }).ok, false);
});

test('fractional reps are refused', () => {
  const r = validateSetEntry({ weight: '100', reps: '5.5' });
  assert.equal(r.ok, false);
  assert.match(textOf(r.errors), /whole/i);
});

// ---- ordinary sets pass -----------------------------------------------------

test('a normal set validates cleanly', () => {
  const r = validateSetEntry({ weight: '100', reps: '5' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.firstErrorField, null);
});

test('a fractional weight is fine — plates are not whole numbers', () => {
  assert.equal(validateSetEntry({ weight: '102.5', reps: '3' }).ok, true);
});

test('zero weight is allowed — full band assistance resolves to exactly 0', () => {
  // applyLoadMode clamps assisted load with Math.max(0, mass - assistance), so
  // 0 is a value the app itself writes. Refusing it would refuse its own output.
  assert.equal(validateSetEntry({ weight: '0', reps: '8' }).ok, true);
});

// ---- blank fields -----------------------------------------------------------

test('a blank weight blocks a weighted set', () => {
  const r = validateSetEntry({ weight: '', reps: '5' });
  assert.equal(r.ok, false);
  assert.deepEqual(fieldsOf(r.errors), ['weight']);
});

test('a blank weight is fine on bodyweight and assisted rows', () => {
  // Those modes derive the effective load from body mass and band assistance,
  // so an empty field there is normal, not incomplete.
  assert.equal(validateSetEntry({ weight: '', reps: '10', loadMode: 'bodyweight' }).ok, true);
  assert.equal(validateSetEntry({ weight: '', reps: '10', loadMode: 'assisted' }).ok, true);
  assert.equal(validateSetEntry({ weight: '', reps: '10', loadMode: 'weighted' }).ok, false);
  assert.equal(validateSetEntry({ weight: '', reps: '10' }).ok, false, 'weighted is the default');
});

test('reps are required in every load mode', () => {
  for (const loadMode of ['weighted', 'bodyweight', 'assisted']) {
    const r = validateSetEntry({ weight: '', reps: '', loadMode });
    assert.ok(fieldsOf(r.errors).includes('reps'), `${loadMode} still needs reps`);
  }
});

test('both fields blank reports both, and points at the weight first', () => {
  const r = validateSetEntry({ weight: '', reps: '' });
  assert.deepEqual(fieldsOf(r.errors), ['weight', 'reps']);
  assert.equal(r.firstErrorField, 'weight', 'focus goes to the first field in the row');
});

test('whitespace is not a value', () => {
  assert.equal(validateSetEntry({ weight: '   ', reps: '  ' }).ok, false);
});

test('non-numeric text is refused rather than silently coerced', () => {
  const r = validateSetEntry({ weight: 'heavy', reps: 'lots' });
  assert.equal(r.ok, false);
  assert.deepEqual(fieldsOf(r.errors), ['weight', 'reps']);
});

test('numbers are accepted as numbers, not only as strings', () => {
  assert.equal(validateSetEntry({ weight: 100, reps: 5 }).ok, true);
  assert.equal(validateSetEntry({ weight: -1, reps: 5 }).ok, false);
});

// ---- warnings inform, they never block --------------------------------------

test('an unusually high rep count warns but still logs', () => {
  const r = validateSetEntry({ weight: '20', reps: String(SET_ENTRY_LIMITS.maxReps + 1) });
  assert.equal(r.ok, true, 'a real 101-rep set must not be refused');
  assert.deepEqual(fieldsOf(r.warnings), ['reps']);
});

test('an unusually heavy load warns but still logs', () => {
  const r = validateSetEntry({ weight: String(SET_ENTRY_LIMITS.maxWeight + 1), reps: '1' });
  assert.equal(r.ok, true);
  assert.deepEqual(fieldsOf(r.warnings), ['weight']);
});

test('the weight bound is loose enough for a real lbs load', () => {
  // The app never converts units — a set is stored in the unit it was entered
  // in — so one bound covers both. It is set at the lbs end deliberately: a
  // missed warning costs far less than refusing a genuine lift.
  assert.deepEqual(validateSetEntry({ weight: '600', reps: '1' }).warnings, [], '600 lbs squat');
  assert.deepEqual(validateSetEntry({ weight: '1000', reps: '1' }).warnings, [], '1000 lbs total-lift');
});

// ---- the single message shown on the row ------------------------------------

test('an error outranks a warning', () => {
  const r = validateSetEntry({ weight: '-5', reps: '500' });
  assert.equal(primarySetEntryMessage(r).level, 'error');
  assert.equal(primarySetEntryMessage(r).field, 'weight');
});

test('the message follows the row order — weight before reps', () => {
  const r = validateSetEntry({ weight: '', reps: '0' });
  assert.equal(primarySetEntryMessage(r).field, 'weight');
  assert.equal(primarySetEntryMessage(validateSetEntry({ weight: '100', reps: '0' })).field, 'reps');
});

test('a clean set has no message at all', () => {
  assert.equal(primarySetEntryMessage(validateSetEntry({ weight: '100', reps: '5' })), null);
  assert.equal(primarySetEntryMessage(null), null);
});

// ---- previous values --------------------------------------------------------

test('previous values read as weight × reps in the athlete\'s own unit', () => {
  assert.equal(previousSetLabel({ w: '100', r: '5' }, 'kg').text, 'Last 100kg × 5');
  assert.equal(previousSetLabel({ w: '225', r: '3' }, 'lbs').text, 'Last 225lbs × 3');
});

test('a fractional previous weight keeps its precision, a whole one loses the .0', () => {
  assert.equal(previousSetLabel({ w: '102.5', r: '3' }, 'kg').text, 'Last 102.5kg × 3');
  assert.equal(previousSetLabel({ w: '100.0', r: '3' }, 'kg').text, 'Last 100kg × 3');
});

test('no previous set renders nothing, never a placeholder that looks broken', () => {
  // "-- × --" reads as data that failed to load. A first-ever session is blank.
  assert.equal(previousSetLabel(null), null);
  assert.equal(previousSetLabel(undefined), null);
  assert.equal(previousSetLabel({}), null);
  assert.equal(previousSetLabel({ w: '', r: '' }), null);
  assert.equal(previousSetLabel({ w: '0', r: '0' }), null);
});

test('a bodyweight set with reps but no load still shows its reps', () => {
  assert.equal(previousSetLabel({ w: '', r: '12' }, 'kg').text, 'Last 12 reps');
  assert.equal(previousSetLabel({ w: '0', r: '12' }, 'kg').text, 'Last 12 reps');
});

test('the accessible label spells out what the terse text abbreviates', () => {
  assert.equal(previousSetLabel({ w: '100', r: '5' }, 'kg').label, 'Last time: 100kg × 5');
});
