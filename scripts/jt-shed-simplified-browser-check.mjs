// Focused end-to-end check for the discoverable simplified J&T replacement.
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

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').split('?')[0] === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    const rel = (req.url || '/') === '/'
      ? 'index.html'
      : decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) {
      throw new Error('unsafe path');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://127.0.0.1:${port}`;
const STORAGE_KEY = 'hybrid_engine_v2_state';
const PROGRAM_ID = 'jacked-tan-shed-simplified';
const LEGACY_ID = 'jt_shed_edition';
const TZ = 'Australia/Sydney';

const failures = [];
const ok = (condition, label) => {
  if (!condition) {
    failures.push(label);
    console.error(`FAIL: ${label}`);
  } else {
    console.log(`  ok · ${label}`);
  }
};
const eq = (actual, expected, label) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, `${label}${same ? '' : ` (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`}`);
};

function fixture() {
  return {
    schemaVersion: 5,
    currentWeek: '1',
    activeProgramId: 'stronglifts_5x5',
    activeActivationId: 'act_existing',
    settings: {
      name: 'Browser Test',
      theme: 'dark',
      weightUnit: 'kg',
      distanceUnit: 'km',
      weekStartDay: 'mon',
      onboardingComplete: true,
    },
    activations: [{
      id: 'act_existing',
      programId: 'stronglifts_5x5',
      startWeek: 1,
      status: 'active',
      startedAt: new Date().toISOString(),
    }],
    customPrograms: [],
    weeks: {},
    programLibrary: {
      bookmarks: [],
      completions: [],
      recentlyViewed: [],
      personalRatings: {},
      activeFilters: {},
    },
  };
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  timezoneId: TZ,
  colorScheme: 'dark',
});
await context.addInitScript(([key, value]) => {
  if (!localStorage.getItem(key)) localStorage.setItem(key, value);
}, [STORAGE_KEY, JSON.stringify(fixture())]);
const page = await context.newPage();
const browserErrors = [];
page.on('pageerror', (error) => browserErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error' && !/frame-ancestors|net::ERR_/.test(message.text())) {
    browserErrors.push(message.text());
  }
});

async function previewRows(day = 'mon') {
  await page.click(`#programDetailScreen [data-action="open-day-preview"][data-day="${day}"]`);
  await page.waitForSelector('#wpmSheet .wpm-exercise-item', { timeout: 6000 });
  const rows = await page.$$eval('#wpmSheet .wpm-exercise-item', (elements) => elements.map((element) => {
    const spans = element.querySelectorAll('span');
    return {
      name: (spans[0]?.textContent || '').trim(),
      spec: (spans[1]?.textContent || '').trim(),
    };
  }));
  await page.click('#wpmSheet .sheet-close-btn[data-action="close-day-preview"]');
  await page.waitForSelector('#wpmSheet:not(.active)', { timeout: 3000 });
  return rows;
}

async function stepToWeek(targetWeek) {
  const current = await page.$eval('.wag-week-num', (element) => {
    const match = element.textContent.match(/Week\s+(\d+)/);
    return Number(match?.[1] || 1);
  });
  for (let week = current; week < targetWeek; week += 1) {
    await page.click('[data-action="detail-week-step"][data-delta="1"]');
    await page.waitForTimeout(60);
  }
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('.nav-item[data-target="program"]');
  await page.waitForSelector('#progSearchInput', { timeout: 8000 });
  await page.fill('#progSearchInput', 'Jacked & Tan');
  await page.waitForSelector(`[data-action="open-program-detail"][data-program-id="${PROGRAM_ID}"]`, { timeout: 8000 });

  ok(await page.$(`[data-action="open-program-detail"][data-program-id="${PROGRAM_ID}"]`), 'simplified program appears in discovery');
  ok(!(await page.$(`[data-action="open-program-detail"][data-program-id="${LEGACY_ID}"]`)), 'retired J&T program is absent from discovery');

  await page.click(`[data-action="open-program-detail"][data-program-id="${PROGRAM_ID}"]`);
  await page.waitForSelector('#programDetailScreen .detail-title', { timeout: 8000 });
  eq(
    await page.$eval('#programDetailScreen .detail-title', (element) => element.textContent.trim()),
    'Jacked & Tan: Shed Edition — Simplified',
    'detail title',
  );
  ok(await page.$('#programDetailScreen .jt-program-notes'), 'progression and RIR notes render');
  ok(await page.$('#programDetailScreen .jt-week-brief'), 'week-specific brief renders');

  let rows = await previewRows();
  eq(rows.map((row) => row.name), [
    'Barbell Bench Press',
    'Pull-Up',
    'Standing Barbell Overhead Press',
    'Incline Dumbbell Press',
    'Dumbbell Lateral Raise',
    'Band Triceps Pushdown',
    'Band Face Pull',
  ], 'Week 1 Monday exercise order');
  ok(/^4 × 8/.test(rows[0].spec), `Week 1 bench is 4 × 8 (got "${rows[0].spec}")`);

  await stepToWeek(5);
  rows = await previewRows();
  ok(/^4 × 6/.test(rows[0].spec), `Week 5 bench is 4 × 6 (got "${rows[0].spec}")`);

  await stepToWeek(9);
  rows = await previewRows();
  ok(/^5 × 4/.test(rows[0].spec), `Week 9 bench is 5 × 4 (got "${rows[0].spec}")`);

  await stepToWeek(12);
  rows = await previewRows();
  ok(/controlled rep-PR/.test(rows[0].spec), `Week 12 bench is a controlled rep-PR (got "${rows[0].spec}")`);
  ok(/^2 × 5–10/.test(rows[1].spec), `Week 12 accessory volume is halved (got "${rows[1].spec}")`);

  await page.click(`#programDetailScreen [data-action="make-active-from-detail"][data-program-id="${PROGRAM_ID}"]`);
  await page.waitForSelector('.actm-overlay [data-act-week]', { timeout: 6000 });
  await page.click('.actm-overlay .actm__btn--primary[data-act-week]');
  await page.waitForTimeout(500);

  let state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  eq(state.activeProgramId, PROGRAM_ID, 'activation persists the simplified program id');
  eq(state.currentWeek, '1', 'activation starts at Week 1');
  eq((state.customPrograms || []).length, 0, 'activation creates no duplicate custom program');

  const todayKey = await page.evaluate(() => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]);
  const expectedByDay = {
    mon: ['Barbell Bench Press', 'Pull-Up', 'Standing Barbell Overhead Press', 'Incline Dumbbell Press', 'Dumbbell Lateral Raise', 'Band Triceps Pushdown', 'Band Face Pull'],
    tue: ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Chest-Supported Dumbbell Row', 'Band Leg Curl', 'Barbell Standing Calf Raise', 'Ab Wheel Rollout'],
    thu: ['Standing Barbell Overhead Press', 'Close-Grip Bench Press', 'One-Arm Dumbbell Row', 'Dumbbell Rear-Delt Raise', 'Dumbbell Skull Crusher'],
    fri: ['Conventional Deadlift', 'Front Squat', 'Reverse Lunge', 'Band Leg Curl', 'Seated Dumbbell Calf Raise', 'EZ-Bar Curl'],
    sat: ['Chest-Supported Dumbbell Row', 'Band Lat Pulldown', 'EZ-Bar Curl', 'Band Triceps Pushdown', 'Dumbbell Lateral Raise', 'Band Face Pull', 'Ab Wheel Rollout'],
  };
  if (expectedByDay[todayKey]) {
    await page.click('.nav-item[data-target="home"]');
    await page.waitForTimeout(150);
    await page.click('#homePrimaryCta');
    await page.waitForSelector('#cockpitExercisesContainer .cockpit-ex-name', { timeout: 8000 });
    eq(
      await page.$$eval('#cockpitExercisesContainer .cockpit-ex-name', (elements) => elements.map((element) => element.textContent.trim())),
      expectedByDay[todayKey],
      `current ${todayKey} workout materialises in order`,
    );
  }

  await page.reload({ waitUntil: 'networkidle' });
  state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  eq(state.activeProgramId, PROGRAM_ID, 'reload preserves the active program');
  eq(state.currentWeek, '1', 'reload preserves the active program week');
  ok(Object.keys(state.weeks?.['1']?.lifts || {}).length > 0, 'reload preserves the materialised workout week');

  ok(browserErrors.length === 0, `no browser errors${browserErrors.length ? `: ${browserErrors.join(' | ')}` : ''}`);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error(`\n${failures.length} simplified J&T browser check(s) failed.`);
  process.exit(1);
}
console.log('\nSimplified J&T browser check passed.');
