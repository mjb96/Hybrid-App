import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveProgramIssue, resolveProgramForState, setAppState, verifyWeekStorageSchema,
} from '../js/state.js';
import { renderActiveProgramBanner, updateLibraryState } from '../js/programs/library.js';

const validCustom = {
  id: 'custom_ok', name: 'My Plan', totalWeeks: 6,
  days: { mon: { lifts: ['Squat'], runs: 'Rest' } },
  weeklyVolModifiers: {},
};

test('known system and valid custom programs resolve exactly', () => {
  assert.ok(resolveProgramForState({ customPrograms: [] }, 'hybrid_engine'));
  assert.equal(resolveProgramForState({ customPrograms: [validCustom] }, 'custom_ok'), validCustom);
  assert.equal(getActiveProgramIssue({ activeProgramId: 'custom_ok', customPrograms: [validCustom] }), null);
});

test('unknown or deleted IDs never silently fall back to Hybrid Engine', () => {
  for (const id of ['does_not_exist', 'deleted_custom']) {
    const state = { activeProgramId: id, customPrograms: [] };
    assert.equal(resolveProgramForState(state, id), null);
    const issue = getActiveProgramIssue(state);
    assert.equal(issue?.reason, 'missing');
    assert.match(issue?.message || '', /history is still safe/i);
  }
});

test('a corrupt custom program fails closed and surfaces a distinct recovery reason', () => {
  const corrupt = { id: 'broken_custom', name: 'Broken', totalWeeks: 6, days: null };
  const state = { activeProgramId: corrupt.id, customPrograms: [corrupt] };
  assert.equal(resolveProgramForState(state, corrupt.id), null);
  assert.equal(getActiveProgramIssue(state)?.reason, 'corrupt');
});

test('a corrupt custom record cannot shadow-fallback to a built-in program', () => {
  const shadow = { id: 'hybrid_engine', name: 'Corrupt shadow', totalWeeks: 12, days: null };
  assert.equal(resolveProgramForState({ customPrograms: [shadow] }, 'hybrid_engine'), null);
});

test('week verification leaves invalid-program state byte-for-byte untouched', () => {
  const state = { activeProgramId: 'deleted_custom', currentWeek: '3', customPrograms: [], weeks: {} };
  setAppState(state);
  const before = JSON.stringify(state);
  assert.equal(verifyWeekStorageSchema('3'), false);
  assert.equal(JSON.stringify(state), before);
});

test('Programs renders explicit recovery choices without exposing or replacing the bad ID', () => {
  const state = { activeProgramId: 'deleted_custom', currentWeek: '3', customPrograms: [] };
  const banner = { innerHTML: '', style: {} };
  globalThis.document = { getElementById: (id) => id === 'activeProgBanner' ? banner : null };
  updateLibraryState(state);
  renderActiveProgramBanner();
  assert.match(banner.innerHTML, /Program unavailable/);
  assert.match(banner.innerHTML, /history is still safe/i);
  assert.match(banner.innerHTML, /Choose a replacement below/i);
  assert.match(banner.innerHTML, /data-action="open-create-program"/);
  assert.doesNotMatch(banner.innerHTML, /deleted_custom|Hybrid Engine/);
  assert.equal(state.activeProgramId, 'deleted_custom');
  delete globalThis.document;
});
