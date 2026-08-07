// =============================================================================
// PROGRAM FIT (Phase 4A) — recommendations that are actually recommendations.
//
// The defect these tests exist to prevent coming back: `scoreForUser` scored on
// popularity, completionRate, rating, `featured` and `author.type` — catalogue
// constants identical for every athlete — and never once read the goal, level,
// equipment or weight goal that onboarding collects. A dedicated advanced
// runner with no barbell and a beginner with a full gym got byte-identical
// suggestions under a row headed "Based on your training".
//
// So the load-bearing test here is not "does it rank well", it is "do two
// different athletes get different answers, and is every stated reason true".
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  athleteProfile, distinguishingReasons, programFit, recentWeeklySessions,
  recommendationBasis,
} from '../js/programs/recommendation-fit.js';
import { getRecommendations } from '../js/programs/recommendations.js';

const FULL_GYM = {
  barbell: true, rack: true, dumbbells: true, cables: true, pullupBar: true,
  bands: true, kettlebells: true, ezBar: true, treadmill: true,
};
const NO_KIT = {
  barbell: false, rack: false, dumbbells: false, cables: false, pullupBar: false,
  bands: false, kettlebells: false, ezBar: false, treadmill: false,
};

const state = (settings, weeks = {}) => ({ settings, weeks });
const profileOf = (settings, derived) => athleteProfile(state(settings), derived);

const program = (over = {}) => ({
  id: 'p1', name: 'P1', category: 'strength', subcategory: null,
  goals: ['strength'], difficulty: 'intermediate', equipmentTier: 'gym',
  equipment: ['barbell', 'rack'], sessionsPerWeek: 4, durationWeeks: 12,
  popularity: 50, rating: 4, author: { type: 'community' },
  ...over,
});

// ── The defect itself ───────────────────────────────────────────────────────

test('two different athletes do not get the same recommendations', () => {
  const runner = state({
    fitnessGoal: 'endurance', fitnessLevel: 'advanced',
    equipmentTier: 'home', equipment: NO_KIT,
  });
  const lifter = state({
    fitnessGoal: 'strength', fitnessLevel: 'beginner',
    equipmentTier: 'gym', equipment: FULL_GYM,
  });
  const a = getRecommendations(runner, 5).map(r => r.program.id);
  const b = getRecommendations(lifter, 5).map(r => r.program.id);
  assert.ok(a.length > 0 && b.length > 0, 'both athletes should get suggestions');
  assert.notDeepEqual(a, b, 'recommendations must depend on the athlete');
});

test('an athlete who has told the app nothing gets no personalised row', () => {
  // Better an empty row than a popularity chart wearing a personalisation
  // label — the caller renders nothing when this is empty.
  assert.equal(getRecommendations(state({}), 5).length, 0);
  assert.equal(getRecommendations(null, 5).length, 0);
});

test('every returned recommendation carries at least one reason', () => {
  const recs = getRecommendations(state({
    fitnessGoal: 'hybrid', fitnessLevel: 'intermediate',
    equipmentTier: 'gym', equipment: FULL_GYM,
  }), 5);
  assert.ok(recs.length > 0);
  for (const r of recs) {
    assert.ok(r.reasons.length > 0, `${r.program.id} has no reason`);
    // The headline is chosen across the row, so it is not always reasons[0] —
    // but it must always be one of this programme's own true reasons.
    assert.ok(r.reasons.includes(r.reason), `${r.program.id}: headline "${r.reason}" is not its own`);
    assert.ok(r.reason.length > 0);
  }
});

test('editorial badges are no longer offered as reasons', () => {
  // "Staff Pick" and "Helyx Certified" describe the programme, not the fit.
  const recs = getRecommendations(state({
    fitnessGoal: 'strength', fitnessLevel: 'intermediate',
    equipmentTier: 'gym', equipment: FULL_GYM,
  }), 8);
  for (const r of recs) {
    for (const reason of r.reasons) {
      assert.doesNotMatch(reason, /staff pick|certified|popular/i, `${r.program.id}: "${reason}"`);
    }
  }
});

// ── Profile extraction ──────────────────────────────────────────────────────

test('only values the settings UI can actually produce are trusted', () => {
  const p = profileOf({
    fitnessGoal: 'powerlifting', fitnessLevel: 'godlike',
    equipmentTier: 'spaceship', weightGoal: 'vibes',
  });
  assert.equal(p.goal, null);
  assert.equal(p.level, null);
  assert.equal(p.tier, null);
  assert.equal(p.weightGoal, null);
  const ok = profileOf({
    fitnessGoal: 'hybrid', fitnessLevel: 'advanced',
    equipmentTier: 'home', weightGoal: 'cut',
  });
  assert.deepEqual(
    [ok.goal, ok.level, ok.tier, ok.weightGoal],
    ['hybrid', 'advanced', 'home', 'cut'],
  );
});

// ── Goal ────────────────────────────────────────────────────────────────────

test('goal match beats every editorial signal combined', () => {
  const onGoal = programFit(program({ category: 'strength', popularity: 0, rating: 0 }),
    profileOf({ fitnessGoal: 'strength' }));
  const offGoalDarling = programFit(
    program({ category: 'running', goals: ['marathon'], popularity: 100, rating: 5, featured: true, author: { type: 'official' } }),
    profileOf({ fitnessGoal: 'strength' }));
  assert.ok(onGoal.score > offGoalDarling.score,
    'a popular off-goal programme must not outrank an on-goal one');
});

test('an off-goal programme is not eligible on editorial signal alone', () => {
  const fit = programFit(
    program({ category: 'running', goals: ['marathon'], popularity: 100, rating: 5, featured: true }),
    profileOf({ fitnessGoal: 'strength' }));
  assert.equal(fit.eligible, false);
});

// ── Level ───────────────────────────────────────────────────────────────────

test('a programme two levels above is pushed down and says so', () => {
  const p = profileOf({ fitnessGoal: 'strength', fitnessLevel: 'beginner' });
  const matched = programFit(program({ difficulty: 'beginner' }), p);
  const tooHard = programFit(program({ difficulty: 'advanced' }), p);
  assert.ok(tooHard.score < matched.score);
  assert.match(tooHard.cautions.join(' '), /advanced/i);
});

test('the easier-than-you penalty scales with the gap', () => {
  // One rung down is a legitimate lighter option; Couch to 5K for an advanced
  // runner is not, however politely it is captioned.
  const p = profileOf({ fitnessGoal: 'endurance', fitnessLevel: 'advanced' });
  const base = { category: 'running', goals: ['running'], equipment: [] };
  const oneDown = programFit(program({ ...base, difficulty: 'intermediate' }), p);
  const twoDown = programFit(program({ ...base, difficulty: 'beginner' }), p);
  assert.ok(twoDown.score < oneDown.score, 'a beginner plan must rank below an intermediate one');
  assert.match(twoDown.cautions.join(' '), /well below/i);
});

test('the real catalogue does not offer Couch to 5K above a matched plan', () => {
  const recs = getRecommendations(state({
    fitnessGoal: 'endurance', fitnessLevel: 'advanced',
    equipmentTier: 'home', equipment: NO_KIT,
  }), 5);
  const ids = recs.map(r => r.program.id);
  const c25k = ids.indexOf('couch_to_5k');
  if (c25k !== -1) {
    assert.ok(c25k > 0, 'Couch to 5K must not be the top pick for an advanced runner');
    const top = recs[0].program;
    assert.notEqual(top.difficulty, 'beginner');
  }
});

// ── Equipment ───────────────────────────────────────────────────────────────

test('missing equipment is named, not silently scored down', () => {
  const fit = programFit(program({ equipment: ['barbell', 'rack'] }),
    profileOf({ fitnessGoal: 'strength', equipment: NO_KIT }));
  assert.match(fit.cautions.join(' '), /barbell/);
});

test('owning everything a programme needs is a stated reason', () => {
  const fit = programFit(program({ equipment: ['barbell', 'rack'] }),
    profileOf({ fitnessGoal: 'strength', equipment: FULL_GYM }));
  assert.match(fit.reasons.join(' '), /equipment you have/i);
});

test('unknown equipment tokens are neutral, never a false claim', () => {
  // The catalogue has tokens with no settings counterpart (sleds, ski-ergs).
  // They must not produce "uses only equipment you have" NOR a false caution.
  const fit = programFit(program({ equipment: ['sled', 'ski-erg'] }),
    profileOf({ fitnessGoal: 'strength', equipment: FULL_GYM }));
  assert.doesNotMatch(fit.reasons.join(' '), /equipment you have/i);
  assert.equal(fit.cautions.filter(c => /sled|ski/i.test(c)).length, 0);
});

// ── Availability ────────────────────────────────────────────────────────────

test('training frequency is only claimed when there is enough history', () => {
  const dates = (n) => new Set(
    Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10)),
  );
  assert.equal(recentWeeklySessions(dates(0), '2026-07-28'), null);
  assert.equal(recentWeeklySessions(dates(2), '2026-07-28'), null, 'two sessions is not a frequency');
  assert.ok(recentWeeklySessions(dates(12), '2026-07-28') > 0);
  assert.equal(recentWeeklySessions(dates(28), '2026-07-28'), 7);
});

test('dates outside the window do not count toward frequency', () => {
  const old = new Set(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.equal(recentWeeklySessions(old, '2026-07-28'), null);
});

test('a schedule that matches recent training is a reason, a heavier one a caution', () => {
  const p = profileOf({ fitnessGoal: 'strength' }, { weeklySessions: 3 });
  const matched = programFit(program({ sessionsPerWeek: 3 }), p);
  const heavier = programFit(program({ sessionsPerWeek: 6 }), p);
  assert.match(matched.reasons.join(' '), /like your recent training/i);
  assert.match(heavier.cautions.join(' '), /6 days\/week/);
  assert.ok(heavier.score < matched.score);
});

test('no history means no schedule claim either way', () => {
  const fit = programFit(program({ sessionsPerWeek: 6 }), profileOf({ fitnessGoal: 'strength' }));
  assert.equal(fit.factors.filter(f => f.id === 'schedule').length, 0);
  assert.doesNotMatch(fit.reasons.join(' '), /recent training/i);
});

// ── Weight goal ─────────────────────────────────────────────────────────────

test('a cut is reflected only when the athlete asked for one', () => {
  const fatLoss = program({ category: 'body_composition', goals: ['fat-loss'] });
  const cutting = programFit(fatLoss, profileOf({ fitnessGoal: 'hybrid', weightGoal: 'cut' }));
  const bulking = programFit(fatLoss, profileOf({ fitnessGoal: 'hybrid', weightGoal: 'bulk' }));
  assert.match(cutting.reasons.join(' '), /cut/i);
  assert.doesNotMatch(bulking.reasons.join(' '), /cut/i);
});

// ── Which reason to headline ────────────────────────────────────────────────

test('the headline reason is the one that sets a programme apart', () => {
  // Taking reasons[0] gave every card in the row the same line.
  const headlines = distinguishingReasons([
    ['Matches your endurance goal', 'Written for advanced athletes'],
    ['Matches your endurance goal'],
    ['Matches your endurance goal'],
  ]);
  assert.equal(headlines[0], 'Written for advanced athletes');
  assert.equal(headlines[1], 'Matches your endurance goal');
});

test('a card with only shared reasons still says something true', () => {
  // When every programme matches on every axis the app knows, the shared
  // reason is the honest answer — silence would be worse.
  const headlines = distinguishingReasons([
    ['Matches your strength goal'], ['Matches your strength goal'],
  ]);
  assert.deepEqual(headlines, ['Matches your strength goal', 'Matches your strength goal']);
});

test('headline selection survives empty and ragged input', () => {
  assert.deepEqual(distinguishingReasons([]), []);
  assert.deepEqual(distinguishingReasons([[]]), ['']);
  assert.deepEqual(distinguishingReasons([['only']]), ['only']);
});

test('the real catalogue produces a distinguishing headline where one exists', () => {
  const recs = getRecommendations(state({
    fitnessGoal: 'endurance', fitnessLevel: 'advanced',
    equipmentTier: 'home', equipment: NO_KIT,
  }), 5);
  const unique = new Set(recs.map(r => r.reason));
  assert.ok(unique.size > 1,
    `an advanced runner should see more than one distinct reason, got ${[...unique]}`);
});

// ── The stated basis ────────────────────────────────────────────────────────

test('the basis reports what the recommendations actually used', () => {
  const basis = recommendationBasis(profileOf({
    fitnessGoal: 'endurance', fitnessLevel: 'advanced', equipmentTier: 'home',
  }));
  assert.deepEqual(basis.map(b => b.id), ['goal', 'level', 'equipment']);
  assert.deepEqual(basis.map(b => b.currentLabel), ['Endurance', 'Advanced', 'Home basics']);
  for (const b of basis) {
    assert.ok(b.options.some(o => o.value === b.current), `${b.id}: current is not an option`);
  }
});

test('an unset input is shown as unset, not guessed', () => {
  // settings ship with hybrid/intermediate/gym seeded, so this is the raw-state
  // case; the basis must never present a blank as a choice.
  const basis = recommendationBasis(profileOf({}));
  assert.deepEqual(basis.map(b => b.currentLabel), ['Not set', 'Not set', 'Not set']);
  for (const b of basis) assert.equal(b.current, null);
});

test('every basis option is a value the fit model actually understands', () => {
  // A basis offering a value programFit ignores would silently do nothing.
  const basis = recommendationBasis(profileOf({}));
  const byId = Object.fromEntries(basis.map(b => [b.id, b.options.map(o => o.value)]));
  for (const goal of byId.goal) {
    assert.equal(profileOf({ fitnessGoal: goal }).goal, goal);
  }
  for (const level of byId.level) {
    assert.equal(profileOf({ fitnessLevel: level }).level, level);
  }
  for (const tier of byId.equipment) {
    assert.equal(profileOf({ equipmentTier: tier }).tier, tier);
  }
});

test('changing the basis changes the recommendations', () => {
  const withGoal = (goal) => getRecommendations(state({
    fitnessGoal: goal, fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM,
  }), 5).map(r => r.program.id);
  assert.notDeepEqual(withGoal('endurance'), withGoal('strength'));
});

// ── Honesty of the whole model ──────────────────────────────────────────────

test('every reason references something the athlete told the app', () => {
  const recs = getRecommendations(state({
    fitnessGoal: 'hybrid', fitnessLevel: 'intermediate',
    equipmentTier: 'gym', equipment: FULL_GYM, weightGoal: 'cut',
  }), 8);
  const allowed = /goal|level|athletes|equipment|home basics|cut|days\/week|step up/i;
  for (const r of recs) {
    for (const reason of r.reasons) {
      assert.match(reason, allowed, `${r.program.id}: unexplained reason "${reason}"`);
    }
  }
});

test('fit never throws on a malformed programme', () => {
  const p = profileOf({ fitnessGoal: 'strength', fitnessLevel: 'beginner', equipment: FULL_GYM });
  for (const bad of [{}, { equipment: null }, { goals: null }, { difficulty: 'unknown' },
    { sessionsPerWeek: 'four' }, { popularity: null, rating: undefined }]) {
    const fit = programFit(bad, p);
    assert.equal(typeof fit.score, 'number');
    assert.ok(Number.isFinite(fit.score));
    assert.ok(Array.isArray(fit.reasons));
  }
});
