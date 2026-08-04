import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildVolumeGuideModel,
  effectiveMusclePriorities,
  hasExplicitMusclePriorities,
  projectProgramMuscleCredits,
  volumeReferenceForPriority,
  volumeStatusFor,
} from '../js/analytics/volume-guide.js';
import { VOLUME_LANDMARKS, classifyVolume } from '../js/analytics/calculations/volume-landmarks.js';

const work = (w, r) => ({ c: true, w: String(w), r: String(r) });

function programFixture() {
  return {
    days: {
      mon: { title: 'Upper', desc: '', lifts: ['Barbell Bench Press'], runs: 'Rest' },
      wed: { title: 'Lower', desc: '', lifts: ['Back Squat'], runs: 'Rest' },
    },
    weeklyVolModifiers: {
      '1': { sets: 3, reps: 8, intensityLabel: 'Build' },
      '2': { sets: 2, reps: 6, intensityLabel: 'Deload' },
    },
  };
}

test('program projection uses logger targets and separates direct from indirect credits', () => {
  const result = projectProgramMuscleCredits(programFixture(), '1');
  assert.equal(result.deload, false);
  assert.deepEqual(result.muscles.chest, {
    direct: 3, indirect: 0, total: 3,
    exercises: ['Barbell Bench Press'], days: ['mon'],
  });
  assert.equal(result.muscles.triceps.direct, 0);
  assert.equal(result.muscles.triceps.indirect, 1.5);
  assert.equal(result.muscles.quads.direct, 3);
});

test('program projection recognises planned deloads without inventing warnings', () => {
  const result = projectProgramMuscleCredits(programFixture(), '2');
  assert.equal(result.deload, true);
  assert.equal(result.muscles.chest.total, 2);
});

test('explicit priorities override program defaults and track-only has no target band', () => {
  const projection = projectProgramMuscleCredits(programFixture(), '1');
  const state = { settings: { musclePriorities: { chest: 'maintain', quads: 'track' } } };
  const priorities = effectiveMusclePriorities(state, projection);
  assert.equal(priorities.chest, 'maintain');
  assert.equal(priorities.quads, 'track');
  assert.equal(priorities.triceps, 'track', 'supporting work alone does not create a growth target');
  assert.equal(hasExplicitMusclePriorities(state), true);
  assert.equal(volumeReferenceForPriority('chest', 'track'), null);
  assert.deepEqual(volumeReferenceForPriority('chest', 'grow'), {
    min: 10, max: 20, label: 'General productive reference',
  });
});

test('guide combines real calendar-week logs with the active program projection', () => {
  const state = {
    currentWeek: '1',
    settings: { musclePriorities: { chest: 'grow', quads: 'maintain' } },
    weeks: {
      live: {
        dates: { mon: '2026-07-20' },
        lifts: { mon: { 'Barbell Bench Press': [work(100, 5), work(100, 5)] } },
      },
    },
  };
  const guide = buildVolumeGuideModel(state, {
    program: programFixture(), weekStart: '2026-07-20', today: '2026-07-22',
  });
  const chest = guide.muscles.find((row) => row.id === 'chest');
  assert.equal(chest.logged.direct, 2);
  assert.equal(chest.planned.total, 3);
  assert.equal(chest.priority, 'grow');
  // 2 logged, 1 still scheduled, chest MEV is 10 — the plan cannot reach the
  // band, so this is described as below it rather than "on plan".
  assert.equal(chest.status.label, 'Below the typical range');
  assert.equal(chest.status.tone, 'low');
  assert.match(chest.status.detail, /8 credits below the 10–20 typical range/);
  assert.equal(guide.summary.focusCount, 2);
  assert.equal(guide.summary.scheduledCount, 2, 'scheduled count describes remaining planned work, not only plans that reach a reference band');
  assert.equal(guide.summary.loggedCredits > 2, true, 'supporting muscle credits remain visible');
});

// ---- landmark scale and the single classifier --------------------------------

test('every row carries the full MV/MEV/MAV/MRV scale, not just the highlighted band', () => {
  const state = {
    currentWeek: '1',
    settings: { musclePriorities: { chest: 'grow' } },
    weeks: { live: { dates: { mon: '2026-07-20' }, lifts: { mon: { 'Barbell Bench Press': [work(100, 5)] } } } },
  };
  const guide = buildVolumeGuideModel(state, { program: programFixture(), weekStart: '2026-07-20', today: '2026-07-22' });
  const chest = guide.muscles.find((row) => row.id === 'chest');
  assert.deepEqual(chest.landmarks, VOLUME_LANDMARKS.chest);
  // The MRV ceiling must survive into the model — the old band collapsed to
  // min/max and threw it away, so an enormous week looked like a productive one.
  assert.equal(chest.landmarks.mrv, 22);
});

test('the guide zone comes from the shared classifier, never a second set of thresholds', () => {
  // Drive a range of weekly credits through the model and assert the zone always
  // equals classifyVolume's verdict for the same number.
  for (const credits of [0, 5, 9, 10, 15, 20, 22, 30]) {
    const sets = Array.from({ length: credits }, () => work(100, 5));
    const guide = buildVolumeGuideModel({
      currentWeek: '1',
      settings: { musclePriorities: { chest: 'grow' } },
      weeks: { live: { dates: { mon: '2026-07-20' }, lifts: { mon: { 'Barbell Bench Press': sets } } } },
    }, { weekStart: '2026-07-20', today: '2026-07-22' });
    const chest = guide.muscles.find((row) => row.id === 'chest');
    assert.equal(chest.zone, classifyVolume(credits, VOLUME_LANDMARKS.chest), `credits=${credits}`);
  }
});

// ---- status wording ----------------------------------------------------------

const lm = { mv: 8, mev: 10, mav: 20, mrv: 22 };
const growBand = { min: 10, max: 20, label: 'General productive reference' };
const status = (over) => volumeStatusFor({
  priority: 'grow', landmarks: lm, reference: growBand,
  logged: { total: 0 }, planned: { total: 0 }, remaining: 0,
  deload: false, isCurrentWeek: true, ...over,
});

test('status names the distance to the range without instructing the athlete', () => {
  const below = status({ logged: { total: 6 } });
  assert.equal(below.label, 'Below the typical range');
  assert.equal(below.detail, '4 credits below the 10–20 typical range.');
  // These bands are population references, so the guide must never prescribe.
  assert.doesNotMatch(below.detail, /add|should|need to|must/i);
});

test('scheduled work that will reach the range reads as on plan, not a shortfall', () => {
  const onPlan = status({ logged: { total: 6 }, planned: { total: 12 }, remaining: 6 });
  assert.equal(onPlan.label, 'On plan');
  assert.equal(onPlan.tone, 'ok');
  assert.match(onPlan.detail, /6 more credits scheduled/);

  // Scheduled work that still falls short is NOT dressed up as on plan.
  const short = status({ logged: { total: 4 }, planned: { total: 6 }, remaining: 2 });
  assert.equal(short.label, 'Below the typical range');
});

test('a week past the usual ceiling is distinguished from a merely high one', () => {
  assert.equal(status({ logged: { total: 15 } }).label, 'In the typical range');
  assert.equal(status({ logged: { total: 21 } }).label, 'Above the typical range');
  assert.equal(status({ logged: { total: 21 } }).tone, 'ok');
  const over = status({ logged: { total: 30 } });
  assert.equal(over.label, 'Above the usual ceiling');
  assert.equal(over.tone, 'high');
  assert.match(over.detail, /22 credits is the usual weekly ceiling/);
});

test('deload and track-only never read as a volume shortfall', () => {
  const deload = status({ logged: { total: 2 }, deload: true });
  assert.equal(deload.label, 'Planned deload');
  assert.equal(deload.tone, 'neutral');
  assert.doesNotMatch(deload.detail, /below/i);

  const tracked = status({ priority: 'track', reference: null, logged: { total: 2 } });
  assert.equal(tracked.label, 'Tracked only');
  assert.equal(tracked.tone, 'neutral');
});

test('an untouched muscle is distinguished from one that simply has not started yet', () => {
  assert.equal(status({ logged: { total: 0 } }).label, 'No sets logged');
  assert.equal(status({ logged: { total: 0 }, planned: { total: 9 } }).label, 'Not started');
  // A past week can never claim work is "scheduled".
  assert.equal(status({ logged: { total: 0 }, planned: { total: 9 }, isCurrentWeek: false }).label, 'No sets logged');
});

test('summary counts split below, in range and above the ceiling', () => {
  const state = {
    currentWeek: '1',
    settings: { musclePriorities: { chest: 'grow', side_delts: 'grow' } },
    weeks: { live: { dates: { mon: '2026-07-20' }, lifts: { mon: {
      'Barbell Bench Press': Array.from({ length: 12 }, () => work(100, 5)),   // chest 12 → in range (10–20)
      'Lateral Raise': Array.from({ length: 30 }, () => work(10, 12)),          // side delts 30 → over MRV 26
    } } } },
  };
  const guide = buildVolumeGuideModel(state, { weekStart: '2026-07-20', today: '2026-07-22' });
  assert.equal(guide.summary.inRangeCount, 1);
  assert.equal(guide.summary.aboveCount, 1);
  assert.equal(guide.summary.belowCount, 0);
  // The four buckets must always account for every focus muscle, so a partial
  // week can never look like untouched muscles quietly failed a target.
  const { inRangeCount, belowCount, aboveCount, notStartedCount, focusCount } = guide.summary;
  assert.equal(inRangeCount + belowCount + aboveCount + notStartedCount, focusCount);
});

test('the status buckets always sum to the focus count, mid-week included', () => {
  const state = {
    currentWeek: '1',
    settings: { musclePriorities: { chest: 'grow', quads: 'grow', calves: 'grow', glutes: 'maintain' } },
    weeks: { live: { dates: { mon: '2026-07-20' }, lifts: { mon: {
      'Barbell Bench Press': Array.from({ length: 12 }, () => work(100, 5)),
    } } } },
  };
  const { summary } = buildVolumeGuideModel(state, {
    program: programFixture(), weekStart: '2026-07-20', today: '2026-07-22',
  });
  assert.ok(summary.focusCount > 0);
  assert.equal(
    summary.inRangeCount + summary.belowCount + summary.aboveCount + summary.notStartedCount,
    summary.focusCount,
  );
});

test('historical guide never presents the current program as a past plan', () => {
  const guide = buildVolumeGuideModel({ currentWeek: '1', settings: {}, weeks: {} }, {
    program: programFixture(), weekStart: '2026-07-06', today: '2026-07-22',
  });
  assert.equal(guide.isCurrentWeek, false);
  assert.equal(guide.summary.plannedCredits, 0);
  assert.equal(guide.muscles.length, 0);
});
