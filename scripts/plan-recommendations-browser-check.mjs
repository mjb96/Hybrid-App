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

  // ── The row states its basis, and the basis is correctable in place ──────
  {
    // An upgrading athlete never answered these: settings ship with
    // hybrid/intermediate/full-gym and onboarding auto-completes for anyone
    // with stored data. The row must say what it assumed, not imply a choice.
    const { context, page, errors } = await discover({
      fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM,
    });
    const readBasis = () => {
      const details = document.querySelector('.prog-basis');
      const row = [...document.querySelectorAll('.collection-row')]
        .find(r => /Recommended For You/i.test(r.querySelector('.collection-title')?.textContent || ''));
      return {
        present: !!details,
        values: details?.querySelector('.prog-basis__values')?.textContent?.trim() || '',
        groups: details?.querySelectorAll('.prog-basis__question').length || 0,
        current: [...(details?.querySelectorAll('.prog-basis__btn.is-current') || [])].map(b => b.textContent.trim()),
        smallButtons: [...(details?.querySelectorAll('.prog-basis__btn') || [])]
          .filter(b => b.getBoundingClientRect().height && b.getBoundingClientRect().height < 43).length,
        top: row ? [...row.querySelectorAll('.prog-card')].map(c => c.getAttribute('data-program-id')) : [],
      };
    };
    const before = await page.evaluate(readBasis);
    console.log('basis:', JSON.stringify(before));
    if (!before.present) failures.push('the recommendations row must state what it was built on');
    if (before.groups !== 3) failures.push(`expected goal/level/equipment, got ${before.groups} groups`);
    if (!/Hybrid/i.test(before.values)) failures.push(`basis must name the values used, got "${before.values}"`);

    await page.evaluate(() => document.querySelector('.prog-basis')?.setAttribute('open', ''));
    await page.waitForTimeout(150);
    const opened = await page.evaluate(readBasis);
    if (opened.smallButtons) failures.push(`${opened.smallButtons} basis buttons below the 44px target`);
    if (opened.current.length !== 3) failures.push(`each group must show its current answer, got ${opened.current.length}`);

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.prog-basis__btn')].find(b => b.textContent.trim() === 'Endurance');
      if (btn) /** @type {any} */ (btn).click();
    });
    await page.waitForTimeout(600);
    const after = await page.evaluate(readBasis);
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.fitnessGoal, STORAGE_KEY);
    console.log('after changing the basis:', JSON.stringify({ values: after.values, stored, top: after.top.slice(0, 3) }));
    if (stored !== 'endurance') failures.push(`the answer must persist to settings, got "${stored}"`);
    if (!/Endurance/i.test(after.values)) failures.push('the basis must show the new answer');
    if (JSON.stringify(after.top) === JSON.stringify(before.top)) {
      failures.push('changing the basis must change the recommendations');
    }
    if (errors.length) failures.push(`basis browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Recommend before browse: the filters are disclosed, not default ───────
  // Measured before this landed: the default Discover surface carried 36 chip
  // controls (16 categories + 5 levels at the top, plus the SAME 15 categories
  // again in the Browse-all grid) and put a 220px editorial `featured` carousel
  // above a personal recommendation row that began 651px down.
  {
    const { context, page, errors } = await discover({
      fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM,
    });
    const layout = () => {
      const top = (el) => (el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null);
      const rowTop = (re) => top([...document.querySelectorAll('.collection-row')]
        .find((r) => re.test(r.querySelector('.collection-title')?.textContent || '')));
      return {
        categoryChips: document.querySelectorAll('#progFilterChips .filter-chip').length,
        difficultyChips: document.querySelectorAll('#progDifficultyChips .filter-chip').length,
        browseGridChips: document.querySelectorAll('.prog-browse-grid .filter-chip').length,
        recommendationsTop: rowTop(/Recommended For You/i),
        browseAllTop: rowTop(/Browse all categories/i),
        heroTop: top(document.querySelector('.hero-banner')),
        viewport: window.innerHeight,
        grid: document.querySelectorAll('#progLibraryContent .program-grid .prog-card').length,
      };
    };
    const before = await page.evaluate(layout);
    console.log('default Discover:', JSON.stringify(before));
    if (before.categoryChips || before.difficultyChips) {
      failures.push(`filters must be disclosed, not default: ${before.categoryChips} category + ${before.difficultyChips} level chips on the landing`);
    }
    if (before.browseGridChips < 15) failures.push(`Browse-all must still reach every category, got ${before.browseGridChips}`);
    if (before.recommendationsTop == null) failures.push('no recommendations row on the default surface');
    else if (before.recommendationsTop > before.viewport) {
      failures.push(`recommendations start at ${before.recommendationsTop}px, below the first viewport`);
    }
    if (before.heroTop != null && before.recommendationsTop != null && before.heroTop < before.recommendationsTop) {
      failures.push('the editorial featured carousel is above the personal recommendations');
    }

    // Entering browse mode reveals the filters and the grid...
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('.prog-browse-grid .filter-chip')]
        .find((c) => /Strength/i.test(c.textContent || ''));
      if (chip) /** @type {any} */ (chip).click();
    });
    await page.waitForTimeout(500);
    const browsing = await page.evaluate(layout);
    console.log('browsing a category:', JSON.stringify(browsing));
    if (!browsing.categoryChips) failures.push('browsing must expose the category filters');
    if (!browsing.difficultyChips) failures.push('browsing must expose the level filters');
    if (!browsing.grid) failures.push('browsing a category must render its programmes');

    // ...and "All" returns to the recommended surface, filters away again.
    await page.evaluate(() => {
      const all = [...document.querySelectorAll('#progFilterChips .filter-chip')]
        .find((c) => (c.textContent || '').trim() === 'All');
      if (all) /** @type {any} */ (all).click();
    });
    await page.waitForTimeout(500);
    const back = await page.evaluate(layout);
    console.log('back to recommended:', JSON.stringify(back));
    if (back.categoryChips || back.difficultyChips) failures.push('leaving browse must put the filters away again');
    if (back.recommendationsTop == null) failures.push('leaving browse must restore the recommendations');
    if (errors.length) failures.push(`hierarchy: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // ── Compare states its numbers, and says them out loud ────────────────────
  // The two "training focus" bars were bare coloured strips: no value, no scale
  // and no accessible name, while every stat row beside them stated its value.
  {
    const { context, page, errors } = await discover({
      fitnessGoal: 'strength', fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM,
    });
    await page.evaluate(() => {
      const card = document.querySelector('#progLibraryContent .prog-card[data-program-id]');
      if (card) /** @type {any} */ (card).click();
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => /** @type {any} */ (document.querySelector('[data-action="open-compare"]'))?.click());
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const pick = document.querySelector('[data-action="compare-pick"]');
      if (pick) /** @type {any} */ (pick).click();
    });
    await page.waitForTimeout(500);
    const cmp = await page.evaluate(() => {
      const body = document.getElementById('compareBody');
      const groups = [...(body?.querySelectorAll('[role="group"]') || [])];
      return {
        open: !!document.getElementById('programCompareModal')?.classList.contains('active'),
        statRows: (body?.textContent?.match(/LENGTH|FREQUENCY|EQUIPMENT/gi) || []).length,
        focusGroups: groups.length,
        labelled: groups.filter((g) => /%/.test(g.getAttribute('aria-label') || '')).length,
        percentLabels: (body?.textContent?.match(/\d+%/g) || []).length,
      };
    });
    console.log('compare:', JSON.stringify(cmp));
    if (!cmp.open) failures.push('compare modal did not open');
    if (!cmp.statRows) failures.push('compare lost its consistent stat fields');
    if (cmp.focusGroups && cmp.labelled !== cmp.focusGroups) {
      failures.push(`${cmp.focusGroups - cmp.labelled} training-focus rows have no accessible value`);
    }
    if (cmp.focusGroups && cmp.percentLabels < cmp.focusGroups * 2) {
      failures.push(`training-focus bars must state both values, got ${cmp.percentLabels} for ${cmp.focusGroups} rows`);
    }
    if (errors.length) failures.push(`compare: browser errors: ${errors.join(' | ')}`);
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
