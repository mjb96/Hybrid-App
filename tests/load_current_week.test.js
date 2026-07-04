// ==========================================
// Same-fact-same-number (Sprint 1.5): "current" load/volume must read the
// athlete's CURRENT training week, not the last slot of a series padded out to
// the program's total weeks (which is unlogged mid-program and read as "--").
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeLoadAnalytics } from '../js/analytics/calculations/load-calcs.js';
import { weeklyTonnageSeries } from '../js/metrics/metrics-strength.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// Weeks 1–3 trained; the athlete is in week 3 but the program runs 8 weeks, so
// weeks 4–8 are empty scaffold — exactly the mid-program case that broke.
function midProgramState() {
  const wk = () => ({
    lifts: { mon: { 'Back Squat': [
      { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true }, { w: '100', r: '5', c: true },
    ] } },
    runs: { wed: { dist: '5', time: '25:00', rpe: '6', type: 'run' } },
    gymRpe: { mon: '7' }, gymStats: { mon: { time: '45' } },
  });
  return {
    currentWeek: '3',
    weeks: { '1': wk(), '2': wk(), '3': wk() },
    loadMetrics: { atl: 40, ctl: 42 },
  };
}

test('computeLoadAnalytics: current ACWR/ATL/CTL read the current week, not the padded final week', () => {
  const state = midProgramState();
  const maxWeek = 8; // program total weeks > current week
  const la = computeLoadAnalytics(state, DAYS, maxWeek);
  // Week 8 is empty; the OLD code read it and returned 0 → "--".
  assert.ok(la.currentCTL > 0, 'CTL reflects the trained current week, not empty week 8');
  assert.ok(la.currentRatio > 0, 'ACWR is a real number, not 0/"--"');
});

test('computeLoadAnalytics: with current week == last week, behaviour is unchanged', () => {
  const state = midProgramState();
  const laMax = computeLoadAnalytics(state, DAYS, 3);   // maxWeek == currentWeek
  const laPadded = computeLoadAnalytics(state, DAYS, 8); // padded to program length
  // Same current-week reading regardless of how far the series is padded.
  assert.equal(laMax.currentRatio, laPadded.currentRatio);
  assert.equal(laMax.currentCTL, laPadded.currentCTL);
});

test('weekly tonnage: the current-week slot carries the logged volume mid-program', () => {
  const state = midProgramState();
  const series = weeklyTonnageSeries(state, DAYS, 8);
  const ci = parseInt(state.currentWeek, 10) - 1; // 2 → week 3
  assert.equal(series[ci], 100 * 5 * 3, 'week-3 tonnage = 1500');
  assert.equal(series[series.length - 1], 0, 'padded final week is empty (the old bug source)');
});
