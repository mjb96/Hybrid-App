// =============================================================================
// ACTIVE RUN BROWSER CHECK — roadmap Phase 2C
//
// Drives the real cockpit through a real (mocked-fix) GPS session and asserts
// the active-run contract:
//   - the live numbers are in the athlete's own distance unit, and the label
//     says which unit that is — the tracker was the one surface in the app
//     showing raw kilometres to a miles athlete;
//   - the live figure and the value Stop writes into the cockpit input are the
//     same number, so finishing a run never appears to change the distance;
//   - a live signal state is visible and reflects the last fix;
//   - while the run is live, setup / manual entry / watch import step out of
//     the way, and come back the moment it ends;
//   - a re-render (tapping another day mid-run) cannot collapse the live run
//     out of view — `.run-collapsed` hides the whole card body, and the
//     re-render adds it on any day with no scheduled run, which is exactly when
//     an unscheduled run is being tracked.
//
// GPS fixes are injected through a stubbed `watchPosition` rather than
// Playwright geolocation so the accuracy and spacing of every fix is exact —
// the quality tiers being asserted are accuracy thresholds.
// =============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserContext, resolveChromium, pinClock } from './browser-runtime.mjs';

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
  } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
const STORAGE_KEY = 'hybrid_engine_v2_state';
const TZ = 'Australia/Sydney';

// PINNED, not read from the clock. The workout picker lists only non-rest program
// days, and `hybrid_engine` rests on Sunday — so on a Sunday `DAY` was absent from
// the choices, the check fell through to another day, and every DAY-keyed
// assertion after it failed. Monday is a training day in this programme.
const today = '2026-08-03';
const DAY = 'mon';
const CLOCK = Date.parse(`${today}T09:00:00+10:00`);

function fixture(distanceUnit) {
  return {
    schemaVersion: 5, currentWeek: '2', activeProgramId: 'hybrid_engine', activeActivationId: 'a1',
    settings: {
      name: 'Runner', theme: 'dark', weightUnit: 'kg', distanceUnit,
      weekStartDay: 'mon', onboardingComplete: true,
    },
    weeks: { '2': { activationId: 'a1', dates: { [DAY]: today }, lifts: { [DAY]: {} } } },
  };
}

// Fixes 100 m apart at 20 s of simulated separation: inside the 30 s continuity
// window, comfortably above the 5 m jitter floor, and 5 m/s — a real run pace,
// nowhere near the teleport ceiling.
const FIX_COUNT = 5;
const STEP_LAT = 0.0009;

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];

async function session(distanceUnit, width = 390, theme = 'dark', { deny = false } = {}) {
  const context = await createBrowserContext(browser, { viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(fixture(distanceUnit))]);
  await context.addInitScript(pinClock, CLOCK);
  await context.addInitScript((denyPermission) => {
    // Deterministic fix injection: the app's own watchPosition contract, with
    // this test choosing every coordinate, accuracy and timestamp — and, when
    // asked, the exact GeolocationPositionError the browser would raise.
    let cb = null;
    let errCb = null;
    const base = { lat: -33.865, lng: 151.2095, t: Date.now() };
    /** @type {any} */ (window).__gpsFeed = (index, accuracyM) => {
      if (!cb) return false;
      cb({
        coords: { latitude: base.lat + index * 0.0009, longitude: base.lng, accuracy: accuracyM },
        timestamp: base.t + index * 20_000,
      });
      return true;
    };
    /** @type {any} */ (window).__gpsFail = (err) => { if (errCb) errCb(err); };
    navigator.geolocation.watchPosition = (success, failure) => {
      cb = success; errCb = failure;
      if (denyPermission) setTimeout(() => failure({ code: 1, message: 'User denied Geolocation' }), 40);
      return 1;
    };
    navigator.geolocation.clearWatch = () => { cb = null; errCb = null; };
  }, deny);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page, errors };
}

/**
 * Train opens on its landing page, not the cockpit — the cockpit is entered by
 * picking today's session from it. Anything that only reaches the landing would
 * leave every visibility assertion below testing a hidden card.
 */
async function openRunCard(page) {
  await page.evaluate(() => /** @type {any} */ (document.querySelector('.bottom-nav .nav-item[data-target="workout"]'))?.click());
  await page.waitForTimeout(500);
  await page.evaluate((day) => {
    const choices = [...document.querySelectorAll('[data-action="select-program-workout"]')];
    const pick = choices.find((el) => el.getAttribute('data-day') === day) || choices[0];
    if (pick) /** @type {any} */ (pick).click();
  }, DAY);
  await page.waitForTimeout(800);
  const opened = await page.evaluate(() =>
    !!(/** @type {any} */ (document.getElementById('cockpitRunPanel'))?.offsetParent));
  if (!opened) throw new Error('the cockpit run card never became visible — fixture or entry path is wrong');
  // The card is collapsed on a day with no scheduled run; expand it the way the
  // athlete would, so an unscheduled run is what gets driven here.
  await page.evaluate(() => /** @type {any} */ (document.querySelector('#cockpitRunPanel .run-add-strip'))?.click());
  await page.waitForTimeout(300);
}

/** Start a run and feed it `count` fixes at the given accuracy. */
async function runFixes(page, { count = FIX_COUNT, accuracyM = 8 } = {}) {
  await page.evaluate(async ([day]) => {
    const mod = await import('/js/gps-tracker.js');
    await mod.startTracking('run', false, { week: '2', day });
  }, [DAY]);
  await page.waitForTimeout(200);
  for (let i = 0; i < count; i += 1) {
    await page.evaluate(([index, acc]) => /** @type {any} */ (window).__gpsFeed(index, acc), [i, accuracyM]);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
}

try {
  // ── The live numbers speak the athlete's unit ─────────────────────────────
  for (const [unit, label, paceLabel] of [['km', 'KM', 'PACE /KM'], ['mi', 'MI', 'PACE /MI']]) {
    const { context, page, errors } = await session(unit);
    await openRunCard(page);
    await runFixes(page);
    const seen = await page.evaluate(() => ({
      dist: document.getElementById('gpsStatDist')?.textContent?.trim(),
      distLabel: document.getElementById('gpsDistUnitLabel')?.textContent?.trim(),
      paceLabel: document.getElementById('gpsPaceUnitLabel')?.textContent?.trim(),
      livePanelShown: document.getElementById('gpsLivePanel')?.style.display === 'block',
      signalLevel: document.getElementById('gpsSignal')?.dataset.level,
      signalLabel: document.getElementById('gpsSignalLabel')?.textContent?.trim(),
      signalDetail: document.getElementById('gpsSignalDetail')?.textContent?.trim(),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    console.log(`live run (${unit}):`, JSON.stringify(seen));
    if (!seen.livePanelShown) failures.push(`${unit}: the live panel must be showing after valid fixes`);
    if (seen.distLabel !== label) failures.push(`${unit}: distance label must be "${label}", got "${seen.distLabel}"`);
    if (seen.paceLabel !== paceLabel) failures.push(`${unit}: pace label must be "${paceLabel}", got "${seen.paceLabel}"`);
    if (seen.signalLevel !== 'strong') failures.push(`${unit}: 8 m fixes must read as a strong signal, got "${seen.signalLevel}"`);
    if (!/±8 m/.test(seen.signalDetail || '')) failures.push(`${unit}: the signal must state the accuracy, got "${seen.signalDetail}"`);
    if (!seen.signalLabel) failures.push(`${unit}: the signal chip must be labelled`);
    if (seen.overflow) failures.push(`${unit}: horizontal overflow on the live run surface`);

    // 4 accepted movements of ~100 m ≈ 0.40 km. The number shown must be the
    // athlete's unit — the defect this phase fixes is it always being km.
    const shown = Number(seen.dist);
    const expectedKm = 0.4;
    const expected = unit === 'mi' ? expectedKm * 0.621371 : expectedKm;
    if (!Number.isFinite(shown) || Math.abs(shown - expected) > 0.06) {
      failures.push(`${unit}: live distance ${seen.dist} is not ~${expected.toFixed(2)} ${unit}`);
    }
    if (errors.length) failures.push(`${unit}: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Live figure and the saved figure are the same number ─────────────────
  {
    const { context, page } = await session('mi');
    await openRunCard(page);
    await runFixes(page);
    const live = await page.evaluate(() => document.getElementById('gpsStatDist')?.textContent?.trim());
    await page.evaluate(async ([day]) => {
      const mod = await import('/js/gps-tracker.js');
      await mod.stopTracking('2', day);
    }, [DAY]);
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({
      input: /** @type {any} */ (document.getElementById('runInputDist'))?.value,
      importVisible: !!(/** @type {any} */ (document.querySelector('#cockpitRunPanel .fit-import-tile--run'))?.offsetParent),
      inputsVisible: !!(/** @type {any} */ (document.querySelector('#cockpitRunPanel .run-grid-inputs'))?.offsetParent),
      focusMode: document.getElementById('cockpitRunPanel')?.classList.contains('run-session-active'),
    }));
    console.log('stop round-trip:', JSON.stringify({ live, ...after }));
    if (live !== after.input) {
      failures.push(`the distance must not change on Stop: live "${live}" vs input "${after.input}"`);
    }
    if (after.focusMode) failures.push('focus mode must end with the run');
    if (!after.importVisible) failures.push('the watch import must return once the run has ended');
    if (!after.inputsVisible) failures.push('manual entry must return once the run has ended — it holds the run for review');
    await context.close();
  }

  // ── Focus mode: the live run is the only thing competing for the card ────
  {
    const { context, page } = await session('km');
    await openRunCard(page);
    const before = await page.evaluate(() => {
      const vis = (el) => !!el && !!(/** @type {any} */ (el).offsetParent);
      return {
        import: vis(document.querySelector('#cockpitRunPanel .fit-import-tile--run')),
        inputs: vis(document.querySelector('#cockpitRunPanel .run-grid-inputs')),
      };
    });
    await runFixes(page);
    const during = await page.evaluate(() => {
      const vis = (el) => !!el && !!(/** @type {any} */ (el).offsetParent);
      return {
        import: vis(document.querySelector('#cockpitRunPanel .fit-import-tile--run')),
        inputs: vis(document.querySelector('#cockpitRunPanel .run-grid-inputs')),
        notes: vis(document.querySelector('#cockpitRunPanel .run-notes-input')),
        live: vis(document.getElementById('gpsLivePanel')),
        pauseHeight: document.getElementById('gpsPauseBtn')?.getBoundingClientRect().height || 0,
        stopHeight: document.querySelector('#gpsLivePanel [data-action="gps-stop"]')?.getBoundingClientRect().height || 0,
      };
    });
    console.log('focus mode:', JSON.stringify({ before, during }));
    if (!before.import || !before.inputs) failures.push('setup controls must be present before a run starts');
    if (during.import) failures.push('the watch import must not compete with a live run');
    if (during.inputs) failures.push('manual distance/time entry must not compete with a live run');
    if (during.notes) failures.push('the notes field must not compete with a live run');
    if (!during.live) failures.push('the live panel must be visible during a run');
    if (during.pauseHeight < 43 || during.stopHeight < 43) {
      failures.push(`pause/finish must stay at the 44px target, got ${during.pauseHeight}/${during.stopHeight}`);
    }
    await context.close();
  }

  // ── A live run survives a re-render on another day ────────────────────────
  {
    const { context, page, errors } = await session('km');
    await openRunCard(page);
    await runFixes(page);
    const other = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].find((d) => d !== DAY);
    await page.evaluate((day) => {
      /** @type {any} */ (document.querySelector(`[data-action="set-day"][data-day="${day}"]`))?.click();
    }, other);
    await page.waitForTimeout(700);
    const seen = await page.evaluate(() => {
      const live = document.getElementById('gpsLivePanel');
      return {
        collapsed: document.getElementById('cockpitRunPanel')?.classList.contains('run-collapsed'),
        live: !!live && !!(/** @type {any} */ (live).offsetParent),
        time: document.getElementById('gpsStatTime')?.textContent?.trim(),
      };
    });
    console.log(`re-render on ${other}:`, JSON.stringify(seen));
    if (seen.collapsed) failures.push('a re-render must not collapse a live run out of view');
    if (!seen.live) failures.push('the live run panel must survive a re-render');
    if (errors.length) failures.push(`re-render browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── A denied permission is a state, not a vanishing toast ────────────────
  {
    // This is the regression that made the notice necessary: Quick Start opened
    // a full-screen Activity view, the web error path called showPanel('start'),
    // and that scope has no start panel — leaving "← Cancel" and nothing else.
    const { context, page, errors } = await session('km', 390, 'dark', { deny: true });
    await page.evaluate(() => {
      const start = document.querySelector('[data-action="qs-run"]')
        || document.querySelector('[data-action="quick-activity"][data-type="run"]');
      if (start) /** @type {any} */ (start).click();
    });
    await page.waitForTimeout(1200);
    const seen = await page.evaluate(() => {
      const screen = document.getElementById('activityScreen');
      const notice = document.getElementById('qsNotice');
      const vis = (el) => !!el && !!(/** @type {any} */ (el).offsetParent);
      return {
        screenOpen: !!screen && screen.style.display !== 'none',
        noticeShown: vis(notice),
        kind: notice?.dataset.kind,
        title: document.getElementById('qsNoticeTitle')?.textContent?.trim(),
        body: document.getElementById('qsNoticeBody')?.textContent?.trim() || '',
        retryShown: vis(document.getElementById('qsNoticeRetry')),
        retryHeight: document.getElementById('qsNoticeRetry')?.getBoundingClientRect().height || 0,
        background: document.getElementById('qsBackgroundNote')?.textContent?.trim() || '',
        bodyText: (screen?.innerText || '').replace(/\s+/g, ' ').trim(),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    console.log('permission denied:', JSON.stringify(seen));
    if (!seen.screenOpen) failures.push('the Activity screen must stay open to explain the refusal');
    if (!seen.noticeShown) failures.push('a denied permission must leave a visible explanation');
    if (seen.kind !== 'permission') failures.push(`notice kind must be permission, got "${seen.kind}"`);
    if (!/settings/i.test(seen.body)) failures.push('the notice must point at the setting only the athlete can change');
    if (!seen.retryShown) failures.push('the blocked screen must offer a way forward');
    if (seen.retryHeight < 43) failures.push(`retry must meet the 44px target, got ${seen.retryHeight}`);
    if (!/lock the screen/i.test(seen.background)) failures.push('the web build must admit it stops in the background');
    // The bug in one assertion: the screen must say more than its chrome.
    if (seen.bodyText.replace(/[^a-z]/gi, '').length < 60) {
      failures.push(`the blocked screen is effectively blank: "${seen.bodyText}"`);
    }
    if (seen.overflow) failures.push('horizontal overflow on the blocked Activity screen');
    if (errors.length) failures.push(`denied-permission browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── A dropout mid-run does not throw the run away ─────────────────────────
  {
    const { context, page } = await session('km');
    await openRunCard(page);
    await runFixes(page);
    const before = await page.evaluate(() => document.getElementById('gpsStatDist')?.textContent?.trim());
    await page.evaluate(() => /** @type {any} */ (window).__gpsFail({ code: 2, message: 'position unavailable' }));
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({
      dist: document.getElementById('gpsStatDist')?.textContent?.trim(),
      live: !!(/** @type {any} */ (document.getElementById('gpsLivePanel'))?.offsetParent),
      notice: !!(/** @type {any} */ (document.getElementById('gpsNotice'))?.offsetParent),
    }));
    console.log('mid-run dropout:', JSON.stringify({ before, ...after }));
    if (!after.live) failures.push('a mid-run dropout must not end the session');
    if (after.dist !== before) failures.push(`a dropout must not discard recorded distance: ${before} → ${after.dist}`);
    if (after.notice) failures.push('a transient dropout must not raise a blocking notice over a live run');
    await context.close();
  }

  // ── Pause is reported as paused, not as signal loss ───────────────────────
  {
    const { context, page } = await session('km');
    await openRunCard(page);
    await runFixes(page);
    await page.evaluate(async () => {
      const mod = await import('/js/gps-tracker.js');
      mod.pauseTracking();
    });
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => ({
      level: document.getElementById('gpsSignal')?.dataset.level,
      label: document.getElementById('gpsSignalLabel')?.textContent?.trim(),
      pauseBtn: document.getElementById('gpsPauseBtn')?.textContent?.trim(),
    }));
    console.log('paused:', JSON.stringify(seen));
    if (seen.level !== 'paused') failures.push(`a paused run must read as paused, got "${seen.level}"`);
    if (!/resume/i.test(seen.pauseBtn || '')) failures.push(`pause must offer Resume, got "${seen.pauseBtn}"`);
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
console.log('Active run contract passed.');
