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
