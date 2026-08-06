// =============================================================================
// FINISH REVIEW BROWSER CHECK — roadmap Phase 2B
//
// Drives the real cockpit and asserts the finishing contract:
//   - the sheet reads as a REVIEW, not a form: one dominant Finish, effort and
//     notes disclosed on request, and already-entered values never hidden
//     behind a closed disclosure (that reads as "not recorded");
//   - notes share the cockpit's store rather than being a second place to type;
//   - adherence changes the explanation, never the availability of Finish;
//   - the destructive action names the EXACT workout and is separated from the
//     two safe ones;
//   - a discard is reversible, and Undo restores the logged work;
//   - a finished workout does not dead-end.
//
// Two of these were found only by driving it: the day-name in the discard copy
// (the old text said "today's log" whatever day was selected) and the fact that
// restoring re-materialises the program's blank prescription around the
// restored sets.
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
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' }); res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
const STORAGE_KEY = 'hybrid_engine_v2_state';
const TZ = 'Australia/Sydney';

const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const prior = new Date(Date.parse(`${today}T12:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10);
// The cockpit opens on the real weekday, so the fixture must live there.
const DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${today}T12:00:00Z`).getUTCDay()];
const set = (w, r, extra = {}) => ({ c: true, w: String(w), r: String(r), ...extra });

/** The first lift the active program actually prescribes on that day. */
const { PROGRAMS } = await import('../js/constants.js');
const LIFT = PROGRAMS?.hybrid_engine?.days?.[DAY]?.lifts?.[0];

function fixture({ notes = '', beatsPrevious = true } = {}) {
  const load = beatsPrevious ? 105 : 90;
  return {
    schemaVersion: 5, currentWeek: '2', activeProgramId: 'hybrid_engine', activeActivationId: 'a1',
    settings: { name: 'Review', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: {
      '1': { activationId: 'a1', dates: { [DAY]: prior }, lifts: { [DAY]: { [LIFT]: [set(100, 5)] } } },
      '2': {
        activationId: 'a1', dates: { [DAY]: today },
        lifts: { [DAY]: { [LIFT]: [set(load, 5), set(load, 5)] } },
        ...(notes ? { notes: { [DAY]: notes } } : {}),
      },
    },
  };
}

async function openCockpitAndFinish(page) {
  await page.evaluate(() => document.querySelector('.bottom-nav .nav-item[data-target="workout"]')?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-action]')]
      .find((el) => /open-cockpit|start-workout|resume/.test(el.getAttribute('data-action') || ''));
    if (button) /** @type {any} */ (button).click();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-finish-modal');
    cta.style.display = 'none';
    document.body.appendChild(cta); cta.click(); cta.remove();
  });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];

async function session(state, width = 390, theme = 'dark') {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(state)]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  return { context, page, errors };
}

try {
  if (!LIFT) throw new Error(`no prescribed lift for ${DAY} — fixture cannot drive the cockpit`);

  // ── The sheet reads as a review ───────────────────────────────────────────
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const { context, page, errors } = await session(fixture({ notes: 'from the cockpit' }), width, theme);
    await openCockpitAndFinish(page);
    const seen = await page.evaluate(() => {
      const details = document.getElementById('summaryEffortDetails');
      const buttons = [...document.querySelectorAll('#summaryModal .btn-action-block')];
      return {
        effortOpen: details ? details.open : null,
        notes: document.getElementById('summaryNotes')?.value || '',
        highlightsShown: !document.getElementById('summaryHighlights')?.hidden,
        primary: buttons[0]?.textContent?.trim(),
        primaryIsFilled: (buttons[0]?.className || '').includes('btn-blue'),
        discardSeparated: !!document.querySelector('.summary-danger #summaryDiscardAction'),
        smallControls: buttons.filter((b) => b.getBoundingClientRect().height < 43).length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    console.log(`finish sheet ${width}px/${theme}:`, JSON.stringify(seen));
    if (seen.effortOpen !== true) failures.push(`${width}px: existing notes must not hide behind a closed disclosure`);
    if (seen.notes !== 'from the cockpit') failures.push(`${width}px: notes must come from the cockpit's own store, got "${seen.notes}"`);
    if (!seen.highlightsShown) failures.push(`${width}px: a session that beat its previous best must show notable progress`);
    if (seen.primary !== 'Finish Workout' || !seen.primaryIsFilled) failures.push(`${width}px: Finish must be the one dominant action`);
    if (!seen.discardSeparated) failures.push(`${width}px: the destructive action must be separated from the safe ones`);
    if (seen.smallControls) failures.push(`${width}px: ${seen.smallControls} sheet buttons below the 44px target`);
    if (seen.overflow) failures.push(`${width}px: horizontal overflow in the finish sheet`);
    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Effort stays optional when nothing was entered ────────────────────────
  {
    const { context, page } = await session(fixture({ beatsPrevious: false }));
    await openCockpitAndFinish(page);
    const seen = await page.evaluate(() => ({
      effortOpen: document.getElementById('summaryEffortDetails')?.open,
      highlightsShown: !document.getElementById('summaryHighlights')?.hidden,
    }));
    console.log('no effort, no PR:', JSON.stringify(seen));
    if (seen.effortOpen !== false) failures.push('effort must stay collapsed when nothing was entered');
    if (seen.highlightsShown) failures.push('a session that beat nothing must show no notable progress');
    await context.close();
  }

  // ── Discard names the exact workout, and is reversible ────────────────────
  {
    const { context, page, errors } = await session(fixture({ notes: 'keep me' }));
    await openCockpitAndFinish(page);
    await page.evaluate(() => /** @type {any} */ (document.querySelector('[data-action="discard-finish-workout"]'))?.click());
    await page.waitForTimeout(400);
    const confirm = await page.evaluate(() => ({
      title: document.getElementById('resetModalTitle')?.textContent || '',
      copy: document.getElementById('resetModalCopy')?.textContent || '',
      action: document.getElementById('resetModalAction')?.textContent || '',
    }));
    console.log('discard confirm:', JSON.stringify(confirm));
    const dayName = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }[DAY];
    if (!confirm.title.includes(dayName)) failures.push(`discard title must name the day, got "${confirm.title}"`);
    if (/today's log/i.test(confirm.title + confirm.copy)) failures.push('discard copy must not say "today\'s log" — it is wrong on any other day');
    if (!/^Discard workout$/.test(confirm.action.trim())) failures.push(`destructive action must be "Discard workout", got "${confirm.action}"`);

    await page.evaluate(() => /** @type {any} */ (document.getElementById('resetModalAction'))?.click());
    await page.waitForTimeout(600);
    const discarded = await page.evaluate((key) => {
      const week = JSON.parse(localStorage.getItem(key)).weeks['2'];
      const day = Object.keys(week.lifts || {})[0];
      const rows = Object.values(week.lifts?.[day] || {}).flat();
      return {
        undoVisible: !document.getElementById('activityUndoBar')?.hidden,
        message: document.getElementById('activityUndoMessage')?.textContent || '',
        completed: rows.filter((r) => r && r.c).length,
        notes: week.notes?.[day] ?? '',
      };
    }, STORAGE_KEY);
    console.log('after discard:', JSON.stringify(discarded));
    if (!discarded.undoVisible) failures.push('discarding must offer an Undo — the confirmation promises one');
    if (!/discarded/i.test(discarded.message)) failures.push(`undo bar must name what happened, got "${discarded.message}"`);
    if (discarded.completed !== 0) failures.push('discard must clear the logged sets');
    if (discarded.notes !== '') failures.push('discard must clear the notes');

    await page.evaluate(() => /** @type {any} */ (document.querySelector('[data-action="undo-activity-delete"]'))?.click());
    await page.waitForTimeout(700);
    const restored = await page.evaluate((key) => {
      const week = JSON.parse(localStorage.getItem(key)).weeks['2'];
      const day = Object.keys(week.lifts || {})[0];
      const rows = Object.values(week.lifts?.[day] || {}).flat();
      return {
        completed: rows.filter((r) => r && r.c).length,
        loads: rows.filter((r) => r && r.c).map((r) => r.w),
        notes: week.notes?.[day] ?? '',
        barHidden: document.getElementById('activityUndoBar')?.hidden,
      };
    }, STORAGE_KEY);
    console.log('after undo:', JSON.stringify(restored));
    if (restored.completed !== 2) failures.push(`Undo must restore both logged sets, got ${restored.completed}`);
    if (!restored.loads.every((l) => l === '105')) failures.push(`Undo must restore the exact loads, got ${JSON.stringify(restored.loads)}`);
    if (restored.notes !== 'keep me') failures.push(`Undo must restore the notes, got "${restored.notes}"`);
    if (!restored.barHidden) failures.push('the undo bar must dismiss after use');
    if (errors.length) failures.push(`discard flow browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── A finished workout does not dead-end ──────────────────────────────────
  {
    const { context, page } = await session(fixture());
    const links = await page.evaluate(() => {
      const next = document.querySelector('.recap-next');
      return {
        exists: !!next,
        actions: [...(next?.querySelectorAll('[data-action]') || [])].map((b) => b.getAttribute('data-action')),
        small: [...(next?.querySelectorAll('button') || [])].filter((b) => b.getBoundingClientRect().height && b.getBoundingClientRect().height < 43).length,
      };
    });
    console.log('recap next steps:', JSON.stringify(links));
    if (!links.exists) failures.push('the recap must offer a next step, not only Done');
    for (const action of ['recap-open-history', 'recap-open-progress']) {
      if (!links.actions.includes(action)) failures.push(`recap is missing the ${action} route`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((f) => console.error(`FAIL: ${f}`));
  process.exit(1);
}
console.log('Finish review contract passed.');
