import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserContext, resolveChromium } from './browser-runtime.mjs';

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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const addDays = (key, amount) => {
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
};
const day = new Date(`${today}T12:00:00Z`).getUTCDay();
const monday = addDays(today, -((day + 6) % 7));
const runSession = (id, dist, time, date) => ({ sessionId: id, dist: String(dist), time, localDate: date, source: 'gps' });

function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Run Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    weeks: {
      '1': {
        activationId: 'current', dates: { mon: monday, wed: addDays(monday, 2) },
        lifts: {}, liftOrder: {}, gymStats: {},
        runs: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {},
        runSessions: {
          mon: [runSession('r-mon', 10, '50:00', monday)],
          wed: [runSession('r-wed', 6, '30:00', addDays(monday, 2))],
        },
      },
      'prior': {
        activationId: 'current', dates: { mon: addDays(monday, -7) },
        lifts: {}, liftOrder: {}, gymStats: {},
        runs: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {},
        runSessions: { mon: [runSession('r-prior', 8, '42:00', addDays(monday, -7))] },
      },
    },
  };
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const context = await createBrowserContext(browser, { viewport: { width, height: 844 }, timezoneId: 'Australia/Sydney', colorScheme: theme });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(message.text()) && !/net::ERR_/.test(message.text())) errors.push(message.text());
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Click the card label (not the mini bar chart, whose bars open that day's
    // Activities by design) so the tap bubbles to the card's open-analytics.
    await page.click('.home-metric-card--run .hmcard-label');
    await page.waitForSelector('#analytics-run-performance.active .gym-performance');
    const seven = await page.$eval('#analytics-run-performance', (section) => ({
      title: section.querySelector('h2')?.textContent?.trim(),
      ranges: section.querySelectorAll('[data-run-range]').length,
      metrics: section.querySelectorAll('[data-run-metric]').length,
      bins: section.querySelectorAll('[data-run-point]').length,
      evidence: section.querySelectorAll('[data-activity-id]').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      smallControls: [...section.querySelectorAll('button')].filter((button) => {
        const box = button.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
      }).length,
    }));
    console.log(`Run Performance ${width}px:`, JSON.stringify(seven));
    if (seven.title !== 'Run Performance' || seven.ranges !== 3 || seven.metrics !== 3 || seven.bins !== 7) failures.push(`${width}px: incomplete Run Performance controls`);
    if (seven.evidence < 1) failures.push(`${width}px: missing exact run evidence`);
    if (seven.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (seven.smallControls) failures.push(`${width}px: ${seven.smallControls} controls below 44px target`);

    await page.click('[data-run-range="4w"]');
    if (await page.locator('[data-run-point]').count() !== 4) failures.push(`${width}px: 4W should render four weekly bins`);
    await page.click('[data-run-range="1y"]');
    if (await page.locator('[data-run-point]').count() !== 12) failures.push(`${width}px: 1Y should render twelve monthly bins`);
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
console.log('Run Performance browser contract passed.');
