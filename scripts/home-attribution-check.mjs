// ============================================================================
// Helyx — Home weekly-attribution check (real-browser)
// ----------------------------------------------------------------------------
// Drives the REAL app in headless Chromium at a phone width and proves the
// calendar-attribution fix end to end: with a frozen program week whose logged
// training all falls in the PREVIOUS calendar week, the Home "In Focus" graph
// must read 0 for "this week" (not the stale ~55 sets), and previous-week nav
// must still surface last week's real total.
//
// Seeds the scenario RELATIVE to the real current date (no Date mocking), so it
// stays valid whenever it runs.
//
//   node scripts/home-attribution-check.mjs
//
// Local runs may skip when Chromium is absent. `--required` (used by CI) turns
// a missing dependency/browser into a hard failure.
// ============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const browserRuntime = await resolveChromium();
if (!browserRuntime) process.exit(0);
const { chromium, executablePath: exe } = browserRuntime;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
    const buf = await readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}`;

// ---- build the seeded state relative to real "today" -----------------------
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const now = new Date();
const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12));
const back = (todayUTC.getUTCDay() + 6) % 7;              // days since Monday
const curMon = addDays(todayUTC, -back);                  // this week's Monday
const prevMon = addDays(curMon, -7);                      // last week's Monday
const DAY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const prevDates = {}; DAY.forEach((dk, i) => { prevDates[dk] = iso(addDays(prevMon, i)); });
const work = (w, r) => ({ c: true, w: String(w), r: String(r) });
const nSets = (n, w, r) => Array.from({ length: n }, () => work(w, r));

const seeded = {
  currentWeek: '3',
  activeProgramId: 'hybrid_engine',
  weekStartedAt: prevMon.toISOString(),
  settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', autoAdvanceWeek: false },
  weeks: {
    '3': {
      dates: prevDates,                                   // LAST calendar week
      lifts: {
        mon: { Squat: nSets(15, 100, 5) },
        tue: { Bench: nSets(15, 100, 5) },
        thu: { Row: nSets(10, 80, 8) },
        fri: { Press: nSets(15, 60, 8) },
      },
      runs: {}, gymStats: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, liftOrder: {},
    },
  },
};
const STORAGE_KEY = 'hybrid_engine_v2_state';

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (_) {} },
    [STORAGE_KEY, JSON.stringify(seeded)]);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#strengthBarChart .wfg-total-v', { timeout: 15000 });

  // "This week" total on the In Focus strength graph (default metric = sets).
  const thisWeek = await page.$eval('#strengthBarChart', el => {
    const v = el.querySelector('.wfg-total-v')?.textContent?.trim();
    const l = el.querySelector('.wfg-total-l')?.textContent?.trim();
    const range = el.querySelector('.wfg-range')?.textContent?.trim();
    const bars = [...el.querySelectorAll('.wfg-b')].length;
    return { v, l, range, bars };
  });
  console.log('In Focus (this week):', JSON.stringify(thisWeek));
  if (!/^0\b/.test(thisWeek.v) || thisWeek.l !== 'this week') {
    console.error(`FAIL: In Focus "this week" should read 0 sets, got "${thisWeek.v}" (${thisWeek.l}).`);
    failed = true;
  }
  if (thisWeek.bars !== 0) {
    console.error(`FAIL: current week should have no bars, got ${thisWeek.bars}.`);
    failed = true;
  }

  // Navigate to the previous week → last week's real total (55 sets) reappears.
  await page.click('#strengthBarChart [data-wfg-action="nav-prev"]');
  await page.waitForTimeout(150);
  const lastWeek = await page.$eval('#strengthBarChart', el => ({
    v: el.querySelector('.wfg-total-v')?.textContent?.trim(),
    range: el.querySelector('.wfg-range')?.textContent?.trim(),
  }));
  console.log('In Focus (previous week):', JSON.stringify(lastWeek));
  if (!/55/.test(lastWeek.v)) {
    console.error(`FAIL: previous week should read 55 sets, got "${lastWeek.v}".`);
    failed = true;
  }

  // A populated bar routes by its REAL calendar date into the exact activity.
  // Monday has one strength activity, so it should bypass the date chooser and
  // open the complete Activity detail directly.
  await page.click('#strengthBarChart [data-wfg-action="bar-click"][data-wfg-day="mon"]');
  await page.waitForSelector('#activitiesScreen .activity-detail-shell', { timeout: 10000 });
  const barDestination = await page.$eval('#activitiesScreen', el => ({
    visible: getComputedStyle(el).display !== 'none',
    title: el.querySelector('#activitiesTitle')?.textContent?.trim(),
    text: el.querySelector('#activitiesContent')?.textContent || '',
  }));
  console.log('In Focus bar destination:', JSON.stringify({
    visible: barDestination.visible, title: barDestination.title,
    hasWorkout: /Squat/.test(barDestination.text),
  }));
  if (!barDestination.visible || barDestination.title !== 'Strength Workout' || !/Squat/.test(barDestination.text)) {
    console.error('FAIL: populated In Focus bar should open the exact dated strength activity.');
    failed = true;
  }
  await page.click('#activitiesBack'); // detail → date-filtered activity list
  await page.click('#activitiesBack'); // list → Home

  // Program card still shows the PROGRAM week (not "this week").
  const progWeek = await page.$eval('#homeWeekBlockIndicator', el => el.textContent.trim()).catch(() => '');
  console.log('Home program indicator:', JSON.stringify(progWeek));
  if (!/Week\s*3/.test(progWeek)) {
    console.error(`FAIL: program card should still read "Week 3", got "${progWeek}".`);
    failed = true;
  }

  // --- Strength DETAIL navigator (calendar weeks) ---------------------------
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.setAttribute('data-action', 'open-analytics');
    b.setAttribute('data-context', 'strength');
    b.style.display = 'none';
    document.body.appendChild(b); b.click(); b.remove();
  });
  await page.waitForSelector('#weekNavLabel', { timeout: 10000 });
  await page.waitForTimeout(150);
  const navThis = await page.$eval('#weekNavLabel', el => el.textContent.trim());
  console.log('Strength detail nav (default):', JSON.stringify(navThis));
  if (navThis !== 'This week') {
    console.error(`FAIL: strength detail should open on "This week", got "${navThis}".`);
    failed = true;
  }

  // The e1RM overview must NOT show a stale "+X kg this week" for an empty week —
  // it must state honestly that there's no strength work this calendar week.
  const overview = await page.$eval('#analytics-strength', el => el.textContent);
  const stale = /[+\-]\d+\s*kg\b/.test(overview) && !/No strength work/.test(overview);
  console.log('Strength overview empty-state:', JSON.stringify({
    honestEmpty: /No strength work logged this week/.test(overview),
    hasPRchip: /new PR/.test(overview),
  }));
  if (!/No strength work logged this week/.test(overview)) {
    console.error('FAIL: empty current week should show an honest "No strength work" e1RM state.');
    failed = true;
  }
  if (/new PR.*this week/.test(overview)) {
    console.error('FAIL: empty current week must not claim a PR this week.');
    failed = true;
  }

  // A leaf opened from a Home deep-link must return to Home, not strand the
  // athlete at the Insights hub.
  const homeBack = await page.$eval('#view-analytics .subview-back-btn', el => ({
    action: el.getAttribute('data-action'), target: el.getAttribute('data-target'), text: el.textContent.trim(),
  }));
  console.log('Home deep-link back route:', JSON.stringify(homeBack));
  if (homeBack.action !== 'switch-tab' || homeBack.target !== 'home' || !/Back to Home/.test(homeBack.text)) {
    console.error('FAIL: an Insights leaf opened from Home should route Back to Home.');
    failed = true;
  }
  await page.click('#view-analytics .subview-back-btn');
  if (!await page.$eval('#view-home', el => el.classList.contains('active'))) {
    console.error('FAIL: selecting Back from the Home-opened leaf did not activate Home.');
    failed = true;
  }
  // Re-open the leaf for the historical-week navigator check below.
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.setAttribute('data-action', 'open-analytics'); b.setAttribute('data-context', 'strength');
    b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove();
  });
  await page.waitForSelector('#analytics-strength.active', { timeout: 10000 });

  await page.click('#weekNavPrev');
  await page.waitForTimeout(150);
  const navPrev = await page.$eval('#weekNavLabel', el => el.textContent.trim());
  const navPrevDates = await page.$eval('#weekNavDates', el => el.textContent.trim());
  console.log('Strength detail nav (prev):', JSON.stringify({ navPrev, navPrevDates }));
  if (navPrev !== 'Previous week') {
    console.error(`FAIL: stepping back should read "Previous week", got "${navPrev}".`);
    failed = true;
  }

  // --- Scenario 2: Bench trained this week AND last week → named same-exercise
  // comparison with correct units, in a fresh context. -----------------------
  const s2 = {
    currentWeek: '3', activeProgramId: 'hybrid_engine', weekStartedAt: curMon.toISOString(),
    settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', autoAdvanceWeek: false },
    weeks: { '3': {
      dates: { mon: iso(prevMon), wed: iso(curMon) },
      lifts: { mon: { 'Bench Press': nSets(3, 100, 5) }, wed: { 'Bench Press': nSets(3, 105, 5) } },
      runs: {}, gymStats: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {}, liftOrder: {},
    } },
  };
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (_) {} }, [STORAGE_KEY, JSON.stringify(s2)]);
  const page2 = await ctx2.newPage();
  await page2.goto(BASE, { waitUntil: 'networkidle' });

  // Home exposes a current-week picker. Starting Wednesday's programmed
  // Legs Power session on a different real weekday keeps Wednesday as the
  // source identity and explains that it is being logged today.
  await page2.click('#homeChooseWorkout');
  await page2.waitForSelector('#programWorkoutPicker.active', { timeout: 10000 });
  const pickerState = await page2.$eval('#programWorkoutPicker', el => ({
    modal: el.getAttribute('aria-modal'),
    hasLegsPower: [...el.querySelectorAll('.program-workout-choice')].some(b => /Legs Power/.test(b.textContent)),
  }));
  if (pickerState.modal !== 'true' || !pickerState.hasLegsPower) {
    console.error('FAIL: Home workout picker did not expose the programmed Legs Power session accessibly.');
    failed = true;
  }
  const oneOffActions = await page2.$eval('#programWorkoutPicker', el => ({
    empty: !!el.querySelector('[data-action="start-empty-workout"]'),
    copy: !!el.querySelector('[data-action="show-copy-workouts"]'),
  }));
  if (!oneOffActions.empty || !oneOffActions.copy) {
    console.error('FAIL: workout picker is missing Empty Workout or Copy Past Workout.');
    failed = true;
  }
  await page2.click('[data-action="start-empty-workout"]');
  await page2.waitForSelector('#view-workout.active', { timeout: 10000 });
  const emptyState = await page2.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('hybrid_engine_v2_state') || '{}');
    const key = state.activeStrengthSessionKey;
    return {
      key,
      kind: state.weeks?.[key]?.sessionKind,
      programBenchStillComplete: state.weeks?.['3']?.lifts?.wed?.['Bench Press']?.[0]?.c,
      daySelectorHidden: document.getElementById('cockpitDaySelectorBar')?.hidden,
    };
  });
  if (!/^session:str_/.test(emptyState.key || '') || emptyState.kind !== 'empty'
      || !emptyState.programBenchStillComplete || !emptyState.daySelectorHidden) {
    console.error('FAIL: Empty Workout was not isolated from the programmed session.', emptyState);
    failed = true;
  }
  await page2.click('.nav-item[data-target="home"]');
  await page2.click('#homeChooseWorkout');
  await page2.click('[data-action="show-copy-workouts"]');
  await page2.waitForSelector('[data-action="copy-past-workout"]', { timeout: 10000 });
  await page2.click('[data-action="copy-past-workout"]');
  await page2.waitForSelector('#view-workout.active', { timeout: 10000 });
  const copyState = await page2.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('hybrid_engine_v2_state') || '{}');
    const key = state.activeStrengthSessionKey;
    const week = state.weeks?.[key];
    const day = week?.sessionDay;
    const sets = Object.values(week?.lifts?.[day] || {}).flat();
    return { kind: week?.sessionKind, title: week?.sessionTitle, setCount: sets.length, anyComplete: sets.some(s => s.c) };
  });
  if (copyState.kind !== 'copy' || !/^Copy of /.test(copyState.title || '')
      || copyState.setCount < 1 || copyState.anyComplete) {
    console.error('FAIL: Copy Past Workout did not preserve an editable, incomplete copy.', copyState);
    failed = true;
  }
  await page2.click('.nav-item[data-target="home"]');
  await page2.click('#homeChooseWorkout');
  const alternateDay = DAY[(new Date().getDay() + 6) % 7] === 'wed' ? 'fri' : 'wed';
  const alternateTitle = alternateDay === 'wed' ? 'Legs Power' : 'Pull B + Easy Run';
  await page2.click(`#programWorkoutPicker [data-action="select-program-workout"][data-day="${alternateDay}"]`);
  await page2.waitForSelector('#view-workout.active', { timeout: 10000 });
  const movedCockpit = await page2.evaluate(() => ({
    title: document.getElementById('cockpitWorkoutTitle')?.textContent?.trim(),
    context: document.getElementById('cockpitScheduleContext')?.textContent?.trim(),
    contextHidden: document.getElementById('cockpitScheduleContext')?.hidden,
  }));
  console.log('Moved workout cockpit:', JSON.stringify(movedCockpit));
  if (movedCockpit.title !== alternateTitle || movedCockpit.contextHidden || !/logged today/.test(movedCockpit.context || '')) {
    console.error('FAIL: selecting another programmed workout did not retain and explain its source identity.');
    failed = true;
  }
  await page2.click('.nav-item[data-target="home"]');

  await page2.evaluate(() => {
    const b = document.createElement('button');
    b.setAttribute('data-action', 'open-analytics'); b.setAttribute('data-context', 'strength');
    b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove();
  });
  await page2.waitForSelector('#analytics-strength', { timeout: 10000 });
  await page2.waitForTimeout(200);
  const s2text = await page2.$eval('#analytics-strength', el => el.textContent);
  const s2ok = /Bench Press vs previous week/.test(s2text) && /\+\d+\s*kg/.test(s2text);
  const movedChip = await page2.$eval('.sw-session-chip[data-day="wed"]', el => ({
    day: el.querySelector('.sw-session-chip__day')?.textContent?.trim(),
    title: el.querySelector('.sw-session-chip__title')?.textContent?.trim(),
  })).catch(() => null);
  console.log('Scenario 2 (named same-exercise change):', JSON.stringify({
    namesBench: /Bench Press vs previous week/.test(s2text), hasKgDelta: /\+\d+\s*kg/.test(s2text), movedChip,
  }));
  if (!s2ok) { console.error('FAIL: this-week Bench change should name "Bench Press vs previous week" with a +kg delta.'); failed = true; }
  if (!movedChip || movedChip.day !== 'Mon' || movedChip.title !== 'Legs Power') {
    console.error('FAIL: Strength Insights should show Monday as performed date but Legs Power as the workout logged.');
    failed = true;
  }
  await ctx2.close();
} catch (e) {
  console.error('ERROR:', e.message);
  failed = true;
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error('home-attribution-check: FAIL'); process.exit(1); }
console.log('home-attribution-check: PASS — empty current week reads 0, last week retains 55.');
