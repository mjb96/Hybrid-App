// ==========================================
// SESSION RECAP TEST (tests/session_recap.test.js)
// buildSessionRecap is the pure core of the new full-screen recap: tonnage,
// per-lift breakdown + est. 1RM, run/walk details, and session insights.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSessionRecap, renderSessionRecapHTML } from '../js/session-recap.js';
import { upsertRunSession } from '../js/state/run-sessions.js';

function stateWith(day) {
  return { weeks: { '1': day } };
}

test('summarises a strength session: tonnage, working sets, top lift + e1RM', () => {
  const wd = {
    dates: { mon: '2026-07-02' },
    gymRpe: { mon: '8' },
    gymStats: { mon: { time: '52:00' } },
    lifts: {
      mon: {
        'Bench Press': [
          { w: 60, r: 5, c: true },
          { w: 80, r: 5, c: true },
          { w: 40, r: 8, type: 'W', c: true }, // warm-up excluded
        ],
        'Squat': [{ w: 100, r: 5, c: true }, { w: 100, r: 5, c: false }], // 2nd not completed
      },
    },
    runs: {},
  };
  const r = buildSessionRecap(stateWith(wd), '1', 'mon');
  // tonnage = 60*5 + 80*5 + 100*5 = 300+400+500 = 1200 (warm-up + incomplete excluded)
  assert.equal(r.tonnage, 1200);
  assert.equal(r.workingSets, 3);
  assert.deepEqual(r.types, ['gym']);
  // Squat has higher volume (500) than Bench (700? 300+400=700) -> Bench first
  assert.equal(r.lifts[0].name, 'Bench Press');
  assert.equal(r.lifts[0].topSet.w, 80);
  assert.ok(r.lifts[0].e1rm >= 90); // 80*(1+5/30) ≈ 93
});

test('summarises a run with pace + tags walk vs run', () => {
  const wd = {
    dates: { tue: '2026-07-03' },
    lifts: {},
    runs: { tue: { dist: 5, time: '25:00', rpe: '6', type: 'run' } },
  };
  const r = buildSessionRecap(stateWith(wd), '1', 'tue');
  assert.deepEqual(r.types, ['run']);
  assert.equal(r.run.distKm, 5);
  assert.equal(r.run.pace, '5:00');   // 25:00 / 5km
});

test('walk type is carried through', () => {
  const wd = { dates: { wed: '2026-07-04' }, lifts: {}, runs: { wed: { dist: 2, time: '24:00', type: 'walk' } } };
  const r = buildSessionRecap(stateWith(wd), '1', 'wed');
  assert.deepEqual(r.types, ['walk']);
});

test('flags a PR when a lift beats its best from every prior session', () => {
  const state = {
    weeks: {
      '1': { dates: { mon: '2026-06-23' }, lifts: { mon: { 'Bench Press': [{ w: 80, r: 5, c: true }] } }, runs: {} },
      '2': { dates: { mon: '2026-06-30' }, lifts: { mon: { 'Bench Press': [{ w: 90, r: 5, c: true }] } }, runs: {} },
    },
  };
  // Week 2 (90×5) beats week 1 (80×5) -> PR.
  const r2 = buildSessionRecap(state, '2', 'mon');
  assert.equal(r2.lifts[0].pr, true);
  // Week 1 is the first-ever session -> no prior best -> not a PR.
  const r1 = buildSessionRecap(state, '1', 'mon');
  assert.equal(r1.lifts[0].pr, false);
  // The 🏆 badge renders only for the PR session.
  assert.ok(renderSessionRecapHTML(r2).includes('🏆'));
  assert.ok(!renderSessionRecapHTML(r1).includes('🏆'));
});

test('run splits render as a pace bar chart with per-km values', () => {
  const wd = {
    dates: { tue: '2026-07-03' }, lifts: {},
    runs: { tue: { dist: 3, time: '15:00', type: 'run', splits: [
      { lap: 1, time: 300 }, { lap: 2, time: 280 }, { lap: 3, time: 320 },
    ] } },
  };
  const html = renderSessionRecapHTML(buildSessionRecap(stateWith(wd), '1', 'tue'), [], 270);
  assert.ok(html.includes('recap-pacechart'));
  assert.ok(html.includes('Pace / km'));
  assert.ok(html.includes('5:00'));  // 300s/km
  assert.ok(html.includes('4:40'));  // 280s/km (fastest)
  // Fastest split gets the full-width bar.
  assert.ok(html.includes('width:100%'));
});

test('empty day yields an empty recap (no throw), renders a friendly message', () => {
  const r = buildSessionRecap(stateWith({ lifts: {}, runs: {} }), '1', 'fri');
  assert.equal(r.empty, true);
  assert.match(renderSessionRecapHTML(r), /Nothing logged/i);
});

test('sessionId recap selects one exact same-day run while day recap aggregates both', () => {
  const wd = { lifts: {}, runs: {}, runSessions: {}, dates: { mon: '2026-07-13' } };
  upsertRunSession(wd, 'mon', { dist: '5', time: '25:00', type: 'run' }, { sessionId: 'run_one', updatedTs: 1 });
  upsertRunSession(wd, 'mon', { dist: '3', time: '18:00', type: 'run' }, { sessionId: 'run_two', updatedTs: 2 });
  const state = stateWith(wd);

  assert.equal(buildSessionRecap(state, '1', 'mon').run.distKm, 8);
  const exact = buildSessionRecap(state, '1', 'mon', 'run_one');
  assert.equal(exact.run.sessionId, 'run_one');
  assert.equal(exact.run.distKm, 5);
  assert.equal(exact.run.time, '25:00');
});

test('renderSessionRecapHTML escapes lift names and includes stats', () => {
  const wd = { dates: { mon: '2026-07-02' }, lifts: { mon: { '<b>Curl</b>': [{ w: 20, r: 10, c: true }] } }, runs: {} };
  const html = renderSessionRecapHTML(buildSessionRecap(stateWith(wd), '1', 'mon'));
  assert.ok(html.includes('&lt;b&gt;Curl&lt;/b&gt;'));  // escaped, not raw
  assert.ok(!html.includes('<b>Curl</b>'));
  assert.ok(html.includes('kg'));
});
