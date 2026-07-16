import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const tracker = fs.readFileSync(new URL('../js/gps-tracker.js', import.meta.url), 'utf8');

test('web and native GPS fixes share the timestamped route-quality pipeline', () => {
  assert.match(tracker, /ingestFix\(lat, lng, accuracy, Number\(pos\.timestamp\) \|\| Date\.now\(\)\)/);
  assert.match(tracker, /ingestFix\(p\.lat, p\.lng, p\.acc, p\.t\)/);
  assert.match(tracker, /ingestGpsQualityFix\(_qualityState/);
});

test('GPS completion persists the same compact audit with run and route', () => {
  assert.match(tracker, /const finalQuality = summarizeGpsQuality\(_qualityState\)/);
  assert.match(tracker, /saveMapToDB[^]*quality: finalQuality/);
  assert.match(tracker, /upsertRunSession[^]*gpsQuality: finalQuality/);
});

test('pause and resume force a new filtered route segment', () => {
  const matches = tracker.match(/_forceSegmentBreak = true/g) || [];
  assert.ok(matches.length >= 2);
});
