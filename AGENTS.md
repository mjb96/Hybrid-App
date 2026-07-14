# Helyx — Codex Working Brief

Helyx is a hybrid strength + running PWA (~28k lines vanilla JS ES modules, no
framework; ~12k CSS; service-worker PWA). This file is auto-loaded every session.

## Commands (keep all green before every commit)
- `npm test` — node --test suite
- `npm run typecheck` — tsc over jsconfig
- `npm run smoke` — scripts/smoke.mjs (jsdom import + home render)

## Architecture facts (verify before relying on them)
- State: one big `appState` object → localStorage (source of truth) + Supabase table
  `user_data` as a single JSON blob per user, written via `upsert` in `js/state.js`.
  Still blob-level last-write-wins (no field merge), but no longer *silent*: a
  server-managed `updated_at` (`supabase/migration_user_data_updated_at.sql`) +
  `js/state/sync-guard.js` detect when another device wrote since this one loaded and
  raise a warn-and-choose modal (`js/state/sync-conflict-ui.js`) instead of clobbering.
  A pre-cloud-pull local snapshot (`snapshotLocalBeforeCloudPull`) is also kept.
- Program-run isolation: every program run has a stable `state.activeActivationId`
  (`js/state/activation-identity.js`) and each week is stamped `week.activationId`. A
  switch/restart calls `startProgramActivation` (state.js) → `beginActivation` +
  `archiveForeignWeeks`: the previous run's numeric weeks move to `arch:<oldId>:<n>` keys
  **inside `state.weeks`** (logged history kept — every date-/all-time analytics + PR
  reader iterates all entries and attributes by stamped date, so archived data still
  counts; numeric week-nav `1..totalWeeks` and program-week-indexed series only touch
  numeric keys, so a past run never appears in the active workout). This is what stops a
  previous program's completed lifts leaking into a new program's day — do NOT reintroduce
  same-slot reuse across programs. v3 migration adopts legacy weeks into one activation.
- Auth/sync: `js/state/auth.js`, `js/state/supabase.js`. Anon key is hardcoded (public
  by design — safe ONLY if Supabase RLS is enforced). RLS (`supabase/rls_user_data.sql`)
  is **applied + proven** — the adversarial check (`scripts/rls-adversarial-check.mjs`)
  passed against the live DB (2026-07-02): user A cannot read/write user B's row.
- Weekly analytics attribution: `state.currentWeek` is a PROGRAM-week counter that only
  advances on an explicit step / confirmed auto-advance — it is NOT the calendar week.
  So "this week" analytics must NOT read `weeks[currentWeek]` directly (that leaked a
  frozen program week's stale training into the current week). `js/analytics/weekly-aggregate.js`
  is the canonical source: it buckets every logged day by its real stamped `.dates[day]`
  into Monday-based CALENDAR weeks (`buildCalendarWeekStrength`, `collectCalendarWeek`,
  `weekStartOf`, `localDayKey`). The In Focus graph (`buildWeekChart`) + strength detail +
  the At-a-Glance Weekly Volume tile (`model.calendarWeek`) all consume it, so an empty
  current calendar week is a true zero and the week label is the real Mon–Sun range, never
  derived from the activity records. The strength/running **detail week navigator**
  (`js/analytics/week-nav.js`) is also CALENDAR-based (`getCalendarWeekOffset()`, ephemeral
  offset, reset on view entry) — it never reads `state.currentWeek`. `explainWeeklyMetric`
  is a dev-only attribution trace (program week is metadata; the date decides the week).
  `docs/TIME-MODEL-AUDIT.md` classifies every week-based reference (calendar vs program vs
  rolling); `tests/analytics_calendar_guard.test.js` keeps the calendar-core modules
  program-week-free. Program adherence, "Week N" labels, deload detection and today's
  planned session stay PROGRAM-week based; CTL/ATL/readiness stay rolling-window. The
  Strength overview's per-lift **estimated-1RM "this week" change + PR indicators** use
  `js/analytics/strength-calendar.js` (`calendarStrengthSummary`, `bestE1rmByLiftForWeek`,
  canonical `estimatedE1rm`) — calendar-week, same-exercise only (identity = the lift's
  bare-string name key; no alias layer), honest empty states. The Hybrid Score strength
  pillar stays program-week progression on purpose.
- Crash reporting: Sentry in `js/monitoring/`, DSN-gated (off until `sentry-config.js`
  has a DSN), PII-scrubbed for health/location data.
- Android: custom WebView shell (NOT Capacitor/TWA) in `android/`, minSdk 26, loads
  bundled assets. Native Health Connect bridge in `js/health/health-bridge.js`
  (Android-only). GPS in `js/gps-tracker.js` uses web geolocation (unreliable when the
  screen locks — a problem for run tracking).
- No iOS project exists. iOS is OUT OF SCOPE for the current launch push.
- Programs: catalog in `js/programs/catalog/*.js`; a program = a single-week `days{}`
  template + `weeklyVolModifiers` (per-week sets/reps/`intensityLabel`, incl. deloads)
  — the cockpit resolves each lift's target via `getWeekModifier`→`liftTarget`
  (`js/schema.js`/`engine.js`), so a custom program's lifts share the week modifier.
  Program detail (`js/programs/detail.js`) has Overview | Structure | **Plan**
  (week-by-week timeline, `timeline.js`) + commitment strip + week-stepped day
  preview. The Structure sample + day-preview modal resolve each lift's sets×reps
  via `liftTarget` (the SAME call the cockpit uses), NOT the catalog's decorative
  `workoutPreview.exercises` — keep it that way so detail can't promise a
  per-lift prescription the engine doesn't deliver. Pure helpers: `timeline.js`, `compare.js` (`programStats`/`equipmentFit`),
  `progression.js` (builder's per-week editor), `onboarding/starter-programs.js`.
  "Customize" forks ANY program via `duplicateCustomProgram` (a copy — never edits
  shared catalog data). `day.lifts` are bare strings across 150+ sites — do NOT
  migrate to objects casually.
- Workout cockpit: in-session **exercise swap** (`js/workout/substitutions.js` +
  pure `applyExerciseSwap` in `workout-order.js`; re-keys the sets array to preserve
  target+logged data), per-side **plate math** (`js/workout/plates.js`), swipe
  between days (`neighborDay`). Coach: deterministic **ask-the-coach** Q&A
  (`js/brain/coach-qa.js`, chips on the briefing) + PR share card (`js/brain/pr-share.js`).

## Roadmap Working Agreements
Active goal: Android public beta on Google Play (free at launch). See
`docs/IMPROVEMENT_ROADMAP.md` for the phased plan, implementation status, human-owned
release checklist, and session log. iOS/Capacitor and any billing/paywall are
explicitly deferred — do not build them now.

Product/UX source of truth: `PRODUCT_AUDIT.md` (design blueprint, laws, prioritised
principles, rejected ideas) + `docs/IMPROVEMENT_ROADMAP.md` (the only live execution
roadmap/status tracker). Read both before product-facing work. Superseded plans and
logs live in `docs/archive/` — historical context only, never execute from them.

### Session protocol
- START: read this file, `docs/IMPROVEMENT_ROADMAP.md`, and `git log --oneline -15`. State in one line
  where we are and what this session will do.
- WORK: smallest shippable slice. Run test + typecheck + smoke after each change; all
  must pass before commit.
- END: update implementation status and add a Session Log entry in
  `docs/IMPROVEMENT_ROADMAP.md` (date · what
  changed · what's next), commit. Never end on a broken tree or with unrecorded work.

### Operating rules
- Security and data-safety first. Never ship a change that could leak or lose user
  data. When touching sync, add backups/guards *before* changing behavior.
- Don't assume — read the actual code before changing it. If a fact here is wrong, fix
  this file.
- Verify by running things. Never report as working what you haven't run; if tests
  fail, say so with output.
- Tests are part of every feature — especially sync, security, and the currently
  under-tested large files (`js/workout.js`, `js/app.js`).
- Git: short-lived feature branch per phase (e.g. `phase1-security`). Commit in logical
  units. Do NOT push to the default branch or open PRs without asking. No force-push of
  shared branches.
- `[You]` tasks are the human's (accounts, applying SQL in Supabase, device testing,
  screenshots/art, legal review, store submission). For each, produce the exact
  artifact needed (SQL, checklist, copy, config) and STOP — never simulate it as done.
- Ask before anything irreversible or outward-facing (pushing, deleting data, external
  calls). One clear question at a time.
- No fabricated secrets, keys, or model identifiers in committed files.
