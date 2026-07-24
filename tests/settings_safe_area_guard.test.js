// =============================================================================
// SETTINGS SAFE-AREA GUARD (static architectural check)
//
// The Settings close button used to sit behind the Android status bar. The fix
// has TWO halves that only work together, and each is easy to delete by accident
// because neither looks load-bearing on its own:
//
//   1. CSS: .settings-header pads its TOP by the safe-area inset, so the whole
//      header row (avatar + close button) clears the status bar. The button is
//      NOT offset on its own — that would break its alignment with the avatar.
//   2. Native: MainActivity publishes the real status-bar inset as --app-safe-top.
//      This is required because the WebView is edge-to-edge but Android only
//      reports env(safe-area-inset-top) for a DISPLAY CUTOUT. On a notchless
//      phone env() is 0px, so the CSS half alone silently does nothing.
//
// This lint-style test fails if either half is removed.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

// Pull the `.settings-header { ... }` block out of the stylesheet (the base rule,
// not the light-theme override which only restyles colours).
function settingsHeaderRule(css) {
  const m = css.match(/(?:^|\n)\.settings-header\s*\{([^}]*)\}/);
  assert.ok(m, '.settings-header rule not found in css/styles.css');
  return m[1];
}

test('settings header pads its top by the safe-area inset', () => {
  const rule = settingsHeaderRule(read('css/styles.css'));

  // The padding must consult BOTH inset sources: env() for browser/PWA/notched
  // devices, and --app-safe-top for the Android shell.
  assert.match(
    rule,
    /padding:\s*calc\([^;]*safe-area-inset-top/,
    'settings-header top padding must include env(safe-area-inset-top)',
  );
  assert.match(
    rule,
    /--app-safe-top/,
    'settings-header top padding must include var(--app-safe-top) — env() alone ' +
      'is 0px on a notchless Android device, so the header would still overlap',
  );

  // A plain-value fallback must come FIRST, so an engine without max() keeps the
  // original padding instead of dropping the declaration and collapsing to 0.
  const paddings = [...rule.matchAll(/padding:\s*([^;]+);/g)].map(m => m[1].trim());
  assert.ok(paddings.length >= 2, 'expected a fallback padding before the calc() padding');
  assert.ok(
    !/calc\(|max\(|env\(|var\(/.test(paddings[0]),
    `first padding must be a literal fallback, got: ${paddings[0]}`,
  );
});

test('the close button is not individually offset off the status bar', () => {
  const css = read('css/styles.css');
  const m = css.match(/(?:^|\n)\.settings-close-btn\s*\{([^}]*)\}/);
  assert.ok(m, '.settings-close-btn rule not found');
  // The header owns the inset. A margin/top on the button itself would decouple
  // it from the avatar row — exactly the one-off hack this fix avoids.
  assert.doesNotMatch(
    m[1],
    /safe-area-inset|--app-safe-top/,
    'the safe-area inset belongs on .settings-header, not on the button',
  );
});

test('the close button keeps a 44px+ touch target', () => {
  const css = read('css/styles.css');
  assert.match(
    css,
    /--touch-target:\s*(4[4-9]|[5-9]\d)px/,
    '--touch-target must stay at least 44px',
  );
  // The shared sizing rule that applies it to the close button.
  assert.match(
    css,
    /\.settings-close-btn,\s*\n\s*\.sheet-close-btn\s*\{\s*\n\s*width:\s*var\(--touch-target\);\s*\n\s*height:\s*var\(--touch-target\);/,
    '.settings-close-btn must be sized from --touch-target',
  );
});

test('the Android shell publishes --app-safe-top from the real status-bar inset', () => {
  const kt = read('android/app/src/main/java/com/helyx/app/MainActivity.kt');

  assert.match(
    kt,
    /setOnApplyWindowInsetsListener/,
    'MainActivity must observe window insets to learn the status-bar height',
  );
  assert.match(
    kt,
    /Type\.statusBars\(\)\s*or\s*WindowInsetsCompat\.Type\.displayCutout\(\)/,
    'the inset must union statusBars() and displayCutout()',
  );
  assert.match(
    kt,
    /setProperty\('--app-safe-top'/,
    'MainActivity must publish the inset to CSS as --app-safe-top',
  );
  // px -> CSS px. Publishing raw device pixels would over-pad on every phone
  // with a density above 1.
  assert.match(
    kt,
    /displayMetrics\.density/,
    'the inset must be converted from device px to CSS px via display density',
  );
  // A comma-decimal locale would emit "24,5px", which is invalid CSS.
  assert.match(
    kt,
    /String\.format\(\s*Locale\.US/,
    'the CSS length must be formatted with Locale.US',
  );
  // The insets listener fires before the document exists on first load.
  assert.match(
    kt,
    /override fun onPageFinished/,
    'the value must be republished on page load, or first paint misses it',
  );
});

test('the Android shell stays edge-to-edge (the reason the inset is needed)', () => {
  const kt = read('android/app/src/main/java/com/helyx/app/MainActivity.kt');
  assert.match(
    kt,
    /setDecorFitsSystemWindows\(window,\s*false\)/,
    'if this ever becomes true the WebView no longer draws behind the status bar ' +
      'and the --app-safe-top plumbing should be revisited',
  );
});
