# Time-Model Audit — Program Week vs Calendar Week

_Branch: `claude/weekly-analytics-attribution-usq2c2` · 2026-07-13_

Helyx has **two distinct notions of "week"** that were historically conflated. This
audit classifies every week-based reference so the two can never be mixed again.

## The two clocks (+ a third window)

| Clock | Meaning | Source of truth |
|---|---|---|
| **Program week** | Where the athlete is *inside the active plan* ("Week 3 of 10"). Advances only on an explicit step / confirmed auto-advance. | `state.currentWeek`, `state.weeks[N]` |
| **Calendar week** | The real Monday–Sunday period training was *performed* in. | each logged day's stamped `weeks[N].dates[day]`, bucketed by `js/analytics/weekly-aggregate.js` |
| **Rolling window** | "Last 7 / 28 days", EWMA acute/chronic — not a fixed week at all. | day-timeline EWMA in `load_models.js` |

**Rule:** `state.currentWeek` means *program position only*. Calendar analytics
attribute logged work by real dates. Rolling windows stay rolling.

## Classification

### A. Calendar-week (must use real dates) — FIXED
| Site | Was | Now |
|---|---|---|
| Home "In Focus" graph (`week-chart-model.js` `buildWeekChart`) | `weeks[currentWeek]` = this week | calendar-bucketed via `weekly-aggregate.js` |
| At-a-Glance Weekly Volume tile (`dashboard-model.js` `model.calendarWeek`, `dashboard.js`) | `strengthLoadSeries[currentWeek-1]` | `buildCalendarWeekStrength` |
| Strength detail Weekly Volume + week nav (`view-strength.js`) | `weekOffset = (ci+1) − currentWeek` (program) | `getCalendarWeekOffset()` (calendar) |
| Running detail Weekly Distance + week nav (`view-running.js`) | same program mapping | `getCalendarWeekOffset()` |
| **Analytics week navigator** (`week-nav.js`) | `getSelectedWeek = currentWeek + offset` (program), label from `weeks[N].dates` min/max | calendar offset; label = real Mon–Sun range |
| Strength "This week's sessions" strip (`view-strength.js`) | `weeks[currentWeek]` | `collectCalendarWeek(weekStartOf(today))`, chip keeps source program week |
| `curWeekIdx` (`screen-kit.js`) | program-week → series index | **removed** (no longer needed) |

### B. Program-week (correct — left unchanged)
These describe *plan position / adherence*, never "this calendar week":
- `recommendations.js` — today's prescribed session + adherence to the current plan week.
- `morning-briefing.js` — is today's *planned* session logged yet.
- `day-verdict.js` — deload-week detection, today's plan verdict.
- `home.js` header — "Week N" block indicator + phase label (correctly labelled "Week N", not "this week").
- `view-progress.js` — program progress / adherence ("Week N of M", planned vs done).
- `view-weekly-review.js` — share label `Week ${currentWeek}` (program context).
- `programs/*`, `settings.js` (`stepCurrentWeek`), `app.js` (advance modal), `workout.js` (logging into the active program week), `engine.js`, `dragdrop.js`.

### C. Rolling-window / EWMA (correct — left unchanged, NOT converted to calendar)
- `load_models.js` `recomputeLoadMetrics` → `state.loadMetrics.{atl,ctl}` — 7/28-day EWMA over a reconstructed daily timeline. Powers TSB/ACWR and readiness. Rolling by design.
- `dashboard-model.js` readiness (`computeReadiness`) — multi-signal, last-N-days windows.
- Hybrid Score inputs that read the EWMA load/readiness — rolling by design.

### D. Program-week-bucketed trend series & secondary displays (intentional; see Limitations)
Progression/trend charts that plot **one point per program week** across the whole
plan — program-week bucketing is the intended x-axis (they answer "how did Week 3
compare to Week 2 *in the plan*"), and they are **full-history, not** a "this week"
headline:
- `metrics-strength.js` `weeklyTonnageSeries` / `weeklyE1rmByLift` / `weeklyVolumeByMuscle`; `strength-calcs.js` volume progression, block PR.
- `load_models.js` `strengthLoadSeries` / `enduranceLoadSeries` / `weeklyLoadMetricsSeries` — the sparkline series + `model.week.*` progression consumed by Hybrid Score / weekly review.
- `load_models.js` `recoveryCostBalance`, `metrics-load.js` `readinessMetrics` — program-week acute/chronic buckets.
- `profile-stats.js` heatmap / recent-sessions — anchored via `weekStartedAt`.
- `view-recovery.js` RPE recovery — current program-week RPE.

## Remaining limitation (documented, not a "this week" headline)
`metrics-strength.js` `dynamicStats.currentWeekMax/prevWeekMax` bucket per-lift e1RM by
**program week**; the Strength overview shows a "+X kg this week" est-1RM delta from it.
On a frozen program week this delta can lag the calendar. It is a secondary per-lift
figure (not the reported Weekly-Volume defect) and converting it needs calendar
bucketing of per-lift maxes — tracked as future work, kept program-based for now.

## Guardrails
- `tests/analytics_calendar_guard.test.js` — static check: the calendar-core modules
  (`week-chart-model.js`, `weekly-aggregate.js`, `week-nav.js`) contain **no** program-week
  (`currentWeek` / `getSelectedWeek`) reads, and no label is derived from the min/max of
  activity dates.
- `tests/time_model_separation.test.js` + `tests/weekly_aggregate.test.js` — behavioural
  proof that program advancement and calendar rollover are independent.
