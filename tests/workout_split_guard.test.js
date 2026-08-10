// =============================================================================
// THE WORKOUT SPLIT MUST STAY A TREE.
//
// `js/workout.js` is being carved up a seam at a time. The whole approach rests
// on one property: a module split out of it never imports it back.
//
// Break that and nothing fails loudly. ES modules resolve cycles, so the app
// keeps working — until initialisation order shifts and a binding is `undefined`
// at the moment some other module reads it. That is a bug that appears under a
// refactor unrelated to the one that caused it, which is the worst kind to own.
//
// So: assert the shape, not the behaviour. `js/workout/context.js` exists to give
// extracted modules a forward-only route to state and to a redraw; this test is
// what stops someone taking the shortcut instead.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'js', 'workout');

/** Source with comments stripped — a comment ABOUT the cycle is not a cycle. */
function code(file) {
  return readFileSync(path.join(DIR, file), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');
}

const modules = readdirSync(DIR).filter((f) => f.endsWith('.js'));

test('no js/workout/* module imports js/workout.js', () => {
  const offenders = modules.filter((f) => /from\s+['"]\.\.\/workout\.js['"]/.test(code(f)));
  assert.deepEqual(offenders, [],
    `${offenders.join(', ')} import(s) ../workout.js, which closes a cycle.\n`
    + 'Read state through ./context.js and request a redraw with rerenderWorkout(). '
    + 'If you need something else from workout.js, that thing wants extracting too.');
});

test('the context module depends on nothing in the app', () => {
  // It is the root of the extracted subtree. An import here — of state, of the
  // engine, of anything — makes it a participant rather than a seam, and the
  // next module to need it inherits whatever it dragged in.
  const imports = [...code('context.js').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(imports, [],
    `js/workout/context.js imports ${imports.join(', ')}. It must stay dependency-free.`);
});

test('the split modules are actually wired in, not orphaned', () => {
  // A module nobody imports is dead code that still passes every test above.
  const workout = readFileSync(path.join(ROOT, 'js', 'workout.js'), 'utf8');
  for (const f of ['context.js', 'exercise-picker.js', 'units.js']) {
    assert.ok(workout.includes(`./workout/${f}`), `js/workout.js does not import ./workout/${f}`);
  }
});

test('workout.js still re-exports what app.js imports from it', () => {
  // app.js is workout.js's only consumer. Moving an implementation is fine;
  // silently moving the public surface breaks the one importer.
  const workout = readFileSync(path.join(ROOT, 'js', 'workout.js'), 'utf8');
  const app = readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

  // `[^}]*` rather than `[\s\S]*?`: a lazy any-char match still spans several
  // import statements before it reaches ./workout.js, and this guard's first run
  // duly reported "devWarn } from './debug.js'" as a missing export. Refusing to
  // cross a closing brace keeps it to the one statement.
  const block = /import\s*\{([^}]*)\}\s*from\s*['"]\.\/workout\.js['"]/.exec(app);
  assert.ok(block, 'js/app.js no longer imports from ./workout.js — update this guard');

  const wanted = block[1]
    .split(',')
    .map((s) => s.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+as\s+/)[0].trim());

  const missing = wanted.filter((name) => {
    const patterns = [
      new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`),
      new RegExp(`export\\s+(const|let)\\s+${name}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, 's'),
    ];
    return !patterns.some((re) => re.test(workout));
  });

  assert.deepEqual(missing, [],
    `js/app.js imports these from js/workout.js but it no longer exports them:\n  ${missing.join('\n  ')}`);
});
