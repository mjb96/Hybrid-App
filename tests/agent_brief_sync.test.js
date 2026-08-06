// =============================================================================
// AGENT BRIEF SYNC (static architectural check)
//
// CLAUDE.md and AGENTS.md are the same working brief addressed to two different
// tools. They are auto-loaded at the start of a session, which makes a stale one
// worse than no brief at all: an agent acts on it before reading any code.
//
// They drifted, and the drift was live for weeks. CLAUDE.md still named a goal
// the roadmap had PARKED ("Android public beta on Google Play") as the active
// one, and asserted "no alias layer" for exercise identity when
// js/exercises/catalog.js had gained exactly that. Every session that read the
// wrong copy started from wrong facts.
//
// Two full copies were kept deliberately — a pointer or an @import would leave
// an agent with no brief at all if it were not expanded. So instead the copies
// are pinned identical below the title line, and drift fails the build.
//
// To change the brief: edit AGENTS.md, then regenerate CLAUDE.md with
//   { echo "# Helyx — Claude Code Working Brief"; tail -n +2 AGENTS.md; } > CLAUDE.md
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const CLAUDE = read('CLAUDE.md');
const AGENTS = read('AGENTS.md');

/** Everything after the first line — the tool-specific title is allowed to differ. */
const body = (text) => text.split('\n').slice(1).join('\n');

test('CLAUDE.md and AGENTS.md carry an identical brief', () => {
  assert.equal(
    body(CLAUDE),
    body(AGENTS),
    'The two agent briefs have drifted. Edit AGENTS.md, then regenerate CLAUDE.md:\n' +
      '  { echo "# Helyx — Claude Code Working Brief"; tail -n +2 AGENTS.md; } > CLAUDE.md',
  );
});

test('each brief keeps its own tool-specific title', () => {
  const first = (text) => text.split('\n')[0];
  assert.match(first(CLAUDE), /Claude/, 'CLAUDE.md must name Claude in its title');
  assert.match(first(AGENTS), /Codex|Agents?/i, 'AGENTS.md must name its own tool in its title');
  assert.notEqual(first(CLAUDE), first(AGENTS), 'the titles are the one intended difference');
});

test('the brief states the CURRENT active goal, not a parked one', () => {
  // The specific regression: release work was parked on 2026-08-03 and the brief
  // kept naming it as the active goal for weeks afterwards.
  assert.doesNotMatch(
    AGENTS,
    /Active goal:\s*Android public beta/i,
    'Play Store release is PARKED (roadmap §9) — it must not be stated as the active goal',
  );
  assert.match(AGENTS, /Active goal:/, 'the brief must still state an active goal');
});

test('the brief points at the roadmap as the single product source of truth', () => {
  assert.match(AGENTS, /docs\/IMPROVEMENT_ROADMAP\.md/, 'the brief must reference the roadmap');
  assert.match(
    AGENTS,
    /do not create parallel progress, audit, or\s*\n?\s*checklist trackers/i,
    'the no-parallel-trackers rule must survive',
  );
});
