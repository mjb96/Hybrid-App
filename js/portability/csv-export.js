// @ts-check
// Complete, deterministic training-history CSV. Exact state keys are retained,
// including archived activation weeks, and every value is RFC 4180 escaped.

import { runSessionsForDay } from '../state/run-sessions.js';

export function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values) {
  return values.map(csvCell).join(',') + '\r\n';
}

function earliestDate(week) {
  const dates = Object.values(week?.dates || {}).filter((value) => typeof value === 'string').sort();
  return dates[0] || '9999-99-99';
}

function weekEntries(state) {
  return Object.entries(state?.weeks || {})
    .filter(([, week]) => week && typeof week === 'object' && !Array.isArray(week))
    .sort(([aKey, a], [bKey, b]) => earliestDate(a).localeCompare(earliestDate(b)) || aKey.localeCompare(bKey));
}

const HEADER = [
  'WeekKey', 'ActivationId', 'ProgramId', 'Day', 'Date', 'Exercise', 'Set',
  'Weight', 'Reps', 'Completed', 'RunSessionId', 'RunDist', 'RunTime', 'RunRPE',
  'AvgHR', 'MaxHR', 'ElevGain', 'Calories', 'BodyWeight', 'GymRPE', 'Notes',
];

function runValues(run) {
  return [
    run?.sessionId, run?.dist, run?.time, run?.rpe, run?.avgHR, run?.maxHR,
    run?.elev, run?.cals,
  ];
}

/** @param {any} state @param {string[]} days */
export function buildTrainingCsv(state, days) {
  let csv = row(HEADER);
  for (const [weekKey, week] of weekEntries(state)) {
    for (const day of days) {
      const prefix = [weekKey, week.activationId, week.programId, day, week.dates?.[day]];
      const suffix = [week.bodyWeight?.[day], week.gymRpe?.[day], week.notes?.[day]];
      const runs = runSessionsForDay(week, day);
      const lifts = week.lifts?.[day] && typeof week.lifts[day] === 'object' && !Array.isArray(week.lifts[day])
        ? week.lifts[day]
        : {};
      const liftRows = [];
      for (const [lift, sets] of Object.entries(lifts)) {
        if (!Array.isArray(sets)) continue;
        sets.forEach((set, index) => {
          liftRows.push([lift, index + 1, set?.w, set?.r, set?.c]);
        });
      }

      const rowCount = Math.max(liftRows.length, runs.length,
        suffix.some((value) => value !== '' && value != null) ? 1 : 0);
      for (let index = 0; index < rowCount; index++) {
        const lift = liftRows[index] || ['', '', '', '', ''];
        const run = runs[index] ? runValues(runs[index]) : Array(8).fill('');
        csv += row([...prefix, ...lift, ...run, ...(index === 0 ? suffix : ['', '', ''])]);
      }
    }
  }
  return csv;
}
