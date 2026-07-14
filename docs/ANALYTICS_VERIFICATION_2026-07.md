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

---

# Part 2 — Analytics → action: insight trust, evidence & de-duplication (2026-07-11)

Second pass on the same branch: reviewing the path *logged data → weekly analytics
→ Hybrid Score → insight → recommended action* for whether a normal user can tell
what changed, why, whether it matters, and what to do next.

## Data → recommendation flow
```
weeks[N] ─► shared aggregates (week-chart-model / load_models / dashboard-model)
         ─► Hybrid Score (8 pillars, additive drivers)
         ─► generateRecommendation (ACWR/TSB/RPE/session → one coach line)
         ─► Morning Briefing card  (greeting · session · mission · coach line
                                    + NEW "Why am I seeing this?" evidence)
         ─► Overtraining escalation card (stacked-signal safety, acknowledge-required)
```

## Bugs / regressions found & fixed
| # | Issue | Root cause | Fix |
|---|---|---|---|
| 1 | **Overtraining escalation card never rendered** | `renderOvertrainingCard` referenced an out-of-scope `DEFAULT_DAYS`; the `ReferenceError` was swallowed by its own `try/catch`, so the safety card was silently dead | Assess risk **once** in `renderHome` with the correct days source and pass it in; card now renders |
| 2 | **Two red cards for one cause** | Briefing coach line ("Reduce load today") and the overtraining card both fired on a load spike | Briefing now **defers** its load line when the escalation card is on screen — one voice |
| 3 | **Recommendations had no visible evidence** | Coach line deliberately hid all numbers; no way to see *why* | New `buildCoachEvidence` → a collapsible **"Why am I seeing this?"** with concrete facts + "what clears it" |

## New: evidence & recommendation hierarchy
- **Escalation (acknowledge-required):** overtraining card — stacked fatigue signals, lists its signal chips as evidence, owns the load message when active.
- **Daily coach line (one voice):** the briefing recommendation, now with progressive-disclosure evidence built from the **same verified aggregates** as the In Focus graph (working sets this week vs the same point last week, running distance, readiness, plain-language load direction).
- **Supporting detail:** the per-view analytics insights (unchanged) live one tap deeper.

Every important recommendation now answers: *what happened* (coach headline),
*why Helyx thinks so* (evidence bullets), *what to do* (existing advice),
*what clears it* (the clears line), and *how confident* (a "· limited data" marker
when sleep/readiness coverage is thin).

## Incomplete-data honesty
`buildCoachEvidence` distinguishes insufficient data from zero: on a recovery call it
adds "Sleep logged N of the last 7 nights — recovery read is partial" (and marks the
disclosure *limited data*) or "No recent readiness data — based on training load
alone", rather than implying a confident conclusion. With no load/readiness/logged
work it returns **no bullets** (the disclosure simply doesn't appear).

## In Focus interaction
Bar tap now leads with a compact daily summary — e.g. *"5 working sets across 2
exercises · 2,900 kg"* or *"6.4 km in 34:10"* — above the existing stat grid.

## Consistency (asserted in tests)
`buildWeekChart` totals equal `strengthLoadSeries` / `enduranceLoadSeries` and the
dashboard model's `week.volume.current`, week-for-week, warm-ups excluded identically.

## Files changed (Part 2)
`js/brain/coach-evidence.js` (new), `js/brain/morning-briefing.js`,
`js/home/morning-briefing-card.js`, `js/home.js` (bug fix + single assessment),
`js/home/weekly-fitness-graph.js` (daily summary), `css/hybrid-score.css`,
`css/styles.css`. Tests: `tests/coach_evidence.test.js` (7),
`tests/home_brain_consistency.test.js` (6), +2 In Focus modal tests. 568 total, all
green; typecheck / precache / smoke green; rendered HTML verified.

## Ratings (this pass)
| Dimension | Before | After |
|---|---|---|
| Analytics trust | 7 | 8.5 |
| Analytics clarity | 7 | 8.5 |
| Recommendation usefulness | 5 (advice, no visible why) | 8 |
| In Focus usability | 8 | 8.5 |
| Hybrid Brain usefulness | 5 (dead safety card, duplicate reds) | 8 |
| Overall home-screen experience | 6.5 | 8.5 |

**Would a normal user know what to do next after opening the app?** Yes — one coach
line states the action, the mission is a tap target to do it, and "Why am I seeing
this?" shows the evidence on demand without cluttering the calm default.

## Remaining limitations
- Detail-view "Weekly Volume … vs last week" label (partial-vs-full) still deferred.
- Per-view analytics insight severities (`insight-engine.js`) not re-tiered this pass.
- On-device check of the disclosure + escalation card still needed `[You]`.

---

# Part 3 — Release verification (2026-07-11)

Taking the analytics/home experience from correct to release-ready.

## Comparison-period consistency (Priority 1)
Traced every week-over-week label. The one real mismatch — the **detail-view
"Weekly Volume / Weekly Distance … vs last week"** stat cards, which showed the
CURRENT partial week's value against the *full* previous week under a "last week"
label — is fixed. Both strength and running detail cards now route through the
same `buildWeekChart` comparison + one shared label source (`js/analytics/
comparison.js`), so value and label always describe the same periods:
- current week → elapsed-matched → **"vs same point last week"**
- completed/navigated week → full-vs-full → **"vs previous week"**
- non-comparable (no prior week / zero denominator) → **no percentage** (null
  delta, honest label), never NaN/Infinity.
Session-vs-session recaps ("Volume vs last week" = same weekday last week) and the
weekly-review chip (already pace-matched) were verified correct and left as-is.

## Regression found & fixed (Priority 9 in action)
Wiring the detail cards surfaced a **ReferenceError I introduced**:
`renderRunningFitnessDashboard` / `_renderRunningStats` used `appState` without it
in scope — it would have thrown *only when a user opened Running analytics*, which
the Home-only smoke test never renders. Fixed by threading `appState` through, and
closed the coverage gap with `tests/analytics_views_render.test.js` (drives both
views on both tabs; fails on any throw). This is exactly the class of "silent
render death" this pass set out to eliminate.

## Error visibility (Priority 9)
New leaf `js/monitoring/report-error.js`: `reportHandledError` (console.error in
dev/CI + Sentry in prod, never silent) and `renderSafely` (run a render, report +
fall back to a safe value on throw). The overtraining card path now uses both, so
a future render fault degrades to "card hidden" **and is observed** rather than
vanishing. Because the smoke test fails on unexpected `console.error`, a swallowed
throw in that path now breaks CI.

## Realistic profiles (Priority 3) — all asserted in `tests/user_profiles.test.js`
| Profile | Key assertions (exact) |
|---|---|
| A Consistent strength (12wk) | stable bars (11 sets/wk), risk `none`, rec not `warning` |
| B Hybrid | strength 5 sets & running 22 km independent — no cross-count |
| C Rapid load spike | escalation `high`, briefing coach deferred, evidence + clears |
| D Sparse recovery data | evidence `limited`, "Sleep logged 2 of the last 7 nights" |
| E Returning (3-wk gap) | current week not comparable (honest), risk not `high` |
| F Beginner (<2wk) | rec badge `Getting Started`, no trend comparison |
| G Missed program week | only logged sets count; prescribed-unlogged day = no activity |
| H Edits/imports/deletes | edits & deletes reflected immediately; one run/day, no dupes |

## Daily-use transitions (Priority 4)
`buildWeekChart` and `computeDashboardModel` are pure recomputes (no memo layer to
go stale). `tests/weekly_fitness_graph.test.js` now asserts a mounted graph
reflects a data edit, a delete (→ honest "no activity"), and a unit change
(km→mi) on `refresh` — no remount, no stale label, no NaN/Infinity.

## Overtraining flow (Priority 5) — `tests/error_observability.test.js`
Assessed once per render and the SAME object drives suppression + display; does not
fire from one weak signal; missing readiness doesn't create false escalation; fires
on a load spike and CLEARS when it resolves; a thrown render is observable + degrades.

## Performance (2-year synthetic history: 104 weeks, ~1,500 sets, ~350 runs)
- `computeDashboardModel` (full Home aggregation): **~2.1 ms/call**
- `buildWeekChart` (In Focus week switch): **~0.11 ms/call** — bounded to one week
  + its predecessor, no full-history rescan.
Guard test (`tests/perf_home.test.js`) trips only on a ~20× regression. No perf fix
needed.

## Android (Priority 8) — NOT tested here
Gradle is present but the Android Gradle Plugin can't resolve offline and no
Android SDK/emulator is available, so **no Android build, lint, or on-device test
was run**. Manual device checklist below.

### Manual Android device-test checklist `[You]`
- [ ] Home scrolls smoothly; In Focus cards + At-a-Glance render correctly.
- [ ] In Focus: tap each bar → daily summary sheet; switch Strength/Running metric;
      prev/next week; today highlighted; zero-data week reads "no activity".
- [ ] "Why am I seeing this?" expands/collapses; no layout jump; readable at large
      system font (Settings → Display → Font size = largest); light + dark.
- [ ] Overtraining card: appears on a stacked-fatigue state; Acknowledge dismisses;
      does not reappear for the same condition; screen-reader reads title + signals.
- [ ] Detail analytics (Strength/Running): open both tabs; comparison labels read
      "vs same point last week" (current) / "vs previous week" (navigated back).
- [ ] Android back button, background→resume (state restored), pinch-zoom in cockpit.
- [ ] Health Connect missing-data states (no permission / no records) read honestly.
- [ ] GPS route displays; offline use; external links open; keyboard behaviour in inputs.

## Files changed (Part 3)
`js/analytics/comparison.js` (new), `js/analytics/week-chart-model.js` (label
source), `js/analytics/views/view-strength.js`, `js/analytics/views/view-running.js`
(+ `appState` threading fix), `js/monitoring/report-error.js` (new), `js/home.js`
(observable catch + `renderSafely`), `sw.js`. Tests: `comparison` (4),
`user_profiles` (8), `error_observability` (6), `perf_home` (2),
`analytics_views_render` (3), +2 graph refresh. **593 total, all green.**

## Release recommendation
- **Analytics + home-screen experience: Release-candidate ready.** Comparison
  periods are consistent and correctly labelled, profiles verified with exact
  assertions, errors observable, performance bounded.
- **App overall: Closed-beta ready, trending public-beta.** Gated only on the
  pre-existing `[You]` Android on-device checks (GPS, notifications, Health
  Connect, WebView) tracked in `docs/IMPROVEMENT_ROADMAP.md` — not on any analytics defect.
