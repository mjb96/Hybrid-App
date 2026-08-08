// =============================================================================
// EXERCISE PICKER — mobile keyboard-safety layout contract (390 × 844).
//
// Playwright cannot open a real on-screen keyboard, so the contract is proven in
// two honest halves:
//   • the viewport-height helper is unit-tested (tests/visible_viewport.test.js)
//     — it reads window.visualViewport.height and publishes it as the CSS var;
//   • THIS check drives the real picker and, to represent an open keyboard,
//     shrinks the SAME CSS custom property the helper controls, then asserts the
//     rendered geometry: the picker is top-anchored, the search field is visible,
//     results begin below it, the results list ends ABOVE the simulated keyboard
//     boundary, a result is clickable in one tap without dismissing anything, and
//     the underlying editor keeps its scroll position. It also proves that both
//     program-building and workout pickers can filter the reviewed EZ-bar
//     catalogue and open its technique/safety details.
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
const VIEWPORT = { width: 390, height: 844 };
const KEYBOARD_TOP = 480; // simulated visible height with the keyboard open

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };
const ok = (cond, label) => { if (!cond) fail(label); else console.log(`  ok · ${label}`); };

const restDay = () => ({ title: 'Rest', badge: 'Rest', color: 'var(--text-muted)', desc: '', runs: 'Rest', lifts: [] });

// A personal program with a long exercise list so the editor page scrolls and a
// "lower" exercise row exists to open Replace on.
function fixture() {
  const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => [d, restDay()]));
  days.mon = {
    title: 'Full Body', badge: 'Gym', color: '#3b82f6', desc: '', runs: 'Rest',
    lifts: ['Back Squat', 'Bench Press', 'Barbell Row', 'Standing OHP', 'Romanian Deadlift',
      'Pull-Ups', 'Barbell Curl', 'Skull Crusher', 'Lateral Raise', 'Calf Raises', 'Plank'],
  };
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'prog_pick', activeActivationId: 'act1',
    settings: { name: 'T', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    customPrograms: [{
      id: 'prog_pick', name: 'Picker Test', totalWeeks: 4, isPrimaryCustomization: true, sourceProgramId: 'stronglifts_5x5',
      dossier: { creator: 'You', focus: 'Strength' }, days,
      weeklyVolModifiers: { '1': { sets: 3, reps: 5, intensityLabel: '' } },
    }],
    weeks: { '1': { activationId: 'act1', dates: {}, sessionStatus: {}, lifts: {}, liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, gymStats: {}, liftMeta: {} } },
    programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  };
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: VIEWPORT, timezoneId: TZ, colorScheme: 'dark' });
  await ctx.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [STORAGE_KEY, JSON.stringify(fixture())]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/frame-ancestors|net::ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Open the builder for the active personal program.
  await page.click('.nav-item[data-target="program"]');
  // Wait for the card, don't guess at a delay: a fixed 300ms raced the Plans
  // render on a slow machine and failed this check once with a timeout that
  // looked exactly like a regression.
  await page.waitForSelector('[data-action="open-program-detail"][data-program-id="prog_pick"]', { timeout: 8000 });
  await page.click('[data-action="open-program-detail"][data-program-id="prog_pick"]');
  await page.waitForSelector('#programDetailScreen .detail-cta-secondary [data-program-id="prog_pick"]', { timeout: 8000 });
  await page.click('#programDetailScreen [data-action="open-builder"][data-program-id="prog_pick"]');
  await page.waitForSelector('#builderViewContainer .program-editor__exercise-name', { timeout: 8000 });

  // Scroll the editor down toward a lower exercise row, then remember the position.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
  const rows = await page.$$('#builderViewContainer .program-editor__exercise-name');
  const editorScrollBefore = await page.evaluate(() => window.scrollY);
  ok(editorScrollBefore > 0, `editor scrolled down before opening picker (scrollY=${editorScrollBefore})`);

  // Open Replace on the LAST (lowest) exercise row.
  await rows[rows.length - 1].click();
  await page.waitForSelector('#builderExercisePicker.active', { timeout: 6000 });
  await page.waitForTimeout(150);

  // Equipment filtering exposes the complete, distinct EZ-bar catalogue.
  await page.selectOption('#builderExerciseEquipment', 'ezBar');
  await page.waitForTimeout(120);
  const builderEzNames = await page.$$eval(
    '#builderExerciseResults [data-action="b-pick-exercise"]',
    (buttons) => buttons.map((button) => button.getAttribute('data-name')),
  );
  ok(builderEzNames.length === 16, `program picker lists all 16 EZ-bar exercises (${builderEzNames.length})`);
  ok(builderEzNames.every((name) => name?.startsWith('EZ-Bar')), 'program picker EZ filter excludes straight-bar variations');
  ok(builderEzNames.includes('EZ-Bar Romanian Deadlift') && builderEzNames.includes('EZ-Bar Floor Press'), 'program picker spans legs and chest');

  // Details open above the picker and expose every new editorial field.
  await page.click('#builderExerciseResults [data-action="b-exercise-info"][data-name="EZ-Bar Romanian Deadlift"]');
  await page.waitForSelector('#exerciseDetailModal.active', { timeout: 3000 });
  const detailText = await page.textContent('#exerciseDetailBody');
  ok(/Intermediate/.test(detailText) && /Hamstrings/.test(detailText) && /How to perform it/.test(detailText) && /Safety/.test(detailText), 'exercise detail shows difficulty, muscles, instructions, and safety');
  const nestedSemantics = await page.evaluate(() => ({
    parentHidden: document.getElementById('builderExercisePicker')?.getAttribute('aria-hidden'),
    parentInert: document.getElementById('builderExercisePicker')?.hasAttribute('inert'),
    detailModal: document.getElementById('exerciseDetailModal')?.getAttribute('aria-modal'),
  }));
  ok(nestedSemantics.parentHidden === 'true' && nestedSemantics.parentInert && nestedSemantics.detailModal === 'true', 'only the topmost detail dialog is exposed to assistive technology');
  await page.click('#exerciseDetailModal [data-action="close-exercise-detail"]');
  await page.waitForTimeout(100);
  ok(await page.isVisible('#builderExercisePicker.active'), 'closing exercise details returns to the program picker');
  ok(await page.getAttribute('#builderExercisePicker', 'aria-modal') === 'true', 'program picker regains modal semantics after details close');
  await page.selectOption('#builderExerciseEquipment', '');
  await page.focus('#builderExerciseSearch');

  // The helper wired the CSS var on open (real visualViewport height).
  const varSet = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--visible-viewport-height').trim());
  ok(/\dpx$/.test(varSet), `--visible-viewport-height is published on open (${varSet || 'unset'})`);

  // Simulate the on-screen keyboard by shrinking the SAME CSS var the helper owns.
  await page.evaluate((kb) => document.documentElement.style.setProperty('--visible-viewport-height', `${kb}px`), KEYBOARD_TOP);
  await page.waitForTimeout(150);

  // The search input keeps DOM focus (no keyboard dismissal required).
  const searchFocused = await page.evaluate(() => document.activeElement?.id === 'builderExerciseSearch');
  ok(searchFocused, 'search input holds focus');

  // Type a query that resolves to the new barbell calf raise.
  await page.fill('#builderExerciseSearch', 'Barbell Standing Calf Raise');
  await page.waitForTimeout(250);

  const geo = await page.evaluate(() => {
    const picker = document.querySelector('#builderExercisePicker .program-editor__picker');
    const search = document.querySelector('#builderExerciseSearch');
    const results = document.getElementById('builderExerciseResults');
    const first = results?.querySelector('button');
    const r = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, height: b.height }; };
    return { picker: r(picker), search: r(search), results: r(results), first: first ? r(first) : null };
  });

  ok(geo.picker.top >= 0 && geo.picker.top <= 8, `picker is top-anchored within the viewport (top=${geo.picker.top.toFixed(1)})`);
  ok(geo.search.top >= 0 && geo.search.bottom <= KEYBOARD_TOP, `search field is fully visible above the keyboard (bottom=${geo.search.bottom.toFixed(1)})`);
  ok(geo.first && geo.first.top >= geo.search.bottom - 1, 'first result begins below the search field');
  ok(geo.results.bottom <= KEYBOARD_TOP + 1, `results list ends above the keyboard boundary (${geo.results.bottom.toFixed(1)} ≤ ${KEYBOARD_TOP})`);

  // The first result is a real, one-tap-selectable button that closes the picker.
  const firstName = await page.$eval('#builderExerciseResults button[data-action="b-pick-exercise"]', el => el.getAttribute('data-name'));
  ok(firstName === 'Barbell Standing Calf Raise', `first result is the searched exercise (${firstName})`);
  await page.click('#builderExerciseResults button[data-action="b-pick-exercise"]');
  await page.waitForTimeout(250);
  const pickerGone = await page.evaluate(() => !document.querySelector('#builderExercisePicker.active'));
  ok(pickerGone, 'selecting a result closes the picker in one tap');

  // The exercise was applied, and the editor kept its scroll position.
  const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).customPrograms[0].days.mon.lifts.at(-1));
  ok(applied === 'Barbell Standing Calf Raise', `replacement applied (${applied})`);
  const editorScrollAfter = await page.evaluate(() => window.scrollY);
  ok(Math.abs(editorScrollAfter - editorScrollBefore) <= 2, `editor scroll position retained (${editorScrollBefore} → ${editorScrollAfter})`);

  // The CSS var is cleared after the picker closes (no stale height lingers).
  const varAfter = await page.evaluate(() => document.documentElement.style.getPropertyValue('--visible-viewport-height'));
  ok(varAfter === '', 'visible-viewport CSS var cleared on close');

  // The workout add-exercise flow shares the same filters/details and remains
  // usable at the target mobile viewport.
  await page.click('#builderViewContainer [data-action="close-builder"]');
  await page.click('.nav-item[data-target="workout"]');
  await page.waitForTimeout(250);
  // Train opens on its landing; step into the cockpit for cockpit assertions.
  await page.click('#trainLanding [data-action="qs-workout"]');
  await page.waitForSelector('#trainCockpit:not([hidden])');
  await page.click('#view-workout [data-action="open-add-exercise"]');
  await page.waitForSelector('#addExerciseModal.active', { timeout: 3000 });
  await page.selectOption('#elEquipmentFilter', 'ezBar');
  await page.waitForTimeout(100);
  const workoutEzNames = await page.$$eval(
    '#elList [data-action="el-pick"]',
    (buttons) => buttons.map((button) => button.getAttribute('data-exname')),
  );
  ok(workoutEzNames.length === 16, `workout picker lists all 16 EZ-bar exercises (${workoutEzNames.length})`);
  ok(workoutEzNames.every((name) => name?.startsWith('EZ-Bar')), 'workout picker EZ filter excludes other equipment');
  await page.fill('#elSearchInput', 'zercher');
  await page.waitForTimeout(100);
  ok(await page.getAttribute('#elList [data-action="el-pick"]', 'data-exname') === 'EZ-Bar Zercher Squat', 'workout search and equipment filter compose');
  await page.click('#elList [data-action="el-info"][data-exname="EZ-Bar Zercher Squat"]');
  await page.waitForSelector('#exerciseDetailModal.active', { timeout: 3000 });
  ok(/Quads/.test(await page.textContent('#exerciseDetailBody')), 'workout picker opens the same reviewed exercise detail');
  await page.click('#exerciseDetailModal [data-action="close-exercise-detail"]');
  await page.waitForTimeout(100);
  ok(await page.isVisible('#addExerciseModal.active'), 'closing details returns to the workout picker');

  // ── Phase 4D: primary-muscle browsing, in training words ─────────────────
  // The control beside this one was LABELLED "muscle group" while filtering
  // push/pull/legs/core/conditioning — movements, not muscles. There is now a
  // real muscle filter, and it narrows on PRIMARY involvement only.
  await page.fill('#elSearchInput', '');
  await page.selectOption('#elEquipmentFilter', '');
  await page.selectOption('#elMuscleFilter', 'chest');
  await page.waitForTimeout(150);
  const chestNames = await page.$$eval(
    '#elList [data-action="el-pick"]',
    (buttons) => buttons.map((b) => b.getAttribute('data-exname')),
  );
  ok(chestNames.length > 0, 'muscle filter returns chest exercises');
  ok(chestNames.some((n) => /Bench Press/i.test(n || '')), `chest list should include a bench press (${chestNames.slice(0, 4).join(', ')})`);
  ok(!chestNames.some((n) => /Back Squat|Deadlift/i.test(n || '')), 'a chest filter must not return squats or deadlifts');

  // Muscle and equipment compose, and the labels say what they do.
  await page.selectOption('#elEquipmentFilter', 'barbell');
  await page.waitForTimeout(150);
  const barbellChest = await page.$$eval(
    '#elList [data-action="el-pick"]',
    (buttons) => buttons.map((b) => b.getAttribute('data-exname')),
  );
  ok(barbellChest.length > 0 && barbellChest.length <= chestNames.length, 'muscle + equipment compose to a narrower list');
  const labels = await page.evaluate(() => ({
    muscle: document.querySelector('#elMuscleFilter option')?.textContent?.trim(),
    movement: document.querySelector('#elCategoryFilter option')?.textContent?.trim(),
    muscleOptions: document.querySelectorAll('#elMuscleFilter option').length,
  }));
  ok(labels.muscle === 'All muscles', `muscle filter default reads "${labels.muscle}"`);
  ok(labels.movement === 'All movements', `movement filter must stop claiming to be muscles, reads "${labels.movement}"`);
  ok(labels.muscleOptions === 7, `expected six groups plus "all", got ${labels.muscleOptions}`);

  // Three selects in one row must still fit the narrowest phone.
  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 780 });
    await page.waitForTimeout(150);
    const layout = await page.evaluate(() => {
      const row = document.querySelector('.el-filter-row');
      const selects = [...(row?.querySelectorAll('select') || [])];
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rowOverflow: !!row && row.scrollWidth > row.clientWidth + 1,
        small: selects.filter((s) => s.getBoundingClientRect().height < 43).length,
        count: selects.length,
      };
    });
    ok(layout.count === 3, `${width}px: expected three filters, got ${layout.count}`);
    ok(!layout.overflow, `${width}px: filter row causes horizontal overflow`);
    ok(layout.small === 0, `${width}px: ${layout.small} filter(s) below the 44px target`);
  }
  await page.setViewportSize({ width: 390, height: 780 });

  if (errors.length) fail(`browser errors: ${errors.join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) { console.error(`\n${failures.length} failure(s).`); process.exit(1); }
console.log('\nExercise picker mobile keyboard-safety contract passed.');
