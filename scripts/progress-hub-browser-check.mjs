// =============================================================================
// PROGRESS HUB BROWSER CHECK — roadmap Phase 3A
//
// The Progress landing is no longer a static index, so it needs the same
// contract every rebuilt analytics screen has: the four headline domains render
// with real values, secondary destinations stay reachable but quieter, Fasting
// only appears for people who fast, every control clears 44px, and nothing
// overflows at 320–412px in either theme.
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

const TZ = 'Australia/Sydney';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (key, amount) => {
  const date = new Date(`${key}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
};
// Monday of the current calendar week, so the fixture always lands inside the
// week the hub is showing regardless of the day this check runs.
const mondayOf = (key) => {
  const dow = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(key, -dow);
};
const MON = mondayOf(today);
const set = (w, r) => ({ c: true, w: String(w), r: String(r) });

// A trained athlete: sessions this week and last week, so every domain has a
// real value AND a real like-for-like comparison to render.
function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '2', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Progress Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: {
      '1': {
        dates: { mon: addDays(MON, -7), wed: addDays(MON, -5) },
        lifts: {
          mon: { 'Bench Press': [set(100, 5), set(100, 5)] },
          wed: { 'Back Squat': [set(140, 5)] },
        },
        runs: { tue: { dist: '5.0', time: '25:00' } },
      },
      '2': {
        dates: { mon: MON, tue: addDays(MON, 1) },
        lifts: {
          mon: { 'Bench Press': [set(105, 5), set(105, 5)] },
          tue: { 'Back Squat': [set(142.5, 5)] },
        },
        runs: { tue: { dist: '6.0', time: '29:00' } },
      },
    },
    wellnessLog: [
      { date: today, sleep: 7.5, mood: 4, soreness: 2 },
      { date: addDays(today, -1), sleep: 8, mood: 4, soreness: 2 },
    ],
  };
}

// The hub is a top-level destination; drive it the way the bottom nav does.
async function openHub(page) {
  await page.evaluate(() => {
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-analytics');
    cta.setAttribute('data-context', 'hub');
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
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(message.text()) && !/net::ERR_/.test(message.text())) errors.push(message.text());
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openHub(page);
    await page.waitForSelector('#analytics-hub.active .ph-card');

    const seen = await page.$eval('#analytics-hub', (section) => {
      const cards = [...section.querySelectorAll('.ph-card')];
      return {
        contexts: cards.map((card) => card.getAttribute('data-context')),
        // Every card must show a real headline and a plain-language sentence.
        values: cards.map((card) => card.querySelector('.ph-card__value')?.textContent?.trim() || ''),
        says: cards.map((card) => card.querySelector('.ph-card__say')?.textContent?.trim() || ''),
        secondary: [...section.querySelectorAll('.hub-link--quiet')].map((link) => link.getAttribute('data-context')),
        hasMethod: !!section.querySelector('.an-method'),
        // The week label must name the real Monday–Sunday range, not a program week.
        sub: section.querySelector('.hub-sub')?.textContent?.trim() || '',
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        smallControls: [...section.querySelectorAll('button')].filter((button) => {
          const box = button.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
        }).length,
      };
    });
    console.log(`Progress hub ${width}px/${theme}:`, JSON.stringify(seen, null, 0));

    const expected = ['weekly-review', 'strength', 'running', 'recovery'];
    if (seen.contexts.join(',') !== expected.join(',')) {
      failures.push(`${width}px: expected domains ${expected.join(',')} but got ${seen.contexts.join(',')}`);
    }
    if (seen.values.some((value) => !value)) failures.push(`${width}px: a domain card rendered without a headline value`);
    if (seen.says.some((say) => say.length < 10)) failures.push(`${width}px: a domain card rendered without an interpretation`);
    // Strength should show a real same-exercise gain from the fixture, not a dash.
    if (seen.values[1] === '—') failures.push(`${width}px: strength headline is empty despite logged sets`);
    if (!seen.secondary.includes('hybrid-score')) failures.push(`${width}px: Hybrid Score must remain reachable as a secondary destination`);
    if (seen.secondary.includes('fasting')) failures.push(`${width}px: Fasting must not appear for a profile with no fasting history`);
    if (!seen.hasMethod) failures.push(`${width}px: missing "how this is calculated" disclosure`);
    if (!/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/.test(seen.sub)) failures.push(`${width}px: hub subtitle does not name a real calendar week range`);
    if (seen.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (seen.smallControls) failures.push(`${width}px: ${seen.smallControls} controls below the 44px target`);

    // Tapping a domain must reach its detail screen.
    await page.click('.ph-card[data-context="strength"]');
    await page.waitForSelector('#analytics-strength.active', { timeout: 4000 }).catch(() => {
      failures.push(`${width}px: Strength domain card did not open the Strength screen`);
    });

    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // A brand-new profile must lead with one honest empty state, not four dashes.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify({
      schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
      settings: { name: 'New', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
      weeks: {},
    })]);
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openHub(page);
    await page.waitForSelector('#analytics-hub.active .ph-card');
    const empty = await page.$eval('#analytics-hub', (section) => ({
      hasEmptyLead: !!section.querySelector('.ph-empty'),
      cards: section.querySelectorAll('.ph-card').length,
      // No fabricated comparison may survive an empty week.
      deltas: section.querySelectorAll('.ph-card__delta').length,
    }));
    console.log('Progress hub empty profile:', JSON.stringify(empty));
    if (!empty.hasEmptyLead) failures.push('empty profile: missing the single leading empty state');
    if (empty.cards !== 4) failures.push('empty profile: expected all four domains to still render');
    if (empty.deltas !== 0) failures.push('empty profile: rendered a comparison with nothing to compare');
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1);
}
console.log('Progress hub browser contract passed.');
