import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROGRAM_CATALOG } from '../js/programs/catalog.js';
import { detectRunType } from '../js/workout/run-type.js';

test('structured intervals outrank incidental recovery and pace words', () => {
  assert.equal(detectRunType('6×800m (90s recovery)')?.label, 'Intervals');
  assert.equal(detectRunType('6×800m @ 5K race pace (90sec recovery)')?.label, 'Intervals');
  assert.equal(detectRunType('4×8 min @ threshold pace (2min rest)')?.label, 'Intervals');
});

test('specific unstructured prescriptions retain their intended type', () => {
  assert.equal(detectRunType('5K at goal race pace')?.label, 'Race Pace');
  assert.equal(detectRunType('20-25min @ threshold pace')?.label, 'Tempo');
  assert.equal(detectRunType('Zone 2 long run (progressive)')?.label, 'Long Run');
  assert.equal(detectRunType('20-30min very easy')?.label, 'Recovery');
  assert.equal(detectRunType('30min easy run')?.label, 'Zone 2');
});

test('unknown copy falls back without claiming a specific training type', () => {
  const run = detectRunType('Run to the lighthouse');
  assert.deepEqual({ label: run?.label, specific: run?.specific }, { label: 'Run', specific: false });
  const other = detectRunType('Pool technique session');
  assert.deepEqual({ label: other?.label, specific: other?.specific }, { label: 'Training', specific: false });
  assert.equal(detectRunType('Rest'), null);
});

test('every current catalog prescription has a reviewed, safe classification', () => {
  const prescriptions = [...new Set(PROGRAM_CATALOG.flatMap((program) =>
    Object.values(program.days || {}).map((day) => day.runs)
  ))].filter((value) => value && String(value).toLowerCase() !== 'rest');

  assert.ok(prescriptions.length >= 70, 'fixture should cover the full catalog corpus');
  for (const prescription of prescriptions) {
    const result = detectRunType(prescription);
    assert.ok(result, `missing classification: ${prescription}`);
    assert.ok(result.label && result.color && result.key, `malformed classification: ${prescription}`);
    assert.equal(typeof result.specific, 'boolean');
  }
});
