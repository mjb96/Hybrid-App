// =============================================================================
// COPY PROGRAM AS TEXT — real-UI clipboard regression (mobile viewport).
//
// Proves that tapping "📋 Copy for AI review" places the EDITED PERSONAL program
// text on the clipboard (not the pre-edit built-in), with the full structure,
// and that copying mutates nothing. The Async Clipboard API is mocked to record
// what is written; a second pass removes it entirely to prove the fallback modal.
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
const WEEK = '3';

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };
const ok = (cond, label) => { if (!cond) fail(label); else console.log(`  ok · ${label}`); };

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

// Records every navigator.clipboard.writeText into window.__clip.
const CLIP_MOCK = `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { (window.__clip = window.__clip || []).push(String(t)); return Promise.resolve(); } } });`;
// Removes the async API and forces the legacy path to fail → fallback modal.
const CLIP_BROKEN = `try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); } catch (e) {} document.execCommand = () => false;`;

async function newPage(browser, clipScript) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark' });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [STORAGE_KEY, JSON.stringify(fixture())]);
  await ctx.addInitScript(clipScript);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/frame-ancestors|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { ctx, page, errors };
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
  await page.waitForSelector(`#programDetailScreen [data-action="copy-program-text"][data-program-id="${id}"]`, { timeout: 8000 });
  await page.waitForTimeout(150);
}

async function replaceOnDay(page, day, oldName, newName) {
  await page.click(`#builderViewContainer [data-action="b-select-day"][data-day="${day}"]`);
  await page.waitForTimeout(200);
  const rowNames = await page.$$eval('#builderViewContainer .program-editor__exercise-name strong', els => els.map(e => e.textContent.trim()));
  const idx = rowNames.indexOf(oldName);
  if (idx < 0) { fail(`editor row ${oldName} not found on ${day}: ${JSON.stringify(rowNames)}`); return; }
  await page.click(`#builderViewContainer .program-editor__exercise-name[data-i="${idx}"]`);
  await page.fill('#builderExerciseSearch', newName);
  await page.waitForTimeout(250);
  const exact = await page.$(`#builderExerciseResults [data-action="b-pick-exercise"][data-name="${newName}"]`);
  if (exact) await exact.click(); else await page.click('#builderExerciseResults [data-action="b-pick-custom"]');
  await page.waitForTimeout(250);
}

// Fork the active built-in and apply the reported edits. Returns the personal id.
async function forkAndEdit(page) {
  await openDetailById(page, PROGRAM_ID);
  await page.click('#programDetailScreen [data-action="edit-active-program"]');
  await page.waitForSelector('#builderViewContainer .program-editor__exercise-name', { timeout: 8000 });
  await replaceOnDay(page, 'tue', 'Weighted Sit-Up', 'Seated Calf Raise');
  await replaceOnDay(page, 'mon', 'Dumbbell Curl', 'EZ-Bar Curl');
  await page.waitForTimeout(300);
  const personalId = await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).activeProgramId);
  await page.click('#builderViewContainer [data-action="close-builder"]');
  await page.waitForTimeout(300);
  return personalId;
}

function assertCopiedText(text, labelPrefix) {
  ok(typeof text === 'string' && text.length > 200, `${labelPrefix} clipboard received the full text (${text?.length || 0} chars)`);
  const titleCount = (text.match(/# 5-Day Home Gym Strength \+ Size Rebuild/g) || []).length;
  ok(titleCount === 1, `${labelPrefix} program title appears once (got ${titleCount})`);
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    ok(text.includes(`### ${day}`), `${labelPrefix} ${day} present`);
  }
  ok(/Week 1:/.test(text) && /Week 10:/.test(text), `${labelPrefix} progression weeks present`);
  ok(text.includes('EZ-Bar Curl'), `${labelPrefix} edited EZ-Bar Curl present`);
  ok(text.includes('Seated Calf Raise'), `${labelPrefix} edited Seated Calf Raise present`);
  const tue = text.slice(text.indexOf('### Tuesday'), text.indexOf('### Wednesday'));
  const mon = text.slice(text.indexOf('### Monday'), text.indexOf('### Tuesday'));
  ok(!/Weighted Sit-Up/.test(tue), `${labelPrefix} stale Weighted Sit-Up absent from Lower Strength`);
  ok(!/Dumbbell Curl/.test(mon), `${labelPrefix} replaced Dumbbell Curl absent from Upper Strength`);
  ok(!/prog_/.test(text), `${labelPrefix} no internal program id in text`);
  const equipLine = text.split('\n').find((l) => l.startsWith('Equipment:')) || '';
  ok(/EZ bar/.test(equipLine), `${labelPrefix} Equipment line discloses EZ bar after the edit (${equipLine})`);
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  // ---- Pass 1: clipboard API present (mocked) ----
  {
    const { ctx, page, errors } = await newPage(browser, CLIP_MOCK);
    const personalId = await forkAndEdit(page);

    // Navigate first, THEN snapshot — so the comparison isolates the copy action
    // itself (opening a detail legitimately records a "recently viewed" entry).
    await openDetailById(page, personalId);
    const stateBefore = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return { active: s.activeProgramId, count: s.customPrograms.length, week: s.currentWeek, blob: localStorage.getItem('hybrid_engine_v2_state') };
    });

    await page.click(`#programDetailScreen [data-action="copy-program-text"][data-program-id="${personalId}"]`);
    await page.waitForTimeout(300);

    const clip1 = await page.evaluate(() => (window.__clip || [])[window.__clip.length - 1]);
    assertCopiedText(clip1, 'P1');
    const toast1 = await page.evaluate(() => document.getElementById('sysToast')?.textContent || '');
    ok(/paste it into ChatGPT/.test(toast1), `P1 success toast shown ("${toast1}")`);

    const stateAfter = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('hybrid_engine_v2_state'));
      return { active: s.activeProgramId, count: s.customPrograms.length, week: s.currentWeek, blob: localStorage.getItem('hybrid_engine_v2_state') };
    });
    ok(stateAfter.count === 1 && stateBefore.count === 1, 'P1 no duplicate program created by copying');
    ok(stateAfter.active === stateBefore.active && stateAfter.week === stateBefore.week, 'P1 active id and week unchanged');
    ok(stateAfter.blob === stateBefore.blob, 'P1 app state byte-for-byte unchanged by copying');

    // Reload and repeat — same edited text, still one program.
    await page.reload({ waitUntil: 'networkidle' });
    await openDetailById(page, personalId);
    await page.click(`#programDetailScreen [data-action="copy-program-text"][data-program-id="${personalId}"]`);
    await page.waitForTimeout(300);
    const clip2 = await page.evaluate(() => (window.__clip || [])[window.__clip.length - 1]);
    assertCopiedText(clip2, 'P1-reload');
    const count2 = await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).customPrograms.length);
    ok(count2 === 1, 'P1-reload still exactly one personal program');

    if (errors.length) fail(`P1 browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }

  // ---- Pass 2: clipboard unavailable → fallback preview modal ----
  {
    const { ctx, page, errors } = await newPage(browser, CLIP_BROKEN);
    const personalId = await forkAndEdit(page);
    await openDetailById(page, personalId);
    await page.click(`#programDetailScreen [data-action="copy-program-text"][data-program-id="${personalId}"]`);
    await page.waitForSelector('#programTextModal.active', { timeout: 6000 });
    const modalText = await page.$eval('#programTextModalArea', el => el.value);
    assertCopiedText(modalText, 'P2-fallback');
    const toast2 = await page.evaluate(() => document.getElementById('sysToast')?.textContent || '');
    ok(/select and copy/i.test(toast2), `P2 fallback failure message shown ("${toast2}")`);
    // The modal closes cleanly.
    await page.click('#programTextModal [data-action="close-program-text"]');
    await page.waitForTimeout(200);
    const gone = await page.evaluate(() => !document.querySelector('#programTextModal.active'));
    ok(gone, 'P2 fallback modal closes');

    if (errors.length) fail(`P2 browser errors: ${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) { console.error(`\n${failures.length} failure(s).`); process.exit(1); }
console.log('\nCopy-program clipboard contract passed.');
