// @ts-check
// =============================================================================
// ANALYTICS INVENTORY
// Executable inventory of user-facing analytics templates. This is product
// metadata, not a parallel roadmap: the roadmap records delivery status while
// this file lets tests fail when an analytic is added without an explicit data,
// period, interaction and evidence contract.
// =============================================================================
import { RUNNING_METRICS } from './running-detail.js';
import { STRENGTH_METRICS } from './strength-detail.js';

function item(config) {
  return Object.freeze({
    id: config.id,
    label: config.label,
    domain: config.domain,
    surfaces: Object.freeze(config.surfaces || []),
    sourceRecords: config.sourceRecords,
    calculationOwner: config.calculationOwner,
    unit: config.unit,
    timeScope: config.timeScope,
    comparisonRule: config.comparisonRule || 'No comparison is currently presented.',
    emptyState: config.emptyState,
    beforeInteraction: config.beforeInteraction || 'static',
    currentInteractive: config.currentInteractive || 'static',
    currentDestination: config.currentDestination || 'none',
    intendedDestination: config.intendedDestination,
    historicalSeries: config.historicalSeries,
    exactEvidence: config.exactEvidence,
    limitationsAndConfidence: config.limitationsAndConfidence || 'No explicit confidence treatment yet.',
    tests: Object.freeze(config.tests || []),
    implementation: config.implementation || 'planned',
  });
}

const runningSurfaces = {
  'running.weekly-distance': ['Running Overview', 'Running Stats', 'Home In Focus', 'Profile This Week'],
  'running.four-week-distance': ['Running Stats'],
  'running.total-distance': ['Running Stats', 'Profile Performance'],
  'running.weekly-duration': ['Running Stats', 'Profile This Week'],
  'running.weekly-run-count': ['Running Stats'],
  'running.total-run-count': ['Running Stats', 'Profile Performance'],
  'running.average-pace': ['Running Stats'],
  'running.best-pace': ['Running Overview', 'Running Stats', 'Profile Performance'],
  'running.longest-run': ['Running Stats', 'Profile Performance'],
  'running.weekly-elevation': ['Running Stats'],
  'running.average-heart-rate': ['Running Stats'],
  'running.max-heart-rate': ['Running Stats'],
  'running.cadence': ['Running Stats'],
  'running.aerobic-training-effect': ['Running Stats'],
  'running.anaerobic-training-effect': ['Running Stats'],
  'running.intensity-distribution': ['Running Stats'],
  'running.training-load': ['Running Stats'],
  'running.load-ratio': ['Running Stats'],
  'running.form': ['Running Stats'],
  'running.training-stress': ['Running Stats'],
  'running.vdot': ['Running Overview', 'Running Stats', 'Projections'],
  'running.threshold-pace': ['Running Stats'],
  'running.threshold-heart-rate': ['Running Stats'],
  'running.running-economy': ['Running Stats'],
  'running.fitness-trend': ['Running Stats'],
  'running.aerobic-efficiency': ['Running Stats'],
  'running.pace-heart-rate': ['Running Stats'],
  'running.endurance-score': ['Running Stats'],
  'running.race-projections': ['Running Stats', 'Projections'],
  'running.personal-bests': ['Running Stats', 'Profile Performance'],
};

const RUNNING_INVENTORY = RUNNING_METRICS.map((metric) => item({
  id: metric.id,
  label: metric.label,
  domain: 'running',
  surfaces: runningSurfaces[metric.id] || ['Running Stats'],
  sourceRecords: metric.source,
  calculationOwner: 'js/analytics/running-detail.js',
  unit: metric.unit,
  timeScope: metric.scope,
  comparisonRule: ['lifetime', 'configured', 'rolling-ewma'].includes(metric.scope)
    ? 'No fabricated period comparison; the detail explains the lifetime/configured/rolling scope.'
    : metric.scope === 'calendar-week'
      ? 'Live week uses elapsed-matched prior weekdays; completed history points are full Monday–Sunday weeks.'
      : 'Current rolling window compares with the immediately preceding equal-length window when both are valid.',
  emptyState: metric.empty,
  beforeInteraction: ['running.weekly-distance', 'running.average-pace', 'running.best-pace', 'running.vdot'].includes(metric.id) ? 'domain-only' : 'static',
  currentInteractive: 'exact-detail',
  currentDestination: `running-metric:${metric.id}`,
  intendedDestination: `running-metric:${metric.id}`,
  historicalSeries: metric.series === 'none' ? 'Unavailable without fabricating historical settings/model snapshots.' : `${metric.series} calendar series with selectable 4w/12w/6m/1y/all ranges.`,
  exactEvidence: 'Exact run session IDs open Activity Detail; selected chart points scope the contributing records.',
  limitationsAndConfidence: metric.limitations.length ? metric.limitations.join(' ') : 'Source confidence is shown per contributing activity.',
  tests: ['tests/running_metric_detail.test.js', 'tests/analytics_views_render.test.js', 'tests/metric_inventory.test.js'],
  implementation: 'implemented-this-slice',
}));

function strengthDetailContract(id) {
  const metric = STRENGTH_METRICS.find((entry) => entry.id === id);
  if (!metric) throw new Error(`Unknown Strength detail metric: ${id}`);
  return {
    calculationOwner: 'js/analytics/strength-detail.js',
    sourceRecords: metric.source,
    timeScope: metric.scope,
    comparisonRule: metric.scope === 'calendar-week'
      ? 'Live week compares elapsed weekdays with the same point in the previous week.'
      : metric.id === 'strength.four-week-volume'
        ? 'Trailing 28 calendar days compare with the immediately preceding 28 days.'
        : 'The value itself compares trailing 28-day tonnage with the immediately preceding 28 days.',
    emptyState: metric.empty,
    currentInteractive: 'exact-detail',
    currentDestination: `strength-metric:${metric.id}`,
    intendedDestination: `strength-metric:${metric.id}`,
    historicalSeries: 'Calendar-week points with selectable 4w/12w/6m/1y/all ranges.',
    exactEvidence: 'Exact strength session IDs open Activity Detail; selected chart points scope the contributing workouts.',
    limitationsAndConfidence: metric.limitations.join(' '),
    tests: ['tests/strength_metric_detail.test.js', 'tests/analytics_views_render.test.js', 'tests/metric_inventory.test.js'],
    implementation: 'implemented-this-slice',
  };
}

function group(domain, owner, common, rows) {
  return rows.map((row) => item({
    domain,
    calculationOwner: owner,
    sourceRecords: common.sourceRecords,
    unit: 'status',
    timeScope: common.timeScope,
    emptyState: common.emptyState,
    intendedDestination: `${domain}-metric:${row.id}`,
    historicalSeries: common.historicalSeries,
    exactEvidence: common.exactEvidence,
    tests: common.tests,
    ...row,
  }));
}

const HOME_INVENTORY = group('home', 'js/home/weekly-fitness-graph.js', {
  sourceRecords: 'Canonical calendar-week strength/run aggregates', timeScope: 'calendar-week',
  emptyState: 'Zero-data and future bars are labelled and cannot pretend to be activities.',
  historicalSeries: 'Seven inspectable daily bars.', exactEvidence: 'Populated bars open Activities for the exact local date.',
  tests: ['tests/weekly_fitness_graph.test.js', 'tests/weekly_analytics_integration.test.js'],
}, [
  {
    id: 'home.in-focus-strength',
    label: 'Gym Performance',
    unit: 'duration/sessions/working-sets/volume',
    surfaces: ['Home In Focus'],
    sourceRecords: 'Exact dated gym and strength activities across active, archived and independent sessions',
    calculationOwner: 'js/analytics/gym-performance.js + js/home/weekly-fitness-graph.js',
    timeScope: 'calendar 7d / 4w / 1y selected periods',
    comparisonRule: 'Live periods compare equal elapsed time with the previous period; completed periods compare full equal periods.',
    emptyState: 'No workouts in the selected period is stated; missing duration is disclosed without inventing time.',
    beforeInteraction: 'domain-only',
    currentInteractive: 'exact-detail-plus-exact-bars',
    currentDestination: 'Gym Performance / exact date Activities',
    intendedDestination: 'gym-performance',
    historicalSeries: 'Daily 7D, weekly 4W and monthly 1Y bars with backward period navigation.',
    exactEvidence: 'Home day bars open exact-date activities; Gym Performance bins list exact contributing activity IDs.',
    limitationsAndConfidence: 'Time totals disclose how many workouts have recorded duration; future and undated records are excluded.',
    tests: ['tests/gym_performance.test.js', 'tests/analytics_views_render.test.js', 'scripts/gym-performance-browser-check.mjs'],
    implementation: 'supported-existing',
  },
  { id: 'home.in-focus-running', label: 'Run Performance', unit: 'distance/duration', surfaces: ['Home In Focus'], beforeInteraction: 'domain-only', currentInteractive: 'domain-plus-exact-bars', currentDestination: 'Running / exact date Activities', intendedDestination: 'running-metric:running.weekly-distance', implementation: 'existing-partial' },
]);

const STRENGTH_INVENTORY = group('strength', 'js/analytics/views/view-strength.js + js/analytics/strength-calendar.js', {
  sourceRecords: 'Completed dated working sets across all activations', timeScope: 'metric-specific calendar/program/lifetime scope',
  emptyState: 'No completed history is stated without a false decline or PR.',
  historicalSeries: 'Existing weekly/program series; dedicated metric range contract remains incomplete.',
  exactEvidence: 'Weekly Volume, exercise and muscle drilldowns link exact workouts; other cards do not yet.',
  tests: ['tests/strength_calendar.test.js', 'tests/strength_volume_detail.test.js', 'tests/analytics_views_render.test.js'],
}, [
  { id: 'strength.estimated-1rm', label: 'Estimated 1RM', unit: 'weight', surfaces: ['Strength Overview', 'Strength Stats', 'Profile PRs'], currentInteractive: 'mixed', currentDestination: 'Exercise detail for dynamic lift rows; static hero/profile instances', intendedDestination: 'strength-metric:strength.estimated-1rm', implementation: 'existing-partial' },
  { id: 'strength.weekly-e1rm-change', label: 'e1RM Change This Week', unit: 'weight/percent', surfaces: ['Strength Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.weekly-volume', label: 'Weekly Volume', unit: 'weight-volume', surfaces: ['Strength Overview', 'Strength Stats', 'Profile This Week'], currentInteractive: 'exact-detail', currentDestination: 'weekly-volume', intendedDestination: 'weekly-volume', implementation: 'supported-existing' },
  { id: 'strength.four-week-volume', label: '4-Week Volume', unit: 'weight-volume', surfaces: ['Strength Stats'], ...strengthDetailContract('strength.four-week-volume') },
  { id: 'strength.acute-load', label: '7-Day Load (ATL)', unit: 'load', surfaces: ['Strength Stats'], timeScope: 'rolling-7d', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.chronic-load', label: '28-Day Load (CTL)', unit: 'load', surfaces: ['Strength Stats'], timeScope: 'rolling-28d', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.load-ratio', label: 'Acute:Chronic Ratio', unit: 'ratio', surfaces: ['Strength Stats'], timeScope: 'rolling-ewma', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.fatigue-trend', label: 'Fatigue Trend', unit: 'status', surfaces: ['Strength Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.volume-progression', label: 'Volume Progression', unit: 'percent', surfaces: ['Strength Stats'], ...strengthDetailContract('strength.volume-progression') },
  { id: 'strength.recovery-impact', label: 'Recovery Impact', unit: 'percent', surfaces: ['Strength Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.exercise-progression', label: 'Exercise Progression', unit: 'weight/e1rm', surfaces: ['Strength Stats'], currentInteractive: 'exact-detail', currentDestination: 'exercise detail', intendedDestination: 'exercise', implementation: 'supported-existing' },
  { id: 'strength.muscle-set-credits', label: 'Muscle Group Set Credits', unit: 'sets', surfaces: ['Strength Stats'], ...strengthDetailContract('strength.muscle-set-credits') },
  { id: 'strength.per-muscle-volume', label: 'Per-Muscle Volume', unit: 'weight-volume', surfaces: ['Strength Stats', 'Weekly Volume'], currentInteractive: 'mixed', currentDestination: 'Muscle detail only from Weekly Volume', implementation: 'existing-partial' },
  { id: 'strength.relative-volume-balance', label: 'Relative Volume Balance', unit: 'percent', surfaces: ['Strength Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.training-calendar', label: 'Training Calendar', unit: 'activity-count', surfaces: ['Strength Stats', 'Profile'], currentInteractive: 'mixed', currentDestination: 'Profile is static; strength calendar date behaviour varies' },
  { id: 'strength.relative-strength', label: 'Strength to Bodyweight', unit: 'multiple', surfaces: ['Profile Hero'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'strength.personal-records', label: 'Lift PRs', unit: 'weight', surfaces: ['Strength Stats', 'Profile Performance'], currentInteractive: 'mixed', currentDestination: 'Exercise detail only from Strength' },
]);

const RECOVERY_INVENTORY = group('recovery', 'js/analytics/views/view-recovery.js + js/home/dashboard-model.js', {
  sourceRecords: 'Dated wellness, Health Connect and calendar-contiguous sRPE records', timeScope: 'today / calendar week / rolling 28 days',
  emptyState: 'No signal is neutral and confidence-labelled, not shown as poor recovery.',
  historicalSeries: 'Several 28-day charts exist, but metric-specific range/detail contracts remain incomplete.',
  exactEvidence: 'No consistent exact-record evidence navigation yet.',
  tests: ['tests/readiness.test.js', 'tests/recovery_calendar.test.js', 'tests/load_models.test.js'],
}, [
  { id: 'recovery.readiness', label: 'Readiness', unit: 'score', surfaces: ['Home Today', 'Recovery Overview'], beforeInteraction: 'supporting-guidance', currentInteractive: 'domain-only', currentDestination: 'Recovery & Load Stats' },
  { id: 'recovery.confidence', label: 'Readiness Confidence', unit: 'percent', surfaces: ['Recovery Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.form', label: 'Form (TSB)', unit: 'load', surfaces: ['Recovery Overview', 'Recovery Stats'], timeScope: 'rolling-ewma', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.load-ratio', label: 'Load Ratio (ACWR)', unit: 'ratio', surfaces: ['Recovery Overview', 'Recovery Stats'], timeScope: 'rolling-ewma', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.average-rpe', label: 'Average RPE', unit: 'rpe', surfaces: ['Recovery Stats'], timeScope: 'calendar-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.capacity', label: 'Recovery Capacity', unit: 'percent', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.sessions', label: 'Sessions Logged', unit: 'count', surfaces: ['Recovery legacy summary'], timeScope: 'calendar-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.nervous-system', label: 'Nervous System', unit: 'status', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.momentum', label: 'Recovery Momentum', unit: 'status', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.sleep-average', label: 'Sleep Average', unit: 'hours', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.sleep-debt', label: 'Sleep Debt', unit: 'hours/days', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.hrv-current', label: 'HRV Today', unit: 'ms', surfaces: ['Recovery Stats', 'Profile Health'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.hrv-baseline', label: 'HRV 28-Day Baseline', unit: 'ms', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.resting-heart-rate', label: 'Resting Heart Rate', unit: 'bpm', surfaces: ['Recovery Stats', 'Profile Health'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.recovery-score-trend', label: 'Recovery Score Trend', unit: 'score', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.mood', label: 'Mood', unit: '1-5', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.soreness', label: 'Soreness', unit: '1-5', surfaces: ['Recovery Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.rpe-trend', label: 'Program-Week RPE Trend', unit: 'rpe', surfaces: ['Recovery Stats'], timeScope: 'program-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.load-balance', label: 'Load Balance', unit: 'load/ratio', surfaces: ['Recovery Stats'], timeScope: 'rolling-ewma', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'recovery.steps', label: 'Daily Steps', unit: 'steps', surfaces: ['Profile Health'], timeScope: 'latest day', currentInteractive: 'static', currentDestination: 'none' },
]);

const HYBRID_INVENTORY = group('hybrid', 'js/brain/hybrid-score/', {
  sourceRecords: 'Goal-weighted strength, endurance, recovery, load, momentum, body and lifestyle signals', timeScope: 'daily score with program-week strength progression and rolling inputs',
  emptyState: 'Calibrating state names the records needed.', historicalSeries: 'Daily and weekly score series exist; pillar-specific history does not.',
  exactEvidence: 'Driver explanations name signals but do not yet open exact source records.',
  tests: ['tests/hybrid_score.test.js', 'tests/hybrid_score_history.test.js'],
}, [
  { id: 'hybrid.score', label: 'Hybrid Score', unit: 'score', surfaces: ['Home', 'Insights', 'Review'], currentInteractive: 'exact-detail', currentDestination: 'Hybrid Score detail', intendedDestination: 'hybrid-score', implementation: 'supported-existing' },
  { id: 'hybrid.confidence', label: 'Score Confidence', unit: 'percent', surfaces: ['Home', 'Hybrid Score detail'], currentInteractive: 'inline-only', currentDestination: 'Hybrid Score detail' },
  { id: 'hybrid.train-dial', label: 'Train Dial', unit: 'score', surfaces: ['Home', 'Hybrid Score detail'], currentInteractive: 'inline-only', currentDestination: 'none' },
  { id: 'hybrid.recover-dial', label: 'Recover Dial', unit: 'score', surfaces: ['Home', 'Hybrid Score detail'], currentInteractive: 'inline-only', currentDestination: 'none' },
  { id: 'hybrid.progress-dial', label: 'Progress Dial', unit: 'score', surfaces: ['Home', 'Hybrid Score detail'], currentInteractive: 'inline-only', currentDestination: 'none' },
  ...['consistency', 'recovery', 'strength', 'endurance', 'load', 'momentum', 'body', 'lifestyle'].map((name) => ({ id: `hybrid.pillar-${name}`, label: `${name[0].toUpperCase()}${name.slice(1)} Pillar`, unit: 'score', surfaces: ['Hybrid Score detail'], currentInteractive: 'expandable-inline', currentDestination: 'inline signals' })),
  { id: 'hybrid.daily-trend', label: 'Hybrid Score Daily Trend', unit: 'score', surfaces: ['Hybrid Score detail'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'hybrid.weekly-average', label: 'Hybrid Score Weekly Average', unit: 'score', surfaces: ['Hybrid Score detail'], currentInteractive: 'static', currentDestination: 'none' },
]);

const REVIEW_INVENTORY = group('review', 'js/brain/weekly-review.js + js/brain/monthly-report.js', {
  sourceRecords: 'Dated strength/run activities, program plan and Hybrid Score history', timeScope: 'calendar-week / calendar-month / lifetime',
  emptyState: 'Review explains that it builds as the athlete trains.', historicalSeries: 'Weekly score arc and program-week consistency table; dedicated details remain incomplete.',
  exactEvidence: 'PR list and totals do not consistently open exact activities.', tests: ['tests/weekly_review.test.js', 'tests/monthly_report.test.js'],
}, [
  { id: 'review.weekly-score-arc', label: 'Hybrid Score This Week', unit: 'score', surfaces: ['Review Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.weekly-sessions', label: 'Sessions This Week', unit: 'count', surfaces: ['Review Overview', 'Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.adherence', label: 'Adherence', unit: 'percent', surfaces: ['Review Overview', 'Review Stats'], timeScope: 'program-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.weekly-volume', label: 'Weekly Strength Volume', unit: 'weight-volume', surfaces: ['Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.weekly-distance', label: 'Weekly Run Distance', unit: 'distance', surfaces: ['Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.weekly-duration', label: 'Weekly Duration', unit: 'duration', surfaces: ['Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.personal-records', label: 'New Records', unit: 'count/list', surfaces: ['Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.current-streak', label: 'Current Streak', unit: 'days', surfaces: ['Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.longest-streak', label: 'Longest Streak', unit: 'days', surfaces: ['Review Stats'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.goal-progress', label: 'Goal Progress', unit: 'percent', surfaces: ['Review Stats'], timeScope: 'program-run', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.consistency-log', label: 'Consistency Log', unit: 'mixed', surfaces: ['Review Stats'], timeScope: 'program-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'review.monthly-report', label: 'Monthly Report', unit: 'mixed', surfaces: ['Review Stats'], timeScope: 'calendar-month', currentInteractive: 'static', currentDestination: 'none' },
]);

const PROFILE_INVENTORY = group('profile', 'js/profile-stats.js + js/athlete-profile.js', {
  sourceRecords: 'All-activation activity history, current program and Health Connect snapshots', timeScope: 'lifetime / current calendar week / latest',
  emptyState: 'New-athlete profile collapses empty analytics into a focused first-action state.', historicalSeries: 'Heatmap/bodyweight/PR fragments exist; most summary tiles lack dedicated histories.',
  exactEvidence: 'Recent session rows open exact activities; most summary tiles remain static.', tests: ['tests/analytics_scope_contract.test.js', 'tests/user_profiles.test.js'],
}, [
  { id: 'profile.hybrid-level', label: 'Hybrid Level', unit: 'xp/level', surfaces: ['Profile Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.milestones', label: 'Milestones', unit: 'count', surfaces: ['Profile Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.program-progress', label: 'Current Program Progress', unit: 'week/percent', surfaces: ['Profile Overview'], timeScope: 'program-run', currentInteractive: 'domain-only', currentDestination: 'Programs' },
  { id: 'profile.lifetime-best-streak', label: 'Best Streak', unit: 'days', surfaces: ['Profile Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.lifetime-sessions', label: 'Lifetime Sessions', unit: 'count', surfaces: ['Profile Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.lifetime-volume', label: 'Lifetime Volume', unit: 'weight-volume', surfaces: ['Profile Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.lifetime-distance', label: 'Lifetime Distance', unit: 'distance', surfaces: ['Profile Overview'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.this-week-sessions', label: 'This Week Sessions', unit: 'count', surfaces: ['Profile Stats'], timeScope: 'calendar-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.this-week-volume', label: 'This Week Volume', unit: 'weight-volume', surfaces: ['Profile Stats'], timeScope: 'calendar-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.this-week-distance', label: 'This Week Distance', unit: 'distance', surfaces: ['Profile Stats'], timeScope: 'calendar-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.this-week-time', label: 'This Week Time', unit: 'duration', surfaces: ['Profile Stats'], timeScope: 'calendar-week', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.activity-heatmap', label: 'Training Activity Heatmap', unit: 'relative-load', surfaces: ['Profile Stats'], timeScope: '12 calendar weeks', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'profile.bodyweight-trend', label: 'Body Weight Trend', unit: 'weight', surfaces: ['Profile Stats', 'Body Weight detail'], timeScope: '30 days/lifetime', currentInteractive: 'mixed', currentDestination: 'Body Weight is separately reachable from Insights' },
  { id: 'profile.completed-programs', label: 'Completed Programs', unit: 'count/list', surfaces: ['Profile Stats'], timeScope: 'lifetime', currentInteractive: 'static', currentDestination: 'none' },
]);

const FASTING_INVENTORY = group('fasting', 'js/fasting/fasting-calcs.js + js/analytics/views/view-fasting.js', {
  sourceRecords: 'Completed and active fasting sessions', timeScope: 'metric-specific 7d/30d/month/lifetime',
  emptyState: 'First-fast guidance or zero values are shown without invented history.', historicalSeries: 'Multiple fasting charts exist but cards do not open metric-specific details.',
  exactEvidence: 'Calendar/history is visible but stat cards do not consistently open exact fasts.', tests: ['tests/fasting_calcs.test.js', 'tests/fasting.test.js'],
}, [
  { id: 'fasting.score', label: 'Fasting Score', unit: 'score', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.current-progress', label: 'Current Fast Progress', unit: 'duration/percent', surfaces: ['Home', 'Fasting'], timeScope: 'active session', currentInteractive: 'domain-only', currentDestination: 'Fasting' },
  { id: 'fasting.weekly-hours', label: 'Weekly Hours', unit: 'hours', surfaces: ['Fasting'], timeScope: 'rolling-7d', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.monthly-hours', label: 'Monthly Hours', unit: 'hours', surfaces: ['Fasting'], timeScope: 'calendar-month', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.current-streak', label: 'Current Streak', unit: 'days', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.longest-streak', label: 'Longest Streak', unit: 'days', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.average-duration', label: 'Average Duration', unit: 'hours', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.goal-completion', label: 'Goal Completion', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.consistency', label: 'Consistency', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.adherence', label: 'Adherence', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.total-fasts', label: 'Total Fasts', unit: 'count', surfaces: ['Fasting'], timeScope: 'lifetime', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.lifetime-hours', label: 'Lifetime Hours', unit: 'hours', surfaces: ['Fasting'], timeScope: 'lifetime', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.average-start', label: 'Average Start Time', unit: 'time-of-day', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.average-end', label: 'Average End Time', unit: 'time-of-day', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.weekly-momentum', label: 'Weekly Momentum', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.monthly-momentum', label: 'Monthly Momentum', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.routine-stability', label: 'Routine Stability', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.habit-strength', label: 'Habit Strength', unit: 'score', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.load', label: 'Fasting Load', unit: 'hours', surfaces: ['Fasting'], timeScope: 'rolling-4w', currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.zone-distribution', label: 'Metabolic Zone Distribution', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.weekday-rate', label: 'Weekday Rate', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'fasting.weekend-rate', label: 'Weekend Rate', unit: 'percent', surfaces: ['Fasting'], currentInteractive: 'static', currentDestination: 'none' },
]);

const BODY_AND_PROJECTION_INVENTORY = group('other', 'js/analytics/views/view-bodyweight.js + js/analytics/views/view-projections.js', {
  sourceRecords: 'Bodyweight log or current performance models', timeScope: 'lifetime/current model',
  emptyState: 'The screen names the input required.', historicalSeries: 'Bodyweight has a trend; projections have no retained model snapshots.',
  exactEvidence: 'No exact activity evidence contract yet.', tests: ['tests/predictions.test.js', 'tests/dashboard_model.test.js'],
}, [
  { id: 'bodyweight.trend', label: 'Body Weight Trend', domain: 'bodyweight', unit: 'weight', surfaces: ['Body Weight'], currentInteractive: 'exact-detail', currentDestination: 'Body Weight', intendedDestination: 'bodyweight', implementation: 'supported-existing' },
  { id: 'projections.race-times', label: 'Predicted Race Times', domain: 'projections', unit: 'duration/pace', surfaces: ['Projections'], currentInteractive: 'static', currentDestination: 'none' },
  { id: 'projections.strength-milestones', label: 'Strength Milestone ETA', domain: 'projections', unit: 'date/weight', surfaces: ['Projections'], currentInteractive: 'static', currentDestination: 'none' },
]);

export const ANALYTICS_INVENTORY = Object.freeze([
  ...RUNNING_INVENTORY,
  ...HOME_INVENTORY,
  ...STRENGTH_INVENTORY,
  ...RECOVERY_INVENTORY,
  ...HYBRID_INVENTORY,
  ...REVIEW_INVENTORY,
  ...PROFILE_INVENTORY,
  ...FASTING_INVENTORY,
  ...BODY_AND_PROJECTION_INVENTORY,
]);

export const ANALYTICS_EXCLUSIONS = Object.freeze([
  { pattern: 'Dormant TILE_REGISTRY configurations', reason: 'The former Home At-a-Glance grid has been removed; these remain code configurations pending safe deletion, not current user-facing analytics.' },
  { pattern: 'Activity rows and recent-session rows', reason: 'Evidence/navigation records, not derived analytics; they remain exact interactive destinations.' },
  { pattern: 'Program cards and workout prescriptions', reason: 'Plans and actions, not measurements of completed performance.' },
  { pattern: 'Coach recommendations and warning copy', reason: 'Interpretations of metrics, inventoried through their source metric rather than counted as duplicate numeric tiles.' },
  { pattern: 'Connect Health, Log, Start and Settings cards', reason: 'Setup/action surfaces, not analytics.' },
]);

export function analyticsInventorySummary() {
  const exact = ANALYTICS_INVENTORY.filter((entry) => entry.currentInteractive === 'exact-detail').length;
  const newlyExact = ANALYTICS_INVENTORY.filter((entry) => entry.implementation === 'implemented-this-slice').length;
  const staticCount = ANALYTICS_INVENTORY.filter((entry) => entry.currentInteractive === 'static').length;
  const tileInstances = ANALYTICS_INVENTORY.reduce((total, entry) => total + Math.max(1, entry.surfaces.length), 0);
  return { metrics: ANALYTICS_INVENTORY.length, tileInstances, exact, newlyExact, static: staticCount, excludedPatterns: ANALYTICS_EXCLUSIONS.length };
}
