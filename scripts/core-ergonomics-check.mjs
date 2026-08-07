// Real-browser contract for roadmap R11: core controls expose 44px targets,
// the app does not create horizontal page scrolling at supported phone widths
// or 200% text, and semantic secondary-copy tokens meet WCAG AA contrast.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTHS = [320, 360, 390, 412];
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function rgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((start) => Number.parseInt(value.slice(start, start + 2), 16) / 255);
}
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const css = await readFile(path.join(ROOT, 'css/styles.css'), 'utf8');
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || '';
const lightBlock = css.match(/html\[data-theme="light"\]\s*\{([\s\S]*?)\}/)?.[1] || '';
const token = (block, name) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
for (const [theme, block, surfaces] of [
  ['dark', rootBlock, ['bg-app', 'bg-card']],
  ['light', lightBlock, ['bg-app', 'bg-card']],
]) {
  for (const textName of ['text-secondary', 'text-muted', 'text-faint']) {
    for (const surfaceName of surfaces) {
      const foreground = token(block, textName);
      const background = token(block, surfaceName);
      check(Boolean(foreground && background), `${theme}: unresolved ${textName}/${surfaceName} contrast token`);
      if (foreground && background) {
        const ratio = contrast(foreground, background);
        check(ratio >= 4.5, `${theme}: ${textName} on ${surfaceName} is ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
      }
    }
  }
}

const runtime = await resolveChromium();
if (!runtime) process.exit(0);
const { chromium, executablePath } = runtime;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const body = await readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });

const state = {
  schemaVersion: 4,
  currentWeek: '1',
  activeProgramId: 'hybrid_engine',
  activeActivationId: 'act_ergonomics',
  onboardingComplete: true,
  // A real body weight, because bodyweight/assisted sets are logged against it.
  // This check used to pass on a hardcoded 75 kg the app substituted whenever it
  // had never been told one — the fabrication that fix removed.
  settings: { name: 'Ergonomics Athlete', weightUnit: 'kg', distanceUnit: 'km', defaultBodyWeight: 82 },
  weeks: {
    '1': {
      activationId: 'act_ergonomics',
      dates: { mon: '2026-07-13' },
      lifts: { mon: { Squat: [{ c: true, w: '100', r: '5' }] } },
      liftOrder: { mon: ['Squat'] }, liftMeta: { mon: {} },
      gymStats: { mon: { time: '45:00' } }, gymRpe: { mon: '8' }, notes: { mon: '' },
      runSessions: { mon: [
        { sessionId: 'run_erg_a', source: 'gps', localDate: '2026-07-13', startTs: 100, dist: '5', time: '25:00' },
        { sessionId: 'run_erg_b', source: 'manual', localDate: '2026-07-13', startTs: 200, dist: '3', time: '15:00' },
      ] },
      runs: { mon: { sessionId: 'run_erg_b', source: 'manual', localDate: '2026-07-13', startTs: 200, dist: '3', time: '15:00' } },
      bodyWeight: {},
    },
  },
};

async function inspect(page, label, selectors) {
  const result = await page.evaluate((selectors) => {
    const nodes = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const unique = [...new Set(nodes)].filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
    });
    const undersized = unique.map((node) => {
      const rect = node.getBoundingClientRect();
      return { node: `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${[...node.classList].join('.')}`, width: rect.width, height: rect.height };
    }).filter(({ width, height }) => width < 43.5 || height < 43.5);
    return {
      count: unique.length,
      undersized,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth,
    };
  }, selectors);
  check(result.count > 0, `${label}: no primary controls found`);
  check(!result.overflow, `${label}: horizontal overflow ${result.scrollWidth}px > ${result.innerWidth}px`);
  for (const item of result.undersized) {
    check(false, `${label}: ${item.node} is ${item.width.toFixed(1)}×${item.height.toFixed(1)}px`);
  }
  return result;
}

async function appPage(width, text200 = false) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  await context.addInitScript((seed) => localStorage.setItem('hybrid_engine_v2_state', JSON.stringify(seed)), state);
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: `*,*::before,*::after{transition:none!important;animation:none!important;}${text200 ? 'html{font-size:32px!important;}' : ''}` });
  await page.waitForTimeout(100);
  return { context, page };
}

try {
  // Fresh onboarding owns the first-launch path and is measured independently.
  {
    const context = await browser.newContext({ viewport: { width: 320, height: 720 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#onboardingOverlay.active');
    await inspect(page, 'onboarding 320px', ['#onboardingOverlay .ob-cta', '#onboardingOverlay .ob-toggle-btn', '#onboardingOverlay .ob-skip', '#onboardingOverlay .ob-back-link']);
    await context.close();
  }

  for (const width of WIDTHS) {
    const { context, page } = await appPage(width);
    await inspect(page, `home ${width}px`, ['.bottom-nav .nav-item', '.home-avatar', '.log-run-fab', '.btn-history-link']);
    const navLabels = await page.$$eval('.bottom-nav .nav-item', (items) => items.map((item) => item.textContent.trim()));
    check(navLabels.join('|') === 'Home|Train|Progress|Plans',
      `home ${width}px: primary navigation was ${navLabels.join('|')}`);
    const homeCurrent = await page.$$eval('.bottom-nav [aria-current="page"]', (items) => items.map((item) => item.textContent.trim()));
    check(homeCurrent.join('|') === 'Home', `home ${width}px: aria-current was ${homeCurrent.join('|')}`);

    await page.click('#view-home .btn-history-link[data-action="open-activities"]');
    await page.waitForSelector('#activitiesScreen .activity-history-row');
    await inspect(page, `activities ${width}px`, ['#activitiesScreen .activity-filter', '#activitiesScreen .activity-history-row', '#activitiesScreen .subview-back-btn']);
    const activityKinds = await page.$$eval('#activitiesScreen .activity-history-row', (rows) => rows.map((row) => row.className));
    check(activityKinds.length === 3, `activities ${width}px: expected separate strength + two run rows, got ${activityKinds.length}`);
    check(activityKinds.filter((name) => name.includes('activity-history-row--run')).length === 2,
      `activities ${width}px: same-day runs were not shown separately`);
    await page.click('#activitiesScreen .activity-history-row--run');
    await page.waitForSelector('#activitiesScreen .activity-detail-shell');
    await inspect(page, `activity detail ${width}px`, ['#activitiesScreen .subview-back-btn', '#activitiesScreen .activity-menu-btn', '#activitiesScreen .an-tab']);
    await page.click('#activitiesScreen .subview-back-btn');
    await page.click('#activitiesScreen .subview-back-btn');

    await page.click('.home-avatar');
    await page.waitForSelector('#view-profile.active');
    await page.click('#view-profile [data-action="open-settings"]');
    await page.waitForSelector('#settingsOverlay[aria-hidden="false"]');
    await inspect(page, `settings ${width}px`, ['#settingsOverlay .settings-close-btn', '#settingsOverlay .settings-toggle-btn', '#settingsOverlay .settings-action-btn', '#settingsOverlay .settings-input']);
    await page.click('#settingsOverlay [data-action="close-settings"]');
    await page.waitForFunction(() => document.getElementById('settingsOverlay')?.getAttribute('aria-hidden') === 'true');

    await page.click('.bottom-nav [data-target="workout"]');
    await page.waitForSelector('#view-workout.active');
    // Train opens on its landing; this check is about COCKPIT ergonomics, so
    // enter the cockpit deterministically via the landing's Workout quick start
    // (present regardless of whether today is a training or rest day).
    await page.click('#trainLanding [data-action="qs-workout"]');
    await page.waitForSelector('#trainCockpit:not([hidden])');
    const trainCurrent = await page.$$eval('.bottom-nav [aria-current="page"]', (items) => items.map((item) => item.textContent.trim()));
    check(trainCurrent.join('|') === 'Train', `workout ${width}px: aria-current was ${trainCurrent.join('|')}`);
    // Deterministically select a day with a full session including a bodyweight
    // movement (hybrid_engine Thursday = Pull-Ups) so the workout assertions never
    // depend on which weekday the suite happens to run on — today could be a Rest
    // day with no exercises to inspect.
    await page.click('#view-workout .day-pill[data-day="thu"]');
    await page.waitForSelector('#view-workout .cockpit-exercise:has(.set-load-choice)');
    await inspect(page, `workout ${width}px`, ['#view-workout .day-pill', '#view-workout #startWorkoutBtn', '#view-workout .train-quick-start-btn', '#view-workout .set-num-lbl[data-action="quick-log"]', '#view-workout .gym-check-wrap', '#view-workout .btn-set-more']);
    if (width === 360) {
      const bodyweightCard = page.locator('#view-workout .cockpit-exercise:has(.set-load-choice)').first();
      if (await bodyweightCard.evaluate((card) => card.classList.contains('collapsed'))) {
        await bodyweightCard.locator('.cockpit-header-clickzone').click();
      }
      const bodyweightRow = bodyweightCard.locator('.cockpit-set-row:has(.set-load-choice)').first();
      check(await bodyweightRow.count() === 1, 'workout 360px: no direct bodyweight load-mode row');
      if (await bodyweightRow.count()) {
        const labels = await bodyweightRow.locator('.set-load-choice__btn').allTextContents();
        check(labels.join('|') === 'Bodyweight|Weighted|Assisted', `workout 360px: load modes were ${labels.join('|')}`);
        await inspect(page, 'workout load modes 360px', ['#view-workout .set-load-choice__btn']);
        const quick = bodyweightRow.locator('.set-num-lbl[data-action="quick-log"]');
        check(/^Log S1$/.test((await quick.textContent() || '').trim()), 'workout 360px: set shortcut is not visibly labelled Log S1');
        await bodyweightRow.locator('.set-load-choice__btn[data-mode="bodyweight"]').click();
        await bodyweightRow.locator('.input-reps-node').fill('5');
        await quick.click();
        const logged = await bodyweightRow.evaluate(async (row) => {
          const lift = row.closest('.cockpit-exercise')?.getAttribute('data-liftname');
          const index = Number.parseInt(row.getAttribute('data-set-index') || '0', 10);
          const state = await import('./js/state.js');
          const set = state.appState.weeks?.[state.appState.currentWeek]?.lifts?.[state.selectedDay]?.[lift]?.[index];
          return { completed: set?.c, bodyweight: set?.bw, mode: set?.loadMode, weight: Number(set?.w) };
        });
        check(logged.completed && logged.bodyweight && logged.mode === 'bodyweight' && logged.weight > 0,
          `workout 360px: first-tap bodyweight log metadata was ${JSON.stringify(logged)}`);
      }
    }

    await page.click('.bottom-nav [data-target="program"]');
    await page.waitForSelector('#view-program.active');
    await inspect(page, `programs ${width}px`, ['#view-program .filter-chip', '#view-program .active-prog-continue-btn', '#view-program .prog-card']);

    await context.close();
  }

  const { context, page } = await appPage(360, true);
  await inspect(page, 'home 360px @200% text', ['.bottom-nav .nav-item', '.home-avatar', '.btn-history-link']);
  await page.click('.bottom-nav [data-target="workout"]');
  await page.waitForSelector('#view-workout.active');
  // The Train landing is itself a primary surface at 200% text, so assert it
  // BEFORE stepping into the cockpit — it is where the tab now opens.
  await inspect(page, 'train landing 360px @200% text', ['#trainLanding .tl-today__primary', '#trainLanding .tl-quick__item', '#trainLanding .tl-section__more']);
  await page.click('#trainLanding [data-action="qs-workout"]');
  await page.waitForSelector('#trainCockpit:not([hidden])');
  await inspect(page, 'workout 360px @200% text', ['#view-workout .day-pill', '#view-workout #startWorkoutBtn', '#view-workout .set-num-lbl[data-action="quick-log"]', '#view-workout .gym-check-wrap', '#view-workout .btn-set-more']);
  await context.close();
} catch (error) {
  failures.push(error?.stack || error?.message || String(error));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('core-ergonomics-check: FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('core-ergonomics-check: PASS — AA semantic contrast, 44px core targets, phone widths and 200% text.');
