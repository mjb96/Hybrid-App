# Helyx Improvement Roadmap

**Prepared:** 14 July 2026  
**Last reconciled with `main`:** 16 July 2026
**Goal:** reach a trustworthy Android public beta without expanding scope  
**Constraint:** iOS, billing, paywalls, and new feature categories remain deferred

## Product rules and document map

This roadmap is the single source of truth for product direction, implementation status,
release gates, and session history. Enduring rules formerly spread across dated audits are:

1. One hero per screen; no competing primary messages.
2. Payoff before homework; show value before requesting setup or data entry.
3. Keep advanced power one tap deeper instead of crowding the default surface.
4. Prefer opinionated defaults over avoidable configuration.
5. Use one synthesized coaching sentence, not a mechanism dump.
6. Data safety comes before presentation or convenience.
7. One truth per day: plan, completion, readiness, and weekly totals must agree everywhere.
8. Calendar-week analytics use stamped local dates; program weeks are plan position only;
   rolling readiness/load metrics keep their explicitly named windows.

The active beta scope is Android, strength + running logging, programs, honest analytics,
and reliable local/cloud portability. iOS, billing/paywalls, social feeds, live coaching,
nutrition expansion, and unrelated feature categories are explicitly rejected for this
launch cycle. Implementation contracts that need more detail remain in
`docs/ARCHITECTURE_DECISIONS.md` and `docs/HYBRID-SCORE.md`. Store copy/version policy stay
in `docs/store-listing.md` and `docs/versioning.md`. The five `android-*-device-checklist.md`
files are retained only as executable physical-device evidence forms; their completion
status lives here under Human-owned validation and release items.

### Direction and evidence gates

Helyx should earn the right to become a public product in three stages:

1. **Personal daily driver (now):** one owner uses it for 30 consecutive days with no
   lost, overwritten, misdated, or misclassified activity; the plan → log → review loop
   needs no workaround or developer explanation.
2. **Small private beta:** 5–10 hybrid athletes use it for four weeks. Track weekly return,
   completed/logged sessions, failed or abandoned logging flows, data corrections, and the
   specific moments they would miss if Helyx disappeared.
3. **Public-product decision:** proceed beyond a personal app only if several testers use
   the core loop weekly without prompting and independently value the combined strength +
   running history/coaching. If that evidence is weak, keep Helyx as a polished personal
   tool rather than adding breadth to manufacture demand.

The near-term outcome is therefore: **the fastest, most trustworthy way for one athlete to
plan and record mixed strength + running training.** Reliability and repeat use—not feature
count, downloads, or monetization—are the decision metrics.

## Implementation status

- **R1 / PR-1 complete — 14 July 2026** on `codex/beta-integrity-dates`.
  One canonical local-day API now owns user-facing calendar keys; state writers,
  streaks, score/history, coaching windows, recovery, reports, Home and Settings use
  it. A source guard prevents raw UTC ISO slicing from returning to those paths.
  `npm run verify` is green in Sydney, and all 771 tests pass in UTC, UTC+14 and
  UTC−12 as well. A browser-created 14 July bodyweight entry remained distinct from
  the prior day's entry.
- **R2 / PR-2 complete — 14 July 2026** on `codex/beta-integrity-sessions`.
  Canonical `runSessions[day]` history now gives every manual, GPS and FIT run a
  stable identity while retaining `runs[day]` as the latest editable cockpit
  projection. GPS preserves its original start timestamp and destination across
  Android activity recovery; routes are keyed by exact session; export v3 carries
  every rich route record without collapsing a same-day slot. Legacy state and
  route formats migrate non-destructively, day recaps can target the exact finished
  run, and analytics distinguish per-session signals from per-day totals. Evidence:
  manual+GPS JSON reload, state/IDB migration, sibling-safe route deletion,
  same-day analytics, exact recap and v2/v3 export/import regressions; 787/787 tests,
  typecheck, precache and smoke green.
- **R3 / PR-3 complete — 14 July 2026** on `codex/beta-integrity-migrations`.
  Each schema step now executes on a detached JSON clone, advances its version only
  after invariant validation, and atomically replaces the last-good state. A thrown
  step, validation failure, missing step, or future schema stops immediately without
  stamping current. Startup leaves persisted bytes untouched and presents an
  accessible retry screen; snapshot/file imports upgrade in memory before replacing
  live data. Fault injection covers every version boundary, byte-for-byte rollback,
  retry, old-version corpus, future schemas, recovery failure, and partial run-session
  adoption.
- **R4 implementation complete — 14 July 2026** on `codex/beta-integrity-migrations`.
  JSON and CSV now use one text-export service with three honest adapters: Android's
  Storage Access Framework, the browser file picker, and a clearly-labelled download
  fallback. Android reports saved/cancelled/error only after the selected Uri write;
  bridge inputs and callback scripts are validated. JSON refuses to claim completeness
  if any IndexedDB route cannot be read/preserved. CSV keeps archived activation keys,
  multiple same-day sessions, metadata-only days, and RFC 4180 user text. Local evidence:
  801/801 JS tests plus Android JVM tests, lint, and debug APK assembly. Physical-device
  save/cancel/overwrite/reimport evidence remains the `[You]` checklist in
  `docs/android-export-device-checklist.md`.
- **R5 implementation complete — 14 July 2026** on `codex/beta-integrity-migrations`.
  One reusable required-verification workflow now owns locked dependency install,
  JavaScript syntax/type/precache/policy/unit/smoke checks, required Playwright Chromium
  journeys, and Android JVM/lint/debug-APK checks. Pages deployment and signed Android
  artifact jobs both depend on that complete workflow. Browser checks use an exact pinned
  Playwright dependency and fail instead of skipping when required. A repository policy
  test plus failure injection prevents any required command or artifact dependency from
  being silently removed. Local evidence: 808/808 JS tests, all three real-browser
  journeys, Android unit/lint/assemble, and workflow-policy checks green. `[You]` still
  owns branch-protection configuration after merge.
- **R6 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  Onboarding now persists canonical fitness goal, experience, equipment tier, and the
  tier-derived equipment map. Recommendation cards disclose both their real difficulty
  and why an adjacent level is being offered. The complete goal/level/tier matrix is
  unit-tested and a fresh-install Chromium journey proves Strength + Beginner + Home
  basics survive finish into stored Settings.
- **R7 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  One program-aware phase resolver now uses the active program's authored modifier and
  explicit deload state across Home, briefing, detail/timeline, analytics, notifications,
  weekly review, and Hybrid Score. Neutral fallback is “Training”; feature code no longer
  reads the global phase-name table. Cross-consumer and catalog/deload regressions pass.
- **R8 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  One completion policy now compares the logged working sets and run against the same
  program prescription the cockpit renders. Empty, partial, skipped, modified, swapped,
  run-only, hybrid, full, and rest outcomes are covered. Partial work stays in history but
  cannot emit completion language, XP/recap, or completed-session coaching; Chromium
  verifies the real finish dialog says “Save partial session” after one logged set.
- **R9 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  The run-type parser is pure and ordered: repetition structure wins over incidental
  recovery/pace words, so `6×800m (90s recovery)` is Intervals. All 73 unique non-rest
  catalog prescriptions are exercised, and unknown copy receives only a neutral
  Run/Training label rather than a fabricated intensity.
- **R10 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  A shared modal/sheet stack owns inert/aria-modal state, background isolation, scroll
  lock, focus entry/trapping/restoration, Escape, browser history, Android Back, stacking,
  blocking dialogs, and reduced motion. All 18 static surfaces plus dynamic confirmation,
  activation, sync, migration, and celebration overlays use it. Required mobile Chromium
  checks prove the lifecycle and Android unit/lint/APK gates pass. Physical TalkBack remains
  the explicit `[You]` release artifact in `docs/android-accessibility-device-checklist.md`.
- **R11 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  Semantic secondary-copy tokens now meet WCAG AA in dark and light themes, and primary
  onboarding, Home, navigation, Programs, workout, Profile, and Settings controls expose
  44px targets without widening the page. A required real-Chromium contract covers
  320/360/390/412px, 200% text, contrast, target geometry, and horizontal overflow. The
  same pass fixed the visible-but-inert sign-in screen by putting auth on the shared modal
  lifecycle; the browser journey proves typing, account-tab switching, close, and focus
  restoration above onboarding. Physical touch review remains the explicit `[You]`
  artifact in `docs/android-ergonomics-device-checklist.md`.
- **R12 complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  Pull-Up, Chin-Up, Dip, and Push-Up set rows now expose Bodyweight / Weighted /
  Assisted directly, default a first blank bodyweight movement honestly, and retain
  the fine-grained band selector in set options. Assistance is subtracted from body
  mass to produce effective moved load instead of being counted as positive load.
  The former cryptic set-number target is now a keyboard-focusable, visibly labelled
  `Log S1` shortcut. Pure variant/semantics/render tests plus a real 360px Chromium
  journey prove that a first-tap bodyweight set persists completion, mode, bodyweight,
  and a positive effective load without opening overflow.
- **R13 implementation complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  Readiness now returns an explicit confidence band, input count, named evidence,
  time scope, excluded stale/future/invalid inputs, and a deterministic attribution
  trace. One signal remains a low-confidence estimate and two remain developing;
  only three or more current signals can unlock PR, time-trial, push, back-off, or
  readiness-driven risk language. Home, Recovery, morning briefing, coach Q&A,
  verdicts, evidence, and risk consumers use that contract. Missing, sparse, stale,
  future-dated, outlier, normalized-weight, and copy regressions keep a single input
  from presenting as authoritative coaching.
- **R19 complete — 14 July 2026** on `codex/core-loop-truth-accessibility`.
  Program resolution now fails closed for unknown, deleted, or structurally corrupt IDs
  instead of substituting Hybrid Engine. Startup routes the athlete to Programs without
  mutating the stored ID or weeks; an explicit recovery banner says history is safe and
  offers the catalog or a new custom plan. Exact, missing, corrupt, and ID-shadow fixtures
  prove replacement occurs only through the normal confirmed activation flow.

- **R14 implementation complete (engineering) — 14 July 2026**, merged via PR #134 from
  `claude/helyx-r14-health-connect-9vw5k8`. One supported-field contract now
  governs Health Connect end to end. `js/health/health-fields.js` and the mirrored
  `android/.../HealthFieldContract.kt` define exactly four fields with a real path —
  Steps, Resting HR, HRV, Sleep — using one shared id vocabulary. The Settings
  selection (`syncFields`) is the ONLY thing that drives permissions and reads:
  `requestHealthPermissions`/`readHealthDataByDay` pass the selected field ids, the
  native side maps them to exactly those Health Connect permissions (+ History) and
  reads only the selected-and-granted record types, and `applyHealthDays` writes only
  selected fields. Each sync records honest per-field status (granted / permission
  needed / read error / no data / off) surfaced next to each toggle; connect distinguishes
  all-denied (`permissions-denied`, stays disconnected) from no-data. The fake VO₂ max
  toggle, dashboard tile, profile card and marketing copy were removed (no ingestion
  path); legacy `vo2max`/unsupported keys are dropped by `normalizeSyncFields` while
  stored history is preserved. The manifest now declares exactly the four field
  permissions + `READ_HEALTH_DATA_HISTORY` (added HRV + history, removed Weight/Exercise/
  HeartRate/ActiveCalories); the unused over-broad `readHealthData`/`fetchAll` native
  path was deleted. Evidence: 881 JS tests (new `tests/health_fields.test.js` +
  extended `tests/health_bridge.test.js` cover field-filtering, per-field status,
  grant/deny/revoke/no-data/partial-error), `npm run verify`, `npm run smoke`, and the
  required Playwright browser checks pass locally; `android/.../HealthFieldContractTest.kt`
  covers the native mapping. The required GitHub verification workflow, including the
  Android gate, passed before merge.
  Physical grant/deny/revoke/no-data/partial-error device evidence remains the `[You]`
  matrix in `docs/android-health-connect-device-checklist.md`.
- **R16 (part 1 of 2) — bridge escaping centralized — 14 July 2026**, merged via PR #135 from
  `claude/helyx-r16-runtime-bridge-security`. Every native→JS `evaluateJavascript`
  callback now goes through ONE escaping API: `BridgeSafe.callbackScript(registry, id,
  payload)` builds the canonical resolve-then-delete script, validating the callback id
  (conservative alphabet) and the registry, and emitting the payload via
  `BridgeSafe.javascriptString` (double-quoted, escaping quotes/backslashes/control
  chars/U+2028/U+2029). `HybridHealthBridge.resolveCallback` (previously an un-validated
  id + ad-hoc `\`/`'`-only escape), `GpsBridge`, and `NotifyBridge` now use it, and
  `ExportSafe.callbackScript` delegates to it (its private duplicate escaper deleted). The
  escaping algorithm was proven injection-safe against hostile payloads/ids/registries via
  a Node port; `BridgeSafeTest` gains matching JVM cases (JS-string escaping, U+2028/2029,
  breakout payloads, hostile id/registry). JS suite (884), typecheck, smoke green (no JS
  changed). The required GitHub verification workflow, including the Android gate, passed
  before merge. Part 2 is also merged via PR #136.

- **R27 complete — 14 July 2026**, merged via PR #137 from
  `claude/helyx-r27-fit-import-contract`. FIT
  import now has an honest field contract. The extraction is a pure, exported
  `extractSessionStats` (js/garmin.js) using EXACT FIT keys with range validation:
  aerobic Training Effect comes from `total_training_effect` and anaerobic from
  `total_anaerobic_training_effect` — the old `getStat` substring match let one
  capture the other's value (both contain `training_effect`), and mis-stored the
  anaerobic reading in a field literally named `aerobicTE` while the UI labelled it
  "Anaerobic TE". That field is renamed `anaerobicTE` (consumers read the legacy
  `aerobicTE` as a fallback; RICH_FIELDS keeps both so old sessions round-trip).
  Missing/out-of-range/non-numeric values now validate to null instead of masquerading
  as a real `0`. Import success is claimed ONLY after the destination save resolves:
  `extractData` awaits `onDataExtracted`, and the app.js run/gym callbacks return
  true/false (wrapping the save in try/catch) so a failed or thrown write shows
  "Import failed — nothing was saved" instead of "Imported ✓". Evidence:
  `tests/garmin_fit_contract.test.js` (12 cases: aerobic/anaerobic non-conflation,
  range/type validation, multi-session, malformed, semicircle GPS conversion, HR
  fallback, gym sets, and save success/false/throw/no-session gating); 896 JS tests,
  typecheck, smoke, verify, and required browser checks green. No Android changes.
- **R16 (part 2 of 2) — runtime JS vendored, CSP tightened — 14 July 2026**, merged via
  PR #136 from
  `claude/helyx-r16-vendor-runtime-js`. All production runtime JS is now vendored into
  the signed bundle and served from `'self'`: `js/vendor/supabase-js-2.45.4.umd.js` (the
  exact npm UMD — its SHA-384 still matches the former CDN SRI pin) and
  `js/vendor/sentry-browser-8.55.0.min.js` (built from the pinned `@sentry/browser` via
  `scripts/vendor-runtime.mjs`, exposing `window.Sentry` init + captureException). The
  remote `<script src="cdn.jsdelivr.net/…">` tags are gone — notably the Sentry one had
  **no SRI**, so it was genuinely mutable remote code in the privileged origin. CSP is
  tightened to `script-src 'self'` and jsdelivr is dropped from `connect-src`; the vendored
  files are added to the SW precache so an offline launch has them locally. Evidence: a real
  Chromium load confirms both vendored globals execute and **zero remote `.js` is requested**;
  `tests/csp_vendored_runtime.test.js` asserts no remote `<script src>`, `script-src 'self'`,
  the Supabase SRI match, and that the Sentry bundle exposes its API; 889 JS tests, typecheck,
  smoke, and the required browser checks pass. Part 1 (bridge-escaping centralization) is
  PR #135. Fonts remain a remote stylesheet (non-executable, degrade to system font offline)
  and are out of this JS-focused slice.
- **R17 (import safety core) — 14 July 2026**, merged via PR #138 from
  `claude/helyx-r17-safe-import`. A JSON
  import can no longer overwrite live data with a malformed file or smuggle hostile markup.
  New pure `js/state/import-validate.js` deep-validates a parsed snapshot BEFORE anything
  replaces state — types of `currentWeek`/`weeks`/`customPrograms`/`bodyWeightLog`/`settings`,
  non-empty valid weeks, a 25 MB size cap, and future-schema refusal — returning a
  discriminated result so `triggerEngineImport` refuses cleanly (current state untouched,
  reassuring copy) and reports **accurate counts** (weeks · programs · runs) on success.
  `sanitizeImportedState` strips an unsafe `avatarDataUrl` at the import boundary
  (`isSafeImageDataUrl` allowlists only `data:image/*;base64` ≤3 MB), losslessly for real
  avatars. The avatar render path (`settings.js _refreshAvatar`) was rebuilt to set
  `img.src` as a DOM property instead of interpolating the URL into an `innerHTML`
  string — the previous attribute-breakout XSS sink in the privileged WebView origin — and
  the profile hero name is now `_esc`-escaped (`athlete-profile.js`). Evidence:
  `tests/import_validate.test.js` (11 cases: non-object/malformed/wrong-type/future-schema/
  oversize rejection, accurate counts, avatar allow/deny + sanitize non-mutation, honest
  copy); 912 JS tests, typecheck, smoke, and required browser checks green. This slice also
  made `scripts/core-ergonomics-check.mjs` weekday-independent (it now selects a deterministic
  bodyweight day instead of relying on today, which was a latent Rest-day flake). At merge,
  this covered the avatar/name security core; the completion entry below closes the remaining
  imported-string render paths and pre-import preview. No Android changes.
- **R17 follow-ups + R18 activation continuity complete — 16 July 2026** on
  `codex/activation-import-continuity`. Settings now routes the real JSON import path
  through nested week/custom-program validation, migration in memory, and an explicit
  preview showing logged-day/run/custom-program/body-weight/route counts before any write.
  Cancel leaves storage untouched; confirm creates the local undo backup before replacement.
  Imported profile, celebration, custom-program, day-preview, exercise and strength-chart
  strings are escaped at their HTML boundaries, while imported inline colours are allowlisted.
  Program changes now detect timers and edited/completed drafts and require an explicit
  **Save workout and switch / Discard this workout and switch / Cancel** decision. Each
  activation records paused/resumed status and its last program week; Previous program runs
  are visible under Active Plan, can open exact activation-scoped Activities, and can be
  resumed without reusing another run's numeric week slots or changing historical
  attribution. Evidence: nested-invalid/markup/preview fixtures plus switch, cancel,
  discard, archive, history-filter and repeated-resume tests; `npm run verify` is green with
  995 tests and every required Chromium check passes. No Android changes.
- **R15 GPS reliability implementation complete — 16 July 2026** across
  `codex/gps-durable-session` and `codex/gps-route-quality`. Android journals active-run
  metadata and raw fixes in app-private storage before accepting them into memory, restores a
  supported process-death session explicitly paused at its last durable fix, retains finalizing
  data until JS acknowledges both route and state persistence, and requires explicit discard for
  damaged recovery. One deterministic web/native point pipeline now rejects invalid, poor-
  accuracy, jitter, out-of-order and teleport fixes, applies a stricter walk-speed ceiling, and
  starts a zero-distance segment after pause or long gaps. Completed activities and portable v4
  route records retain a sanitized raw-vs-filtered audit (confidence, accepted/rejected counts,
  distance removed, accuracy and breaks), visible under Activity Breakdown. JVM journal tests
  cover atomic state, partial-tail recovery, corruption and bounds; JS fixtures cover live/native
  replay, recovery equivalence, poor accuracy, teleport continuation, pause/gap segmentation,
  audit validation and v2/v3/v4 portability. `npm run verify` (962 tests) and all required browser
  checks pass. PR Android CI plus the supplied physical minimum/current-device matrix remain
  release evidence, not unfinished product code.
- **Activity-history safety quick win implemented — 16 July 2026** on
  `codex/gps-route-quality`. Home and Profile now open one full-screen Activities
  history where strength and every same-day run are separate records. Exact activity
  details reuse the complete set/split/map breakdown; deleting a run cannot remove a
  sibling run or strength work, deleting strength preserves runs/body weight, and a
  10-second Undo precedes exact route removal. Populated In Focus bars now route by their
  real calendar date: one activity opens its complete detail directly, while strength +
  run or multiple same-day runs open the date-filtered chooser without guessing. Empty and
  future bars do not navigate. The former whole-day profile modal and duplicate graph-summary
  modal plus their dead helpers/styles were removed. The required mobile browser contract
  proves exact bar-to-activity navigation, separate same-day rows, 320–412px fit, 44px core
  targets and 200% text.
- **Schedule-flexible program logging quick win implemented — 16 July 2026** on
  `codex/gps-route-quality`. Home now offers a current-week workout picker so an athlete can
  intentionally start any programmed session today. The log preserves two truths: the source
  program day still owns prescription/completion/progression, while the stamped date owns
  calendar history. The cockpit states “scheduled Monday · logged Tuesday”; Strength Insights
  shows Tuesday as the performed day but names/opens Monday's actual workout instead of
  Tuesday's plan. Analytics leaves opened from Home now return Home, while leaves opened from
  the Insights hub still return to that hub.
- **Independent strength sessions + document consolidation implemented — 16 July 2026** on
  `codex/gps-route-quality`. Empty Workout and Copy Past Workout now create stable, non-program
  strength-session records; copied values remain editable/incomplete, programmed completion is
  untouched, same-day sessions count independently, and each receives its own history/detail/
  delete identity. The roadmap now owns product rules, direction, status, and release gates;
  dated audit/progress/launch-checklist files were removed. Five physical Android matrices remain
  as executable evidence forms, not parallel status trackers.

## Prioritization model

Priority is based on severity, likelihood, user trust, launch dependency, and blast radius. Effort is a delivery estimate for one experienced product engineer with review, not elapsed calendar time. Each item includes the evidence required for completion; code existing or a happy-path manual check is not sufficient.

## Current execution focus

Completed recommendations remain in the implementation register and phase tables as
acceptance evidence; they are not the active queue. R17 and R18 are engineering-complete.
The active launch item is **R15 release evidence**: required Android JVM/lint/APK checks must
pass, then the owner completes `docs/android-gps-device-checklist.md`; failures return to R15
before beta.

In parallel, complete the human-owned device and release evidence below. Phase 3 work
(R20–R26) remains deferred until the public-beta gate is satisfied; R24 additionally
requires production telemetry.

## Consolidated recommendation register

The phase tables below provide severity, expected user benefit, effort, implementation risk, dependencies, acceptance criteria, and definition of done. This index supplies the remaining required fields: product area, confirmed problem/evidence, proposed change, expected modules, tests, phase, and PR boundary.

| ID | Product area | Confirmed problem and evidence | Proposed change | Expected files/modules | Tests required | Phase / PR |
|---|---|---|---|---|---|---|
| R1 | Dates/data integrity | `js/brain/streak.js:isoOffset` and raw UTC day producers shift local days; three `streak_freeze` tests fail in Sydney. | Enforce one local calendar-key API; keep timestamps separately. | `js/dates.js`, streak, onboarding, score/recovery/home/settings writers, date tests. | Offset/DST/day-boundary unit and browser persistence tests. | Phase 0 / PR-1 `codex/beta-integrity-dates`. |
| R2 | Runs/routes | `weeks[week].runs[day]`, route upsert, and legacy export keys collapse valid sessions; GPS clears start time too early. | Add stable session IDs, migrate IDB/state, and preserve all sessions. | `run-logger.js`, `gps-tracker.js`, `db.js`, route portability, migrations, analytics. | Multi-run, legacy migration, reload, analytics, export/import round trips. | Phase 0 / PR-2 `codex/beta-integrity-sessions`. |
| R3 | State migrations | `migrateState` catches failure then stamps current schema. | Transactional one-step migration runner with validation, rollback, and retry. | `js/state/migrations.js`, startup/recovery UI, migration fixtures. | Fault injection at every step, idempotence, old-version corpus. | Phase 0 / PR-3 `codex/beta-integrity-migrations`. |
| R4 | Portability/Android | Web emits `blob:` exports; `MainActivity.handleDownload` does not handle them; CSV drops archived keys. | One export service with web/native adapters and complete versioned payload. | Settings, import/export, route portability, `MainActivity.kt`/`HybridHealthBridge.kt`. | CSV escaping/archive, large JSON, emulator/device save/cancel/reimport. | Phase 0 / PR-4 `codex/beta-integrity-export`. |
| R5 | CI/release | Pages/release workflows do not depend on JS/Android verification; browser scripts skip without Playwright. | Reusable required verification workflow and gated publication. | `package.json`, browser scripts, `.github/workflows/*.yml`. | Intentional failure blocks artifacts; green workflow produces them. | Phase 0 / PR-5 `codex/beta-integrity-ci`. |
| R6 | Onboarding | `_finish` omits durable goal and tier-derived equipment map; beginner recommendation hides Intermediate level. | Persist canonical choices and disclose recommendation stretch. | `js/onboarding.js`, starter recommendations, settings/equipment helpers. | Goal/tier/level matrix and browser finish-state tests. | Phase 1 / separate PR `codex/onboarding-truth`. |
| R7 | Programs/Home/Brain | Global `WEEK_PHASE_NAMES` is used irrespective of the active program. | Central modifier-aware phase resolver with honest fallback. | Home, app/briefing, timeline/detail, Hybrid Score, program helper. | Cross-catalog phase/deload and consumer-consistency tests. | Phase 1 / separate PR `codex/program-phase-resolver`. |
| R8 | Workout/adherence | Finish modal celebrates one set/no run while analytics use stricter completion predicates. | One completion policy; distinct partial-save and full-complete outcomes. | `js/workout.js`, completion helpers, streak/adherence/Brain. | Empty/partial/skipped/modified/full session behavior tests. | Phase 1 / separate PR `codex/workout-completion-policy`. |
| R9 | Running UX | `_detectRunType` checks “recovery” before interval structure. | Ordered/structured classifier with safe unknown fallback. | `js/workout.js` or a pure run-prescription helper. | Full catalog text fixture and regression case. | Phase 1 / small PR `codex/run-type-classifier`. |
| R10 | Accessibility/navigation | Closed sheets retain focusable descendants/modal semantics. | Shared modal/sheet stack with inert, focus, escape, restore, and Android back. | Index markup, modal/sheet controllers, CSS, Android back integration. | Keyboard, focus-order, axe, TalkBack, Android back tests. | Phase 1 / staged PRs `codex/accessible-modal-core` then migrations. |
| R11 | Mobile UI/design | Core controls are frequently below 44px and secondary type is very small. | Shared touch/type/contrast tokens, applied to core journeys. | Core CSS, onboarding, Home, Programs, workout, Settings. | Geometry/contrast/200%-text viewport matrix. | Phase 1 / per-journey PRs after R10. |
| R12 | Workout logger | Bodyweight mode and quick-log behavior are hidden. | Direct Bodyweight/Weighted choice and labelled shortcut. | Workout set-row renderer/model and exercise metadata. | Bodyweight/weighted/assisted behavior + accessibility tests. | Phase 1 / small PR `codex/bodyweight-entry`. |
| R13 | Analytics/Brain | Readiness renormalizes sparse inputs; PR/time-trial advice lacks specific evidence. | Return confidence/input/evidence/scope and gate copy. | readiness scoring, recommendations, views, dev attribution. | Missing/stale/outlier scenario and copy golden tests. | Phase 2 / `codex/readiness-confidence`. |
| R14 | Health Connect/privacy | Settings selections do not filter permission/request/apply paths; shown/native types diverge. | One supported-field contract from settings to native result. | health bridge JS, Settings, `HybridHealthBridge.kt`, manifest, worker. | Grant/deny/revoke/no-data/partial-error device matrix. | Phase 2 / `codex/health-connect-contract`. |
| R15 | Android GPS | `GpsPointStore` was process memory and filtering lacked a teleport-quality model. | Durable active-session journal, explicit restore/discard UX, shared web/native outlier filtering, portable raw/filtered audit. | GPS service/store/bridge, JS tracker, route model, Activity Breakdown. | JVM journal recovery/corruption; deterministic replay/teleport/accuracy/gap fixtures; required PR Android CI; owner device matrix. | Engineering complete on `codex/gps-route-quality`; PR CI + `[You]` device evidence pending. |
| R16 | Security/build | Remote runtime JS shares the trusted appassets page; bridge escaping is inconsistent. | Vendor runtime JS/narrow CSP and centralize all evaluate-JS escaping. | HTML/CSP/staging, vendor assets, Android bridges/`BridgeSafe`. | Offline/no-remote-request, CSP, malicious-string, reproducible-build tests. | Phase 2 / separate security PRs. |
| R17 | Import/security | `isAppState` is shallow and imported name/avatar content reaches HTML-building paths. | In-memory schema validation/migration/preview and safe DOM properties. | import/export, migrations, settings/avatar, celebration. | Invalid/future/fuzz/oversize/markup/rollback fixtures. | Phase 2 / `codex/safe-import`. |
| R18 | Program activation | Mid-session switching can archive partial work; prior activation cannot be resumed. | Resolve session first and expose prior activation history/resume semantics. | activation UI/state, program detail/library, workout completion. | Switch/resume/history scenarios across partial/full states. | Phase 2 / `codex/activation-continuity`. |
| R19 | Program integrity | Unknown IDs silently fall back to Hybrid Engine. | Validate ID and show explicit recovery choices. | program registry/state load/import UI. | Missing/deleted/corrupt program fixtures. | Phase 2 / small PR with R17 or standalone. |
| R20 | Program schema | Shared weekly targets/free-text cannot represent marketed prescriptions. | Legacy-compatible normalized prescription resolver and structured overrides. | schema, engine, builder, catalog adapters, preview/detail/workout. | Catalog golden corpus, consumer equality, custom round trip. | Phase 3 / design ADR then multiple PRs. |
| R21 | Exercise progression | `computeDiagnosticForLift` only checks prior numeric weeks/same day. | Chronological all-session exercise query with explicit scope. | engine/history query, activation/session records, progression tests. | Cross-day/program/archive/exercise-identity cases. | Phase 3 / after R2, preferably after resolver contract. |
| R22 | Analytics maintenance | Duplicate model exports can drift; “lifetime” scope is active-run-only. | One supported model per metric and scope-correct labels/queries. | metrics-load/readiness re-exports, strength calculations/views. | Golden formula and all-activation history tests. | Phase 3 / `codex/analytics-consolidation`. |
| R23 | Running analytics | Broad best-run VDOT selection lacks effort and robust quality confidence. | Qualify source efforts, reject outliers, expose projection confidence. | running performance/projection modules, import/GPS quality metadata. | Race/easy/interval/manual/outlier/sparse-history fixtures. | Phase 3 / after R15 data quality. |
| R24 | Persistence/sync scale | Critical saves serialize/upsert lifetime history as one blob. | Incrementally store immutable sessions while retaining versioned snapshot portability. | state repositories, Supabase schema/RLS, offline queue, migrations/export. | Dual-read/write, rollback, RLS, conflicts, large-history perf. | Phase 3 / dedicated ADR and multi-PR migration, only with telemetry. |
| R25 | Maintainability/design | Large cross-cutting modules plus inline styles/`!important` raise regression cost. | Split along tested seams and migrate touched UI to primitives. | workout/app/settings/state and CSS/components. | Pre-split behavior coverage and visual regression. | Phase 3 / small per-seam PRs, never a mechanical rewrite. |
| R26 | Product hierarchy | Program taxonomy and optional advanced/wellness surfaces repeat/compete with the core loop. | Simplify discovery and progressively disclose unused advanced areas based on beta evidence. | program library/Home/Start/navigation renderers. | Funnel/usability study plus no-regression discovery tests. | Phase 3 / product-evidence-led PRs. |
| R27 | FIT import | `js/garmin.js:extractData` fills `aerobicTE` from anaerobic fields and shows success before the write callback completes. | Correct the field contract, validate parsed units/types, and make callbacks return an awaited save result before success. | `js/garmin.js`, import callbacks in `js/app.js`, FIT fixtures. | Real/anonymized run+gym FIT fixtures, malformed/multi-session files, save failure, unit/field assertions. | Phase 2 / small PR `codex/fit-import-contract`. |

## Phase 0 — Public-beta integrity gate

**Scope/relative size:** large, roughly 3–5 engineer weeks including migration and device evidence.  
**Expected modules:** date producers, state/route migrations, run logger/GPS/IndexedDB, portability/Android file bridge, package/CI workflows.  
**PR boundary:** five sequential reviewable PRs on short-lived `codex/beta-integrity-*` branches; each must be independently green, and release remains blocked until all five are merged and the combined compatibility suite passes.

| ID | Recommendation | Severity | User value | Effort | Delivery risk | Dependencies | Validation evidence | Done when |
|---|---|---|---|---:|---|---|---|---|
| R1 | Replace state-writing raw UTC day strings with one canonical local-day API; retain UTC event timestamps separately. | Blocker | Prevents workouts, weigh-ins, streaks, and scores landing on the wrong day. | 3–5 days | Medium: broad date surface. | Inventory of day-key producers; fixture clock/timezone helper. | Tests in UTC-12, UTC, Sydney, UTC+14, DST transitions, Sunday/Monday; current three failures become green; browser record on 14 July stores 14 July. | No state-writing path constructs a day key via `toISOString`; all required suites pass across timezone matrix. |
| R2 | Add stable workout/run `sessionId`; key routes by session; migrate legacy records; fix GPS `startTs`; preserve multiple runs/day and activations. | Blocker | Stops silent run/route replacement and makes exports complete. | 5–8 days | High: state + IndexedDB + native boundary. | Versioned route schema; legacy deterministic ID design; export changes. | Two same-day runs (manual + GPS) persist independently across reload; route counts/geometry/timestamps survive legacy migration and export/import; analytics counts both. | State, IDB, GPS, manual entry, analytics, and portability use the same session identity without fallback collapse. |
| R3 | Make migration execution transactional, validated, idempotent, and retryable; retain last good state on failure. | Blocker | Prevents partial upgrades from becoming permanently marked current. | 3–5 days | High: startup/data safety. | Clone/validation utilities; recovery UI/copy. | Fault injection at every migration step; original bytes/version remain recoverable; retry succeeds; old fixture corpus reaches current schema. | Version advances only after a validated step and no caught failure can stamp `CURRENT_SCHEMA_VERSION`. |
| R4 | Create one portability service with web and Android file adapters; include archived weeks and every route; correctly escape CSV. | Blocker | Gives Android users a real, complete backup and migration path. | 4–6 days | Medium: WebView/file-provider UX. | R2 route format; native save/share contract. | Android emulator + physical device save/cancel/overwrite checks; clear app data then reimport; CSV parser round trip with commas, quotes, line breaks, archives. | Success is shown only after a platform-confirmed file operation, and exported counts match stored counts. |
| R5 | Gate Pages and signed Android publication on JS verify plus Android unit/lint/assemble; make skipped browser checks fail when required. | Blocker | Prevents a known-broken build from reaching users. | 2–3 days | Low–Medium: workflow changes. | Declared Playwright/browser dependency or explicit optional split; reusable workflow design. | Injected failing test/lint blocks deploy/sign/upload; green run produces expected artifacts; branch protection requires checks. | No production deployment or signed artifact job can execute without all required upstream checks succeeding. |

**Phase 0 exit gate:** R1–R5 complete, full suite green, Android export/device evidence attached, and no unresolved blocker in this roadmap.

## Phase 1 — Core-loop truth and accessibility

**Scope/relative size:** medium–large, roughly 3–4 engineer weeks.  
**Expected modules:** onboarding/settings, program phase consumers, workout completion/set-row UI, modal controllers, core CSS.  
**PR boundary:** separate product-semantic PRs for onboarding, phase, completion, modal core, then small screen migrations; do not mix CSS-wide cleanup with behavior changes.

| ID | Recommendation | Severity | User value | Effort | Delivery risk | Dependencies | Validation evidence | Done when |
|---|---|---|---|---:|---|---|---|---|
| R6 | Persist onboarding goal and a tier-derived equipment map; disclose adjacent difficulty recommendations. | Significant | Ensures recommendations and substitutions reflect what the user selected. | 2–3 days | Low | Canonical settings enums and equipment mapper. | Parameterized onboarding tests for all goals/tiers/levels; browser inspection of resulting Settings and recommendations. | Finish-state settings exactly match selections and every adjacent-level recommendation is labelled/explained. |
| R7 | Replace global phase names with a program-aware phase resolver consumed by Home, briefing, detail, and Hybrid Score. | Significant | Makes plan labels and deload advice truthful. | 3–4 days | Medium: multiple consumers. | Defined fallback for programs without semantic phase labels. | Cross-catalog tests for normal/deload weeks; snapshot/model equality across consumers; no direct `WEEK_PHASE_NAMES` use in feature views. | One resolver supplies phase metadata and score reweighting uses the actual modifier. |
| R8 | Define a session completion policy and separate “save partial” from “complete”; align celebration, streak, adherence, and analytics. | Significant | Restores meaning to completion and avoids penalizing saved partial work. | 3–5 days | Medium: product policy. | Product decision for required run/set threshold and intentional skips. | Tests for empty, partial, skipped, modified, and full sessions; browser copy and analytics agree. | Every completion consumer uses the same policy object and partial work never receives full-completion language. |
| R9 | Correct run-type parsing with ordered structured detection and catalog fixtures. | Significant | Prevents interval sessions being presented as recovery. | 1 day | Low | Prescription text corpus. | Every catalog run description classified in a reviewed fixture; `6×800m (90s recovery)` is Intervals. | Classifier order is tested and unknown text falls back without a false specific type. |
| R10 | Implement one accessible modal/sheet stack with inert background, focus management, Escape, Android back, and reduced motion. | Significant | Makes core flows usable with keyboard/TalkBack and prevents invisible focus traps. | 5–8 days | Medium–High: many surfaces. | Shared controller; modal inventory. | Automated axe/focus tests; closed dialogs have zero focusables/modal claims; keyboard + TalkBack journeys; back-stack tests. | Every dialog/sheet uses the primitive and the core journeys pass the accessibility matrix. |
| R11 | Raise primary touch targets/type/contrast on onboarding, Home, Programs, workout, and Settings. | Significant | Reduces missed taps and improves readability under mobile scaling. | 4–6 days | Medium: layout regressions. | Tokens/mixins; core-screen inventory. | Geometry checks at 320/360/390/412 widths and 200% text; WCAG contrast report; physical-device touch review. | Primary controls meet 44×44 targets or spacing equivalence, body copy is readable, and no new overflow appears. |
| R12 | Make bodyweight/weighted mode explicit and label the set quick-log affordance. | Moderate | Removes friction from common bodyweight exercises. | 1–2 days | Low | Exercise-mode metadata/default policy. | Pull-Up, Dip, assisted/weighted variants; keyboard/TalkBack labels; repeat-set quick logging. | A first-time user can log a bodyweight set without opening overflow and all modes preserve correct load semantics. |

**Phase 1 exit gate:** first-run → select plan → complete/partially save workout → inspect progress → export is truthful and keyboard/TalkBack operable.

## Phase 2 — Evidence-honest coaching and platform reliability

**Scope/relative size:** large, roughly 5–8 engineer weeks plus physical-device validation.  
**Expected modules:** readiness/recommendations, Health bridge/manifest/worker, GPS service/store/tracker, CSP/vendor staging, import/activation recovery.  
**PR boundary:** one ADR/contract per platform area, then independent Health, GPS, security, import, and activation branches. GPS persistence requires its own migration review.

| ID | Recommendation | Severity | User value | Effort | Delivery risk | Dependencies | Validation evidence | Done when |
|---|---|---|---|---:|---|---|---|---|
| R13 | Return confidence, input count, evidence, and scope from readiness; gate PR/time-trial/back-off advice on specific evidence. | Significant | Prevents authoritative coaching from sparse or unrelated data. | 4–6 days | Medium: copy/model behavior. | One primary readiness model; agreed confidence bands. | Property tests for missing signals; reviewed scenarios; no high-certainty copy with one input; recommendation attribution visible in dev trace. | UI and advice select copy from confidence/evidence, not score alone. |
| R14 | Make Health Connect field selections drive exact permissions, readers, accepted fields, and per-field sync status; remove unsupported toggles. | Significant | Makes privacy controls real and understandable. | 5–8 days | High: device/API-version matrix. | Manifest/manager contract; supported record inventory. | Minimum-supported and current Android behavior, Health Connect supported versions, allow/deny each field, revocation, no-data, partial error; Settings reflects result. | No permission/type is requested or read outside selected supported fields, and every shown toggle has an implemented path. |
| R15 | Persist active GPS points/session metadata outside process memory; recover after process/service restart; add outlier-quality model. | Significant | Reduces lost or inflated runs during screen lock/OEM pressure. | 8–12 days | High: native lifecycle. | R2 session identity; Room/file journal; recovery UX. | Instrumentation tests for service/process restart; forced kill device tests; teleport/poor-accuracy fixtures; raw vs filtered distance audit. | Active session survives supported restart cases or presents an explicit recover/discard state with no silent success. |
| R16 | Vendor all production runtime JS into the signed bundle, or enforce exact SRI/CSP; centralize bridge escaping including Health callbacks. | Significant | Reduces supply-chain and bridge-boundary risk. | 2–4 days | Low–Medium | Build/staging update; CSP tests. | Offline launch has no remote JS request; CSP/source scan; malicious callback/string fixtures; release hash reproducibility. | No mutable remote executable code can access the privileged origin and every evaluate-JS value uses one escaping API. |
| R17 | Validate/migrate imports in memory and render imported user content through safe DOM properties. | Moderate | Prevents malformed snapshots and stored markup from damaging state/UI. | 3–5 days | Medium | R3 migration runner; schema validator; size limits. | Fuzz/invalid fixtures, oversized avatar, markup names/notes, future schema, rollback after error. | Invalid imports never replace current state; preview counts are accurate; displayed imported text is not interpreted as markup. |
| R18 | Add an explicit prior-activation history/resume model and block unresolved mid-session program switches. | Moderate | Preserves continuity when users switch plans. | 4–6 days | Medium: product semantics. | R8 completion policy; activation metadata. | Switch with empty/partial/full session; resume/view old activation; history attribution remains unchanged. | Users choose save/discard/cancel before switch and can distinguish/view previous runs without data leakage. |
| R19 | Remove silent unknown-program fallback; validate IDs and surface recovery. | Moderate | Makes damaged state visible and recoverable. | 1–2 days | Low | Import/state validation. | Unknown/deleted custom ID fixtures; UI recovery choices; no mismatch between rendered program and stored ID. | Invalid IDs cannot silently render another plan. |
| R27 | Correct FIT training-effect mapping and make import success depend on an awaited destination save; validate parser output. | Moderate | Makes Garmin import labels and completion trustworthy. | 2–3 days | Medium: fixture/device variation. | Versioned import field contract; representative FIT fixtures. | Run/gym/malformed/multi-session files, unit checks, callback failure; success appears only after state/route save. | Imported fields match FIT semantics and no failed write is presented as imported. |

**Phase 2 exit gate:** coaching exposes uncertainty; Health/GPS/device integrations have device evidence; privileged runtime is self-contained.

## Phase 3 — Training model depth and scale

**Scope/relative size:** very large and incremental, 8–16+ engineer weeks; R24 proceeds only if beta telemetry justifies it.  
**Expected modules:** schema/engine/builder/catalog resolver, exercise history, analytics consolidation, running projections, state/cloud repositories, high-risk UI modules.  
**PR boundary:** approve an ADR before R20 or R24; land compatibility adapters and golden fixtures before changing stored formats or consumers; use small module-split/design-token PRs thereafter.

| ID | Recommendation | Severity | User value | Effort | Delivery risk | Dependencies | Validation evidence | Done when |
|---|---|---|---|---:|---|---|---|---|
| R20 | Add a normalized prescription resolver for per-lift/run structure while translating legacy bare strings/modifiers. | Significant | Enables trustworthy RPE/RIR/rest/tempo/ranges/supersets/intervals without breaking the catalog. | 10–15 days | High: 150+ consumers. | Resolver contract; fixture corpus; versioning plan. | Every catalog day resolves deterministically; detail/preview/cockpit equality tests; legacy snapshots unchanged; new structured custom-program round trip. | UI consumers read one resolved prescription API and structured overrides require no free-text parsing. |
| R21 | Query exercise history across dates/days/activations with explicit scope for progression, stalls, and ghost sets. | Significant | Keeps progression context when schedules/programs change. | 4–6 days | Medium: training-policy choice. | R2 session identity; canonical exercise key; R20 resolver helpful. | Same exercise moved across weekday/activation; archived history; duplicate names; scope tests; chronological tie handling. | Progression uses the most recent eligible performance by stamped date and clearly documented scope. |
| R22 | Consolidate duplicate readiness/load models and correct “lifetime” scope labels. | Moderate | Prevents formula drift and misleading achievements. | 3–5 days | Medium | R13 primary model and golden fixtures. | Golden metric fixtures; import/export history including archives; view copy tests. | One supported model per metric and every label matches the queried history scope. |
| R23 | Add race-effort/outlier confidence to VDOT and running projections. | Moderate | Prevents implausible projections from easy runs, bad GPS, or manual errors. | 3–5 days | Medium | R15 point quality; race/RPE metadata. | GPS outlier, easy long run, interval, race, manual edit, sparse history fixtures. | Projections show source effort/date/confidence and exclude failing-quality efforts. |
| R24 | Introduce session-oriented persistence/cloud records behind a backward-compatible snapshot/export boundary when beta telemetry justifies it. | Moderate | Reduces blob write amplification and enables safer conflict handling at scale. | 15–25 days | Very high: data migration/cloud/RLS. | R2 IDs, R3 migrations, R4 export, production telemetry, new RLS verification. | Dual-read/write migration, rollback, adversarial RLS, conflict simulations, offline queue, large-history perf, full snapshot round trip. | Immutable sessions sync without whole-history overwrite, legacy users migrate safely, and portable snapshots remain complete. |
| R25 | Split god modules along tested behavior seams and migrate touched UI to shared tokens/primitives. | Minor | Lowers regression cost and accelerates accessibility work. | Ongoing, 2–5 days/slice | Medium if done mechanically. | Behavior tests; R10/R11 primitives. | Coverage before/after, module-size/boundary checks, no visual regression in core viewport matrix. | Workout/state/settings concerns have explicit APIs; inline styles/`!important` trend down on each touched screen. |
| R26 | Simplify Programs and optional wellness hierarchy based on beta usage, without deleting data/features. | Moderate | Keeps users focused on plan → train → track. | 4–7 days | Medium: product discovery trade-off. | Beta event funnel and qualitative feedback. | A/B or moderated journey evidence; time-to-program/start-workout; no reduction in search success. | One primary recommendation/catalog path remains, duplicate taxonomy is removed, and unused wellness modules are progressively disclosed. |

## Human-owned validation and release items

These require the product owner/device/accounts and must not be simulated as complete:

- [ ] Confirm the Google Play Developer account, Play Console access, at least one physical
  Android test phone, and Supabase owner access are available.
- [ ] Run [`android-gps-device-checklist.md`](android-gps-device-checklist.md) on minimum/current
  phones and attach foreground/background/lock/process-kill plus raw-vs-filtered route evidence;
  prepare the Play foreground-service declaration and demonstration video.
- [ ] Grant, deny, and revoke each Health Connect permission on minimum/current supported
  Android versions; test notifications, resume, offline behavior, and capture Settings/result evidence.
- [ ] Complete the TalkBack, touch-target, Android system save/share, cancel, overwrite, and
  JSON reimport checklists on minimum/current supported devices.
- [ ] Deploy and verify the `delete-account` edge function so account deletion removes the
  authentication record as well as local/cloud user data.
- [ ] Have the privacy policy and terms reviewed, replace every placeholder, host them at public
  URLs, and complete the Play Data Safety form from `docs/legal/play-data-safety.md`.
- [ ] Produce final launcher/splash assets, phone screenshots, feature graphic, and store listing
  media only after the device matrices pass.
- [ ] Configure `main` branch protection so the required verification workflow cannot be bypassed.
- [ ] Produce the signed release through CI, upload it to Play internal testing, invite testers,
  triage Sentry findings, complete final QA/versioning, then promote to closed/public beta.
- [ ] Review coaching/health copy for product and legal positioning before store submission.

Engineering should provide exact checklists, fixtures, expected results, and build artifacts for each item.

## Session log

Newest first; keep entries short and link commits or checklists instead of repeating the
implementation register.

- 2026-07-16 · R17 follow-ups + R18 activation continuity on
  `codex/activation-import-continuity`: the live Settings import now validates nested state,
  migrates in memory and previews exact content/replacement risk before writing; imported
  profile/program/exercise/preview strings and inline colours are safe at render boundaries.
  Program switches/resumes now require save/discard/cancel for an unresolved workout, retain
  paused activation metadata, expose exact prior-run Activities, and restore only that run's
  archived weeks. `npm run verify` is green with 995 tests and all required Chromium journeys
  pass. · Next: open one draft PR to `main`; after CI/merge, complete the R15 Android device
  evidence before the public-beta gate.
- 2026-07-16 · PR #141 CI portability fix on `codex/gps-route-quality`: one-off strength
  sessions now derive their weekday and stored calendar date from the same explicit/device
  timezone, preventing disagreement around UTC date boundaries. Sydney and UTC regression
  fixtures cover the original failure. `npm run verify` is green with 978 tests. · Next:
  push the fix and confirm the required PR checks pass.
- 2026-07-16 · Independent strength sessions, product direction, and complete document
  consolidation on `codex/gps-route-quality`: Empty Workout and Copy Past Workout now use
  stable non-program records, preserve copied values as editable unchecked sets, keep program
  completion untouched, count multiple same-date strength sessions, and retain exact history/
  detail/delete identity. Added a personal-daily-driver → small-private-beta → public-product
  evidence gate. Folded enduring product rules and release status into this roadmap; removed
  superseded audits, progress archives, the duplicate launch checklist, and OS junk while
  retaining only current technical/legal references and five physical-device evidence forms.
  `npm run verify` is green with 977 tests, and every required Chromium journey passes at
  phone widths and 200% text. · Next: commit locally, then update draft PR #140 only after
  owner approval.
- 2026-07-16 · Flexible program-day logging + navigation truth on
  `codex/gps-route-quality`: added Home's current-week workout picker and explicit rescheduled
  cockpit context; retained program source day + actual calendar date through Strength Insights
  and exact activity navigation; Home deep-links now Back to Home instead of the Insights hub.
  Moved-workout, picker, source-slot and origin-route regressions added. `npm run verify`
  (972 tests) and every required Chromium journey are green. · Next: commit locally; after
  owner approval push both pending commits to draft PR #140. Empty/copy requires independent
  strength-session identity and remains the next scoped design/data slice.
- 2026-07-16 · In Focus activity navigation on `codex/gps-route-quality`: populated
  strength/running bars open Activities using the bar's stamped calendar date; a sole
  activity opens directly and multiple same-day sessions stay as a chooser. Empty/future
  bars remain non-interactive. Removed the obsolete graph workout-summary modal and its
  duplicate calculation/CSS path. `npm run verify` (965 tests) and the required real-browser
  suite, including exact previous-week bar → Strength Workout evidence, are green. · Next:
  push this commit to refresh draft PR #140 after owner approval.
- 2026-07-16 · R15 engineering completed on `codex/gps-route-quality`: shared web/native
  route-quality screening, honest pause/gap segmentation, compact run+route audit metadata,
  Activity Breakdown confidence detail, portable v4 route records with v2/v3 compatibility,
  deterministic recovery/outlier fixtures, and an exact minimum/current-device release matrix.
  `npm run verify` (962 tests) and required browser checks green; local Android Gradle is
  unavailable in this checkout, so required JVM/lint/APK evidence will come from PR CI. · Next:
  open the PR to `main`, then complete the owner device checklist before beta.
- 2026-07-16 · Garmin-inspired Activities history + repository cleanup on
  `codex/gps-route-quality`: separate strength and same-day run rows, dedicated full
  details (maps/splits/every set), exact type-safe deletion and 10-second Undo; Home
  calendar date filtering and Profile history entry points. Removed the obsolete
  whole-day detail path and dead CSS/helpers, archived superseded hardening/migration
  trackers, and removed OS junk. 945 tests, typecheck, smoke and required browser checks
  green. · Next: resume R15 route-quality/outlier integration from the preserved module.
- 2026-07-16 · R15 durable Android GPS foundation on `codex/gps-durable-session`:
  append-only/fsynced point journal, atomic metadata, explicit paused/finalizing/corrupt
  recovery, foreground-service redelivery, and two-phase JS save acknowledgement. Targeted
  JS contracts pass; Android JVM/assemble evidence is CI-only in this checkout. · Next: merge
  this foundation, add point-quality/outlier fixtures, and run the owner device matrix.
- 2026-07-16 · Product fixes and approved visual consistency pass: canonical 10/20/30 kg
  band loads, logged-day deletion, exact max/range workout prescriptions, goal-aware
  Training Score language/penalties, and the approved midnight-navy/cobalt/ice/burnt-orange
  system across core surfaces. Commits `ca514e0` through `a7e8840`; full JS/type/smoke and
  required mobile-browser gates green. · Next: validate on the Android beta build.
- 2026-07-16 · Reconciled the live roadmap with GitHub `main` after PRs #133–#138.
  Removed the shipped first-PR, priority-band, top-10, quick-win, and duplicate
  major-project queues and made this roadmap the sole product/status source. · Next: R15 durable GPS-session design and recovery slice while the owner
  progresses the device/release evidence.
- 2026-07-14 · R17 (import safety core) on `claude/helyx-r17-safe-import`. Deep in-memory
  import validation + sanitization (`js/state/import-validate.js`) so malformed/oversize/
  future-schema files are refused without replacing state and success shows accurate counts;
  hostile `avatarDataUrl` stripped at the boundary and the avatar render switched from an
  `innerHTML` `<img src>` string (attribute-breakout XSS) to a validated `img.src` property;
  profile hero name `_esc`-escaped. `tests/import_validate.test.js` (11 cases); 912 tests +
  browser checks green. Merged via PR #138. Follow-up: broader innerHTML-escaping audit +
  pre-import preview modal.
- 2026-07-14 · R27 FIT import contract on `claude/helyx-r27-fit-import-contract`. Exact-key
  validated FIT extraction (aerobic vs anaerobic TE no longer conflate; missing/out-of-range
  → null, not fake 0), mislabeled `aerobicTE`→`anaerobicTE` with back-compat, and success is
  claimed only after an awaited destination save (failed/thrown writes surface an error, not
  "Imported ✓"). Pure `extractSessionStats` extracted for fixture testing;
  `tests/garmin_fit_contract.test.js` (12 cases); 896 tests + verify + browser checks green.
  Merged via PR #137.
- 2026-07-14 · R16 (part 1) bridge-escaping centralization on
  `claude/helyx-r16-runtime-bridge-security`. All native→JS callback resolution now uses
  one `BridgeSafe.callbackScript`/`javascriptString` API (id+registry validated, payload
  robustly JS-escaped); Health/GPS/Notify/Export bridges routed through it, the ad-hoc
  Health escaper and ExportSafe's duplicate removed. Injection-safety proven via a Node
  port; `BridgeSafeTest` extended. JS suite/typecheck/smoke green; Android compile/tests
  are CI-only (no local SDK). Merged via PR #135 after required verification passed; part
  2 landed via PR #136.
- 2026-07-14 · R16 (part 2) runtime-JS vendoring on `claude/helyx-r16-vendor-runtime-js`.
  Supabase + Sentry vendored into `js/vendor/` (Supabase byte-identical to the SRI pin;
  Sentry built from the pinned npm package via `scripts/vendor-runtime.mjs`), remote CDN
  `<script>` tags removed, CSP tightened to `script-src 'self'`, precache updated. Real
  browser confirms zero remote-JS requests and both globals load; `tests/csp_vendored_runtime.test.js`
  added; 889 tests + browser checks green. Merged via PR #136; pairs with R16 part 1
  (PR #135).
- 2026-07-14 · R14 Health Connect field contract implemented on
  `claude/helyx-r14-health-connect-9vw5k8`. New shared supported-field contract
  (`js/health/health-fields.js` + `android/.../HealthFieldContract.kt`) makes the
  Settings selection drive exactly which permissions/records are requested and read;
  per-field sync status (grant/deny/revoke/no-data/partial-error); fake VO₂ max control
  removed; manifest narrowed to the four supported fields + history. 881 JS tests, verify,
  smoke, and required browser checks green; new JS + Android JVM contract tests added;
  device permission-matrix checklist added (`docs/android-health-connect-device-checklist.md`).
  Android JVM/lint/APK could not run in-sandbox (no SDK; download egress-blocked); the
  required GitHub verification passed before merge via PR #134. Physical device evidence
  remains open.
- 2026-07-14 · R11–R13 and quick-win R19 completed on
  `codex/core-loop-truth-accessibility`: mobile ergonomics and sign-in modal lifecycle,
  direct bodyweight load modes, confidence-gated readiness, and explicit invalid-program
  recovery. Duplicate progress trackers were archived into this single live roadmap.
  `npm run verify` (874 tests) and required Playwright journeys pass. Merged via PR #133;
  the human-owned device/release matrix remains open.

## Stop conditions

Do not proceed to public beta if any of the following remains true:

- required Node/type/precache/smoke or Android unit/lint/assemble check is red;
- a second same-day run can replace another run or route;
- migration failure can advance the schema version;
- Android JSON export cannot be saved and reimported;
- local calendar records can be stamped as the wrong day in supported timezones;
- an active GPS session can be silently lost or accepted without recover/discard after a
  supported service or process restart;
- a program switch can proceed while a workout is unresolved;
- imported user text can still execute or be interpreted as markup in a privileged UI;
- a production deployment/signed artifact can bypass required verification.
- any applicable human-owned device, account, legal, or release item above remains
  unverified.

The roadmap intentionally puts fewer, deeper integrity changes ahead of feature breadth. The beta should test whether the existing core loop is valuable—not whether users will tolerate losing or misclassifying the data created by that loop.
