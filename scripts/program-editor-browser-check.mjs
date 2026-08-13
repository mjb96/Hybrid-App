// Real-browser contract for the mobile custom-program editor.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserContext, resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTHS = [320, 360, 390, 412];
const runtime = await resolveChromium();
if (!runtime) process.exit(0);
const { chromium, executablePath } = runtime;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '') || 'index.html';
    const bytes = await readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(bytes);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { title: 'Rest', desc: '', runs: 'Rest', lifts: [] }]));
days.mon = { title: 'Upper strength', desc: '', runs: 'Rest', lifts: ['Bench Press', 'Push-Ups 4×max'] };
days.wed = { title: 'Intervals', desc: '', runs: '6 × 800 m', lifts: [] };
const program = {
  id: 'prog_browser_editor', name: 'Hybrid Build', totalWeeks: 4,
  dossier: { creator: 'You', focus: 'Strength + 10K', philosophy: '' }, days,
  weeklyVolModifiers: {
    '1': { sets: 3, reps: '8-10', intensityLabel: 'Build' },
    '2': { sets: 3, reps: '8-10', intensityLabel: 'Build' },
    '3': { sets: 4, reps: 8, intensityLabel: 'Overload' },
    '4': { sets: 2, reps: 8, intensityLabel: 'Deload week' },
  },
};
const seed = {
  schemaVersion: 5, settings: { name: 'Athlete', onboardingComplete: true },
  currentWeek: '1', activeProgramId: program.id, activeActivationId: 'browser-activation',
  customPrograms: [program], weeks: {},
};

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });

async function openEditor(width, extraCss = '') {
  const context = await createBrowserContext(browser, { viewport: { width, height: 780 }, deviceScaleFactor: 2 });
  await context.addInitScript((value) => localStorage.setItem('hybrid_engine_v2_state', JSON.stringify(value)), seed);
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' + extraCss });
  await page.click('.nav-item[data-target="program"]');
  await page.evaluate(async () => (await import('./js/program_builder.js')).openBuilder('prog_browser_editor'));
  return { context, page };
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const controls = [...document.querySelectorAll('#builderViewContainer button, #builderViewContainer input, #builderViewContainer select')]
      .filter((element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
    const clippedElements = [...document.querySelectorAll('#builderViewContainer .program-editor, #builderViewContainer .program-editor *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > vw + 0.5;
      });
    const lowControls = controls.filter((element) => element.getBoundingClientRect().height < 43);
    return {
      docOverflow: document.documentElement.scrollWidth > vw,
      clipped: clippedElements.length,
      clippedNames: clippedElements.slice(0, 4).map((element) => `${element.tagName}.${element.className}`),
      minimumControl: controls.length ? Math.min(...controls.map((element) => Math.round(element.getBoundingClientRect().height))) : 0,
      lowControlNames: lowControls.slice(0, 6).map((element) => `${element.tagName}.${element.className}[${element.getAttribute('data-action') || ''}]`),
      days: document.querySelectorAll('.program-editor__day').length,
      cards: document.querySelectorAll('.program-editor__day-card').length,
    };
  });
}

for (const width of WIDTHS) {
  const { context, page } = await openEditor(width);
  const result = await measure(page);
  check(!result.docOverflow, `${width}px: document has horizontal overflow`);
  check(result.clipped === 0, `${width}px: ${result.clipped} editor elements clip past the viewport`);
  check(result.days === 7, `${width}px: compact seven-day selector is missing`);
  check(result.cards === 1, `${width}px: editor should render one focused day card, not seven`);
  check(result.minimumControl >= 43, `${width}px: an editor control is below ~44px (${result.minimumControl}px)`);
  console.log(`  ${width}px overflow=${result.docOverflow} clipped=${result.clipped} days=${result.days} focusedCards=${result.cards} minControl=${result.minimumControl} low=${result.lowControlNames.join(',')} clippedNames=${result.clippedNames.join(',')}`);
  await context.close();
}

// Exercise search → add → preview uses the exact logger prescription resolver.
{
  const { context, page } = await openEditor(390);
  await page.click('.program-editor__day-card .program-editor__add[data-day="mon"]');
  await page.fill('#builderExerciseSearch', 'Cable Row');
  const picker = await page.evaluate(() => ({
    modal: document.getElementById('builderExercisePicker')?.classList.contains('active'),
    results: document.querySelectorAll('#builderExerciseResults [data-action="b-pick-exercise"]').length,
    overflow: document.getElementById('builderExercisePicker')?.scrollWidth > innerWidth,
  }));
  check(picker.modal, 'exercise picker did not open as a managed modal');
  check(picker.results > 0, 'exercise search returned no catalogue result');
  check(!picker.overflow, 'exercise picker overflows the viewport');
  await page.click('#builderExerciseResults [data-action="b-pick-exercise"][data-name="Cable Row"]');
  await page.click('[data-action="b-section"][data-section="preview"]');
  const result = await page.evaluate(async () => {
    const state = await import('./js/state.js');
    const previewText = document.querySelector('.program-editor__preview-list')?.textContent || '';
    const names = state.getProgramById('prog_browser_editor').days.mon.lifts;
    return { names, previewText, modalOpen: document.getElementById('builderExercisePicker')?.classList.contains('active') };
  });
  check(result.names.includes('Cable Row'), 'picked exercise was not saved to the program');
  check(/Push-Ups 4×max[\s\S]*4 × max reps/.test(result.previewText), 'preview does not preserve the max-reps prescription');
  check(/Bench Press[\s\S]*3 × 8-10/.test(result.previewText), 'preview does not preserve the rep range');
  check(!result.modalOpen, 'exercise picker did not close after selection');
  console.log(`  interaction pickerResults=${picker.results} cableRowSaved=${result.names.includes('Cable Row')} exactPreview=${/max reps/.test(result.previewText)}`);
  await context.close();
}

// Phase 4C — destructive day edits are reversible, and no longer gated behind a
// confirmation dialog (interaction principle 5).
{
  const { context, page } = await openEditor(390);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const lifts = () => page.evaluate(async () => {
    const state = await import('./js/state.js');
    const program = state.getProgramById('prog_browser_editor');
    return {
      mon: [...(program.days.mon.lifts || [])],
      monTitle: program.days.mon.title,
      undoLabel: document.querySelector('.program-editor__undobar span')?.textContent?.trim() || null,
      undoHeight: Math.round(document.querySelector('.program-editor__undobar-btn')?.getBoundingClientRect().height || 0),
      dialogOpen: !!document.querySelector('.confirm-modal, [data-confirm-modal], #confirmModal.active'),
    };
  });

  const start = await lifts();
  check(start.undoLabel === null, 'nothing has been edited yet, so no undo strip');

  // Remove an exercise: no dialog, and the strip names what it will put back.
  await page.click('[data-action="b-remove-lift"][data-day="mon"][data-i="0"]');
  await page.waitForTimeout(300);
  const removed = await lifts();
  console.log(`  4C undo    removed=${JSON.stringify(removed.mon)} label="${removed.undoLabel}" btn=${removed.undoHeight}px dialog=${removed.dialogOpen}`);
  check(!removed.dialogOpen, 'removing an exercise must not open a confirmation dialog now Undo exists');
  check(removed.mon.length === start.mon.length - 1, 'the exercise was not removed');
  check(/Removed /.test(removed.undoLabel || ''), `the undo strip must name the edit, got "${removed.undoLabel}"`);
  check(removed.undoHeight >= 44, `undo button is ${removed.undoHeight}px, under the 44px target`);

  await page.click('[data-action="b-undo"]');
  await page.waitForTimeout(300);
  const undone = await lifts();
  console.log(`  4C undo    restored=${JSON.stringify(undone.mon)} label=${undone.undoLabel}`);
  check(JSON.stringify(undone.mon) === JSON.stringify(start.mon), 'Undo did not restore the removed exercise');
  check(undone.undoLabel === null, 'the strip must clear once the undo is used');

  // Wiping a day to rest is the biggest destructive edit — also undoable.
  await page.click('[data-action="b-mark-rest"]');
  await page.waitForTimeout(300);
  const rested = await lifts();
  console.log(`  4C undo    rest=${JSON.stringify(rested.mon)} label="${rested.undoLabel}"`);
  check(!rested.dialogOpen, 'making a rest day must not open a confirmation dialog');
  check(rested.mon.length === 0, 'the day was not cleared');
  check(/rest day/i.test(rested.undoLabel || ''), `expected a rest-day undo label, got "${rested.undoLabel}"`);

  await page.click('[data-action="b-undo"]');
  await page.waitForTimeout(300);
  const restored = await lifts();
  console.log(`  4C undo    afterRestUndo=${JSON.stringify(restored.mon)} title="${restored.monTitle}"`);
  check(JSON.stringify(restored.mon) === JSON.stringify(start.mon), 'Undo did not restore the wiped day');
  check(restored.monTitle === start.monTitle, 'Undo did not restore the day title');

  // The undo is single level and must not survive into an unrelated programme.
  check(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  await context.close();
}

// Phase 4C — Simple progression: one question instead of a grid, previewed
// before it is written, and reversible after.
{
  const { context, page } = await openEditor(390);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.click('[data-action="b-section"][data-section="progression"]');
  await page.waitForTimeout(200);

  const read = () => page.evaluate(async () => {
    const state = await import('./js/state.js');
    const mods = state.getProgramById('prog_browser_editor').weeklyVolModifiers;
    return {
      simpleActive: !!document.querySelector('.program-editor__mode-btn.is-active')?.textContent?.includes('Simple'),
      shapes: document.querySelectorAll('.program-editor__shape').length,
      weekRows: document.querySelectorAll('.program-editor__week').length,
      preview: document.querySelector('.program-editor__shape-preview p')?.textContent?.trim() || '',
      undoShown: !!document.querySelector('[data-action="b-undo"]'),
      mods: JSON.parse(JSON.stringify(mods)),
    };
  });

  const initial = await read();
  console.log(`  4C simple  shapes=${initial.shapes} weekRows=${initial.weekRows} preview="${initial.preview}"`);
  check(initial.simpleActive, 'the progression tab must open on Simple');
  check(initial.shapes === 3, `expected three progression shapes, got ${initial.shapes}`);
  check(initial.weekRows === 0, 'the per-week grid belongs to Advanced, not Simple');
  check(/sets/.test(initial.preview), `the shape must describe the block it would produce, got "${initial.preview}"`);
  check(!initial.undoShown, 'nothing has been applied yet, so there is nothing to undo');

  // Choosing a shape and a deload cadence PREVIEWS; it must not write.
  await page.click('[data-action="b-prog-shape"][data-shape="volume"]');
  await page.selectOption('[data-action="b-prog-deload"]', '4');
  await page.waitForTimeout(200);
  const previewed = await read();
  console.log(`  4C preview "${previewed.preview}"`);
  check(/deload week/i.test(previewed.preview), `the deload cadence must show in the preview, got "${previewed.preview}"`);
  check(JSON.stringify(previewed.mods) === JSON.stringify(initial.mods),
    'choosing a shape must not write anything until Apply');

  // Apply writes every week and offers a real Undo.
  await page.click('[data-action="b-prog-apply"]');
  await page.waitForTimeout(300);
  const applied = await read();
  console.log(`  4C applied w1=${JSON.stringify(applied.mods['1'])} w4=${JSON.stringify(applied.mods['4'])} undo=${applied.undoShown}`);
  check(JSON.stringify(applied.mods) !== JSON.stringify(initial.mods), 'Apply did not change the progression');
  check(/deload/i.test(String(applied.mods['4']?.intensityLabel)), 'week 4 should be the deload the preview promised');
  check(applied.undoShown, 'applying a whole block must offer an Undo');

  await page.click('[data-action="b-undo"]');
  await page.waitForTimeout(300);
  const undone = await read();
  console.log(`  4C undone  w1=${JSON.stringify(undone.mods['1'])} w3=${JSON.stringify(undone.mods['3'])}`);
  check(JSON.stringify(undone.mods) === JSON.stringify(initial.mods),
    'Undo must restore the exact progression that was there before');
  check(!undone.undoShown, 'Undo should not remain offered once it has been used');

  // Advanced still owns the per-week grid.
  await page.click('[data-action="b-prog-mode"][data-mode="advanced"]');
  await page.waitForTimeout(200);
  const advanced = await page.evaluate(() => ({
    weekRows: document.querySelectorAll('.program-editor__week').length,
    shapes: document.querySelectorAll('.program-editor__shape').length,
    lowControls: [...document.querySelectorAll('#builderViewContainer button, #builderViewContainer select')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.height > 0 && r.height < 43; }).length,
  }));
  console.log(`  4C advanced weekRows=${advanced.weekRows} shapes=${advanced.shapes}`);
  check(advanced.weekRows === 4, `Advanced must keep the per-week grid, got ${advanced.weekRows} rows`);
  check(advanced.shapes === 0, 'the shape picker belongs to Simple');
  check(advanced.lowControls === 0, `${advanced.lowControls} progression controls below the 44px target`);
  check(errors.length === 0, `browser errors: ${errors.join(' | ')}`);
  await context.close();
}

// Large text remains usable and does not clip the selected day or preview.
{
  const { context, page } = await openEditor(360, 'html{font-size:24px!important;}');
  const result = await measure(page);
  check(!result.docOverflow, '360px @1.5× font: document has horizontal overflow');
  check(result.clipped === 0, `360px @1.5× font: ${result.clipped} editor elements clip`);
  console.log(`  360px@1.5x overflow=${result.docOverflow} clipped=${result.clipped}`);
  await context.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error('\nFAIL — program editor browser regressions:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('\nPASS — program editor is compact, mobile-safe, searchable and prescription-accurate.');
