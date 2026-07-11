// @ts-check
// =============================================================================
// PROGRAM ATTRIBUTION — the single source of truth for how a program's origin
// is described in the UI.
// -----------------------------------------------------------------------------
// IMPORTANT: Helyx has NO creator-verification mechanism and no evidence that
// any named coach authored, reviewed, or endorsed these programs. The catalog
// programs are Helyx's own interpretations of well-known, published training
// methods. So we must NEVER label anything "Verified creator" or otherwise imply
// endorsement/partnership. This module maps a program's author.type to accurate,
// neutral wording; keep all attribution phrasing here so it can't drift.
//
// Allowed attribution states (author.type):
//   'official'   → first-party Helyx program           → "by Helyx"
//   'coach'      → interpretation of a named coach's    → "Inspired by {name}"
//                  published methodology (NOT authored
//                  or endorsed by that coach)
//   'community'  → popularised by a community/forum     → "Community program"
//                                                         (+ "· inspired by {name}")
//   'strength' | 'warmup' | 'cooldown' | other          → structural block,
//                                                          no attribution line
// The legacy `author.verified` boolean is intentionally IGNORED everywhere.
// =============================================================================

/**
 * @param {any} program
 * @returns {{ text: string, kind: 'official'|'coach'|'community' } | null}
 *   null when the program has no meaningful public attribution to show.
 */
export function programAttribution(program) {
  const author = program?.author;
  const name = author?.name && String(author.name).trim();
  if (!name) return null;
  const type = author?.type;

  switch (type) {
    case 'official':
      // First-party — self-attribution is accurate.
      return { text: name === 'Helyx' ? 'by Helyx' : `by ${name}`, kind: 'official' };
    case 'coach':
      // Do NOT imply the coach made or approved this — it's inspired by their method.
      return { text: `Inspired by ${name}`, kind: 'coach' };
    case 'community':
      return { text: `Community program · inspired by ${name}`, kind: 'community' };
    default:
      // warmup/cooldown/strength/etc. are structural, not authored content.
      return null;
  }
}
