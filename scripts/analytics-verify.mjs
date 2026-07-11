// =============================================================================
// ANALYTICS VERIFICATION — scripts/analytics-verify.mjs   (DEV ONLY)
//
// Prints the full In Focus analytics flow for a synthetic history so a human can
// eyeball every step: source records → assigned week keys → daily aggregates →
// weekly aggregate → comparison period → final displayed value.
//
// This is a Node dev tool. It is NOT imported by the app, NOT bundled, and NOT
// in the service-worker precache, so it never ships as a production feature.
//
//   node scripts/analytics-verify.mjs            # readable report
//   node scripts/analytics-verify.mjs --perf     # + timing on a large history
// =============================================================================
import { buildWeekChart } from '../js/analytics/week-chart-model.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function weekDates(mondayISO) {
  const base = new Date(mondayISO + 'T00:00:00Z');
  const out = {};
  DAY_KEYS.forEach((dk, i) => {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i);
    out[dk] = d.toISOString().slice(0, 10);
  });
  return out;
}
const work = (w, r) => ({ c: true, w, r });
const warm = (w, r) => ({ c: true, w, r, type: 'W' });

// ---- a small, legible synthetic history -------------------------------------
function sampleState() {
  return {
    currentWeek: '3',
    settings: { weightUnit: 'kg', distanceUnit: 'km', weekStartDay: 'mon' },
    weeks: {
      '1': {
        dates: weekDates('2026-05-25'),
        lifts: {
          mon: { 'Bench Press': [warm(40, 10), work(100, 5), work(100, 5)] },
          wed: { 'Back Squat': [work(140, 5), work(140, 5), work(140, 3)] },
        },
        runs: { tue: { dist: '5', time: '25:00' }, sat: { dist: '10', time: '52:00' } },
      },
      '2': {
        dates: weekDates('2026-06-01'),
        lifts: {
          mon: { 'Bench Press': [work(102.5, 5), work(102.5, 5), work(102.5, 5)] },
          wed: { 'Back Squat': [work(145, 5), work(145, 5), work(145, 5)] },
          fri: { 'Deadlift': [work(180, 3)] },
        },
        runs: { tue: { dist: '6', time: '30:00' }, sat: { dist: '12', time: '63:00' } },
      },
      '3': {
        dates: weekDates('2026-06-08'),
        lifts: {
          mon: { 'Bench Press': [work(105, 5), work(105, 5), work(105, 5), work(105, 4)] },
          wed: { 'Back Squat': [work(147.5, 5), work(147.5, 5)] },
        },
        runs: { tue: { dist: '7', time: '34:00' } },
      },
    },
  };
}

function line(ch = '─', n = 74) { return ch.repeat(n); }

function report(state, { type, metric, weekOffset, today }) {
  const chart = buildWeekChart(state, { type, metric, weekOffset, today });
  console.log(line('═'));
  console.log(`IN FOCUS · ${type.toUpperCase()} · metric=${metric} · weekOffset=${weekOffset} · today=${today}`);
  console.log(line('═'));
  console.log(`week key:      ${chart.weekKey}  (program week ${chart.weekNum})`);
  console.log(`is current:    ${chart.isCurrentWeek}`);
  console.log(`date range:    ${chart.startDate} → ${chart.endDate}`);
  console.log(line());
  console.log('DAY BUCKETS (source date → value):');
  chart.days.forEach(d => {
    const flags = [d.isToday ? 'TODAY' : '', d.isFuture ? 'future' : '', d.hasData ? '' : 'no-activity']
      .filter(Boolean).join(' ');
    console.log(`  ${d.dayFull.padEnd(9)} ${String(d.date).padEnd(12)} value=${String(d.value).padStart(8)}  ${flags}`);
  });
  console.log(line());
  console.log(`WEEK TOTAL:    ${chart.total}   (elapsed so far: ${chart.elapsedTotal})`);
  const c = chart.comparison;
  console.log('COMPARISON:');
  console.log(`  type:        ${c.type}  (${c.comparisonLabel})`);
  console.log(`  previous:    ${c.previousTotal}`);
  console.log(`  absolute Δ:  ${c.absoluteChange}`);
  console.log(`  percent Δ:   ${c.percentageChange === null ? 'n/a (honest)' : c.percentageChange + '%'}`);
  console.log(`  direction:   ${c.direction}`);
  console.log(`  comparable:  ${c.isComparable}${c.message ? '  → ' + c.message : ''}`);
  console.log('');
}

function perf() {
  // Large synthetic history: 200 weeks × 7 days × several lifts.
  const weeks = {};
  const start = new Date('2022-01-03T00:00:00Z');
  for (let w = 1; w <= 200; w++) {
    const mon = new Date(start); mon.setUTCDate(mon.getUTCDate() + (w - 1) * 7);
    const lifts = {};
    const runs = {};
    DAY_KEYS.forEach((dk, i) => {
      if (i % 2 === 0) {
        lifts[dk] = {
          'Bench Press': [warm(40, 10), work(80 + w * 0.1, 5), work(80 + w * 0.1, 5), work(80 + w * 0.1, 5)],
          'Back Squat':  [work(120 + w * 0.1, 5), work(120 + w * 0.1, 5)],
        };
      } else {
        runs[dk] = { dist: String(5 + (i % 3)), time: '30:00' };
      }
    });
    weeks[String(w)] = { dates: weekDates(mon.toISOString().slice(0, 10)), lifts, runs };
  }
  const state = { currentWeek: '200', settings: {}, weeks };

  const N = 2000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    buildWeekChart(state, { type: 'strength', metric: 'sets', weekOffset: -(i % 50), today: '2025-11-05' });
  }
  const t1 = process.hrtime.bigint();
  const msPer = Number(t1 - t0) / 1e6 / N;
  console.log(line('═'));
  console.log(`PERFORMANCE · 200-week history · ${N} buildWeekChart() calls`);
  console.log(`  avg per call: ${msPer.toFixed(4)} ms   (bounded to one week + its predecessor)`);
  console.log(line('═'));
}

// ---- run --------------------------------------------------------------------
const state = sampleState();
const TODAY = '2026-06-10'; // a Wednesday in program week 3

report(state, { type: 'strength', metric: 'sets',     weekOffset: 0,  today: TODAY }); // current, live
report(state, { type: 'strength', metric: 'volume',   weekOffset: -1, today: TODAY }); // completed
report(state, { type: 'running',  metric: 'distance', weekOffset: 0,  today: TODAY }); // current, live

if (process.argv.includes('--perf')) perf();
