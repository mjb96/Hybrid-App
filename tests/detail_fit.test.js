// =============================================================================
// PROGRAMME DETAIL — "WHO IT'S FOR" (roadmap Phase 4B)
//
// 4B asks programme detail to answer "who is this for" first. The page could not
// answer it at all. This model answers it from the SAME fit scoring the Plans
// recommendations use, so a programme cannot be described as fitting on one
// surface and unfitting on the other — with one deliberate difference: the
// recommendation row shows reasons only, while the detail page also shows the
// cautions, because an athlete who opened the page needs to know what it will
// cost them.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhoItsFor } from '../js/programs/detail-fit.js';
import { programFit, athleteProfile } from '../js/programs/recommendation-fit.js';

const FULL_GYM = {
  barbell: true, rack: true, dumbbells: true, cables: true, pullupBar: true,
  bands: true, kettlebells: true, ezBar: true, treadmill: true,
};
const NO_KIT = {
  barbell: false, rack: false, dumbbells: false, cables: false, pullupBar: false,
  bands: false, kettlebells: false, ezBar: false, treadmill: false,
};

const strengthProgram = {
  id: 'sl', name: 'StrongLifts', category: 'strength', difficulty: 'intermediate',
  goals: ['strength', '1rm'], sessionsPerWeek: 3,
  equipment: ['barbell', 'rack'],
};

const athlete = (settings) => ({ settings: { ...settings } });

test('the audience line describes the PROGRAMME, whoever is reading', () => {
  const blank = buildWhoItsFor(strengthProgram, { settings: {} });
  assert.match(blank.audience, /Written for athletes with a season or two/);
  // A profile with nothing answered gets the audience alone — no invented match.
  assert.equal(blank.verdict, null);
  assert.deepEqual(blank.reasons, []);
  assert.deepEqual(blank.cautions, []);
});

test('an athlete it suits is told so, with the reasons', () => {
  const model = buildWhoItsFor(strengthProgram, athlete({
    fitnessGoal: 'strength', fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM,
  }));
  assert.equal(model.verdict.tone, 'fits');
  assert.equal(model.verdict.label, 'Fits your profile');
  assert.ok(model.reasons.some((r) => /strength goal/i.test(r)));
  assert.ok(model.reasons.some((r) => /intermediate athletes/i.test(r)));
  assert.deepEqual(model.cautions, [], 'nothing to caution about with the kit and level matching');
});

test('cautions are SHOWN here, unlike in the recommendations row', () => {
  // Same programme, an athlete with no equipment. The row would simply drop it;
  // the detail page must say what is missing.
  const model = buildWhoItsFor(strengthProgram, athlete({
    fitnessGoal: 'strength', fitnessLevel: 'intermediate', equipmentTier: 'home', equipment: NO_KIT,
  }));
  assert.ok(model.cautions.length, 'the missing kit must be stated');
  assert.ok(model.cautions.some((c) => /barbell|rack/i.test(c)), `got ${JSON.stringify(model.cautions)}`);
  assert.equal(model.verdict.tone, 'stretch', 'it still matches the goal and level');
  assert.equal(model.verdict.label, 'Fits, with caveats');
});

test('a programme that does not suit the athlete says so plainly', () => {
  const elite = {
    id: 'e', name: 'Elite Block', category: 'endurance', difficulty: 'elite',
    goals: ['marathon'], sessionsPerWeek: 7, equipment: ['treadmill'],
  };
  const model = buildWhoItsFor(elite, athlete({
    fitnessGoal: 'strength', fitnessLevel: 'beginner', equipmentTier: 'home', equipment: NO_KIT,
  }));
  assert.equal(model.verdict.tone, 'mismatch');
  assert.ok(model.cautions.length, 'a mismatch must name why');
});

test('the verdict follows the personal SCORE, not the count of reasons', () => {
  // A programme two rungs above the athlete carries a -35 level penalty. Even
  // with a goal match, that must not read as a fit just because one reason exists.
  const tooHard = {
    id: 'h', name: 'Advanced', category: 'strength', difficulty: 'elite',
    goals: ['strength'], sessionsPerWeek: 3, equipment: ['barbell'],
  };
  const profile = athleteProfile(athlete({
    fitnessGoal: 'strength', fitnessLevel: 'beginner', equipmentTier: 'gym', equipment: FULL_GYM,
  }));
  const fit = programFit(tooHard, profile);
  const model = buildWhoItsFor(tooHard, athlete({
    fitnessGoal: 'strength', fitnessLevel: 'beginner', equipmentTier: 'gym', equipment: FULL_GYM,
  }));
  assert.ok(fit.reasons.length > 0, 'the goal still matches');
  if (fit.personalScore <= 0) {
    assert.equal(model.verdict.tone, 'mismatch', 'a negative personal score is not a fit');
  } else {
    assert.equal(model.verdict.tone, 'stretch');
  }
});

test('detail and the recommendations row cannot disagree about the reasons', () => {
  const settings = {
    fitnessGoal: 'strength', fitnessLevel: 'intermediate', equipmentTier: 'gym', equipment: FULL_GYM,
  };
  const model = buildWhoItsFor(strengthProgram, athlete(settings));
  const fit = programFit(strengthProgram, athleteProfile(athlete(settings)));
  assert.deepEqual(model.reasons, fit.reasons, 'one scoring model, one set of reasons');
  assert.deepEqual(model.cautions, fit.cautions);
});

test('an unknown difficulty still yields an honest audience line', () => {
  const vague = { id: 'v', name: 'Vague', category: 'strength', goals: [] };
  const model = buildWhoItsFor(vague, athlete({ fitnessGoal: 'strength' }));
  assert.match(model.audience, /range of training experience/);
});
