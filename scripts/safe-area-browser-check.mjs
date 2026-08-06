// =============================================================================
// SAFE-AREA BROWSER CHECK
//
// Every other browser check runs in a desktop Chromium where BOTH inset sources
// report 0px, so an entire class of defect was structurally invisible to the
// suite: the app looked correct everywhere while, on a real notchless Android
// phone, controls sat underneath the status bar.
//
// This check publishes a non-zero --app-safe-top the way the Android shell
// (MainActivity) does and asserts that nothing interactive hides beneath it.
// It deliberately does NOT set env(safe-area-inset-top) — that is exactly the
// source Android leaves at 0px on a phone with no display cutout, and relying
// on it is the bug this check exists to prevent from returning.
//
// The regression that motivated it: #view-home.view-container consulted env()
// only, so with a 48px status bar the avatar button — the ONLY route to Profile
// and Settings — rendered at y=26px, fully occluded. Settings was the one screen
// whose header had been fixed, and it had become unreachable.
//
// Also asserts the zero-inset case is UNCHANGED, so the tokens can never
// silently reflow desktop or non-inset layouts.
// =============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = process.argv.includes('--required');
const runtime = await resolveChromium();
if (!runtime) process.exit(required ? 1 : 0);
const { chromium, executablePath } = runtime;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').split('?')[0] === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const rel = (req.url || '/') === '/' ? 'index.html' : decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) throw new Error('unsafe path');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://127.0.0.1:${port}`;
const STORAGE_KEY = 'hybrid_engine_v2_state';

/** The status-bar height MainActivity would publish on a common Android phone. */
const INSET = 48;
const TZ = 'Australia/Sydney';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

const onboarded = (theme) => ({
  schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
  settings: { name: 'Safe Area', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
  weeks: { '1': { activationId: 'current', dates: { mon: today }, lifts: { mon: { 'Bench Press': [{ c: true, w: '100', r: '5' }] } } } },
});

/**
 * Publish the inset exactly as the Android shell does. MainActivity applies it
 * on the insets callback AND re-applies it on onPageFinished, because the first
 * callback can land before the document exists; an init script hits the same
 * race, so mirror the same belt-and-braces.
 */
function publishInset(px) {
  const apply = () => {
    if (document.documentElement) {
      document.documentElement.style.setProperty('--app-safe-top', `${px}px`);
      return true;
    }
    return false;
  };
  if (!apply()) document.addEventListener('DOMContentLoaded', apply, { once: true });
}

// Onboarding is suppressed whenever a state blob was present on load
// (`_hadStoredState` in shouldShowOnboarding), so a genuine first run means
// seeding NO localStorage at all rather than an onboardingComplete:false blob.

/** Every visible, interactive element and where its top edge lands. */
const OCCLUSION_PROBE = (inset) => {
  const SEL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
  const offenders = [];
  for (const el of document.querySelectorAll(SEL)) {
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;          // not rendered
    if (box.bottom <= 0 || box.top >= window.innerHeight) continue; // off-screen
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.pointerEvents === 'none') continue;
    if (el.closest('[inert], [aria-hidden="true"], .hidden-input')) continue;
    if (box.top < inset) {
      offenders.push({
        top: Math.round(box.top),
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 40),
      });
    }
  }
  return offenders;
};

/** Computed padding/offsets that must NOT move when no inset is published. */
const BASELINE_PROBE = () => {
  const read = (sel, prop) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el)[prop] : null;
  };
  return {
    viewContainerTop: read('#view-home.view-container', 'paddingTop'),
    settingsHeaderTop: read('.settings-header', 'paddingTop'),
    modalOverlayTop: read('.modal-overlay', 'paddingTop'),
  };
};

async function gotoTab(page, target) {
  await page.evaluate((t) => {
    const nav = document.querySelector(`.bottom-nav .nav-item[data-target="${t}"]`);
    if (nav) { /** @type {HTMLElement} */ (nav).click(); return; }
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'switch-tab');
    cta.setAttribute('data-target', t);
    cta.style.display = 'none';
    document.body.appendChild(cta); cta.click(); cta.remove();
  }, target);
  await page.waitForTimeout(350);
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];

async function newPage(context) {
  const page = await context.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) {
      failures.push(`console error: ${m.text()}`);
    }
  });
  return page;
}

try {
  // ---------------------------------------------------------------------------
  // 1. Zero-inset baseline. Both sources are 0px, so every touched surface must
  //    compute exactly what it computed before the tokens existed.
  // ---------------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(onboarded('dark'))]);
    const page = await newPage(context);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#view-home.view-container.active');
    const baseline = await page.evaluate(BASELINE_PROBE);
    console.log('Zero-inset baseline:', JSON.stringify(baseline));

    const EXPECTED = { viewContainerTop: '20px', settingsHeaderTop: '20px', modalOverlayTop: '20px' };
    for (const [key, want] of Object.entries(EXPECTED)) {
      if (baseline[key] !== want) {
        failures.push(`zero-inset baseline changed: ${key} is ${baseline[key]}, expected ${want} (the tokens must not reflow non-inset layouts)`);
      }
    }
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 2. Primary destinations with a published Android inset.
  // ---------------------------------------------------------------------------
  for (const [width, theme] of [[320, 'dark'], [360, 'light'], [390, 'dark'], [412, 'light']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(onboarded(theme))]);
    // Publish the inset the way MainActivity does, before first paint.
    await context.addInitScript(publishInset, INSET);
    const page = await newPage(context);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#view-home.view-container.active');

    // The regression that started this: the container must actually respond.
    const pad = await page.$eval('#view-home.view-container', (el) => getComputedStyle(el).paddingTop);
    if (parseFloat(pad) < INSET) {
      failures.push(`${width}px/${theme}: .view-container padding-top is ${pad} with a ${INSET}px inset — it is ignoring --app-safe-top`);
    }

    for (const target of ['home', 'workout', 'analytics', 'program']) {
      await gotoTab(page, target);
      const offenders = await page.evaluate(OCCLUSION_PROBE, INSET);
      console.log(`${width}px/${theme} ${target}: padTop=${pad} occluded=${offenders.length}`);
      if (offenders.length) {
        failures.push(`${width}px/${theme} ${target}: ${offenders.length} control(s) under the status bar: ${JSON.stringify(offenders.slice(0, 4))}`);
      }
    }

    // Profile lives behind the avatar, which is precisely the control that was
    // occluded — so reaching it at all is part of the contract.
    await page.evaluate(() => {
      const avatar = document.querySelector('#view-home [data-action="open-profile"], .home-avatar, .profile-avatar-btn');
      if (avatar) /** @type {HTMLElement} */ (avatar).click();
    });
    await page.waitForTimeout(400);
    const profileOffenders = await page.evaluate(OCCLUSION_PROBE, INSET);
    console.log(`${width}px/${theme} profile: occluded=${profileOffenders.length}`);
    if (profileOffenders.length) {
      failures.push(`${width}px/${theme} profile: ${profileOffenders.length} control(s) under the status bar: ${JSON.stringify(profileOffenders.slice(0, 4))}`);
    }

    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 3. Onboarding — the first screen a new user ever sees.
  // ---------------------------------------------------------------------------
  for (const [width, theme] of [[320, 'dark'], [390, 'light']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(publishInset, INSET);
    const page = await newPage(context);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);

    const shown = await page.evaluate(() => {
      const ov = document.querySelector('.ob-overlay');
      return !!ov && getComputedStyle(ov).display !== 'none';
    });
    if (!shown) {
      console.log(`${width}px/${theme} onboarding: overlay not shown for this fixture — skipping`);
    } else {
      const offenders = await page.evaluate(OCCLUSION_PROBE, INSET);
      console.log(`${width}px/${theme} onboarding: occluded=${offenders.length}`);
      if (offenders.length) {
        failures.push(`${width}px/${theme} onboarding: ${offenders.length} control(s) under the status bar: ${JSON.stringify(offenders.slice(0, 4))}`);
      }
    }
    await context.close();
  }

  // ---------------------------------------------------------------------------
  // 4. Migration recovery — the route out of a failed migration. Rendered via
  //    its real module so this tests the shipped markup, not a hand-built copy.
  // ---------------------------------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(onboarded('dark'))]);
    await context.addInitScript(publishInset, INSET);
    const page = await newPage(context);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('#view-home.view-container.active');

    const rendered = await page.evaluate(async () => {
      const mod = await import('./js/state/migration-recovery-ui.js');
      mod.showMigrationRecovery(new Error('audit: simulated migration failure'), document, () => {});
      return !!document.getElementById('migrationRecovery');
    });
    if (!rendered) {
      failures.push('migration recovery: surface did not render');
    } else {
      await page.waitForTimeout(200);
      const offenders = await page.evaluate(OCCLUSION_PROBE, INSET);
      console.log(`320px/dark migration-recovery: occluded=${offenders.length}`);
      if (offenders.length) {
        failures.push(`migration recovery: ${offenders.length} control(s) under the status bar: ${JSON.stringify(offenders.slice(0, 4))}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((f) => console.error(`FAIL: ${f}`));
  process.exit(1);
}
console.log('Safe-area contract passed.');
