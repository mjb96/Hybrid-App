import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  loadWorkflowSources,
  validateWorkflowSources,
} from '../scripts/verify-workflow-gates.mjs';

const sources = loadWorkflowSources();

test('actual publication workflows satisfy every required gate', () => {
  assert.deepEqual(validateWorkflowSources(sources), []);
});

test('failure injection: a web verification failure cannot be removed silently', () => {
  const broken = { ...sources, verify: sources.verify.replace('run: npm run verify', 'run: echo bypassed') };
  assert.match(validateWorkflowSources(broken).join('\n'), /full JS verification/);
});

test('failure injection: npm verify cannot drop a required JS gate', () => {
  const pkg = JSON.parse(sources.packageJson);
  for (const gate of ['typecheck', 'precache:check', 'workflow:check', 'npm test', 'smoke']) {
    const brokenPackage = structuredClone(pkg);
    brokenPackage.scripts.verify = brokenPackage.scripts.verify.replace(gate, 'removed');
    const broken = { ...sources, packageJson: JSON.stringify(brokenPackage) };
    assert.notDeepEqual(validateWorkflowSources(broken), [], gate);
  }
});

test('failure injection: a skipped browser installation/check is rejected', () => {
  const noBrowser = { ...sources, verify: sources.verify
    .replace('run: npx playwright install --with-deps chromium', 'run: echo skipped')
    .replace('run: npm run browser:verify', 'run: echo skipped') };
  assert.match(validateWorkflowSources(noBrowser).join('\n'), /Chromium/);
  assert.match(validateWorkflowSources(noBrowser).join('\n'), /real-browser/);
});

test('failure injection: missing Android test, lint, or APK task is rejected', () => {
  for (const task of ['testDebugUnitTest', 'lintDebug', 'assembleDebug']) {
    const broken = { ...sources, verify: sources.verify.replace(task, '') };
    assert.notDeepEqual(validateWorkflowSources(broken), [], task);
  }
});

test('failure injection: Pages and signed artifacts cannot drop needs: verify', () => {
  const pages = { ...sources, pages: sources.pages.replace('    needs: verify', '') };
  const release = { ...sources, release: sources.release.replace('    needs: verify', '') };
  assert.match(validateWorkflowSources(pages).join('\n'), /Pages deploy must depend/);
  assert.match(validateWorkflowSources(release).join('\n'), /Signed release build must depend/);
});
