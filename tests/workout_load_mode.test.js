import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyBandAssistance,
  applyBandLoad,
  applyLoadMode,
  bandRole,
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

// =============================================================================
// BAND ROLE — reported from real use: "if I'm doing tricep pushdowns with
// bands why does bodyweight come into it".
//
// A band does two opposite jobs and only one was implemented. On a pull-up it
// ASSISTS (load = bodyweight − band); on a pushdown it IS the load. Every
// banded set went through the assistance path, so a Band Triceps Pushdown with
// a Medium (20 kg) band on an 80 kg athlete logged 60 kg and roughly triple the
// volume credits — body mass leaking into an exercise that never lifts it.
// =============================================================================

const BANDS = { L: 10, M: 20, H: 30 };

test('a band assists only the exercises body mass actually loads', () => {
  for (const name of ['Pull-Up', 'Chin-Ups', 'Dips', 'Push-Ups']) {
    assert.equal(bandRole(name), 'assist', name);
  }
  for (const name of ['Band Triceps Pushdown', 'Band Leg Curl', 'Band Pull-Apart',
    'Face Pull', 'Bench Press', 'Lat Pulldown']) {
    assert.equal(bandRole(name), 'resist', name);
  }
});

test('a banded pushdown logs the band, not the athlete', () => {
  const set = applyBandLoad({ r: '12' }, 'M', {
    exercise: 'Band Triceps Pushdown', bodyweight: 80, bandWeights: BANDS,
  });
  assert.equal(set.w, '20', 'the Medium band is the load');
  assert.equal(set.loadMode, 'banded');
  assert.equal(set.band, 'M');
  assert.equal(set.bw, undefined);
});

test('a banded pull-up still subtracts the band from body mass', () => {
  const set = applyBandLoad({ r: '5' }, 'M', {
    exercise: 'Pull-Up', bodyweight: 80, bandWeights: BANDS,
  });
  assert.equal(set.w, '60');
  assert.equal(set.loadMode, 'assisted');
});

test('bodyweight cannot reach a resistance exercise at all', () => {
  // The whole point of the report: changing bodyweight must not move the load
  // on a pushdown by so much as a kilo.
  const at = (bodyweight) => applyBandLoad({}, 'H', {
    exercise: 'Band Leg Curl', bodyweight, bandWeights: BANDS,
  }).w;
  assert.equal(at(60), at(120));
  assert.equal(at(60), '30');
});

test('each band tier resists with its own weight', () => {
  for (const [band, kg] of [['L', '10'], ['M', '20'], ['H', '30']]) {
    const set = applyBandLoad({}, band, {
      exercise: 'Band Pull-Apart', bandWeights: BANDS,
    });
    assert.equal(set.w, kg, band);
  }
});

test('a custom band weight is respected, not the default', () => {
  const set = applyBandLoad({}, 'L', {
    exercise: 'Band Pull-Apart', bandWeights: { L: 7.5, M: 20, H: 30 },
  });
  assert.equal(set.w, '7.5');
});

test('an unknown band weight resists with zero rather than inventing a load', () => {
  const set = applyBandLoad({}, 'M', { exercise: 'Band Pull-Apart', bandWeights: {} });
  assert.equal(set.w, '0');
});

test('a legacy banded set is re-read by role, without its stored load changing', () => {
  // Sets logged before this fix keep exactly the weight they were logged with —
  // history is not rewritten — but they stop claiming to be "assisted".
  const legacy = { band: 'M', w: '60', r: '12', c: true };
  assert.equal(resolvedLoadMode(legacy, 'Band Triceps Pushdown'), 'banded');
  assert.equal(resolvedLoadMode(legacy, 'Pull-Up'), 'assisted');
  assert.equal(legacy.w, '60', 'the stored load must not be touched');
});

test('an explicit loadMode always wins over the role guess', () => {
  assert.equal(resolvedLoadMode({ loadMode: 'banded', band: 'M' }, 'Pull-Up'), 'banded');
  assert.equal(resolvedLoadMode({ loadMode: 'assisted', band: 'M' }, 'Band Leg Curl'), 'assisted');
});
