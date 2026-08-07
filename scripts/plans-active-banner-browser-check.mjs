// =============================================================================
// PLANS ACTIVE-PLAN BANNER BROWSER CHECK — roadmap Phase 4A
//
// Drives the real Plans landing and asserts the leading card's contract:
//   - it never advertises a session the athlete has already finished (it read
//     the programme TEMPLATE only, so it said "Today: Push A" over completed
//     work — contradicting Home's Today card);
//   - its action carries the DAY it applies to, so "Continue" cannot open the
//     cockpit on whatever day was last selected there;
//   - the plan percentage appears once, not three times;
//   - the card is keyboard-operable and its action meets the 44px target;
//   - it survives 320–412px and both themes without overflow.
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

// A Monday, so "today" is a programmed day in the fixture plan below.
const MONDAY_ISO = '2026-08-03';
const CLOCK = new Date('2026-08-03T09:00:00+10:00').getTime();

const PROGRAM = {
  id: 'custom-banner-check',
  name: 'Banner Check Plan',
  totalWeeks: 8,
  weeklyVolModifiers: { 3: { sets: 3, reps: '5', intensityLabel: 'Work' } },
  days: {
    mon: { title: 'Push A', desc: '', badge: 'PUSH', lifts: ['Bench Press'], runs: 'Rest' },
    tue: { title: 'Rest', desc: '', lifts: [], runs: 'Rest' },
    wed: { title: 'Pull B', desc: '', badge: 'PULL', lifts: ['Barbell Row'], runs: 'Rest' },
    thu: { title: 'Rest', desc: '', lifts: [], runs: 'Rest' },
    fri: { title: 'Legs C', desc: '', badge: 'LEGS', lifts: ['Back Squat'], runs: 'Rest' },
  },
};

const doneSet = () => ({ c: true, w: '80', r: '5' });

function fixture(week) {
  return {
    schemaVersion: 5,
    currentWeek: '3',
    activeActivationId: 'a1',
    activeProgramId: PROGRAM.id,
    customPrograms: [PROGRAM],
    settings: {
      name: 'Athlete', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km',
      weekStartDay: 'mon', onboardingComplete: true,
      fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym',
    },
    weeks: { '3': { activationId: 'a1', ...week } },
  };
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];

async function plans(week, { width = 390, theme = 'dark' } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(fixture(week))]);
  // Pin the clock so "today" is the fixture's Monday whenever this runs — a
  // check that only passes on some weekdays is not a check.
  await context.addInitScript(pinClock, CLOCK);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => /** @type {any} */ (document.querySelector('.bottom-nav .nav-item[data-target="program"]'))?.click());
  await page.waitForTimeout(700);
  return { context, page, errors };
}

const readBanner = () => {
  const card = document.querySelector('#activeProgBanner .active-prog-card');
  if (!card) return { present: false };
  const btn = card.querySelector('.active-prog-continue-btn');
  const open = card.querySelector('.active-prog-open');
  const text = (card.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    present: true,
    state: card.getAttribute('data-plan-state'),
    name: card.querySelector('.active-prog-name')?.textContent?.trim() || '',
    meta: card.querySelector('.active-prog-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    lead: card.querySelector('.active-prog-next-lead')?.textContent?.trim() || '',
    title: card.querySelector('.active-prog-next-title')?.textContent?.trim() || '',
    status: card.querySelector('.active-prog-next-status')?.textContent?.trim() || '',
    ringLabel: card.querySelector('.active-prog-progress-ring')?.getAttribute('aria-label') || '',
    action: btn?.getAttribute('data-action') || '',
    actionDay: btn?.getAttribute('data-day') || '',
    actionLabel: btn?.textContent?.trim() || '',
    actionHeight: btn ? Math.round(btn.getBoundingClientRect().height) : 0,
    actionQuiet: !!btn?.classList.contains('active-prog-continue-btn--quiet'),
    openTabbable: open?.getAttribute('tabindex') === '0' && open?.getAttribute('role') === 'button',
    openAria: open?.getAttribute('aria-label') || '',
    // How many times the plan percentage is printed on the card.
    pctOccurrences: (text.match(/\d+%/g) || []).length,
    text,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
};

try {
  // ── Untouched Monday: start today, and name the day it starts ─────────────
  {
    const { context, page, errors } = await plans({});
    const b = await page.evaluate(readBanner);
    console.log('untouched:', JSON.stringify(b));
    if (!b.present) failures.push('no active-plan banner rendered for an active plan');
    if (b.state !== 'today') failures.push(`expected state "today", got "${b.state}"`);
    if (b.lead !== 'Today' || b.title !== 'Push A') failures.push(`expected Today · Push A, got "${b.lead}" · "${b.title}"`);
    if (b.action !== 'select-program-workout') failures.push(`the action must carry a day, got "${b.action}"`);
    if (b.actionDay !== 'mon') failures.push(`expected data-day="mon", got "${b.actionDay}"`);
    if (b.actionHeight < 44) failures.push(`the plan's primary action renders at ${b.actionHeight}px, under the 44px target`);
    if (!b.openTabbable) failures.push('the leading card is not keyboard-operable');
    if (!/Week 3 of 8/.test(b.meta)) failures.push(`the current week must lead, got "${b.meta}"`);
    if (!/0 of 3 sessions done this week/.test(b.meta)) failures.push(`this week's real progress is missing, got "${b.meta}"`);
    if (b.pctOccurrences !== 1) failures.push(`the plan percentage is printed ${b.pctOccurrences} times, not once`);
    if (!/weeks finished/.test(b.ringLabel)) failures.push(`the progress ring has no stated basis: "${b.ringLabel}"`);
    if (errors.length) failures.push(`untouched: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── The regression: a finished session must not be re-advertised ──────────
  {
    const { context, page, errors } = await plans({
      dates: { mon: MONDAY_ISO },
      lifts: { mon: { 'Bench Press': [doneSet(), doneSet(), doneSet()] } },
      sessionStatus: { mon: 'finished' },
    });
    const b = await page.evaluate(readBanner);
    console.log('finished today:', JSON.stringify(b));
    if (b.state !== 'today_done') failures.push(`a finished session must read as done, got "${b.state}"`);
    if (/^Today$/.test(b.lead) && /Push A/.test(b.title) && !/Completed/i.test(b.text)) {
      failures.push('the banner still advertises a finished session as today\'s workout');
    }
    if (!/Completed today/i.test(b.lead)) failures.push(`expected "Completed today", got "${b.lead}"`);
    if (!/Wednesday · Pull B/.test(b.status)) failures.push(`the next session must be named with its day, got "${b.status}"`);
    if (!b.actionQuiet) failures.push('with nothing to start, the action must not read as primary');
    if (!/1 of 3 sessions done this week/.test(b.meta)) failures.push(`week progress did not move, got "${b.meta}"`);
    if (errors.length) failures.push(`finished: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Resume targets the started day, not whatever the cockpit had open ────
  {
    const { context, page, errors } = await plans({
      dates: { mon: MONDAY_ISO },
      lifts: { mon: { 'Bench Press': [doneSet()] } },
    });
    const b = await page.evaluate(readBanner);
    console.log('part-logged:', JSON.stringify(b));
    if (b.state !== 'in_progress') failures.push(`part-logged work must read as in progress, got "${b.state}"`);
    if (b.actionLabel !== 'Resume workout') failures.push(`expected Resume workout, got "${b.actionLabel}"`);

    // Put the cockpit on a different day, come back, and press the action: it
    // must land on Monday. The old "Continue" was a bare tab switch, so it
    // opened whichever day the cockpit had selected last.
    await page.evaluate(() => {
      /** @type {any} */ (document.querySelector('.bottom-nav .nav-item[data-target="workout"]'))?.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      /** @type {any} */ (document.querySelector('[data-action="open-train-cockpit"]'))?.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      /** @type {any} */ (document.querySelector('#cockpitDaySelectorBar .day-pill[data-day="fri"]'))?.click();
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      /** @type {any} */ (document.querySelector('.bottom-nav .nav-item[data-target="program"]'))?.click();
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      /** @type {any} */ (document.querySelector('.active-prog-continue-btn'))?.click();
    });
    await page.waitForTimeout(700);
    const landed = await page.evaluate(() => ({
      tab: document.querySelector('.view-container.active')?.id || '',
      day: document.querySelector('#cockpitDaySelectorBar .day-pill.active')?.getAttribute('data-day') || '',
      cockpitVisible: !document.getElementById('trainCockpit')?.hidden,
    }));
    console.log('resume landed on:', JSON.stringify(landed));
    if (landed.tab !== 'view-workout') failures.push(`Resume must open Train, landed on "${landed.tab}"`);
    if (!landed.cockpitVisible) failures.push('Resume must open the cockpit, not the Train landing');
    if (landed.day !== 'mon') failures.push(`Resume opened day "${landed.day}" instead of the started Monday`);
    if (errors.length) failures.push(`resume: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Keyboard: the leading card opens the plan on Enter ────────────────────
  {
    const { context, page, errors } = await plans({});
    await page.evaluate(() => /** @type {any} */ (document.querySelector('.active-prog-open'))?.focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const opened = await page.evaluate(() => ({
      detail: document.getElementById('programDetailScreen')?.style.display || '',
      library: document.getElementById('programLibraryScreen')?.style.display || '',
    }));
    console.log('keyboard open:', JSON.stringify(opened));
    if (opened.detail !== 'block') failures.push('Enter on the leading card did not open the plan detail');
    if (errors.length) failures.push(`keyboard: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Holds together at both edges of the viewport range, in both themes ───
  for (const [width, theme] of [[320, 'dark'], [412, 'light']]) {
    const { context, page, errors } = await plans({
      dates: { mon: MONDAY_ISO },
      lifts: { mon: { 'Bench Press': [doneSet(), doneSet(), doneSet()] } },
      sessionStatus: { mon: 'finished' },
    }, { width: /** @type {number} */ (width), theme: /** @type {any} */ (theme) });
    const b = await page.evaluate(readBanner);
    const visible = await page.evaluate(() => {
      const btn = document.querySelector('.active-prog-continue-btn');
      const title = document.querySelector('.active-prog-next-title');
      const rect = btn?.getBoundingClientRect();
      return {
        actionVisible: !!rect && rect.width > 0 && rect.height > 0,
        titleClipped: !!title && title.scrollWidth > title.clientWidth + 1,
        actionHeight: rect ? Math.round(rect.height) : 0,
      };
    });
    console.log(`${width}px/${theme}:`, JSON.stringify({ ...visible, overflow: b.overflow, pct: b.pctOccurrences }));
    if (b.overflow) failures.push(`${width}px/${theme}: horizontal overflow on the Plans landing`);
    if (!visible.actionVisible) failures.push(`${width}px/${theme}: the banner action is not visible`);
    if (visible.actionHeight < 44) failures.push(`${width}px/${theme}: action at ${visible.actionHeight}px, under 44px`);
    if (b.pctOccurrences !== 1) failures.push(`${width}px/${theme}: percentage printed ${b.pctOccurrences} times`);
    if (errors.length) failures.push(`${width}px/${theme}: browser errors: ${errors.join(' | ')}`);
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
console.log('Plans active-plan banner contract passed.');
