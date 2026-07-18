// ============================================================================
// Helyx — Program-day preview viewport check (real-browser geometry)
// ----------------------------------------------------------------------------
// jsdom/node tests can't verify pixel geometry, so this drives the REAL app in
// a headless Chromium and asserts the layout contract that the day-preview
// bottom-sheet must satisfy on a phone:
//
//   • no horizontal document overflow at 320/360/390/412 px;
//   • no prescription cell (esp. the Reps column) spills past the viewport,
//     including with a long exercise name + long reps value and at 1.5× font;
//   • the sheet sits within the viewport and its header is visible;
//   • the header stays visible while the body scrolls (independent scroll);
//   • closing restores the exact prior document scroll position.
//
// Standalone and optional locally. `--required` (used by CI) makes a missing
// Playwright/Chromium installation fail instead of producing a false green.
//
//   node scripts/preview-viewport-check.mjs
//
// Exit code 0 = pass (or skipped). Non-zero = a layout regression.
// ============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROGRAM_ID = 'hybridhq_foundations'; // a catalog program with a STRENGTH grid day
const WIDTHS = [320, 360, 390, 412];

const browserRuntime = await resolveChromium();
if (!browserRuntime) process.exit(0);
const { chromium, executablePath: exe } = browserRuntime;

// ── Tiny static server for the app root ──────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = url === '/' ? 'index.html' : url.replace(/^\//, '');
    const buf = await readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function openSheet(page, { longContent = false } = {}) {
  return page.evaluate(async ({ pid, longContent }) => {
    document.body.style.minHeight = '3000px';
    window.scrollTo(0, 1400);
    const mod = await import('./js/programs/detail.js');
    mod.openDayPreviewModal('mon', pid, 1);
    if (longContent) {
      const grid = document.querySelector('#wpmSheet .wpm-strength-grid');
      if (grid) {
        const row = document.createElement('div');
        row.className = 'wpm-grid-row';
        row.innerHTML = '<span class="wpm-ex-name">Dumbbell Bulgarian Split Squat (Rear Foot Elevated)</span>' +
                        '<span class="wpm-ex-val">4</span><span class="wpm-ex-val">8–12 each side</span>';
        grid.appendChild(row);
      }
    }
    const vw = innerWidth, vh = innerHeight;
    const sheet = document.getElementById('wpmSheet');
    const header = document.querySelector('#wpmSheet .bottom-sheet-header');
    const sr = sheet.getBoundingClientRect(), hr = header.getBoundingClientRect();
    const cells = [...document.querySelectorAll('#wpmSheet .wpm-grid-row > span, #wpmSheet .wpm-grid-header > span')];
    let cellOverflow = 0;
    for (const c of cells) if (c.getBoundingClientRect().right > vw + 0.5) cellOverflow++;
    return {
      vw,
      horizDocOverflow: document.documentElement.scrollWidth > vw,
      sheetWithinViewport: sr.top >= -0.5 && sr.bottom <= vh + 0.5,
      headerVisible: hr.top >= -0.5 && hr.bottom <= vh + 0.5,
      cellOverflow,
    };
  }, { pid: PROGRAM_ID, longContent });
}

async function newPage(width, height, extraCss = '') {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('hybrid_engine_v2_state', JSON.stringify({
      schemaVersion: 4, currentWeek: '1', activeProgramId: 'hybrid_engine',
      onboardingComplete: true, settings: { weightUnit: 'kg', distanceUnit: 'km' }, weeks: {},
    }));
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  // Settle geometry: disable transitions so we never measure mid-animation.
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;}' + extraCss });
  await page.waitForTimeout(300);
  return { ctx, page };
}

// 1) Grid + sheet fit across phone widths, with adverse content.
for (const w of WIDTHS) {
  const { ctx, page } = await newPage(w, 720);
  const r = await openSheet(page, { longContent: true });
  check(!r.horizDocOverflow, `${w}px: horizontal document overflow`);
  check(r.cellOverflow === 0, `${w}px: ${r.cellOverflow} prescription cell(s) clipped past the right edge`);
  check(r.sheetWithinViewport, `${w}px: sheet not within the viewport`);
  check(r.headerVisible, `${w}px: sheet header not visible`);
  console.log(`  ${w}px  overflow=${r.horizDocOverflow} cellOverflow=${r.cellOverflow} header=${r.headerVisible}`);
  await ctx.close();
}

// 2) Large system font (1.5×) at 360px.
{
  const { ctx, page } = await newPage(360, 720, ' html{font-size:24px!important;}');
  const r = await openSheet(page, { longContent: true });
  check(!r.horizDocOverflow, '360px @1.5x font: horizontal document overflow');
  check(r.cellOverflow === 0, '360px @1.5x font: reps clipped');
  console.log(`  360px@1.5x  overflow=${r.horizDocOverflow} cellOverflow=${r.cellOverflow}`);
  await ctx.close();
}

// 3) Header stays visible while the body scrolls (tall day).
{
  const { ctx, page } = await newPage(360, 520);
  const r = await page.evaluate(async (pid) => {
    const mod = await import('./js/programs/detail.js');
    mod.openDayPreviewModal('mon', pid, 1);
    const grid = document.querySelector('#wpmSheet .wpm-strength-grid');
    for (let i = 0; i < 24; i++) {
      const row = document.createElement('div');
      row.className = 'wpm-grid-row';
      row.innerHTML = `<span class="wpm-ex-name">Exercise ${i}</span><span class="wpm-ex-val">4</span><span class="wpm-ex-val">8–10</span>`;
      grid.appendChild(row);
    }
    const body = document.getElementById('wpmBody');
    body.scrollTop = 400;
    const hr = document.querySelector('#wpmSheet .bottom-sheet-header').getBoundingClientRect();
    return { headerVisible: hr.top >= -0.5 && hr.bottom <= innerHeight + 0.5, bodyScrolled: body.scrollTop > 0 };
  }, PROGRAM_ID);
  check(r.bodyScrolled, 'tall day: body did not scroll independently');
  check(r.headerVisible, 'tall day: header scrolled out of view');
  console.log(`  tall-day  bodyScrolled=${r.bodyScrolled} headerVisible=${r.headerVisible}`);
  await ctx.close();
}

// 4) Close restores the exact prior document scroll position.
{
  const { ctx, page } = await newPage(360, 720);
  const r = await page.evaluate(async (pid) => {
    const mod = await import('./js/programs/detail.js');
    document.body.style.minHeight = '3000px';
    window.scrollTo(0, 1234);
    mod.openDayPreviewModal('mon', pid, 1);
    const lockedTop = document.body.style.top;
    mod.closeDayPreviewModal();
    return { lockedTop, restored: window.scrollY };
  }, PROGRAM_ID);
  check(r.lockedTop === '-1234px', `lock offset wrong: ${r.lockedTop}`);
  check(r.restored === 1234, `scroll not restored: ${r.restored}`);
  console.log(`  close  lockedTop=${r.lockedTop} restored=${r.restored}`);
  await ctx.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.error('\nFAIL — layout regressions:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('\nPASS — day-preview sheet + prescription grid fit the phone viewport across all cases.');
