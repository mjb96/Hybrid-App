import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLOUD_OVERWRITE_BACKUP_KEY,
  getCloudOverwriteBackup,
  snapshotCloudBeforeOverwrite,
  trainingStateSummary,
} from '../js/state/recovery-vault.js';

function storage(initial = {}) {
  const values = { ...initial };
  return {
    getItem: (key) => key in values ? values[key] : null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; },
    dump: () => values,
  };
}

const completed = (w = 80, r = 5) => ({ c: true, w: String(w), r: String(r) });

test('protects the exact newer cloud blob before a device overwrite', () => {
  const cloud = {
    currentWeek: '2',
    weeks: {
      '1': {
        dates: { mon: '2026-07-13', wed: '2026-07-15' },
        lifts: { mon: { Squat: [completed()] } },
        runSessions: { wed: [{ sessionId: 'run_1', dist: '5', time: '25:00' }] },
      },
    },
  };
  const target = storage();
  assert.equal(snapshotCloudBeforeOverwrite(cloud, {
    serverUpdatedAt: '2026-07-19T10:00:00Z',
    storage: target,
    now: () => '2026-07-19T10:01:00Z',
  }), true);

  const backup = getCloudOverwriteBackup(target);
  assert.deepEqual(backup.state, cloud);
  assert.equal(backup.serverUpdatedAt, '2026-07-19T10:00:00Z');
  assert.deepEqual(backup.summary, {
    weeks: 1, datedDays: 2, strengthDays: 1, runs: 1, latestDate: '2026-07-15',
  });
  assert.ok(target.dump()[CLOUD_OVERWRITE_BACKUP_KEY]);
});

test('an empty cloud candidate cannot erase a useful recovery point', () => {
  const target = storage();
  const useful = { weeks: { '1': { dates: { fri: '2026-07-18' } } } };
  assert.equal(snapshotCloudBeforeOverwrite(useful, { storage: target }), true);
  const before = target.dump()[CLOUD_OVERWRITE_BACKUP_KEY];
  assert.equal(snapshotCloudBeforeOverwrite({ weeks: {} }, { storage: target }), false);
  assert.equal(target.dump()[CLOUD_OVERWRITE_BACKUP_KEY], before);
});

test('summary counts independent same-day run sessions and completed strength only', () => {
  const summary = trainingStateSummary({ weeks: {
    '1': {
      dates: { tue: '2026-07-14' },
      lifts: { tue: { Bench: [{ c: false, w: '', r: '8' }, completed(90, 6)] } },
      runSessions: { tue: [
        { sessionId: 'a', dist: '3', time: '16:00' },
        { sessionId: 'b', dist: '2', time: '12:00' },
      ] },
    },
  } });
  assert.equal(summary.strengthDays, 1);
  assert.equal(summary.runs, 2);
  assert.equal(summary.datedDays, 1);
});
