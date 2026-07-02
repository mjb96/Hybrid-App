import { test } from 'node:test';
import assert from 'node:assert/strict';

import { levelFromXp, xpForDay } from '../js/brain/hybrid-score/levels.js';
import { scoreBand, isDeloadWeek, PILLAR_WEIGHTS } from '../js/brain/hybrid-score/config.js';
import { consistencyPillar, recoveryPillar, momentumPillar, bodyPillar, lifestylePillar } from '../js/brain/hybrid-score/pillars.js';
import { computeHybridScore } from '../js/brain/hybrid-score/hybrid-score.js';
import { recordDailyScore, dailySeries, bucketedTrend, currentLevel } from '../js/brain/hybrid-score/history.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const iso = (d) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Fixture: a realistic multi-week hybrid athlete progressing on both modalities.
// ---------------------------------------------------------------------------
function makeState({ currentWeek = 5, weightGoal = 'maintain', fitnessLevel = 'intermediate' } = {}) {
  const start = new Date();
  start.setDate(start.getDate() - (currentWeek - 1) * 7); // week 1 Monday-ish
  const weeks = {};
  for (let w = 1; w <= currentWeek; w++) {
    const squat = 100 + (w - 1) * 5;         // progressing strength
    const dist = 5 + (w - 1) * 0.75;         // progressing distance
    const wkStart = new Date(start); wkStart.setDate(start.getDate() + (w - 1) * 7);
    const monISO = iso(wkStart);
    const wedISO = iso(new Date(wkStart.getTime() + 2 * 86400000));
    weeks[String(w)] = {
      lifts: { mon: { 'Back Squat': [
        { w: String(squat), r: 5, c: true },
        { w: String(squat), r: 5, c: true },
        { w: String(squat), r: 5, c: true },
      ] } },
      runs: { wed: { dist: String(dist), time: '25:00', rpe: '6', type: 'run' } },
      gymRpe: { mon: '7' },
      gymStats: { mon: { time: '45', cals: '300', avgHR: '130' } },
      dates: { mon: monISO, wed: wedISO },
    };
  }
  const today = iso(new Date());
  const sevenAgo = iso(new Date(Date.now() - 7 * 86400000));
  return {
    currentWeek: String(currentWeek),
    weekStartedAt: iso(new Date(Date.now() - 2 * 86400000)),
    settings: { fitnessLevel, weightGoal, distanceUnit: 'km' },
    weeks,
    loadMetrics: { atl: 9, ctl: 10 }, // ACWR 0.9 — productive
    thresholdPaceSeconds: 240,
    bodyWeightLog: [{ date: sevenAgo, weight: 80 }, { date: today, weight: 80 }],
    wellnessLog: [{ date: today, mood: 4, soreness: 2, sleep: 8 }],
    healthConnect: {
      connected: true,
      sleep: [{ date: today, totalHours: 8 }],
      restingHR: [{ date: today, bpm: 52 }, { date: sevenAgo, bpm: 54 }],
      steps: [{ date: today, count: 11000 }],
    },
  };
}
const PROGRAM = {
  totalWeeks: 12,
  days: {
    mon: { title: 'Squat', runs: 'Rest', lifts: [{ name: 'Back Squat' }] },
    wed: { title: 'Run', runs: '5k easy' },
  },
};
const modelFor = (state) => computeDashboardModel(state, DAYS, PROGRAM, 'mon');

// ---------------------------------------------------------------------------
// config / levels
// ---------------------------------------------------------------------------
test('levelFromXp: ladder resolves tiers and next-tier progress', () => {
  assert.equal(levelFromXp(0).name, 'Initiate');
  assert.equal(levelFromXp(0).tier, 1);
  const l = levelFromXp(500);
  assert.equal(l.name, 'Builder');
  assert.equal(levelFromXp(4000).name, 'Hybrid Athlete');
  assert.equal(levelFromXp(999999).name, 'Legend');
  assert.equal(levelFromXp(999999).next, null);
  // progress within a tier is 0..100
  const mid = levelFromXp(1000); // between Builder(500) and Competitor(1500)
  assert.equal(mid.name, 'Builder');
  assert.equal(mid.progressPct, 50);
});

test('xpForDay: rewards completion + score, banks streak milestones', () => {
  assert.ok(xpForDay({ score: 90, sessionCompleted: true, anyLogged: true }) >
            xpForDay({ score: 50, sessionCompleted: false, anyLogged: true }));
  const withMilestone = xpForDay({ score: 80, sessionCompleted: true, anyLogged: true, streak: 7 });
  const without = xpForDay({ score: 80, sessionCompleted: true, anyLogged: true, streak: 6 });
  assert.equal(withMilestone - without, 25);
});

test('scoreBand + isDeloadWeek', () => {
  assert.equal(scoreBand(95).status, 'Elite');
  assert.equal(scoreBand(30).status, 'At Risk');
  assert.equal(scoreBand(null).status, 'Calibrating');
  assert.equal(isDeloadWeek({ currentWeek: '4' }, 'Deload Week'), true);
  assert.equal(isDeloadWeek({ currentWeek: '4', deloadApplied: '4' }, 'Build'), true);
  assert.equal(isDeloadWeek({ currentWeek: '3' }, 'Build'), false);
});

// ---------------------------------------------------------------------------
// model-only pillars
// ---------------------------------------------------------------------------
test('consistencyPillar: null with no data, high when adherent + streak', () => {
  assert.equal(consistencyPillar({ week: { consistencyTotal: 0 }, streak: {}, goal: {} }).score, null);
  const p = consistencyPillar({
    week: { consistencyTotal: 4, consistencyDone: 4, consistencyPct: 100 },
    streak: { current: 5 }, goal: { avgConsistency: 90 },
  });
  assert.ok(p.score >= 95);
  assert.ok(p.signals.some(s => /done/.test(s)));
});

test('recoveryPillar: uses readiness score, flags poor sleep', () => {
  const p = recoveryPillar({
    ready: { hasData: true, score: 45, status: 'Low', components: { sleep: 30 } },
    load: { hasData: true, tsb: -20 },
  });
  assert.equal(p.score, 45);
  assert.ok(p.signals.includes('poor sleep'));
  assert.ok(p.signals.includes('high fatigue'));
  assert.equal(recoveryPillar({ ready: { hasData: false }, load: { hasData: false } }).score, null);
});

test('momentumPillar: rising series scores above 50', () => {
  const up = momentumPillar({ series: { volume: [100, 120, 150], distance: [5, 6, 7], ctl: [8, 9, 10] } });
  assert.ok(up.score > 50);
  assert.ok(up.signals.some(s => /up/.test(s)));
  const down = momentumPillar({ series: { volume: [150, 120, 100], distance: [7, 6, 5], ctl: [10, 9, 8] } });
  assert.ok(down.score < 50);
  assert.equal(momentumPillar({ series: {} }).score, null);
});

test('bodyPillar: goal-aware scoring', () => {
  assert.ok(bodyPillar({ bodyweight: { hasData: true, delta7: -0.5 } }, { settings: { weightGoal: 'cut' } }).score >= 70);
  assert.ok(bodyPillar({ bodyweight: { hasData: true, delta7: 1.5 } }, { settings: { weightGoal: 'cut' } }).score < 70);
  assert.ok(bodyPillar({ bodyweight: { hasData: true, delta7: 0 } }, { settings: { weightGoal: 'maintain' } }).score >= 90);
  assert.equal(bodyPillar({ bodyweight: { hasData: false } }, {}).score, null);
});

test('lifestylePillar: blends sleep/steps/fasting; null when empty', () => {
  const p = lifestylePillar({ health: { sleepHours: 8, steps: 11000 }, fasting: { streak: 4 } });
  assert.ok(p.score > 70);
  assert.equal(lifestylePillar({ health: {}, fasting: {} }).score, null);
});

// ---------------------------------------------------------------------------
// engine — integration on the real dashboard model
// ---------------------------------------------------------------------------
test('computeHybridScore: calibrating with an empty athlete', () => {
  // No program assigned and nothing logged → nothing to score yet.
  const state = { currentWeek: '1', settings: {}, weeks: {} };
  const model = computeDashboardModel(state, DAYS, null, 'mon');
  const r = computeHybridScore(model, state, DAYS);
  assert.equal(r.hasData, false);
  assert.equal(r.score, null);
  assert.equal(r.band.status, 'Calibrating');
  assert.equal(r.confidence, 0);
});

test('computeHybridScore: progressing hybrid athlete scores well with drivers', () => {
  const state = makeState();
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);

  assert.equal(r.hasData, true);
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(r.score >= 60, `expected a healthy score, got ${r.score}`);
  assert.ok(r.confidence > 50);
  assert.ok(r.level && r.level.name);
  assert.ok(r.drivers.length > 0);
  assert.ok(r.headline.includes(String(r.score)));

  // Explainability invariant: rounded pillar contributions sum to ~ score-50.
  const avail = Object.values(r.pillars).filter(p => p.score != null);
  const sum = avail.reduce((a, p) => a + (p.contribution || 0), 0);
  assert.ok(Math.abs(sum - (r.score - 50)) <= avail.length,
    `contributions ${sum} should ~equal score-50 ${r.score - 50}`);
});

test('computeHybridScore: a low-readiness day surfaces a recovery opportunity', () => {
  const state = makeState();
  // Wreck recovery: terrible sleep + high fatigue load.
  state.wellnessLog = [{ date: iso(new Date()), mood: 1, soreness: 5, sleep: 3 }];
  state.healthConnect.sleep = [{ date: iso(new Date()), totalHours: 3.5 }];
  state.loadMetrics = { atl: 18, ctl: 10 }; // ACWR 1.8 — spiking
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);
  assert.ok(r.topOpportunity, 'should have an opportunity');
  assert.ok(r.recommendation && r.recommendation.length > 0);
  // The biggest drag should be an actionable pillar.
  assert.ok(['recovery', 'load', 'consistency', 'endurance', 'strength', 'lifestyle'].includes(r.topOpportunity.pillar));
});

test('computeHybridScore: planned deload reweights and is not punished', () => {
  const state = makeState({ currentWeek: 4 }); // week 4 = "Deload Week" in WEEK_PHASE_NAMES
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);
  assert.equal(r.deload, true);
  // Strength/endurance weight is shifted down on a deload.
  if (r.pillars.strength.score != null && r.pillars.recovery.score != null) {
    assert.ok(r.pillars.strength.weight <= Math.round(PILLAR_WEIGHTS.strength * 100) + 1);
  }
});

// ---------------------------------------------------------------------------
// history / XP recorder
// ---------------------------------------------------------------------------
test('recordDailyScore: idempotent per day, banks XP once', () => {
  const state = makeState();
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);

  const first = recordDailyScore(state, r, model);
  assert.equal(first.changed, true);
  const xpAfterFirst = state.hybridScore.xp;
  assert.ok(xpAfterFirst > 0);
  assert.equal(state.hybridScore.history.length, 1);

  // Same day again with identical score → no change, no double XP.
  const second = recordDailyScore(state, r, model);
  assert.equal(second.changed, false);
  assert.equal(state.hybridScore.xp, xpAfterFirst);
  assert.equal(state.hybridScore.history.length, 1);

  assert.equal(currentLevel(state).xp, xpAfterFirst);
});

test('recordDailyScore: milestones — level-up, streak, first 90+ (once each)', () => {
  const mkModel = (streak, done = true) => ({
    rec: { badge: done ? 'Session Done' : '' },
    week: { consistencyDone: done ? 5 : 0 },
    streak: { current: streak },
  });
  const score = (n) => ({ score: n, level: { tier: 1 } });

  // Level-up: 480 XP + a completed high-score day crosses Builder (500).
  const s1 = { hybridScore: { xp: 480, history: [], lastRecordedDate: null } };
  const r1 = recordDailyScore(s1, score(85), mkModel(3), '2026-07-02');
  assert.ok(r1.milestones.some(m => m.kind === 'level' && m.name === 'Builder'), JSON.stringify(r1.milestones));

  // Streak milestone on day 7; first-ever 90+ fires alongside it.
  const s2 = { hybridScore: { xp: 0, history: [{ date: '2026-07-01', score: 85, level: 1 }], lastRecordedDate: '2026-07-01' } };
  const r2 = recordDailyScore(s2, score(91), mkModel(7), '2026-07-02');
  assert.ok(r2.milestones.some(m => m.kind === 'streak' && m.days === 7));
  assert.ok(r2.milestones.some(m => m.kind === 'score' && m.score === 91));

  // Next day: another 90+ does NOT re-fire the score milestone, and streak 8
  // is not a milestone day.
  const r3 = recordDailyScore(s2, score(92), mkModel(8), '2026-07-03');
  assert.equal(r3.milestones.length, 0, JSON.stringify(r3.milestones));

  // Same-day re-record never re-fires milestones (idempotent).
  const r4 = recordDailyScore(s2, score(95), mkModel(8), '2026-07-03');
  assert.deepEqual(r4.milestones, []);
});

test('recordDailyScore: delta reflects yesterday, trends bucket', () => {
  const state = makeState();
  const y = iso(new Date(Date.now() - 86400000));
  state.hybridScore = { history: [{ date: y, score: 70, level: 2 }], xp: 300, lastRecordedDate: y };
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);
  assert.equal(typeof r.delta, 'number'); // today vs yesterday(70)

  recordDailyScore(state, r, model);
  assert.equal(state.hybridScore.history.length, 2);
  assert.ok(dailySeries(state, 30).length === 2);
  assert.ok(bucketedTrend(state, 'week').length >= 1);
  assert.ok(bucketedTrend(state, 'month').length >= 1);
});
