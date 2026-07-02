// ==========================================
// SESSION RECAP TEST (tests/session_recap.test.js)
// buildSessionRecap is the pure core of the new full-screen recap: tonnage,
// per-lift breakdown + est. 1RM, run/walk details, and session insights.
// Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSessionRecap, renderSessionRecapHTML } from '../js/session-recap.js';

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

test('empty day yields an empty recap (no throw), renders a friendly message', () => {
  const r = buildSessionRecap(stateWith({ lifts: {}, runs: {} }), '1', 'fri');
  assert.equal(r.empty, true);
  assert.match(renderSessionRecapHTML(r), /Nothing logged/i);
});

test('renderSessionRecapHTML escapes lift names and includes stats', () => {
  const wd = { dates: { mon: '2026-07-02' }, lifts: { mon: { '<b>Curl</b>': [{ w: 20, r: 10, c: true }] } }, runs: {} };
  const html = renderSessionRecapHTML(buildSessionRecap(stateWith(wd), '1', 'mon'));
  assert.ok(html.includes('&lt;b&gt;Curl&lt;/b&gt;'));  // escaped, not raw
  assert.ok(!html.includes('<b>Curl</b>'));
  assert.ok(html.includes('kg'));
});
