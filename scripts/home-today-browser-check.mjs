// Home Today-card browser contract:
// - one primary action in the first decision surface;
// - calendar-day routing, including resume/review/rest/no-plan states;
// - no horizontal overflow and 44px controls at narrow mobile widths.
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
const STORAGE_KEY = 'hybrid_engine_v2_state';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').split('?')[0] === '/favicon.ico') {
      res.writeHead(204); res.end(); return;
    }
    const rel = (req.url || '/') === '/'
      ? 'index.html'
      : decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) throw new Error('unsafe path');
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true, executablePath });
const failures = [];
const ok = (condition, label) => {
  if (condition) console.log(`  ok · ${label}`);
  else { failures.push(label); console.error(`FAIL: ${label}`); }
};

// PINNED, not read from the clock. Two things went wrong while these dates came
// from `new Date()`: the browser context declared no timezone, so node and the
// page could disagree about which calendar day it was, and a run that crossed
// midnight computed the fixture for one day and asserted against another.
const TZ = 'Australia/Sydney';
const todayISO = '2026-08-03';   // a Monday in Australia/Sydney
const CLOCK = Date.parse(`${todayISO}T09:00:00+10:00`);
const now = new Date(CLOCK);
// Noon UTC so the weekday cannot shift with the host's timezone.
const todayDay = DAY_KEYS[new Date(`${todayISO}T12:00:00Z`).getUTCDay()];
const otherDay = DAY_KEYS[(DAY_KEYS.indexOf(todayDay) + 6) % 7];
const yesterdayISO = new Date(Date.parse(`${todayISO}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);

function program(restToday = false) {
  return {
    id: 'today_card_test',
    name: 'Today Card Test',
    totalWeeks: 4,
    days: Object.fromEntries(DAY_KEYS.map((day) => [day, restToday && day === todayDay
      ? { title: 'Rest Day', lifts: [], runs: 'Rest', desc: '' }
      : { title: `${day === todayDay ? 'Today' : day.toUpperCase()} Strength`, lifts: ['EZ-Bar Curl'], runs: 'Rest', desc: '' }])),
    weeklyVolModifiers: { '1': { sets: 2, reps: 8, intensityLabel: 'Working Sets' } },
  };
}

function fixture({ state = 'ready', theme = 'dark' } = {}) {
  const testProgram = program(state === 'rest');
  const lifts = Object.fromEntries(DAY_KEYS.map((day) => [
    day,
    testProgram.days[day].lifts.length
      ? { 'EZ-Bar Curl': [{ w: '', r: '8', c: false }, { w: '', r: '8', c: false }] }
      : {},
  ]));
  const week = {
    activationId: 'act_today', programId: testProgram.id,
    dates: {}, sessionStatus: {}, sessionSummary: {},
    lifts, liftOrder: {}, liftMeta: {}, runs: {}, runSessions: {},
    notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {},
  };

  if (state === 'in_progress' || state === 'completed') {
    week.lifts[todayDay]['EZ-Bar Curl'][0] = { w: '25', r: '8', c: true };
    week.dates[todayDay] = todayISO;
    week.sessionStatus[todayDay] = state === 'completed' ? 'finished' : 'in_progress';
    if (state === 'completed') {
      week.lifts[todayDay]['EZ-Bar Curl'][1] = { w: '25', r: '8', c: true };
      week.sessionSummary[todayDay] = { plannedSets: 2, completedSets: 2, adherencePct: 100 };
    }
  }
  if (state === 'unresolved') {
    week.lifts[otherDay]['EZ-Bar Curl'][0] = { w: '25', r: '8', c: true };
    week.dates[otherDay] = yesterdayISO;
    week.sessionStatus[otherDay] = 'in_progress';
  }

  return {
    schemaVersion: 5,
    currentWeek: '1',
    activeProgramId: state === 'no_plan' ? 'missing_program' : testProgram.id,
    activeActivationId: 'act_today',
    weekStartedAt: now.toISOString(),
    activations: [{ id: 'act_today', programId: testProgram.id, startWeek: 1, status: 'active', startedAt: now.toISOString() }],
    settings: {
      name: 'Browser', theme, onboardingComplete: true,
      weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon',
      fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym',
    },
    customPrograms: [testProgram],
    weeks: { '1': week },
    loadMetrics: { atl: 0, ctl: 0 },
    healthConnect: { connected: false, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [] },
    wellnessLog: [], bodyWeightLog: [],
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
    hybridScore: { history: [], xp: 0, lastRecordedDate: null },
  };
}

async function openState({ state, theme = 'dark', width = 390, height = 844 }) {
  const context = await createBrowserContext(browser, { viewport: { width, height }, timezoneId: TZ });
  const seed = fixture({ state, theme });
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(seed)]);
  await context.addInitScript(pinClock, CLOCK);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (state === 'no_plan') await page.locator('#view-program.active').waitFor();
  else await page.locator('.today-card').waitFor();
  return { context, page };
}

try {
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 390, 412]) {
      const { context, page } = await openState({ state: 'ready', theme, width });
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.today-card');
        const primary = document.querySelector('.today-card__primary');
        const secondary = document.querySelector('.today-card__secondary');
        const cardRect = card?.getBoundingClientRect();
        return {
          state: card?.getAttribute('data-today-state'),
          primaryCount: card?.querySelectorAll('.today-card__primary').length || 0,
          cardWithinViewport: !!cardRect && cardRect.left >= 0 && cardRect.right <= innerWidth && cardRect.bottom <= innerHeight,
          primaryHeight: primary?.getBoundingClientRect().height || 0,
          secondaryHeight: secondary?.getBoundingClientRect().height || 0,
          inFocusCards: document.querySelectorAll('#strengthBarChart, #runBarChart').length,
          glanceGrids: document.querySelectorAll('#glanceGrid').length,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      ok(layout.state === 'ready', `${theme} ${width}px renders ready state`);
      ok(layout.primaryCount === 1, `${theme} ${width}px has exactly one Today primary action`);
      ok(layout.cardWithinViewport, `${theme} ${width}px keeps the complete Today decision in the first viewport`);
      ok(layout.primaryHeight >= 44 && layout.secondaryHeight >= 44, `${theme} ${width}px controls meet 44px touch target`);
      ok(layout.inFocusCards === 2, `${theme} ${width}px preserves both In Focus cards`);
      ok(layout.glanceGrids === 0, `${theme} ${width}px removes the repeated At-a-Glance grid`);
      ok(!layout.overflow, `${theme} ${width}px has no horizontal overflow`);
      await context.close();
    }
  }

  const expected = {
    in_progress: 'Resume workout',
    completed: 'Review workout',
    rest: 'Log wellness check-in',
    unresolved: 'Resume workout',
  };
  for (const [state, label] of Object.entries(expected)) {
    const { context, page } = await openState({ state });
    ok(await page.locator('.today-card').getAttribute('data-today-state') === state, `${state} state is explicit`);
    ok((await page.locator('#homePrimaryCta').textContent())?.trim() === label, `${state} state uses "${label}"`);
    if (state === 'unresolved') {
      ok(await page.locator('#homeChooseWorkout').count() === 0, 'unresolved work does not compete with another-workout action');
    }
    await context.close();
  }

  {
    const { context, page } = await openState({ state: 'ready' });
    await page.locator('#homePrimaryCta').click();
    ok(await page.locator('#view-workout').evaluate((el) => el.classList.contains('active')), 'Start workout opens Train');
    ok(await page.locator('#cockpitDaySelectorBar .day-pill.active').getAttribute('data-day') === todayDay, 'Start workout selects the calendar day');
    await context.close();
  }

  {
    const { context, page } = await openState({ state: 'completed' });
    await page.locator('#homePrimaryCta').click();
    ok(await page.locator('#todaySummaryModal').evaluate((el) => getComputedStyle(el).display !== 'none'), 'Review workout opens the completed day summary');
    await context.close();
  }

  {
    const { context, page } = await openState({ state: 'no_plan' });
    ok(await page.locator('#view-program').evaluate((el) => el.classList.contains('active')), 'missing active plan opens the safe Plans recovery surface');
    ok((await page.locator('.active-prog-card--recovery').textContent())?.includes('logged history is still safe'), 'plan recovery explains that history is safe');
    await context.close();
  }

  {
    const { context, page } = await openState({ state: 'unresolved' });
    await page.locator('#homePrimaryCta').click();
    ok(await page.locator('#view-workout').evaluate((el) => el.classList.contains('active')), 'Resume opens Train');
    ok(await page.locator('#cockpitDaySelectorBar .day-pill.active').getAttribute('data-day') === otherDay, 'Resume restores the unresolved workout day');
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\nHome Today browser check failed (${failures.length}).`);
  process.exit(1);
}
console.log('\nHome Today browser check passed.');
