// =============================================================================
// SET ROW BROWSER CHECK — roadmap Phase 2A
//
// Two set-row contract requirements, driven through the real cockpit:
//
//   "previous values visible"     — last time's numbers stay on screen WHILE
//                                   typing, not only until the first keystroke
//                                   clears the placeholder.
//   "invalid input explained inline" — the complaint lands on the offending
//                                   row, not in a toast that appears elsewhere
//                                   and is gone before you look up.
//
// The load-bearing assertion is the negative weight. setVolume is
// parseFloat(w) * parseInt(r), so a stored -50 SUBTRACTS from tonnage, weekly
// volume, muscle credits and every landmark built on them. This check exists to
// prove the tick is refused and nothing reaches state.
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

// A prior session of the same Thursday lifts, dated in the past so it is
// unambiguously "last time". Archived on purpose: history must survive a
// program switch, and the previous-values line is a reader of stamped dates.
function fixture(theme) {
  const done = (w, r) => ({ w: String(w), r: String(r), c: true });
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Row', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: {
      'arch:old:1': {
        activationId: 'old', programId: 'hybrid_engine',
        dates: { thu: '2026-07-16' },
        lifts: {
          thu: {
            'Incline Barbell Press': [done(60, 8), done(62.5, 8), done(65, 6), done(65, 6)],
            'Seated DB Shoulder Press': [done(22.5, 10), done(22.5, 10), done(22.5, 9)],
          },
        },
        runs: {}, notes: {}, gymRpe: {}, gymStats: {},
      },
    },
  };
}

async function enterCockpit(page) {
  await page.click('.nav-item[data-target="workout"]');
  await page.waitForSelector('#trainLanding [data-action="qs-workout"]');
  await page.click('#trainLanding [data-action="qs-workout"]');
  await page.waitForSelector('#trainCockpit:not([hidden])');
  await page.click('#cockpitDaySelectorBar .day-pill[data-day="thu"]');
  await page.waitForSelector('#cockpitExercisesContainer .cockpit-exercise');
}

/** Type into the open card's first working row and tick it. */
const attemptLog = (page, weight, reps) => page.evaluate(([w, r]) => {
  const card = document.querySelector('.cockpit-exercise:not(.collapsed)');
  const row = card?.querySelector('.cockpit-set-row');
  const wIn = row?.querySelector('.input-weight-node');
  const rIn = row?.querySelector('.input-reps-node');
  if (wIn) { wIn.value = w; wIn.dispatchEvent(new Event('input', { bubbles: true })); }
  if (rIn) { rIn.value = r; rIn.dispatchEvent(new Event('input', { bubbles: true })); }
  row?.querySelector('.gym-check')?.click();
}, [weight, reps]);

const readRow = (page) => page.evaluate(() => {
  const card = document.querySelector('.cockpit-exercise:not(.collapsed)');
  const row = card?.querySelector('.cockpit-set-row');
  const msg = row?.querySelector('.set-row-msg');
  return {
    ticked: !!row?.querySelector('.gym-check')?.checked,
    complete: !!row?.classList.contains('is-complete'),
    message: msg && !msg.hidden ? msg.textContent.trim() : '',
    warning: !!msg?.classList.contains('is-warning'),
  };
});

/** What actually reached state — the only thing analytics will ever read. */
const storedFirstSet = (page, lift) => page.evaluate((name) => {
  const state = JSON.parse(localStorage.getItem('hybrid_engine_v2_state') || '{}');
  const sets = state.weeks?.['1']?.lifts?.thu?.[name];
  return Array.isArray(sets) ? sets[0] : null;
}, lift);

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

    // ---- previous values are visible, and stay visible while typing ---------
    const prev = await page.evaluate(() => {
      const card = document.querySelector('.cockpit-exercise:not(.collapsed)');
      return [...(card?.querySelectorAll('.cockpit-set-row .set-prev') || [])].map((n) => n.textContent.trim());
    });
    console.log(`${tag} previous-values:`, JSON.stringify(prev));
    if (!prev.length) fail(`${tag}: no previous-values line despite a dated prior session`);
    if (prev[0] && !/60kg\s*×\s*8/.test(prev[0])) fail(`${tag}: first row shows "${prev[0]}", expected last time's 60kg × 8`);
    if (prev.some((t) => /undefined|NaN|--/.test(t))) fail(`${tag}: previous-values line rendered a placeholder: ${prev.join(' , ')}`);

    // ---- a negative weight is refused, and never reaches state --------------
    await attemptLog(page, '-50', '5');
    await page.waitForTimeout(250);
    let row = await readRow(page);
    console.log(`${tag} negative-weight:`, JSON.stringify(row));
    if (row.ticked || row.complete) fail(`${tag}: a -50 weight was accepted as a completed set`);
    if (!row.message) fail(`${tag}: negative weight refused with no inline message on the row`);
    if (row.message && !/negative/i.test(row.message)) fail(`${tag}: unhelpful message for a negative weight: "${row.message}"`);
    let stored = await storedFirstSet(page, 'Incline Barbell Press');
    if (stored?.c) fail(`${tag}: a refused set was still stored complete: ${JSON.stringify(stored)}`);

    // The line must stay put while typing — that is the whole point of it.
    const prevStillThere = await page.evaluate(() =>
      !!document.querySelector('.cockpit-exercise:not(.collapsed) .cockpit-set-row .set-prev')?.textContent.trim());
    if (!prevStillThere) fail(`${tag}: previous-values line disappeared once the field had a value`);

    // ---- zero reps is refused ----------------------------------------------
    await attemptLog(page, '60', '0');
    await page.waitForTimeout(250);
    row = await readRow(page);
    console.log(`${tag} zero-reps:`, JSON.stringify(row));
    if (row.ticked) fail(`${tag}: a 0-rep set was accepted as completed`);
    if (!row.message) fail(`${tag}: zero reps refused with no inline message`);

    // ---- editing clears the complaint --------------------------------------
    await page.evaluate(() => {
      const input = document.querySelector('.cockpit-exercise:not(.collapsed) .cockpit-set-row .input-reps-node');
      if (input) { input.value = '8'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.waitForTimeout(200);
    if ((await readRow(page)).message) fail(`${tag}: the error persisted after the athlete corrected the field`);

    // ---- a valid set logs cleanly ------------------------------------------
    await attemptLog(page, '62.5', '8');
    await page.waitForTimeout(400);
    row = await readRow(page);
    console.log(`${tag} valid:`, JSON.stringify(row));
    if (!row.ticked || !row.complete) fail(`${tag}: a valid 62.5 × 8 set was not accepted`);
    if (row.message) fail(`${tag}: a valid set was complained about: "${row.message}"`);
    stored = await storedFirstSet(page, 'Incline Barbell Press');
    if (!stored?.c || String(stored.w) !== '62.5' || String(stored.r) !== '8') {
      fail(`${tag}: stored set does not match what was logged: ${JSON.stringify(stored)}`);
    }

    // ---- layout -------------------------------------------------------------
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) {
      fail(`${tag}: page-level horizontal overflow`);
    }
    const clipped = await page.evaluate(() => [...document.querySelectorAll('.cockpit-set-row')]
      .filter((r) => r.scrollWidth > r.clientWidth + 1).length);
    if (clipped) fail(`${tag}: ${clipped} set rows overflow their own width`);

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
console.log('Set row entry contract passed.');
