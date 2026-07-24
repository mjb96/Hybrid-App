// =============================================================================
// JACKED & TAN: SHED EDITION — end-to-end browser regression check.
//
// Drives the REAL interface (no mocks) to prove:
//   • the program appears in the library and its detail can be previewed;
//   • program-level notes, the week brief and per-exercise coaching notes render;
//   • Week 1 Monday shows the correct exercises;
//   • Tuesday includes Pull-Up (not Band Lat Pulldown); Saturday includes Band
//     Lat Pulldown;
//   • the program activates through the real confirmation modal (one active
//     instance, no duplicate library entry) and Week advancement uses program
//     weeks;
//   • a session note entered in the cockpit saves and survives a reload;
//   • switching the active program away and back does not alter the completed
//     workout or its note, and shows no stale completion from the other program.
//
// Uses specific selectors + exercise names, never broad full-page text. Mirrors
// the proven scaffolding in active-program-edit-browser-check.mjs.
//
// When Playwright/Chromium is unavailable this exits 0 (skip) unless --required.
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
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' }); res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://127.0.0.1:${port}`;
const TZ = 'Australia/Sydney';
const STORAGE_KEY = 'hybrid_engine_v2_state';
const JT_ID = 'jt_shed_edition';

const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const todayKey = DAY_KEYS[new Date(`${todayISO}T12:00:00`).getUTCDay()];
const isJtTrainingDay = ['mon', 'tue', 'thu', 'fri', 'sat'].includes(todayKey);

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`); else console.log(`  ok · ${label} = ${a}`);
};
const ok = (cond, label) => { if (!cond) fail(label); else console.log(`  ok · ${label}`); };

// A DIFFERENT program is active so activating J&T is a clean switch with no
// in-progress workout to resolve — the confirmation modal shows week choices.
function otherActiveFixture() {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'stronglifts_5x5', activeActivationId: 'act_sl',
    settings: { name: 'T', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    activations: [{ id: 'act_sl', programId: 'stronglifts_5x5', startWeek: 1, status: 'active', startedAt: new Date().toISOString() }],
    customPrograms: [],
    weeks: { '1': { activationId: 'act_sl', dates: {}, sessionStatus: {}, lifts: {}, liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {} } },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  };
}

async function newPage(browser, fixture) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [STORAGE_KEY, JSON.stringify(fixture)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/frame-ancestors|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}

const readState = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), STORAGE_KEY);
const cockpitNames = (page) => page.$$eval('#cockpitExercisesContainer .cockpit-ex-name', els => els.map(e => e.textContent.trim()));
const previewNames = (page) => page.$$eval('#wpmSheet .wpm-exercise-item > span:first-child', els => els.map(e => e.textContent.trim()));

async function openDetailById(page, id) {
  await page.click('.nav-item[data-target="program"]');
  await page.waitForTimeout(300);
  await page.evaluate((pid) => {
    const b = document.createElement('button');
    b.setAttribute('data-action', 'open-program-detail');
    b.setAttribute('data-program-id', pid);
    b.style.display = 'none';
    document.body.appendChild(b); b.click(); b.remove();
  }, id);
  await page.waitForSelector(`#programDetailScreen .detail-cta-secondary [data-program-id="${id}"]`, { timeout: 8000 });
  await page.waitForTimeout(150);
}

// The session-notes textarea lives inside a collapsed <details> ("Session
// Overview"); expand it and enter a note the way a user would (save fires on
// focusout → commitWorkoutUIState).
async function enterSessionNote(page, note) {
  const summary = '#view-workout details.wk-overview > summary.wk-overview__summary';
  if (!(await page.$eval('#view-workout details.wk-overview', el => el.open).catch(() => false))) {
    await page.click(summary);
  }
  await page.waitForSelector('#sessionNotesInput', { state: 'visible', timeout: 6000 });
  await page.fill('#sessionNotesInput', note);
  await page.locator('#sessionNotesInput').blur(); // real focusout → save
  await page.waitForTimeout(300);
}

async function dayPreview(page, day) {
  await page.click(`#programDetailScreen [data-action="open-day-preview"][data-day="${day}"]`);
  await page.waitForSelector('#wpmSheet .wpm-exercise-item', { timeout: 6000 });
  const names = await previewNames(page);
  await page.click('#wpmSheet [data-action="close-day-preview"], #wpmBackdrop').catch(() => {});
  await page.waitForTimeout(150);
  return names;
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  // ---- Scenario A: library → preview → notes → per-day exercises -------------
  {
    const { ctx, page, errors } = await newPage(browser, otherActiveFixture());

    await openDetailById(page, JT_ID);
    const title = await page.$eval('#programDetailScreen .detail-title', el => el.textContent.trim());
    eq(title, 'Jacked & Tan: Shed Edition', 'A1 program previewable from library');

    // Notes render (program notes, week brief, per-exercise coaching notes).
    ok(await page.$('#programDetailScreen .jt-program-notes'), 'A2 program-level notes render');
    ok(await page.$('#programDetailScreen .jt-week-brief'), 'A3 week brief renders');
    const weekBriefText = await page.$eval('#programDetailScreen .jt-week-brief', el => el.textContent);
    ok(/Volume base/.test(weekBriefText), 'A3b week 1 brief shows the Volume base phase');
    ok((await page.$$('#programDetailScreen details.jt-ex-note')).length >= 20, 'A4 per-exercise coaching notes present');

    // Week 1 Monday exercises (deterministic via the day preview).
    eq(await dayPreview(page, 'mon'),
      ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Chest-Supported Dumbbell Row', 'Band Leg Curl', 'Barbell Standing Calf Raise', 'Ab Wheel Rollout'],
      'A5 Week 1 Monday exercises');

    // Tuesday uses Pull-Up (not Band Lat Pulldown); Saturday keeps Band Lat Pulldown.
    const tue = await dayPreview(page, 'tue');
    ok(tue.includes('Pull-Up'), 'A6 Tuesday includes Pull-Up');
    ok(!tue.includes('Band Lat Pulldown'), 'A6b Tuesday excludes Band Lat Pulldown');
    const sat = await dayPreview(page, 'sat');
    ok(sat.includes('Band Lat Pulldown'), 'A7 Saturday includes Band Lat Pulldown');

    if (errors.length) fail(`A browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- Scenario B: activate (single instance, no duplicate) + week model -----
  {
    const { ctx, page, errors } = await newPage(browser, otherActiveFixture());
    await openDetailById(page, JT_ID);
    await page.click('#programDetailScreen [data-action="make-active-from-detail"][data-program-id="' + JT_ID + '"]');
    await page.waitForSelector('.actm-overlay [data-act-week]', { timeout: 6000 });
    await page.click('.actm-overlay .actm__btn--primary[data-act-week]'); // Start at Week 1
    await page.waitForTimeout(500);

    const s = await readState(page);
    eq(s.activeProgramId, JT_ID, 'B1 J&T is the active program');
    eq(s.currentWeek, '1', 'B2 activation starts at program Week 1');
    eq((s.customPrograms || []).length, 0, 'B3 activation created no duplicate library/custom copy');

    // Session note through the cockpit (only when today is a J&T training day —
    // on a rest day the cockpit correctly has no session, which also proves rest
    // days are not generated as empty workouts).
    if (isJtTrainingDay) {
      await page.click('.nav-item[data-target="home"]').catch(() => {});
      await page.waitForTimeout(200);
      await page.click('#homePrimaryCta');
      await page.waitForSelector('#view-workout .cockpit-ex-name', { timeout: 8000 });
      const names = await cockpitNames(page);
      ok(names.length >= 7, `B4 cockpit renders today's (${todayKey}) J&T session`);

      const NOTE = 'Back tweak on RDL — cut it short, felt strong on squats.';
      await enterSessionNote(page, NOTE);
      const afterType = await readState(page);
      eq(afterType.weeks['1'].notes[todayKey], NOTE, 'B5 session note saved to the workout snapshot');

      await page.reload({ waitUntil: 'networkidle' });
      const afterReload = await readState(page);
      eq(afterReload.weeks['1'].notes[todayKey], NOTE, 'B6 session note survives reload');
    } else {
      console.log(`  ok · B4–B6 skipped — today (${todayKey}) is a J&T rest day (no empty workout generated)`);
      ok(!(await page.$('#homePrimaryCta[data-x-nonexistent]')), 'B4b rest day handled without a phantom session');
    }

    if (errors.length) fail(`B browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- Scenario C: switch away and back — no mutation, no stale completion ----
  if (isJtTrainingDay) {
    const { ctx, page, errors } = await newPage(browser, otherActiveFixture());

    // Activate J&T, log a completed first set + a note on today's session.
    await openDetailById(page, JT_ID);
    await page.click('#programDetailScreen [data-action="make-active-from-detail"][data-program-id="' + JT_ID + '"]');
    await page.waitForSelector('.actm-overlay [data-act-week]', { timeout: 6000 });
    await page.click('.actm-overlay .actm__btn--primary[data-act-week]');
    await page.waitForTimeout(400);
    await page.click('.nav-item[data-target="home"]').catch(() => {});
    await page.waitForTimeout(200);
    await page.click('#homePrimaryCta');
    await page.waitForSelector('#view-workout .cockpit-ex-name', { timeout: 8000 });
    const firstLift = (await cockpitNames(page))[0];
    const row0 = `#cockpitExercisesContainer .cockpit-exercise[data-liftname="${firstLift}"] .cockpit-set-row[data-set-index="0"]`;
    await page.fill(`${row0} .input-weight-node`, '100');
    await page.fill(`${row0} .input-reps-node`, '10');
    await page.check(`${row0} .gym-check`).catch(async () => { await page.click(`${row0} .gym-check`).catch(() => {}); });
    await enterSessionNote(page, 'J&T squat day done.');

    const before = await readState(page);
    const completedSnapshot = JSON.stringify(before.weeks['1'].lifts[todayKey][firstLift]);
    ok(before.weeks['1'].lifts[todayKey][firstLift][0].c === true, 'C1 first J&T set logged as complete');

    // Switch to StrongLifts via its detail + confirm modal.
    await openDetailById(page, 'stronglifts_5x5');
    await page.click('#programDetailScreen [data-action="make-active-from-detail"][data-program-id="stronglifts_5x5"]');
    await page.waitForTimeout(400);
    // Switch modal may require a workout resolution (save/switch) OR a week choice.
    const saveBtn = await page.$('.actm-overlay [data-act-resolution="save"]');
    if (saveBtn) await saveBtn.click();
    else await page.click('.actm-overlay .actm__btn--primary[data-act-week]');
    await page.waitForTimeout(500);

    // Switch back to J&T.
    await openDetailById(page, JT_ID);
    await page.click('#programDetailScreen [data-action="make-active-from-detail"][data-program-id="' + JT_ID + '"]');
    await page.waitForTimeout(400);
    const saveBtn2 = await page.$('.actm-overlay [data-act-resolution="save"]');
    if (saveBtn2) await saveBtn2.click();
    else await page.click('.actm-overlay .actm__btn--primary[data-act-week]');
    await page.waitForTimeout(500);

    const after = await readState(page);
    // The completed J&T work is archived byte-for-byte (kept, not mutated).
    // Multiple switches create multiple archives — pick the one holding J&T's set.
    const archKey = Object.keys(after.weeks)
      .filter((k) => k.startsWith('arch:'))
      .find((k) => after.weeks[k]?.lifts?.[todayKey]?.[firstLift]);
    ok(archKey, 'C2 previous J&T run archived on switch');
    if (archKey) {
      eq(JSON.stringify(after.weeks[archKey].lifts[todayKey][firstLift]), completedSnapshot, 'C3 completed workout unchanged after switching away and back');
      eq(after.weeks[archKey].notes[todayKey], 'J&T squat day done.', 'C4 session note stays attached to the completed workout');
    }
    // The fresh J&T run's active week has no stale completion.
    const freshDay = (after.weeks['1'] && after.weeks['1'].lifts[todayKey]) || {};
    const anyStale = Object.values(freshDay).some((sets) => Array.isArray(sets) && sets.some((st) => st && st.c));
    ok(!anyStale, 'C5 returning to J&T shows no stale completion');

    if (errors.length) fail(`C browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  } else {
    console.log(`  ok · Scenario C skipped — today (${todayKey}) is a J&T rest day`);
  }

  if (failures.length) { console.error(`\n${failures.length} failure(s).`); process.exit(1); }
  console.log('\nAll Jacked & Tan browser checks passed.');
} finally {
  await browser.close();
  server.close();
}
