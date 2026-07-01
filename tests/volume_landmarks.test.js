// ==========================================
// VOLUME LANDMARKS TESTS (tests/volume_landmarks.test.js)
// Per-muscle MV/MEV/MAV/MRV landmarks, the classifier, group derivation, and
// the current-week report. Run with `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VOLUME_LANDMARKS,
  MUSCLE_GROUPS,
  GROUP_LANDMARKS,
  classifyVolume,
  zoneLabel,
  zoneColor,
  buildMuscleLandmarkReport,
} from '../js/analytics/calculations/volume-landmarks.js';
import { MUSCLE_MAP } from '../js/metrics/metrics-strength.js';

// ---- classifier ------------------------------------------------------------
const LM = { mv: 6, mev: 10, mav: 20, mrv: 22 };

test('classifyVolume: no data / detraining boundaries', () => {
  assert.equal(classifyVolume(0, LM), 'no_data');
  assert.equal(classifyVolume(5, LM), 'detraining');   // below MV
  assert.equal(classifyVolume(6, LM), 'maintenance');  // == MV
});

test('classifyVolume: maintenance / growth / optimal / overreaching boundaries', () => {
  assert.equal(classifyVolume(9,  LM), 'maintenance'); // MV ≤ v < MEV
  assert.equal(classifyVolume(10, LM), 'growth');      // == MEV
  assert.equal(classifyVolume(19, LM), 'growth');      // < MAV
  assert.equal(classifyVolume(20, LM), 'optimal');     // == MAV
  assert.equal(classifyVolume(22, LM), 'optimal');     // == MRV
  assert.equal(classifyVolume(23, LM), 'overreaching');// > MRV
});

test('classifyVolume: MV of 0 never flags detraining', () => {
  const lm = { mv: 0, mev: 6, mav: 12, mrv: 16 };
  assert.equal(classifyVolume(2, lm), 'maintenance');  // low but not "under MV"
  assert.equal(classifyVolume(0, lm), 'no_data');
});

test('classifyVolume: missing landmarks → no_data', () => {
  assert.equal(classifyVolume(10, undefined), 'no_data');
});

// ---- coverage / integrity --------------------------------------------------
test('every muscle used by MUSCLE_MAP has a landmark and a group', () => {
  const grouped = new Set(Object.values(MUSCLE_GROUPS).flat());
  const referenced = new Set();
  for (const { primary = [], secondary = [] } of Object.values(MUSCLE_MAP)) {
    primary.forEach(m => referenced.add(m));
    secondary.forEach(m => referenced.add(m));
  }
  for (const m of referenced) {
    assert.ok(VOLUME_LANDMARKS[m], `muscle "${m}" is missing a landmark`);
    assert.ok(grouped.has(m), `muscle "${m}" is not in any group`);
  }
});

test('landmarks are monotonic and positive', () => {
  for (const [m, lm] of Object.entries(VOLUME_LANDMARKS)) {
    assert.ok(lm.mv <= lm.mev, `${m}: mv ≤ mev`);
    assert.ok(lm.mev < lm.mav, `${m}: mev < mav`);
    assert.ok(lm.mav <= lm.mrv, `${m}: mav ≤ mrv`);
    assert.ok(lm.mrv > 0, `${m}: mrv > 0`);
  }
});

test('group landmarks equal the sum of their member muscles', () => {
  for (const [group, members] of Object.entries(MUSCLE_GROUPS)) {
    const expect = { mv: 0, mev: 0, mav: 0, mrv: 0 };
    members.forEach(m => {
      const lm = VOLUME_LANDMARKS[m];
      expect.mv += lm.mv; expect.mev += lm.mev; expect.mav += lm.mav; expect.mrv += lm.mrv;
    });
    assert.deepEqual(GROUP_LANDMARKS[group], expect, `${group} landmark sum`);
  }
});

// ---- zone helpers ----------------------------------------------------------
test('zoneLabel and zoneColor cover every zone', () => {
  for (const z of ['no_data', 'detraining', 'maintenance', 'growth', 'optimal', 'overreaching']) {
    assert.equal(typeof zoneLabel(z), 'string');
    assert.match(zoneColor(z), /#|rgba/);
  }
});

// ---- report ----------------------------------------------------------------
test('buildMuscleLandmarkReport reads the current week and classifies groups', () => {
  // Week 2 volumes: chest 12 (growth), upper_chest 0 → Chest group total 12.
  const muscleByWeek = {
    chest:       [8, 12],
    upper_chest: [0, 0],
    quads:       [0, 25],  // above quads MRV(20) → overreaching
  };
  const report = buildMuscleLandmarkReport(muscleByWeek, 2);

  assert.equal(report.muscles.chest.sets, 12);
  assert.equal(report.muscles.chest.zone, 'growth');
  assert.equal(report.groups.Chest.sets, 12);          // 12 + 0
  assert.equal(report.groups.Chest.zone, 'maintenance');// vs Chest group MEV(16)
  assert.equal(report.muscles.quads.zone, 'overreaching');
});

test('buildMuscleLandmarkReport is safe on empty/missing data', () => {
  const report = buildMuscleLandmarkReport({}, 1);
  assert.equal(report.muscles.chest.sets, 0);
  assert.equal(report.muscles.chest.zone, 'no_data');
  assert.equal(report.groups.Chest.zone, 'no_data');
});
