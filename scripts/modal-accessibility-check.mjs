import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './browser-runtime.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = await resolveChromium();
if (!runtime) process.exit(0);
const { chromium, executablePath } = runtime;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
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
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem('hybrid_engine_v2_state', JSON.stringify({
      schemaVersion: 4,
      currentWeek: '1',
      activeProgramId: 'hybrid_engine',
      onboardingComplete: true,
      settings: { name: 'Keyboard Athlete', weightUnit: 'kg', distanceUnit: 'km' },
      weeks: {},
    }));
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__onAndroidBack === 'function');

  const closed = await page.$$eval('[data-modal-root]', (roots) => roots.map((root) => ({
    id: root.id,
    inert: root.hasAttribute('inert'),
    hidden: root.getAttribute('aria-hidden'),
    modalClaims: root.matches('[aria-modal="true"]') || !!root.querySelector('[aria-modal="true"]'),
  })));
  check(closed.length >= 17, `expected complete modal inventory, got ${closed.length}`);
  for (const item of closed) {
    check(item.inert, `${item.id}: closed root is not inert`);
    check(item.hidden === 'true', `${item.id}: closed root is not aria-hidden`);
    check(!item.modalClaims, `${item.id}: closed root claims aria-modal`);
  }

  // Quick Start is owned by Train rather than competing as a fifth global tab.
  // Train opens on its landing, so step into the cockpit — that is where the
  // sheet trigger lives. (The landing surfaces the same actions inline, but
  // this check is specifically about the SHEET's modal semantics.)
  await page.click('.bottom-nav [data-target="workout"]');
  await page.waitForSelector('#view-workout.active');
  await page.click('#trainLanding [data-action="qs-workout"]');
  await page.waitForSelector('#trainCockpit:not([hidden])');
  const trigger = page.locator('#view-workout [data-action="open-quick-start"]');
  await trigger.focus();
  await trigger.click();
  await page.waitForFunction(() => document.getElementById('quickStartSheet')?.getAttribute('aria-hidden') === 'false', null, { timeout: 10000 })
    .catch(async () => {
      const state = await page.$eval('#quickStartSheet', (el) => ({ className: el.className, inert: el.hasAttribute('inert'), hidden: el.getAttribute('aria-hidden') }));
      throw new Error(`quick-start did not enter modal stack: ${JSON.stringify(state)}`);
    });
  const opened = await page.evaluate(() => ({
    modal: document.getElementById('quickStartSheet')?.getAttribute('aria-modal'),
    focusedInside: document.getElementById('quickStartSheet')?.contains(document.activeElement),
    mainInert: document.querySelector('main')?.hasAttribute('inert'),
  }));
  check(opened.modal === 'true', 'open sheet lacks aria-modal');
  check(opened.focusedInside, 'focus did not move into open sheet');
  check(opened.mainInert, 'background was not inert while sheet was open');

  await page.locator('#quickStartSheet [data-action="qs-fast"]').focus();
  await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.activeElement?.matches('#quickStartSheet .sheet-close-btn')), 'Tab did not wrap inside sheet');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('quickStartSheet')?.getAttribute('aria-hidden') === 'true');
  check(await trigger.evaluate((el) => document.activeElement === el), 'Escape did not restore trigger focus');
  const reclosed = await page.$eval('#quickStartSheet', (root) => ({
    inert: root.hasAttribute('inert'),
    modal: root.hasAttribute('aria-modal'),
  }));
  check(reclosed.inert, 'closed sheet lost inert after restoration');
  check(!reclosed.modal, 'closed sheet retained aria-modal after restoration');

  await trigger.click();
  await page.waitForFunction(() => document.getElementById('quickStartSheet')?.getAttribute('aria-hidden') === 'false');
  const androidResult = await page.evaluate(() => window.__onAndroidBack());
  check(androidResult === 'handled', 'Android back was not handled by modal stack');
  await page.waitForFunction(() => document.getElementById('quickStartSheet')?.getAttribute('aria-hidden') === 'true');

  await trigger.click();
  await page.waitForFunction(() => document.getElementById('quickStartSheet')?.getAttribute('aria-hidden') === 'false');
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => document.getElementById('quickStartSheet')?.getAttribute('aria-hidden') === 'true');

  // Deliberately finishing is lifecycle state, not perfect adherence: one valid
  // set still gets an honest Finish/Keep/Discard choice and skipped-work copy.
  const partialFinish = await page.evaluate(async () => {
    const state = await import('./js/state.js');
    const workout = await import('./js/workout.js');
    state.setSelectedDay('mon');
    state.verifyWeekStorageSchema(state.appState.currentWeek || '1');
    const week = state.appState.weeks[String(state.appState.currentWeek || '1')];
    const firstSets = Object.values(week?.lifts?.mon || {}).find(Array.isArray);
    if (firstSets?.[0]) {
      firstSets[0].c = true;
      firstSets[0].w = firstSets[0].w || '20';
      firstSets[0].r = firstSets[0].r || '5';
    }
    workout.openFinishSessionModal();
    await new Promise(requestAnimationFrame);
    return {
      title: document.getElementById('summaryModalTitle')?.textContent,
      body: document.getElementById('summaryModalCopy')?.textContent,
      action: document.getElementById('summarySaveAction')?.textContent,
      keep: document.querySelector('[data-action="cancel-finish-modal"]')?.textContent,
      discard: document.getElementById('summaryDiscardAction')?.textContent,
      modal: document.getElementById('summaryModal')?.getAttribute('aria-modal'),
    };
  });
  check(partialFinish.title === 'Finish workout?', `finish title was misleading: ${partialFinish.title}`);
  // Phase 2B: these two assertions used to pin the exact old strings
  // ("treated as skipped", "Discard Workout"). Both were deliberately changed —
  // the body is now adherence-aware, so a session that completed everything is
  // no longer warned about work it did not skip, and the destructive action
  // follows the shared vocabulary's verb + exact object. Assert the CONTRACT
  // instead of the wording, so it still fails on vague copy: a partial finish
  // must say both what is kept and what is not.
  const partialBody = partialFinish.body || '';
  check(/completed sets will be saved/i.test(partialBody), `finish body did not say what is kept: ${partialBody}`);
  check(/did not finish|not done|skipped/i.test(partialBody), `finish body did not explain unfinished planned work: ${partialBody}`);
  check(partialFinish.action === 'Finish Workout', `finish action was unclear: ${partialFinish.action}`);
  check(partialFinish.keep?.trim() === 'Keep Training', `resume action was unclear: ${partialFinish.keep}`);
  const discardLabel = partialFinish.discard?.trim() || '';
  check(/^discard\b/i.test(discardLabel) && /workout/i.test(discardLabel),
    `discard action must name the verb and the exact object: ${discardLabel}`);
  check(partialFinish.modal === 'true', 'finish dialog did not acquire modal semantics');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('summaryModal')?.getAttribute('aria-hidden') === 'true');

  const emptyFinish = await page.evaluate(async () => {
    const state = await import('./js/state.js');
    const workout = await import('./js/workout.js');
    const week = state.appState.weeks[String(state.appState.currentWeek || '1')];
    for (const sets of Object.values(week?.lifts?.mon || {})) {
      if (!Array.isArray(sets)) continue;
      for (const set of sets) set.c = false;
    }
    workout.openFinishSessionModal();
    await new Promise(requestAnimationFrame);
    const action = document.getElementById('summarySaveAction');
    return {
      title: document.getElementById('summaryModalTitle')?.textContent,
      primaryHidden: action?.hidden,
      primaryDisplay: action ? getComputedStyle(action).display : null,
    };
  });
  check(emptyFinish.title === 'No working sets recorded', `empty finish title was unclear: ${emptyFinish.title}`);
  check(emptyFinish.primaryHidden && emptyFinish.primaryDisplay === 'none', 'empty workout still exposed a Finish action');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('summaryModal')?.getAttribute('aria-hidden') === 'true');

  // Dynamic program-switch confirmation uses the same stack.
  const activation = await page.evaluate(async () => {
    const { confirmActivation } = await import('./js/programs/activation.js');
    void confirmActivation({
      title: 'Switch program?', summary: ['12-week hybrid block'],
      impact: [{ tone: 'safe', text: 'History is kept' }],
      startWeekChoices: [{ week: 1, label: 'Start at Week 1', primary: true }],
    });
    await new Promise(requestAnimationFrame);
    const dialog = document.querySelector('.actm-overlay');
    return {
      modal: dialog?.getAttribute('aria-modal'),
      focusedInside: dialog?.contains(document.activeElement),
    };
  });
  check(activation.modal === 'true', 'dynamic activation dialog lacks modal semantics');
  check(activation.focusedInside, 'dynamic activation dialog did not receive focus');
  await page.keyboard.press('Escape');

  await context.close();

  // Fresh-install finish state: the browser journey proves the onboarding
  // controls persist their canonical goal/level/equipment choices.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const onboarding = await fresh.newPage();
  await onboarding.goto(base, { waitUntil: 'networkidle' });
  await onboarding.waitForSelector('#onboardingOverlay.active');
  check(await onboarding.getAttribute('#onboardingOverlay', 'aria-modal') === 'true', 'onboarding did not acquire modal semantics');
  await onboarding.keyboard.press('Escape');
  check(await onboarding.locator('#onboardingOverlay').evaluate((el) => el.classList.contains('active')), 'required onboarding was dismissed by Escape');

  // Auth opens above required onboarding. It used to inherit `inert` from the
  // onboarding modal, leaving a visible sign-in screen that accepted no input.
  const authTrigger = onboarding.locator('#onboardingOverlay [data-action="open-auth"]');
  await authTrigger.click();
  await onboarding.waitForSelector('#authOverlay[aria-hidden="false"]');
  check(await onboarding.getAttribute('#authOverlay .auth-card', 'aria-modal') === 'true', 'auth did not acquire modal semantics');
  check(!(await onboarding.locator('#authOverlay').evaluate((el) => el.hasAttribute('inert'))), 'open auth remained inert');
  check(await onboarding.locator('#loginEmail').evaluate((el) => document.activeElement === el), 'auth did not focus email input');
  await onboarding.fill('#loginEmail', 'athlete@example.com');
  check(await onboarding.inputValue('#loginEmail') === 'athlete@example.com', 'auth email input was not editable');
  await onboarding.click('[data-auth-tab="signup"]');
  check(await onboarding.locator('#authPanelSignup').isVisible(), 'create-account tab did not open');
  await onboarding.click('[data-action="close-auth"]');
  await onboarding.waitForFunction(() => document.getElementById('authOverlay')?.getAttribute('aria-hidden') === 'true');
  check(await authTrigger.evaluate((el) => document.activeElement === el), 'closing auth did not restore focus to its trigger');
  check(await onboarding.locator('#onboardingOverlay').evaluate((el) => el.classList.contains('active')), 'closing auth dismissed onboarding');

  check(await onboarding.locator('[data-action="ob-import-backup"]').isVisible(), 'offline backup restore is not available from welcome');
  check(await onboarding.locator('#onboardingImportFile').getAttribute('accept') === '.json,application/json', 'welcome restore does not constrain the backup file type');
  await onboarding.click('[data-action="ob-start-new"]');
  check(await onboarding.locator('#obNewProfileSetup').isVisible(), 'new-profile setup did not open from the recovery welcome');
  check(await onboarding.locator('#obName').evaluate((el) => document.activeElement === el), 'new-profile setup did not focus the name field');
  await onboarding.fill('#obName', 'Home Athlete');
  await onboarding.click('#ob-step-1 [data-action="ob-next"]');
  await onboarding.click('[data-action="ob-goal"][data-goal="strength"]');
  await onboarding.waitForSelector('#ob-step-3.ob-step-active');
  await onboarding.click('[data-action="ob-level"][data-level="beginner"]');
  await onboarding.click('[data-action="ob-equipment"][data-tier="home"]');
  await onboarding.click('#ob-step-3 [data-action="ob-next"]');
  await onboarding.waitForSelector('#obProgramList .ob-prog-card');
  const disclosures = await onboarding.locator('#obProgramList .ob-prog-difficulty').allTextContents();
  check(disclosures.length > 0 && disclosures.every((text) => /Beginner|Intermediate|Advanced|Open level/.test(text)), 'recommendation difficulty was not disclosed');
  await onboarding.locator('#obProgramList .ob-prog-card').first().click();
  await onboarding.waitForSelector('#ob-step-5.ob-step-active');
  await onboarding.click('#ob-step-5 [data-action="ob-next"]');
  await onboarding.click('[data-action="ob-notif-skip"]');
  await onboarding.waitForSelector('#ob-step-7.ob-step-active');
  await onboarding.click('[data-action="ob-finish"]');
  await onboarding.waitForFunction(() => !document.getElementById('onboardingOverlay')?.classList.contains('active'));
  const saved = await onboarding.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state') || '{}').settings || {});
  check(saved.fitnessGoal === 'strength', `onboarding goal did not persist: ${saved.fitnessGoal}`);
  check(saved.fitnessLevel === 'beginner', `onboarding level did not persist: ${saved.fitnessLevel}`);
  check(saved.equipmentTier === 'home', `onboarding equipment tier did not persist: ${saved.equipmentTier}`);
  check(saved.equipment?.barbell === false && saved.equipment?.dumbbells === true, 'home equipment map did not persist canonically');
  await fresh.close();

  // A returning offline user can restore a validated JSON backup directly
  // from the welcome screen and lands in the app without replaying onboarding.
  const restoreContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const restorePage = await restoreContext.newPage();
  await restorePage.goto(base, { waitUntil: 'networkidle' });
  await restorePage.waitForSelector('#onboardingOverlay.active');
  const backup = {
    schemaVersion: 5,
    currentWeek: '1',
    activeProgramId: 'hybrid_engine',
    settings: { name: 'Recovered Athlete', onboardingComplete: true, weightUnit: 'kg', distanceUnit: 'km' },
    customPrograms: [], customExercises: [], bodyWeightLog: [],
    weeks: {
      '1': {
        lifts: { mon: { 'Bench Press': [{ w: '80', r: '5', c: true }] } },
        dates: { mon: '2026-07-20' }, runs: {}, runSessions: {}, notes: {}, gymRpe: {}, gymStats: {},
      },
    },
  };
  await restorePage.locator('#onboardingImportFile').setInputFiles({
    name: 'helyx-training.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  });
  await restorePage.getByRole('button', { name: 'Import backup', exact: true }).click();
  await restorePage.waitForFunction(() => {
    const savedState = JSON.parse(localStorage.getItem('hybrid_engine_v2_state') || '{}');
    return savedState.settings?.name === 'Recovered Athlete'
      && !document.getElementById('onboardingOverlay')?.classList.contains('active');
  }, null, { timeout: 10000 });
  const restored = await restorePage.evaluate(() => JSON.parse(localStorage.getItem('hybrid_engine_v2_state') || '{}'));
  check(restored.settings?.name === 'Recovered Athlete', 'welcome JSON restore did not preserve the profile');
  check(restored.weeks?.['1']?.lifts?.mon?.['Bench Press']?.[0]?.w === '80', 'welcome JSON restore did not preserve training history');
  await restoreContext.close();
} catch (error) {
  failures.push(error?.stack || error?.message || String(error));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('modal-accessibility-check: FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('modal-accessibility-check: PASS — modal semantics/navigation, explicit finish lifecycle, no-data guard, and canonical onboarding state.');
