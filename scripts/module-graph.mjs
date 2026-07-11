// =============================================================================
// MODULE GRAPH WALKER
// -----------------------------------------------------------------------------
// Statically walks the ES-module import graph from a set of entry points and
// returns every local `js/**.js` file that is actually reachable at runtime —
// following static `import`/`export … from`, and dynamic `import('…')`.
//
// This is the single source of truth for "what must be cached to work offline":
// - scripts/check-precache.mjs asserts the service worker precaches all of it.
// - It is intentionally conservative: it only skips things that are provably not
//   local runtime modules (remote https:// imports, and the virtual './types'
//   ambient-typedef import used only by tsc).
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

// Match: import … from 'x';  export … from 'x';  import('x')
const STATIC_RE = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractSpecifiers(source) {
  const specs = new Set();
  let m;
  while ((m = STATIC_RE.exec(source))) specs.add(m[1]);
  while ((m = DYNAMIC_RE.exec(source))) specs.add(m[1]);
  return [...specs];
}

// True for specifiers that are NOT local runtime JS modules we must cache.
function isSkippable(spec) {
  if (spec.startsWith('http://') || spec.startsWith('https://')) return true; // remote / stubbed
  if (spec === './types' || spec === '../types' || spec.endsWith('/types')) return true; // ambient d.ts for tsc only
  return false;
}

/**
 * @param {string[]} entryRelPaths  paths relative to repo root, e.g. ['js/app.js']
 * @returns {string[]} sorted repo-root-relative paths of every reachable local module
 */
export function reachableModules(entryRelPaths) {
  const visited = new Set();
  const queue = [...entryRelPaths];

  while (queue.length) {
    const rel = queue.shift();
    if (visited.has(rel)) continue;
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) {
      // A real broken import — surface it loudly rather than silently dropping.
      throw new Error(`Module graph: cannot resolve reachable module '${rel}'`);
    }
    visited.add(rel);

    const source = readFileSync(abs, 'utf8');
    for (const spec of extractSpecifiers(source)) {
      if (isSkippable(spec)) continue;
      if (!spec.startsWith('.')) continue; // bare specifiers: no bundler here, so none expected
      const childAbs = resolve(dirname(abs), spec);
      const childRel = relative(ROOT, childAbs).split('\\').join('/');
      if (!visited.has(childRel)) queue.push(childRel);
    }
  }

  return [...visited].sort();
}

export { ROOT };
