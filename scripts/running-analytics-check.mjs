// Real-browser contract check for the metric-specific Running experience.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = process.argv.includes('--required');
const browserRuntime = await resolveChromium();
if (!browserRuntime) {
  if (required) process.exit(1);
  process.exit(0);
}
const { chromium, executablePath } = browserRuntime;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) throw new Error('unsafe path');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://127.0.0.1:${port}`;
const STORAGE_KEY = 'hybrid_engine_v2_state';

const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (date, amount) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
};
const now = new Date();
const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
const monday = addDays(today, -((today.getUTCDay() + 6) % 7));
const priorMonday = addDays(monday, -7);
// The fixture's Tuesday run is intentionally future-dated when this check runs
// on Monday, and production analytics correctly exclude future evidence.
const expectedWeeklyEvidence = today.getUTCDay() === 1 ? 2 : 3;

function seededState(theme = 'dark', withRuns = true) {
  const base = {
    currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: {
      weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', theme,
      autoAdvanceWeek: false, name: 'Browser Athlete',
    },
    weeks: {
      '1': {
        activationId: 'current', dates: { mon: iso(monday), tue: iso(addDays(monday, 1)) },
        lifts: {}, runs: {}, runSessions: {}, gymStats: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, liftOrder: {},
      },
      'arch:old:4': {
        activationId: 'old', dates: { mon: iso(priorMonday), wed: iso(addDays(priorMonday, 2)) },
        lifts: {}, runs: {}, runSessions: {}, gymStats: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, liftOrder: {},
      },
    },
  };
  if (withRuns) {
    base.weeks['1'].runSessions = {
      mon: [
        { sessionId: 'current-five', localDate: iso(monday), name: 'Lunch 5K', type: 'run', dist: '5', time: '25:00', avgHR: '155', maxHR: '176', avgCadence: '170', rpe: '7', source: 'gps' },
        { sessionId: 'current-easy', localDate: iso(monday), name: 'Easy Run', type: 'run', dist: '3', time: '18:00', avgHR: '142', maxHR: '160', avgCadence: '166', rpe: '4', source: 'manual' },
      ],
      tue: [{ sessionId: 'current-ten', localDate: iso(addDays(monday, 1)), name: 'Steady 10K', type: 'run', dist: '10', time: '52:00', avgHR: '150', maxHR: '174', avgCadence: '168', rpe: '6', source: 'fit' }],
    };
    base.weeks['arch:old:4'].runSessions = {
      mon: [{ sessionId: 'prior-five', localDate: iso(priorMonday), name: 'Prior 5K', type: 'run', dist: '5', time: '28:00', avgHR: '158', maxHR: '178', avgCadence: '165', rpe: '7', source: 'fit' }],
      wed: [{ sessionId: 'prior-walk', localDate: iso(addDays(priorMonday, 2)), name: 'Walk', type: 'walk', dist: '4', time: '50:00', avgHR: '110', rpe: '2', source: 'gps' }],
    };
  }
  return base;
}

function powerUserState() {
  const state = seededState('dark', true);
  state.settings.name = 'Established Athlete';
  for (let weekIndex = 1; weekIndex <= 100; weekIndex++) {
    const weekStart = addDays(monday, -weekIndex * 7);
    const activation = `history-${Math.floor((weekIndex - 1) / 20) + 1}`;
    const makeRuns = (dayOffset, startIndex) => Array.from({ length: 5 }, (_, index) => {
      const ordinal = startIndex + index;
      return {
        sessionId: `power-${weekIndex}-${ordinal}`,
        localDate: iso(addDays(weekStart, dayOffset)),
        name: ordinal % 4 === 0 ? 'Recovery Walk' : `History Run ${weekIndex}-${ordinal}`,
        type: ordinal % 4 === 0 ? 'walk' : 'run',
        dist: String(3 + (ordinal % 8)),
        time: `${24 + (ordinal % 35)}:00`,
        avgHR: String(135 + (ordinal % 30)), maxHR: String(160 + (ordinal % 25)),
        avgCadence: String(162 + (ordinal % 14)), rpe: String(3 + (ordinal % 6)),
        source: ['manual', 'gps', 'fit'][ordinal % 3],
      };
    });
    state.weeks[`arch:${activation}:${weekIndex}`] = {
      activationId: activation,
      dates: { mon: iso(weekStart), wed: iso(addDays(weekStart, 2)) },
      lifts: {}, runs: {},
      runSessions: { mon: makeRuns(0, 0), wed: makeRuns(2, 5) },
      gymStats: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, liftOrder: {},
    };
  }
  return state;
}

async function openRunningStats(page) {
  await page.click('.nav-item[data-target="analytics"]');
  await page.click('#analytics-hub [data-context="running"]');
  await page.waitForSelector('#analytics-running.active [data-an-tab="stats"]');
  await page.click('#analytics-running [data-an-tab="stats"]');
  await page.waitForSelector('#analytics-running.active [data-metric-id="running.personal-bests"]');
}

function captureErrors(page, bucket) {
  page.on('pageerror', (error) => bucket.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    // Chromium reports this standards limitation as an error even though the
    // rest of the app CSP is active and the browser journey is unaffected.
    if (/frame-ancestors.*ignored.*meta/i.test(value)) return;
    bucket.push(`console: ${value}`);
  });
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  for (const [width, theme] of [[360, 'dark'], [390, 'light'], [412, 'dark']]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme: theme === 'light' ? 'light' : 'dark',
      reducedMotion: width === 360 ? 'reduce' : 'no-preference',
    });
    await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(seededState(theme))]);
    const page = await context.newPage();
    const errors = [];
    captureErrors(page, errors);
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openRunningStats(page);

    const index = await page.$eval('#analytics-running', (section) => ({
      metricCount: section.querySelectorAll('[data-metric-id]').length,
      uniqueMetricCount: new Set([...section.querySelectorAll('[data-metric-id]')].map((node) => node.getAttribute('data-metric-id'))).size,
      unlabeled: [...section.querySelectorAll('button')].filter((button) => !button.getAttribute('aria-label') && !button.textContent?.trim()).length,
      overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      theme: document.documentElement.dataset.theme,
    }));
    console.log(`Running Stats ${width}px:`, JSON.stringify(index));
    if (index.metricCount !== 30 || index.uniqueMetricCount !== 30) failures.push(`${width}px: expected 30 unique Running metric destinations`);
    if (index.unlabeled) failures.push(`${width}px: found ${index.unlabeled} unlabeled buttons`);
    if (index.overflowing) failures.push(`${width}px: Running Stats causes page-level horizontal overflow`);
    if (index.theme !== theme) failures.push(`${width}px: expected ${theme} theme, got ${index.theme}`);

    await page.click('#analytics-running [data-metric-id="running.weekly-distance"]');
    await page.waitForSelector('#analytics-running-metric.active .metric-detail__header');
    const detail = await page.$eval('#analytics-running-metric', (section) => ({
      title: section.querySelector('h2')?.textContent?.trim(),
      ranges: section.querySelectorAll('[data-metric-range]').length,
      days: section.querySelectorAll('.metric-daily-strip__day').length,
      evidence: section.querySelectorAll('[data-activity-id]').length,
      disclosure: section.querySelector('.metric-method summary')?.textContent?.trim(),
      overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    console.log(`Weekly Distance ${width}px:`, JSON.stringify(detail));
    if (detail.title !== 'Weekly Distance' || detail.ranges !== 5 || detail.days !== 7 || detail.evidence < expectedWeeklyEvidence || !/calculated/i.test(detail.disclosure || '')) {
      failures.push(`${width}px: Weekly Distance detail is incomplete`);
    }
    if (detail.overflowing) failures.push(`${width}px: Running detail causes page-level horizontal overflow`);

    await page.click('#analytics-running-metric [data-metric-range="4w"]');
    const selectedRange = await page.getAttribute('#analytics-running-metric [data-metric-range="4w"]', 'aria-pressed');
    if (selectedRange !== 'true') failures.push(`${width}px: 4-week range did not become selected`);

    if (width === 360) {
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (zoomOverflow) failures.push('360px at 200% text: Running detail causes page-level horizontal overflow');
    }

    if (width === 390) {
      await page.click('#analytics-running-metric [data-activity-id="run:current-five"]');
      await page.waitForSelector('#activitiesScreen .activity-detail-shell');
      const activityText = await page.textContent('#activitiesScreen');
      if (!/Lunch 5K/.test(activityText || '')) failures.push('evidence row did not open the exact source activity');
      await page.click('#activitiesBack');
      await page.click('#activitiesBack');
      await page.waitForSelector('#analytics-running-metric.active');
    }

    await page.click('#view-analytics .subview-back-btn');
    await page.waitForSelector('#analytics-running.active');

    await page.click('.nav-item[data-target="home"]');
    await page.waitForSelector('#view-home.active [data-metric-id="running.average-pace"]');
    await page.click('#view-home [data-metric-id="running.average-pace"]');
    await page.waitForSelector('#analytics-running-metric.active');
    const homeDestination = await page.textContent('#runningMetricDetail h2');
    if (homeDestination?.trim() !== 'Average Pace') failures.push(`${width}px: Home Average Pace did not open its exact metric`);
    await page.click('#view-analytics .subview-back-btn');
    if (!await page.$eval('#view-home', (view) => view.classList.contains('active'))) failures.push(`${width}px: metric Back did not return to Home`);

    if (errors.length) failures.push(`${width}px browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(seededState('dark', false))]);
  const page = await context.newPage();
  const errors = [];
  captureErrors(page, errors);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await openRunningStats(page);
  await page.click('#analytics-running [data-metric-id="running.best-pace"]');
  await page.waitForSelector('#analytics-running-metric.active .metric-chart-empty');
  const empty = await page.textContent('#analytics-running-metric');
  console.log('Running empty state:', JSON.stringify({ honest: /Log a dated activity/.test(empty || ''), hasNaN: /NaN|undefined/.test(empty || '') }));
  if (!/Log a dated activity/.test(empty || '') || /NaN|undefined/.test(empty || '')) failures.push('empty Running detail is not honest and stable');
  if (errors.length) failures.push(`empty-state browser errors: ${errors.join(' | ')}`);
  await context.close();

  const powerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await powerContext.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(powerUserState())]);
  const powerPage = await powerContext.newPage();
  const powerErrors = [];
  captureErrors(powerPage, powerErrors);
  const powerStart = Date.now();
  await powerPage.goto(BASE, { waitUntil: 'networkidle' });
  await openRunningStats(powerPage);
  await powerPage.click('#analytics-running [data-metric-id="running.total-distance"]');
  await powerPage.waitForSelector('#analytics-running-metric.active [data-metric-range="all"]');
  const detailOpenMs = Date.now() - powerStart;
  const rangeStart = Date.now();
  await powerPage.click('#analytics-running-metric [data-metric-range="all"]');
  const rangeMs = Date.now() - rangeStart;
  const powerDetail = await powerPage.$eval('#analytics-running-metric', (section) => ({
    hasInvalid: /NaN|undefined|Invalid Date/.test(section.textContent || ''),
    points: section.querySelectorAll('[data-metric-point]').length,
    evidence: section.querySelectorAll('[data-activity-id]').length,
    overflowing: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  console.log('Running 23-month / 1,000-activity history:', JSON.stringify({ detailOpenMs, rangeMs, ...powerDetail }));
  if (detailOpenMs > 5000 || rangeMs > 2000) failures.push(`power history is too slow (${detailOpenMs}ms open, ${rangeMs}ms range)`);
  if (powerDetail.points < 100 || powerDetail.evidence < 1 || powerDetail.hasInvalid || powerDetail.overflowing) {
    failures.push('power history detail is incomplete, invalid or overflowing');
  }
  await powerPage.evaluate(() => navigator.serviceWorker.ready);
  await powerPage.reload({ waitUntil: 'networkidle' });
  await powerContext.setOffline(true);
  await powerPage.reload({ waitUntil: 'domcontentloaded' });
  await powerPage.waitForSelector('#view-home.active');
  await openRunningStats(powerPage);
  await powerPage.click('#analytics-running [data-metric-id="running.best-pace"]');
  await powerPage.waitForSelector('#analytics-running-metric.active .metric-detail__header');
  const offlineTitle = await powerPage.textContent('#runningMetricDetail h2');
  console.log('Running offline reload:', JSON.stringify({ title: offlineTitle?.trim() }));
  if (offlineTitle?.trim() !== 'Best Pace') failures.push('offline reload cannot open the precached Running detail graph');
  await powerContext.setOffline(false);
  const unexpectedPowerErrors = powerErrors.filter((error) => !/net::ERR_(?:INTERNET_DISCONNECTED|FAILED)/.test(error));
  if (unexpectedPowerErrors.length) failures.push(`power-history browser errors: ${unexpectedPowerErrors.join(' | ')}`);
  await powerContext.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log('Running analytics browser contract passed.');
