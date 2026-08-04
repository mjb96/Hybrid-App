// =============================================================================
// VOLUME GUIDE BROWSER CHECK — roadmap Phase 3A (MEV presentation)
//
// The guide now draws each muscle against the full MV→MEV→MAV→MRV scale rather
// than one unlabelled band, so this pins the things that made the old surface
// unreadable: the landmarks must be labelled, the headline must state the
// number AND the range it is measured against, a week past the usual ceiling
// must read differently from a merely productive one, and the four status
// buckets must account for every focus muscle. Plus the usual 44px/overflow
// contract in both themes.
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

// Chest lands squarely in its 10–20 range; side delts go to 30, past their
// MRV of 26 — so the fixture exercises both the "in range" and the
// "above the usual ceiling" wording in one pass.
function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: {
      name: 'Volume Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true,
      musclePriorities: { chest: 'grow', side_delts: 'grow', quads: 'grow' },
    },
    weeks: { '1': { dates: { mon: MON }, lifts: { mon: {
      'Barbell Bench Press': rep(12, () => set(100, 8)),
      'Lateral Raise': rep(30, () => set(10, 12)),
      'Back Squat': rep(4, () => set(140, 5)),
    } } } },
  };
}

async function openStrengthStats(page) {
  await page.evaluate(() => {
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-analytics');
    cta.setAttribute('data-context', 'strength_pr');
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
    const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), ['hybrid_engine_v2_state', JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(message.text()) && !/net::ERR_/.test(message.text())) errors.push(message.text());
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openStrengthStats(page);
    await page.waitForSelector('#muscleGroupAnalysisSection .vg-guide');

    const seen = await page.$eval('#muscleGroupAnalysisSection', (section) => {
      const row = (name) => [...section.querySelectorAll('.vg-muscle-row')]
        .find((article) => article.querySelector('.an-entity-link')?.textContent?.trim().startsWith(name));
      const read = (article) => article ? {
        numbers: article.querySelector('.vg-muscle-row__numbers')?.textContent?.replace(/\s+/g, ' ').trim(),
        status: article.querySelector('.vg-status')?.textContent?.trim(),
        detail: article.querySelector('.vg-muscle-row__detail')?.textContent?.trim(),
        ticks: [...article.querySelectorAll('.vg-tick b')].map((tick) => tick.textContent),
      } : null;
      return {
        chest: read(row('Chest')),
        sideDelts: read(row('Side Delts')),
        quads: read(row('Quads')),
        tabs: [...section.querySelectorAll('.vg-tab')].map((tab) => tab.textContent?.trim()),
        spread: [...section.querySelectorAll('.vg-spread__item')].map((item) => item.textContent?.trim()),
        // Priorities must be off the default list; the Focus tab shows labels.
        selectsOnFocusTab: section.querySelectorAll('[data-volume-priority]').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        smallControls: [...section.querySelectorAll('button, select')].filter((control) => {
          const box = control.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
        }).length,
      };
    });
    console.log(`Volume Guide ${width}px/${theme}:`, JSON.stringify(seen));

    // The headline must state the value AND the range it is judged against.
    if (!/12\b.*10–20 typical/.test(seen.chest?.numbers || '')) {
      failures.push(`${width}px: chest row does not state its value against its range (${seen.chest?.numbers})`);
    }
    if (seen.chest?.status !== 'In the typical range') failures.push(`${width}px: chest status was "${seen.chest?.status}"`);
    // A week past MRV must NOT read the same as a productive one.
    if (seen.sideDelts?.status !== 'Above the usual ceiling') {
      failures.push(`${width}px: 30 credits vs an MRV of 26 read as "${seen.sideDelts?.status}"`);
    }
    if (!/26/.test(seen.sideDelts?.detail || '')) failures.push(`${width}px: side delts detail does not name the ceiling`);
    // Landmarks must be labelled on the axis, not implied.
    for (const label of ['MEV', 'MAV', 'MRV']) {
      if (!seen.chest?.ticks?.includes(label)) failures.push(`${width}px: chest scale is missing the ${label} landmark`);
    }
    // Guidance must never become a prescription.
    for (const article of [seen.chest, seen.sideDelts, seen.quads]) {
      if (/\badd \d|you should|you must|you need to/i.test(article?.detail || '')) {
        failures.push(`${width}px: status detail prescribes rather than describes: "${article?.detail}"`);
      }
    }
    if (seen.selectsOnFocusTab !== 0) failures.push(`${width}px: ${seen.selectsOnFocusTab} priority selects still on the default list`);
    if (!seen.tabs?.includes('Priorities')) failures.push(`${width}px: no Priorities tab to set muscle priorities from`);
    if (!seen.spread?.length) failures.push(`${width}px: missing the status spread summary`);
    if (seen.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (seen.smallControls) failures.push(`${width}px: ${seen.smallControls} controls below the 44px target`);

    // Priorities remain reachable and editable, just not on every row by default.
    await page.click('[data-volume-tab="priorities"]');
    await page.waitForTimeout(150);
    const selects = await page.locator('#muscleGroupAnalysisSection [data-volume-priority]').count();
    if (selects === 0) failures.push(`${width}px: Priorities tab exposes no priority controls`);

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
console.log('Volume Guide browser contract passed.');
