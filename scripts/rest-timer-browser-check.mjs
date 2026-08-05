// =============================================================================
// REST TIMER + ROW ACTION PROMINENCE — roadmap Phase 2A
//
//   "Keep rest timing attached to the active exercise/set, with obvious
//    pause/skip/adjust controls."
//   "Completion is the strongest row action."
//   "Make add, swap, reorder, superset, warm-up and plate-math actions
//    contextual instead of equally prominent."
//
// The pause assertions matter most. The bar rendered a decorative "⏸ REST"
// label with no pause behind it — a control that looks real and does nothing
// teaches you to distrust the whole bar. This drives the real timer: pause it,
// prove the clock stops, resume it, prove it moves again.
//
// It also pins the thing pause could most easily break: a hold leaking into the
// next set, so that set's rest never counts down at all.
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
const TZ = 'Australia/Sydney';

const fixture = (theme) => ({
  schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
  settings: { name: 'Rest', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
  weeks: {},
});

async function enterCockpit(page) {
  await page.click('.nav-item[data-target="workout"]');
  await page.waitForSelector('#trainLanding [data-action="qs-workout"]');
  await page.click('#trainLanding [data-action="qs-workout"]');
  await page.waitForSelector('#trainCockpit:not([hidden])');
  await page.click('#cockpitDaySelectorBar .day-pill[data-day="thu"]');
  await page.waitForSelector('#cockpitExercisesContainer .cockpit-exercise');
}

/** Log the open card's set at `index`, which is what starts a rest period. */
const logSet = (page, index) => page.evaluate((i) => {
  const card = document.querySelector('.cockpit-exercise:not(.collapsed)');
  const row = card?.querySelectorAll('.cockpit-set-row')[i];
  const w = row?.querySelector('.input-weight-node');
  const r = row?.querySelector('.input-reps-node');
  if (w) { w.value = '60'; w.dispatchEvent(new Event('input', { bubbles: true })); }
  if (r) { r.value = '8'; r.dispatchEvent(new Event('input', { bubbles: true })); }
  row?.querySelector('.gym-check')?.click();
}, index);

const readTimer = (page) => page.evaluate(() => {
  const bar = document.getElementById('cockpitTimerBar');
  const btn = document.getElementById('restPauseBtn');
  return {
    active: !!bar?.classList.contains('active'),
    paused: !!bar?.classList.contains('rest-paused'),
    clock: document.getElementById('cockpitTimerClock')?.textContent?.trim() || '',
    label: btn?.textContent?.trim() || '',
    pressed: btn?.getAttribute('aria-pressed') || '',
    // Attached to the exercise being worked, not floating over the page.
    insideCard: !!bar?.closest('.cockpit-exercise'),
    btnHeight: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
  };
});

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
const fail = (m) => failures.push(m);
try {
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const tag = `${width}px/${theme}`;
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ['hybrid_engine_v2_state', JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterCockpit(page);

    // ---- completion is the strongest row action ----------------------------
    // Quick-log and the tick both complete a set; the tick is the primary one.
    const weight = await page.evaluate(() => {
      const row = document.querySelector('.cockpit-exercise:not(.collapsed) .cockpit-set-row');
      const quick = row?.querySelector('.set-num-lbl[data-action="quick-log"]');
      const check = row?.querySelector('.gym-check');
      const px = (v) => parseFloat(String(v).replace('px', '')) || 0;
      const qs = quick && getComputedStyle(quick);
      const cs = check && getComputedStyle(check);
      return {
        quickBorder: qs ? px(qs.borderTopWidth) : 0,
        checkBorder: cs ? px(cs.borderTopWidth) : 0,
        quickFilled: qs ? !/^rgba\(0, 0, 0, 0\)$|transparent/.test(qs.backgroundColor) : false,
        quickH: quick ? Math.round(quick.getBoundingClientRect().height) : 0,
        checkH: check ? Math.round(check.getBoundingClientRect().height) : 0,
      };
    });
    console.log(`${tag} prominence:`, JSON.stringify(weight));
    if (weight.quickFilled) fail(`${tag}: quick-log is still filled — it outshouts the completion tick`);
    if (weight.checkBorder <= weight.quickBorder) {
      fail(`${tag}: the completion tick (${weight.checkBorder}px border) is not drawn more strongly than quick-log (${weight.quickBorder}px)`);
    }
    // De-emphasising must not shrink the target.
    if (weight.quickH < 44) fail(`${tag}: quick-log fell to ${weight.quickH}px, below the 44px target`);

    // ---- + Warmup is contextual --------------------------------------------
    // Visibility, not presence: the control is hidden by CSS, so it stays in
    // the DOM. Counting nodes would pass whether or not it was ever hidden.
    const warmupVisible = () => page.evaluate(() => {
      const btn = document.querySelector('.cockpit-exercise:not(.collapsed) [data-action="append-warmup-set"]');
      return !!btn && btn.getBoundingClientRect().height > 0;
    });
    if (!await warmupVisible()) fail(`${tag}: + Warmup hidden before any work is logged, when it is exactly what you want`);

    // ---- logging a set starts a rest, attached to the exercise -------------
    await logSet(page, 0);
    await page.waitForTimeout(600);
    let t = await readTimer(page);
    console.log(`${tag} rest-start:`, JSON.stringify(t));
    if (!t.active) {
      // Report the console errors BEFORE bailing — a dead render shows up here
      // as a dozen confusing assertion failures unless its cause comes with it.
      fail(`${tag}: no rest timer started after logging a set`);
      if (errors.length) fail(`${tag}: browser errors: ${errors.join(' | ')}`);
      await context.close();
      continue;
    }
    if (!t.insideCard) fail(`${tag}: the rest bar is not attached to the active exercise card`);
    if (t.label !== '⏸ REST') fail(`${tag}: unexpected rest label "${t.label}"`);
    if (t.btnHeight < 44) fail(`${tag}: the pause control is ${t.btnHeight}px, below the 44px target`);

    if (await warmupVisible()) fail(`${tag}: + Warmup still offered at equal prominence after a working set was logged`);

    // ---- pause actually holds the clock ------------------------------------
    await page.click('#restPauseBtn');
    await page.waitForTimeout(150);
    t = await readTimer(page);
    if (!t.paused) fail(`${tag}: pressing pause did not put the bar in a paused state`);
    if (t.pressed !== 'true') fail(`${tag}: paused but aria-pressed is "${t.pressed}"`);
    if (!/paused/i.test(t.label)) fail(`${tag}: paused but the label still reads "${t.label}"`);

    const held = t.clock;
    await page.waitForTimeout(1800);
    const stillHeld = (await readTimer(page)).clock;
    console.log(`${tag} pause: ${held} -> ${stillHeld} after 1.8s`);
    if (stillHeld !== held) fail(`${tag}: the clock kept running while paused (${held} -> ${stillHeld})`);

    // ---- resume moves it again ---------------------------------------------
    await page.click('#restPauseBtn');
    await page.waitForTimeout(1600);
    t = await readTimer(page);
    console.log(`${tag} resume:`, JSON.stringify({ clock: t.clock, paused: t.paused }));
    if (t.paused) fail(`${tag}: still paused after pressing resume`);
    if (t.clock === stillHeld) fail(`${tag}: the clock did not resume counting (stuck at ${t.clock})`);

    // ---- a hold must not leak into the next set ----------------------------
    await page.click('#restPauseBtn');           // hold it again
    await page.waitForTimeout(150);
    await logSet(page, 1);                        // next set starts a new rest
    await page.waitForTimeout(300);
    t = await readTimer(page);
    const afterNew = t.clock;
    await page.waitForTimeout(1600);
    const movedOn = (await readTimer(page)).clock;
    console.log(`${tag} next-set:`, JSON.stringify({ paused: t.paused, afterNew, movedOn }));
    if (t.paused) fail(`${tag}: the next set's rest started already paused`);
    if (movedOn === afterNew) fail(`${tag}: the next set's rest never counted down (stuck at ${afterNew})`);

    // ---- Done ends it -------------------------------------------------------
    await page.click('[data-action="dismiss-rest"]');
    await page.waitForTimeout(250);
    t = await readTimer(page);
    if (t.active) fail(`${tag}: Done did not dismiss the rest timer`);
    if (t.paused) fail(`${tag}: dismissed but still flagged paused`);

    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) {
      fail(`${tag}: page-level horizontal overflow`);
    }
    if (errors.length) fail(`${tag}: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1);
}
console.log('Rest timer + row action contract passed.');
