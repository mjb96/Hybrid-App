import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export function browserIsRequired(argv = process.argv, env = process.env) {
  return argv.includes('--required') || env.HELYX_BROWSER_REQUIRED === '1';
}

function managedChromiumCandidates() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return [];
  const candidates = [];
  for (const dir of readdirSync(base)) {
    if (dir.startsWith('chromium_headless_shell')) {
      candidates.push(path.join(base, dir, 'chrome-linux', 'headless_shell'));
      candidates.push(path.join(base, dir, 'chrome-mac', 'headless_shell'));
    } else if (dir.startsWith('chromium') && !dir.includes('headless')) {
      candidates.push(path.join(base, dir, 'chrome-linux', 'chrome'));
      candidates.push(path.join(base, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
    }
  }
  return candidates;
}

/**
 * Pin the page's wall clock to a fixed instant.
 *
 * A check whose fixture has to live on "the real weekday" is only green on some
 * days of the week: `finish-review-browser-check` derived its workout day from
 * the clock and threw outright on a Saturday, because the default program
 * prescribes no lifts at the weekend. It went red on `main` for exactly that
 * reason, having passed the same commit hours earlier. Pin the clock instead,
 * and the day the fixture needs is the day the app opens on.
 *
 * Install with `context.addInitScript(pinClock, epochMs)` BEFORE the first
 * navigation. Time does not advance, which no check here depends on.
 *
 * @param {number} epochMs
 */
export function pinClock(epochMs) {
  const RealDate = Date;
  class PinnedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [epochMs])); }
    static now() { return epochMs; }
  }
  // @ts-ignore — deliberate test double
  globalThis.Date = PinnedDate;
}

/**
 * Create a browser-check context that can only load from its local fixture
 * server. Product checks must not turn red because Google Fonts, Sentry, map
 * tiles, or another third-party host is unavailable; equally, a missing local
 * asset must still reach the page as a real 404 and fail the check.
 *
 * The performance baseline deliberately creates its own contexts because it
 * measures online and externally-blocked starts as separate scenarios.
 */
export async function createBrowserContext(browser, options = {}) {
  const context = await browser.newContext(options);
  await context.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isLocalHttp = (requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:')
      && (requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost' || requestUrl.hostname === '::1');

    if (isLocalHttp || (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:')) {
      await route.continue();
      return;
    }

    await route.abort('blockedbyclient');
  });
  return context;
}

/** Resolve the declared Playwright dependency and an installed Chromium. */
export async function resolveChromium(options = {}) {
  const required = options.required ?? browserIsRequired();
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch (error) {
    if (required) throw new Error('Required browser check cannot run: install dependencies with npm ci.', { cause: error });
    console.log('SKIP: Playwright is not installed.');
    return null;
  }

  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    chromium.executablePath(),
    ...managedChromiumCandidates(),
  ].filter(Boolean);
  const executablePath = candidates.find(existsSync);
  if (!executablePath) {
    if (required) {
      throw new Error('Required browser check cannot run: Chromium is missing. Run `npx playwright install chromium`.');
    }
    console.log('SKIP: Chromium is not installed.');
    return null;
  }
  return { chromium, executablePath };
}
