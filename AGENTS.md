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
  SEVERAL stored slots can own ONE calendar date (two programmed days completed
  the same day; a one-off later that day; a tracked run plus an imported one).
  `indexSlotsByDate`'s dedup identity is therefore the strength `sessionId` when
  present and otherwise the PROGRAM DAY — matching on "no sessionId" alone made
  every programmed slot on a date one duplicate family and silently discarded the
  smaller session (17 sets shown for a 33-set day). Same program day under two
  week keys IS a duplicate (cloud copy / re-activation reusing week numbers) and
  still collapses to one. Downstream,
  `collectCalendarWeek` must MERGE every field, never assign: it merges `lifts`,
  concatenates `runSessions` and re-summarises them through `runDaySummary`
  (adding two summaries would break duration-weighted RPE/HR), merges `gymStats`
  via `mergeGymStats` (durations/calories add, peak HR maxes, average HR is
  duration-weighted, `time` stays storable `M:SS`), and records `sessionCounts`
  so `activityCount` is real. Assigning is the bug that showed a 5km + 10km day
  as 10km. SESSIONS and TRAINING DAYS are different counts once two workouts
  share a date: anything comparing against planned sessions (Progress →
  Consistency) must use `loggedSessionsByDate`, not a set of dates — counting
  dates reported five completed workouts as "4 of 5 planned".
  `tests/analytics_calendar_guard.test.js` keeps the calendar-core modules
  program-week-free. Program adherence, "Week N" labels, deload detection and today's
  planned session stay PROGRAM-week based; CTL/ATL/readiness stay rolling-window. The
  Strength overview's per-lift **estimated-1RM "this week" change + PR indicators** use
  `js/analytics/strength-calendar.js` (`calendarStrengthSummary`, `bestE1rmByLiftForWeek`,
  canonical `estimatedE1rm`) — calendar-week, same-exercise only. Stored keys remain bare
  strings, while `js/exercises/catalog.js` resolves explicit historical aliases to a
  canonical ID/display name at read time; unknown custom names stay exact. The Hybrid Score strength
  pillar stays program-week progression on purpose.
- Crash reporting: Sentry in `js/monitoring/`, DSN-gated (off until `sentry-config.js`
  has a DSN), PII-scrubbed for health/location data.
- Mobile safe areas: `--safe-top` / `--safe-bottom` (`css/styles.css`, beside
  `--touch-target`) are the ONLY correct way to clear the system bars. They consult
  BOTH `env(safe-area-inset-*)` AND `var(--app-safe-*)`, because the Android WebView is
  edge-to-edge but only reports `env(safe-area-inset-top)` for a DISPLAY CUTOUT — on a
  notchless phone `env()` is 0px and env-only CSS silently does nothing. Every
  top-anchored surface pads from the token and keeps its pre-token declaration first as
  a fallback. `scripts/safe-area-browser-check.mjs` is the only check that publishes a
  non-zero inset; without it this defect class is invisible to a desktop-Chromium suite.
  Backdrops that render no content are deliberately NOT padded.
- Touch targets: 44px (`--touch-target`) is MEASURED in the running app by
  `scripts/touch-target-browser-check.mjs`, which walks 12 surfaces — the four nav
  destinations, the in-session cockpit and its modals, the LIVE run panel and
  onboarding (875 controls) — and sizes the EFFECTIVE hit area. Every opener is
  asserted, so a selector that stops matching fails instead of silently measuring
  nothing. A COVERED control (its own centre resolves to a different element) is
  skipped: views stay `.active` under a modal, so measuring them there reports true
  unreachability for a non-problem. Runtime-injected third-party controls count —
  Leaflet's 30×30 map zoom buttons were a real defect no static test could see. `tests/accessibility.test.js` greps `index.html` and so
  can only ever see the static shell — most controls are rendered from JS template
  literals, which is where every offender lived (a 5×5 carousel dot, a 19px metric tab).
  Two mechanisms: `min-height: var(--touch-target)` where the box can grow, and
  `.hit-target` (`css/styles.css`) where the visual size is deliberate — it grows a
  centred `::after` that takes the taps while the paint is unchanged. NEVER expand a hit
  area past half the gap to the next control: overlapping targets do not merge, the
  later element wins the overlap and the earlier one becomes UNREACHABLE (this is why
  the carousel dots stop at their 10px pitch instead of taking a nominal 44px). The
  check's `EXEMPT` list is for geometric impossibility only and is ratcheted by
  `tests/touch_target_exemptions.test.js`: at most three entries, each stating
  arithmetic rather than a preference. The check probes REACHABILITY with
  `elementFromPoint` rather than reading CSS, so it must `scrollIntoView` each
  control first — without that everything is below the fold, every probe returns
  null and the check quietly degrades to trusting the declaration. A point
  outside the viewport is UNKNOWN, not unreachable (one pair of In Focus week
  arrows sits at x≈615 inside a horizontal scroller).
- Performance: `scripts/performance-baseline.mjs` (`npm run perf:baseline`) is the
  baseline harness — three full boots, one with five years of history (260 weeks,
  ~20,800 sets). It asserts ONLY machine-independent facts: first paint is not
  render-blocked (<3s), the active-view DOM stays within 1.35× as history grows
  (measured 1.03×), and the app renders with every external host blocked.
  Wall-clock is REPORTED, never asserted — this container is ~3x slower than CI and
  neither is a phone. Webfont CSS is loaded NON-BLOCKING (`media="print"` +
  `js/font-css.js` flipping it to `all`); a plain `<link>` there blocks first paint
  until it loads OR FAILS, which measured 12.6s on every offline start.
  `display=swap` does NOT prevent this — it governs the font file, not the
  stylesheet.
- Service-worker cache: `CACHE_NAME` carries a generated content hash
  (`scripts/gen-precache.mjs`), so editing any precached asset changes `sw.js` and the
  upgrade fires. Non-JS assets are cache-first and a browser only reinstalls a worker
  whose bytes changed, so before this a CSS-only commit never reached installed PWA
  clients. Classic `<script>` tags in `index.html` are precache ROOTS: nothing imports them, so a
  graph walk from `js/app.js` cannot see them and a miss only breaks offline.
  Never hand-edit `CACHE_NAME` or the `REQUIRED_ASSETS` block — run
  `npm run precache:gen`.
- Imported activities: FIT files are dated from the activity's own start
  (`sessionStartTs`, `js/garmin.js`) — a session `timestamp` is the END of the activity,
  so the duration is subtracted. That timestamp is persisted as `startTs` and is the
  identity `findImportedRunSession` (`js/state/run-sessions.js`) matches to refuse a
  re-import; it scans archived `arch:<id>:<n>` weeks too, and is scoped to
  `source: 'fit'` so a live-tracked GPS run never blocks a file import.
- Android: custom WebView shell (NOT Capacitor/TWA) in `android/`, minSdk 26, loads
  bundled assets. Native Health Connect bridge in `js/health/health-bridge.js`
  (Android-only). Android GPS uses a foreground location service plus an app-private,
  fsynced active-session journal; JS drains/replays native fixes and acknowledges the
  journal only after app-state persistence. Browser/PWA GPS still uses web geolocation
  and is foreground-only.
- Live run surface: `js/gps-tracker.js` drives TWO surfaces from one state machine
  (cockpit + Quick Activity) via the `UI` scope map — a named ID there must exist in
  `index.html`. All live numbers go through `js/gps/active-run-display.js`: never write
  raw km to the DOM, the athlete's `settings.distanceUnit` decides, and the live figure
  must equal what `stopTracking` puts in the cockpit input. Live signal is graded from
  the LAST ACCEPTED fix (`gpsSignalPresentation`), NOT `summarizeGpsQuality` — that one
  grades a finished run; both share `GPS_ACCURACY_TIERS`. While a session is live the
  cockpit run card is in focus mode (`run-session-active`) and `renderWorkout` must not
  collapse or reparent it (`.run-collapsed` hides the whole body; moving the node
  detaches the live Leaflet map).
- Run states that are NOT the run (`js/gps/run-notices.js`): a toast is only for
  something that happened and is over — permission denial, no-fix, background-tracking
  limits, recovery and partial saves are CONDITIONS and render as persistent notices.
  `startTracking` returns `{ ok, reason }`, never a bare boolean: the Quick Activity
  scope has NO start panel, so a refused start that falls back to `showPanel('start')`
  leaves a blank full-screen view (this was a real bug). `showRunNotice` takes over the
  surface; `showInfoNotice` must NOT call `showPanel` — a recovered run is still live.
  A mid-run `onPositionError` must never tear down the session.
- No iOS project exists. iOS is OUT OF SCOPE for the current launch push.
- Exercise metadata: `instructions`/`difficulty`/`safetyNotes` are AUTHORED per
  exercise via `REVIEWED()` and land a batch at a time (48/155 done, picked by
  real programme usage). `tests/exercise_catalog.test.js` guards the shape — an
  entry with instructions must have a valid difficulty and a safety note, and
  every line must read as a sentence. Safety notes are a claim shown to someone
  loading a barbell: keep batches small enough to review, never bulk-generate.
- Exercise browsing: `MUSCLES` has 19 anatomical keys and is for volume analytics,
  NOT for pickers. Browsing uses `MUSCLE_GROUPS` (six training words, every
  anatomical key in exactly one) and `primaryMuscleGroups`, which claims a group
  only on FULL credit — any-involvement returns 21 glute exercises against the 8
  that train them. The picker's other select filters MOVEMENT (push/pull/legs/
  core/conditioning); it spent a long time mislabelled "muscle group".
- Recommendations: `js/programs/recommendation-fit.js` is the fit model — score from what
  the ATHLETE told the app (`fitnessGoal`/`fitnessLevel`/`equipmentTier`/`equipment`/
  `weightGoal` + real recent training frequency), never from catalogue constants.
  Editorial signal (popularity/rating/featured/official) is a tiebreaker held OUT of the
  personal score and must NEVER surface as a reason — "Staff Pick" describes the
  programme, not the fit. No true personal reason ⇒ `eligible:false` ⇒ the row does not
  render; an empty row is honest, an invented one is not.
- Programs: catalog in `js/programs/catalog/*.js`; a program = a single-week `days{}`
  template + `weeklyVolModifiers` (per-week sets/reps/`intensityLabel`, incl. deloads)
  — the cockpit resolves each lift's target via `getWeekModifier`→`liftTarget`
  (`js/schema.js`/`engine.js`), so a custom program's lifts share the week modifier.
  Program detail (`js/programs/detail.js`) leads with **Who it's for**
  (`detail-fit.js` → the SAME `programFit` the recommendations use, so the two
  surfaces cannot disagree; it additionally shows the CAUTIONS, which the
  recommendations row must never show), then commitment, then equipment FIT, then
  the week-stepped preview, progression and the Overview | Structure | **Plan**
  tabs (week-by-week timeline, `timeline.js`). Level and equipment tier are stated
  ONCE each — re-adding a decorative difficulty/tier tag row is the duplication 4B
  removed. The Structure sample + day-preview modal resolve each lift's sets×reps
  via `liftTarget` (the SAME call the cockpit uses), NOT the catalog's decorative
  `workoutPreview.exercises` — keep it that way so detail can't promise a
  per-lift prescription the engine doesn't deliver. Pure helpers: `timeline.js`, `compare.js` (`programStats`/`equipmentFit`),
  `progression.js` (builder's per-week editor PLUS the Simple broad-progression
  shapes — `planProgressionShape` is pure and writes nothing; only
  `applyProgressionShape` writes, and it returns a snapshot for Undo. Shapes emit
  the SAME `weeklyVolModifiers` the grid does, so no per-lift prescription data is
  introduced and the 4C ADR gate stays shut), `onboarding/starter-programs.js`.
  Every plan-changing builder edit snapshots via `captureProgramDraft` and is
  undoable from one strip (`markUndoable` → `b-undo`); the snapshot is the PLAN
  only (`days` + `weeklyVolModifiers`), never `state.weeks`, so an undo can never
  rewrite logged training. Prefer that over adding confirmation dialogs.
  "Customize" forks ANY program via `duplicateCustomProgram` (a copy — never edits
  shared catalog data). `day.lifts` are bare strings across 150+ sites — do NOT
  migrate to objects casually.
- Per-lift progressions: a week modifier is per-WEEK and shared by every day, so a
  program running two main-lift progressions at once needs a resolver. Two exist,
  each gated on the program's own `progressionModel` field and consulted by
  `liftTarget` (`js/engine.js`): `jt-shed`/`jt-shed-simplified`
  (`js/programs/jt-shed-model.js`) and `shed-pplul` (`js/programs/shed-pplul-model.js`,
  bench/squat/press on one wave and the deadlift on its own). They are deliberately
  NOT shared — their week tables differ. Both are read-time only: nothing per-set is
  persisted, so there is no migration/sync/export surface, and the Phase 4C ADR gate on
  normalised per-lift prescription DATA is untouched. Resolvers return null for
  unauthored lifts so an exercise added mid-session falls through. A CUSTOMIZATION IS
  A FROZEN DEEP COPY, so a fork made before its source gained `progressionModel` has
  no hook and every lift collapses to the shared week modifier (a real Shed PPLUL fork
  showed 4x8 for the whole programme, deadlift included, and no app update could reach
  it). `liftTarget` therefore inherits the model from `sourceProgramId` at READ time
  (`withInheritedProgressionModel`, `js/engine.js`) — nothing stored is rewritten, and
  an unauthored swapped-in lift still falls through.
- Workout cockpit: in-session **exercise swap** (`js/workout/substitutions.js` +
  pure `applyExerciseSwap` in `workout-order.js`; re-keys the sets array to preserve
  target+logged data), per-side **plate math** (`js/workout/plates.js`), swipe
  between days (`neighborDay`). Coach: deterministic **ask-the-coach** Q&A
  (`js/brain/coach-qa.js`, chips on the briefing) + PR share card (`js/brain/pr-share.js`).
- Bands do TWO opposite jobs (`js/workout/load-mode.js`): on a bodyweight movement a
  band ASSISTS (`w = bodyweight − band`, `loadMode: 'assisted'`); on anything else the
  band IS the load (`w = band`, `loadMode: 'banded'`). `bandRole()` decides from the
  exercise name — never assume assistance. Always go through `applyBandLoad` and pass
  the lift name; calling `applyBandAssistance` directly on an accessory is the bug that
  logged a 20kg-band pushdown as 60kg with triple the volume. Band kg stay canonical
  L=10/M=20/H=30 (v5 migration enforces it). Sets logged before the fix keep their
  stored `w` — history is re-READ by role, never rewritten. Body weight has NO
  default: `_currentBodyweight` returns null when unknown and the athlete is asked
  (`numberPromptModal`) rather than logging a fabricated 75kg as their load.
- Logger progression and history are deliberately separate: global dated exercise
  history (`exerciseLoggerHistory`) powers the read-only **Last performed** panel
  and analytics, while `computeDiagnosticForLift` only derives a next-load
  suggestion from the same activation + workout day. A new activation starts with
  blank editable load/rep values; history enters those fields only through the
  explicit **Use previous values** action.
- Session lifecycle: additive `weeks[key].sessionStatus[day]` (`in_progress|finished`)
  and `sessionSummary[day]` sidecars are owned by `js/workout/session-status.js`.
  Deliberate Finish marks the workout finished even below 100% plan adherence; deletion/
  discard clears both fields and blank or warm-up-only work cannot be finished as training.

## Roadmap Working Agreements
Active goal: improve the product experience end to end before focusing on
release. See `docs/IMPROVEMENT_ROADMAP.md` for the current Home → Train →
Progress → Plans direction, interaction principles, prioritised phases,
implementation status, and session log. Android public-beta work is parked, not
cancelled. iOS/Capacitor and any billing/paywall remain explicitly deferred.

Product/UX source of truth: `docs/IMPROVEMENT_ROADMAP.md`. It owns the settled product
rules, rejected scope, execution status, quality gates, parked work, and session log.
Read it before product-facing work; do not create parallel progress, audit, or
checklist trackers.

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
