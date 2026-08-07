import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActivePlanBanner } from '../js/programs/active-plan-banner.js';
import { buildTodayCardModel } from '../js/home/today-card.js';

const TZ = 'Australia/Sydney';
// 2026-08-03 is a Monday in Sydney.
const MONDAY = new Date('2026-08-03T02:00:00Z');
const WEDNESDAY = new Date('2026-08-05T02:00:00Z');
const SATURDAY = new Date('2026-08-08T02:00:00Z');

const program = {
  id: 'p1', name: 'Test Plan', totalWeeks: 8,
  weeklyVolModifiers: { 3: { sets: 3, reps: '5' } },
  days: {
    mon: { title: 'Push A', desc: '', lifts: ['Bench Press'], runs: 'Rest' },
    tue: { title: 'Rest', lifts: [], runs: 'Rest' },
    wed: { title: 'Pull B', desc: '', lifts: ['Barbell Row'], runs: 'Rest' },
    thu: { title: 'Rest', lifts: [], runs: 'Rest' },
    fri: { title: 'Legs C', desc: '', lifts: ['Back Squat'], runs: 'Rest' },
  },
};
const catalog = { id: 'p1', name: 'Test Plan', durationWeeks: 8, accentColor: '#8b5cf6' };

const set = (w = '80') => ({ c: true, w, r: '5' });

function stateWith(week = {}) {
  return {
    activeProgramId: 'p1',
    currentWeek: '3',
    weeks: { '3': week },
  };
}

const banner = (state, now = MONDAY) =>
  buildActivePlanBanner({ state, program, catalog, now, tz: TZ });

test('no active plan renders no banner; the caller owns the empty and recovery states', () => {
  assert.equal(buildActivePlanBanner({ state: { weeks: {} }, program, catalog }), null);
  // An id whose program cannot be resolved must fall through to the existing
  // Plans recovery card rather than being given an invented session.
  assert.equal(buildActivePlanBanner({ state: stateWith(), program: null, catalog }), null);
});

test('an untouched programmed day today offers to start exactly that day', () => {
  const model = banner(stateWith({}));
  assert.equal(model.session.state, 'today');
  assert.equal(model.session.lead, 'Today');
  assert.equal(model.session.title, 'Push A');
  assert.deepEqual(model.action, {
    action: 'select-program-workout', day: 'mon', label: 'Start workout', tone: 'primary',
  });
  assert.equal(model.week.label, 'Week 3 of 8');
  assert.equal(model.thisWeek.label, '0 of 3 sessions done this week');
});

test("a finished session is never re-advertised as today's workout", () => {
  // The regression this model exists for: the banner read the template only, so
  // it said "Today: Push A" over a session that was already complete.
  const state = stateWith({
    dates: { mon: '2026-08-03' },
    lifts: { mon: { 'Bench Press': [set(), set(), set()] } },
    sessionStatus: { mon: 'finished' },
  });
  const model = banner(state);
  assert.equal(model.session.state, 'today_done');
  assert.equal(model.session.lead, 'Completed today');
  assert.equal(model.session.title, 'Push A');
  assert.equal(model.session.status, 'Next: Wednesday · Pull B');
  assert.equal(model.action.tone, 'quiet', 'nothing to start now must not read as the primary action');
  assert.equal(model.action.action, 'open-program-workout-picker');
  assert.equal(model.thisWeek.label, '1 of 3 sessions done this week');
});

test('a session with logged-but-unfinished work is resumed, on its own day', () => {
  const state = stateWith({
    dates: { mon: '2026-08-03' },
    lifts: { mon: { 'Bench Press': [set()] } },
  });
  const model = banner(state, WEDNESDAY);
  assert.equal(model.session.state, 'in_progress');
  assert.equal(model.session.lead, 'Monday · in progress');
  assert.equal(model.action.day, 'mon', 'resuming must not silently retarget today');
  assert.equal(model.action.label, 'Resume workout');
  assert.match(model.session.status, /1 of 3 planned sets/);
});

test('an unfinished one-off session outranks the plan, as it does on Home', () => {
  const state = {
    activeProgramId: 'p1',
    currentWeek: '3',
    activeStrengthSessionKey: 'oneoff:1',
    weeks: {
      '3': {},
      'oneoff:1': {
        sessionId: 'x', sessionKind: 'empty', sessionDay: 'mon', sessionTitle: 'Quick Arms',
        dates: { mon: '2026-08-03' },
        lifts: { mon: { 'Dumbbell Curl': [set('20')] } },
      },
    },
  };
  const model = banner(state);
  assert.equal(model.session.state, 'one_off');
  assert.equal(model.session.title, 'Quick Arms');
  // start-today-workout resumes it; select-program-workout would drop the
  // one-off pointer and open a programmed day instead.
  assert.equal(model.action.action, 'start-today-workout');
  assert.equal(model.action.day, null);
});

test('a rest day names the next real session and when it is', () => {
  // Tuesday is rest in this plan; Wednesday is Pull B.
  const model = buildActivePlanBanner({
    state: stateWith({}), program, catalog,
    now: new Date('2026-08-04T02:00:00Z'), tz: TZ,
  });
  assert.equal(model.session.state, 'rest');
  assert.equal(model.session.lead, 'Tomorrow');
  assert.equal(model.session.title, 'Pull B');
  assert.equal(model.session.status, 'Recovery day today');
});

test('a session two or more days out is named by its weekday, not "Next"', () => {
  // Saturday: nothing remains this week, so the still-open sessions are behind.
  const state = stateWith({
    dates: { mon: '2026-08-03', wed: '2026-08-05' },
    lifts: {
      mon: { 'Bench Press': [set(), set(), set()] },
      wed: { 'Barbell Row': [set(), set(), set()] },
    },
    sessionStatus: { mon: 'finished', wed: 'finished' },
  });
  const model = banner(state, SATURDAY);
  assert.equal(model.session.state, 'behind');
  assert.equal(model.session.lead, 'Friday', 'the old banner said only "Next"');
  assert.equal(model.session.title, 'Legs C');
  assert.equal(model.action.day, 'fri');
  assert.equal(model.thisWeek.label, '2 of 3 sessions done this week');
});

test('a fully completed week says so, and does not point at a session', () => {
  const state = stateWith({
    dates: { mon: '2026-08-03', wed: '2026-08-05', fri: '2026-08-07' },
    lifts: {
      mon: { 'Bench Press': [set(), set(), set()] },
      wed: { 'Barbell Row': [set(), set(), set()] },
      fri: { 'Back Squat': [set(), set(), set()] },
    },
    sessionStatus: { mon: 'finished', wed: 'finished', fri: 'finished' },
  });
  const model = banner(state, SATURDAY);
  assert.equal(model.session.state, 'week_complete');
  assert.equal(model.session.lead, 'Week 3 complete');
  assert.equal(model.session.title, 'All 3 sessions done this week');
  assert.equal(model.session.status, 'Week 4 is next');
  assert.equal(model.session.day, null);
});

test('a week of pure rest is reported as such rather than as a missing session', () => {
  const restOnly = { id: 'p2', name: 'Deload', totalWeeks: 4, days: { mon: { title: 'Rest', lifts: [], runs: 'Rest' } } };
  const model = buildActivePlanBanner({
    state: { activeProgramId: 'p2', currentWeek: '1', weeks: {} },
    program: restOnly, catalog: null, now: MONDAY, tz: TZ,
  });
  assert.equal(model.session.state, 'no_sessions');
  assert.equal(model.thisWeek, null);
  assert.equal(model.name, 'Deload');
});

test('progress is stated once, with its basis, and counts finished weeks', () => {
  const model = banner(stateWith({}));
  assert.equal(model.week.pct, 25, 'week 3 of 8 = 2 finished weeks');
  assert.equal(model.week.pctLabel, '25% of the plan complete · 2 of 8 weeks finished');
  const first = buildActivePlanBanner({
    state: { activeProgramId: 'p1', currentWeek: '1', weeks: {} },
    program, catalog, now: MONDAY, tz: TZ,
  });
  assert.equal(first.week.pct, 0, 'week 1 is honestly 0% — the label says why');
});

test('a custom plan without a catalog duration keeps its own totalWeeks', () => {
  const custom = { id: 'c1', name: 'My Split', totalWeeks: 6, days: program.days };
  const model = buildActivePlanBanner({
    state: { activeProgramId: 'c1', currentWeek: '2', weeks: {} },
    program: custom, catalog: null, now: MONDAY, tz: TZ,
  });
  assert.equal(model.week.label, 'Week 2 of 6', 'must not collapse to a hard-coded "of 12"');
  assert.equal(model.accent, null);
});

test('Plans and Home cannot disagree about what to do next', () => {
  // Both surfaces read the same primitives in the same precedence order. This
  // asserts the states stay aligned, which is the whole point of the rewrite.
  const cases = [
    ['untouched today', {}],
    ['today finished', {
      dates: { mon: '2026-08-03' },
      lifts: { mon: { 'Bench Press': [set(), set(), set()] } },
      sessionStatus: { mon: 'finished' },
    }],
    ['today part-logged', {
      dates: { mon: '2026-08-03' },
      lifts: { mon: { 'Bench Press': [set()] } },
    }],
  ];
  const expected = { 'untouched today': 'ready', 'today finished': 'completed', 'today part-logged': 'in_progress' };
  const bannerState = { 'untouched today': 'today', 'today finished': 'today_done', 'today part-logged': 'in_progress' };
  for (const [label, week] of cases) {
    const state = stateWith(week);
    const home = buildTodayCardModel({ state, program, now: MONDAY, tz: TZ });
    const plans = banner(state);
    assert.equal(home.state, expected[label], `${label}: Home state`);
    assert.equal(plans.session.state, bannerState[label], `${label}: Plans state`);
    // The day either surface would act on must be the same day.
    const homeDay = home.primary?.day || home.day;
    if (plans.action.day) assert.equal(plans.action.day, homeDay, `${label}: acted-on day`);
  }
});
