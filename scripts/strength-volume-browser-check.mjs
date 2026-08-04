// =============================================================================
// STRENGTH VOLUME BROWSER CHECK — roadmap Phase 3B
//
// Weekly Volume and Gym Performance were two screens answering "how much have
// I lifted" at different scopes, with no route between them, so the same
// question had two answers depending on which entry point you used. They are
// now one destination with two tabs.
//
// This pins the merge: legacy deep links still resolve and open the right tab,
// every control from BOTH old screens survives, and the merged screen has one
// title rather than two stacked headers (which would just be the old
// duplication, nested).
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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (key, amount) => {
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
};
const MON = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
const set = (w, r) => ({ c: true, w: String(w), r: String(r) });
const rep = (n, f) => Array.from({ length: n }, f);

function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Volume Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: { '1': {
      dates: { mon: MON, tue: addDays(MON, 1) },
      gymStats: { mon: { time: '01:05' }, tue: { time: '00:48' } },
      lifts: {
        mon: { 'Barbell Bench Press': rep(5, () => set(100, 8)) },
        tue: { 'Back Squat': rep(4, () => set(140, 5)) },
      },
    } },
  };
}

async function open(page, context) {
  await page.evaluate((ctx) => {
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-analytics');
    cta.setAttribute('data-context', ctx);
    cta.style.display = 'none';
    document.body.appendChild(cta);
    cta.click();
    cta.remove();
  }, context);
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ['hybrid_engine_v2_state', JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(message.text()) && !/net::ERR_/.test(message.text())) errors.push(message.text());
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Both legacy contexts must resolve here AND choose the correct opening tab.
    for (const [ctx, expectedTab] of [['weekly-volume', 'This week'], ['gym-performance', 'Trends']]) {
      await open(page, ctx);
      await page.waitForSelector('#analytics-strength-volume.active .sv-tabs', { timeout: 4000 }).catch(() => {
        failures.push(`${width}px: legacy context "${ctx}" did not resolve to the merged screen`);
      });
      const seen = await page.$eval('#analytics-strength-volume', (section) => ({
        titles: [...section.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
        activeTab: section.querySelector('.sv-tabs .is-active')?.textContent?.trim(),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        smallControls: [...section.querySelectorAll('button')].filter((b) => {
          const box = b.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
        }).length,
      }));
      console.log(`Volume ${width}px/${theme} via ${ctx}:`, JSON.stringify(seen));

      if (seen.titles.length !== 1) failures.push(`${width}px/${ctx}: expected one title, got ${JSON.stringify(seen.titles)}`);
      if (seen.activeTab !== expectedTab) failures.push(`${width}px/${ctx}: expected the "${expectedTab}" tab, got "${seen.activeTab}"`);
      if (seen.overflow) failures.push(`${width}px/${ctx}: page-level horizontal overflow`);
      if (seen.smallControls) failures.push(`${width}px/${ctx}: ${seen.smallControls} controls below the 44px target`);
    }

    // Every control from BOTH merged screens must still exist.
    await open(page, 'gym-performance');
    await page.waitForSelector('#analytics-strength-volume.active .sv-tabs');
    const trends = await page.$eval('#analytics-strength-volume', (s) => ({
      ranges: [...s.querySelectorAll('[data-gym-range]')].map((b) => b.getAttribute('data-gym-range')),
      metrics: [...s.querySelectorAll('[data-gym-metric]')].map((b) => b.getAttribute('data-gym-metric')),
      hasEvidence: /Contributing workouts/.test(s.innerHTML),
      hasPeriodNav: !!s.querySelector('[data-gym-period]'),
    }));
    console.log(`Volume ${width}px/${theme} trends controls:`, JSON.stringify(trends));
    for (const range of ['7d', '4w', '1y']) {
      if (!trends.ranges.includes(range)) failures.push(`${width}px: trends tab lost the ${range} range`);
    }
    for (const metric of ['time', 'sessions', 'sets', 'volume']) {
      if (!trends.metrics.includes(metric)) failures.push(`${width}px: trends tab lost the ${metric} metric`);
    }
    if (!trends.hasEvidence) failures.push(`${width}px: trends tab lost its contributing-workouts evidence`);
    if (!trends.hasPeriodNav) failures.push(`${width}px: trends tab lost its period navigation`);

    // Switching to This week must keep the weekly depth.
    await page.click('[data-strength-volume-tab="week"]');
    await page.waitForTimeout(200);
    const week = await page.$eval('#analytics-strength-volume', (s) => ({
      breakdowns: [...s.querySelectorAll('[data-volume-tab]')].map((b) => b.getAttribute('data-volume-tab')),
      hasTonnage: /Total tonnage/.test(s.innerHTML),
    }));
    console.log(`Volume ${width}px/${theme} week controls:`, JSON.stringify(week));
    for (const breakdown of ['days', 'workouts', 'exercises', 'muscles']) {
      if (!week.breakdowns.includes(breakdown)) failures.push(`${width}px: this-week tab lost the ${breakdown} breakdown`);
    }
    if (!week.hasTonnage) failures.push(`${width}px: this-week tab lost its tonnage summary`);

    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1);
}
console.log('Strength Volume merge browser contract passed.');
