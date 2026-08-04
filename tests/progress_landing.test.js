// =============================================================================
// PROGRESS LANDING MODEL — roadmap Phase 3A.
//
// The Progress hub is now a decision surface rather than a static index, so it
// carries the same obligations as every other analytics surface: calendar-week
// attribution (never the program-week counter), like-for-like partial-week
// comparisons, same-exercise strength only, honest empty states, and no
// fabricated precision when there is nothing to compare against.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProgressLanding, plannedTrainingDays, fastingIsEnabled, secondaryDestinations,
} from '../js/analytics/progress-landing.js';

const work = (w, r) => ({ c: true, w: String(w), r: String(r) });
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Monday 13 Jul 2026; previous calendar week starts Monday 6 Jul.
const WK = '2026-07-13';
const PREV = '2026-07-06';

const domainOf = (model, id) => model.domains.find((d) => d.id === id);

const program = (days) => ({ days });
const TRAIN = { lifts: ['Bench Press'], runs: 'Rest' };
const REST = { lifts: [], runs: 'Rest' };

// ---- planned training days --------------------------------------------------

test('plannedTrainingDays counts lifting and running days but not rest days', () => {
  assert.equal(plannedTrainingDays(program({
    mon: TRAIN, tue: REST, wed: TRAIN, thu: REST,
    fri: TRAIN, sat: { lifts: [], runs: '🏃 40min Zone 2' }, sun: REST,
  })), 4);
});

test('plannedTrainingDays returns null rather than 0 when there is no usable program', () => {
  assert.equal(plannedTrainingDays(null), null);
  assert.equal(plannedTrainingDays({}), null);
  assert.equal(plannedTrainingDays(program({ mon: REST, tue: REST })), null);
});

test('plannedTrainingDays uses the canonical rest-day classifier, not its own rule', () => {
  // "No running" phrasings are rest days everywhere else in the app, so a
  // lift-free day carrying one must not be counted as a planned session here.
  assert.equal(plannedTrainingDays(program({
    mon: TRAIN,
    tue: { lifts: [], runs: '💤 No running. Full recovery.' },
    wed: { lifts: [], runs: 'no structured running' },
  })), 1);
});

test('the default programme plans six sessions, not seven', async () => {
  // Regression: the default programme's Sunday is titled "Full Rest" but its
  // `runs` string once matched no rest pattern, so the canonical classifier
  // called it a Run Day — inflating planned sessions and misleading the Today
  // card and coach on every new profile.
  const { PROGRAMS } = await import('../js/constants.js');
  const def = PROGRAMS.hybrid_engine;
  assert.equal(plannedTrainingDays(def), 6);
  const { classifyPlannedSession } = await import('../js/workout/completion-policy.js');
  assert.equal(classifyPlannedSession(def.days.sun).isRest, true);
  assert.equal(classifyPlannedSession(def.days.sun).label, 'Rest Day');
});

// ---- consistency ------------------------------------------------------------

test('consistency counts logged days by real stamped date, not the program week', () => {
  // currentWeek says 9, but the dates put this work in the current calendar week.
  const state = {
    currentWeek: '9',
    weeks: {
      '4': { dates: { mon: '2026-07-13', wed: '2026-07-15' }, lifts: {
        mon: { Bench: [work(100, 5)] }, wed: { Bench: [work(100, 5)] },
      } },
    },
  };
  const model = buildProgressLanding(state, { days: DAYS, today: '2026-07-16' });
  assert.equal(model.weekStart, WK);
  assert.equal(domainOf(model, 'consistency').headline.value, '2');
  // The program-week counter must not have been read or mutated.
  assert.equal(state.currentWeek, '9');
});

test('consistency attributes an archived activation\'s sessions to their real dates', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      'arch:old-run:6': { dates: { tue: '2026-07-14' }, lifts: { tue: { Bench: [work(100, 5)] } } },
      '1': { dates: { thu: '2026-07-16' }, lifts: { thu: { Bench: [work(100, 5)] } } },
    },
  };
  const model = buildProgressLanding(state, { days: DAYS, today: '2026-07-17' });
  assert.equal(domainOf(model, 'consistency').headline.value, '2');
});

test('a live week compares only its elapsed portion against the same days last week', () => {
  // Last week: 4 sessions (Mon–Thu). This week: 2 by Tuesday.
  const state = {
    currentWeek: '1',
    weeks: {
      '1': {
        dates: { mon: PREV, tue: '2026-07-07', wed: '2026-07-08', thu: '2026-07-09' },
        lifts: {
          mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(100, 5)] },
          wed: { Bench: [work(100, 5)] }, thu: { Bench: [work(100, 5)] },
        },
      },
      '2': {
        dates: { mon: WK, tue: '2026-07-14' },
        lifts: { mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(100, 5)] } },
      },
    },
  };
  const model = buildProgressLanding(state, { days: DAYS, today: '2026-07-14' });
  const consistency = domainOf(model, 'consistency');
  // Two elapsed days both weeks → 2 vs 2 = flat, NOT 2 vs 4.
  assert.equal(consistency.headline.value, '2');
  assert.equal(consistency.delta.tone, 'flat');
  assert.match(consistency.delta.text, /same point last week/);
  // A level week is stated in words, never as a bare "0".
  assert.equal(consistency.delta.text, 'Level with same point last week');
});

test('a session gained or lost is counted in sessions, with correct pluralisation', () => {
  const base = (dates, lifts) => ({ currentWeek: '1', weeks: { '1': { dates, lifts } } });
  const one = base(
    { mon: PREV, tue: WK, wed: '2026-07-15' },
    { mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(100, 5)] }, wed: { Bench: [work(100, 5)] } },
  );
  // Week of 13 Jul has 2 sessions, week of 6 Jul has 1 → +1 session.
  const model = buildProgressLanding(one, { days: DAYS, today: '2026-07-27', weekStart: WK });
  assert.equal(domainOf(model, 'consistency').delta.text, '+1 session vs previous week');
});

test('a completed past week compares full week against full week', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)] } } },
      '2': {
        dates: { mon: WK, tue: '2026-07-14', wed: '2026-07-15' },
        lifts: {
          mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(100, 5)] }, wed: { Bench: [work(100, 5)] },
        },
      },
    },
  };
  // Viewing the 13 Jul week from a later week → completed framing.
  const model = buildProgressLanding(state, { days: DAYS, today: '2026-07-27', weekStart: WK });
  const consistency = domainOf(model, 'consistency');
  assert.equal(consistency.headline.value, '3');
  assert.match(consistency.delta.text, /vs previous week/);
  assert.equal(consistency.delta.tone, 'up');
});

test('consistency states remaining planned sessions and never a negative remainder', () => {
  const plan = program({ mon: TRAIN, tue: REST, wed: TRAIN, thu: REST, fri: TRAIN, sat: REST, sun: REST });
  const state = {
    currentWeek: '1',
    weeks: { '1': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } } },
  };
  const model = buildProgressLanding(state, { days: DAYS, today: '2026-07-14', program: plan });
  const consistency = domainOf(model, 'consistency');
  assert.equal(consistency.headline.unit, 'of 3 planned');
  assert.match(consistency.interpretation, /2 of 3 planned sessions still to go/);

  // Training MORE than planned must read as hitting the plan, never "-1 to go".
  const over = {
    currentWeek: '1',
    weeks: { '1': {
      dates: { mon: WK, tue: '2026-07-14', wed: '2026-07-15', thu: '2026-07-16' },
      lifts: {
        mon: { Bench: [work(100, 5)] }, tue: { Bench: [work(100, 5)] },
        wed: { Bench: [work(100, 5)] }, thu: { Bench: [work(100, 5)] },
      },
    } },
  };
  const overModel = buildProgressLanding(over, { days: DAYS, today: '2026-07-17', program: plan });
  assert.match(domainOf(overModel, 'consistency').interpretation, /hit all 3 planned/);
});

test('an empty consistency week is an honest zero with no fabricated delta', () => {
  const model = buildProgressLanding({ currentWeek: '1', weeks: {} }, { days: DAYS, today: '2026-07-16' });
  const consistency = domainOf(model, 'consistency');
  assert.equal(consistency.empty, true);
  assert.equal(consistency.headline.value, '0');
  assert.equal(consistency.delta, null);
  assert.match(consistency.interpretation, /No training logged/);
});

test('undated legacy activity is excluded rather than guessed onto a calendar day', () => {
  const state = {
    currentWeek: '1',
    weeks: { '1': { lifts: { mon: { Bench: [work(100, 5)] } } } }, // no dates map
  };
  const model = buildProgressLanding(state, { days: DAYS, today: '2026-07-16' });
  assert.equal(domainOf(model, 'consistency').headline.value, '0');
});

// ---- strength ---------------------------------------------------------------

test('strength reports the biggest same-exercise change and names the lift', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(100, 5)], Squat: [work(140, 5)] } } },
      '2': { dates: { mon: WK }, lifts: { mon: { Bench: [work(110, 5)], Squat: [work(142.5, 5)] } } },
    },
  };
  const strength = domainOf(buildProgressLanding(state, { days: DAYS, today: '2026-07-16' }), 'strength');
  assert.equal(strength.headline.unit, 'kg est. 1RM');
  assert.match(strength.delta.text, /^Bench vs last week$/);  // Bench gained most
  assert.equal(strength.delta.tone, 'up');
  assert.match(strength.interpretation, /Bench/);
});

test('strength never compares two different exercises when there is no prior week', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': { dates: { mon: PREV }, lifts: { mon: { Squat: [work(200, 5)] } } },
      '2': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } },
    },
  };
  const strength = domainOf(buildProgressLanding(state, { days: DAYS, today: '2026-07-16' }), 'strength');
  // Bench has no previous Bench, and must NOT be compared with last week's Squat.
  assert.equal(strength.delta.tone, 'none');
  assert.match(strength.delta.text, /No prior week for the same lift/);
  assert.match(strength.interpretation, /like-for-like/);
});

test('a strength week with no logged work is empty, not zero', () => {
  const strength = domainOf(
    buildProgressLanding({ currentWeek: '1', weeks: {} }, { days: DAYS, today: '2026-07-16' }),
    'strength',
  );
  assert.equal(strength.empty, true);
  assert.equal(strength.headline.value, '—');
  assert.equal(strength.delta, null);
});

test('a strength decline is reported plainly without alarm or a change instruction', () => {
  const state = {
    currentWeek: '1',
    weeks: {
      '1': { dates: { mon: PREV }, lifts: { mon: { Bench: [work(110, 5)] } } },
      '2': { dates: { mon: WK }, lifts: { mon: { Bench: [work(100, 5)] } } },
    },
  };
  const strength = domainOf(buildProgressLanding(state, { days: DAYS, today: '2026-07-16' }), 'strength');
  assert.equal(strength.delta.tone, 'down');
  assert.match(strength.interpretation, /check the trend before changing the plan/);
});

// ---- running ----------------------------------------------------------------

test('running is empty and self-explaining when no metric model is supplied', () => {
  const running = domainOf(buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-16' }), 'running');
  assert.equal(running.empty, true);
  assert.equal(running.headline.value, '—');
  assert.match(running.interpretation, /No runs logged/);
});

test('running reuses the injected metric model rather than recomputing distance', () => {
  const running = domainOf(buildProgressLanding({ weeks: {} }, {
    days: DAYS, today: '2026-07-16',
    runningMetric: (id) => {
      assert.equal(id, 'running.weekly-distance');
      return {
        empty: false, formattedValue: '18.4 km', interpretation: 'Steady week.',
        comparison: { isComparable: true, percentageChange: 12, direction: 'up', comparisonLabel: 'vs same point last week' },
      };
    },
  }), 'running');
  assert.equal(running.headline.value, '18.4 km');
  assert.equal(running.delta.text, '+12% vs same point last week');
  assert.equal(running.delta.tone, 'up');
  assert.equal(running.interpretation, 'Steady week.');
});

test('running shows the honest message instead of a percentage when nothing to compare', () => {
  const running = domainOf(buildProgressLanding({ weeks: {} }, {
    days: DAYS, today: '2026-07-16',
    runningMetric: () => ({
      empty: false, formattedValue: '5.0 km', interpretation: 'First week.',
      comparison: { isComparable: false, percentageChange: null, direction: 'up', message: 'None at this point last week', comparisonLabel: 'vs same point last week' },
    }),
  }), 'running');
  assert.equal(running.delta.text, 'None at this point last week');
  assert.equal(running.delta.tone, 'none');
});

// ---- recovery ---------------------------------------------------------------

test('recovery states readiness confidence and signal count', () => {
  const recovery = domainOf(buildProgressLanding({ weeks: {} }, {
    days: DAYS, today: '2026-07-16',
    readiness: { score: 72, status: 'Ready', confidence: 'medium', inputCount: 3, recommendation: 'Train as planned.' },
  }), 'recovery');
  assert.equal(recovery.headline.value, '72');
  assert.equal(recovery.headline.unit, 'Ready');
  assert.equal(recovery.support, 'medium confidence · 3 signals');
  assert.equal(recovery.interpretation, 'Train as planned.');
});

test('recovery is empty rather than a confident zero when readiness has no score', () => {
  const recovery = domainOf(
    buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-16', readiness: { score: 0, inputCount: 0 } }),
    'recovery',
  );
  assert.equal(recovery.empty, true);
  assert.equal(recovery.headline.value, '—');
});

test('one signal is described in the singular', () => {
  const recovery = domainOf(buildProgressLanding({ weeks: {} }, {
    days: DAYS, today: '2026-07-16',
    readiness: { score: 60, status: 'Steady', confidence: 'low', inputCount: 1 },
  }), 'recovery');
  assert.equal(recovery.support, 'low confidence · 1 signal');
});

// ---- structure and secondary destinations -----------------------------------

test('the landing exposes the four roadmap domains in priority order', () => {
  const model = buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-16' });
  assert.deepEqual(model.domains.map((d) => d.id), ['consistency', 'strength', 'running', 'recovery']);
  // Each domain carries what the detail-screen contract needs to render.
  model.domains.forEach((d) => {
    assert.ok(d.title, `${d.id} has a title`);
    assert.ok(d.context, `${d.id} routes somewhere`);
    assert.ok(d.headline && typeof d.headline.value === 'string', `${d.id} has a headline`);
    assert.ok(d.interpretation, `${d.id} explains itself`);
  });
});

test('a brand-new profile reports allEmpty so the hub can lead with one empty state', () => {
  const model = buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-16' });
  assert.equal(model.allEmpty, true);
});

test('Hybrid Score is a secondary destination, not a headline domain', () => {
  const model = buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-16' });
  assert.ok(!model.domains.some((d) => d.id === 'hybrid-score'));
  assert.ok(model.secondary.some((entry) => entry.id === 'hybrid-score'));
});

test('no destination is reachable from two entries on the same screen', () => {
  const model = buildProgressLanding({ fastingSession: { active: true }, weeks: {} }, { days: DAYS, today: '2026-07-16' });
  const targets = [...model.domains.map((d) => d.context), ...model.secondary.map((entry) => entry.id)];
  assert.equal(new Set(targets).size, targets.length, `duplicate destinations: ${targets.join(',')}`);
  // Consistency owns Review; it must not also be listed as a secondary link.
  assert.ok(!model.secondary.some((entry) => entry.id === 'weekly-review'));
});

test('fasting appears only for people who actually fast', () => {
  assert.equal(fastingIsEnabled({}), false);
  assert.equal(fastingIsEnabled({ fastingSession: { active: false, history: [] } }), false);
  assert.equal(fastingIsEnabled({ fastingSession: { active: true, history: [] } }), true);
  assert.equal(fastingIsEnabled({ fastingSession: { active: false, history: [{ hours: 16 }] } }), true);
  // An explicit setting always wins, in both directions.
  assert.equal(fastingIsEnabled({ settings: { fastingEnabled: true } }), true);
  assert.equal(fastingIsEnabled({ settings: { fastingEnabled: false }, fastingSession: { active: true } }), false);

  assert.ok(!secondaryDestinations({}).some((entry) => entry.id === 'fasting'));
  assert.ok(secondaryDestinations({ fastingSession: { active: true } }).some((entry) => entry.id === 'fasting'));
});

test('the period label describes the real calendar week being viewed', () => {
  const live = buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-16' });
  assert.equal(live.isCurrentWeek, true);
  assert.equal(live.periodLabel, 'This week so far');
  assert.equal(live.weekStart, WK);
  assert.equal(live.weekEnd, '2026-07-19');

  const past = buildProgressLanding({ weeks: {} }, { days: DAYS, today: '2026-07-27', weekStart: WK });
  assert.equal(past.isCurrentWeek, false);
  assert.match(past.periodLabel, /Week of 2026-07-13/);
});
