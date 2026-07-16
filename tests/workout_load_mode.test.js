import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBandAssistance,
  applyLoadMode,
  isBodyweightExercise,
  resolvedLoadMode,
} from '../js/workout/load-mode.js';
import { buildSetRow } from '../js/templates.js';

test('Pull-Up, Dip, and common assisted/weighted name variants are bodyweight-capable', () => {
  for (const name of ['Pull-Up', 'Pull-Ups', 'Weighted Pull-Ups', 'Assisted Pull Up', 'Dips', 'Chest Dips', 'Weighted Dips']) {
    assert.equal(isBodyweightExercise(name), true, name);
  }
  assert.equal(isBodyweightExercise('Weighted Sit-Up'), false);
  assert.equal(isBodyweightExercise('Lat Pulldown'), false);
});

test('a blank bodyweight-capable set defaults to Bodyweight, while a barbell set stays Weighted', () => {
  assert.equal(resolvedLoadMode({}, 'Pull-Ups'), 'bodyweight');
  assert.equal(resolvedLoadMode({}, 'Dips'), 'bodyweight');
  assert.equal(resolvedLoadMode({}, 'Bench Press'), 'weighted');
  assert.equal(resolvedLoadMode({ w: '12.5' }, 'Weighted Pull-Ups'), 'weighted');
});

test('bodyweight and assisted modes retain effective-load semantics', () => {
  const bodyweight = applyLoadMode({}, 'bodyweight', { bodyweight: 80 });
  assert.deepEqual(bodyweight, { loadMode: 'bodyweight', bw: true, w: '80' });

  const assisted = applyLoadMode({}, 'assisted', {
    bodyweight: 80,
    bandWeights: { M: 20 },
  });
  assert.equal(assisted.loadMode, 'assisted');
  assert.equal(assisted.band, 'M');
  assert.equal(assisted.w, '60');

  const light = applyBandAssistance(assisted, 'L', {
    bodyweight: 80,
    bandWeights: { L: 10 },
  });
  assert.equal(light.w, '70');
  assert.equal(light.band, 'L');
  assert.equal(light.bw, undefined);
});

test('switching to Weighted clears bodyweight/assistance metadata and auto-load', () => {
  const weighted = applyLoadMode({ bw: true, band: 'M', w: '60', r: '8' }, 'weighted');
  assert.deepEqual(weighted, { loadMode: 'weighted', w: '', r: '8' });
});

test('Pull-Up renderer exposes direct modes and a labelled keyboard quick-log button', () => {
  const html = buildSetRow({}, 0, 'Pull-Ups', { r: '8' }, 'kg', 'Pull-Ups', 82);
  assert.match(html, /role="group" aria-label="Load mode for set 1"/);
  assert.match(html, /data-mode="bodyweight"[\s\S]*aria-pressed="true"/);
  assert.match(html, /<button type="button" class="set-num-lbl/);
  assert.match(html, /aria-label="Log set 1 at target"/);
  assert.match(html, />\s*Log S1\s*<\/button>/);
  assert.match(html, /value="82"/);
});

test('a normal barbell row does not receive irrelevant bodyweight mode controls', () => {
  const html = buildSetRow({}, 0, 'Bench Press', null, 'kg', 'Bench Press', 82);
  assert.doesNotMatch(html, /set-load-choice/);
  assert.match(html, /Log S1/);
});

test('set rows display authored rep ranges without auto-logging a fake rep count', () => {
  const html = buildSetRow({}, 0, 'Incline DB Press', null, 'kg', 'Incline DB Press', 82, '10–12', 12);
  assert.match(html, /placeholder="10–12"/);
  assert.match(html, /data-target-reps="12"/);
});

test('set rows display max reps as an explicit target', () => {
  const html = buildSetRow({}, 0, 'Push-Ups', null, 'kg', 'Push-Ups', 82, 'max reps', null);
  assert.match(html, /placeholder="max reps"/);
  assert.match(html, /data-target-reps=""/);
});
