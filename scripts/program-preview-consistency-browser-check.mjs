// =============================================================================
// PROGRAM PREVIEW CONSISTENCY — real home_gym_rebuild_5day regression.
//
// Reproduces the reported phone bug through the REAL UI and proves the fix:
//   • the built-in `home_gym_rebuild_5day` is made active and edited (which
//     forks an editable personal backing program);
//   • on Lower Strength, "Weighted Sit-Up" is replaced with "Seated Calf Raise";
//   • the day-preview sheet then shows EXACTLY the edited exercise list — no
//     stale "Weighted Sit-Up", and never the narrative "Squat + hinge
//     foundation." as part of the Back Squat name;
//   • the replacement inherits the legacy 3×15 prescription;
//   • the workout cockpit agrees, the edit survives a reload, the source catalog
//     is untouched, and re-opening edits the SAME personal program (no dupe).
//
// Names are asserted from specific elements, never broad page text.
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
const PROGRAM_ID = 'home_gym_rebuild_5day';
const DAY = 'tue'; // Lower Strength
const WEEK = '3';
const EXPECTED = ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Seated Calf Raise'];

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`); else console.log(`  ok · ${label} = ${a}`);
};

// A real built-in active with NO personal programs yet, at Week 3.
function fixture() {
  return {
    schemaVersion: 5, currentWeek: WEEK, activeProgramId: PROGRAM_ID, activeActivationId: 'act_hg',
    settings: { name: 'T', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    activations: [{ id: 'act_hg', programId: PROGRAM_ID, startWeek: 1, status: 'active', startedAt: new Date().toISOString() }],
    customPrograms: [],
    weeks: { [WEEK]: { activationId: 'act_hg', dates: {}, sessionStatus: {}, lifts: {}, liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {} } },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  };
}

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [STORAGE_KEY, JSON.stringify(fixture())]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/frame-ancestors|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
}

const previewNames = (page) => page.$$eval('#wpmSheet .wpm-exercise-item > span:first-child', els => els.map(e => e.textContent.trim()));
const cockpitNames = (page) => page.$$eval('#cockpitExercisesContainer .cockpit-ex-name', els => els.map(e => e.textContent.trim()));

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

async function openDayPreview(page, id, day, week) {
  await page.evaluate(([pid, d, w]) => {
    const b = document.createElement('button');
    b.setAttribute('data-action', 'open-day-preview');
    b.setAttribute('data-day', d);
    b.setAttribute('data-week', String(w));
    b.setAttribute('data-program-id', pid);
    b.style.display = 'none';
    document.body.appendChild(b); b.click(); b.remove();
  }, [id, day, week]);
  await page.waitForSelector('#wpmSheet .wpm-exercise-item', { timeout: 6000 });
}

async function closePreview(page) {
  await page.click('#wpmSheet [data-action="close-day-preview"], #wpmBackdrop').catch(() => {});
  await page.waitForTimeout(150);
}

// Pick a REAL catalogue exercise by exact name (b-pick-exercise), falling back to
// the custom-name button if the library doesn't surface it.
async function pickByName(page, name) {
  await page.fill('#builderExerciseSearch', name);
  await page.waitForTimeout(250);
  const exact = await page.$(`#builderExerciseResults [data-action="b-pick-exercise"][data-name="${name}"]`);
  if (exact) await exact.click();
  else await page.click('#builderExerciseResults [data-action="b-pick-custom"]');
  await page.waitForTimeout(250);
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const { ctx, page, errors } = await newPage(browser);

  eq(await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).activeProgramId),
    PROGRAM_ID, '1 real built-in home_gym_rebuild_5day is active');

  // Before edit: the Lower Strength preview shows the authored 5 exercises and
  // NEVER the narrative "Squat + hinge foundation." as an exercise name.
  await openDetailById(page, PROGRAM_ID);
  await openDayPreview(page, PROGRAM_ID, DAY, WEEK);
  const before = await previewNames(page);
  eq(before, ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Weighted Sit-Up'], '2 pre-edit preview list');
  if (before.some(n => /hinge foundation/i.test(n))) fail('2 narrative text leaked into an exercise name pre-edit');
  await closePreview(page);

  // Edit the ACTIVE built-in → forks an editable personal backing program.
  await page.click('#programDetailScreen [data-action="edit-active-program"]');
  await page.waitForSelector('#builderViewContainer .program-editor__exercise-name', { timeout: 8000 });
  const forked = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
    return { active: s.activeProgramId, count: s.customPrograms.length, source: s.customPrograms[0]?.sourceProgramId, week: s.currentWeek };
  });
  if (!forked.active.startsWith('prog_')) fail(`3 active id did not transfer to a personal program (${forked.active})`);
  else console.log(`  ok · 3 active transferred to personal backing program (${forked.active})`);
  eq(forked.count, 1, '3 exactly one personal program created');
  eq(forked.source, PROGRAM_ID, '3 personal program remembers its source');
  eq(forked.week, WEEK, '3 current week preserved');
  const personalId = forked.active;

  // Open Lower Strength in the editor and replace Weighted Sit-Up → Seated Calf Raise.
  await page.click(`#builderViewContainer [data-action="b-select-day"][data-day="${DAY}"]`);
  await page.waitForTimeout(200);
  const rowNames = await page.$$eval('#builderViewContainer .program-editor__exercise-name strong', els => els.map(e => e.textContent.trim()));
  const idx = rowNames.indexOf('Weighted Sit-Up');
  if (idx < 0) fail(`4 Weighted Sit-Up not found in editor rows: ${JSON.stringify(rowNames)}`);
  await page.click(`#builderViewContainer .program-editor__exercise-name[data-i="${idx}"]`);
  await pickByName(page, 'Seated Calf Raise');
  await page.waitForTimeout(400); // auto-save + reconcile

  const editedLifts = await page.evaluate((d) => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).customPrograms[0].days[d].lifts, DAY);
  eq(editedLifts, EXPECTED, '5 editor day.lifts after replacement');

  // Close editor, reopen the day-preview for Week 3.
  await page.click('#builderViewContainer [data-action="close-builder"]');
  await page.waitForTimeout(300);
  await openDetailById(page, personalId);
  await openDayPreview(page, personalId, DAY, WEEK);
  const after = await previewNames(page);
  eq(after, EXPECTED, '6 day-preview shows exactly the edited list (no reload)');
  for (const banned of ['Weighted Sit-Up', 'Squat + hinge foundation. Back Squat', 'Squat + hinge foundation']) {
    if (after.includes(banned)) fail(`6 preview still contains banned entry "${banned}"`);
  }

  // The replacement inherits the legacy 3×15 prescription label.
  const specs = await page.$$eval('#wpmSheet .wpm-exercise-item', els => els.map(e => ({
    name: e.querySelector('span:first-child')?.textContent.trim(),
    spec: e.querySelector('span:last-child')?.textContent.trim(),
  })));
  const calf = specs.find(s => s.name === 'Seated Calf Raise');
  if (!calf || !/3\s*×\s*15/.test(calf.spec || '')) fail(`7 Seated Calf Raise should show 3 × 15, got ${JSON.stringify(calf)}`);
  else console.log(`  ok · 7 Seated Calf Raise prescription = ${calf.spec}`);
  await closePreview(page);

  // The workout cockpit for Lower Strength agrees.
  await page.click('.nav-item[data-target="workout"]');
  await page.waitForSelector('#view-workout', { timeout: 6000 });
  await page.click(`#cockpitDaySelectorBar .day-pill[data-day="${DAY}"]`);
  await page.waitForTimeout(300);
  eq(await cockpitNames(page), EXPECTED, '8 cockpit shows the edited Lower Strength');

  // Reload → the correction persists on both surfaces.
  await page.reload({ waitUntil: 'networkidle' });
  await openDetailById(page, personalId);
  await openDayPreview(page, personalId, DAY, WEEK);
  eq(await previewNames(page), EXPECTED, '9 preview correct after reload');
  await closePreview(page);
  await page.click('.nav-item[data-target="workout"]');
  await page.waitForSelector('#view-workout', { timeout: 6000 });
  await page.click(`#cockpitDaySelectorBar .day-pill[data-day="${DAY}"]`);
  await page.waitForTimeout(300);
  eq(await cockpitNames(page), EXPECTED, '9 cockpit correct after reload');

  // The SOURCE CATALOG entry is byte-for-byte unchanged (still has Weighted Sit-Up).
  const catalogLower = await page.evaluate(async (d) => {
    const mod = await import('/js/programs/catalog.js');
    return mod.getCatalogEntry('home_gym_rebuild_5day').days[d].lifts;
  }, DAY);
  eq(catalogLower, ['Back Squat', 'Romanian Deadlift', 'Dumbbell Bulgarian Split Squat', 'Dumbbell Calf Raise', 'Weighted Sit-Up'], '10 source catalog unchanged');

  // Re-open the editor → same personal program, no duplicate.
  await openDetailById(page, personalId);
  await page.click(`#programDetailScreen [data-action="open-builder"][data-program-id="${personalId}"]`);
  await page.waitForTimeout(400);
  const reedit = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
    return { active: s.activeProgramId, count: s.customPrograms.length };
  });
  eq(reedit.active, personalId, '11 re-edit keeps the same personal id');
  eq(reedit.count, 1, '11 no duplicate personal program');

  if (errors.length) fail(`browser errors: ${errors.join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) { console.error(`\n${failures.length} failure(s).`); process.exit(1); }
console.log('\nProgram preview consistency (home_gym_rebuild_5day) contract passed.');
