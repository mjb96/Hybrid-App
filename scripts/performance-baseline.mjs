// =============================================================================
// PERFORMANCE BASELINE
//
// Roadmap Phase 6 asks for baselines, budgets set FROM those baselines, and
// optimisation only of demonstrated bottlenecks. This measures; it asserts only
// the few things that are honest to assert.
//
// WHAT IS ASSERTED vs REPORTED — the distinction matters more than the numbers.
//
//   ASSERTED: structural facts that do not move with the machine.
//     • First contentful paint is not RENDER-BLOCKED. A budget of 3s against a
//       measured ~0.3s is not a speed target; it is a guard on a specific
//       defect (see below) whose signature was 12.6 SECONDS.
//     • The DOM stays bounded as history grows. Five years of training must not
//       render more nodes than one week does. This is pure structure.
//     • The app renders with every external host unreachable — the offline
//       start this PWA promises.
//
//   REPORTED ONLY: wall-clock timings. This container is roughly 3× slower than
//   CI, and neither is a phone. Asserting milliseconds here would either be
//   flaky or so loose it caught nothing. The numbers are printed so a human can
//   compare runs on the SAME machine, which is the only comparison they support.
//
// THE DEFECT THIS WAS BUILT TO FIND (fixed in the same commit):
//   index.html loaded the Google Fonts stylesheet as a plain render-blocking
//   <link>, with a comment claiming display=swap kept first paint fast. It does
//   not — display=swap governs how the font FILE swaps in, while the stylesheet
//   itself blocks rendering until it loads or fails. On any start where
//   fonts.googleapis.com is unreachable, which is EVERY offline start of this
//   PWA, first contentful paint measured 12,656ms, of which that one request
//   was 12,530ms. Fully cached, and the app painted nothing for twelve seconds
//   waiting on a font it did not need. Now 280ms.
//
//   That is the whole argument for measuring: the assumption was written down,
//   it was plausible, and it was wrong.
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

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').split('?')[0] === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const rel = (req.url || '/') === '/' ? 'index.html' : decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) throw new Error('unsafe path');
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;

const TZ = 'Australia/Sydney';
const TODAY = '2026-08-03';
const CLOCK = Date.parse(`${TODAY}T09:00:00+10:00`);
const STORAGE_KEY = 'hybrid_engine_v2_state';

// ---- Budgets, set from the measured baseline -------------------------------
const FCP_BUDGET_MS = 3000;      // measured ~280ms; the defect signature was 12,656ms
const DOM_GROWTH_BUDGET = 1.35;  // heavy/light active-view node ratio; measured ~1.03

const LIFTS = ['Barbell Bench Press', 'Back Squat', 'Deadlift', 'Barbell Row', 'Overhead Press'];
const DAYS = ['mon', 'tue', 'thu', 'fri'];
const addDays = (key, n) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** 260 weeks × 4 days × 5 lifts × 4 sets ≈ 20,800 logged sets. */
function fiveYearsOfWeeks() {
  const weeks = {};
  const start = addDays(TODAY, -7 * 259);
  for (let w = 0; w < 260; w++) {
    const weekStart = addDays(start, w * 7);
    // The LAST four weeks are the live run; everything older is archived. Built
    // the other way round, week '1' was dated five years ago, Home offered no
    // session today, and "open workout" read as a 60s hang that was entirely the
    // fixture's doing.
    const fromEnd = 259 - w;
    const key = fromEnd < 4 ? String(4 - fromEnd) : `arch:act_${Math.floor(w / 12)}:${(w % 12) + 1}`;
    const lifts = {}, dates = {}, gymStats = {}, sessionStatus = {};
    DAYS.forEach((d, di) => {
      dates[d] = addDays(weekStart, di);
      lifts[d] = {};
      // Today must be UNFINISHED or Home's action is "Review workout" and the
      // cockpit never opens — the same fixture trap in a second costume.
      const liveToday = fromEnd === 0 && d === 'mon';
      if (!liveToday) {
        gymStats[d] = { time: '01:05', calories: 480, avgHR: 128, peakHR: 165 };
        sessionStatus[d] = 'finished';
      }
      for (const l of LIFTS) {
        lifts[d][l] = [0, 1, 2, 3].map((i) => ({ w: String(60 + (w % 40) + i * 2), r: '5', c: !liveToday }));
      }
    });
    weeks[key] = {
      activationId: `act_${Math.floor(w / 12)}`, dates, lifts, gymStats, sessionStatus,
      liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, sessionSummary: {},
    };
  }
  return weeks;
}

const fixture = (weeks, currentWeek) => ({
  schemaVersion: 5, currentWeek, activeProgramId: 'hybrid_engine', activeActivationId: 'act_0',
  settings: {
    name: 'Perf', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon',
    onboardingComplete: true, fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym',
  },
  activations: [{ id: 'act_0', programId: 'hybrid_engine', startWeek: 1, status: 'active', startedAt: new Date(CLOCK).toISOString() }],
  weeks,
  programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  loadMetrics: { atl: 0, ctl: 0 }, wellnessLog: [], bodyWeightLog: [],
  healthConnect: { connected: false, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [] },
  hybridScore: { history: [], xp: 0, lastRecordedDate: null },
});

const LIGHT = fixture({
  '1': {
    activationId: 'act_0', dates: { mon: TODAY }, gymStats: { mon: { time: '01:02' } },
    lifts: { mon: { 'Barbell Bench Press': [{ w: '100', r: '5', c: true }] } },
    sessionStatus: {}, liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {},
  },
}, '1');
const HEAVY = fixture(fiveYearsOfWeeks(), '4');

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };

const METRICS = () => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const paint = performance.getEntriesByName('first-contentful-paint')[0] || {};
  return {
    fcp: Math.round(paint.startTime || 0),
    dcl: Math.round(nav.domContentLoadedEventEnd || 0),
    domNodes: document.getElementsByTagName('*').length,
    viewNodes: document.querySelector('.view-container.active')?.getElementsByTagName('*').length || 0,
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
  };
};

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const results = {};
try {
  /**
   * @param {string} label
   * @param {object} state
   * @param {{ offline?: boolean }} [opts] offline blocks EVERY external host,
   *   which is what an installed PWA actually starts into.
   */
  async function measure(label, state, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
    if (opts.offline) await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)]);
    await ctx.addInitScript(pinClock, CLOCK);
    const page = await ctx.newPage();

    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.view-container.active', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('#view-home *').length > 50, null, { timeout: 60000 });
    const startMs = Date.now() - t0;
    const m = await page.evaluate(METRICS);

    const step = async (sel, ready) => {
      const s = Date.now();
      await page.click(sel);
      await page.waitForFunction(ready, null, { timeout: 60000 }).catch(() => {});
      return Date.now() - s;
    };
    const train = await step('.nav-item[data-target="workout"]', () => (document.querySelector('#view-workout.active')?.querySelectorAll('*').length || 0) > 30);
    const progress = await step('.nav-item[data-target="analytics"]', () => (document.querySelector('#view-analytics.active')?.querySelectorAll('*').length || 0) > 30);
    const plans = await step('.nav-item[data-target="program"]', () => (document.querySelector('#view-program.active')?.querySelectorAll('*').length || 0) > 30);

    await page.click('.nav-item[data-target="home"]');
    await page.waitForTimeout(300);
    const cs = Date.now();
    await page.click('#homePrimaryCta');
    const cockpitOpened = await page.waitForSelector('#view-workout .cockpit-ex-name', { timeout: 30000 }).then(() => true).catch(() => false);
    const cockpit = Date.now() - cs;
    if (!cockpitOpened) fail(`${label}: the cockpit never opened, so its cost is unmeasured`);
    const cockpitNodes = (await page.evaluate(METRICS)).viewNodes;

    let filter = null;
    await page.evaluate(() => /** @type {any} */ (document.querySelector('[data-action="open-add-exercise"]'))?.click());
    if (await page.waitForSelector('#addExerciseModal.active', { timeout: 8000 }).then(() => true).catch(() => false)) {
      await page.waitForTimeout(250);
      const fs = Date.now();
      await page.fill('#elSearchInput', 'press');
      await page.waitForFunction(() => document.querySelectorAll('#addExerciseModal [data-action="el-pick"]').length > 0, null, { timeout: 8000 }).catch(() => {});
      filter = Date.now() - fs;
      await page.keyboard.press('Escape');
    } else {
      fail(`${label}: the exercise picker never opened, so filtering 155 exercises is unmeasured`);
    }

    const warmStart = Date.now();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.view-container.active', { timeout: 60000 });
    const warm = Date.now() - warmStart;

    await ctx.close();
    const row = { ...m, startMs, warm, train, progress, plans, cockpit, cockpitNodes, filter };
    results[label] = row;
    console.log(`\n  ${label}`);
    console.log(`    first paint ${String(row.fcp).padStart(5)}ms   DOMContentLoaded ${row.dcl}ms`);
    console.log(`    start  cold ${String(row.startMs).padStart(5)}ms   warm ${row.warm}ms`);
    console.log(`    nav    train ${row.train}ms · progress ${row.progress}ms · plans ${row.plans}ms`);
    console.log(`    open workout ${String(row.cockpit).padStart(5)}ms   filter 155 exercises ${row.filter}ms`);
    console.log(`    dom ${row.domNodes} nodes · active view ${row.viewNodes} · cockpit ${row.cockpitNodes} · heap ${row.heapMB}MB`);
    return row;
  }

  console.log('Measuring. Wall-clock is REPORTED for same-machine comparison; only the');
  console.log('structural facts below are asserted. See the header for why.');

  const light = await measure('new athlete (1 week)', LIGHT);
  const heavy = await measure('5 years of history', HEAVY);
  const offline = await measure('5 years, fully offline', HEAVY, { offline: true });

  console.log('\n  ── asserted ──');

  // 1. First paint is not render-blocked.
  //
  //    Both runs are asserted, but they catch different things and it is worth
  //    knowing which is which. `route.abort()` fails a request IMMEDIATELY, so
  //    the "offline" run models a browser that knows it is offline — a blocking
  //    stylesheet there fails fast and barely delays paint (measured 180ms with
  //    the defect present). The case that actually hurts is a host that accepts
  //    the connection and never answers, which is what a sandboxed or firewalled
  //    network does, and that is reproduced by the ONLINE run here: 12,648ms
  //    with the defect restored, 152ms without. If this ever needs debugging,
  //    the online row is the informative one.
  for (const [label, row] of [['online', heavy], ['offline', offline]]) {
    if (row.fcp > FCP_BUDGET_MS) {
      fail(`first contentful paint ${row.fcp}ms (${label}) exceeds the ${FCP_BUDGET_MS}ms budget — `
        + 'something is render-blocking. Check for a stylesheet or script added to <head> '
        + 'that loads from a host the app cannot reach.');
    } else {
      console.log(`  ok · first paint not render-blocked (${label}: ${row.fcp}ms, budget ${FCP_BUDGET_MS}ms)`);
    }
  }

  // 2. The DOM stays bounded as history grows. Five years must not render more
  //    than one week does — the app pages/aggregates rather than dumping rows.
  const ratio = heavy.viewNodes / Math.max(1, light.viewNodes);
  if (ratio > DOM_GROWTH_BUDGET) {
    fail(`the active view renders ${ratio.toFixed(2)}× more nodes with 5 years of history than with one week `
      + `(${light.viewNodes} → ${heavy.viewNodes}, budget ${DOM_GROWTH_BUDGET}×). Something is rendering per-record.`);
  } else {
    console.log(`  ok · DOM bounded as history grows (${light.viewNodes} → ${heavy.viewNodes} nodes, ${ratio.toFixed(2)}×)`);
  }

  // 3. Offline start actually works. This PWA claims it; nothing was checking.
  if (offline.viewNodes < 50) fail('the app did not render with every external host blocked — offline start is broken');
  else console.log(`  ok · renders fully offline (${offline.viewNodes} nodes in the active view)`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\nPerformance baseline failed (${failures.length}).`);
  process.exit(1);
}
console.log('\nPerformance baseline passed.');
