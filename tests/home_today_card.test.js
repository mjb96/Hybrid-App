import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayCardModel, todayCardHTML, todayProgramDay } from '../js/home/today-card.js';

const MONDAY = new Date('2026-08-03T09:00:00+10:00');
const DISPLAY_TZ = 'Australia/Sydney';
const PROGRAM = {
  name: 'Test Plan',
  totalWeeks: 4,
  weeklyVolModifiers: { '1': { sets: 2, reps: 5 } },
  days: {
    mon: { title: 'Push Strength', lifts: ['Bench Press'], runs: 'Rest', desc: '' },
    tue: { title: 'Easy Run', lifts: [], runs: '5 km easy', desc: '' },
    wed: { title: 'Pull Strength', lifts: ['Barbell Row'], runs: 'Rest', desc: '' },
    sun: { title: 'Rest Day', lifts: [], runs: 'Rest', desc: '' },
  },
};

function state() {
  return {
    currentWeek: '1',
    activeProgramId: 'test',
    weeks: {
      '1': {
        dates: {}, sessionStatus: {},
        lifts: {
          mon: { 'Bench Press': [{ w: '', r: '5', c: false }, { w: '', r: '5', c: false }] },
          wed: { 'Barbell Row': [{ w: '', r: '5', c: false }, { w: '', r: '5', c: false }] },
        },
        runs: {}, runSessions: {}, gymStats: {},
      },
    },
  };
}

const model = {
  ready: { hasData: true, score: 78 },
  rec: { badge: 'Productive', headline: 'On track — stick to the plan', advice: 'Follow the plan.' },
};

test('ready state uses the real calendar day and exposes one primary action', () => {
  const card = buildTodayCardModel({
    state: state(), program: PROGRAM, model, now: MONDAY, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'ready');
  assert.equal(card.day, 'mon');
  assert.equal(card.title, 'Push Strength');
  assert.deepEqual(card.primary, { action: 'select-program-workout', day: 'mon', label: 'Start workout' });
  const html = todayCardHTML(card);
  assert.equal((html.match(/id="homePrimaryCta"/g) || []).length, 1);
  assert.match(html, /data-day="mon"/);
});

test('today is independent of a previously selected cockpit day', () => {
  const card = buildTodayCardModel({
    state: state(), program: PROGRAM, model, now: MONDAY, tz: DISPLAY_TZ,
    // A selected-day input intentionally does not exist in this model.
  });
  assert.equal(card.day, 'mon');
  assert.equal(card.primary.day, 'mon');
});

test('calendar-day resolution follows the display timezone rather than the process timezone', () => {
  assert.equal(todayProgramDay(MONDAY, DISPLAY_TZ), 'mon');
  assert.equal(todayProgramDay(MONDAY, 'UTC'), 'sun');
});

test('an unfinished session from another day takes resume priority', () => {
  const s = state();
  s.weeks['1'].lifts.wed['Barbell Row'][0] = { w: '80', r: '5', c: true };
  s.weeks['1'].dates.wed = '2026-08-01';
  s.weeks['1'].sessionStatus.wed = 'in_progress';
  const card = buildTodayCardModel({
    state: s, program: PROGRAM, model, now: MONDAY, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'unresolved');
  assert.equal(card.day, 'wed');
  assert.equal(card.primary.label, 'Resume workout');
  assert.equal(card.secondary, null);
});

test('today in progress resumes instead of offering a fresh start', () => {
  const s = state();
  s.weeks['1'].lifts.mon['Bench Press'][0] = { w: '60', r: '5', c: true };
  s.weeks['1'].dates.mon = '2026-08-03';
  s.weeks['1'].sessionStatus.mon = 'in_progress';
  const card = buildTodayCardModel({
    state: s, program: PROGRAM, model, now: MONDAY, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'in_progress');
  assert.equal(card.primary.label, 'Resume workout');
});

test('a deliberately finished session becomes a review action', () => {
  const s = state();
  s.weeks['1'].lifts.mon['Bench Press'] = [
    { w: '60', r: '5', c: true },
    { w: '60', r: '5', c: true },
  ];
  s.weeks['1'].dates.mon = '2026-08-03';
  s.weeks['1'].sessionStatus.mon = 'finished';
  const card = buildTodayCardModel({
    state: s, program: PROGRAM, model, now: MONDAY, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'completed');
  assert.deepEqual(card.primary, { action: 'open-today-summary', day: 'mon', label: 'Review workout' });
});

test('rest day recommends recovery instead of a workout', () => {
  const sunday = new Date('2026-08-09T09:00:00+10:00');
  const card = buildTodayCardModel({
    state: state(), program: PROGRAM, model, now: sunday, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'rest');
  assert.equal(card.primary.action, 'open-wellness-checkin');
  assert.equal(card.primary.label, 'Log wellness check-in');
});

test('missing plan has a safe, useful recovery state', () => {
  const card = buildTodayCardModel({
    state: state(), program: null, model, now: MONDAY, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'no_plan');
  assert.deepEqual(card.primary, { action: 'switch-tab', target: 'program', label: 'Choose a plan' });
  assert.equal(card.secondary, null);
});

test('one-off workouts remain resumable across days', () => {
  const s = state();
  s.weeks['session:abc'] = {
    sessionId: 'abc', sessionKind: 'empty', sessionTitle: 'Upper body',
    sessionDay: 'sun', dates: { sun: '2026-08-02' },
    lifts: { sun: {} }, sessionStatus: {},
  };
  s.activeStrengthSessionKey = 'session:abc';
  const card = buildTodayCardModel({
    state: s, program: PROGRAM, model, now: MONDAY, tz: DISPLAY_TZ,
  });
  assert.equal(card.state, 'unresolved');
  assert.equal(card.title, 'Upper body');
  assert.equal(card.primary.action, 'start-today-workout');
});

test('offline state reassures without changing the workout action', () => {
  const card = buildTodayCardModel({
    state: state(), program: PROGRAM, model, now: MONDAY, offline: true, tz: DISPLAY_TZ,
  });
  assert.equal(card.offline, true);
  assert.equal(card.primary.label, 'Start workout');
  assert.match(todayCardHTML(card), /logging still saves on this device/);
});

test('Hybrid Score stays supporting until confidence is meaningful', () => {
  const provisional = buildTodayCardModel({
    state: state(), program: PROGRAM, model, now: MONDAY,
    tz: DISPLAY_TZ,
    score: { hasData: true, score: 64, confidence: 20, band: { status: 'Building' } },
  });
  assert.equal(provisional.score, null);

  const established = buildTodayCardModel({
    state: state(), program: PROGRAM, model, now: MONDAY,
    tz: DISPLAY_TZ,
    score: { hasData: true, score: 74, confidence: 75, delta: 2, band: { status: 'Productive' } },
  });
  assert.deepEqual(established.score, { value: 74, label: 'Hybrid Score · +2 today' });
});
