import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fastingRingSVG, ringArcOffset, ringCaption } from '../js/fasting/fasting-ring.js';

const CIRC = 2 * Math.PI * 52;

test('S1b — ringArcOffset is full circumference at 0% and zero at 100%', () => {
  assert.equal(ringArcOffset(0).toFixed(1), CIRC.toFixed(1));
  assert.equal(ringArcOffset(100).toFixed(1), '0.0');
});

test('S1b — ringArcOffset clamps out-of-range progress', () => {
  assert.equal(ringArcOffset(-20).toFixed(1), CIRC.toFixed(1)); // clamps to 0%
  assert.equal(ringArcOffset(150).toFixed(1), '0.0');           // clamps to 100%
});

test('S1b — a half-done fast offsets the arc by half the circumference', () => {
  assert.equal(ringArcOffset(50).toFixed(1), (CIRC / 2).toFixed(1));
});

test('S1b — the ring renders elapsed time, stage, and target with live-update ids', () => {
  const ctx = {
    active: true, hours: 16.0, progressPct: 100, remainingHours: 0, goal: 16,
    zone: { name: 'Fat Adaptation', color: '#f59e0b', description: '…' },
  };
  const svg = fastingRingSVG(ctx);
  assert.match(svg, /id="fastingSheetTimer"/);   // ticker updates the timer text
  assert.match(svg, /id="fastingRingArc"/);      // ticker updates the arc offset
  assert.match(svg, /id="fastingRingStage"/);    // ticker updates the stage on zone change
  assert.match(svg, /16:00:00/);                 // elapsed h:mm:ss
  assert.match(svg, /Fat Adaptation/);
  assert.match(svg, /Target 16h/);
  assert.match(svg, /#f59e0b/);                  // arc + stage take the zone colour
});

test('S1b — an idle ring is safe with a null-ish context', () => {
  const svg = fastingRingSVG(null);
  assert.match(svg, /0:00:00/);
  assert.match(svg, /Fed State/);
  assert.equal(ringCaption(null), 'Ready to start');
});

test('S1b — caption reflects goal state', () => {
  assert.equal(ringCaption({ progressPct: 100, active: true }), '🎉 Goal reached');
  assert.equal(ringCaption({ progressPct: 40, active: true, remainingHours: 9 }), '9h to goal');
  assert.equal(ringCaption({ progressPct: 0, active: false }), 'Ready to start');
});
