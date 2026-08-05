// Real-browser regression for new-program progression isolation and the compact
// read-only Last performed disclosure.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = await resolveChromium();
if (!runtime) process.exit(0);
const { chromium, executablePath } = runtime;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '') || 'index.html';
    const bytes = await readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const restDay = { title: 'Rest', desc: '', runs: 'Rest', lifts: [] };
const days = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { ...restDay }])
);
days.mon = {
  title: 'Program B Upper',
  desc: 'Bench Press (3×8)',
  runs: 'Rest',
  lifts: ['Bench Press'],
};
const program = {
  id: 'program_b',
  name: 'Program B',
  totalWeeks: 4,
  days,
  weeklyVolModifiers: Object.fromEntries(
    ['1', '2', '3', '4'].map((week) => [week, { sets: 3, reps: 8, intensityLabel: 'Build' }])
  ),
};
const oldSets = [
  { w: '100', r: '5', c: true, tr: 5 },
  { w: '100', r: '5', c: true, tr: 5 },
  { w: '100', r: '4', c: true, tr: 5 },
];
const seedForTheme = (theme) => ({
  schemaVersion: 5,
  currentWeek: '1',
  activeProgramId: program.id,
  activeActivationId: 'activation_b',
  customPrograms: [program],
  customExercises: [],
  exerciseStats: {},
  settings: {
    name: 'Athlete',
    onboardingComplete: true,
    theme,
    weightUnit: 'kg',
    bandWeights: { L: 10, M: 20, H: 30 },
  },
  bodyWeightLog: [],
  weeks: {
    '1': {
      activationId: 'activation_b',
      programId: program.id,
      dates: {},
      lifts: {
        mon: {
          'Bench Press': [
            { w: '', r: '', c: false },
            { w: '', r: '', c: false },
            { w: '', r: '', c: false },
          ],
        },
      },
      liftOrder: { mon: ['Bench Press'] },
      runs: {}, notes: {}, gymRpe: {}, gymStats: {}, bodyWeight: {},
    },
    'arch:activation_a:1': {
      activationId: 'activation_a',
      programId: 'program_a',
      sessionTitle: 'Program A Heavy Day',
      dates: { mon: '2026-08-01' },
      lifts: { mon: { 'Barbell Bench Press': oldSets } },
      runs: {}, notes: {}, gymRpe: {}, gymStats: {}, bodyWeight: {},
    },
  },
});

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });

try {
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 390, 1024]) {
      const context = await browser.newContext({
        viewport: { width, height: 780 },
        deviceScaleFactor: width < 500 ? 2 : 1,
      });
      await context.addInitScript((seed) => {
        localStorage.setItem('hybrid_engine_v2_state', JSON.stringify(seed));
      }, seedForTheme(theme));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(BASE, { waitUntil: 'load' });
      await page.addStyleTag({
        content: '*,*::before,*::after{transition:none!important;animation:none!important;}',
      });
      await page.click('.nav-item[data-target="workout"]');
      // Train now opens on its landing; this check drives the cockpit's history
      // affordances, so step into the cockpit first.
      await page.waitForSelector('#trainLanding [data-action="qs-workout"]');
      await page.click('#trainLanding [data-action="qs-workout"]');
      await page.waitForSelector('#trainCockpit:not([hidden])');
      await page.click('#cockpitDaySelectorBar .day-pill[data-day="mon"]');
      const card = page.locator('.cockpit-exercise[data-liftname="Bench Press"]');
      await card.waitFor();

      const collapsed = await card.evaluate((element) => {
        const panel = element.querySelector('.previous-session');
        const summary = panel?.querySelector('summary');
        const inputs = [...element.querySelectorAll('.cockpit-set-row input[type="number"]')];
        const rect = panel?.getBoundingClientRect();
        const summaryStyle = summary ? getComputedStyle(summary) : null;
        return {
          text: panel?.textContent || '',
          open: !!panel?.open,
          values: inputs.map((input) => input.value),
          placeholders: inputs.map((input) => input.placeholder),
          hasSuggestion: !!element.querySelector('.cockpit-coach-target'),
          historyInputs: panel?.querySelectorAll('input').length || 0,
          summaryHeight: summary?.getBoundingClientRect().height || 0,
          panelRight: rect?.right || 0,
          viewport: document.documentElement.clientWidth,
          summaryColor: summaryStyle?.color || '',
          summaryBackground: summaryStyle?.backgroundColor || '',
          documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });

      check(/Last performed/i.test(collapsed.text), `${theme} ${width}px: missing Last performed label`);
      check(/100kg × 5/i.test(collapsed.text), `${theme} ${width}px: prior performance summary is inaccurate`);
      check(collapsed.open === false, `${theme} ${width}px: history should start collapsed`);
      check(collapsed.values.every((value) => value === ''), `${theme} ${width}px: new-program inputs are not blank`);
      check(!collapsed.placeholders.includes('100'), `${theme} ${width}px: old load leaked into an input placeholder`);
      check(!collapsed.hasSuggestion, `${theme} ${width}px: old activation produced a current suggestion`);
      check(collapsed.historyInputs === 0, `${theme} ${width}px: history panel contains editable inputs`);
      check(collapsed.summaryHeight >= 43, `${theme} ${width}px: history summary is below touch-target size`);
      check(collapsed.panelRight <= collapsed.viewport + 0.5, `${theme} ${width}px: history panel clips horizontally`);
      check(!collapsed.documentOverflow, `${theme} ${width}px: logger causes document overflow`);
      check(collapsed.summaryColor !== collapsed.summaryBackground, `${theme} ${width}px: summary text lacks contrast`);

      await card.locator('.previous-session summary').click();
      const expanded = await card.evaluate((element) => {
        const panel = element.querySelector('.previous-session');
        return {
          open: !!panel?.open,
          rows: panel?.querySelectorAll('.previous-session__set').length || 0,
          buttons: [...(panel?.querySelectorAll('button') || [])].map((button) => button.textContent.trim()),
          right: panel?.getBoundingClientRect().right || 0,
          viewport: document.documentElement.clientWidth,
        };
      });
      check(expanded.open, `${theme} ${width}px: history did not expand`);
      check(expanded.rows === 3, `${theme} ${width}px: expected three prior set rows`);
      check(expanded.buttons.includes('Use previous values'), `${theme} ${width}px: explicit copy action missing`);
      check(expanded.buttons.includes('View workout'), `${theme} ${width}px: previous workout action missing`);
      check(expanded.right <= expanded.viewport + 0.5, `${theme} ${width}px: expanded history clips horizontally`);

      await card.locator('[data-action="use-previous-values"]').click();
      const copied = await card.evaluate((element) => ({
        weights: [...element.querySelectorAll('.input-weight-node')].map((input) => input.value),
        reps: [...element.querySelectorAll('.input-reps-node')].map((input) => input.value),
        completed: [...element.querySelectorAll('.gym-check')].map((input) => input.checked),
      }));
      check(copied.weights.join(',') === '100,100,100', `${theme} ${width}px: explicit copy did not copy weights`);
      check(copied.reps.join(',') === '5,5,4', `${theme} ${width}px: explicit copy did not copy reps`);
      check(copied.completed.every((value) => value === false), `${theme} ${width}px: explicit copy completed sets`);
      check(errors.length === 0, `${theme} ${width}px: browser errors: ${errors.join(' | ')}`);

      console.log(`  ${theme} ${width}px · blank=${collapsed.values.every((value) => value === '')} · rows=${expanded.rows} · overflow=${collapsed.documentOverflow}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error('\nWorkout history browser check failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log('Workout history browser check passed.');
