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

function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Recovery Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: {}, wellnessLog: [
      { date: today, sleep: 7.5, mood: 4, soreness: 2 },
      { date: addDays(today, -1), sleep: 8, mood: 3, soreness: 3 },
      { date: addDays(today, -8), sleep: 6.5, mood: 3, soreness: 4 },
      { date: addDays(today, -40), sleep: 7, mood: 4, soreness: 2 },
    ],
  };
}

// The Recovery Trends view is opened from inside the Recovery overview; drive it
// the same way the app's own deep-link CTAs do — a hidden open-analytics button.
async function openRecoveryTrends(page) {
  await page.evaluate(() => {
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-analytics');
    cta.setAttribute('data-context', 'recovery-performance');
    cta.style.display = 'none';
    document.body.appendChild(cta);
    cta.click();
    cta.remove();
  });
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
    await openRecoveryTrends(page);
    await page.waitForSelector('#analytics-recovery-performance.active .gym-performance');
    const seven = await page.$eval('#analytics-recovery-performance', (section) => ({
      title: section.querySelector('h2')?.textContent?.trim(),
      ranges: section.querySelectorAll('[data-recovery-range]').length,
      metrics: section.querySelectorAll('[data-recovery-metric]').length,
      bins: section.querySelectorAll('[data-recovery-point]').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      smallControls: [...section.querySelectorAll('button')].filter((button) => {
        const box = button.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
      }).length,
    }));
    console.log(`Recovery Trends ${width}px:`, JSON.stringify(seven));
    if (seven.title !== 'Recovery Trends' || seven.ranges !== 3 || seven.metrics !== 3 || seven.bins !== 7) failures.push(`${width}px: incomplete Recovery Trends controls`);
    if (seven.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (seven.smallControls) failures.push(`${width}px: ${seven.smallControls} controls below 44px target`);

    await page.click('[data-recovery-metric="soreness"]');
    await page.click('[data-recovery-range="1y"]');
    if (await page.locator('[data-recovery-point]').count() !== 12) failures.push(`${width}px: 1Y should render twelve monthly buckets`);
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
console.log('Recovery Trends browser contract passed.');
