import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatStrengthDuration,
  parseStrengthDurationMinutes,
  parseStrengthDurationSeconds,
} from '../js/strength/duration.js';

test('strength duration preserves legacy plain-minute records', () => {
  assert.equal(parseStrengthDurationSeconds('60'), 3600);
  assert.equal(parseStrengthDurationMinutes('45'), 45);
});

test('strength duration accepts modern M:SS and H:MM:SS values', () => {
  assert.equal(parseStrengthDurationSeconds('45:30'), 2730);
  assert.equal(parseStrengthDurationSeconds('1:05:30'), 3930);
});

test('strength duration rejects malformed and negative values', () => {
  assert.equal(parseStrengthDurationSeconds('nope'), 0);
  assert.equal(parseStrengthDurationSeconds('-5'), 0);
  assert.equal(parseStrengthDurationSeconds('1:2:3:4'), 0);
});

test('strength duration formats totals for compact analytics', () => {
  assert.equal(formatStrengthDuration(2700), '45m');
  assert.equal(formatStrengthDuration(7530), '2h 5m');
});
