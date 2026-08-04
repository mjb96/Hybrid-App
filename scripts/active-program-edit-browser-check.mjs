// =============================================================================
// ACTIVE-PROGRAM EDIT — end-to-end regression check.
//
// Proves that editing the ACTIVE personal program propagates to every live
// surface WITHOUT a reload or a double navigation, that the change survives a
// storage reload, that no duplicate program is created, and that a workout
// already started (with a logged set) keeps its own snapshot.
//
// The "next-workout display" is the workout cockpit — the real prescription
// surface reached from Home in one tap (start-today-workout). Exercise names are
// asserted from specific elements (.cockpit-ex-name, .wpm-exercise-item span),
// never broad page text.
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

const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// Weekday of "today" in the fixed timezone — the cockpit defaults to this day.
const todayKey = DAY_KEYS[new Date(`${todayISO}T12:00:00`).getUTCDay()];
const emptySet = () => ({ w: '', r: '', c: false });
const restDay = () => ({ title: 'Rest', badge: 'Rest', color: 'var(--text-muted)', desc: '', runs: 'Rest', lifts: [] });

function baseFixture() {
  const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, restDay()]));
  // Only "today" is a training day so the cockpit opens straight onto it.
  days[todayKey] = { title: 'Upper Strength', badge: 'Gym', color: '#3b82f6', desc: '', runs: 'Rest', lifts: ['Bench Press', 'Barbell Row'] };
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'prog_mine', activeActivationId: 'act1',
    settings: { name: 'T', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    customPrograms: [{
      id: 'prog_mine', name: 'My Active Plan', totalWeeks: 4,
      isPrimaryCustomization: true, sourceProgramId: 'stronglifts_5x5',
      dossier: { creator: 'You', focus: 'Strength' },
      days, weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: '' }, '2': { sets: 3, reps: 5, intensityLabel: '' } },
    }],
    weeks: {
      '1': {
        activationId: 'act1', dates: {}, sessionStatus: {},
        lifts: { [todayKey]: { 'Bench Press': [emptySet(), emptySet(), emptySet()], 'Barbell Row': [emptySet(), emptySet(), emptySet()] } },
        liftOrder: { [todayKey]: ['Bench Press', 'Barbell Row'] },
        runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {},
      },
    },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  };
}

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`); else console.log(`  ok · ${label} = ${a}`);
};

// A REAL built-in/catalog program active, with NO personal programs yet — the
// exact case the earlier fixture (prog_mine already in customPrograms) missed.
function builtInFixture() {
  return {
    schemaVersion: 5, currentWeek: '2', activeProgramId: 'stronglifts_5x5', activeActivationId: 'act_bi',
    settings: { name: 'T', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    activations: [{ id: 'act_bi', programId: 'stronglifts_5x5', startWeek: 1, status: 'active', startedAt: new Date().toISOString() }],
    customPrograms: [],
    weeks: { '2': { activationId: 'act_bi', dates: {}, sessionStatus: {}, lifts: {}, liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {} } },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  };
}

async function newPage(browser, fixture = baseFixture()) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
  // Seed ONLY on first load — the init script re-runs on reload, and clobbering
  // localStorage there would hide whether the edit actually persisted.
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [STORAGE_KEY, JSON.stringify(fixture)]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/frame-ancestors|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}

const cockpitNames = (page) => page.$$eval('#cockpitExercisesContainer .cockpit-ex-name', els => els.map(e => e.textContent.trim()));
const previewNames = (page) => page.$$eval('#wpmSheet .wpm-exercise-item > span:first-child', els => els.map(e => e.textContent.trim()));

async function openCockpitFromHome(page) {
  await page.click('.nav-item[data-target="home"]').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#homePrimaryCta');
  await page.waitForSelector('#view-workout .cockpit-ex-name', { timeout: 8000 });
  await page.waitForTimeout(150);
}

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

async function openDetail(page) {
  await page.click('.nav-item[data-target="program"]');
  await page.waitForTimeout(300);
  await page.click('[data-action="open-program-detail"][data-program-id="prog_mine"]');
  await page.waitForSelector('#programDetailScreen .detail-cta-secondary [data-program-id="prog_mine"]', { timeout: 8000 });
  await page.waitForTimeout(150);
}

async function detailDayExercises(page) {
  await page.click(`#programDetailScreen [data-action="open-day-preview"][data-day="${todayKey}"]`);
  await page.waitForSelector('#wpmSheet .wpm-exercise-item', { timeout: 6000 });
  const names = await previewNames(page);
  await page.click('#wpmSheet [data-action="close-day-preview"], #wpmBackdrop').catch(() => {});
  await page.waitForTimeout(150);
  return names;
}

async function pickExact(page, name) {
  await page.fill('#builderExerciseSearch', name);
  await page.waitForTimeout(200);
  // b-pick-custom always carries the exact typed string, so the asserted names are deterministic.
  await page.click('#builderExerciseResults [data-action="b-pick-custom"]');
  await page.waitForTimeout(200);
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  // ---- Scenario A: ACTIVE PERSONAL program edit — propagates immediately,
  //      persists, no duplicate. (Proves in-place editing; NOT proof that an
  //      active built-in transfers correctly — that is Scenario C.) ------------
  {
    const { ctx, page, errors } = await newPage(browser);

    await openCockpitFromHome(page);
    eq(await cockpitNames(page), ['Bench Press', 'Barbell Row'], 'A1 cockpit before edit');

    await openDetail(page);
    const btn = await page.$eval('#programDetailScreen .detail-cta-secondary [data-program-id="prog_mine"]',
      el => ({ action: el.getAttribute('data-action'), text: el.textContent.trim() }));
    if (btn.action !== 'open-builder') fail(`A2 active personal program action should be Edit, got ${btn.action}`);
    if (!/edit/i.test(btn.text)) fail(`A2 button label should read Edit, got "${btn.text}"`);
    else console.log(`  ok · A2 detail action = ${btn.action} ("${btn.text}")`);
    eq(await detailDayExercises(page), ['Bench Press', 'Barbell Row'], 'A3 detail before edit');

    // Enter the builder (in place) and edit: replace Bench Press, add Face Pull.
    await page.click('#programDetailScreen .detail-cta-secondary [data-action="open-builder"][data-program-id="prog_mine"]');
    await page.waitForSelector('#builderViewContainer .program-editor__exercise-name', { timeout: 8000 });
    await page.click('#builderViewContainer .program-editor__exercise-name[data-i="0"]'); // replace slot 0
    await pickExact(page, 'Dumbbell Bench Press');
    await page.click('#builderViewContainer .program-editor__add');
    await pickExact(page, 'Face Pull');
    await page.waitForTimeout(400); // let auto-save + reconcile settle

    // Leave the builder → back to library, then reopen detail (single navigation).
    await page.click('#builderViewContainer [data-action="close-builder"]');
    await page.waitForTimeout(300);
    await openDetail(page);
    eq(await detailDayExercises(page), ['Dumbbell Bench Press', 'Barbell Row', 'Face Pull'], 'A4 detail immediately after edit (no reload)');

    // Home → cockpit (no reload) reflects the edit.
    await openCockpitFromHome(page);
    eq(await cockpitNames(page), ['Dumbbell Bench Press', 'Barbell Row', 'Face Pull'], 'A5 cockpit immediately after edit (no reload)');

    const count1 = await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).customPrograms.length);
    eq(count1, 1, 'A6 exactly one personal program (no duplicate)');

    // Reload → hydration keeps everything.
    await page.reload({ waitUntil: 'networkidle' });
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return { active: s.activeProgramId, count: s.customPrograms.length, lifts: s.customPrograms.find(p => p.id === 'prog_mine').days };
    });
    eq(after.active, 'prog_mine', 'A7 same program active after reload');
    eq(after.count, 1, 'A7 still one copy after reload');
    eq(after.lifts[todayKey].lifts, ['Dumbbell Bench Press', 'Barbell Row', 'Face Pull'], 'A7 definition persisted');
    await openCockpitFromHome(page);
    eq(await cockpitNames(page), ['Dumbbell Bench Press', 'Barbell Row', 'Face Pull'], 'A8 cockpit after reload');

    if (errors.length) fail(`A browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- Scenario B: a started+logged workout keeps its snapshot ----------------
  {
    const { ctx, page, errors } = await newPage(browser);

    // Start the workout and COMPLETE one Bench Press set (weight + reps + check).
    await openCockpitFromHome(page);
    const firstRow = '#cockpitExercisesContainer .cockpit-exercise[data-liftname="Bench Press"] .cockpit-set-row[data-set-index="0"]';
    await page.fill(`${firstRow} .input-weight-node`, '80');
    await page.fill(`${firstRow} .input-reps-node`, '5');
    await page.check(`${firstRow} .gym-check`).catch(async () => { await page.click(`${firstRow} .gym-check`).catch(() => {}); });
    await page.waitForTimeout(300);
    const logged = await page.evaluate((d) => {
      const set = JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).weeks['1'].lifts[d]['Bench Press'][0];
      return { c: !!set?.c, w: set?.w };
    }, todayKey);
    if (!logged.c) fail(`B could not log a completed set (c=${logged.c}, w=${logged.w}) — test setup issue`);
    else console.log(`  ok · B logged a completed Bench Press set (w=${logged.w}, c=${logged.c})`);

    // Edit the source program (replace Bench, add Face Pull) via detail → builder.
    await openDetail(page);
    await page.click('#programDetailScreen .detail-cta-secondary [data-action="open-builder"][data-program-id="prog_mine"]');
    await page.waitForSelector('#builderViewContainer .program-editor__exercise-name', { timeout: 8000 });
    await page.click('#builderViewContainer .program-editor__exercise-name[data-i="0"]');
    await pickExact(page, 'Dumbbell Bench Press');
    await page.click('#builderViewContainer .program-editor__add');
    await pickExact(page, 'Face Pull');
    await page.waitForTimeout(400);
    await page.click('#builderViewContainer [data-action="close-builder"]');
    await page.waitForTimeout(300);

    // The started day's stored session is immutable history: the logged Bench
    // Press set survives verbatim, and the day never absorbs the new exercise.
    const startedDay = await page.evaluate((d) => {
      const day = JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).weeks['1'].lifts[d];
      return { keys: Object.keys(day), bench: day['Bench Press']?.[0] };
    }, todayKey);
    if (!startedDay.keys.includes('Bench Press')) fail(`B started workout lost its logged exercise — got ${JSON.stringify(startedDay.keys)}`);
    else if (!startedDay.bench?.c || String(startedDay.bench?.w) !== '80') fail(`B logged Bench Press set was mutated — got ${JSON.stringify(startedDay.bench)}`);
    else console.log(`  ok · B started workout snapshot intact (Bench Press w=${startedDay.bench.w} c=${startedDay.bench.c})`);
    if (startedDay.keys.includes('Face Pull')) fail('B started workout absorbed a later template edit (Face Pull) — snapshot not protected');

    // And the DEFINITION did update, so a NEW future workout uses the edit.
    const futureOK = await page.evaluate((d) => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return (s.customPrograms.find(p => p.id === 'prog_mine').days[d].lifts || []);
    }, todayKey);
    eq(futureOK, ['Dumbbell Bench Press', 'Barbell Row', 'Face Pull'], 'B template definition updated for future workouts');

    if (errors.length) fail(`B browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- Scenario C: editing the ACTIVE BUILT-IN transfers the active identity --
  {
    const { ctx, page, errors } = await newPage(browser, builtInFixture());

    eq(await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).activeProgramId),
      'stronglifts_5x5', 'C1 a real built-in program is active on load');

    // The active program's detail offers "Edit" (transfer), not "Customize".
    await openDetailById(page, 'stronglifts_5x5');
    const btn = await page.$eval('#programDetailScreen .detail-cta-secondary [data-program-id="stronglifts_5x5"]',
      el => ({ action: el.getAttribute('data-action'), text: el.textContent.trim() }));
    if (btn.action !== 'edit-active-program') fail(`C2 active built-in edit action should be edit-active-program, got ${btn.action}`);
    else console.log(`  ok · C2 detail action = ${btn.action} ("${btn.text}")`);

    // Press Edit → the active identity transfers to a personal program.
    await page.click('#programDetailScreen [data-action="edit-active-program"]');
    await page.waitForSelector('#builderViewContainer .program-editor__exercise-name', { timeout: 8000 });
    const t = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return {
        active: s.activeProgramId, count: s.customPrograms.length, act: s.activeActivationId, week: s.currentWeek,
        actProg: (s.activations || []).find(a => a.id === s.activeActivationId)?.programId, name: s.customPrograms[0]?.name,
        source: s.customPrograms[0]?.sourceProgramId,
      };
    });
    if (!t.active.startsWith('prog_')) fail(`C3 activeProgramId did not transfer to a personal id (still ${t.active})`);
    else console.log(`  ok · C3 active id transferred built-in → personal (${t.active})`);
    const personalId = t.active;
    eq(t.count, 1, 'C3 exactly one personal customization created');
    eq(t.active !== 'stronglifts_5x5', true, 'C3 the built-in is no longer active');
    eq(t.act, 'act_bi', 'C3 activation continuity preserved (same run)');
    eq(t.week, '2', 'C3 current week preserved (no Week 1 reset)');
    eq(t.actProg, personalId, 'C3 activation record retargeted to the personal id');
    eq(t.source, 'stronglifts_5x5', 'C3 source attribution retained');
    if (/\(Copy\)/.test(t.name || '')) fail(`C3 active plan should keep its name, got "${t.name}"`);

    // Edit the builder's first training day: replace slot 0, add Face Pull.
    const builderDay = await page.evaluate(() => {
      const prog = JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).customPrograms[0];
      return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].find(d => (prog.days[d]?.lifts || []).some(n => typeof n === 'string' && n.trim())) || 'mon';
    });
    await page.click(`#builderViewContainer [data-action="b-select-day"][data-day="${builderDay}"]`);
    await page.waitForTimeout(200);
    await page.click('#builderViewContainer .program-editor__exercise-name[data-i="0"]');
    await pickExact(page, 'Dumbbell Bench Press');
    await page.click('#builderViewContainer .program-editor__add');
    await pickExact(page, 'Face Pull');
    await page.waitForTimeout(400);
    const expected = await page.evaluate((d) => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).customPrograms[0].days[d].lifts, builderDay);
    if (!expected.includes('Dumbbell Bench Press') || !expected.includes('Face Pull')) fail(`C4 edit not applied, got ${JSON.stringify(expected)}`);

    // Close builder → the active program's detail shows the edits immediately.
    await page.click('#builderViewContainer [data-action="close-builder"]');
    await page.waitForTimeout(300);
    await openDetailById(page, personalId);
    await page.click(`#programDetailScreen [data-action="open-day-preview"][data-day="${builderDay}"]`);
    await page.waitForSelector('#wpmSheet .wpm-exercise-item', { timeout: 6000 });
    eq(await previewNames(page), expected, 'C5 active detail shows edits immediately (no reload)');
    await page.click('#wpmSheet [data-action="close-day-preview"], #wpmBackdrop').catch(() => {});
    await page.waitForTimeout(150);

    // Cockpit (next workout) for that day shows the edits — no reload.
    await page.click('.nav-item[data-target="workout"]');
    await page.waitForSelector('#view-workout', { timeout: 6000 });
    // Train opens on its landing; step into the cockpit for the day selector.
    await page.click('#trainLanding [data-action="qs-workout"]');
    await page.waitForSelector('#trainCockpit:not([hidden])');
    await page.click(`#cockpitDaySelectorBar .day-pill[data-day="${builderDay}"]`);
    await page.waitForTimeout(300);
    eq(await cockpitNames(page), expected, 'C6 cockpit resolves the personal definition (no reload)');

    // Reload → the PERSONAL program stays active; the built-in is not restored.
    await page.reload({ waitUntil: 'networkidle' });
    const afterReload = await page.evaluate((d) => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return { active: s.activeProgramId, count: s.customPrograms.length, actProg: (s.activations || []).find(a => a.id === s.activeActivationId)?.programId, lifts: s.customPrograms[0].days[d].lifts };
    }, builderDay);
    eq(afterReload.active, personalId, 'C7 personal program remains active after reload (built-in NOT restored)');
    eq(afterReload.count, 1, 'C7 still exactly one copy after reload');
    eq(afterReload.actProg, personalId, 'C7 activation record still personal after reload');
    if (!afterReload.lifts.includes('Face Pull')) fail('C7 edited definition lost after reload');

    // Press Edit again → the SAME personal program, no second copy.
    await openDetailById(page, personalId);
    await page.click(`#programDetailScreen [data-action="open-builder"][data-program-id="${personalId}"]`);
    await page.waitForTimeout(400);
    const reedit = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return { active: s.activeProgramId, count: s.customPrograms.length };
    });
    eq(reedit.active, personalId, 'C8 re-edit keeps the same active personal id');
    eq(reedit.count, 1, 'C8 no second copy created on re-edit');

    if (errors.length) fail(`C browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) { console.error(`\n${failures.length} failure(s).`); process.exit(1); }
console.log('\nActive-program edit e2e contract passed.');
