// =============================================================================
// RECOVERY METRIC DETAIL BROWSER CHECK — roadmap 3D
//
// Recovery was the only domain with no inspectable metrics. This drives the
// real route — Recovery → Stats → a signal card → its detail — and pins the
// two obligations unique to this domain:
//
//   • A FALLING resting heart rate must read as an improvement (green), while
//     a falling sleep average must not. Colouring by direction alone would
//     invert half the domain.
//   • Self-reported and device-measured readings state different confidence.
//
// Plus the shared Phase 3C contract rows and the usual 44px/overflow contract.
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
const addDays = (k, n) => { const d = new Date(`${k}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Resting HR improving (60 → 54) while sleep worsens (8h → 7h), so one
// direction must read green and the other amber in the SAME fixture.
function fixture(theme) {
  const wellnessLog = [];
  const restingHR = [];
  const hrv = [];
  for (let i = 0; i < 28; i++) {
    wellnessLog.push({ date: addDays(today, -i), sleep: 7, mood: 4, soreness: 2 });
    restingHR.push({ date: addDays(today, -i), bpm: 54 });
    hrv.push({ date: addDays(today, -i), rmssd: 62 });
  }
  for (let i = 28; i < 56; i++) {
    wellnessLog.push({ date: addDays(today, -i), sleep: 8, mood: 4, soreness: 2 });
    restingHR.push({ date: addDays(today, -i), bpm: 60 });
    hrv.push({ date: addDays(today, -i), rmssd: 55 });
  }
  return {
    schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
    settings: { name: 'Recovery Athlete', theme, weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
    weeks: {}, wellnessLog, healthConnect: { restingHR, hrv },
  };
}

async function openContext(page, context, entity) {
  await page.evaluate(([ctx, ent]) => {
    const cta = document.createElement('button');
    cta.setAttribute('data-action', 'open-analytics');
    cta.setAttribute('data-context', ctx);
    if (ent) { cta.setAttribute('data-entity', ent); cta.setAttribute('data-entity-name', ent); }
    cta.style.display = 'none';
    document.body.appendChild(cta);
    cta.click();
    cta.remove();
  }, [context, entity || '']);
}

const REQUIRED_ROWS = ['Source', 'Confidence', 'How to read it', 'Included history', 'Excluded'];

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

    // The signal cards must exist on Recovery Stats and be real links.
    await openContext(page, 'recovery-score');
    await page.waitForSelector('#analytics-recovery.active #recoverySignalCards', { timeout: 5000 }).catch(() => {
      failures.push(`${width}px: Recovery Stats has no signal cards`);
    });
    const cards = await page.$eval('#recoverySignalCards', (el) => ({
      count: el.querySelectorAll('[data-context="recovery-metric"]').length,
      entities: [...el.querySelectorAll('[data-context="recovery-metric"]')].map((b) => b.getAttribute('data-entity')),
    }));
    console.log(`Recovery signals ${width}px/${theme}:`, JSON.stringify(cards));
    for (const id of ['recovery.sleep', 'recovery.hrv', 'recovery.resting-hr', 'recovery.steps', 'recovery.soreness', 'recovery.mood']) {
      if (!cards.entities.includes(id)) failures.push(`${width}px: no signal card for ${id}`);
    }

    // Resting HR: fell 60 → 54. Lower is better, so this must read favourable.
    await openContext(page, 'recovery-metric', 'recovery.resting-hr');
    await page.waitForSelector('#analytics-recovery-metric.active .metric-detail__header', { timeout: 5000 });
    const rhr = await page.$eval('#analytics-recovery-metric', (el) => ({
      title: el.querySelector('h2')?.textContent?.trim(),
      value: el.querySelector('.metric-detail__value')?.textContent?.trim(),
      arrow: el.querySelector('.metric-comparison strong')?.textContent?.trim(),
      tone: [...(el.querySelector('.metric-comparison')?.classList || [])].find((c) => c.startsWith('metric-comparison--')),
      interpretation: el.querySelector('.metric-detail__header p')?.textContent?.trim(),
      rows: [...el.querySelectorAll('.metric-method dt')].map((d) => d.textContent?.trim()),
      confidence: el.querySelector('.metric-method dd:nth-of-type(1)')?.textContent?.trim(),
      hasChart: !!el.querySelector('.rm-chart svg polyline'),
      evidence: el.querySelectorAll('.metric-evidence-row').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      small: [...el.querySelectorAll('button')].filter((b) => {
        const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 43;
      }).length,
    }));
    console.log(`Resting HR ${width}px/${theme}:`, JSON.stringify(rhr));

    if (rhr.title !== 'Resting Heart Rate') failures.push(`${width}px: wrong title "${rhr.title}"`);
    if (!/54 bpm/.test(rhr.value || '')) failures.push(`${width}px: expected 54 bpm, got "${rhr.value}"`);
    if (!/↓/.test(rhr.arrow || '')) failures.push(`${width}px: expected a downward arrow, got "${rhr.arrow}"`);
    // THE key assertion: down on resting HR is an IMPROVEMENT.
    if (rhr.tone !== 'metric-comparison--good') {
      failures.push(`${width}px: a falling resting HR read as "${rhr.tone}" instead of an improvement`);
    }
    if (!/better/.test(rhr.interpretation || '')) failures.push(`${width}px: interpretation did not call the fall better`);
    for (const row of REQUIRED_ROWS) {
      if (!rhr.rows.includes(row)) failures.push(`${width}px: contract row "${row}" missing from resting HR`);
    }
    if (!rhr.hasChart) failures.push(`${width}px: no trend chart rendered`);
    if (rhr.evidence < 1) failures.push(`${width}px: no contributing readings listed`);
    if (rhr.overflow) failures.push(`${width}px: page-level horizontal overflow`);
    if (rhr.small) failures.push(`${width}px: ${rhr.small} controls below the 44px target`);

    // Sleep: fell 8h → 7h. More sleep is better, so the SAME direction must
    // read as worse here — proving tone comes from the metric, not the arrow.
    await openContext(page, 'recovery-metric', 'recovery.sleep');
    await page.waitForSelector('#analytics-recovery-metric.active .metric-detail__header');
    const sleep = await page.$eval('#analytics-recovery-metric', (el) => ({
      arrow: el.querySelector('.metric-comparison strong')?.textContent?.trim(),
      tone: [...(el.querySelector('.metric-comparison')?.classList || [])].find((c) => c.startsWith('metric-comparison--')),
      confidenceRow: [...el.querySelectorAll('.metric-method div')].map((d) => d.textContent).find((t) => /Confidence/.test(t || '')),
    }));
    console.log(`Sleep ${width}px/${theme}:`, JSON.stringify(sleep));
    if (!/↓/.test(sleep.arrow || '')) failures.push(`${width}px: sleep should also show a fall`);
    if (sleep.tone !== 'metric-comparison--caution') {
      failures.push(`${width}px: a falling sleep average read as "${sleep.tone}" — the same arrow as resting HR must NOT mean the same thing`);
    }
    if (!/Self-reported/.test(sleep.confidenceRow || '')) {
      failures.push(`${width}px: sleep must state self-reported confidence, got "${sleep.confidenceRow}"`);
    }

    // Device metrics state a different confidence than self-reported ones.
    await openContext(page, 'recovery-metric', 'recovery.hrv');
    await page.waitForSelector('#analytics-recovery-metric.active .metric-detail__header');
    const hrvConfidence = await page.$eval('#analytics-recovery-metric', (el) => [...el.querySelectorAll('.metric-method div')]
      .map((d) => d.textContent).find((t) => /Confidence/.test(t || '')));
    if (!/Device-measured/.test(hrvConfidence || '')) {
      failures.push(`${width}px: HRV must state device confidence, got "${hrvConfidence}"`);
    }

    if (errors.length) failures.push(`${width}px: browser errors: ${errors.join(' | ')}`);
    await context.close();
  }

  // A profile with no recovery data at all must be honestly empty.
  {
    const context = await createBrowserContext(browser, { viewport: { width: 390, height: 900 }, timezoneId: TZ, colorScheme: 'dark' });
    await context.addInitScript(([k, v]) => localStorage.setItem(k, v), ['hybrid_engine_v2_state', JSON.stringify({
      schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'current',
      settings: { name: 'New', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon', onboardingComplete: true },
      weeks: {},
    })]);
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await openContext(page, 'recovery-metric', 'recovery.sleep');
    await page.waitForSelector('#analytics-recovery-metric.active .metric-detail__header');
    const empty = await page.$eval('#analytics-recovery-metric', (el) => ({
      value: el.querySelector('.metric-detail__value')?.textContent?.trim(),
      hasComparison: !!el.querySelector('.metric-comparison'),
      text: el.textContent || '',
    }));
    console.log('Recovery empty profile:', JSON.stringify({ value: empty.value, hasComparison: empty.hasComparison }));
    if (empty.value !== '—') failures.push(`empty profile: expected an em dash, got "${empty.value}"`);
    if (empty.hasComparison) failures.push('empty profile: rendered a comparison with nothing to compare');
    if (/NaN|Infinity|undefined/.test(empty.text)) failures.push('empty profile: rendered NaN/Infinity/undefined');
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1);
}
console.log('Recovery metric detail browser contract passed.');
