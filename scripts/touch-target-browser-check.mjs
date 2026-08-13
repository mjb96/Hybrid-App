// =============================================================================
// TOUCH TARGETS AND ACCESSIBLE NAMES — measured in the REAL app, not in markup.
//
// `tests/accessibility.test.js` greps index.html. That only ever sees the static
// shell: this app renders most of its controls from JS template literals, and
// every offender this check was written against lived there — a 5×5 carousel
// dot, a 19px metric tab, a 28px week arrow, an 11px "See all" link. None of
// them appear in index.html at all.
//
// So: drive the app, walk the ACTIVE view on each destination, and measure what
// a finger actually hits.
//
// Two measurement details matter, and both produced false results before they
// were handled:
//
//   • VISIBILITY. Every view stays in the DOM, so a naive querySelectorAll
//     counts the Settings panel's inputs on all four destinations. The first
//     run reported 373 controls and 83 failures; 235 of those controls were not
//     on screen. Filtering to `checkVisibility()` plus the active view leaves
//     138 real ones.
//
//   • HIT AREA ≠ PAINTED BOX. A `.hit-target` control keeps its small visual
//     size and grows a centred ::after that takes the taps. Measuring
//     getBoundingClientRect alone reports those as failures forever.
//
// Accessible name resolution follows what a screen reader would do — aria-label,
// aria-labelledby, title, a `for=` label, a wrapping label, then text — because
// checking aria-label alone flagged every correctly-labelled checkbox in
// Settings.
// =============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserContext, resolveChromium, pinClock } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = process.argv.includes('--required');
const runtime = await resolveChromium();
if (!runtime) process.exit(required ? 1 : 0);
const { chromium, executablePath } = runtime;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
};
const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').split('?')[0] === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const rel = (req.url || '/') === '/' ? 'index.html' : decodeURIComponent((req.url || '').split('?')[0]).replace(/^\//, '');
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(`${ROOT}${path.sep}`) && file !== path.join(ROOT, 'index.html')) throw new Error('unsafe path');
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;

const TZ = 'Australia/Sydney';
// PINNED — the Home surface routes by calendar day, so an unpinned clock would
// measure a different set of controls depending on the weekday CI ran.
const TODAY = '2026-08-03';   // a Monday in Australia/Sydney
const CLOCK = Date.parse(`${TODAY}T09:00:00+10:00`);
const MIN = 44;

const STORAGE_KEY = 'hybrid_engine_v2_state';
const fixture = {
  schemaVersion: 5, currentWeek: '1', activeProgramId: 'hybrid_engine', activeActivationId: 'act1',
  settings: {
    name: 'A11y', theme: 'dark', weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon',
    onboardingComplete: true, fitnessGoal: 'hybrid', fitnessLevel: 'intermediate', equipmentTier: 'gym',
  },
  activations: [{ id: 'act1', programId: 'hybrid_engine', startWeek: 1, status: 'active', startedAt: new Date(CLOCK).toISOString() }],
  weeks: {
    '1': {
      activationId: 'act1', dates: { mon: TODAY }, gymStats: { mon: { time: '01:02' } },
      lifts: { mon: { 'Barbell Bench Press': [{ w: '100', r: '5', c: true }] } },
      sessionStatus: {}, liftOrder: {}, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, bodyWeight: {}, liftMeta: {},
    },
  },
  programLibrary: { bookmarks: [], completions: [], recentlyViewed: [], personalRatings: {}, activeFilters: {} },
  loadMetrics: { atl: 0, ctl: 0 }, wellnessLog: [], bodyWeightLog: [],
  healthConnect: { connected: false, hrv: [], restingHR: [], sleep: [], steps: [], vo2max: [] },
  hybridScore: { history: [], xp: 0, lastRecordedDate: null },
};

// Controls whose 44px shortfall is GEOMETRIC, not an oversight. Each needs the
// arithmetic that makes 44px impossible, not a preference. This list may only
// shrink; `tests/touch_target_exemptions.test.js` fails if an entry stops being
// reachable from this check.
const EXEMPT = [
  {
    match: (c) => c.cls.includes('hero-dot-btn'),
    // Three carousel dots, 5px wide with a 5px gap: a 10px pitch. A 44px-wide
    // hit area would overlap both neighbours, and the last dot painted would
    // swallow the taps meant for the other two — strictly worse than a small
    // target. Expanded to the full 44px HEIGHT and its own pitch in width.
    why: 'carousel dot pitch is 10px; a 44px width would make neighbours unreachable',
    minW: 10, minH: 44,
  },
  {
    match: (c) => c.cls.includes('wfg-bb'),
    // Seven day bars share the chart's inner width: at 390px that is ~34px per
    // bar and no layout change makes seven 44px columns fit. Each bar is the
    // full 120px height of the plot, so the column is a comfortable target.
    why: 'one of 7 day columns in a 390px chart; full plot height is the target',
    minW: 30, minH: 44,
  },
  {
    match: (c) => c.mapCredit,
    // Leaflet's required attribution link, injected into the live-run map. It is
    // a 14px credit line, not a control the athlete is meant to operate, and the
    // map is 220px tall — a 44px-tall credit bar would cover a fifth of it. The
    // zoom buttons in the same map are NOT exempt and were resized to 44×44.
    why: 'third-party map credit link, 14px line over a 220px map; not an operable control',
    minW: 44, minH: 14,
  },
];

const MEASURE = () => {
  const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [data-action], [tabindex]:not([tabindex="-1"])';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const view = el.closest('.view-container');
    if (view && !view.classList.contains('active')) continue;
    // Bring it on screen BEFORE probing. elementFromPoint only answers for the
    // viewport, and most of these controls start below the fold — without this
    // every probe returns null, the check silently falls back to the CSS box,
    // and it is measuring declarations again instead of reachability. (The
    // carousel dots sit at y≈1737 on a 390px×844px screen.)
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // COVERED controls are not this surface's controls. While onboarding is up,
    // Home is still `.view-container.active` underneath it, so its week arrows
    // were being measured and — correctly — found unreachable through the
    // overlay. That is not a defect in the arrows; they are simply not on offer
    // right now. If the control's own centre resolves to an element that is
    // neither it, its descendant, nor its ancestor, something is on top of it.
    {
      const midX = r.left + r.width / 2;
      const midY = r.top + r.height / 2;
      const onScreen = midX >= 0 && midY >= 0 && midX <= innerWidth && midY <= innerHeight;
      const atCentre = onScreen ? document.elementFromPoint(midX, midY) : null;
      if (atCentre && !el.contains(atCentre) && !atCentre.contains(el)) continue;
    }

    const after = getComputedStyle(el, '::after');
    const grown = after.content !== 'none';
    const cssW = grown ? Math.max(r.width, parseFloat(after.width) || 0) : r.width;
    const cssH = grown ? Math.max(r.height, parseFloat(after.height) || 0) : r.height;

    // What the CSS DECLARES is not what the finger reaches. A hit area inside an
    // `overflow: hidden` ancestor is cropped, and one that runs under a later
    // sibling is stolen — in both cases the computed ::after box still reports
    // its full size. (The carousel dots sit in a clipped 220px hero: the CSS
    // said 44px tall, elementFromPoint said 34.5.)
    // So probe: shrink the claimed box until every edge midpoint actually
    // resolves to this control.
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // A point outside the viewport is UNKNOWN, not unreachable: the In Focus
    // charts sit in a horizontal scroller, so one pair of week arrows lives at
    // x≈615 on a 390px screen and every probe against it returns null. Treating
    // that as a failure condemned a control the user reaches by scrolling.
    // Only points that are actually on screen can testify.
    const reaches = (w, h) => {
      const pts = [
        [cx, cy - h / 2 + 1], [cx, cy + h / 2 - 1],
        [cx - w / 2 + 1, cy], [cx + w / 2 - 1, cy],
      ];
      const onScreen = pts.filter(([x, y]) => x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight);
      if (!onScreen.length) return true;
      return onScreen.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return !!hit && (hit === el || el.contains(hit));
      });
    };
    let hitW = cssW;
    let hitH = cssH;
    while ((hitW > r.width || hitH > r.height) && !reaches(hitW, hitH)) {
      hitW = Math.max(r.width, hitW - 2);
      hitH = Math.max(r.height, hitH - 2);
    }

    const labelled = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
    const wrapping = el.closest('label');
    const described = el.getAttribute('aria-labelledby');
    const name = el.getAttribute('aria-label')
      || (described && (document.getElementById(described)?.textContent || '').trim())
      || el.getAttribute('title')
      || (labelled?.textContent || '').replace(/\s+/g, ' ').trim()
      || (wrapping && wrapping !== el ? (wrapping.textContent || '').replace(/\s+/g, ' ').trim() : '')
      || (el.textContent || '').replace(/\s+/g, ' ').trim();

    out.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: typeof el.className === 'string' ? el.className : '',
      action: el.getAttribute('data-action') || el.getAttribute('data-wfg-action') || '',
      w: Math.round(hitW * 10) / 10,
      h: Math.round(hitH * 10) / 10,
      name: name.slice(0, 40),
      // Leaflet injects its own credit link into the map; it has no class of its
      // own, so the exemption below needs the container to identify it.
      mapCredit: !!el.closest('.leaflet-control-attribution'),
    });
  }
  return out;
};

const failures = [];
const fail = (m) => { failures.push(m); console.error(`FAIL: ${m}`); };
const describe = (c) => `[${c.surface}] ${c.tag}${c.id ? '#' + c.id : ''}${c.cls ? '.' + c.cls.split(/\s+/)[0] : ''}${c.action ? ' {' + c.action + '}' : ''}`;

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
try {
  // Geolocation is stubbed rather than mocked through Playwright's own API, so
  // the live run starts from a fix this check chose. Same shape as
  // active-run-browser-check.mjs.
  const GPS_STUB = () => {
    let cb = null;
    const base = { lat: -33.865, lng: 151.2095, t: Date.now() };
    /** @type {any} */ (window).__gpsFeed = (i, acc) => {
      if (!cb) return false;
      cb({ coords: { latitude: base.lat + i * 0.0009, longitude: base.lng, accuracy: acc }, timestamp: base.t + i * 20000 });
      return true;
    };
    navigator.geolocation.watchPosition = (success) => { cb = success; return 1; };
    navigator.geolocation.clearWatch = () => { cb = null; };
  };

  const errors = [];
  const newContext = async (state) => {
    const ctx = await createBrowserContext(browser, {
      viewport: { width: 390, height: 844 }, timezoneId: TZ, colorScheme: 'dark',
      permissions: ['geolocation'], geolocation: { latitude: -33.865, longitude: 151.2095 },
    });
    if (state) await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, state]);
    await ctx.addInitScript(pinClock, CLOCK);
    await ctx.addInitScript(GPS_STUB);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(BASE, { waitUntil: 'networkidle' });
    return { ctx, page: p };
  };

  const { ctx: context, page } = await newContext(JSON.stringify(fixture));

  const surfaces = [
    ['home', null],
    ['train', '.nav-item[data-target="workout"]'],
    ['progress', '.nav-item[data-target="analytics"]'],
    ['plans', '.nav-item[data-target="program"]'],
  ];

  const all = [];
  const snapOn = async (target, surface) => {
    const rows = await target.evaluate(MEASURE);
    if (!rows.length) fail(`${surface} rendered no interactive controls — the walk is measuring nothing`);
    for (const r of rows) all.push({ surface, ...r });
    console.log(`  ${surface}: ${rows.length} controls`);
    return rows.length;
  };
  const snap = (surface) => snapOn(page, surface);

  for (const [surface, sel] of surfaces) {
    if (sel) {
      await page.click(sel);
      await page.waitForSelector('.view-container.active', { timeout: 8000 });
      await page.waitForTimeout(600);
    }
    await snap(surface);
  }

  // ---- In-session cockpit and the modal surfaces above it -------------------
  // The four nav destinations are where the app STARTS. The cockpit is where an
  // athlete actually spends a session, and it holds the densest controls in the
  // app — the set rows, the run card, the swap and add-exercise pickers. None of
  // it is reachable from the walk above, and both accessible-name defects found
  // here lived in it: the reps input in every set row was unnamed while the
  // weight input beside it was labelled, and the completion checkbox's only
  // "name" was a ✓ glyph from its wrapping label.
  await page.click('.nav-item[data-target="home"]').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#homePrimaryCta');
  await page.waitForSelector('#view-workout .cockpit-ex-name', { timeout: 10000 });
  await page.waitForTimeout(600);
  await snap('cockpit');

  // Expand collapsed cards so their set rows are measured, not just the headers.
  for (const toggle of (await page.$$('#cockpitExercisesContainer [data-action="toggle-accordion"]')).slice(0, 4)) {
    await toggle.click().catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(400);
  await snap('cockpit-expanded');

  // Each modal must actually OPEN before it is measured — a selector that never
  // matches would silently contribute nothing and still let the check pass, so
  // every one of these is asserted rather than best-effort.
  const openModal = async (surface, opener, ready) => {
    await page.evaluate((sel) => document.querySelector(sel)?.click(), opener);
    try {
      await page.waitForSelector(ready, { timeout: 6000 });
    } catch {
      fail(`${surface} did not open via ${opener} — the check is not measuring it`);
      return;
    }
    await page.waitForTimeout(400);
    await snap(surface);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  };

  await openModal('swap-exercise', '[data-action="swap-exercise"]', '#swapExerciseModal.active');
  await openModal('add-exercise', '[data-action="open-add-exercise"]', '#addExerciseModal.active');
  await openModal('exercise-detail', '[data-action="el-info"]', '#exerciseDetailModal.active');
  await openModal('clear-log', '[data-action="open-reset-modal"]', '#confirmResetModal.active');

  // ---- The LIVE run --------------------------------------------------------
  // The one surface operated while the athlete is moving, and the only one whose
  // controls are injected by a third party: Leaflet ships its zoom buttons at
  // 30×30 and they never appear in this repo's markup, so nothing static could
  // have caught them.
  {
    const started = await page.evaluate(() => {
      const b = /** @type {any} */ (document.querySelector('[data-action="gps-start"]'));
      if (!b) return false;
      b.click();
      return true;
    });
    if (!started) fail('live run: no [data-action="gps-start"] on the cockpit run card');
    await page.waitForTimeout(500);
    await page.evaluate(() => /** @type {any} */ (window).__gpsFeed?.(0, 8));
    await page.waitForTimeout(300);
    await page.evaluate(() => /** @type {any} */ (window).__gpsFeed?.(1, 8));
    await page.waitForTimeout(600);
    const live = await page.evaluate(() => {
      const p = document.getElementById('gpsLivePanel');
      return !!p && getComputedStyle(p).display !== 'none';
    });
    if (!live) fail('live run: the live panel never appeared, so its controls are unmeasured');
    await snap('live-run');
  }
  await context.close();

  // ---- Onboarding ----------------------------------------------------------
  // Needs its own context: it only renders with no saved state, which is exactly
  // why it sat outside every other walk.
  {
    const { ctx, page: obPage } = await newContext(null);
    await obPage.waitForTimeout(1200);
    const showing = await obPage.evaluate(() => !!document.querySelector('.ob-step, .ob-cta'));
    if (!showing) fail('onboarding did not render on a fresh profile — its controls are unmeasured');
    const before = all.length;
    await snapOn(obPage, 'onboarding');
    if (all.length === before) fail('onboarding measured no controls');
    await ctx.close();
  }

  // Sanity: if the fixture stops reaching the real surfaces this check would
  // pass by measuring an empty app. ~875 today; the floor only catches collapse.
  if (all.length < 800) fail(`expected the full control surface, measured only ${all.length}`);

  const seen = new Set();
  let exempted = 0;
  for (const c of all) {
    const exempt = EXEMPT.find((e) => e.match(c));
    const minW = exempt ? exempt.minW : MIN;
    const minH = exempt ? exempt.minH : MIN;
    if (exempt) exempted++;

    if (c.w < minW || c.h < minH) {
      const key = `size|${describe(c)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fail(`${describe(c)} is ${c.w}×${c.h}, below ${minW}×${minH} — "${c.name}"`
        + (exempt ? ` (exempt floor: ${exempt.why})` : ''));
    }
    if (!c.name) {
      const key = `name|${describe(c)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fail(`${describe(c)} has no accessible name`);
    }
  }

  console.log(`\n  measured ${all.length} visible controls · ${exempted} on a documented geometric floor`);
  if (errors.length) fail(`browser errors: ${errors.join(' | ')}`);
  await context.close();
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\nTouch-target check failed (${failures.length}).`);
  console.error('Give the control `min-height: var(--touch-target)`, or `.hit-target` when its');
  console.error('visual size is deliberate (see the block in css/styles.css). Add to EXEMPT only');
  console.error('with the arithmetic showing 44px is geometrically impossible.');
  process.exit(1);
}
console.log('\nTouch-target and accessible-name check passed.');
