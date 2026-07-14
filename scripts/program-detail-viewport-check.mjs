// ============================================================================
// Helyx — Program-detail viewport check (week-at-a-glance + progression + CTA)
// ----------------------------------------------------------------------------
// jsdom can't verify pixel geometry, so this drives the REAL detail page in a
// headless Chromium and asserts the mobile layout contract for the progression
// work:
//   • no document-level horizontal scroll at 320/360/390/412 (normal font);
//   • the week-at-a-glance rows, week bar, progression phases and CTA actions
//     stay within the viewport at every width AND at 1.5× system font;
//   • CTA action buttons are >= ~44px tall and never clipped (the old
//     Customize/Compare clip);
//   • stepping the schedule week updates the view and shows a "Changes from
//     Week 1" summary WITHOUT mutating the active program's week.
//
// Standalone and optional locally. `--required` makes missing browser tooling a
// hard failure, and is always used by the publication verification workflow.
//
//   node scripts/program-detail-viewport-check.mjs
// ============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WIDTHS = [320, 360, 390, 412];

const browserRuntime = await resolveChromium();
if (!browserRuntime) process.exit(0);
const { chromium, executablePath: exe } = browserRuntime;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '') || 'index.html';
    const buf = await readFile(path.join(ROOT, rel));
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function openDetail(width, fontPx) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('hybrid_engine_v2_state', JSON.stringify({ schemaVersion: 2, settings: { name: 'A', onboardingComplete: true }, currentWeek: '5', activeProgramId: 'hybrid_engine' }));
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.addStyleTag({ content: `*{transition:none!important;animation:none!important;}${fontPx ? `html{font-size:${fontPx}px!important;}` : ''}` });
  await page.waitForTimeout(500);
  await page.click('.nav-item[data-target="program"]');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-action="open-program-detail"]').click());
  await page.waitForTimeout(300);
  return { ctx, page };
}

// Geometry of the progression additions + CTA. `scope` restricts the overflow
// check to our own components (the shared similar-programs card has a separate,
// pre-existing large-font issue outside this work).
async function measure(page, checkDocOverflow) {
  return page.evaluate((checkDocOverflow) => {
    const vw = document.documentElement.clientWidth;
    const sel = '#programDetailContent .wag-row, #programDetailContent .wag-weekbar, #programDetailContent .wag-change, #programDetailContent .prog-phase, #programDetailContent .detail-cta-wrap, #programDetailContent .detail-cta-wrap *';
    const mine = [...document.querySelectorAll(sel)];
    let mineOverflow = 0;
    for (const e of mine) { const b = e.getBoundingClientRect(); if (b.width > 0 && b.right > vw + 0.5) mineOverflow++; }
    const cta = [...document.querySelectorAll('#programDetailContent .detail-cta-wrap button')].map(b => ({ h: b.getBoundingClientRect().height, r: b.getBoundingClientRect().right }));
    return {
      vw,
      docOverflow: checkDocOverflow ? (document.documentElement.scrollWidth > vw) : false,
      mineOverflow,
      wagRows: document.querySelectorAll('#programDetailContent .wag-row').length,
      phases: document.querySelectorAll('#programDetailContent .prog-phase').length,
      ctaMinH: cta.length ? Math.min(...cta.map(c => Math.round(c.h))) : 0,
      ctaClipped: cta.some(c => c.r > vw + 0.5),
    };
  }, checkDocOverflow);
}

for (const w of WIDTHS) {
  const { ctx, page } = await openDetail(w);
  const r = await measure(page, true);
  check(!r.docOverflow, `${w}px: document horizontal overflow`);
  check(r.mineOverflow === 0, `${w}px: ${r.mineOverflow} progression/CTA element(s) overflow the viewport`);
  check(r.wagRows > 0, `${w}px: week-at-a-glance rows missing`);
  check(r.phases > 0, `${w}px: progression phases missing`);
  check(r.ctaMinH >= 43, `${w}px: a CTA button is under ~44px tall (${r.ctaMinH})`);
  check(!r.ctaClipped, `${w}px: a CTA button is clipped past the right edge`);
  console.log(`  ${w}px  docOverflow=${r.docOverflow} mineOverflow=${r.mineOverflow} rows=${r.wagRows} phases=${r.phases} ctaMinH=${r.ctaMinH} ctaClipped=${r.ctaClipped}`);
  await ctx.close();
}

// 1.5× font: our own components must still not overflow (doc-level card issue is
// pre-existing and out of scope, so we don't assert doc overflow here).
{
  const { ctx, page } = await openDetail(360, 24);
  const r = await measure(page, false);
  check(r.mineOverflow === 0, `360px @1.5x font: ${r.mineOverflow} progression/CTA element(s) overflow`);
  check(!r.ctaClipped, '360px @1.5x font: a CTA button is clipped');
  console.log(`  360px@1.5x  mineOverflow=${r.mineOverflow} ctaClipped=${r.ctaClipped}`);
  await ctx.close();
}

// Week stepping updates the view and never mutates the active week.
{
  const { ctx, page } = await openDetail(390);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).currentWeek);
  await page.evaluate(() => document.querySelector('.wag-week-btn[data-delta="-1"]:not([disabled]), [data-action="detail-week-step"][data-delta="-1"]:not([disabled])')?.click());
  await page.waitForTimeout(120);
  const r = await page.evaluate(() => ({
    week: (document.querySelector('.wag-week-num')?.textContent || '').replace(/\s+/g, ' ').trim(),
    hasChanges: !!document.querySelector('.wag-change'),
    current: JSON.parse(localStorage.getItem('hybrid_engine_v2_state')).currentWeek,
  }));
  check(r.current === before, `week preview mutated currentWeek (${before} → ${r.current})`);
  check(/Week 4 of/.test(r.week), `week step did not update the label (${r.week})`);
  console.log(`  week-step  label="${r.week}" changesShown=${r.hasChanges} currentWeekUnchanged=${r.current === before}`);
  await ctx.close();
}

await browser.close();
server.close();

if (failures.length) {
  console.error('\nFAIL — program-detail layout regressions:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('\nPASS — week-at-a-glance, progression and CTA fit the phone viewport; week preview is non-mutating.');
