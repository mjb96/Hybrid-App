// =============================================================================
// ANALYTICS CALENDAR GUARD (static architectural check)
//
// The calendar-core analytics modules must be a program-week-FREE zone: they may
// only attribute work by real dates. This lint-style test fails if any of them
// reintroduces the conflation that caused the weekly-attribution bug — reading
// state.currentWeek as a calendar period, indexing weeks[] by the program
// counter, using the old program-week navigator, or deriving a week label from
// the min/max of activity dates.
//
// Deliberately scoped to the three files that OWN calendar attribution. Program
// progress / adherence modules legitimately use currentWeek and are exempt.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Strip block + line comments so a doc-comment mentioning currentWeek never trips
// the guard — only executable code is inspected.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const CALENDAR_CORE = [
  'js/analytics/weekly-aggregate.js',
  'js/analytics/week-chart-model.js',
  'js/analytics/week-nav.js',
  'js/analytics/strength-calendar.js',
];

// [pattern, human-readable violation]
const FORBIDDEN = [
  [/\.currentWeek\b/, 'reads the program-week counter (.currentWeek) as calendar time'],
  [/\bgetSelectedWeek\b(?!Start)/, 'uses the removed program-week navigator helper getSelectedWeek()'],
  [/weeks\s*\[[^\]]*currentWeek/, 'indexes weeks[] by the program-week counter'],
  [/\bnonNullDates\b/, 'derives a week range from the min/max of populated activity dates'],
];

for (const rel of CALENDAR_CORE) {
  test(`calendar-core is program-week-free: ${rel}`, () => {
    const code = stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));
    for (const [re, why] of FORBIDDEN) {
      assert.ok(!re.test(code), `${rel} ${why} (matched ${re}). Calendar attribution must use real dates only.`);
    }
  });
}

// A positive assertion: the core aggregate module exposes the canonical helpers
// every other analytics surface must route through (so no parallel date system
// can quietly appear).
test('weekly-aggregate exports the canonical calendar helpers', async () => {
  const mod = await import('../js/analytics/weekly-aggregate.js');
  for (const fn of ['localDayKey', 'weekStartOf', 'weekKeyOf', 'addDaysISO',
    'collectCalendarWeek', 'buildCalendarWeekStrength', 'indexSlotsByDate', 'explainWeeklyMetric']) {
    assert.equal(typeof mod[fn], 'function', `missing canonical helper ${fn}`);
  }
});
