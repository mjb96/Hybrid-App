// ==========================================
// ASK-THE-COACH TEST (tests/coach_qa.test.js)
// C2 — deterministic coach answers from the live engine context. Run with
// `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyCoachIntent, answerCoachQuestion } from '../js/brain/coach-qa.js';

test('classifies the common questions', () => {
  assert.equal(classifyCoachIntent('should I train today?'), 'train-today');
  assert.equal(classifyCoachIntent('why did my score drop'), 'why-score');
  assert.equal(classifyCoachIntent('am I overtraining?'), 'overtraining');
  assert.equal(classifyCoachIntent('when will I hit a new PR'), 'projection');
  assert.equal(classifyCoachIntent('how recovered am I'), 'readiness');
  assert.equal(classifyCoachIntent('what is the meaning of life'), 'unknown');
});

test('train-today: high risk → hold back', () => {
  const { answer } = answerCoachQuestion('train-today', { risk: { level: 'high' }, session: { isRest: false }, model: {} });
  assert.match(answer, /hold back|rest/i);
});

test('train-today: low readiness → yes but easy', () => {
  const { answer } = answerCoachQuestion('train-today', { risk: { level: 'none' }, session: { isRest: false }, model: { ready: { hasData: true, score: 40 } } });
  assert.match(answer, /keep it easy|zone 2/i);
});

test('train-today: primed → push', () => {
  const { answer } = answerCoachQuestion('train-today', { risk: { level: 'none' }, session: { isRest: false }, model: { ready: { hasData: true, score: 90 } } });
  assert.match(answer, /primed|push/i);
});

test('why-score: summarises the biggest movers from deltaBreakdown', () => {
  const score = {
    score: 82, delta: 3,
    deltaBreakdown: [
      { pillar: 'recovery', label: 'Recovery', delta: 5 },
      { pillar: 'consistency', label: 'Consistency', delta: -2 },
      { pillar: 'body', label: 'Body', delta: 0 },
    ],
  };
  const { answer } = answerCoachQuestion('why-score', { score });
  assert.match(answer, /\+5 Recovery/);
  assert.match(answer, /-2 Consistency/);
  assert.match(answer, /82/);
  assert.ok(!/Body/.test(answer), 'zero-delta pillars are omitted');
});

test('why-score: calibrating when there is no delta yet', () => {
  const { answer } = answerCoachQuestion('why-score', { score: { score: null } });
  assert.match(answer, /calibrat/i);
});

test('overtraining: echoes the risk advice when elevated, else reassures', () => {
  const withRisk = answerCoachQuestion('overtraining', { risk: { level: 'high', advice: 'Take a deload week now.' } });
  assert.equal(withRisk.answer, 'Take a deload week now.');
  const clean = answerCoachQuestion('overtraining', { risk: { level: 'none' } });
  assert.match(clean.answer, /clean|train as planned/i);
});

test('free text routes to the right intent and answer', () => {
  const { intent, answer } = answerCoachQuestion('why is my score down?', { score: { score: 70, delta: -4, deltaBreakdown: [{ label: 'Load', delta: -4 }] } });
  assert.equal(intent, 'why-score');
  assert.match(answer, /-4 Load/);
});
