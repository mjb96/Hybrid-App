// ==========================================
// SAFE IMPORT CONTRACT TESTS (tests/import_validate.test.js)
// R17: a malformed / oversized / future-schema / hostile import is refused in
// memory and NEVER replaces live state; a hostile avatar is stripped; imported
// text is not interpreted as markup; and success counts are accurate.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  validateImport,
  isSafeImageDataUrl,
  sanitizeImportedState,
  importCounts,
  importReasonMessage,
} from '../js/state/import-validate.js';

const okState = () => ({
  currentWeek: '1',
  weeks: {
    '1': { lifts: { mon: { Squat: [{ c: true, w: '100', r: '5' }] } }, runSessions: { tue: [{ dist: '5' }] } },
    '2': { lifts: { wed: {} } },
  },
  customPrograms: [{ id: 'p1' }, { id: 'p2' }],
  bodyWeightLog: [{ weight: 80 }],
});

// ── deep validation: invalid inputs are refused, never accepted ─────────────

test('rejects non-object / array / primitive', () => {
  assert.equal(validateImport(null).ok, false);
  assert.equal(validateImport([]).ok, false);
  assert.equal(validateImport('nope').ok, false);
  assert.equal(validateImport(42).ok, false);
});

test('rejects a shaped-but-malformed file (bad weeks / missing currentWeek)', () => {
  assert.equal(validateImport({ weeks: { '1': {} } }).reason, 'no-current-week');
  assert.equal(validateImport({ currentWeek: '1' }).reason, 'no-weeks');
  assert.equal(validateImport({ currentWeek: '1', weeks: {} }).reason, 'empty-weeks');
  assert.equal(validateImport({ currentWeek: '1', weeks: { '1': 'garbage' } }).reason, 'bad-week');
  assert.equal(validateImport({ currentWeek: '1', weeks: { '1': [] } }).reason, 'bad-week');
});

test('rejects wrong-typed top-level collections', () => {
  assert.equal(validateImport({ ...okState(), customPrograms: 'x' }).reason, 'bad-programs');
  assert.equal(validateImport({ ...okState(), bodyWeightLog: {} }).reason, 'bad-bodyweight');
  assert.equal(validateImport({ ...okState(), settings: [] }).reason, 'bad-settings');
});

test('rejects a future schema version', () => {
  const r = validateImport({ ...okState(), schemaVersion: 99 }, { currentSchemaVersion: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'future-schema');
});

test('rejects an oversized payload', () => {
  const r = validateImport(okState(), { rawText: 'x'.repeat(26 * 1024 * 1024) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-large');
});

test('accepts a well-formed snapshot and reports accurate counts', () => {
  const r = validateImport(okState(), { currentSchemaVersion: 5 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { weeks: 2, programs: 2, bodyWeights: 1, runs: 1, loggedDays: 2 });
});

// ── avatar sanitization: hostile markup never survives an import ─────────────

test('isSafeImageDataUrl allows only base64 image data URLs', () => {
  assert.equal(isSafeImageDataUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isSafeImageDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isSafeImageDataUrl('x" onerror="alert(1)'), false);              // attribute breakout
  assert.equal(isSafeImageDataUrl('data:text/html;base64,PHNjcmlwdD4='), false); // not an image
  assert.equal(isSafeImageDataUrl('javascript:alert(1)'), false);
  assert.equal(isSafeImageDataUrl('https://evil.example/x.png'), false);         // remote
  assert.equal(isSafeImageDataUrl('data:image/png;base64,<img src=x onerror=1>'), false);
});

test('sanitizeImportedState strips a hostile avatar but keeps the rest', () => {
  const dirty = { ...okState(), settings: { name: 'Alex', avatarDataUrl: '"><img src=x onerror=alert(1)>' } };
  const clean = sanitizeImportedState(dirty);
  assert.equal('avatarDataUrl' in clean.settings, false);   // dropped
  assert.equal(clean.settings.name, 'Alex');                // preserved
  assert.deepEqual(dirty.settings.avatarDataUrl, '"><img src=x onerror=alert(1)>'); // input not mutated
});

test('validateImport returns state with the hostile avatar already removed', () => {
  const r = validateImport({ ...okState(), settings: { name: 'A', avatarDataUrl: 'x" onerror="x' } }, { currentSchemaVersion: 5 });
  assert.equal(r.ok, true);
  assert.equal('avatarDataUrl' in r.state.settings, false);
});

test('a legitimate base64 avatar survives import', () => {
  const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=';
  const r = validateImport({ ...okState(), settings: { avatarDataUrl: url } }, { currentSchemaVersion: 5 });
  assert.equal(r.state.settings.avatarDataUrl, url);
});

test('importReasonMessage never blames the user data', () => {
  assert.match(importReasonMessage('future-schema'), /newer app version/);
  assert.match(importReasonMessage('too-large'), /too large/);
  assert.match(importReasonMessage('bad-week'), /not replaced/);
});
