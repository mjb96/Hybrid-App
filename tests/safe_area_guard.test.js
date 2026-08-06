// =============================================================================
// SAFE-AREA GUARD (static architectural check)
//
// Was tests/settings_safe_area_guard.test.js, which guarded ONE element. That
// narrowness was the bug: the Settings close button got fixed, the mechanism it
// needed was built, and then nothing carried it to the rest of the app. On a
// notchless Android phone every primary screen still drew its first control
// under the status bar — including the avatar button, the only route to
// Settings itself.
//
// The fix has TWO halves that only work together, and each looks optional alone:
//
//   1. CSS: --safe-top / --safe-bottom consult BOTH env(safe-area-inset-*) and
//      var(--app-safe-*), and every top-anchored surface pads from the token.
//   2. Native: MainActivity publishes the real status-bar inset as
//      --app-safe-top. Required because the WebView is edge-to-edge but Android
//      only reports env(safe-area-inset-top) for a DISPLAY CUTOUT — on a
//      notchless phone env() is 0px, so the CSS half alone silently does
//      nothing.
//
// Layout is verified for real by scripts/safe-area-browser-check.mjs, which
// publishes a 48px inset and asserts nothing interactive hides beneath it.
// This file is the cheap static half: it fails if either mechanism is deleted.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const STYLES = read('css/styles.css');
const ANALYTICS = read('css/analytics.css');

/** Pull a rule body out of a stylesheet by exact selector. */
function rule(css, selector, label = selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `${label} rule not found`);
  return m[1];
}

// ── The tokens themselves ────────────────────────────────────────────────────

test('--safe-top and --safe-bottom consult BOTH inset sources', () => {
  for (const token of ['--safe-top', '--safe-bottom']) {
    const m = STYLES.match(new RegExp(`${token}:\\s*([^;]+);`));
    assert.ok(m, `${token} must be defined in css/styles.css`);
    const value = m[1];
    assert.match(value, /max\(/, `${token} must use max() to take whichever source reports`);
    assert.match(value, /env\(safe-area-inset-/, `${token} must consult env() for browsers/PWAs/notched devices`);
    assert.match(
      value,
      /var\(--app-safe-/,
      `${token} must consult the Android shell variable — env() alone is 0px on a notchless ` +
        'Android device, so the app would still draw under the system bars',
    );
    assert.match(value, /0px/, `${token} must default to 0px so desktop layout is unchanged`);
  }
});

// ── The surfaces that must consume them ──────────────────────────────────────

test('every primary destination clears the top inset', () => {
  // .view-container wraps Home, Train, Progress, Plans and Profile. This is the
  // regression that hid the avatar button at y=26px behind a 48px status bar.
  const body = rule(STYLES, '.view-container');
  assert.match(
    body,
    /padding-top:\s*calc\([^;]*var\(--safe-top\)/,
    '.view-container must pad its top from var(--safe-top)',
  );
  // The env()-only line must remain FIRST as a fallback, so an engine that
  // cannot resolve the token keeps the previously shipping clearance instead of
  // collapsing to none.
  const paddings = [...body.matchAll(/padding-top:\s*([^;]+);/g)].map(m => m[1]);
  assert.ok(paddings.length >= 2, '.view-container must keep a fallback padding-top before the token line');
  assert.doesNotMatch(paddings[0], /--safe-top/, 'the first padding-top must be the token-free fallback');
});

test('full-screen surfaces that hold content clear the top inset', () => {
  // Backdrops (.sheet-backdrop, .fasting-sheet-backdrop, .settings-overlay) are
  // deliberately absent: they render no content, so padding them does nothing.
  // The content surfaces they sit behind are what must clear the bar.
  for (const [css, selector, label] of [
    [STYLES, '.modal-overlay', '.modal-overlay (generic/confirm dialogs)'],
    [STYLES, '.ob-step', '.ob-step (first-run onboarding)'],
    [STYLES, '.auth-overlay', '.auth-overlay (sign in)'],
    [STYLES, '.migration-recovery', '.migration-recovery (data recovery)'],
  ]) {
    assert.match(
      rule(css, selector, label),
      /var\(--safe-top\)/,
      `${label} must clear the status bar via var(--safe-top)`,
    );
  }
});

test('the sticky analytics week navigator clears the top inset', () => {
  // Sticky resolves against the scrollport, not the padded .view-container, so
  // top:0 parks the week steppers under the status bar as soon as the page
  // scrolls.
  const body = rule(ANALYTICS, '.week-nav-bar');
  assert.match(body, /top:\s*var\(--safe-top\)/, '.week-nav-bar must stick below the safe-area inset');
  const tops = [...body.matchAll(/(?:^|\s)top:\s*([^;]+);/g)].map(m => m[1].trim());
  assert.ok(tops.length >= 2, '.week-nav-bar must keep a literal top fallback before the token line');
  assert.doesNotMatch(tops[0], /--safe-top/, 'the first top declaration must be the token-free fallback');
});

test('bottom-anchored sheets clear the bottom inset', () => {
  for (const [selector, label] of [
    ['.bottom-sheet', '.bottom-sheet'],
    ['.profile-customiser-sheet', '.profile-customiser-sheet'],
    ['.fasting-sheet', '.fasting-sheet'],
  ]) {
    assert.match(
      rule(STYLES, selector, label),
      /padding-bottom:\s*calc\([^;]*var\(--safe-bottom\)/,
      `${label} must pad its bottom from var(--safe-bottom)`,
    );
  }
});

test('sheets capped to viewport height use dvh, not vh alone', () => {
  // vh tracks the LARGEST viewport (URL bar hidden); dvh tracks the current
  // visual one. A vh-only cap can size a sheet taller than the screen and push
  // its header out of view.
  for (const [selector, label] of [
    ['.bottom-sheet', '.bottom-sheet'],
    ['.program-workout-picker', '.program-workout-picker'],
    ['.profile-customiser-sheet', '.profile-customiser-sheet'],
  ]) {
    const bodies = [...STYLES.matchAll(
      new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'),
    )].map(m => m[1]).join('\n');
    assert.ok(bodies, `${label} rule not found`);
    if (/max-height:[^;]*\dvh/.test(bodies)) {
      assert.match(bodies, /max-height:[^;]*\ddvh/, `${label} caps height in vh but never in dvh`);
    }
  }
});

// ── The Settings surface the original guard protected ────────────────────────

test('settings header still pads its top by the safe-area inset', () => {
  const body = rule(STYLES, '.settings-header');
  assert.match(body, /padding:\s*calc\([^;]*safe-area-inset-top/, 'settings-header must consult env()');
  assert.match(body, /--app-safe-top/, 'settings-header must consult the Android shell variable');

  const paddings = [...body.matchAll(/padding:\s*([^;]+);/g)].map(m => m[1].trim());
  assert.ok(paddings.length >= 2, 'expected a fallback padding before the calc() padding');
  assert.ok(
    !/calc\(|max\(|env\(|var\(/.test(paddings[0]),
    `first padding must be a literal fallback, got: ${paddings[0]}`,
  );
});

test('the close button is not individually offset off the status bar', () => {
  // The header owns the inset. A margin/top on the button itself would decouple
  // it from the avatar row — exactly the one-off hack this system avoids.
  assert.doesNotMatch(
    rule(STYLES, '.settings-close-btn'),
    /safe-area-inset|--app-safe-top|--safe-top/,
    'the safe-area inset belongs on .settings-header, not on the button',
  );
});

test('the close button keeps a 44px+ touch target', () => {
  assert.match(STYLES, /--touch-target:\s*(4[4-9]|[5-9]\d)px/, '--touch-target must stay at least 44px');
  assert.match(
    STYLES,
    /\.settings-close-btn,\s*\n\s*\.sheet-close-btn\s*\{\s*\n\s*width:\s*var\(--touch-target\);\s*\n\s*height:\s*var\(--touch-target\);/,
    '.settings-close-btn must be sized from --touch-target',
  );
});

// ── The native half ──────────────────────────────────────────────────────────

test('the Android shell publishes --app-safe-top from the real status-bar inset', () => {
  const kt = read('android/app/src/main/java/com/helyx/app/MainActivity.kt');

  assert.match(kt, /setOnApplyWindowInsetsListener/, 'MainActivity must observe window insets');
  assert.match(
    kt,
    /Type\.statusBars\(\)\s*or\s*WindowInsetsCompat\.Type\.displayCutout\(\)/,
    'the inset must union statusBars() and displayCutout()',
  );
  assert.match(kt, /setProperty\('--app-safe-top'/, 'MainActivity must publish the inset as --app-safe-top');
  // px -> CSS px. Publishing raw device pixels would over-pad on every phone
  // with a density above 1.
  assert.match(kt, /displayMetrics\.density/, 'the inset must be converted from device px to CSS px');
  // A comma-decimal locale would emit "24,5px", which is invalid CSS.
  assert.match(kt, /String\.format\(\s*Locale\.US/, 'the CSS length must be formatted with Locale.US');
  // The insets listener fires before the document exists on first load.
  assert.match(kt, /override fun onPageFinished/, 'the value must be republished on page load');
});

test('the Android shell stays edge-to-edge (the reason the inset is needed)', () => {
  assert.match(
    read('android/app/src/main/java/com/helyx/app/MainActivity.kt'),
    /setDecorFitsSystemWindows\(window,\s*false\)/,
    'if this ever becomes true the WebView no longer draws behind the status bar ' +
      'and the --app-safe-top plumbing should be revisited',
  );
});

// ── The check that proves it at runtime must stay wired in ───────────────────

test('the safe-area browser check is registered in the required suite', () => {
  assert.match(
    read('scripts/run-browser-checks.mjs'),
    /scripts\/safe-area-browser-check\.mjs/,
    'safe-area-browser-check.mjs must run in the required browser suite — it is the ' +
      'only check that publishes a non-zero inset, so without it this defect class is ' +
      'invisible again',
  );
});
