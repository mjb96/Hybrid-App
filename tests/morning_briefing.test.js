import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMorningBriefing, briefingToText } from '../js/brain/morning-briefing.js';

const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };

const baseModel = (over = {}) => ({
  rec: { sessionLabel: 'Hybrid Session', badge: 'Productive', headline: 'On track — stick to the plan', advice: 'Follow the program today.', severity: 'neutral' },
  ready: { hasData: true, score: 72, status: 'Ready', available: ['load'], confidence: 'high', inputCount: 3 },
  ...over,
});
const PROGRAM = {
  days: { wed: { title: 'Day 3: Tempo + Pull', runs: '5k tempo' } },
  weeklyVolModifiers: {
    '4': { intensityLabel: 'Planned deload' },
    '5': { intensityLabel: 'Threshold build' },
  },
};
const STATE = { currentWeek: '5', settings: { name: 'Alex Carter' } };

test('greeting: time-of-day aware, uses first name, degrades without one', () => {
  const b = buildMorningBriefing({ state: STATE, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.equal(b.greeting, 'Good morning, Alex');
  const noon = buildMorningBriefing({ state: STATE, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(14) });
  assert.equal(noon.greeting, 'Good afternoon, Alex');
  const eve = buildMorningBriefing({ state: { currentWeek: '5', settings: {} }, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(20) });
  assert.equal(eve.greeting, 'Good evening');
});

test('context: day, week and phase name', () => {
  const b = buildMorningBriefing({ state: STATE, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.match(b.context, /^Wednesday · Week 5 · /);
  assert.match(b.context, /Threshold build$/);
});

test('scoreLine: calibrating, delta up/down/steady/new', () => {
  const mk = (score) => buildMorningBriefing({ state: STATE, model: baseModel(), score, program: PROGRAM, selectedDay: 'wed', now: at(7) }).scoreLine;
  assert.match(mk(null), /calibrating/);
  assert.equal(mk({ score: 87, delta: 5 }), 'Your Hybrid Score is 87 (up 5 since yesterday)');
  assert.equal(mk({ score: 80, delta: -3 }), 'Your Hybrid Score is 80 (down 3 since yesterday)');
  assert.equal(mk({ score: 80, delta: 0 }), 'Your Hybrid Score is 80 (steady since yesterday)');
  assert.equal(mk({ score: 80, delta: null }), 'Your Hybrid Score is 80 (new today)');
});

test('mission: incomplete training day → complete-session, readiness-aware', () => {
  const b = buildMorningBriefing({ state: STATE, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.equal(b.mission.done, false);
  assert.match(b.mission.text, /Complete today's hybrid session/);
  // Low readiness + a run in the plan → Zone 2 framing
  const low = buildMorningBriefing({ state: STATE, model: baseModel({ ready: { hasData: true, score: 45, status: 'Low', available: [], confidence: 'high', inputCount: 3 } }), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.match(low.mission.text, /Zone 2/);
  // High readiness gym-only day → push framing
  const gym = baseModel({ rec: { sessionLabel: 'Gym Session', badge: '', headline: '', advice: '', severity: 'neutral' }, ready: { hasData: true, score: 90, status: 'Peak', available: [], confidence: 'high', inputCount: 3 } });
  const push = buildMorningBriefing({ state: STATE, model: gym, score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.match(push.mission.text, /push/);
});

test('mission: one readiness signal never changes planned intensity', () => {
  const low = baseModel({ ready: { hasData: true, score: 20, status: 'Limited signal', available: ['sleep'], confidence: 'low', inputCount: 1 } });
  const lowBriefing = buildMorningBriefing({ state: STATE, model: low, score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.doesNotMatch(lowBriefing.mission.text, /Zone 2|easy/i);

  const high = baseModel({ rec: { sessionLabel: 'Gym Session', badge: '' }, ready: { hasData: true, score: 100, status: 'Limited signal', available: ['sleep'], confidence: 'low', inputCount: 1 } });
  const highBriefing = buildMorningBriefing({ state: STATE, model: high, score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.doesNotMatch(highBriefing.mission.text, /push|primed/i);
});

test('mission: completed session flips to done with celebration', () => {
  const done = baseModel({ rec: { sessionLabel: 'Run Day', badge: 'Session Done', headline: 'Logged ✓', advice: '', severity: 'positive' } });
  const b = buildMorningBriefing({ state: STATE, model: done, score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.equal(b.mission.done, true);
  assert.match(b.mission.text, /complete — nice work/);
  assert.equal(b.session.done, true);
});

test('mission: rest day → check-in first, then recovery framing', () => {
  const rest = baseModel({ rec: { sessionLabel: 'Rest Day', badge: '', headline: '', advice: '', severity: 'neutral' }, ready: { hasData: true, score: 70, status: 'Ready', available: ['load'], confidence: 'low', inputCount: 1 } });
  const b = buildMorningBriefing({ state: STATE, model: rest, score: null, program: PROGRAM, selectedDay: 'sun', now: at(7) });
  assert.equal(b.session.isRest, true);
  assert.match(b.mission.text, /check-in/);
  assert.equal(b.mission.done, false);
  // After checking in, the mission resolves to recovery framing
  const checked = buildMorningBriefing({ state: STATE, model: baseModel({ rec: { sessionLabel: 'Rest Day', badge: '' }, ready: { hasData: true, score: 70, status: 'Ready', available: ['wellness'], confidence: 'low', inputCount: 1 } }), score: null, program: PROGRAM, selectedDay: 'sun', now: at(7) });
  assert.equal(checked.mission.done, true);
  assert.match(checked.mission.text, /Rest well/);
});

test('briefingToText: notification-ready paragraph', () => {
  const b = buildMorningBriefing({ state: STATE, model: baseModel(), score: { score: 87, delta: 5 }, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  const txt = briefingToText(b);
  assert.match(txt, /^Good morning, Alex\. Your Hybrid Score is 87 \(up 5 since yesterday\)\. Today: Day 3: Tempo \+ Pull\. Mission: /);
  // Rest day omits the session line
  const rest = buildMorningBriefing({ state: STATE, model: baseModel({ rec: { sessionLabel: 'Rest Day', badge: '' } }), score: null, program: PROGRAM, selectedDay: 'sun', now: at(7) });
  assert.doesNotMatch(briefingToText(rest), /Today:/);
});

test('firstSession (R14): mission points at the very first action', () => {
  const train = buildMorningBriefing({ state: STATE, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7), firstSession: true });
  assert.match(train.mission.text, /Log your first session/);
  assert.equal(train.mission.done, false);
  const rest = buildMorningBriefing({ state: STATE, model: baseModel({ rec: { sessionLabel: 'Rest Day', badge: '' } }), score: null, program: PROGRAM, selectedDay: 'sun', now: at(7), firstSession: true });
  assert.match(rest.mission.text, /Welcome!/);
  // Once the session is already done, we don't override with the first-run copy.
  const done = buildMorningBriefing({ state: STATE, model: baseModel({ rec: { sessionLabel: 'Run Day', badge: 'Session Done' } }), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7), firstSession: true });
  assert.equal(done.mission.done, true);
});

test('degrades gracefully with an empty model/state', () => {
  const b = buildMorningBriefing({ state: {}, model: {}, score: null, program: null, selectedDay: 'mon', now: at(7) });
  assert.equal(b.session.label, 'Rest Day');
  assert.ok(b.greeting.startsWith('Good'));
  assert.ok(briefingToText(b).length > 0);
});

test('C3: a planned deload week carries an explanatory note', () => {
  const b = buildMorningBriefing({ state: { currentWeek: '4', settings: {} }, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.ok(b.deload && /deload/i.test(b.deload.note), 'deload note present on a deload week');
  // A normal week has no deload note.
  const normal = buildMorningBriefing({ state: { currentWeek: '5', settings: {} }, model: baseModel(), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.equal(normal.deload, null, 'no deload note on a normal week');
});

test('C3: the program\'s own week label drives the deload note', () => {
  const prog = { days: { wed: { title: 'X' } }, weeklyVolModifiers: { '3': { sets: 2, reps: 5, intensityLabel: 'Deload + simulation' } } };
  const b = buildMorningBriefing({ state: { currentWeek: '3', settings: {} }, model: baseModel(), score: null, program: prog, selectedDay: 'wed', now: at(7) });
  assert.ok(b.deload, 'program deload label triggers the note');
});
