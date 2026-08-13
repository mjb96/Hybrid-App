// =============================================================================
// SESSION OUTLINE BROWSER CHECK — roadmap Phase 2A
//
// The outline is an index of the live session, so its whole value rests on
// agreeing with the accordion beneath it. This drives the real cockpit:
// the outline lists the same exercises in the same order, its counts match the
// cards, ticking a set updates it, and tapping a row opens that exercise.
//
// It also pins the thing most likely to be got wrong: warm-ups are not working
// sets, so an outline that counts them would promise more remaining work than
// the card below it lists.
// =============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserContext, resolveChromium } from './browser-runtime.mjs';

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
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://127.0.0.1:${port}`;

const TZ = 'Australia/Sydney';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

function fixture(theme) {
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Outline', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: {},
  };
}

async function enterCockpit(page) {
  await page.click('.nav-item[data-target="workout"]');
  await page.waitForSelector('#trainLanding [data-action="qs-workout"]');
  await page.click('#trainLanding [data-action="qs-workout"]');
  await page.waitForSelector('#trainCockpit:not([hidden])');
  // Thursday on the default programme is a full lifting day regardless of when
  // this check runs, so the assertions never depend on the real weekday.
  await page.click('#cockpitDaySelectorBar .day-pill[data-day="thu"]');
  await page.waitForSelector('#cockpitExercisesContainer .cockpit-exercise');
}

const readOutline = (page) => page.evaluate(() => {
  const el = document.getElementById('cockpitSessionOutline');
  if (!el || el.hidden) return { visible: false };
  const rows = [...el.querySelectorAll('.session-outline__row')];
  return {
    visible: true,
    summary: el.querySelector('.session-outline__summary')?.textContent?.trim(),
    names: rows.map((r) => r.getAttribute('data-liftname')),
    counts: rows.map((r) => r.querySelector('.session-outline__count')?.textContent?.trim()),
    statuses: rows.map((r) => [...r.classList].find((c) => c.startsWith('is-'))),
    smallControls: rows.filter((r) => {
      const box = r.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.height < 43;
    }).length,
  };
});

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];
try {
  for (const [width, theme] of [[320, 'dark'], [390, 'light'], [412, 'dark']]) {
    const context = await createBrowserContext(browser, { viewport: { width, height: 900 }, timezoneId: TZ, colorScheme: theme });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ['hybrid_engine_v2_state', JSON.stringify(fixture(theme))]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await enterCockpit(page);

    const outline = await readOutline(page);
    // The accordion is the source of truth; the outline must mirror it exactly.
    const cardNames = await page.$$eval('#cockpitExercisesContainer .cockpit-exercise',
      (cards) => cards.map((c) => c.getAttribute('data-liftname')));
    console.log(`Outline ${width}px/${theme}:`, JSON.stringify({ ...outline, cardNames: cardNames.length }));

    if (!outline.visible) { failures.push(`${width}px: outline not rendered`); await context.close(); continue; }
    if (outline.names.join('|') !== cardNames.join('|')) {
      failures.push(`${width}px: outline order/content differs from the accordion\n  outline: ${outline.names.join(',')}\n  cards:   ${cardNames.join(',')}`);
    }
    if (!outline.summary) failures.push(`${width}px: no summary line`);
    if (/%/.test(outline.summary || '')) failures.push(`${width}px: summary shows a percentage instead of remaining work`);
    if (outline.smallControls) failures.push(`${width}px: ${outline.smallControls} outline rows below the 44px target`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) {
      failures.push(`${width}px: page-level horizontal overflow`);
    }

    // Outline counts must equal the working-set counts on the cards themselves.
    const cardCounts = await page.$$eval('#cockpitExercisesContainer .cockpit-exercise', (cards) => cards.map((card) => {
      const rows = [...card.querySelectorAll('.cockpit-set-row')].filter((r) => !r.classList.contains('is-warmup'));
      const done = rows.filter((r) => r.querySelector('.gym-check')?.checked).length;
      return `${done}/${rows.length}`;
    }));
    if (outline.counts.join('|') !== cardCounts.join('|')) {
      failures.push(`${width}px: counts disagree with the cards\n  outline: ${outline.counts.join(',')}\n  cards:   ${cardCounts.join(',')}`);
    }

    // Tapping an outline row must open that exercise.
    const targetName = outline.names[outline.names.length - 1];
    await page.click(`.session-outline__row[data-liftname="${targetName.replace(/"/g, '\\"')}"]`);
    await page.waitForTimeout(300);
    const opened = await page.evaluate(() => document.querySelector('.cockpit-exercise:not(.collapsed)')?.getAttribute('data-liftname'));
    if (opened !== targetName) failures.push(`${width}px: tapping "${targetName}" opened "${opened}"`);

    // Logging a set must move the outline — a stale index is worse than none.
    const before = await readOutline(page);
    await page.evaluate(() => {
      const card = document.querySelector('.cockpit-exercise:not(.collapsed)');
      const row = card?.querySelector('.cockpit-set-row');
      row?.querySelector('.input-weight-node') && (row.querySelector('.input-weight-node').value = '60');
      row?.querySelector('.input-reps-node') && (row.querySelector('.input-reps-node').value = '5');
      row?.querySelector('.gym-check')?.click();
    });
    await page.waitForTimeout(500);
    const after = await readOutline(page);
    if (after.counts.join('|') === before.counts.join('|')) {
      failures.push(`${width}px: outline did not update after logging a set (${before.counts.join(',')})`);
    }

    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1);
}
console.log('Session outline browser contract passed.');
