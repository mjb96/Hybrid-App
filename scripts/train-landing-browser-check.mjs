// =============================================================================
// TRAIN LANDING BROWSER CHECK — roadmap Phase 0/2
//
// Train now opens on a landing rather than straight into the workout cockpit.
// That is a change to the app's most-used path, so this drives the real flow:
// the landing renders with today's session and one primary action, the primary
// action reaches the cockpit, the cockpit can get back, the nav tab always
// returns to the landing, and — most importantly — a session already in
// progress is never buried behind the landing.
// =============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium, pinClock } from './browser-runtime.mjs';

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
// PINNED, not read from the clock. `hybrid_engine` rests on Sunday, so on a
// Sunday the landing's primary action is "Log wellness check-in" rather than a
// workout — and every step below that clicks through to the cockpit failed.
const today = '2026-08-03';   // a Monday in Australia/Sydney
const CLOCK = Date.parse(`${today}T09:00:00+10:00`);
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const set = (w, r) => ({ c: true, w: String(w), r: String(r) });

function fixture(theme, extra = {}) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Trainer', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: { '1': {
      dates: { mon: addDays(today, -3) },
      gymStats: { mon: { time: '01:02' } },
      lifts: { mon: { 'Barbell Bench Press': [set(100, 5), set(100, 5)] } },
    } },
    ...extra,
  };
}

const goTrain = (page) => page.click('.nav-item[data-target="workout"]');

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ['hybrid_engine_v2_state', JSON.stringify(fixture(theme))]);
    await context.addInitScript(pinClock, CLOCK);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await goTrain(page);
    await page.waitForSelector('#view-workout.active #trainLanding .tl-today', { timeout: 5000 }).catch(() => {
      failures.push(`${width}px: Train did not open on the landing`);
    });

    const landing = await page.evaluate(() => {
      const l = document.getElementById('trainLanding');
      const c = document.getElementById('trainCockpit');
      return {
        landingVisible: !!l && !l.hidden,
        cockpitHidden: !!c && c.hidden,
        title: l?.querySelector('.tl-today__title')?.textContent?.trim(),
        primary: l?.querySelector('.tl-today__primary')?.textContent?.trim(),
        primaryCount: l?.querySelectorAll('.tl-today__primary').length,
        quickStarts: [...(l?.querySelectorAll('.tl-quick__item') || [])].map((b) => b.getAttribute('data-action')),
        recentRows: l?.querySelectorAll('.tl-recent__row').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        smallControls: [...(l?.querySelectorAll('button') || [])].filter((b) => {
          const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43;
        }).length,
      };
    });
    console.log(`Train landing ${width}px/${theme}:`, JSON.stringify(landing));

    if (!landing.landingVisible) failures.push(`${width}px: landing not visible`);
    if (!landing.cockpitHidden) failures.push(`${width}px: cockpit visible behind the landing`);
    if (!landing.title) failures.push(`${width}px: no today title`);
    // "One obvious primary action" is an interaction principle, not a nicety.
    if (landing.primaryCount !== 1) failures.push(`${width}px: expected exactly one primary action, got ${landing.primaryCount}`);
    for (const action of ['qs-workout', 'qs-run', 'qs-walk', 'qs-fast']) {
      if (!landing.quickStarts.includes(action)) failures.push(`${width}px: quick start missing ${action}`);
    }
    if (landing.recentRows < 1) failures.push(`${width}px: the logged session did not appear under Recent`);
    if (landing.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (landing.smallControls) failures.push(`${width}px: ${landing.smallControls} controls below the 44px target`);

    // The primary action must actually reach the cockpit.
    await page.click('.tl-today__primary');
    await page.waitForTimeout(350);
    const afterStart = await page.evaluate(() => {
      const c = document.getElementById('trainCockpit');
      const l = document.getElementById('trainLanding');
      return { cockpitVisible: !!c && !c.hidden, landingHidden: !!l && l.hidden, hasDaySelector: !!document.getElementById('cockpitDaySelectorBar') };
    });
    console.log(`Train cockpit ${width}px/${theme}:`, JSON.stringify(afterStart));
    if (!afterStart.cockpitVisible) failures.push(`${width}px: primary action did not open the cockpit`);
    if (!afterStart.landingHidden) failures.push(`${width}px: landing still visible inside the cockpit`);
    if (!afterStart.hasDaySelector) failures.push(`${width}px: cockpit lost its day selector`);

    // And the cockpit must offer a way back.
    await page.click('[data-action="back-to-train-landing"]');
    await page.waitForTimeout(350);
    const back = await page.evaluate(() => !document.getElementById('trainLanding').hidden);
    if (!back) failures.push(`${width}px: no way back from the cockpit to the landing`);

    // Re-entering Train from the nav always returns to the landing, even after
    // the cockpit was open — a top-level destination opens on its index.
    await page.click('[data-action="open-train-cockpit"], .tl-today__primary');
    await page.waitForTimeout(250);
    await page.click('.nav-item[data-target="home"]');
    await page.waitForTimeout(250);
    await goTrain(page);
    await page.waitForTimeout(350);
    const reEntry = await page.evaluate(() => !document.getElementById('trainLanding').hidden);
    if (!reEntry) failures.push(`${width}px: re-entering Train from the nav did not return to the landing`);

    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // An unfinished session must never be buried: the landing has to surface it
  // as resumable rather than offering a fresh start over the top of it.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
    // A real unfinished independent session: the state must POINT at it
    // (activeStrengthSessionKey) and the record must carry a sessionKind —
    // that is what activeOneOffSession/isOneOffWeek actually require.
    const sessionKey = 'session:str_test_1';
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ['hybrid_engine_v2_state', JSON.stringify(fixture('dark', {
      activeStrengthSessionKey: sessionKey,
      weeks: { [sessionKey]: {
        sessionId: 'str_test_1', sessionKind: 'empty', sessionTitle: 'Evening Push', sessionDay: 'mon',
        dates: { mon: today },
        lifts: { mon: { 'Barbell Bench Press': [set(100, 5), { c: false, w: '100', r: '5' }] } },
      } },
    }))]);
    await context.addInitScript(pinClock, CLOCK);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await goTrain(page);
    await page.waitForSelector('#trainLanding .tl-today', { timeout: 5000 }).catch(() => failures.push('in-progress: landing did not render'));
    const resume = await page.evaluate(() => {
      const l = document.getElementById('trainLanding');
      return {
        eyebrow: l?.querySelector('.tl-today__eyebrow')?.textContent?.trim(),
        primary: l?.querySelector('.tl-today__primary')?.textContent?.trim(),
        hasPip: !!l?.querySelector('.tl-today__pip'),
      };
    });
    console.log('Train landing in-progress:', JSON.stringify(resume));
    if (!/resume/i.test(resume.primary || '')) {
      failures.push(`in-progress: expected a Resume action, got "${resume.primary}"`);
    }
    if (!resume.hasPip) failures.push('in-progress: no visual marker that a session is under way');
    if (errors.length) failures.push(`in-progress: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1);
}
console.log('Train landing browser contract passed.');
