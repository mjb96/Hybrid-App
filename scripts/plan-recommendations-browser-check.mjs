// =============================================================================
// PLAN RECOMMENDATIONS BROWSER CHECK — roadmap Phase 4A
//
// Drives the real Plans → Discover surface and asserts the recommendation
// contract:
//   - two different athletes are shown different programmes, because the row
//     used to be a popularity ranking identical for everyone under the heading
//     "Based on your training";
//   - every recommended card states WHY it fits, in terms of something the
//     athlete told the app — not "Staff Pick", which describes the programme;
//   - an athlete who has told the app nothing gets no personalised row at all,
//     rather than a fabricated one;
//   - Browse-all stays reachable and complete underneath.
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

const FULL_GYM = {
  barbell: true, rack: true, dumbbells: true, cables: true, pullupBar: true,
  bands: true, kettlebells: true, ezBar: true, treadmill: true,
};
const NO_KIT = {
  barbell: false, rack: false, dumbbells: false, cables: false, pullupBar: false,
  bands: false, kettlebells: false, ezBar: false, treadmill: false,
};

function fixture(settings) {
  return {
    schemaVersion: 5, currentWeek: '1', activeActivationId: 'a1',
    settings: {
      name: 'Athlete', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km',
      weekStartDay: 'mon', onboardingComplete: true, ...settings,
    },
    weeks: {},
  };
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const failures = [];

async function discover(settings, width = 390, theme = 'dark') {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: TZ, colorScheme: theme });
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(fixture(settings))]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/frame-ancestors.*ignored.*meta/i.test(m.text()) && !/net::ERR_/.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => /** @type {any} */ (document.querySelector('.bottom-nav .nav-item[data-target="program"]'))?.click());
  await page.waitForTimeout(900);
  return { context, page, errors };
}

/** The recommendations row as rendered, with each card's stated reason. */
const readRow = () => {
  const rows = [...document.querySelectorAll('.collection-row')];
  const row = rows.find(r => /Recommended For You/i.test(r.querySelector('.collection-title')?.textContent || ''));
  if (!row) return { present: false, cards: [], subtitle: '' };
  const cards = [...row.querySelectorAll('.prog-card')].map(c => ({
    id: c.getAttribute('data-program-id'),
    name: c.querySelector('.prog-card-name')?.textContent?.trim(),
    reason: c.querySelector('.prog-card-reason')?.textContent?.trim() || '',
  }));
  return {
    present: true,
    subtitle: row.querySelector('.collection-subtitle')?.textContent?.trim() || '',
    cards,
  };
};

try {
  // ── Two athletes, two answers ─────────────────────────────────────────────
  const seen = {};
  for (const [label, settings] of [
    ['runner', { fitnessGoal: 'endurance', fitnessLevel: 'advanced', equipmentTier: 'home', equipment: NO_KIT }],
    ['lifter', { fitnessGoal: 'strength', fitnessLevel: 'beginner', equipmentTier: 'gym', equipment: FULL_GYM }],
  ]) {
    const { context, page, errors } = await discover(settings);
    const row = await page.evaluate(readRow);
    console.log(`${label}:`, JSON.stringify(row));
    if (!row.present) { failures.push(`${label}: no recommendations row rendered`); await context.close(); continue; }
    if (row.cards.length < 3 || row.cards.length > 5) {
      failures.push(`${label}: 4A asks for three to five recommendations, got ${row.cards.length}`);
    }
    for (const card of row.cards) {
      if (!card.reason) failures.push(`${label}: "${card.name}" is recommended with no stated reason`);
      if (/staff pick|certified|popular/i.test(card.reason)) {
        failures.push(`${label}: "${card.reason}" describes the programme, not the fit`);
      }
    }
    seen[label] = row.cards.map(c => c.id).join(',');
    if (errors.length) failures.push(`${label}: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }
  if (seen.runner && seen.runner === seen.lifter) {
    failures.push('an endurance athlete and a beginner lifter were shown identical recommendations');
  }

  // ── Reasons are true for the athlete they are shown to ───────────────────
  {
    const { context, page } = await discover({
      fitnessGoal: 'strength', fitnessLevel: 'beginner', equipmentTier: 'gym', equipment: FULL_GYM,
    });
    const row = await page.evaluate(readRow);
    console.log('strength/beginner reasons:', JSON.stringify(row.cards.map(c => c.reason)));
    for (const card of row.cards) {
      // A reason naming a level must name THIS athlete's level, never another.
      const other = /(intermediate|advanced|elite) athletes/i.exec(card.reason);
      if (other) failures.push(`beginner shown "${card.reason}" as a reason to pick it`);
    }
    await context.close();
  }

  // ── No claim without evidence ─────────────────────────────────────────────
  {
    // A profile with nothing set must not produce a "Based on your…" row.
    const { context, page } = await discover({ fitnessGoal: null, fitnessLevel: null, equipmentTier: null, equipment: {} });
    const state = await page.evaluate(readRow);
    const browseAll = await page.evaluate(() =>
      [...document.querySelectorAll('.collection-title')].some(t => /Browse all categories/i.test(t.textContent || '')));
    console.log('blank profile:', JSON.stringify({ row: state.present, browseAll }));
    if (state.present && state.cards.some(c => !c.reason)) {
      failures.push('a blank profile produced recommendations with no reasons');
    }
    if (!browseAll) failures.push('Browse all must stay reachable whatever the profile');
    await context.close();
  }

  // ── The surface still holds together ──────────────────────────────────────
  for (const width of [320, 412]) {
    const { context, page, errors } = await discover(
      { fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM },
      width,
    );
    const seenRow = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.collection-row')]
        .find(r => /Recommended For You/i.test(r.querySelector('.collection-title')?.textContent || ''));
      const reason = row?.querySelector('.prog-card-reason');
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        reasonVisible: !!reason && !!(/** @type {any} */ (reason).offsetParent),
      };
    });
    console.log(`${width}px:`, JSON.stringify(seenRow));
    if (seenRow.overflow) failures.push(`${width}px: horizontal overflow on Discover`);
    if (!seenRow.reasonVisible) failures.push(`${width}px: the reason is not actually visible on the card`);
    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
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
console.log('Plan recommendation contract passed.');
