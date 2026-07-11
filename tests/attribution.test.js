// ==========================================
// PROGRAM ATTRIBUTION TEST (tests/attribution.test.js)
// ------------------------------------------
// Helyx has no creator-verification mechanism, so the UI must NEVER imply a
// named coach verified/endorsed a program. These prove the centralised
// attribution wording is accurate and neutral, and that no catalog program
// still carries a "verified" claim in the rendered output.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { programAttribution } from '../js/programs/attribution.js';

test('official (first-party) programs read "by Helyx"', () => {
  assert.deepEqual(programAttribution({ author: { name: 'Helyx', type: 'official' } }),
    { text: 'by Helyx', kind: 'official' });
});

test('named-coach programs read "Inspired by …" (not authored/endorsed)', () => {
  const a = programAttribution({ author: { name: 'Jim Wendler', type: 'coach', verified: true } });
  assert.equal(a.kind, 'coach');
  assert.equal(a.text, 'Inspired by Jim Wendler');
  // The legacy verified flag must NOT leak any "verified" wording.
  assert.doesNotMatch(a.text, /verif/i);
});

test('community programs are labelled as such', () => {
  const a = programAttribution({ author: { name: 'nSuns', type: 'community' } });
  assert.equal(a.kind, 'community');
  assert.match(a.text, /Community program/);
  assert.match(a.text, /nSuns/);
});

test('structural blocks (warmup/cooldown/strength) get no attribution line', () => {
  assert.equal(programAttribution({ author: { name: 'Easy Run', type: 'warmup' } }), null);
  assert.equal(programAttribution({ author: { name: 'Cool-Down', type: 'cooldown' } }), null);
  assert.equal(programAttribution({ author: { name: 'Main Set', type: 'strength' } }), null);
});

test('missing author yields no attribution', () => {
  assert.equal(programAttribution({}), null);
  assert.equal(programAttribution({ author: {} }), null);
  assert.equal(programAttribution(null), null);
});

test('no catalog program renders a "verified"/"endorsed" attribution', async () => {
  const { PROGRAM_CATALOG } = await import('../js/programs/catalog.js');
  for (const p of Object.values(PROGRAM_CATALOG)) {
    const a = programAttribution(p);
    if (!a) continue;
    assert.doesNotMatch(a.text, /verif|endors|approved|official partner/i,
      `program ${p.id} attribution implies verification/endorsement: "${a.text}"`);
  }
});
