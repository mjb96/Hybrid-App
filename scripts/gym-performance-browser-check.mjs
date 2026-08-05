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
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
const addDays = (key, amount) => {
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
};
const day = new Date(`${today}T12:00:00Z`).getUTCDay();
const monday = addDays(today, -((day + 6) % 7));
const working = (w, r) => ({ w: String(w), r: String(r), c: true });

function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Gym Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    weeks: {
      '1': {
        activationId: 'current', dates: { mon: monday },
        lifts: { mon: { 'Bench Press': [working(80, 5), working(80, 5), working(80, 5)] } },
        liftOrder: { mon: ['Bench Press'] }, gymStats: { mon: { time: '60:00' } },
        runs: {}, runSessions: {}, notes: {}, gymRpe: { mon: '7' }, bodyWeight: {}, liftMeta: {},
      },
      'one:prior': {
        sessionId: 'prior', sessionTitle: 'Upper Strength', dates: { mon: addDays(monday, -7) },
        lifts: { mon: { 'Bench Press': [working(77.5, 5), working(77.5, 5)] } },
        liftOrder: { mon: ['Bench Press'] }, gymStats: { mon: { time: '45:00' } },
        runs: {}, runSessions: {}, notes: {}, gymRpe: { mon: '7' }, bodyWeight: {}, liftMeta: {},
      },
      'arch:old:1': {
        activationId: 'old', dates: { wed: addDays(monday, -35) },
        lifts: { wed: { Squat: [working(100, 5)] } }, gymStats: { wed: { time: '50' } },
        runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, liftOrder: {},
      },
    },
  };
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Australia/Sydney', colorScheme: theme });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(message.text()) && !/net::ERR_/.test(message.text())) errors.push(message.text());
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    // Phase 3B merged Gym Performance into the Volume screen's Trends tab. The
    // Home gym card deep-links straight there, so this check still enters the
    // same way a user does — only the destination markup changed.
    await page.click('.home-metric-card--gym');
    await page.waitForSelector('#analytics-strength-volume.active .gym-performance');
    const seven = await page.$eval('#analytics-strength-volume', (section) => ({
      title: section.querySelector('h2')?.textContent?.trim(),
      activeTab: section.querySelector('.sv-tabs .is-active')?.textContent?.trim(),
      ranges: section.querySelectorAll('[data-gym-range]').length,
      metrics: section.querySelectorAll('[data-gym-metric]').length,
      bins: section.querySelectorAll('[data-gym-point]').length,
      evidence: section.querySelectorAll('[data-activity-id]').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      smallControls: [...section.querySelectorAll('button')].filter((button) => {
        const box = button.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
      }).length,
    }));
    console.log(`Gym activity ${width}px:`, JSON.stringify(seven));
    // The merged screen owns the title; the Trends tab owns the controls.
    if (seven.title !== 'Volume') failures.push(`${width}px: expected the merged Volume title, got "${seven.title}"`);
    if (seven.activeTab !== 'Trends') failures.push(`${width}px: the Home gym card must land on Trends, got "${seven.activeTab}"`);
    if (seven.ranges !== 3 || seven.metrics !== 4 || seven.bins !== 7) failures.push(`${width}px: incomplete gym activity controls`);
    if (seven.evidence < 1) failures.push(`${width}px: missing exact workout evidence`);
    if (seven.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (seven.smallControls) failures.push(`${width}px: ${seven.smallControls} controls below 44px target`);

    await page.click('[data-gym-range="4w"]');
    if (await page.locator('[data-gym-point]').count() !== 4) failures.push(`${width}px: 4W should render four weekly bins`);
    await page.click('[data-gym-range="1y"]');
    if (await page.locator('[data-gym-point]').count() !== 12) failures.push(`${width}px: 1Y should render twelve monthly bins`);
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
console.log('Gym activity (Volume → Trends) browser contract passed.');
