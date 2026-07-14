// ==========================================
// HEALTH FIELD CONTRACT TESTS (tests/health_fields.test.js)
// The single supported-field contract shared by Settings, permissions, native
// readers, returned data, and per-field status. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEALTH_FIELDS,
  HEALTH_FIELD_IDS,
  isSupportedField,
  fieldById,
  normalizeSyncFields,
  defaultSyncFields,
  selectedFieldIds,
} from '../js/health/health-fields.js';

test('contract is exactly the four end-to-end fields (no vo2max)', () => {
  assert.deepEqual(HEALTH_FIELD_IDS, ['steps', 'restingHR', 'hrv', 'sleep']);
  assert.equal(isSupportedField('vo2max'), false);
  assert.equal(isSupportedField('weight'), false);
  assert.equal(fieldById('vo2max'), null);
  // Every field carries a full path: label, series key, native payload key.
  for (const f of HEALTH_FIELDS) {
    assert.ok(f.id && f.label && f.seriesKey && f.payloadKey, `field ${f.id} incomplete`);
  }
});

test('normalizeSyncFields drops unsupported keys and defaults to enabled', () => {
  // Legacy vo2max toggle must not survive normalization.
  const norm = normalizeSyncFields({ vo2max: true, steps: false });
  assert.deepEqual(Object.keys(norm).sort(), ['hrv', 'restingHR', 'sleep', 'steps'].sort());
  assert.equal('vo2max' in norm, false);
  assert.equal(norm.steps, false);   // explicit false preserved
  assert.equal(norm.hrv, true);      // missing → default enabled
});

test('normalizeSyncFields tolerates null/garbage input', () => {
  assert.deepEqual(defaultSyncFields(), { steps: true, restingHR: true, hrv: true, sleep: true });
  assert.deepEqual(normalizeSyncFields(null), defaultSyncFields());
  assert.deepEqual(normalizeSyncFields('nope'), defaultSyncFields());
});

test('selectedFieldIds returns only supported + enabled, in contract order', () => {
  assert.deepEqual(selectedFieldIds({ steps: true, hrv: false, restingHR: true, sleep: false, vo2max: true }),
    ['steps', 'restingHR']);
  assert.deepEqual(selectedFieldIds({ steps: false, restingHR: false, hrv: false, sleep: false }), []);
  // Undefined selection means the opt-out default: everything on.
  assert.deepEqual(selectedFieldIds(undefined), HEALTH_FIELD_IDS.slice());
});
