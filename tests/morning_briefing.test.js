import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMorningBriefing, briefingToText } from '../js/brain/morning-briefing.js';

const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };

const baseModel = (over = {}) => ({
  rec: { sessionLabel: 'Hybrid Session', badge: 'Productive', headline: 'On track — stick to the plan', advice: 'Follow the program today.', severity: 'neutral' },
  ready: { hasData: true, score: 72, status: 'Ready', available: ['load'] },
  ...over,
});
const PROGRAM = { days: { wed: { title: 'Day 3: Tempo + Pull', runs: '5k tempo' } } };
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
  const low = buildMorningBriefing({ state: STATE, model: baseModel({ ready: { hasData: true, score: 45, status: 'Low', available: [] } }), score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.match(low.mission.text, /Zone 2/);
  // High readiness gym-only day → push framing
  const gym = baseModel({ rec: { sessionLabel: 'Gym Session', badge: '', headline: '', advice: '', severity: 'neutral' }, ready: { hasData: true, score: 90, status: 'Peak', available: [] } });
  const push = buildMorningBriefing({ state: STATE, model: gym, score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.match(push.mission.text, /push/);
});

test('mission: completed session flips to done with celebration', () => {
  const done = baseModel({ rec: { sessionLabel: 'Run Day', badge: 'Session Done', headline: 'Logged ✓', advice: '', severity: 'positive' } });
  const b = buildMorningBriefing({ state: STATE, model: done, score: null, program: PROGRAM, selectedDay: 'wed', now: at(7) });
  assert.equal(b.mission.done, true);
  assert.match(b.mission.text, /complete — nice work/);
  assert.equal(b.session.done, true);
});

test('mission: rest day → check-in first, then recovery framing', () => {
  const rest = baseModel({ rec: { sessionLabel: 'Rest Day', badge: '', headline: '', advice: '', severity: 'neutral' }, ready: { hasData: true, score: 70, status: 'Ready', available: ['load'] } });
  const b = buildMorningBriefing({ state: STATE, model: rest, score: null, program: PROGRAM, selectedDay: 'sun', now: at(7) });
  assert.equal(b.session.isRest, true);
  assert.match(b.mission.text, /check-in/);
  assert.equal(b.mission.done, false);
  // After checking in, the mission resolves to recovery framing
  const checked = buildMorningBriefing({ state: STATE, model: baseModel({ rec: { sessionLabel: 'Rest Day', badge: '' }, ready: { hasData: true, score: 70, status: 'Ready', available: ['wellness'] } }), score: null, program: PROGRAM, selectedDay: 'sun', now: at(7) });
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

test('degrades gracefully with an empty model/state', () => {
  const b = buildMorningBriefing({ state: {}, model: {}, score: null, program: null, selectedDay: 'mon', now: at(7) });
  assert.equal(b.session.label, 'Rest Day');
  assert.ok(b.greeting.startsWith('Good'));
  assert.ok(briefingToText(b).length > 0);
});
