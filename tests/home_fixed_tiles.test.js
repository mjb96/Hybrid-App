import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_TILE_IDS, TILE_REGISTRY } from '../js/dashboard.js';

test('S3 — Home shows exactly four fixed tiles', () => {
  assert.equal(HOME_TILE_IDS.length, 4);
  assert.deepEqual([...HOME_TILE_IDS], ['readiness', 'weekly-volume', 'top-lifts', 'avg-pace']);
});

test('S3 — every fixed tile id resolves to a real registry tile', () => {
  const ids = new Set(TILE_REGISTRY.map(t => t.id));
  for (const id of HOME_TILE_IDS) assert.ok(ids.has(id), `${id} is not a registered tile`);
});

test('S3 — the four tiles are one-each across the hybrid dimensions (no dupes)', () => {
  assert.equal(new Set(HOME_TILE_IDS).size, HOME_TILE_IDS.length);
});
