# Helyx — Android Launch Progress Tracker

**Goal:** Signed Android app in Google Play closed/open beta with real users.
**Monetization:** Free at launch — do NOT build billing/paywall this month.
**Out of scope:** iOS, Capacitor migration, subscriptions.

**Definition of Done**
- [x] No user can read another user's data (RLS enforced + **proven** via adversarial check, 2026-07-02)
- [x] Multi-device use cannot silently destroy history (server `updated_at` migration applied + divergence detection + warn-and-choose UI + local pre-pull backup)
- [x] Crashes are visible to the owner (reporting live — Sentry DSN configured 2026-07-02)
- [ ] Store + legal (health/location) requirements met
- [ ] App live in Play beta with real testers

**Legend:** `[CC]` Claude Code drives · `[You]` human action required.

---

## Day 0 — Prerequisites `[You]`
- [ ] Create Google Play Developer account ($25, approval 1–2 days)
- [ ] Obtain a physical Android phone for testing
- [ ] Confirm Supabase dashboard access
- [x] Decide single brand identity → **Helyx** (Android applicationId `com.helyx.app`)
- [ ] Create Sentry account (for Phase 1 crash reporting)

## Phase 1 — Security + Data Safety  ·  branch: `phase1-security`
- [x] `[CC]` Draft Supabase RLS SQL for `user_data` (own-row read/write only) → `supabase/rls_user_data.sql`
- [x] `[You]` Apply both SQL files in Supabase dashboard — `rls_user_data.sql` + `migration_user_data_updated_at.sql` **both applied** (2026-07-02)
- [x] `[CC]` Adversarial test: prove user A cannot read user B's data — **PASSED** on live DB (2026-07-02, `scripts/rls-adversarial-check.mjs`). RLS isolation proven.
- [x] `[CC]` Secret sweep: no service_role key / private secret in repo or bundle — **clean** (only public anon key; see `supabase/README.md`)
- [x] `[CC]` Fix last-write-wins sync (state.js): server `updated_at`/version + divergence detection → warn-and-choose conflict UI. Needs `migration_user_data_updated_at.sql` applied by `[You]`
- [x] `[CC]` Local safety net: snapshot/backup before every cloud pull (`snapshotLocalBeforeCloudPull` in state.js, tested)
- [x] `[CC]` Integrate Sentry web SDK — DSN-gated (off until configured), PII-scrubbed for health/location data. `js/monitoring/`
- [x] `[You]` Paste Sentry DSN into `js/monitoring/sentry-config.js` to turn crash reporting on — **done** (2026-07-02)
- **Phase 1 done when:** RLS proven, no stale-device clobber possible, backups in place, crashes reported. → ✅ **ALL MET (2026-07-02)**

## Phase 2 — Android Hardening  ·  branch: `phase2-android`
- [x] `[CC]` GPS reliability → **native location foreground service** (decided with `[You]` 2026-07-01). `GpsTrackingService` + `GpsBridge` (Kotlin) buffer fixes by seq; JS drains on wake (`js/gps/native-bridge.js`), recovers a live run after activity death; web watchPosition kept as browser/PWA fallback. **CI-compiled green** (build #109/#110). Then `[You]` device test.
  - NOTE for Play submission (Phase 4): app now uses a `location` foreground service — Play Console requires a foreground-service declaration + video.
- [ ] `[You]` Real-run device test of GPS
- [~] `[CC]`+`[You]` Brand unification: name ✓ (all user-facing = Helyx), package ✓ (`com.hybridapp`→`com.helyx.app`, CI-verified), export filenames ✓. Remaining `[You]`: icons / splash / feature-graphic art.
- [~] `[CC]` WebView hardening: back-button/nav ✓ (already robust), offline behavior ✓ (reconnect re-sync, `shouldResyncOnReconnect`), resume/state-restore ✓ via boot pull + GPS run recovery. Nothing outstanding here for now.
- [x] `[CC]` Notification flow: permission + native delivery (`NotifyBridge`; reminders route through the OS since WebView lacks the Web Notifications API) **and background daily reminder** via native AlarmManager (`ReminderScheduler` + boot re-arm) — fires when the app is closed. Health Connect permission path reviewed — already complete (request + `VIEW_PERMISSION_USAGE` rationale alias). Note: background reminder is a generic nudge; program-aware suppression is in-app only.
- [ ] `[You]` Device-test notifications + Health Connect
- **Phase 2 done when:** app behaves correctly on a real device across GPS, notifications, resume, offline.

## Phase 3 — Compliance + Store Assets + Tests  ·  branch: `phase3-launch-prep`
- [x] `[CC]` Draft Privacy Policy + Terms (health & location = GDPR special category) → `docs/legal/`
- [ ] `[You]` Get policy reviewed + hosted (public URL); fill the `{{PLACEHOLDERS}}`
- [~] `[You]` Complete Play Data Safety form — exact answers mapped in `docs/legal/play-data-safety.md`
- [x] `[CC]` Draft store listing copy / description / categorization → `docs/store-listing.md`
- [ ] `[You]` Produce screenshots + feature graphic (art)
- [x] `[CC]` Integration/UI tests on workout.js (log-a-workout, `tests/workout_logging.test.js`); sync path covered by sync-guard/cloud-backup/reconnect tests; app.js bootstrap covered by smoke
- [x] `[CC]` **Bonus:** in-app account & data deletion (Play/GDPR) — `deleteAccount` + `supabase/functions/delete-account` (`[You]` deploy for full auth-record removal)
- **Phase 3 done when:** policy live, data-safety accurate, listing assets ready, core flows tested.

## Phase 4 — Beta, Triage, Submit  ·  branch: `phase4-release`
- [ ] `[CC]` Signed release build via existing CI signing config
- [ ] `[You]` Push to Play internal testing → closed beta; invite testers
- [ ] `[CC]` Triage Sentry crashes; fix top issues
- [ ] `[You]` Final QA, versioning, submit to Play
- [ ] Buffer for review feedback
- **Phase 4 done when:** app is live in Play beta with real testers.

---

## Biggest Risks (budget time)
1. Sync fix — a rushed merge that loses data is worse than today. Careful + tested.
2. Background GPS — real native work; if tight, ship foreground-only and say so.

---

## Session Log
_Newest first. One entry per session: date · what changed · what's next._

- 2026-07-14 · **Beta Integrity PR-3 — transactional, validated, retryable migrations.**
  Replaced the catch-and-continue migration runner (which could stamp failed data as
  current) with isolated one-step transactions: clone the last-good JSON state, run
  one upgrade, stamp its candidate version, validate that version's invariants, then
  atomically commit. Thrown steps, failed validation, missing steps and future schemas
  now stop without advancing the source blob. Startup blocks before save-capable wiring
  and shows an accessible “Your data is safe” retry screen while localStorage remains
  untouched. Cloud-snapshot recovery and both JSON import paths migrate before replacing
  current data and report an honest safe-stop on failure. Hardened v3 activation repair
  and v4 partial/duplicate run-session adoption so their validators can prove complete,
  stable identities. Added fault injection at every v0→v4 boundary, byte-for-byte
  rollback + retry, old-version corpus/idempotence, future-version, recovery UI/snapshot,
  and partial-session regressions. Validation: **795/795 tests**, typecheck, precache and
  smoke green. · **Next:** PR-4 / R4 complete Android export portability, including
  native file handling and archived-week CSV completeness.

- 2026-07-14 · **Beta Integrity PR-2 — stable run/session and route identity.**
  Added a backward-compatible canonical run history (`runSessions[day]`) with one
  stable `sessionId` per manual, GPS or FIT activity; the legacy `runs[day]` shape
  remains the latest editable cockpit projection. State v4 adopts legacy runs with
  deterministic IDs. GPS now keeps its original start timestamp and program/date
  destination across Android activity recovery, saves factual sessions immediately,
  and links each route by exact session. IndexedDB reads/deletes are sibling-safe;
  JSON export v3 preserves multiple same-day rich route records while v2/raw-state
  imports remain supported. Migrated load/running/calendar/Profile/Home/Brain readers
  so day totals aggregate every activity while pace, RPE, VDOT and session counts use
  each exact run. Exact just-finished recaps no longer show an accidental combined-day
  result; CSV no longer collapses multiple runs in an exported day (archived-week
  completeness remains R4). Added reload, migration, analytics, recap,
  route-isolation and v2/v3 portability regressions. Validation: 787/787 tests,
  typecheck, precache and smoke green. · **Next:** PR-3 / R3 transactional,
  validated and retryable migrations; never stamp a failed step current.

- 2026-07-14 · **Beta Integrity PR-1 — canonical local calendar dates.**
  Added the single `js/dates.js` local-day API and migrated user-facing date writers
  and readers across streaks, score/history, coach memory/evidence, recovery/wellness,
  monthly/weekly reporting, Home, onboarding and Settings. Intentional date-only keys
  now remain stable in every timezone; invalid values fail closed; whole-day arithmetic
  is DST-safe. Added fixed-clock boundary coverage plus a source guard that limits raw
  UTC day slicing to reviewed schedule/calendar arithmetic. Made the previously flaky
  streak, coach-memory, monthly-report and Hybrid Score fixtures deterministic. Browser
  verification saved a 76.5 kg entry on 14 July without replacing the prior 75 kg entry
  (the Body Weight view showed the expected 75.8 kg 7-day average). Validation: Sydney
  `npm run verify` green; 771/771 tests green in UTC, UTC+14 and UTC−12; typecheck,
  precache and smoke green. · **Next:** PR-2 / R2 stable session and run identity;
  preserve multiple same-day runs and their routes through reload/export/import.

- 2026-07-14 · **Evidence-based full product/UX/architecture audit (documentation only).**
  Reviewed the current PWA and Android shell across onboarding, Home, Programs, workout,
  running/FIT, analytics/Brain, state/sync/migrations, export, offline caching, Health
  Connect, security, accessibility, performance and release workflows; exercised a fresh
  390×844 browser journey plus a 1280px layout check. Created the five requested audit
  artifacts: `docs/COMPREHENSIVE_PRODUCT_AUDIT.md`, `docs/UI_UX_AUDIT.md`,
  `docs/TECHNICAL_ARCHITECTURE_AUDIT.md`, `docs/IMPROVEMENT_ROADMAP.md`, and
  `docs/AUDIT_EVIDENCE_INDEX.md`. No production code changed. Baseline validation is not
  green: 760/764 Node tests pass. Three `streak_freeze` cases fail because local midnight
  is converted through UTC in the Sydney timezone; a fourth `coach_memory` fixture is
  calendar-position dependent and split its intended two-days-per-week data across ISO
  weeks. Typecheck, precache, smoke,
  analytics verification/perf, and web staging pass. The audit also ranks same-day
  run/route overwrite, non-transactional migrations, Android export integration, and
  ungated release workflows as beta blockers. · **Next:** owner reviews/approves the
  proposed Beta Integrity PR; do not implement before approval. No commit while the
  required suite is red.

- 2026-07-13 · **Program-switch session isolation (activation identity)** (branch
  `claude/workout-session-isolation-l02i8o`). Fixed the *real* cross-program leak the
  earlier `lift_*` repair only partially masked: after switching programs, the previous
  program's COMPLETED exercises (Deadlift, Pull-Ups, Face Pull, …) were still appended
  under the new prescription with DONE styling. **Root cause:** logged training is keyed
  only by program-week number + weekday (`weeks[N].lifts[day]`), with no program-run
  identity — so Program A "Week 1/Mon" and Program B "Week 1/Mon" share ONE physical
  slot. `reseedActiveProgramIntoWeek` deliberately *retained* that slot's logged lifts
  and `orderedLiftNames` renders **every** key in `lifts[day]`, so B inherited A's DONE
  rows (and a same-slot reuse would also overwrite A's stamped date — silent history
  corruption). **Fix:** new `js/state/activation-identity.js` gives every program run a
  stable `activationId`; each week is stamped with its owner. A switch/restart now
  `beginActivation()` + `archiveForeignWeeks()` — the previous run's weeks move to
  namespaced `arch:<oldId>:<n>` keys in the same `weeks` map (still counted by every
  date-/all-time analytics + PR reader, which iterate all entries and attribute by date;
  invisible to numeric week-nav `1..totalWeeks` and program-week-indexed series), then
  the new run seeds its start week clean. `applyProgramSwitch` (app.js) and onboarding
  route through the new `startProgramActivation`. v2→v3 migration adopts existing users'
  weeks into one legacy activation in place (no archival, no leak; idempotent + observable).
  Restart = a new run (no inherited completions); shared exercises begin fresh but prior
  performance stays retrievable by date. **Tests:** `tests/program_isolation.test.js` (14:
  screenshot fixture — active model is B-only + A archived & still in analytics; A-wk3→B-wk1;
  restart; shared-lift; adherence-zero; no shared refs; frozen defs; reload; pure helpers;
  v3 migration). All **742** green; typecheck + precache + smoke clean. Known benign nuance:
  the "recent pace" tile (walks numeric weeks desc) won't include a prior program's runs —
  data preserved everywhere date-based. Next: optional explicit resume/abandon modal for an
  in-progress workout at switch time (today the activation confirm sheet warns).

- 2026-07-13 · **Calendar-correct per-lift estimated-1RM (last program-week/calendar
  inconsistency closed).** The Strength overview's "+X kg this week" est-1RM change, the
  "PRs This Week" count and the Lift-PR list's "this week / vs last week / PR" figures were
  still bucketed by PROGRAM week (`dynamicStats.currentEstimatedMax − previousWeekMax`,
  `isWeeklyPR`) — stale when the calendar advances but the program week doesn't. New
  program-week-free module `js/analytics/strength-calendar.js`: canonical `estimatedE1rm`
  (Epley, coerces/never-NaN), `liftE1rmByCalendarWeek`, `bestE1rmByLiftForWeek`,
  `calendarStrengthSummary` (same-exercise "top change" + calendar PRs + honest empty
  states), `calendarWeekE1rmSeriesForLift` (trailing calendar spark). All bucket by real
  stamped date via `weekly-aggregate.js` (dedup, warm-ups/incompletes/zero-load excluded,
  undated excluded). Exercise identity = the lift's bare-string name key (no alias layer) —
  a rename is a new identity, never cross-compared. `view-strength.js` overview rewired:
  hero = all-time top lift + calendar PR chip, a calendar "e1RM Change" card (names the
  exercise, honest empty/no-prior states), and the Stats-tab Lift-PR list now calendar
  same-exercise. Removed the program-week `_liftE1rmSeries`/`isWeeklyPR` usage; re-exported
  the calendar helpers through metrics-strength for one import point. Hybrid Score strength
  pillar left program-week (plan progression, by design). Static guard extended to cover
  strength-calendar.js. New `tests/strength_calendar_e1rm.test.js` (25) covers span/rollover/
  two-programs/rename/variant/warm-up/bodyweight/decimals/high-rep/dedup/undated/edit-moves/
  PR/no-cross-exercise/NaN. 728 tests / typecheck / smoke / precache green. Real-browser
  check extended: empty week → "No strength work logged this week" (no stale +X, no false
  PR); Scenario 2 → "Bench Press vs previous week +kg". · Analytics time model is now
  internally consistent end-to-end. Next: real-device + beta feedback (per owner).

- 2026-07-13 · **Complete the program-week ↔ calendar-week separation.** Follow-up to the
  attribution fix: audited every week-based reference (`docs/TIME-MODEL-AUDIT.md`) and
  converted the remaining CALENDAR surfaces off the program-week counter. The strength/
  running **detail week navigator** (`js/analytics/week-nav.js`) is now calendar-based —
  a dedicated ephemeral `calendarWeekOffset` (0 = current calendar week, reset on view
  entry so "This week" always resolves from today), real Mon–Sun labels (never derived
  from activity min/max), back-nav only while older logged weeks exist, no future nav, and
  it never mutates `state.currentWeek`. `curWeekIdx`/`getSelectedWeek` (program-week nav)
  removed; `view-strength.js`/`view-running.js` pass `getCalendarWeekOffset()` straight into
  `buildWeekChart`; the "This week's sessions" strip now reads the current calendar week via
  `collectCalendarWeek` (keeping each chip's source program week for the session modal).
  `explainWeeklyMetric` extended: program week surfaced as metadata, per-session
  contribution, duplicate-suppression + undated counts, and a note that the DATE decides
  attribution. Left intentionally unchanged: program adherence / "Week N" / deload / today's
  session (program-week), and CTL/ATL/readiness (rolling EWMA) — with tests pinning each
  basis. New static guard `tests/analytics_calendar_guard.test.js` keeps the calendar-core
  modules program-week-free; new `tests/time_model_separation.test.js` (10) +
  `tests/week_nav_calendar.test.js` (5) prove the two clocks are independent (program week
  spanning two calendar weeks, two program weeks in one calendar week, old+new program in
  one week, rollover independence, adherence stays program, rolling stays rolling). 702
  tests / typecheck / smoke / precache green. Real-browser check now also verifies the
  strength-detail navigator ("This week" → "Previous week · Jul 6 – Jul 12") and that the
  Home program indicator still reads "Week 3". · Known limitation: `dynamicStats` per-lift
  e1RM "this week" delta remains program-week-bucketed (secondary figure; documented). ·
  Next: `[You]` device-test the detail week nav after a real rollover; optional future work —
  calendar-bucket the per-lift e1RM "this week" delta.

- 2026-07-13 · **Fix weekly analytics attribution (stale program week read as "this
  week").** Root cause: `state.currentWeek` is a PROGRAM-week counter that only advances
  on an explicit step / confirmed auto-advance, but Home read `weeks[currentWeek]` as the
  current calendar week — so once the calendar rolled into a new week while the program
  week stayed frozen, a PRIOR week's training (Mon/Tue/Thu/Fri, ~55 sets / ~11.6 t) showed
  as "this week", and the label was derived from the data's date range ("11–13 Jul")
  rather than the real calendar week. New canonical `js/analytics/weekly-aggregate.js`
  buckets every logged day by its real stamped `.dates[day]` into Monday-based CALENDAR
  weeks (`localDayKey` — date-only stays local, timestamps → local day, junk → null never
  "today"; `weekStartOf`; `collectCalendarWeek`; `buildCalendarWeekStrength`; dedup so a
  cloud/local duplicate can't double-count; `explainWeeklyMetric` dev trace). `buildWeekChart`
  (In Focus + strength detail) is now calendar-based; the At-a-Glance Weekly Volume tile
  reads a new `model.calendarWeek`. Result: an empty current week is a true zero, last
  week's work stays in last week / the comparison, and the label is the real Mon–Sun range.
  New `tests/weekly_aggregate.test.js` (17) reproduces the exact scenario + all boundary/
  parsing/dedup/undated cases; existing chart/graph/consistency/profile fixtures re-anchored
  to calendar-consistent dates. 683 tests / typecheck / smoke green; precache regenerated
  (weekly-aggregate.js added). Real-browser check (`scripts/home-attribution-check.mjs`)
  confirms "this week" = 0 sets / "13–19 Jul · This week", prev-week nav = 55 sets / "6–12
  Jul". · Next: consider making the strength/running detail's older-week navigation fully
  calendar-based too (offset 0 is already correct); `[You]` device-test the Home graph after
  a real week rollover.

- 2026-07-12 · **Program progression understanding: week-at-a-glance + phased
  overview on the detail page** (branch `claude/workout-exercise-leak-fix-7uk3h1`).
  The remaining gap was that users couldn't see what a week looks like or how the
  block changes without opening every day. New pure `js/programs/schedule.js`:
  `buildWeekSchedule()` (each defined day → truthful one-line summary: "N exercises
  · M working sets" from `liftTarget` for THAT week's modifier — so a deload shows
  fewer sets — or the actual run string; rest is intentional), `summarizeProgression()`
  (groups the week timeline into the program's own named phases with an honest
  headline; falls back to "same schedule, load-driven" when there's no variation),
  `diffWeekPrescription()` (real set/rep/deload deltas between weeks; never compares
  ids/order; suppresses set numbers for lift-less run blocks). Wired into
  `detail.js` **above** the description: a "This week at a glance" section with a
  compact week stepper (‹ Week X of Y ›, "You are here" / "Back to current" for the
  active program, per-day Done/Today status) whose rows open the existing
  day-preview sheet at that week, a "Changes from Week 1" line, and a "How this
  program progresses" phased timeline. **Previewing a week never mutates
  `currentWeek`/progress** (module-local `_scheduleWeek`; verified). Also fixed the
  reported **CTA-row clipping**: `.detail-cta-wrap` now stacks vertically (Customize/
  Compare no longer clip at ≤360px), all action buttons ≥44px, and the stats row +
  rating control made large-font-safe (`min-width:0` / `min-height:44px`). Real data
  only — no invented RPE/rest/phases; running distance progression surfaces through
  the program's own week labels (e.g. "Long run: 12km · Weekly ~30km"). Tests:
  `tests/program_schedule.test.js` (17) + standalone
  `scripts/program-detail-viewport-check.mjs` (real-browser geometry, self-skips,
  not in `npm test`). 666 green; typecheck + smoke + precache clean. Known
  limitation: the shared small program-card in the "Similar programs" scroll row has
  a pre-existing ~17px document overflow at 1.5× font (rem-based card width) —
  out of scope (fenced: no card redesign) and not a regression from this work.

- 2026-07-12 · **Safe program activation (no more silent one-tap program swap)**
  (branch `claude/workout-exercise-leak-fix-7uk3h1`). Browsed the program
  experience as a real user in headless Chromium (seeded past onboarding). Finding:
  the library, cards and detail page are already mature and polished (active
  "NOW TRAINING" banner + ring + next workout, Discover/Saved/Completed tabs,
  filters, collections, search, recommendations, compatibility "Ready" chip,
  Overview|Structure|Plan) — so the one genuinely **spec-violating, unsafe**
  behaviour was the highest-value target: `triggerMakeActiveProgram` →
  `applyProgramSwitch` **silently replaced** the active program from a one-tap
  "Start This Program" CTA, with no confirmation, no current-program impact, no
  active-workout guard, and it kept the previous program's `currentWeek` (so a
  fresh program could start mid-block). Fix: new pure `js/programs/activation.js`
  — `buildActivationPlan()` computes an honest, natural-language plan (summary
  from real metadata only — never "undefined"/0; replace/restart/first modes;
  history-is-kept reassurance; in-progress-workout warning; Week-1-default +
  "Keep Week N" start-week choices; no raw ids) and `confirmActivation()` renders
  a self-contained, safe-area-aware, dvh-capped confirmation dialog;
  `activateProgramWithConfirm()` gates the switch. `applyProgramSwitch(id,
  startWeek)` now takes a start week and resets `currentWeek` so an activated
  program begins where the user chose (Week 1 by default). All existing
  functionality preserved; the bottom-sheet fixes untouched. Verified in-browser:
  the sheet renders "Switch to Helyx Foundations? · 12-week hybrid block · 5
  days/week · Intermediate", warns it replaces the current program, reassures
  history is kept, offers Start-at-Week-1 / Keep-Week-3 / Cancel; at 320px it
  fits with no overflow; confirming switches + resets to the chosen week; Cancel
  changes nothing. Tests: `tests/program_activation.test.js` (13). 649 green;
  typecheck + smoke + precache clean. Next (not done this session, ranked for a
  follow-up): detail CTA secondary row (Customize/Compare) can clip on the right
  at ≤360px; a week-at-a-glance schedule summary on the detail page; a concise
  progression summary. See USER_EXPERIENCE_AUDIT.md.

- 2026-07-12 · **Fix program-day preview bottom-sheet: scroll/position + reps
  clipping** (branch `claude/workout-exercise-leak-fix-7uk3h1`). Reproduced both
  reported issues in headless Chromium (playwright-core + the pre-installed
  browser) at 320/360/390/412 px. Proven findings: the day-preview sheet
  (`#wpmSheet`) had **no background scroll-lock** (page scrolled behind it), **no
  focus management**, **no Escape/Android-back dismissal**, **no inner-scroll
  reset** (header could open scrolled away), the whole sheet was one scroll
  container so a tall day scrolled the **header off-screen**, and `max-height:80vh`
  ignored the Android visual viewport. The grid carried a latent trap: a base
  `grid-template-columns: 1fr 44px 56px 44px 72px` (5 desktop columns vs 3 rendered
  spans) patched by a divergent `--compact` override — fixed-px, non-scaling.
  Fixes — JS (`js/programs/detail.js`): open locks body scroll via
  `position:fixed` + `top:-scrollY` (restored exactly on close), resets inner
  scroll on a fresh open but preserves it on a same-day week-step, moves focus into
  the sheet + returns it to the day button, pushes one history entry and closes on
  Escape/popstate. CSS: `.bottom-sheet` now `max-height:80dvh` (vh fallback) +
  `body.sheet-scroll-locked`; `#wpmSheet` is a flex column with a **pinned header**
  and an independently scrolling `.wpm-body` (safe-area bottom padding); the grid is
  one responsive rem-based 3-col definition (`minmax(0,1fr) minmax(2.75rem,auto)
  minmax(3.5rem,auto)`, name wraps via `min-width:0`+`overflow-wrap`), with a
  stacked labelled fallback ≤340px for tiny screens/large fonts. Verified after:
  no horizontal/reps overflow at any width incl. 1.5× font, header stays visible
  while body scrolls, close restores scroll to the px. Tests:
  `tests/day_preview_sheet.test.js` (11, headless lifecycle) + standalone
  `scripts/preview-viewport-check.mjs` (real-browser geometry, self-skips without
  a browser; not in `npm test`). 636 green; typecheck + smoke + precache clean.
  Next: nothing outstanding on this defect.

- 2026-07-12 · **Fix phantom `lift_*` workout rows (identity-key leak)** (branch
  `claude/workout-exercise-leak-fix-7uk3h1`). Root-caused the "new day shows lots
  of completed exercises named `lift_76dsje3t`" report. The removed "lift identity"
  subsystem (commit `e2e624f`) once keyed a day's logged sets by generated ids
  (`'lift_'+Math.random().toString(36).slice(2,10)`) resolved to a display name via
  `liftNames`/`liftIdMap`. Deleting it **left the id-keyed set arrays in place** and
  stopped resolving them, so the render path (`_buildExerciseCardEl`,
  `displayLiftName = liftName`) surfaced the raw id **as the exercise name**, and
  `reseedActiveProgramIntoWeek` retained the logged entries beside fresh
  name-keyed prescriptions — the "leaked into the workout" symptom. Not date
  rollover / shared refs — a migration gap. Fix: **v1→v2 repair migration**
  (`js/state/migrations.js`) renames each `lift_*` key back to its real name
  (recovered from the still-persisted maps), merges with any name-keyed entry
  without losing logged history, falls back to an honest `Unknown exercise` (never
  the raw id, never a silent delete) when unresolvable, re-points
  `liftOrder`/`liftMeta`, drops derived id-keyed `exerciseStats`; idempotent +
  observable (one scrubbed summary, no ids/set data). New leaf `js/state/lift-id.js`
  (`isInternalLiftId`) also guards the render path against un-migrated cloud-blob
  keys. Runs on local + cloud + import hydration (migrate is the single chokepoint).
  Tests: `tests/lift_id_repair.test.js` (16) + a render-guard case in
  `tests/workout_logging.test.js`. All 625 green; typecheck + smoke pass; precache
  regenerated. Next: nothing outstanding on this defect.

- 2026-07-12 · **Analytics release verification — Part 4 (comparison periods,
  load-progression, error visibility)** (branch
  `claude/analytics-release-verification-t1qjxo`). Traced every comparison
  label/value across strength/running detail, In Focus, dashboard, Brain and
  weekly copy. Found + fixed a latent defect: **`loadProgressionPct` was dead for
  every mid-program athlete** — it read the last slot of a series padded to the
  program's total weeks (0 vs 0 → null), so the Fatigue-Trend line and the
  load-progression insights never fired until the final weeks (same dead-slot trap
  ATL/CTL already had). Now anchored at the current program week and computed over
  the two most recent **completed** weeks — full-vs-full, labelled "vs the previous
  week" (no partial-vs-full mislabel, no NaN/Infinity). Reclassified the
  week-over-week load-rise insight from red **alert → info** (the ACWR zone insight
  + Home escalation own the red "load" voice — detail insights are supporting
  context, Pri 2). In Focus: future days of the current week now read **"upcoming"**
  (not "no activity") in bar/summary a11y labels, with a dashed-baseline + dimmed
  x-label so an empty upcoming day can't be mistaken for a missed session (Pri 7).
  Routed the last three silent `catch`es (coach-Q&A risk, deload card, briefing
  evidence) through `reportHandledError` — graceful degrade AND observable (Pri
  5/9). +15 tests (comparison periods current-vs-completed + all non-comparable
  denominators, loadProgressionPct completed-week behaviour, insight severity, an
  add/edit/delete transition moving Home+In Focus+detail in lockstep, an observable
  briefing-evidence failure, the upcoming-day distinction). **608 tests /
  typecheck / smoke / precache green.** Perf on a 2-year (104-week) history: home
  aggregation ~2.2 ms, In Focus switch ~0.08 ms — no problems. **Android: NOT
  buildable here** (no SDK; AGP 8.9.1 unresolvable; no adb/emulator) — CSS/JS ship
  to the WebView via `copyWebAssets` automatically; manual device checklist stands.
  Verdict: **closed-beta ready** (public-beta gated on a real device pass). ·
  Next / `[You]`: run the device checklist (In Focus taps, evidence disclosure,
  overtraining ack, back button, large font, offline) on an Android build.

- 2026-07-11 · **Analytics release verification — labels, profiles, safety**
  (same branch; Part 3 in `docs/ANALYTICS_VERIFICATION_2026-07.md`). Fixed the last
  comparison mislabel: the strength/running **detail** "Weekly Volume/Distance vs
  last week" cards showed a partial current week against a full previous week —
  now routed through the shared `buildWeekChart` comparison + one label source
  (`js/analytics/comparison.js`): "vs same point last week" (current) / "vs
  previous week" (completed), zero-safe. Caught & fixed a **ReferenceError I
  introduced** (`appState` out of scope in the Running dashboard) that would throw
  only on opening Running analytics — the Home-only smoke never renders it; closed
  that gap with `tests/analytics_views_render.test.js` (drives both views/tabs,
  fails on any throw). Added observable error handling (`js/monitoring/
  report-error.js` — `reportHandledError` + `renderSafely`) so a caught render
  fault degrades AND is logged/Sentry-reported, never silent (the overtraining-card
  failure mode). Verified 8 realistic profiles (A–H) with exact assertions;
  transitions (edit/delete/unit-change refresh, no stale cache); escalation gating
  + clearing; perf on a 2-year history (Home aggregation ~2 ms, In Focus switch
  ~0.1 ms). +25 tests (593 total) / typecheck / precache / smoke green. Android
  build NOT runnable here (no SDK) → manual device checklist in the doc. Verdict:
  analytics/home = **release-candidate ready**; app = closed→public-beta gated only
  on `[You]` Android device tests. · Next: `[You]` run the Android checklist.

- 2026-07-11 · **Analytics → action: insight trust, evidence & de-dup**
  (same branch; Part 2 in `docs/ANALYTICS_VERIFICATION_2026-07.md`). Reviewed the
  path logged-data → weekly analytics → Hybrid Score → insight → action. **Fixed a
  real regression:** the overtraining escalation card referenced an out-of-scope
  `DEFAULT_DAYS`, whose swallowed ReferenceError meant the safety card *never
  rendered* — now assessed once in `renderHome` and passed in. **De-duplicated red
  cards:** the briefing coach line now defers to the escalation card when it's on
  screen (one voice, not two). **Made recommendations explain themselves:** new pure
  `js/brain/coach-evidence.js` powers a collapsible "Why am I seeing this?" under the
  coach line — concrete facts from the SAME verified aggregates as In Focus (working
  sets this week vs same point last week, running distance, readiness, plain-language
  load direction), a "what clears it" line, and honest data-completeness ("Sleep
  logged 2 of 7 nights — limited data"). **In Focus:** bar tap now leads with a
  compact daily summary ("5 working sets across 2 exercises · 2,900 kg" / "6.4 km in
  34:10"). +15 tests (568 total) incl. home/detail/Brain consistency asserts;
  typecheck / precache / smoke green; rendered HTML verified. · Next: `[You]`
  device-test the disclosure + escalation card; optional re-tier of per-view
  analytics insight severities.

- 2026-07-11 · **Analytics verification + In Focus weekly graph**
  (branch `claude/helyx-analytics-verification-lpc8ma`; full log in
  `docs/ANALYTICS_VERIFICATION_2026-07.md`). Traced stored-data→display for every
  major analytics value. Built a single shared, tested model
  (`js/analytics/week-chart-model.js`) as the source of truth for the home In
  Focus graph, and rewrote `js/home/weekly-fitness-graph.js` to consume it (no
  more UI-side calculation). **Fixed:** the graph fabricated strength "Time"
  (`sets×180s`) / "Calories" — removed; strength now shows honest **Working Sets**
  (default), **Volume**, and real FIT **Time**. Added an honest, labelled
  week-to-week comparison — *live* "vs same point last week" (elapsed-matched) for
  the current week, *completed* "vs previous week" for past weeks — with zero-safe
  percentages (never `Infinity`/`NaN`). Un-hid the In Focus section on Home; per-bar
  accessible labels, today highlight, unit-aware, light/dark verified in Chromium.
  26 new tests (553 total) / typecheck / precache / smoke all green; math proven
  against hand-calculated fixtures via `scripts/analytics-verify.mjs`. · Next:
  `[You]` device-test the graph (touch targets, safe areas); optional follow-up to
  align the strength detail view's "vs last week" label with the honest elapsed
  comparison.

- 2026-07-10 · **Security & hardening audit — 11-point implementation pass**
  (branch `claude/helyx-security-audit-diww1o`; full log in
  `docs/SECURITY_AUDIT_2026-07.md`). Eight tested commits:
  (1) **WebView/SW/repro** — strict CSP (`script-src 'self' https://cdn.jsdelivr.net`,
  `object-src none`, scoped `connect-src`), Leaflet bundled (`js/vendor/leaflet`),
  Supabase exact-pinned + **SRI**, Sentry pinned; Kotlin `BridgeSafe.callbackId`
  sanitiser + WebView debug gated to debug builds; SW precache **generated from
  the real import graph** (`scripts/module-graph.mjs`/`gen-precache.mjs`, +14
  reachable-but-uncached modules), atomic install + validated activate;
  `package-lock` committed. (2) **Truthful deletion** — `performAccountDeletion`
  reports `ok:true` only when the auth identity is confirmed gone, wipes route
  IndexedDB, stays signed-in for retry on partial failure. (3) **Route
  portability** — versioned export envelope carries GPS routes (validated,
  size-capped), backward-compatible import; fixed the dead-`hybridAppState`-key
  import/reset no-op bug. (4) **Persistence** — debounced localStorage writes on
  workout keystrokes (critical events still immediate; flush on pagehide).
  (5) **Health language** — removed "prevents injury"; in-feature not-medical
  notices. (6) **Attribution** — removed false "Verified creator" on named
  coaches; centralised neutral wording. (7) **CI/packaging** — production
  asset **allowlist** stager (no more docs/SQL/audits in the APK), fixed
  false-green tests (`window.scrollTo`), smoke fails on console errors, Android
  CI (lint/test/build), version aligned on `APP_VERSION`. (8) **a11y** — button/
  input names, dialog semantics, focus restore, WebView pinch-zoom enabled.
  Tests **468 → 512** (all green); typecheck + precache + smoke green. New
  tests: precache_manifest, bridge_input, route_portability, persistence_debounce,
  attribution, web_root_allowlist, accessibility, +8 deletion scenarios; Android
  `BridgeSafeTest`. · **`[You]`:** deploy the `delete-account` edge fn for full
  auth-record removal; run `gradle wrapper` once to restore the wrapper jar;
  device-test GPS/Health/notifications/zoom under the new CSP; real-browser E2E +
  offline-PWA test still to author.

- 2026-07-10 · **New home-gym program · analytics week-nav fix · run-logging integrity**
  (branch `claude/home-gym-strength-size-j4oaw3`). Three shipped, each tested + committed.
  (1) **5-Day Home Gym Strength + Size Rebuild** added to the hypertrophy catalog — a
  powerbuilding split (barbell/rack/DBs/bands, 10 weeks) whose per-lift sets×reps are carried
  as inline `(4×5-8)` specs in each day's `desc`, so `liftTarget` resolves the exact
  prescription the cockpit, Structure sample and day-preview all render (all 32 lifts verified
  to resolve, none falling back). (2) **Strength/Running insights week navigator** now actually
  drives the stat cards: `curWeekIdx` reads `getSelectedWeek()` (with no offset it still equals
  the current week, so Home agreement holds) — Weekly Volume/distance were previously pinned to
  the current week no matter which week you scrolled to. Also called the imported-but-unused
  `resetWeekNav()` on context change so a stale offset can't leak between screens. (3) **Run
  logging → calendar date** (the last integrity code item): the Log-Run modal's weekday picker
  became a real date input; runs route to the correct week+day via a tested `resolveDateToSlot`
  and are stamped with their true date, not "today" — see PRODUCT_PROGRESS deferred-follow-ups.
  Run-entry RPE representation converged on the cockpit's numeric control. Tests 465 → 468;
  typecheck + smoke green; run-logger + week-nav both exercised end-to-end in a headless mock.
  · **Next:** `[You]` device-test the new program + run logger; remaining product follow-ups
  are onboarding-step-3 density and dense-tile truncation (both "measure before changing").

- 2026-07-04 · **Fresh launch audit + program-experience overhaul + two-way coach**
  (branch `claude/helyx-launch-audit-qn9cg0`; plan in `docs/LAUNCH-AUDIT-PLAN.md`).
  A ground-up launch-readiness audit found the app's core value — training programs
  — was sold as a "mystery box": every program already carried a full week-by-week
  progression in `weeklyVolModifiers` (48/55) that the UI never rendered. Shipped
  **13 tested, headlessly-verified slices**, each its own commit:
  **B1** Customize (fork any program → editable copy; `duplicateCustomProgram`
  returns id, re-authors to "You"); **B2** per-week progression editor in the
  builder (`js/programs/progression.js`); **B3** in-session exercise swap,
  equipment-filtered, preserves target+logged sets (`js/workout/substitutions.js`,
  `applyExerciseSwap`); **B4** compare two programs (`js/programs/compare.js`);
  **A1** the week-by-week **Plan timeline** tab — the headline fix
  (`js/programs/timeline.js`); **A2** commitment strip (time cost · volume ·
  equipment ✓/✗); **A3** week-accurate day preview with a week stepper; **A4**
  carousel reduced-motion + pause, `N×/wk` on cards; **C1** level-/equipment-aware
  onboarding starter program (`js/onboarding/starter-programs.js`); **C2**
  ask-the-coach deterministic Q&A on the briefing (`js/brain/coach-qa.js`); **C3**
  deloads explained in the briefing; **C4** plate math on the coach target
  (`js/workout/plates.js`) + swipe-between-days (C4a rest auto-start already
  present); **C6b** shareable PR card (`js/brain/pr-share.js`). 9 new pure,
  tested modules; zero changes to the 150+ `.lifts` string-consumers (no risky
  migrations). Tests **383 → 437**, all green; typecheck + smoke clean throughout.
  Deferred with rationale: C5/C6a already present in the leaves (heroes/charts/
  so-what/empty states); **C7 type-scale refactor** deliberately deferred
  (high-risk/low-value pre-beta). · **Next:** optional Phase D (workout.js/app.js
  god-module teardown, only where it de-risks further work); otherwise open a PR
  and fold these into the Play-beta build. `[You]`: device-test the swap, plate
  hint, swipe, coach chips, PR share and onboarding pick before the beta.

- 2026-07-03 · **PRODUCT_V2 execution plan** — `PROGRESS_V2.md` created: PRODUCT_V2.md's
  quarter roadmap turned into file-level, session-sized slices (V2-0 guardrails →
  V2-1 Subtract → V2-2 tellable score → V2-3 morning hook → V2-4 coach voice → V2-5
  share card), grounded in a codebase survey (fasting = 3,153 JS lines; 23 analytics
  leaves; 19 tiles; 49 settings rows). Sequencing decision recorded: V2-1 subtraction
  ships before beta screenshots/tester invites; PROGRESS.md `[You]` device tests run
  in parallel. Docs only — no product code changed. · Next: `[You]` confirm fasting
  delete-not-archive (V2-0), then `[CC]` deletion manifest + V2-1 S1.

- 2026-07-03 · **Hybrid Score E5 — workout-quality / true adherence (last P1 closed).** "Showing up" no longer equals "doing the work." Two parts. (1) **Logging change** (workout.js): each set now records its *prescribed* target — `tw`/`tr` read from the coach's ghost-placeholder — distinctly from the actual `w`/`r`, in both write paths (`executeOneTapQuickLog`, `updateInputState` via a new `_numericPlaceholder` helper). Purely additive: never overwrites an existing target, skips the non-numeric default "kg"/"reps" ghosts, no behaviour or UI change (verified: smoke + full home render still clean). This was the blocker I flagged — the schema previously stored only the actual, and quick-log set it *to* the target, so true adherence was unmeasurable. (2) **Metric + fold-in**: pure `workoutQuality(state, days, maxWeek)` (metrics-strength) scores each completed working set's actual load-volume against its prescription (on/over target → full, capped at 100; junk far below → low; targetless/legacy/incomplete sets ignored so absence is never punished); the model exposes `week.qualityPct/qualityN`; `consistencyPillar` folds it in as a gentle ≤20% factor with "hitting your targets" / "sets logged below target" signals. Keeps Consistency's two jobs orthogonal: *did you do the planned sessions* (existing) × *did you do them properly* (new). 4 new tests (`tests/workout_quality_e5.test.js`, 338 total): on-target work scores like the un-adjusted pillar, junk trims it, the factor stays neutral with no plan. typecheck / smoke green. · **All P0+P1 review items now shipped (E1–E8).** Remaining: optional P2–P4 (E9 daily-movement, E10 nutrition, E11/E12 presentation).

- 2026-07-03 · **Hybrid Score E6 — recovery-trend term.** Recovery no longer reads only today's snapshot — a multi-day readiness *slide* now pulls it down before any single day looks bad (early warning). `recordDailyScore` (history.js) persists each day's **load-excluded** readiness onto the snapshot (kept fresh intraday, ACWR removed so it never overlaps the Load pillar); `recoveryPillar(model, state)` computes a least-squares slope over the last 3 recorded days and folds it into a modest **±8** nudge so today's actual readiness still dominates, surfacing "recovery trending down/up" signals. Deliberately distinct from Momentum, which slopes the *composite* score — so no double-count. 4 new tests (`tests/recovery_trend_e6.test.js`, 334 total): an identical 70-today reading scores lower after a 3-day decline than after a flat run, an upward trend nudges up, <3 days of history applies no adjustment, and the readiness value round-trips through the snapshot. typecheck / smoke green. · Remaining roadmap: E5 (workout-quality / true adherence), then the P2–P4 optional items (E9 daily-movement, E10 nutrition, E11/E12 presentation).

- 2026-07-03 · **Hybrid Score E8 — compound-weighted, smoothed Strength (Defect 5 closed).** Two strength-gaming vectors shut. (1) The e1RM formula over-estimates a grindy near-max single, and `weeklyE1rmByLift` stored each week's single-session peak — so one such set spiked the pillar. New `robustE1rmSeries` (metrics-strength.js) replaces each training week's peak with the **trailing-3-week median**: a one-off outlier is rejected, a PR you actually *repeat* persists into the median within a couple of weeks (median chosen over a naive rolling-max, which would keep the spike; non-training weeks stay 0 so progression's gap-skipping is intact). (2) New `liftWeight` tiers every lift (primary barbell compound 1.0 · secondary/assistance 0.6 · isolation 0.25 · unknown 0.5); `strengthPillar` progression is now a **compound-weighted mean** with the denominator floored at one compound's worth — an accessory-only block can't earn full progression credit, yet accessories layered on top of compounds never dilute them, and the headline signal reports the biggest *weighted* mover (a squat PR outranks a curl PR). 4 new tests (`tests/strength_pillar_e8.test.js`, 330 total): a lone near-max single now scores like a flat block while a repeated climb scores clearly higher, and an identical curl PR moves Strength less than a squat PR. typecheck / smoke green. · All five review defects (E1 sawtooth, E2 pace-penalty, E3 double-count, E4 static-VDOT, E8 e1RM-gaming) now closed; E7 delta-attribution shipped. Optional remainder: E5/E6/E9–E12.

- 2026-07-03 · **Hybrid Score E4 — auto-VDOT from real runs (Defect 4 closed).** VDOT was static/manual-only — running fitness only lit up for users who typed a threshold pace. Added to `running-calcs.js`: `vdotFromPerformance(distKm, timeSec)` (Daniels–Gilbert %VO₂max curve — a distance/time → VDOT), `thresholdSecsFromVdot`, `bestEffortVdot(state, days, maxWeek)` (scans the last ~8 weeks for the hardest qualifying effort: 1.5–42.2 km, walks and sub-1.5 km sprints excluded, takes the MAX VDOT), and `effectiveVdot` (manual `thresholdPaceSeconds` wins → `{vdot,thresholdSecs,source:'threshold'}`, else the best-effort estimate → `source:'estimated'`, else null). Wired into `endurancePillar` (the science-based `enduranceScore` now activates from runs alone, not just a manual threshold) and `runningProjection` (race predictions + the 5k ETA now appear for anyone who logs runs). Verified against Daniels' published tables: a 20:00 5k → VDOT 49–51. 5 new tests (`tests/vdot.test.js`, 326 total) / typecheck / smoke green. · Next roadmap: E8 compound-weighted, smoothed strength (closes the e1RM single-session gaming vector).

- 2026-07-02 · **Tile overlap removed + Hybrid Score E3 (de-double-count).** (1) Per the "no duplication/overlap" principle, hid the **Today** tile by default (it overlaps the Morning Briefing's session+mission) and promoted **Avg Pace** — so the focused six are now one-each, non-overlapping: recovery · load · strength-work · **endurance** · body · habit (endurance was the gap). Today stays in the customiser. (2) **E3** made the score's pillars orthogonal — no input feeds two pillars anymore: **Recovery** uses a load-excluded readiness (`model.readyNoLoad`) so ACWR isn't counted by both Recovery and Load (proof: 87 vs load-tainted 91 on identical signals); **Momentum** rebased on the Hybrid Score's own daily-history trend (least-squares slope of last ~7 scores) instead of re-deriving volume/distance/CTL that Strength/Endurance/Load already own; **sleep** removed from Lifestyle (Recovery owns it, Lifestyle = steps+fasting). Stated pillar weights are now honest. 8 new tests (321 total) / typecheck / smoke green; composite verified coherent (all 8 pillars, correct renorm, additive invariant holds). · Next roadmap: E4 auto-VDOT, E8 compound-weighted smoothed strength.

- 2026-07-02 · **At-a-Glance tile quality pass.** Investigated redundancy vs Hybrid Score/briefing/hub: the tiles are NOT redundant as a *layer* (they're the raw glanceable numbers beneath the synthesized score — the job Whoop/Garmin metric tiles serve), but the *content* was low-quality and duplicative. Reworked the six default-visible tiles to Hybrid-Score standard — one meaningful hero + at most one supporting line that adds NEW info, no line restating another, no jargon: **Weekly Volume** dropped the insight that literally restated the ▲4% delta chip; **Streak** dropped the "🔥N" tag duplicating the "Nd" hero (now shows "Nd to record" / "Personal best" + freeze note); **Training Status** replaced meaningless raw EWMA "Fitness 10 · Fatigue 9" with plain-language freshness ("Balanced — fitness & fatigue in balance") + the CTL spark; **Readiness** replaced the useless input-name list ("HRV·Sleep·Load·RHR·Wellness") with actual values ("Sleep 7.8h · HRV 62ms"); **Today** dropped the "Complete" tag restating "✓ Done" and the coaching line that duplicated the briefing. 5 new guard tests (320 total) / typecheck / smoke green; rendered + verified in Chromium. Note: 'Today' is the tile that most overlaps the Morning Briefing — a candidate to swap for a performance tile (Top Lifts / Avg Pace) if desired. · Next: back to the Hybrid Score roadmap — E3 de-double-count.

- 2026-07-02 · **E7 — Hybrid Score "why it changed" attribution.** The detail view now explains the day-over-day *change*, not just today's level. Snapshots store per-pillar contributions (`history.js`); the engine diffs yesterday→today into `deltaBreakdown` (Σ pillar-deltas ≈ score delta, so it literally explains the number); the detail renders a "Since yesterday +N" card ("+5 Recovery improved · +3 Endurance improved · −2 Consistency slipped") above the existing "why your score IS 90" drivers. Directly answers the brief's "why increased / why reduced." Backward-compatible: older snapshots without contributions simply yield no breakdown. 2 new tests incl. sum-to-delta invariant (315 total) / typecheck / smoke green; rendered + verified in Chromium. · Next roadmap: E3 de-double-count, E4 auto-VDOT, E8 compound-weighted strength.

- 2026-07-02 · **Hybrid Score deep review + first evolution** (`docs/HYBRID-SCORE-REVIEW.md`). Audited the shipped engine input-by-input; found the architecture strong (transparent additive pillars, novel Balance pillar, one-action, adaptation) but five real defects: (1) within-week **sawtooth** — consistency = done÷whole-week's-plan so the score dropped every Monday for no behavioural reason; (2) **double-counting** (ACWR in Recovery+Load, sleep in Recovery+Lifestyle, volume/dist/CTL re-counted by Momentum); (3) **average-pace regression penalty** — penalised correct easy-volume/polarised training; (4) **static VDOT** never updates from real runs; (5) **e1RM gaming + accessory dilution** in Strength. Doc includes competitive benchmark (Garmin/Whoop/Oura/Strava/Apple — Hybrid is uniquely broad + hybrid-balance-aware, behind on wearable-driven daily granularity), psychology review, and a prioritised E1–E12 evolve-not-replace roadmap. **Shipped the "first move" E1+E2** (measurable, contained): E1 de-sawtooths consistency (anchor on established baseline, only credit within-week progress — Monday now holds instead of cratering ~50pts); E2 adds `weeklyBestPaceSeries` (intensity-honest fastest-run/wk) and switches endurance pace-progression to best-effort, treating slowing as neutral not a penalty. 5 new tests incl. acceptance tests for both (313 total) / typecheck / smoke green. · Next: E7 day-over-day "why it changed" attribution (highest premium win), E3 de-double-count, E4 auto-VDOT.

- 2026-07-02 · **Roadmap tail cleared — R7, R9, R12, R13, R14, R15, R11, R17, R18, R16** (each its own tested, pushed commit). **R7** streak freezes (`js/brain/streak.js` — earned, auto-cover a missed day, loss-aversion line). **R9** unified the Profile onto the canonical Hybrid Level (`levelFromXp`), dropping the second legacy level system. **R12** performance projections (`js/brain/predictions.js` — race times + trend ETAs, new Projections leaf). **R13** Monthly Report (`js/brain/monthly-report.js` + leaf + Sunday push). **R14** guided first session (first-run mission + welcome moment). **R15** styled `confirmModal` replacing all three native `confirm()`s. **R11** premium view/leaf enter transitions (opacity-only on views to avoid the fixed-child containing-block trap; reduced-motion guarded). **R17** swept the dead `#calModal` CSS block. **R18** shared logged-day iterator (`js/analytics/logged-days.js`) dedupes streak/monthly date-walk, behaviour-preserving. **R16** extracted the 20-action fasting sub-router out of app.js (−84 lines), parity-verified; deeper god-module teardown staged per slice. Full session arc: audit → Hybrid Score™ → briefing/mission → habit loop → celebrations → focused Home → weekly/monthly reviews → so-what lines → overtraining safety → streak/level/prediction → transitions/modals/cleanup. Test count 244 → **310**; typecheck / smoke green throughout; every new surface rendered through its real module in headless Chromium. Every roadmap item R1–R18 now shipped or (R16) safely started. · Next / `[You]`: device-test the notification, celebration, overtraining-card, briefing and transition flows before the Play beta; consider LLM phrasing layer (§5.7) once the deterministic core has real-world data.

- 2026-07-02 · **R10: Overtraining escalation** — a genuine user-safety feature. Pure multi-signal risk module `js/brain/risk.js` (`assessOvertrainingRisk(model, state, days)`): weighted deterministic signals — ACWR ≥1.5 (spike, sufficient alone per Gabbett), deep fatigue (TSB ≤ −25), readiness suppressed/dipping, sleep debt (3-night avg <6h), Hybrid Score sliding (≥3 consecutive declines AND latest <55), hard-effort RPE streak — scored into none/watch/high; `riskSignature()` keys the acknowledgement to the exact signal set. Escalates the advisory ACWR-only deload card into a ringed red **acknowledge-required** Home danger card (`#homeOvertrainingCard`, above all other alerts) with signal chips, honest "deload isn't lost progress" copy, one-tap **Apply deload week** (reuses `applyDeloadToCurrentWeek`) and **I understand** (persists `overtrainingAck` by signature — a new/worse condition resurfaces it). Suppresses the advisory deload card while showing; softens copy + hides the deload button when the week is already deloaded; fires one best-effort warning push per day (`pushOvertrainingWarning`, guarded by `_overtrainingPushedDate`). 8 new tests (293 total) / typecheck / smoke green; card rendered through the real risk module in Chromium and visually verified. · Next remaining P1: R7 streak freeze/repair; R9 remainder (Hybrid Level on Profile). `[You]`: device-test the push + card before beta.

- 2026-07-02 · **R8: "So what?" lines** — every analytics leaf now prescribes, not just displays. Pure decision module `js/analytics/so-what.js` (`buildSoWhat(context, model, state)` → one honest, tone-coded line per leaf: load spike → deload advice; readiness 85+ → PR green light / <40 → protect sleep; volume down → schedule a lift; no runs → Zone 2 nudge; VDOT without threshold pace → setup prompt; bodyweight goal-aware; streak record-framing; fasting countdown; plan-gap coaching). Rendered via ONE injection point in the analytics router (`renderSoWhatBanner`) — all 19 leaves covered, zero view files touched; prescribing surfaces (hub / Hybrid Score / Week in Review) correctly get no banner; best-effort try/catch so it can never block a view. 10 new tests (285 total) / typecheck / smoke green; all four tones visually verified through the real module in Chromium. · Next: R10 overtraining escalation, R7 streak freeze, R9 remainder (Hybrid Level on Profile).

- 2026-07-02 · **R6: Week in Review** — the shareable weekly story. Pure builder `js/brain/weekly-review.js` (rides on `computeDashboardModel` for volume/distance/consistency/streak, `weeklyE1rmByLift` for this-week PRs vs all prior bests, score history for the 7-day arc; `pickWeeklyFocus` = one honest priority-ordered focus: Consistency → Recovery → Endurance → Strength → Momentum). New Insights leaf "Week in Review" (stat tiles with WoW deltas · score arc sparkline · adherence bar · PR list with previous bests · focus card · Share via navigator.share → clipboard fallback). Sunday weekly-summary push now sends the real numbers via `reviewToText` (generic fallback kept). 4 new tests (275 total) / typecheck / smoke green; rendered via the real modules in Chromium and visually verified. · Next: remaining P1s — R7 streak freeze, R8 "so what" action lines on analytics leaves, R10 overtraining escalation; surface Hybrid Level on Profile (R9 remainder). `[You]`: device-test notifications/celebrations/briefing before beta.

- 2026-07-02 · **R3 + R5 + R4 shipped** (roadmap P0/P1 sweep, each its own commit). **R3**: onboarding Step 6 "Meet your daily coach" asks for the notification permission (Enable / Maybe later — denial never traps); the JS-side daily reminder now sends the athlete's real briefing via pure `composeMorningReminder` (greeting · Hybrid Score+delta · session · mission), generic copy kept as fallback; native AlarmManager nudge unchanged (Kotlin follow-up if we want it personalised). Existing users skip onboarding so they only get the Settings toggle — one-time in-app prompt is a possible follow-up. **R5**: `js/ui/celebration.js` — premium earned moments (dark glass card, palette confetti, one haptic, reduced-motion safe, queued); `recordDailyScore` returns pure-tested milestones (level-up via XP tier crossing, streak 7/30/100, first 90+ score) that fire only on the first record of a day; PR recaps get haptic + confetti burst. **R4**: fresh installs get a focused six-tile dashboard (Today · Readiness · Training Status · Weekly Volume · Body Weight · Streak) via `DEFAULT_HIDDEN_TILES` + `dashboardTiles.hidden:null` = "use defaults" — any saved customisation (incl. `[]` = show all, what existing users have) wins; customiser "Reset" now returns to the focused default. `[You]`: tap Reset in the tile customiser if you want the new trimmed default on your own device. 271 tests / typecheck / smoke green. · Next: R6 Weekly Review (Sunday, shareable) is the next roadmap item; device-test notifications + celebrations before beta.

- 2026-07-02 · **R1: Morning Briefing** (`js/brain/morning-briefing.js` + `js/home/morning-briefing-card.js`) — the daily "here's your day" narrative, anchored by Hybrid Score. Merges the two competing Home hero surfaces (coaching card `brainCoachCard` + insight banner `dashboardInsight`) into ONE coaching voice: greeting (time-of-day + name) · context (day/week/phase) · today's session · a derived, ungameable **Mission** (complete-the-session on training days with readiness-aware framing — Zone-2 cap when readiness <55, push framing ≥85; wellness check-in then recovery framing on rest days; flips to a green done state with celebration copy the moment the work is logged) · the coach's line (severity dot + headline + advice from the shared rec engine). Hero's action row suppressed on Home (`heroHTML(..., {showAction:false})`) so the briefing owns THE action — one voice; the Insights detail keeps "Do this next". `briefingToText()` produces the notification-ready morning-push string for R3. Retired: both old surfaces' HTML/JS/CSS (incl. dead `.brain-coach-*` block in styles.css and `.dash-insight` inline styles), `dismiss-insight`/`dismiss-coaching` handlers and their state fields; `pickTopInsight` kept as tested model intelligence (future push copy). 8 new tests (266 total) / typecheck / smoke green; composite Home-top visually verified in headless Chromium (pending + done states). · Next: R3 onboarding notification step (wire `briefingToText`), PR/level-up celebration moments (R5).

- 2026-07-02 · **Hybrid Score™** — the signature feature (`docs/HYBRID-SCORE.md` + `js/brain/hybrid-score/` + `css/hybrid-score.css`). One daily 0–100 score of how well you're progressing as a hybrid athlete, built entirely by REUSING existing metrics (readiness, CTL/ATL/TSB/ACWR, e1RM & tonnage progression, distance/pace/VDOT, consistency/streak, bodyweight-vs-goal, sleep/steps/fasting) via the shared dashboard model — no duplicated calculations. Eight weighted pillars (Consistency/Recovery/Strength/Endurance/Load/Momentum/Body/Lifestyle) → composite with additive contributions that sum to score−50, so it's fully explainable ("+11 Consistency… −3 Poor sleep"). Anti-game: rewards progression + plan adherence + the productive ACWR zone + true lift/run balance, gated by recovery — not raw volume. Adapts to level, planned deload (reweights, not punished) and comebacks; confidence = data coverage; career XP → Initiate→Legend identity ladder; idempotent daily history for delta/trend. Premium UI: circular gauge hero at the top of Home (first thing seen) + Insights hub entry + detail view (pillar bars, driver list, level progress, trend); visually verified via headless-Chrome at phone width. 14 new tests (258 total) / typecheck / smoke all green. · Next: wire the score line into the Morning Briefing (R1) and reference it across coaching surfaces; add PR/level-up celebration moments (haptics).

- 2026-07-02 · World-class product audit (`docs/PRODUCT-AUDIT.md`) · Read the whole app (nav, Home/tiles, Insights hub + 20 leaf views, workout cockpit, programs, profile, fasting, brain, onboarding, settings, sync/monitoring). Verdict: engineering is strong and the At-a-Glance→Insights-hub refactor did **not** orphan analytics (every leaf is reachable from the hub *and* a tile) — the real debt is the opposite: **duplication** (17 Home tiles ≈ the hub) plus **two competing "hero" surfaces** on Home (coaching card + insight banner). Three gaps separate it from best-in-class: (1) it's a tracker not a coach — `brain/briefing.js` is an 18-line ACWR label map, no morning briefing / weekly review / prediction / overtraining escalation; (2) no reward spine — achievements are fasting-only, no identity/level/XP; (3) onboarding never requests notification permission, so the daily loop is opt-in-by-accident. Prioritised roadmap (P0→P3) with the keystone = **Morning Briefing + Daily Mission** loop (all buildable on existing pure metrics, no LLM needed for v1). No product code changed this session — 244 tests / typecheck / smoke still green. · Next: `[CC]` build R1 `js/brain/morning-briefing.js` (pure + tested) then wire one Home hero card retiring the two competing surfaces; R3 onboarding notification step. Device-verify UX before the Play beta.

- 2026-07-02 · UX polish push (no release build yet, per `[You]`) · `[You]` applied RLS + migration + deployed delete-account edge fn + set Sentry DSN + built signed AAB pipeline. Shipped: Quick Start walk/run from Home (Option A, tagged); full-screen Session Recap (from Finish + calendar tap), insights sourced from the one shared engine (`build-insights.js`), route map, PR badges (🏆 when a lift beats its best from every prior session), and a pace-per-km bar chart coloured by pace zone. Fixed walks skewing running pace/VDOT (`weeklyPaceSeries` excludes `type==='walk'`; distance/load still counts them). Quick Start now opens a clean dedicated **Activity** screen (`#activityScreen`) instead of the cockpit — gps-tracker parameterised via UI scopes (cockpit vs activity), persists dist/time/splits directly on finish, `cancelTracking()` for a no-save cancel. 244 tests / typecheck / smoke green. SW cache → v86. · Next: build the requested **test APK** (dispatch `release-aab.yml` on this branch); later sweep orphaned `.cal-m*` CSS.

- 2026-07-01 · Phase 3 `[CC]` sweep · Drafted GDPR-grade Privacy Policy + Terms + Play Data Safety mapping + store listing (`docs/`). Integration tests for the log-a-workout path (`workout.js`, 7 tests). Built in-app account & data deletion (client erase + `delete-account` edge function for `[You]` to deploy). All Phase 3 `[CC]` items done. 233 tests / typecheck / smoke green; Phase 2 background-reminder build #112 confirmed green. · Next: `[You]` (policy host/review, data-safety form, screenshots, edge-function deploy, device tests); `[CC]` Phase 4 prep (signed release/AAB CI) is the next codeable item.
- 2026-07-01 · Phase 2 push · GPS reliability shipped (native location foreground service, CI-compiled). Offline edits re-sync on reconnect. Brand unified (all user-facing = Helyx; package renamed `com.hybridapp`→`com.helyx.app`; export filenames). Notification permission + native delivery for Android (WebView lacks Web Notifications API) — foreground reliable; background scheduling flagged as follow-up. All JS gates green (221 tests / typecheck / smoke); Kotlin CI-verified. · Next: `[You]` device tests; `[CC]` optional native reminder scheduling, or move to Phase 3 (Privacy Policy / tests).
- 2026-07-01 · Phase 1 wrap · `[You]` applied `rls_user_data.sql` (RLS lock now ON — users protected). Turned OFF Supabase "Confirm email" for beta (email-link confirmation didn't fit the WebView app; was causing otp_expired failures on signup). Adversarial proof + `migration_user_data_updated_at.sql` **deferred to after Phase 2** (proof needs desktop+Node; user is on phone). These gate public launch (Phase 4), not Phase 2. · Next: begin Phase 2 — Android Hardening (GPS reliability first).
- 2026-07-01 · Phase 1 (cont.) · Sentry web SDK integrated (`js/monitoring/`): DSN-gated so nothing is sent until `[You]` pastes a DSN into `sentry-config.js`; conservative config for a health/location app (sendDefaultPii false, event + breadcrumb scrubbers strip request/user/device and redact network URLs). 6 new tests. All green (204 / typecheck / smoke). All Phase 1 `[CC]` items now done. · Next: `[You]` apply both SQL files + run adversarial check + add Sentry DSN; then Phase 2 (Android hardening).
- 2026-07-01 · Phase 1 (cont.) · Last-write-wins sync fix: `js/state/sync-guard.js` tracks the server `updated_at` this device last saw; before every cloud save, state.js checks whether the server row is newer (another device wrote) and, if so, raises a warn-and-choose conflict modal (`js/state/sync-conflict-ui.js`) instead of clobbering — keep-this-device overwrites, use-cloud reloads. Pull records the version; save/pull degrade gracefully if the migration isn't applied yet. `supabase/migration_user_data_updated_at.sql` (`[You]` apply). 7 new tests. All green (198 / typecheck / smoke). · Next: `[You]` apply both SQL files + adversarial check; then `[CC]` Sentry.
- 2026-07-01 · Phase 1 started. Secret sweep (clean — only public anon key). Drafted RLS SQL (`supabase/rls_user_data.sql`) + adversarial proof harness (`scripts/rls-adversarial-check.mjs`) + `supabase/README.md`. Added local safety net: `snapshotLocalBeforeCloudPull` backs up local state before a cloud pull can clobber it (state.js, 5 tests). All green (191 tests / typecheck / smoke). · Next: `[You]` apply RLS SQL + run adversarial check; then `[CC]` last-write-wins sync fix (updated_at + divergence) and Sentry.
- YYYY-MM-DD · Tracker + working brief created (PROGRESS.md, CLAUDE.md). · Next: Phase 1 Task 1 — RLS SQL + adversarial test.
