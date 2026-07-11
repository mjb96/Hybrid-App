# Analytics Verification & In Focus Weekly Graph — 2026-07-11

Session on `claude/helyx-analytics-verification-lpc8ma`. Traced the full path from
stored data to displayed analytics, verified the key metrics against independently
hand-calculated fixtures, fixed the In Focus weekly graph, and brought it back to
the Home screen built on a single shared, tested model.

## 1. Analytics calculation flow (as it actually is)

```
state.weeks["N"]                     ← a PROGRAM week N (not a raw calendar week),
  .lifts[dayKey][liftName] = [sets]     whose day keys mon..sun are anchored to real
  .runs[dayKey]  = {dist,time,elev…}    calendar dates via  .dates[dayKey] = 'YYYY-MM-DD'.
  .gymStats[dayKey] = {time,cals,…}     A Helyx "week" is therefore a Monday-first local
  .dates[dayKey] = 'YYYY-MM-DD'         calendar week — the whole app is built on it.
        │
        ├─ set-utils.js            isCompletedSet / isWarmupSet / setVolume / dayVolume  (canonical)
        ├─ metrics-strength.js     weeklyTonnageSeries, weeklyE1rmByLift, weeklyVolumeByMuscle …
        ├─ metrics-running.js      weeklyDistanceSeries, weeklyPaceSeries (distance-weighted) …
        ├─ strength-calcs.js       computeStrengthAnalytics → strength detail view
        ├─ running-calcs.js        computeRunningAnalytics → running detail view
        ├─ session-compare.js      compareSessionToPrevWeek (same weekday, prev week)
        ├─ dashboard-model.js      one shared brain pass for Home tiles (pace-matched WoW)
        └─ analytics/week-chart-model.js   ← NEW: single source for the In Focus graph
```

## 2. Metric definitions used (In Focus)

| Metric | Definition | Source of truth |
|---|---|---|
| Working sets | Count of completed sets that are **not** warm-ups (`isCompletedSet && !isWarmupSet`) | set-utils |
| Volume | Σ weight × reps over completed working sets (warm-ups & incompletes excluded) | set-utils `setVolume` |
| Strength time | Real imported FIT duration (`gymStats.time`) only — **never fabricated** | gymStats |
| Distance | Σ `runs[day].dist` (km, canonical; converted to user units at display) | runs |
| Running time | Σ parsed `runs[day].time` (seconds) | runs |

## 3. Week-boundary & comparison rules (deliberate + labelled)

- **Week** = program week N; its 7 day slots (mon..sun) map to real local dates.
- **Current week → "live" comparison:** this week's **elapsed** days (Mon..today) vs the
  **same elapsed days** of the previous week. Label: **"vs same point last week."** Never
  a partial-vs-full comparison.
- **Past week → "completed" comparison:** the full selected week vs the full week before it.
  Label: **"vs previous week."**
- **Zero denominator / no prior week →** never `Infinity` / `NaN`. An honest message is
  shown instead ("None at this point last week", "No activity to compare", "Not enough
  previous data to compare").

## 4. Bugs found & fixed (In Focus graph)

| # | Bug (before) | Root cause | Fix |
|---|---|---|---|
| 1 | Strength "Time"/"Calories" were **fabricated** (`sets × 180 s`, `sets × 12 kcal`) and shown as real numbers | The graph invented duration when no FIT import existed | Removed fabrication; strength now shows **Working Sets** (default), **Volume**, and real FIT **Time** only |
| 2 | No **working-sets** or **volume** metric at all | Only Time/Calories tabs existed | Added honest, always-available Sets & Volume metrics from the shared layer |
| 3 | **No week-to-week comparison** — only "Total"/"Avg Daily" | Never implemented | Added a labelled, honest live/completed comparison with zero-safe percentages |
| 4 | Graph **computed analytics itself** (`_loadData`) — could diverge from detail views | UI duplicated calculation | All numbers now come from the shared `buildWeekChart` model |
| 5 | In Focus section was **hidden** (`display:none`) — not on Home | Prior "V2" change moved it off Home | Un-hidden; polished graph restored to the Home In Focus area |

## 5. Verified-correct (independently, via fixtures)

Confirmed correct and reused (not changed):
- Warm-up exclusion everywhere strength volume/e1RM/PRs are computed (`isWorkingSet`).
- Distance-weighted weekly pace (`weeklyPaceSeries` = Σ pace·dist / Σ dist, **not** a mean
  of paces); walks excluded from the pace/VDOT signal but kept in distance/load.
- `dashboard-model` pace-matched week-over-week (same-weekday elapsed comparison).
- `pctChange` / `makeDelta` already null-guard a zero denominator (no `Infinity`).

## 6. Tests added

- `tests/week_chart_model.test.js` — 16 deterministic tests with hand-calculated
  expected values: normal week, partial live week, two completed weeks, month/year
  boundaries, warm-up + incomplete exclusion, edited & deleted workouts, active
  unfinished workout, future-dated day, zero-previous-week, kg/lb, running buckets,
  missing/empty weeks, metric defaults.
- `tests/weekly_fitness_graph.test.js` — 10 render/a11y tests: 7 day columns, default
  Working Sets, per-bar accessible labels ("Monday, 3 sets" / "Tuesday, no activity"),
  live-comparison label, no NaN/Infinity, today highlight, nav button names, chart
  summary label, mile units, graceful zero-data week.

Dev-only inspector: `scripts/analytics-verify.mjs` prints source → week keys → daily →
weekly → comparison, plus a perf run (200-week history: ~0.01 ms/`buildWeekChart`).

## 7. Remaining / not changed (evidence-based)

- **Detail-view "Weekly Volume … vs last week"** (`view-strength.js`) compares the partial
  current week against the *full* previous week under a "vs last week" label. This is an
  established app metric; the In Focus graph now presents the honest elapsed comparison. A
  follow-up could align the detail label, but changing that number was out of scope for a
  data-safety-first pass and left for a deliberate decision.
- **Health Connect / GPS / manual run de-duplication** happens upstream where a day's single
  `runs[day]` object is written; within analytics there is one record per day so no
  double-count occurs, but the merge/import policy itself was not re-audited here.
- Android on-device rendering of the new graph (touch targets, safe areas) still needs a
  real-device check `[You]`.

## 8. Before / after ratings

| Dimension | Before | After |
|---|---|---|
| Analytics accuracy | 7 (correct core, but graph fabricated strength time) | 9 |
| Week-to-week comparisons | 4 (graph had none; detail label partial-vs-full) | 8 |
| Analytics clarity | 6 | 8.5 |
| Home In Focus experience | 3 (hidden; fabricated numbers when shown) | 8.5 |
