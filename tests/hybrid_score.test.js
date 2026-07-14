import { test } from 'node:test';
import assert from 'node:assert/strict';

import { levelFromXp, xpForDay } from '../js/brain/hybrid-score/levels.js';
import { scoreBand, isDeloadWeek, PILLAR_WEIGHTS } from '../js/brain/hybrid-score/config.js';
import { consistencyPillar, recoveryPillar, momentumPillar, bodyPillar, lifestylePillar, endurancePillar } from '../js/brain/hybrid-score/pillars.js';
import { weeklyBestPaceSeries } from '../js/metrics/metrics-running.js';
import { computeHybridScore } from '../js/brain/hybrid-score/hybrid-score.js';
import { recordDailyScore, dailySeries, bucketedTrend, currentLevel } from '../js/brain/hybrid-score/history.js';
import { computeDashboardModel } from '../js/home/dashboard-model.js';
import { addDaysISO, todayKey } from '../js/dates.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TODAY = todayKey();

// ---------------------------------------------------------------------------
// Fixture: a realistic multi-week hybrid athlete progressing on both modalities.
// ---------------------------------------------------------------------------
function makeState({ currentWeek = 5, weightGoal = 'maintain', fitnessLevel = 'intermediate' } = {}) {
  const start = addDaysISO(TODAY, -(currentWeek - 1) * 7); // week 1 Monday-ish
  const weeks = {};
  for (let w = 1; w <= currentWeek; w++) {
    const squat = 100 + (w - 1) * 5;         // progressing strength
    const dist = 5 + (w - 1) * 0.75;         // progressing distance
    const monISO = addDaysISO(start, (w - 1) * 7);
    const wedISO = addDaysISO(monISO, 2);
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
  const today = TODAY;
  const sevenAgo = addDaysISO(today, -7);
  return {
    currentWeek: String(currentWeek),
    weekStartedAt: addDaysISO(today, -2),
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

test('E1 — consistency no longer sawtooths: Monday ≈ Friday, no reset cliff', () => {
  const base = { goal: { avgConsistency: 90 }, streak: { current: 0 } };
  // Monday: nothing done yet this week (0%), established baseline 90%.
  const mon = consistencyPillar({ ...base, week: { consistencyTotal: 6, consistencyDone: 0, consistencyPct: 0 } });
  // Friday: most of the week done (83%).
  const fri = consistencyPillar({ ...base, week: { consistencyTotal: 6, consistencyDone: 5, consistencyPct: 83 } });
  // The old model gave Monday ≈ 36 and Friday ≈ 86 — a 50-point weekly cliff.
  // Now Monday holds at the baseline and Friday only rises above it.
  assert.ok(mon.score >= 85, `Monday should hold near baseline, got ${mon.score}`);
  assert.ok(fri.score >= mon.score, 'a fuller week should not score below Monday');
  assert.ok(fri.score - mon.score <= 12, `weekly swing should be small, got ${fri.score - mon.score}`);
});

test('E2 — best-effort pace ignores added easy volume', () => {
  const DAYS2 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  // One fast 5k (4:00/km = 1200s over 5k → 240 s/km) on Monday.
  const wk = { runs: { mon: { dist: '5', time: '20:00', rpe: '7' } }, lifts: {}, dates: {} };
  const fast = { currentWeek: '1', weeks: { '1': wk } };
  const bpFast = weeklyBestPaceSeries(fast, DAYS2, 1)[0];
  // Add a slow easy 8k (6:15/km) — this LOWERS average pace but not best-effort.
  const wk2 = { runs: { mon: { dist: '5', time: '20:00', rpe: '7' }, wed: { dist: '8', time: '50:00', rpe: '4' } }, lifts: {}, dates: {} };
  const withEasy = { currentWeek: '1', weeks: { '1': wk2 } };
  const bpEasy = weeklyBestPaceSeries(withEasy, DAYS2, 1)[0];
  assert.equal(Math.round(bpFast), 240);
  assert.equal(Math.round(bpEasy), 240); // best-effort unchanged by the easy run
});

test('E2 — endurance pillar not penalised for adding easy volume', () => {
  const DAYS2 = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const iso2 = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  // 5 weeks, best-effort pace improving each week; build two variants.
  const mk = (withEasy) => {
    const weeks = {};
    for (let w = 1; w <= 5; w++) {
      const fastSec = 1300 - (w - 1) * 20; // fast run total seconds over 5k, improving
      const mm = Math.floor(fastSec / 60), ss = String(fastSec % 60).padStart(2, '0');
      const runs = { wed: { dist: '5', time: `${mm}:${ss}`, rpe: '7' } };
      if (withEasy) runs.sat = { dist: '10', time: '65:00', rpe: '3' }; // slow easy volume
      weeks[String(w)] = { runs, lifts: {}, dates: {} };
    }
    return { currentWeek: '5', weeks, settings: { fitnessLevel: 'intermediate' } };
  };
  const model = { maxWeek: 5, wkNum: 5, week: { consistencyPct: 80 } };
  const plain = endurancePillar(model, mk(false), DAYS2, 'intermediate').score;
  const easy = endurancePillar(model, mk(true), DAYS2, 'intermediate').score;
  // Adding easy volume must not lower the endurance score (it may raise it).
  assert.ok(easy >= plain - 1, `easy volume should not penalise endurance: plain ${plain}, easy ${easy}`);
});

test('E3 — Recovery uses load-excluded readiness, independent of ACWR', () => {
  // Same recovery signals (readyNoLoad), wildly different ACWR → same Recovery.
  const mk = (acwr) => ({
    readyNoLoad: { hasData: true, score: 72, status: 'Ready', components: { sleep: 80 } },
    ready: { hasData: true, score: 55, components: {} },
    load: { hasData: true, acwr, tsb: 0 },
  });
  const a = recoveryPillar(mk(0.9));
  const b = recoveryPillar(mk(1.7));
  assert.equal(a.score, 72);           // uses readyNoLoad, not the load-tainted ready
  assert.equal(a.score, b.score);      // ACWR no longer moves Recovery (no double-count)
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

test('momentumPillar (E3): reads the score history trend, not raw series', () => {
  const hist = (scores) => ({ hybridScore: { history: scores.map((s, i) => ({ date: `2026-07-0${i + 1}`, score: s })) } });
  const up = momentumPillar({}, hist([70, 73, 76, 80]));
  assert.ok(up.score > 50);
  assert.ok(up.signals.some(s => /up/.test(s)));
  const down = momentumPillar({}, hist([85, 80, 75, 70]));
  assert.ok(down.score < 50);
  // Fewer than 3 recorded days → no momentum yet (drops out).
  assert.equal(momentumPillar({}, hist([80, 82])).score, null);
  assert.equal(momentumPillar({}, {}).score, null);
});

test('bodyPillar: goal-aware scoring', () => {
  assert.ok(bodyPillar({ bodyweight: { hasData: true, delta7: -0.5 } }, { settings: { weightGoal: 'cut' } }).score >= 70);
  assert.ok(bodyPillar({ bodyweight: { hasData: true, delta7: 1.5 } }, { settings: { weightGoal: 'cut' } }).score < 70);
  assert.ok(bodyPillar({ bodyweight: { hasData: true, delta7: 0 } }, { settings: { weightGoal: 'maintain' } }).score >= 90);
  assert.equal(bodyPillar({ bodyweight: { hasData: false } }, {}).score, null);
});

test('lifestylePillar (E3): steps + fasting only — sleep is Recovery-owned', () => {
  const p = lifestylePillar({ health: { steps: 11000 }, fasting: { streak: 4 } });
  assert.ok(p.score > 70);
  // Sleep alone no longer creates a Lifestyle score (it lives in Recovery).
  assert.equal(lifestylePillar({ health: { sleepHours: 8 }, fasting: {} }).score, null);
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

// ---------------------------------------------------------------------------
// Day-0 / first-run (Sprint 1.1): a brand-new athlete must never be branded
// "At Risk"; the provisional prior carries their starting Score and decays.
// ---------------------------------------------------------------------------
// A fresh install: an active program (so a plan exists) with ghost sets seeded
// but nothing logged, no history, no wellness.
function day0State({ provisional = null } = {}) {
  const s = {
    currentWeek: '1',
    settings: { fitnessLevel: 'intermediate', distanceUnit: 'km' },
    weeks: { '1': { lifts: { mon: { 'Back Squat': [
      { w: '', r: '', c: false }, { w: '', r: '', c: false }, { w: '', r: '', c: false },
    ] } } } },
  };
  if (provisional) s.hybridScore = { history: [], xp: 0, lastRecordedDate: null, provisional };
  return s;
}

test('consistencyPillar: no baseline + nothing done yet → null (not a punishing 0)', () => {
  const state = day0State();
  const model = modelFor(state);
  assert.ok(model.week.consistencyTotal > 0, 'a plan exists (ghost sets + run)');
  assert.equal(model.week.consistencyDone, 0);
  const p = consistencyPillar(model);
  assert.equal(p.score, null, 'consistency has no data to judge yet');
});

test('computeHybridScore: day-0 with a provisional prior shows the starting Score, never "At Risk"', () => {
  const provisional = {
    score: 65,
    pillars: { consistency: 66, load: 66, recovery: 68, lifestyle: 66, strength: 65, endurance: 60 },
  };
  const state = day0State({ provisional });
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);

  assert.equal(r.hasData, true);
  assert.equal(r.provisional, true);
  assert.ok(r.score >= 55, `provisional score should be healthy, got ${r.score}`);
  assert.notEqual(r.band.status, 'At Risk');
  assert.notEqual(r.band.status, 'Fragile');
  // Confidence stays honest — priors don't inflate it.
  assert.ok(r.confidence < 40, `confidence should reflect zero real data, got ${r.confidence}`);
  // No provisional pillar is a "why today" driver (nothing was earned).
  assert.equal(r.drivers.length, 0);
  assert.match(r.recommendation, /first session/i);
});

test('computeHybridScore: day-0 band is floored to Building even for a low provisional', () => {
  // A conservative self-report (would otherwise land "Fragile"/"At Risk").
  const provisional = { score: 46, pillars: { consistency: 45, load: 45, recovery: 44, lifestyle: 45 } };
  const state = day0State({ provisional });
  const r = computeHybridScore(modelFor(state), state, DAYS);
  assert.equal(r.band.status, 'Building', 'never brand a calibrating new user Fragile/At Risk');
});

test('computeHybridScore: day-0 with NO provisional calibrates (never 0/At Risk)', () => {
  const state = day0State();
  const r = computeHybridScore(modelFor(state), state, DAYS);
  assert.equal(r.hasData, false);
  assert.equal(r.band.status, 'Calibrating');
});

test('computeHybridScore: provisional decays — a real pillar overrides its prior', () => {
  const provisional = { score: 65, pillars: { consistency: 90, load: 66, recovery: 68 } };
  // Real logged data with a genuinely LOW consistency baseline should win over
  // the rosy provisional prior once it exists.
  const state = makeState({ currentWeek: 4 });
  state.hybridScore = { history: [], xp: 0, lastRecordedDate: null, provisional };
  const model = modelFor(state);
  const real = consistencyPillar(model);
  assert.ok(real.score != null, 'consistency now has real data');
  const r = computeHybridScore(model, state, DAYS);
  // The real consistency pillar is a driver; the prior is not used for it.
  assert.ok(r.pillars.consistency.provisional !== true, 'real consistency overrides the prior');
  assert.ok(r.confidence > 40, 'real data lifts confidence past the provisional floor');
});

test('recordDailyScore: a provisional score is never banked (XP stays earned)', () => {
  const provisional = { score: 65, pillars: { consistency: 66, load: 66, recovery: 68 } };
  const state = day0State({ provisional });
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);
  const res = recordDailyScore(state, r, model, TODAY);
  assert.equal(res.changed, false);
  assert.equal(state.hybridScore.xp, 0);
  assert.equal(state.hybridScore.history.length, 0);
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
  state.wellnessLog = [{ date: TODAY, mood: 1, soreness: 5, sleep: 3 }];
  state.healthConnect.sleep = [{ date: TODAY, totalHours: 3.5 }];
  state.loadMetrics = { atl: 18, ctl: 10 }; // ACWR 1.8 — spiking
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);
  assert.ok(r.topOpportunity, 'should have an opportunity');
  assert.ok(r.recommendation && r.recommendation.length > 0);
  // The biggest drag should be an actionable pillar.
  assert.ok(['recovery', 'load', 'consistency', 'endurance', 'strength', 'lifestyle'].includes(r.topOpportunity.pillar));
});

test('computeHybridScore: the active program\'s planned deload reweights and is not punished', () => {
  const state = makeState({ currentWeek: 4 });
  const model = modelFor(state);
  const program = { weeklyVolModifiers: { '4': { intensityLabel: 'Program deload' } } };
  const r = computeHybridScore(model, state, DAYS, program);
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

test('E7 — recordDailyScore stores per-pillar contributions', () => {
  const state = makeState();
  const model = modelFor(state);
  const r = computeHybridScore(model, state, DAYS);
  recordDailyScore(state, r, model);
  const entry = state.hybridScore.history[state.hybridScore.history.length - 1];
  assert.ok(entry.contributions && typeof entry.contributions === 'object');
  // The stored contributions match the available pillars' rounded contributions.
  const avail = Object.keys(r.pillars).filter(k => r.pillars[k].score != null);
  for (const k of avail) assert.equal(entry.contributions[k], r.pillars[k].contribution);
});

test('E7 — deltaBreakdown attributes the change and ~sums to the delta', () => {
  const state = makeState();
  const yday = addDaysISO(TODAY, -1);
  // Yesterday: same pillars but a weaker recovery contribution and a stronger
  // consistency one, so we expect specific movers today.
  const model = modelFor(state);
  const r0 = computeHybridScore(model, state, DAYS);
  // Seed yesterday from a perturbed copy of today's contributions.
  const yContribs = {};
  Object.keys(r0.pillars).filter(k => r0.pillars[k].score != null).forEach(k => { yContribs[k] = r0.pillars[k].contribution; });
  yContribs.recovery = (yContribs.recovery ?? 0) - 4; // recovery was worse yesterday
  const yScore = r0.score - 3;
  state.hybridScore = { xp: 500, lastRecordedDate: yday, history: [{ date: yday, score: yScore, level: 2, contributions: yContribs }] };

  const r = computeHybridScore(model, state, DAYS);
  assert.equal(r.delta, r.score - yScore);
  assert.ok(Array.isArray(r.deltaBreakdown) && r.deltaBreakdown.length > 0);
  // Recovery should be among the movers (it was −4 yesterday → +4 today).
  assert.ok(r.deltaBreakdown.some(d => d.pillar === 'recovery' && d.delta > 0));
  // Sum of pillar deltas ≈ score delta (rounding tolerance).
  const sum = r.deltaBreakdown.reduce((a, d) => a + d.delta, 0);
  assert.ok(Math.abs(sum - r.delta) <= r.deltaBreakdown.length,
    `breakdown ${sum} should ~equal delta ${r.delta}`);
  // No prior contributions → no breakdown.
  const fresh = makeState();
  assert.equal(computeHybridScore(modelFor(fresh), fresh, DAYS).deltaBreakdown, null);
});

test('recordDailyScore: delta reflects yesterday, trends bucket', () => {
  const state = makeState();
  const y = addDaysISO(TODAY, -1);
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
