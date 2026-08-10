// =============================================================================
// RUN DISTANCE AND PACE CONVERSION.
//
// These were private helpers inside js/workout.js, so nothing could import them
// and the suite had no coverage of them at all — including the entire MILE path,
// which is every athlete who sets `distanceUnit: 'mi'`. Extracting them made
// them reachable; this is the first test they have ever had.
//
// The invariant worth protecting: distance is STORED canonically in km. These
// convert for display and back on input, and the display value is ROUNDED, so a
// round trip is lossy by design. A test that asserted exact round-tripping would
// be asserting something false and would break the moment the rounding changed.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KM_TO_MI, _runDistUnit, _kmToDisplayDist, _displayDistToKm,
  _paceFromDistTime, _timeFromPaceDist,
} from '../js/workout/run-units.js';

const st = (distanceUnit) => ({ settings: { distanceUnit } });

test('the unit comes from settings, and anything unset means km', () => {
  assert.equal(_runDistUnit(st('mi')), 'mi');
  assert.equal(_runDistUnit(st('km')), 'km');
  // A missing or malformed setting must not produce `undefined` in the UI.
  assert.equal(_runDistUnit(st(undefined)), 'km');
  assert.equal(_runDistUnit({}), 'km');
  assert.equal(_runDistUnit(null), 'km');
});

test('km display is the stored value; miles are converted', () => {
  // These return STRINGS, not numbers — they are written straight into input
  // values. My first version of this test asserted a number and failed; the
  // string is the contract, so it is asserted rather than papered over with
  // Number().
  assert.equal(typeof _kmToDisplayDist(10, 'km'), 'string');
  assert.equal(_kmToDisplayDist(10, 'km'), '10');
  // 10 km = 6.21371 mi. The display rounds, so compare numerically rather than
  // pinning a formatting decision.
  assert.ok(Math.abs(Number(_kmToDisplayDist(10, 'mi')) - 10 * KM_TO_MI) < 0.01);
});

test('input converts back to km', () => {
  assert.equal(Number(_displayDistToKm(10, 'km')), 10);
  assert.ok(Math.abs(Number(_displayDistToKm(6.21371, 'mi')) - 10) < 0.01);
});

test('a display round trip is lossy, and that is by design', () => {
  // Guards the invariant in the module header: never round-trip a stored km
  // value through the UI representation to "normalise" it. If this ever becomes
  // exact, someone has removed the rounding and the header is out of date.
  const km = 10.037;
  const shown = _kmToDisplayDist(km, 'mi');
  const back = Number(_displayDistToKm(shown, 'mi'));
  assert.ok(Math.abs(back - km) < 0.05, 'a round trip should stay close');
});

test('pace is derived from distance and time', () => {
  // 10 km in 50:00 is 5:00 per km.
  assert.equal(_paceFromDistTime(10, '50:00'), '5:00');
  // 5 km in 27:30 is 5:30 per km.
  assert.equal(_paceFromDistTime(5, '27:30'), '5:30');
});

test('pace pads the seconds — 5:07, never 5:7', () => {
  // A one-digit second would read as a different pace entirely.
  const pace = _paceFromDistTime(10, '51:10');
  assert.match(pace, /^\d+:\d{2}$/, `expected M:SS, got "${pace}"`);
});

test('pace refuses to invent a number from nothing', () => {
  // A run logged with a distance but no time is normal — the athlete has not
  // finished entering it. Returning a pace there would be fabrication.
  for (const [d, t] of [[0, '50:00'], [10, ''], [10, 'abc'], [null, '50:00'], [10, null]]) {
    const out = _paceFromDistTime(d, t);
    assert.equal(out, '', `expected '' for (${d}, ${t}) but got "${out}"`);
  }
});

test('time is derived back from pace and distance', () => {
  assert.equal(_timeFromPaceDist('5:00', 10), '50:00');
  assert.equal(_timeFromPaceDist('5:30', 5), '27:30');
});

test('time refuses to invent a number from nothing', () => {
  for (const [p, d] of [['', 10], ['abc', 10], ['5:00', 0], ['5:00', null], [null, 10]]) {
    const out = _timeFromPaceDist(p, d);
    assert.equal(out, '', `expected '' for (${p}, ${d}) but got "${out}"`);
  }
});

test('pace and time are inverses at whole values', () => {
  // The cockpit lets the athlete type either one and fills in the other, so a
  // disagreement here shows up as a field that changes when it is re-read.
  for (const [pace, dist] of [['5:00', 10], ['4:30', 8], ['6:15', 5]]) {
    const time = _timeFromPaceDist(pace, dist);
    assert.equal(_paceFromDistTime(dist, time), pace, `${pace} @ ${dist}km round trip`);
  }
});
