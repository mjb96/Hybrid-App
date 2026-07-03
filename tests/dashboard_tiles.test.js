// ==========================================
// DASHBOARD TILE DEFAULTS (tests/dashboard_tiles.test.js)
// R4: fresh installs get a focused six-tile dashboard; every default-hidden id
// must exist in the registry (a typo would silently un-hide a tile).
// ==========================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_REGISTRY, DEFAULT_HIDDEN_TILES } from '../js/dashboard.js';

test('default-hidden ids all exist in the tile registry', () => {
  const ids = new Set(TILE_REGISTRY.map(t => t.id));
  for (const id of DEFAULT_HIDDEN_TILES) {
    assert.ok(ids.has(id), `default-hidden id "${id}" not in registry`);
  }
});

test('the default-visible dashboard is the focused, non-overlapping six', () => {
  const hidden = new Set(DEFAULT_HIDDEN_TILES);
  const visible = TILE_REGISTRY.filter(t => !hidden.has(t.id)).map(t => t.id).sort();
  // recovery · load · strength work · endurance · body · habit — one each, no
  // overlap. 'today' is hidden (it overlaps the Morning Briefing).
  assert.deepEqual(visible, ['avg-pace', 'bodyweight', 'readiness', 'recovery-score', 'streak', 'weekly-volume']);
  assert.ok(!visible.includes('today'));
});
