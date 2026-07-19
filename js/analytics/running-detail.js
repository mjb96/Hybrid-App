// @ts-check
// =============================================================================
// RUNNING METRIC DETAIL MODEL
//
// One date-strict, all-activation source for every Running summary/detail.
// Program week is metadata only: the persisted local date decides chronology.
// Same-day sessions remain independent and every included point carries exact
// Activity Detail identity. Undated and future records are retained in state but
// excluded from date analytics rather than guessed into a period.
// =============================================================================
import { addDaysISO, localDayKey, todayKey } from '../dates.js';
import { weekStartOf } from './weekly-aggregate.js';
import { comparePeriodValues } from './period-comparison.js';
import {
  enduranceScore,
  racePredictors,
  runningEconomy,
  thresholdSecsFromVdot,
  vdotFromPerformance,
  vdotFromThresholdPace,
} from './calculations/running-calcs.js';
import { runSessionsForDay } from '../state/run-sessions.js';

const DAY_KEYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const RANGE_WEEKS = Object.freeze({ '4w': 4, '12w': 12, '6m': 26, '1y': 52 });
export const RUNNING_RANGE_OPTIONS = Object.freeze([
  { id: '4w', label: '4 weeks' },
  { id: '12w', label: '12 weeks' },
  { id: '6m', label: '6 months' },
  { id: '1y', label: '1 year' },
  { id: 'all', label: 'All time' },
]);

const SOURCE_LABELS = Object.freeze({
  fit: 'FIT import', garmin: 'Garmin import', gps: 'Helyx GPS', manual: 'Manual log', legacy: 'Legacy log',
});

function metric(id, label, unit, scope, calculation, options = {}) {
  return Object.freeze({
    id, label, unit, scope, calculation,
    color: options.color || '#3b82f6',
    inverse: options.inverse === true,
    series: options.series || 'weekly',
    source: options.source || 'Dated run and walk sessions',
    empty: options.empty || `Log a dated activity to build ${label.toLowerCase()} history.`,
    limitations: options.limitations || [],
  });
}

export const RUNNING_METRICS = Object.freeze([
  metric('running.weekly-distance', 'Weekly Distance', 'distance', 'calendar-week', 'Sum of distance from every dated run and walk in the selected Monday–Sunday calendar week.', { color: '#3b82f6' }),
  metric('running.four-week-distance', '4-Week Distance', 'distance', 'rolling-28d', 'Sum of distance over the trailing 28 calendar days, including every dated run and walk.', { color: '#ec4899', series: 'rolling-4w' }),
  metric('running.total-distance', 'Total Distance', 'distance', 'lifetime', 'Lifetime sum of distance across dated runs and walks from every program activation.', { color: '#22d3ee', series: 'cumulative' }),
  metric('running.weekly-duration', 'Weekly Duration', 'duration', 'calendar-week', 'Sum of parsed activity duration in the selected calendar week.', { color: '#22d3ee' }),
  metric('running.weekly-run-count', 'Weekly Activity Count', 'count', 'calendar-week', 'Count of independent dated runs and walks in the selected calendar week.', { color: '#60a5fa' }),
  metric('running.total-run-count', 'Total Activities', 'count', 'lifetime', 'Lifetime count of independent dated runs and walks.', { color: '#60a5fa', series: 'cumulative' }),
  metric('running.average-pace', 'Average Pace', 'pace', 'rolling-28d', 'Distance-weighted mean pace across eligible runs in the trailing 28 days: total moving time divided by total distance.', {
    color: '#f472b6', inverse: true,
    source: 'Dated runs with valid distance and duration; walks are excluded',
    limitations: ['Manual logs cannot be independently GPS-verified.', 'Walks and implausible pace records are excluded.'],
  }),
  metric('running.best-pace', 'Best Pace', 'pace', 'lifetime', 'Fastest eligible whole-session average pace across dated runs. Eligibility requires at least 1 km, at least 4 minutes, and a plausible 2:00–15:00 /km pace.', {
    color: '#10b981', inverse: true, series: 'record-progression',
    source: 'Eligible dated run sessions; walks are excluded',
    limitations: ['This is whole-session average pace, not a short GPS spike.', 'Manual logs are shown with lower source confidence.'],
  }),
  metric('running.longest-run', 'Longest Activity', 'distance', 'lifetime', 'Longest single dated run or walk by recorded distance.', { color: '#14b8a6', series: 'record-progression' }),
  metric('running.weekly-elevation', 'Weekly Elevation Gain', 'elevation', 'calendar-week', 'Sum of recorded elevation gain in the selected calendar week.', { color: '#a78bfa', empty: 'Import or log elevation gain to build this history.' }),
  metric('running.average-heart-rate', 'Average Heart Rate', 'heart-rate', 'rolling-28d', 'Duration-weighted mean of recorded average heart rate over the trailing 28 days.', {
    color: '#ef4444', source: 'Dated activities with average heart rate', empty: 'Import a heart-rate-enabled activity to build this history.',
  }),
  metric('running.max-heart-rate', 'Maximum Heart Rate', 'heart-rate', 'rolling-28d', 'Highest recorded activity maximum heart rate over the trailing 28 days.', {
    color: '#f43f5e', source: 'Dated activities with maximum heart rate', empty: 'Import a heart-rate-enabled activity to build this history.'
  }),
  metric('running.cadence', 'Cadence', 'cadence', 'rolling-28d', 'Duration-weighted mean cadence across dated activities in the trailing 28 days.', {
    color: '#06b6d4', source: 'Dated activities with cadence', empty: 'Import a cadence-enabled activity to build this history.'
  }),
  metric('running.aerobic-training-effect', 'Aerobic Training Effect', 'training-effect', 'rolling-28d', 'Mean recorded aerobic Training Effect across activities in the trailing 28 days.', {
    color: '#10b981', source: 'FIT/Garmin activities with aerobic Training Effect', empty: 'Import a compatible FIT activity to populate aerobic Training Effect.'
  }),
  metric('running.anaerobic-training-effect', 'Anaerobic Training Effect', 'training-effect', 'rolling-28d', 'Mean recorded anaerobic Training Effect across activities in the trailing 28 days.', {
    color: '#f97316', source: 'FIT/Garmin activities with anaerobic Training Effect', empty: 'Import a compatible FIT activity to populate anaerobic Training Effect.'
  }),
  metric('running.intensity-distribution', 'Heart-Rate Zone Time', 'duration-minutes', 'rolling-28d', 'Sum of recorded minutes in heart-rate zones 1–5 over the trailing 28 days.', {
    color: '#f59e0b', source: 'FIT/Garmin activities with zone-duration data', empty: 'Import an activity with heart-rate zones to populate intensity distribution.'
  }),
  metric('running.training-load', 'Running Training Load', 'load', 'rolling-7d', 'Session RPE × duration in minutes, summed over the trailing 7 days. Missing RPE or duration contributes no load.', {
    color: '#f59e0b', source: 'Dated run/walk sessions with both duration and RPE', empty: 'Log both duration and RPE to calculate running training load.'
  }),
  metric('running.load-ratio', 'Running Load Ratio', 'ratio', 'rolling-ewma', 'Run-only 7-day acute EWMA divided by the 28-day chronic EWMA, calculated across contiguous calendar days.', {
    color: '#f97316', series: 'rolling-load', source: 'Dated run/walk sessions with duration and RPE', empty: 'Build a duration + RPE baseline to calculate a running load ratio.',
    limitations: ['A load ratio describes change against your own baseline; it is not an injury prediction.'],
  }),
  metric('running.form', 'Running Form', 'load', 'rolling-ewma', 'Run-only chronic load minus acute load (CTL − ATL) using 28-day and 7-day EWMAs.', {
    color: '#3b82f6', series: 'rolling-form', source: 'Dated run/walk sessions with duration and RPE', empty: 'Build a duration + RPE baseline to calculate running form.'
  }),
  metric('running.training-stress', '28-Day Running Stress', 'load', 'rolling-28d', 'Sum of run-only session RPE × duration over the trailing 28 days.', {
    color: '#fb7185', series: 'rolling-stress', source: 'Dated run/walk sessions with duration and RPE', empty: 'Log duration and RPE to build a 28-day running-stress trend.'
  }),
  metric('running.vdot', 'VDOT', 'score', 'recent-8w', 'A manual threshold pace takes priority; otherwise VDOT is the best Daniels–Gilbert estimate from eligible 1.5–42.2 km runs in the trailing 8 weeks.', {
    color: '#3b82f6', source: 'Threshold pace setting or eligible dated run performances', empty: 'Log an eligible hard run or set threshold pace to estimate VDOT.',
    limitations: ['An estimate is not a laboratory VO₂max measurement.', 'Threshold-derived VDOT treats the entered threshold pace as an approximate 60-minute performance.'],
  }),
  metric('running.threshold-pace', 'Threshold Pace', 'pace', 'configured', 'The athlete-entered threshold pace from Settings.', {
    color: '#f59e0b', series: 'none', source: 'Settings', empty: 'Set threshold pace in Settings to use this metric.',
    limitations: ['Helyx does not yet retain threshold-setting history, so no honest trend series is available.'],
  }),
  metric('running.threshold-heart-rate', 'Threshold Heart Rate', 'heart-rate', 'rolling-28d', 'Estimate equal to 87% of the highest recorded maximum heart rate in the trailing 28 days.', {
    color: '#ef4444', source: 'Dated activities with maximum heart rate', empty: 'Import heart-rate-enabled activities to estimate threshold heart rate.',
    limitations: ['This is a broad estimate, not a tested lactate-threshold measurement.'],
  }),
  metric('running.running-economy', 'Running Economy', 'economy', 'configured', 'Estimated oxygen cost at threshold pace, derived from threshold pace and VDOT.', {
    color: '#22d3ee', series: 'none', source: 'Threshold pace setting and VDOT estimate', empty: 'Set threshold pace and establish VDOT to estimate running economy.',
    limitations: ['This is a modelled estimate, not a laboratory measurement.', 'No historical threshold-setting log exists, so a trend would be fabricated.'],
  }),
  metric('running.fitness-trend', 'Pace Trend', 'pace-rate', 'rolling-12w', 'Linear weekly change in distance-weighted average pace across the trailing 12 calendar weeks. Negative seconds means faster.', {
    color: '#10b981', inverse: true, source: 'Eligible dated runs with distance and duration', empty: 'Log pace across multiple calendar weeks to calculate a trend.'
  }),
  metric('running.aerobic-efficiency', 'Aerobic Efficiency', 'efficiency', 'rolling-28d', 'Distance-weighted average pace divided by duration-weighted average heart rate. Lower values mean less time per kilometre per beat.', {
    color: '#14b8a6', inverse: true, source: 'Dated runs with valid pace and average heart rate', empty: 'Import runs with both pace and heart rate to build aerobic-efficiency history.'
  }),
  metric('running.pace-heart-rate', 'Pace–Heart Rate Relationship', 'correlation', 'rolling-12w', 'Pearson correlation between eligible session pace and average heart rate over the trailing 12 weeks.', {
    color: '#8b5cf6', source: 'Dated runs with valid pace and average heart rate', empty: 'At least three runs with pace and heart rate are required.',
    limitations: ['Terrain, weather and workout type can affect the relationship.'],
  }),
  metric('running.endurance-score', 'Endurance Score', 'score', 'rolling-12w', 'Composite of recent VDOT (50%), active-week consistency (30%) and average weekly distance (20%).', {
    color: '#10b981', source: 'Dated distance and eligible run performances', empty: 'Log eligible runs across several weeks to establish an Endurance Score.',
    limitations: ['This app-specific composite is directional, not a clinical fitness grade.'],
  }),
  metric('running.race-projections', 'Race Projections', 'projection', 'current-model', 'Current race-time estimates derived from the effective threshold pace/VDOT model.', {
    color: '#f59e0b', series: 'none', source: 'Current threshold pace or recent VDOT estimate', empty: 'Establish VDOT to unlock race projections.',
    limitations: ['Confidence intervals and course/weather adjustments remain deferred roadmap work.', 'Helyx does not retain historical projection snapshots.'],
  }),
  metric('running.personal-bests', 'Distance Personal Bests', 'count', 'lifetime', 'Fastest eligible dated performance inside the 5K, 10K, half-marathon and marathon distance brackets.', {
    color: '#f59e0b', series: 'record-progression', source: 'Dated run sessions with distance and duration', empty: 'Log a qualifying race-distance run to establish a personal best.'
  }),
]);

const METRIC_BY_ID = new Map(RUNNING_METRICS.map((entry) => [entry.id, entry]));
export function runningMetricById(id) { return METRIC_BY_ID.get(String(id || '')) || null; }

export function parseRunDurationSeconds(value) {
  if (value == null || value === '') return 0;
  const parts = String(value).trim().split(':').map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 60;
}

function sourceConfidence(source) {
  if (source === 'fit' || source === 'garmin' || source === 'gps') return 'High source confidence';
  if (source === 'manual') return 'Manual source · verify distance and time';
  return 'Limited source metadata';
}

function runTitle(run) {
  const name = String(run?.name || '').trim();
  if (name) return name;
  return run?.type === 'walk' ? 'Walk' : 'Run';
}

/** Collect every independent run/walk once, using its real persisted date. */
export function collectRunningHistory(state, options = {}) {
  const throughDate = localDayKey(options.today || todayKey(options.tz), options.tz);
  const records = [];
  const exclusions = { undated: 0, future: 0, invalidDistance: 0, paceIneligible: 0 };
  const seen = new Set();

  for (const [weekKey, week] of Object.entries(state?.weeks || {})) {
    if (!week || typeof week !== 'object') continue;
    const days = new Set([...DAY_KEYS, ...Object.keys(week.runSessions || {}), ...Object.keys(week.runs || {})]);
    for (const day of days) {
      const sessions = runSessionsForDay(week, day);
      sessions.forEach((run, index) => {
        const sessionId = run?.sessionId || `${encodeURIComponent(weekKey)}:${day}:${index}`;
        const activityId = `run:${sessionId}`;
        if (seen.has(activityId)) return;
        seen.add(activityId);
        const date = localDayKey(run?.localDate || week.dates?.[day], options.tz);
        if (!date) { exclusions.undated++; return; }
        if (throughDate && date > throughDate) { exclusions.future++; return; }

        const distanceKm = Math.max(0, parseFloat(run?.dist) || 0);
        const durationSec = parseRunDurationSeconds(run?.time);
        const paceSecPerKm = distanceKm > 0 && durationSec > 0 ? durationSec / distanceKm : 0;
        const isWalk = run?.type === 'walk';
        const paceEligible = !isWalk && distanceKm >= 1 && durationSec >= 240
          && paceSecPerKm >= 120 && paceSecPerKm <= 900;
        if (distanceKm <= 0) exclusions.invalidDistance++;
        if (paceSecPerKm > 0 && !paceEligible) exclusions.paceIneligible++;

        const source = String(run?.source || 'legacy').toLowerCase();
        records.push({
          activityId, sessionId: run?.sessionId || null, weekKey, day,
          activationId: run?.activationId || week.activationId || null,
          date, title: runTitle(run), type: isWalk ? 'walk' : 'run', source,
          sourceLabel: SOURCE_LABELS[source] || 'Logged activity',
          confidence: sourceConfidence(source),
          distanceKm, durationSec, paceSecPerKm, paceEligible,
          averageHeartRate: Math.max(0, parseFloat(run?.avgHR) || 0),
          maximumHeartRate: Math.max(0, parseFloat(run?.maxHR) || 0),
          cadence: Math.max(0, parseFloat(run?.avgCadence) || 0),
          elevationGain: Math.max(0, parseFloat(run?.elev) || 0),
          calories: Math.max(0, parseFloat(run?.cals) || 0),
          rpe: Math.max(0, parseFloat(run?.rpe) || 0),
          aerobicTrainingEffect: Math.max(0, parseFloat(run?.trainingEffect) || 0),
          anaerobicTrainingEffect: Math.max(0, parseFloat(run?.anaerobicTE) || 0),
          hrZones: Array.isArray(run?.hrZones)
            ? [0, 1, 2, 3, 4].map((zone) => Math.max(0, parseFloat(run.hrZones[zone]) || 0))
            : null,
        });
      });
    }
  }
  records.sort((a, b) => a.date.localeCompare(b.date) || a.activityId.localeCompare(b.activityId));
  return { records, exclusions, throughDate, totalSessions: records.length + exclusions.undated + exclusions.future };
}

function within(records, start, end) {
  return records.filter((record) => (!start || record.date >= start) && (!end || record.date <= end));
}

function paceRecords(records) { return records.filter((record) => record.paceEligible); }
function withField(records, field) { return records.filter((record) => Number(record[field]) > 0); }
function sum(records, field) { return records.reduce((total, record) => total + (Number(record[field]) || 0), 0); }
function average(records, field, weightField = null) {
  const eligible = withField(records, field);
  if (!eligible.length) return null;
  if (weightField) {
    const totalWeight = sum(eligible, weightField);
    if (totalWeight > 0) return eligible.reduce((total, record) => total + Number(record[field]) * Number(record[weightField] || 0), 0) / totalWeight;
  }
  return sum(eligible, field) / eligible.length;
}

function pearson(records) {
  const pairs = records.filter((record) => record.paceEligible && record.averageHeartRate > 0);
  if (pairs.length < 3) return null;
  const meanPace = sum(pairs, 'paceSecPerKm') / pairs.length;
  const meanHr = sum(pairs, 'averageHeartRate') / pairs.length;
  const numerator = pairs.reduce((total, record) => total + (record.paceSecPerKm - meanPace) * (record.averageHeartRate - meanHr), 0);
  const paceDen = Math.sqrt(pairs.reduce((total, record) => total + (record.paceSecPerKm - meanPace) ** 2, 0));
  const hrDen = Math.sqrt(pairs.reduce((total, record) => total + (record.averageHeartRate - meanHr) ** 2, 0));
  return paceDen > 0 && hrDen > 0 ? numerator / (paceDen * hrDen) : null;
}

function bestVdot(records) {
  let best = null;
  for (const record of records) {
    if (!record.paceEligible || record.distanceKm < 1.5 || record.distanceKm > 42.2) continue;
    const value = vdotFromPerformance(record.distanceKm, record.durationSec);
    if (value != null && (best == null || value > best)) best = value;
  }
  return best;
}

const PB_BRACKETS = Object.freeze([
  { min: 4.5, max: 5.5 }, { min: 9, max: 11 }, { min: 20, max: 22 }, { min: 41, max: 43 },
]);
function personalBestRecords(records) {
  const best = [];
  for (const bracket of PB_BRACKETS) {
    const eligible = records.filter((record) => record.paceEligible && record.distanceKm >= bracket.min && record.distanceKm <= bracket.max);
    if (eligible.length) best.push(eligible.reduce((winner, record) => record.durationSec < winner.durationSec ? record : winner));
  }
  return [...new Map(best.map((record) => [record.activityId, record])).values()];
}
function personalBestCount(records) {
  return personalBestRecords(records).length;
}

function linearSlope(values) {
  const points = values.map((value, index) => ({ value, index })).filter((point) => Number.isFinite(point.value) && point.value > 0);
  if (points.length < 2) return null;
  const meanX = points.reduce((total, point) => total + point.index, 0) / points.length;
  const meanY = points.reduce((total, point) => total + point.value, 0) / points.length;
  const denominator = points.reduce((total, point) => total + (point.index - meanX) ** 2, 0);
  if (denominator === 0) return null;
  return points.reduce((total, point) => total + (point.index - meanX) * (point.value - meanY), 0) / denominator;
}

function dailyRunLoad(records, endDate) {
  const dated = records.filter((record) => record.date <= endDate && record.rpe > 0 && record.durationSec > 0);
  if (!dated.length) return { atl: 0, ctl: 0, form: 0, ratio: null, stress28: 0 };
  const byDate = new Map();
  for (const record of dated) {
    const load = record.rpe * record.durationSec / 60;
    byDate.set(record.date, (byDate.get(record.date) || 0) + load);
  }
  const startDate = dated[0].date;
  let atl = 0, ctl = 0;
  let stress28 = 0;
  const stressStart = addDaysISO(endDate, -27);
  for (let date = startDate; date && date <= endDate; date = addDaysISO(date, 1)) {
    const load = byDate.get(date) || 0;
    atl = load * 0.25 + atl * 0.75;
    ctl = load * (2 / 29) + ctl * (27 / 29);
    if (date >= stressStart) stress28 += load;
  }
  return { atl, ctl, form: ctl - atl, ratio: ctl > 0 ? atl / ctl : null, stress28 };
}

function weeklyPaceValues(records, firstWeek, lastWeek) {
  const values = [];
  for (let week = firstWeek; week && week <= lastWeek; week = addDaysISO(week, 7)) {
    const weekRuns = paceRecords(within(records, week, addDaysISO(week, 6)));
    const distance = sum(weekRuns, 'distanceKm');
    values.push(distance > 0 ? sum(weekRuns, 'durationSec') / distance : null);
  }
  return values;
}

function aggregate(id, records, state, context = {}) {
  switch (id) {
    case 'running.weekly-distance':
    case 'running.four-week-distance':
    case 'running.total-distance': return sum(records, 'distanceKm');
    case 'running.weekly-duration': return sum(records, 'durationSec');
    case 'running.weekly-run-count':
    case 'running.total-run-count': return records.length;
    case 'running.average-pace': {
      const eligible = paceRecords(records);
      const distance = sum(eligible, 'distanceKm');
      return distance > 0 ? sum(eligible, 'durationSec') / distance : null;
    }
    case 'running.best-pace': {
      const eligible = paceRecords(records);
      return eligible.length ? Math.min(...eligible.map((record) => record.paceSecPerKm)) : null;
    }
    case 'running.longest-run': return records.length ? Math.max(...records.map((record) => record.distanceKm), 0) : null;
    case 'running.weekly-elevation': return sum(records, 'elevationGain');
    case 'running.average-heart-rate': return average(records, 'averageHeartRate', 'durationSec');
    case 'running.max-heart-rate': {
      const eligible = withField(records, 'maximumHeartRate');
      return eligible.length ? Math.max(...eligible.map((record) => record.maximumHeartRate)) : null;
    }
    case 'running.cadence': return average(records, 'cadence', 'durationSec');
    case 'running.aerobic-training-effect': return average(records, 'aerobicTrainingEffect');
    case 'running.anaerobic-training-effect': return average(records, 'anaerobicTrainingEffect');
    case 'running.intensity-distribution': return records.reduce((total, record) => total + (record.hrZones?.reduce((a, b) => a + b, 0) || 0), 0) || null;
    case 'running.training-load': return records.reduce((total, record) => total + (record.rpe > 0 && record.durationSec > 0 ? record.rpe * record.durationSec / 60 : 0), 0) || null;
    case 'running.load-ratio': return dailyRunLoad(context.allRecords || records, context.endDate).ratio;
    case 'running.form': return dailyRunLoad(context.allRecords || records, context.endDate).form;
    case 'running.training-stress': return dailyRunLoad(context.allRecords || records, context.endDate).stress28 || null;
    case 'running.vdot': {
      const manual = parseFloat(state?.thresholdPaceSeconds) || 0;
      return manual > 0 && context.forSeries !== true ? vdotFromThresholdPace(manual) : bestVdot(records);
    }
    case 'running.threshold-pace': return parseFloat(state?.thresholdPaceSeconds) || null;
    case 'running.threshold-heart-rate': {
      const max = aggregate('running.max-heart-rate', records, state, context);
      return max ? Math.round(max * 0.87) : null;
    }
    case 'running.running-economy': {
      const threshold = parseFloat(state?.thresholdPaceSeconds) || 0;
      const vdot = threshold > 0 ? vdotFromThresholdPace(threshold) : bestVdot(records);
      return runningEconomy(threshold, vdot);
    }
    case 'running.fitness-trend': {
      const endWeek = weekStartOf(context.endDate);
      const firstWeek = addDaysISO(endWeek, -77);
      return linearSlope(weeklyPaceValues(records, firstWeek, endWeek));
    }
    case 'running.aerobic-efficiency': {
      const pace = aggregate('running.average-pace', records, state, context);
      const hr = aggregate('running.average-heart-rate', records, state, context);
      return pace && hr ? pace / hr : null;
    }
    case 'running.pace-heart-rate': return pearson(records);
    case 'running.endurance-score': {
      const endWeek = weekStartOf(context.endDate);
      const firstWeek = addDaysISO(endWeek, -77);
      const weeklyDistance = [];
      for (let week = firstWeek; week <= endWeek; week = addDaysISO(week, 7)) {
        weeklyDistance.push(sum(within(records, week, addDaysISO(week, 6)), 'distanceKm'));
      }
      const vdot = bestVdot(records);
      const activeWeeks = weeklyDistance.filter((value) => value > 0);
      const consistency = activeWeeks.length / weeklyDistance.length * 100;
      const averageDistance = activeWeeks.length ? activeWeeks.reduce((a, b) => a + b, 0) / activeWeeks.length : 0;
      return enduranceScore(vdot, consistency, averageDistance);
    }
    case 'running.race-projections': {
      const manual = parseFloat(state?.thresholdPaceSeconds) || 0;
      const vdot = bestVdot(records);
      const threshold = manual || thresholdSecsFromVdot(vdot) || 0;
      return threshold ? (vdotFromThresholdPace(threshold) || vdot) : null;
    }
    case 'running.personal-bests': return personalBestCount(records) || null;
    default: return null;
  }
}

function evidenceFor(id, records) {
  switch (id) {
    case 'running.threshold-pace': return [];
    case 'running.weekly-duration': return withField(records, 'durationSec');
    case 'running.weekly-run-count': return records;
    case 'running.running-economy': return paceRecords(records);
    case 'running.average-pace':
    case 'running.vdot':
    case 'running.race-projections':
    case 'running.fitness-trend': return paceRecords(records);
    case 'running.best-pace': {
      const eligible = paceRecords(records);
      return eligible.length ? [eligible.reduce((best, record) => record.paceSecPerKm < best.paceSecPerKm ? record : best)] : [];
    }
    case 'running.longest-run': {
      const eligible = records.filter((record) => record.distanceKm > 0);
      return eligible.length ? [eligible.reduce((best, record) => record.distanceKm > best.distanceKm ? record : best)] : [];
    }
    case 'running.personal-bests': return personalBestRecords(records);
    case 'running.average-heart-rate': return withField(records, 'averageHeartRate');
    case 'running.max-heart-rate':
    case 'running.threshold-heart-rate': return withField(records, 'maximumHeartRate');
    case 'running.cadence': return withField(records, 'cadence');
    case 'running.weekly-elevation': return withField(records, 'elevationGain');
    case 'running.aerobic-training-effect': return withField(records, 'aerobicTrainingEffect');
    case 'running.anaerobic-training-effect': return withField(records, 'anaerobicTrainingEffect');
    case 'running.intensity-distribution': return records.filter((record) => record.hrZones?.some(Boolean));
    case 'running.training-load':
    case 'running.load-ratio':
    case 'running.form':
    case 'running.training-stress': return records.filter((record) => record.rpe > 0 && record.durationSec > 0);
    case 'running.aerobic-efficiency':
    case 'running.pace-heart-rate': return records.filter((record) => record.paceEligible && record.averageHeartRate > 0);
    default: return records.filter((record) => record.distanceKm > 0);
  }
}

function periodFor(definition, records, today, currentWeek) {
  switch (definition.scope) {
    case 'calendar-week': return { start: currentWeek, end: today, label: `${currentWeek} – ${addDaysISO(currentWeek, 6)}`, status: 'Live calendar week' };
    case 'rolling-7d': return { start: addDaysISO(today, -6), end: today, label: `Trailing 7 days · through ${today}`, status: 'Rolling window' };
    case 'rolling-28d': return { start: addDaysISO(today, -27), end: today, label: `Trailing 28 days · through ${today}`, status: 'Rolling window' };
    case 'rolling-12w': return { start: addDaysISO(today, -83), end: today, label: `Trailing 12 weeks · through ${today}`, status: 'Rolling window' };
    case 'recent-8w': return { start: addDaysISO(today, -55), end: today, label: `Trailing 8 weeks · through ${today}`, status: 'Current estimate' };
    case 'rolling-ewma': return { start: records[0]?.date || today, end: today, label: `7-day / 28-day EWMA · through ${today}`, status: 'Rolling model' };
    case 'configured': return { start: null, end: today, label: 'Current setting', status: 'Current setting' };
    case 'current-model': return { start: addDaysISO(today, -55), end: today, label: `Current model · through ${today}`, status: 'Modelled estimate' };
    default: return { start: records[0]?.date || null, end: today, label: records.length ? `${records[0].date} – ${today}` : 'All time', status: 'Lifetime' };
  }
}

function rangeWeekStarts(records, rangeId, currentWeek) {
  let first = currentWeek;
  if (rangeId === 'all') {
    const earliest = records[0]?.date;
    first = earliest ? weekStartOf(earliest) : currentWeek;
  } else {
    const count = RANGE_WEEKS[rangeId] || RANGE_WEEKS['12w'];
    first = addDaysISO(currentWeek, -7 * (count - 1));
  }
  const out = [];
  for (let week = first; week && week <= currentWeek; week = addDaysISO(week, 7)) out.push(week);
  return out;
}

function seriesFor(definition, records, state, rangeId, today) {
  if (definition.series === 'none') return [];
  const currentWeek = weekStartOf(today);
  return rangeWeekStarts(records, rangeId, currentWeek).map((weekStart) => {
    const weekEnd = addDaysISO(weekStart, 6);
    const end = weekEnd > today ? today : weekEnd;
    let sourceRecords = within(records, weekStart, end);
    let valueRecords = sourceRecords;
    if (definition.series === 'rolling-4w' || definition.series === 'rolling-stress') {
      valueRecords = within(records, addDaysISO(end, -27), end);
    } else if (definition.series === 'cumulative' || definition.series === 'record-progression') {
      valueRecords = within(records, null, end);
    } else if (definition.series === 'rolling-load' || definition.series === 'rolling-form') {
      valueRecords = within(records, null, end);
    } else if (['running.average-pace', 'running.average-heart-rate', 'running.max-heart-rate', 'running.cadence', 'running.aerobic-training-effect', 'running.anaerobic-training-effect', 'running.intensity-distribution', 'running.aerobic-efficiency', 'running.pace-heart-rate'].includes(definition.id)) {
      valueRecords = within(records, addDaysISO(end, -27), end);
    } else if (['running.vdot', 'running.endurance-score', 'running.fitness-trend'].includes(definition.id)) {
      valueRecords = within(records, addDaysISO(end, -83), end);
    }
    const value = aggregate(definition.id, valueRecords, state, { allRecords: records, endDate: end, forSeries: true });
    return {
      key: weekStart, weekStart, weekEnd, value,
      evidence: evidenceFor(definition.id, definition.series === 'record-progression' ? valueRecords : sourceRecords),
    };
  });
}

function previousPeriod(definition, records, state, period, today, currentWeek) {
  if (definition.scope === 'calendar-week') {
    const elapsed = Math.max(0, Math.min(6, Math.round((Date.parse(`${today}T12:00:00`) - Date.parse(`${currentWeek}T12:00:00`)) / 86400000)));
    const start = addDaysISO(currentWeek, -7);
    const end = addDaysISO(start, elapsed);
    const subset = within(records, start, end);
    return { value: aggregate(definition.id, subset, state, { allRecords: records, endDate: end }), start, end };
  }
  const lengths = { 'rolling-7d': 7, 'rolling-28d': 28, 'rolling-12w': 84, 'recent-8w': 56, 'current-model': 56 };
  const length = lengths[definition.scope];
  if (!length || !period.start) return null;
  const end = addDaysISO(period.start, -1);
  const start = addDaysISO(end, -(length - 1));
  const subset = within(records, start, end);
  return { value: aggregate(definition.id, subset, state, { allRecords: records, endDate: end }), start, end };
}

function calendarDayBreakdown(definition, records, state, period, today) {
  if (definition.scope !== 'calendar-week' || !period.start) return [];
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysISO(period.start, index);
    const upcoming = date > today;
    const dayRecords = upcoming ? [] : within(records, date, date);
    const value = upcoming ? null : aggregate(definition.id, dayRecords, state, { allRecords: records, endDate: date });
    const available = !dayRecords.length || evidenceFor(definition.id, dayRecords).length > 0;
    return {
      date, upcoming, value,
      formatted: upcoming ? 'Upcoming' : available ? formatRunningMetricValue(definition, value, state) : '—',
      evidence: evidenceFor(definition.id, dayRecords),
    };
  });
}

function distanceUnit(state) {
  const raw = String(state?.settings?.distanceUnit || 'km').toLowerCase();
  return raw === 'mi' || raw === 'miles' ? 'mi' : 'km';
}

export function formatRunningMetricValue(definition, value, state) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const number = Number(value);
  const distUnit = distanceUnit(state);
  const distance = distUnit === 'mi' ? number * 0.621371 : number;
  switch (definition.unit) {
    case 'distance': return `${distance.toFixed(distance >= 100 ? 0 : 1)} ${distUnit}`;
    case 'duration': {
      const minutes = Math.round(number / 60);
      return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes} min`;
    }
    case 'duration-minutes': return `${Math.round(number)} min`;
    case 'pace': {
      const pace = distUnit === 'mi' ? number / 0.621371 : number;
      const rounded = Math.round(pace);
      return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')} /${distUnit}`;
    }
    case 'heart-rate': return `${Math.round(number)} bpm`;
    case 'cadence': return `${Math.round(number)} spm`;
    case 'elevation': return `${Math.round(number)} m`;
    case 'training-effect': return number.toFixed(1);
    case 'load': return `${Math.round(number)} AU`;
    case 'ratio': return number.toFixed(2);
    case 'score': return `${Math.round(number)}`;
    case 'economy': return `${number.toFixed(1)} ml/kg/km`;
    case 'pace-rate': return `${number > 0 ? '+' : ''}${number.toFixed(1)} s/km/week`;
    case 'efficiency': return `${number.toFixed(2)} s/km/bpm`;
    case 'correlation': return `r ${number.toFixed(2)}`;
    case 'projection': return `VDOT ${Math.round(number)}`;
    default: return `${Math.round(number)}`;
  }
}

function interpretation(definition, value, evidenceCount) {
  if (value == null) return definition.empty;
  if (definition.id === 'running.average-pace') return `A distance-weighted result from ${evidenceCount} eligible ${evidenceCount === 1 ? 'run' : 'runs'}; longer runs influence it proportionally.`;
  if (definition.id === 'running.best-pace') return 'This is the fastest eligible whole-session average, with short or implausible records excluded.';
  if (definition.id === 'running.load-ratio') return value >= 1.3 ? 'Recent running load is well above your chronic running baseline.' : value < 0.8 ? 'Recent running load is below your chronic running baseline.' : 'Recent running load is near your chronic running baseline.';
  if (definition.id === 'running.form') return value < 0 ? 'Acute running load is currently above the chronic baseline.' : 'Chronic running load currently exceeds acute load.';
  if (definition.id === 'running.fitness-trend') return value < -0.5 ? 'Eligible weekly average pace is trending faster.' : value > 0.5 ? 'Eligible weekly average pace is trending slower.' : 'Eligible weekly average pace is broadly stable.';
  if (definition.id === 'running.pace-heart-rate') return Math.abs(value) < 0.3 ? 'The current pace–heart-rate relationship is weak.' : value > 0 ? 'Faster sessions generally coincide with higher heart rate.' : 'Faster sessions currently coincide with lower heart rate.';
  return `${evidenceCount} contributing ${evidenceCount === 1 ? 'activity' : 'activities'} in the current scope.`;
}

export function buildRunningMetricDetail(state, metricId, options = {}) {
  const definition = runningMetricById(metricId);
  if (!definition) return null;
  const history = options.history || collectRunningHistory(state, options);
  const today = history.throughDate || localDayKey(options.today || todayKey(options.tz), options.tz);
  const records = history.records || [];
  const currentWeek = weekStartOf(today);
  const period = periodFor(definition, records, today, currentWeek);
  const currentRecords = period.start ? within(records, period.start, period.end) : records;
  const value = aggregate(definition.id, currentRecords, state, { allRecords: records, endDate: period.end });
  const configuredModel = ['running.threshold-pace', 'running.running-economy'].includes(definition.id)
    || (definition.id === 'running.vdot' && (parseFloat(state?.thresholdPaceSeconds) || 0) > 0);
  const contributing = configuredModel ? [] : evidenceFor(definition.id, currentRecords);
  const hasAnyEvidence = configuredModel ? value != null : evidenceFor(definition.id, records).length > 0;
  const previous = previousPeriod(definition, records, state, period, today, currentWeek);
  const comparison = previous && value != null && previous.value != null
    ? {
        ...comparePeriodValues({ currentValue: Number(value), previousValue: Number(previous.value), isCurrentWeek: definition.scope === 'calendar-week' }),
        previousValue: previous.value, previousStart: previous.start, previousEnd: previous.end,
        favorable: definition.inverse ? Number(value) < Number(previous.value) : Number(value) > Number(previous.value),
      }
    : null;
  if (comparison && definition.scope !== 'calendar-week') {
    const labels = {
      'rolling-7d': 'vs previous 7 days',
      'rolling-28d': 'vs previous 28 days',
      'rolling-12w': 'vs previous 12 weeks',
      'recent-8w': 'vs previous 8 weeks',
      'current-model': 'vs previous 8 weeks',
    };
    comparison.comparisonLabel = labels[definition.scope] || comparison.comparisonLabel;
  }
  const range = RUNNING_RANGE_OPTIONS.some((entry) => entry.id === options.range) ? options.range : '12w';
  const series = options.includeSeries === false ? [] : seriesFor(definition, records, state, range, today).map((point) => ({
    ...point,
    formatted: formatRunningMetricValue(definition, point.value, state),
  }));
  const sourceKinds = [...new Set(contributing.map((record) => record.sourceLabel))];
  const confidenceKinds = [...new Set(contributing.map((record) => record.confidence))];
  const zeroIsMeaningful = definition.id === 'running.form' && contributing.length > 0;
  const isEmpty = value == null || (Number(value) === 0 && !zeroIsMeaningful);
  const dailyBreakdown = calendarDayBreakdown(definition, records, state, period, today);
  return {
    definition, metricId: definition.id, range, rangeOptions: RUNNING_RANGE_OPTIONS,
    value,
    formattedValue: isEmpty && !hasAnyEvidence ? '—' : formatRunningMetricValue(definition, value, state),
    period, comparison, series, dailyBreakdown, contributing,
    empty: isEmpty,
    interpretation: isEmpty && !hasAnyEvidence ? definition.empty : interpretation(definition, value, contributing.length),
    dataSource: configuredModel ? definition.source : (sourceKinds.length ? sourceKinds.join(' · ') : definition.source),
    confidence: configuredModel ? 'User-configured/modelled input' : (confidenceKinds.length ? confidenceKinds.join(' · ') : 'No contributing source records'),
    exclusions: history.exclusions,
    recordCount: records.length,
    racePredictions: definition.id === 'running.race-projections' && value
      ? racePredictors(parseFloat(state?.thresholdPaceSeconds) || thresholdSecsFromVdot(Number(value)))
      : null,
  };
}
