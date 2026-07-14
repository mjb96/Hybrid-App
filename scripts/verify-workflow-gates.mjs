import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

function jobBlock(source, name) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) return '';
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) { end = index; break; }
  }
  return lines.slice(start, end).join('\n');
}

function requireText(errors, source, pattern, message) {
  if (!pattern.test(source)) errors.push(message);
}

export function validateWorkflowSources({ verify, pages, release, packageJson }) {
  const errors = [];
  let pkg = {};
  try { pkg = JSON.parse(packageJson); }
  catch { errors.push('package.json must remain valid JSON'); }
  const verifyScript = pkg.scripts?.verify || '';
  const browserScript = pkg.scripts?.['browser:verify'] || '';
  for (const required of ['typecheck', 'precache:check', 'workflow:check', 'npm test', 'smoke']) {
    if (!verifyScript.includes(required)) errors.push(`npm run verify must include ${required}`);
  }
  if (!browserScript.includes('scripts/run-browser-checks.mjs')) {
    errors.push('browser:verify must run the required browser-check runner');
  }
  if (!pkg.devDependencies?.playwright || /^[~^]/.test(pkg.devDependencies.playwright)) {
    errors.push('Playwright must be an exact pinned dev dependency');
  }
  requireText(errors, verify, /^\s+workflow_call:\s*$/m, 'verify.yml must be reusable via workflow_call');

  const web = jobBlock(verify, 'web');
  const android = jobBlock(verify, 'android');
  requireText(errors, web, /run:\s*npm ci\b/, 'web verification must install the lockfile with npm ci');
  requireText(errors, web, /npx playwright install --with-deps chromium/, 'web verification must install Chromium');
  requireText(errors, web, /run:\s*npm run verify\b/, 'web verification must run the full JS verification');
  requireText(errors, web, /run:\s*npm run browser:verify\b/, 'web verification must require real-browser checks');
  requireText(errors, android, /run:\s*npm ci\b/, 'Android verification must install locked web dependencies');
  requireText(errors, android, /testDebugUnitTest/, 'Android verification must run JVM tests');
  requireText(errors, android, /lintDebug/, 'Android verification must run lint');
  requireText(errors, android, /assembleDebug/, 'Android verification must assemble a debug APK');

  const pagesVerify = jobBlock(pages, 'verify');
  const deploy = jobBlock(pages, 'deploy');
  requireText(errors, pagesVerify, /uses:\s*\.\/\.github\/workflows\/verify\.yml/, 'Pages must call required verification');
  requireText(errors, deploy, /needs:\s*verify/, 'Pages deploy must depend on verification');
  requireText(errors, deploy, /actions\/deploy-pages@/, 'Pages deploy job is missing its publish action');

  const releaseVerify = jobBlock(release, 'verify');
  const build = jobBlock(release, 'build');
  requireText(errors, releaseVerify, /uses:\s*\.\/\.github\/workflows\/verify\.yml/, 'Release must call required verification');
  requireText(errors, build, /needs:\s*verify/, 'Signed release build must depend on verification');
  requireText(errors, build, /assembleRelease bundleRelease/, 'Signed release must build APK and AAB artifacts');

  return errors;
}

export function loadWorkflowSources(root = ROOT) {
  const workflowDir = resolve(root, '.github/workflows');
  for (const retired of ['test.yml', 'android.yml']) {
    if (existsSync(resolve(workflowDir, retired))) {
      throw new Error(`${retired} must be retired; verify.yml owns required checks`);
    }
  }
  return {
    verify: readFileSync(resolve(workflowDir, 'verify.yml'), 'utf8'),
    pages: readFileSync(resolve(workflowDir, 'pages.yml'), 'utf8'),
    release: readFileSync(resolve(workflowDir, 'release-aab.yml'), 'utf8'),
    packageJson: readFileSync(resolve(root, 'package.json'), 'utf8'),
  };
}

function main() {
  const errors = validateWorkflowSources(loadWorkflowSources());
  if (errors.length) {
    console.error('Workflow gate verification failed:\n- ' + errors.join('\n- '));
    process.exit(1);
  }
  console.log('Workflow gates verified: Pages and signed releases require web + Android checks.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
