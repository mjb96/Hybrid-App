# Helyx Improvement Roadmap

**Prepared:** 14 July 2026  
**Last reconciled with `main`:** 23 July 2026
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
9. Session lifecycle and plan adherence are separate: deliberate Finish means finished,
   while completed/skipped planned work remains measurable without calling the workout partial.
10. Stored exercise display names remain untouched; explicit aliases resolve to canonical IDs
    at read time, and unknown custom names retain exact identity.
11. Muscle-volume indicators are estimated set credits and typical ranges, never a personal
    diagnosis of minimum effective or maximum recoverable volume.
12. Analytics follow summary → metric detail → exact evidence: every displayed period, unit,
    comparison and contributing session must describe the same underlying records.
13. A live calendar week excludes future-dated records from performance totals and navigation;
    retained future records are disclosed for correction rather than silently treated as work done.

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
- **R8 lifecycle correction complete — 19 July 2026** on
  `codex/exercise-volume-finish-audit`. The prescription comparison remains the adherence
  source, but it no longer decides whether a deliberately finished workout is finished.
  Additive `sessionStatus[day]` and `sessionSummary[day]` sidecars retain
  `in_progress|finished`, planned/completed/skipped sets, run adherence and the first
  `finishedAt`. Finish is idempotent, skipped work still opens recap/history, leaving without
  Finish remains resumable, and discard uses the existing confirmed deletion path. Empty or
  warm-up-only work cannot be finished as training. Legacy full/duration-confirmed logs remain
  readable without rewriting the state blob.
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
- **R21 exercise progression complete; canonical alias follow-up — 19 July 2026** on
  `codex/r21-r22-release-hardening`. One date-strict exercise-history query now scans
  numeric, archived, and independent-session records across weekdays, programs, and
  activations. Its default progression scope is all stored activations; activation- and
  program-scoped reads are explicit options. Unknown custom names remain exact while explicit
  catalogue aliases share a canonical identity; warm-ups/incomplete sets are excluded, the current edited slot is
  excluded, and same-day sessions prefer a real start timestamp before a deterministic
  record-key tie-break. Undated legacy slots remain stored but are never invented into the
  chronology. The cockpit's suggestion, stall check, and prior-session fatigue now consume
  this query, so a moved Monday workout logged Tuesday or an archived prior program supplies
  the correct latest performance. The follow-up catalogue now maps explicit historical
  aliases to canonical exercise IDs at read time, so progression/PR series merge names such
  as DB Bench Press and Dumbbell Bench Press without mutating stored keys; unknown custom
  names remain exact.
- **R22 analytics consolidation complete + bounded R25 seam — 18 July 2026** on
  `codex/r21-r22-release-hardening`. `js/metrics/training-load.js` now owns the one sRPE
  day formula and explicitly separated program-week and calendar-dated rolling scopes;
  former Brain/metrics duplicates are compatibility adapters. The obsolete RPE-only
  readiness models and engine re-exports were removed so the R13 evidence-aware scorer is
  the only readiness model. Rolling ATL/CTL now includes dated archived activations and
  one-off sessions, fills real calendar rest days, and shares duplicate-session rules with
  weekly analytics. Strength's labelled Lifetime PR now scans every stored activation while
  its chart remains explicitly current-program-run scoped; Profile “This Week” and its
  heatmap now use real calendar dates across all activations. Mislabelled program buckets now
  read “4-Week Volume” and “Current Program Week.” Golden load, all-activation, scope,
  archive, one-off, exact-identity, tie, and export/import-round-trip fixtures cover the seams.
- **Release submission drafts reconciled — 18 July 2026** on
  `codex/r21-r22-release-hardening`. The privacy, Play Data Safety, and store-listing drafts
  now match the implemented four-field Health Connect contract, configured scrubbed Sentry
  reporting, vendored runtime JS, remote font/map services, and evidence-honest GPS claims.
  The Play pack now flags the mandatory external account-deletion resource, hosted in-app
  privacy link, edge-function verification, provider-sharing classification, placeholder
  replacement, and legal review as unresolved owner gates rather than claiming readiness.
- **R28 exercise, volume and finish audit implementation complete — 19 July 2026** on
  `codex/exercise-volume-finish-audit`. One canonical catalogue now owns 120 exercise IDs,
  125 explicit aliases, movement/equipment/category metadata and per-muscle 1.0/0.5/0.25
  set-credit weights. All 233 distinct built-in program labels resolve (previously 186 were
  absent from the 47-name library/muscle map); 11 conditioning stations resolve for identity
  but are excluded from hypertrophy-set guidance. The logger's searchable library and swap
  engine derive from the catalogue; history, PR aggregation, big-three and calendar strength
  analytics resolve aliases while preserving raw stored names. Muscle guidance uses every
  dated activation/one-off session in the selected Monday–Sunday calendar week, excludes
  warm-ups/blanks/skips/invalid or zero-rep sets, and calls its output estimated set credits
  against typical ranges. The former universal MEV/MAV/MRV claims and automatic add-sets
  coaching were removed. Completion-flag truthiness was replaced with the canonical legacy-
  safe predicate in remaining consumers, and streak/month calendar walkers no longer invent
  dates for undated legacy records.
- **R28 e1RM, load-target and history follow-up complete — 19 July 2026** on
  `codex/exercise-volume-finish-audit`. Every active strength surface now uses one bounded
  Epley helper: positive external-load working sets of 1–12 reps only. Higher-rep,
  bodyweight/effective-load, assisted/band and conditioning work remains in session/volume
  totals but cannot create an estimated-1RM PR, plateau or load target. e1RM remains a
  directional trend, never a measured max or the source of the next-session weight.
  Double progression now raises load only when every set at the session's heaviest working
  weight meets the prescribed top target; a missed set chases one rep, same-exercise high RPE
  holds, and a flat three-session trend prompts hold/review instead of an automatic 10%
  deload. Run and unrelated-lift RPE cannot alter the recommendation. The logger's history
  line, ghosts, PR comparison and recap now use the canonical dated all-program query, so a
  program switch or weekday move retains prior exercise context and explicit aliases merge.
  Evidence boundary: ACSM progression guidance (PMID 11828249), 1RM-equation cross-validation
  using 4–10 repetitions to failure (PMID 39495260), RIR review (PMID 38563729), and load-vs-
  repetition progression trial (PMID 36199287); the 12-rep ceiling is a conservative product
  boundary, not a claim that Epley is exact through 12 reps.
- **R29 analytics hierarchy and drill-down implementation complete — 19 July 2026** on
  `codex/analytics-drilldowns`. Weekly Volume is now a dedicated calendar-week view with
  current/completed status, exact date range, elapsed-matched live comparison, tonnage/sets/
  reps/session/exercise totals, selectable day evidence, and workout/exercise/muscle breakdowns.
  Exact workout rows open Activity Detail; exercise and muscle rows open alias-aware historical
  detail screens and retain the selected week/back destination. Shared comparison and calendar
  aggregation exclude warm-ups, incomplete/malformed/skipped sets, undated legacy slots and
  future-dated live-week records. Strength/Home cards are visibly tappable; Running's weekly
  distance follows the selected calendar week; Recovery's weekly RPE is date-strict; load/form
  wording states comparison to the athlete's 28-day baseline rather than claiming a safe zone or
  readiness; Hybrid Score pillars expose their inputs progressively. The mobile layout has no
  horizontal overflow at 390 px and its new controls/calculation disclosures meet 44 px targets.
- **R30 inventory, upgrade safety and Running metric-detail slice complete — 19 July 2026**
  on `codex/analytics-contract-running`. An executable inventory now records 135 distinct
  metrics across 173 surface instances, including source, calculation owner, unit, period,
  comparison, interaction, evidence, empty state, limitations and tests; five non-analytic
  card patterns are explicitly excluded. The shared metric route/detail contract now gives all
  30 displayed Running metrics stable identities, exact destinations, historical ranges,
  inspectable values, comparisons, calculation/source/confidence disclosure and exact Activity
  evidence where records exist. Running summaries on Home and Profile use the same date-strict,
  all-activation history. A v103 cache boundary, early service-worker update bootstrap and a
  legacy-module compatibility seam prevent a mixed-cache upgrade from stopping app boot. This
  slice also fixes the canonical threshold-pace→VDOT conversion (ordinary paces no longer
  saturate at 90) and preserves the advertised ml/kg/km Running Economy unit. This is a
  complete, independently useful Stage 1–3 slice; 79 inventoried metrics on Strength,
  Recovery/Health, Hybrid Score, Review, Profile, fasting and projections remain static and are
  explicitly retained for the Stage 4–5 follow-up rather than being claimed complete.
- **R30 Strength volume-family detail slice complete — 22 July 2026** on
  `codex/r30-strength-metrics`. The previously static 4-Week Volume, Volume Progression and
  Muscle Set Credits cards now use one date-strict, all-activation Strength history and open
  dedicated range-selectable details with honest rolling/calendar periods, neutral comparison
  language, calculation/limitation disclosure and exact Activity evidence. Warm-ups,
  incomplete rows, future records and undated legacy work are excluded; summary values and
  selected chart points share the same records. The service-worker cache advances to v105.
  This moves the executable inventory to 37 exact details and 76 static metrics; remaining
  Strength e1RM/profile/calendar/balance work and the other Stage 4–5 domains remain open.
- **R30 Gym Performance and logger-history slice complete — 23 July 2026** on
  `codex/gym-performance-logger`. Home's Gym Performance card now opens an exact 7D/4W/1Y
  strength-activity view with selectable time, session, working-set and volume metrics; honest
  elapsed-period comparisons; inspectable bins; exact Activity evidence; and duration-coverage
  disclosure. One canonical legacy-compatible strength-duration parser now prevents analytics
  from treating a plain `60` as both seconds and minutes. The workout logger exposes the exact
  previous session and its working sets, aligns prior values with current inputs, and can copy
  only into blank fields. Progress concern no longer labels three successful week-two sessions
  a plateau: it requires three comparable sessions spanning 14–56 days plus a current target
  miss, and is presented as a neutral progress check. Cache advances to v110.
- **R20 program-editor foundation complete — 22 July 2026** on
  `codex/program-editor-foundation`. The custom editor now presents one focused day instead of
  seven full cards, with a compact weekly selector, searchable canonical exercise library,
  explicit custom-name fallback, safe replace/reorder/remove/copy/rest controls, editable plan
  details, week progression, validation and a preview generated by the same `liftTarget`
  resolver as the logger. Editing the active plan rematerialises only untouched workout slots;
  any started, finished or historically logged day is preserved byte-for-byte. This is a
  legacy-compatible usability and safety slice: the deeper normalized per-exercise/run
  prescription schema (R20: RPE/RIR/rest/tempo/structured intervals) remains deferred and is
  not simulated through more free text.
- **Sync recovery and workout-session integrity correction complete — 20 July 2026** on
  `codex/sync-recovery-workout-session`. Before this device can replace a newer cloud blob,
  the exact cloud state is now protected locally and exposed as a one-tap Settings recovery;
  replacement is a labelled two-step confirmation with cloud/device history summaries and is
  blocked if protection fails. The live logger now projects only the active prescription plus
  explicit additions/swaps, so retained foreign rows stay available to history without rendering,
  completing, or inflating today's session. Workout clocks are owned by activation/week/day or
  one-off session identity, preventing elapsed time from carrying between workouts. This cannot
  recreate data overwritten before the recovery vault existed; no historical values are fabricated.
- **R31 recovery-first welcome and fresh-state write guard complete — 22 July 2026** on
  `codex/recovery-first-welcome`. A cleared device now opens with explicit new-profile,
  cloud-sign-in and offline JSON-restore choices instead of forcing a returning athlete through
  onboarding. Cloud and local persistence remain locked while only boot's empty defaults exist;
  real local state, a successful cloud pull, a validated JSON restore, or deliberate onboarding
  completion releases the gate. This closes the delayed-autosave race that could otherwise upload
  a blank scaffold while sign-in recovery was in flight. Invalid/cancelled imports retain the
  recovery welcome and do not replace state.
- **Automatic offline JSON backup implementation complete — 22 July 2026** on
  `codex/offline-auto-backups`. The Android app now lets the athlete explicitly choose a
  Storage Access Framework folder, then writes the same complete v4 portable JSON envelope
  as manual export (app state plus every validated GPS route). A session checkpoint refreshes
  `helyx-auto-latest.json`, the current dated snapshot and the current weekly snapshot; app
  launch performs a once-per-day catch-up. Native retention keeps seven daily and four weekly
  snapshots without touching unrelated files. The shared-storage files are designed to remain
  after WebView/app data is cleared, although Helyx must be granted the folder again before it
  can resume writing. Browser/PWA automatic downloads remain unavailable by platform design and
  manual JSON export remains visible. Files are disclosed as unencrypted and a cloud-backed
  folder may be synced by its provider; Android system app backup remains disabled. Physical
  folder, permission-loss, clear-data and reimport evidence remains `[You]` work in
  `docs/android-export-device-checklist.md`.
- **Android JSON/FIT import picker correction complete — 22 July 2026** on
  `codex/android-import-picker-fix`. WebView can report HTML file filters as extensions such
  as `.json` and `.fit`, while Android's document contract accepts MIME types only; the shell
  previously forwarded those incompatible extensions and could hide otherwise valid backup/FIT
  files. One pure native normalizer now maps JSON and FIT to provider-compatible MIME filters,
  preserves valid wildcards such as `image/*`, deduplicates mixed filters, and safely opens the
  general picker for unknown extensions. Existing JSON/FIT content validation remains the data
  safety boundary after selection.
- **Android backup/export WebView invocation correction complete — 23 July 2026** on
  `codex/android-auto-backup-fix`. Automatic-folder selection, automatic JSON writes and manual
  JSON/CSV export previously stored Android WebView's host timer functions on a plain runtime
  wrapper, then invoked them with that wrapper as `this`. WebKit rejected the call with
  `TypeError: Illegal invocation` before any native picker or writer could run. Both portability
  adapters now invoke timers with the actual Window receiver; the browser save picker receives
  its owner for the same reason. WebView-strict regressions fail on the old call shape and pass
  on the corrected one. Cache advances to v111; physical APK confirmation remains in the Android
  export device checklist.
- **Volume Guide Phase 1 complete — 22 July 2026** on `codex/volume-guide`. Strength analytics
  now separates calendar-week logged set credits from the active program's week-specific planned
  credits, exposes direct and indirect contribution, and lets the athlete choose Grow, Maintain,
  or Track only per muscle. The same `liftTarget` resolver powers the logger, guide, and custom
  program editor projection; past weeks never fabricate a historical plan and deloads are labelled
  as expected lower-volume weeks. Muscle detail adds an eight-week logged corridor with a planned
  marker and exact workout evidence. Home shows a compact guide card only after an athlete makes an
  explicit priority choice. Generic fixed-volume warnings and the unused fixed-band readiness score
  were removed: reference bands remain transparent population guidance, not personal MEV/MRV,
  recovery, or automatic training instruction.

### 19 July reliability audit findings

This is the current audit record; do not create a parallel audit/progress document. Evidence
is the named source/test, not a prior report.

| ID | Severity | Confidence | Affected area / root cause | User impact | Resolution / status | Regression evidence |
|---|---|---|---|---|---|---|
| A1 | High | High | `completion-policy.js` made prescription adherence the session lifecycle; `workout.js` emitted finished recap only at 100%. | A deliberately ended workout stayed resumable and was called partial when sets or the run were skipped. | Fixed: additive lifecycle/adherence split, explicit Finish/Keep Training/Discard, no-data guard, idempotent finish. | `session_completion_policy.test.js`, `delete_day_workout.test.js`. |
| A2 | High | High | Exercise picker, substitutions and `MUSCLE_MAP` were independent exact-name tables; 186/233 program labels had no volume mapping. | Most built-in program work silently received zero muscle credit and common variants split history. | Fixed: 120-entry canonical catalogue, 125 explicit aliases, all program references resolve, raw history unchanged. | `exercise_catalog.test.js` full-catalog validation. |
| A3 | High | High | Muscle guidance read active program-week arrays and ignored archived/one-off sessions. | “This week” could omit real work or show a stale program position. | Fixed: selected Monday–Sunday calendar week from stamped dates across stored sessions. | Calendar-boundary/activation/one-off volume fixtures. |
| A4 | Moderate | High | Fixed RP-labelled MEV/MAV/MRV boundaries were presented as exact and every secondary muscle received 0.5. | False precision and over-credit for compounds such as squat, bench, rows and deadlifts. | Fixed: explicit dominant/secondary/minor weights and typical-range language; thresholds remain general guidance, not a prescription. | Muscle-credit, compound and methodology tests. |
| A5 | High | High | Multiple consumers used truthiness (`s.c`) rather than the canonical completion decoder. | Stored string `"false"` could be interpreted as completed in detail, calendar, notification or state paths. | Fixed in active consumers; only explicit `true|'true'|'on'|1` is complete. | Existing set-utils regressions plus source review. |
| A6 | High | High | Epley maths was duplicated and accepted unlimited reps; some views special-cased one rep while others did not. | High-rep or non-comparable loads could inflate PRs, estimated strength and plateau advice. | Fixed: one shared bounded formula; unsupported reps/load modes retain workout credit but return no e1RM. | `strength_calendar_e1rm.test.js`, `session_recap.test.js`, formula source scan. |
| A7 | High | High | Logger history only checked the prior numeric program week/same weekday; progression judged one best set and averaged unrelated lift/run RPE. | Program switches falsely read “first time,” ghosts disappeared, and unsafe load increases/holds could be recommended from the wrong evidence. | Fixed: canonical dated all-program logger/PR/recap history; all top-load sets gate progression; same-exercise RPE only; plateau holds for review. | `exercise_history.test.js`, `engine.test.js`, alias/program-switch/effort fixtures. |
| A8 | Moderate | High | Strength history/PR/overview compared display strings. | DB/Dumbbell and punctuation variants fragmented prior performance and PRs. | Fixed for explicit aliases; unknown custom exercises deliberately stay exact. | Historical alias, canonical PR and same-variation tests. |
| A9 | Moderate | High | `forEachLoggedDay` reconstructed missing dates from the current program position. | Undated legacy work could enter a modern streak/month incorrectly. | Fixed: calendar reporting excludes undated records while retaining them in storage. | `logged_days.test.js` undated fixture. |
| A10 | Moderate | High | Lifetime state still serializes/upserts as one JSON blob. | Write amplification and last-write-wins remain scale/conflict risks despite the existing conflict guard/backups. | Open as R24; no migration attempted without telemetry, ADR, dual-read/write and RLS proof. | Existing sync conflict/adversarial tests; R24 acceptance gate. |
| A11 | Moderate | High | `workout.js`, `app.js`, `state.js` remain large cross-cutting modules. | Changes carry broader regression risk and hidden event coupling. | Open as incremental R25; this slice extracted catalogue and lifecycle seams only. | Full suite, smoke and browser core flow required per slice. |
| A12 | Low | High | Two tests produced UTC/locale dates independently of the app's local-day API. | Suite failed depending on time of day/timezone despite correct runtime behavior. | Fixed: deterministic canonical date helpers/test seams. | Full suite under local timezone. |
| A13 | Low | High | Three local browser-check servers omitted an explicit host and listened on every interface. | A developer test run could expose served repository assets beyond localhost. | Fixed: all real-browser servers bind `127.0.0.1` only. | Required browser suite runs all five journeys successfully. |
| A14 | High | High | Weekly Volume was a static summary without a period-consistent detail/evidence path. | A user could not verify which dates, sets, exercises or workouts produced the headline total. | Fixed in R29: dedicated date-strict detail with day/workout/exercise/muscle breakdowns and exact Activity Detail links. | `strength_volume_detail.test.js`, analytics render/navigation tests, 390 px browser flow. |
| A15 | High | High | Weekly comparison code was duplicated and could compare a live partial week with a complete prior week; future-dated records could appear as completed current activity. | Percent changes and current-week charts could be mathematically valid but misleading. | Fixed in R29: one comparison primitive, elapsed-day matching for live weeks, full-vs-full for completed weeks, zero/missing-baseline handling, future-record exclusion/disclosure. | `comparison.test.js`, `week_chart_model.test.js`, `weekly_aggregate.test.js`, `weekly_fitness_graph.test.js`. |
| A16 | Moderate | High | Strength exercise and muscle summaries had no consistent historical evidence view and display-name aliases could fragment new trends. | Users could not explain progression or set-credit totals across program switches. | Fixed in R29: canonical-ID exercise history (12 weeks/6 months/all time) and calendar-week muscle detail with contributors, trend, typical range and retrospective-classification caveat. | `strength_volume_detail.test.js`, analytics view/navigation tests, existing catalogue/history fixtures. |
| A17 | Moderate | High | Running Stats hard-coded the current week while the shared analytics navigator could show a historical week; Recovery's “this week” RPE read program position. | The period label and metric could describe different weeks, especially after schedule/program changes. | Fixed in R29: both use stamped calendar dates; rolling load/readiness windows remain explicitly rolling and program adherence remains program-based. | `week_nav_calendar.test.js`, `recovery_calendar.test.js`, time-model separation tests. |
| A18 | Moderate | High | ACWR/TSB copy used “safe zone,” “ready to train,” “fresh/peaking” and similar causal verdicts beyond the source data. | Users could mistake a load comparison for injury safety or recovery clearance. | Fixed in R29: neutral relative-to-baseline wording and visible model limitations; Hybrid Score inputs are expandable instead of hidden behind one precise number. | `metrics_load.test.js`, Hybrid Score UI tests, Recovery render checks. |
| A19 | High | High | A controlled client could load the new app graph against an older cached `comparison.js` export, so the static import failed before the service-worker update registration in `app.js` could run. | An otherwise valid upgrade could leave the whole app blank until the browser cache was manually cleared. | Fixed in R30: new callers use an additive canonical module, the update bootstrap runs before the app graph, and v103 precaches the complete production graph. | `cache_upgrade_compat.test.js`, precache check, cold/reload in-app browser boot. |
| A20 | High | High | Running cards used generic domain navigation and duplicated summary calculations; individual metrics had no dedicated period/history/evidence contract. | A new user met dead ends and a daily user could not verify pace, distance, load or records against exact runs. | Fixed for all 30 displayed Running metrics in R30: stable IDs, exact detail routes, canonical dated history, range/point inspection, honest comparisons/empty states and Activity evidence. | `running_metric_detail.test.js`, `metric_inventory.test.js`, render tests and `running-analytics-check.mjs`. |
| A21 | Moderate | High | Profile read legacy Health Connect `value`/`hours` fields while native ingestion persists `rmssd`, `bpm` and `totalHours`; Profile distance PBs independently scanned even future/undated slots. | Valid health data could disappear and Profile could disagree with Running analytics. | Fixed in R30: canonical field keys with compatibility fallbacks; Profile running summaries/PBs share the canonical date-strict history and open exact metric details. | Inventory/source contract tests and future/undated Profile PB regression. |
| A22 | High | High | Threshold pace used `3537 / (paceMinKm - 0.4)` with incompatible units, clamping ordinary paces such as 5:00/km to VDOT 90; Running Economy divided by m/s while labelling the result ml/kg/km. | Endurance Score, projections and economy could look precise while being physically implausible. | Fixed in R30: threshold is an explicit approximate 60-minute performance through the existing Daniels–Gilbert function/inverse, and oxygen cost divides by km/min. R23 effort/quality confidence remains open. | Realistic threshold/round-trip/economy benchmarks in `vdot.test.js`; Running detail regression. |
| A23 | High | High | The sync-conflict “keep device” path overwrote a newer cloud blob without preserving that exact blob first. | One mistaken conflict choice could make newer training unrecoverable on both copies. | Fixed: pre-overwrite recovery vault, history summaries, protected two-step confirmation, and Settings restore; replacement is blocked if the snapshot cannot be written. | `sync_recovery_vault.test.js`, `state_recover_snapshot.test.js`. |
| A24 | High | High | Retained logged lifts outside the active blueprint could remain appended in a numeric day and every live consumer iterated all lift keys. | Prior-workout rows appeared under today's plan and inflated completion, sets, volume and recap. | Fixed: active-session lift ownership filters rendering/completion/recap while preserving stored history; new additions/swaps carry explicit origin metadata. | `exercise_swap.test.js`, `session_completion_policy.test.js`. |
| A25 | Moderate | High | The workout duration used one global persisted start time with no activation/week/day/session owner. | Moving between workouts could inherit another session's elapsed time. | Fixed: stable session-scoped timer identity and mismatch rejection/reset on boot/navigation/finish. | `workout_timer_identity.test.js`, full browser core flow. |

### Analytics inventory and settled treatment

This is the post-implementation inventory. Calculation modules and tests are the executable
specification; this table records the user-facing scope and retained limitations.

| Metric family reviewed | Canonical scope/calculation | Implemented presentation and interaction | Retained limitation / decision |
|---|---|---|---|
| Weekly lifted volume, working sets, reps, strength sessions, exercises and duration | `strength-volume-detail.js`; valid completed working sets stamped inside a local Monday–Sunday week, across numeric/archived/independent sessions. | Weekly Volume summary → Day/Workouts/Exercises/Muscles → exact Activity Detail; live weeks compare the same elapsed days. | Tonnage is mechanical work, not training quality; unreliable/missing duration stays unavailable. |
| Exercise performance, best load/reps, e1RM, PRs, volume and frequency | Canonical all-program exercise history plus bounded eligible-set Epley calculation. | Exercise rows/lift names open 12-week, 6-month or all-time detail with latest/previous, trends and exact workouts. | Bodyweight/assisted/band/conditioning and >12-rep sets do not produce e1RM; unknown custom names remain exact. |
| Estimated muscle-group sets, direct and secondary credit, contributors and typical ranges | Current catalogue's 1.0/0.5/0.25 credits over valid selected-calendar-week sets. | Muscle rows open selected-week direct/indirect totals, eight-week trend, contributing exercises/workouts and calculation disclosure. | Estimated, not measured; today's catalogue classification is applied retrospectively and ranges are general guidance. |
| Running distance, duration, frequency, pace, longest run, intensity/HR signals, load, VDOT, projections and PBs | `running-detail.js` over exact dated run sessions across numeric/archived activations; calendar week, elapsed-matched comparison, rolling 7/28-day or 8/12-week windows and lifetime scopes are explicit. Pace is distance-weighted; walks, short sessions and implausible whole-session pace are excluded from pace records. | Every one of the 30 displayed Running metrics opens its own range-selectable detail with inspectable weekly history, comparison, calculation/source/confidence disclosure and exact contributing activities; Home/Profile running summaries reuse the same collected history. | R23 effort/outlier confidence remains deferred. Manual records retain lower source confidence; threshold/economy/projection history is not fabricated because setting snapshots are not stored; projection confidence intervals/course/weather adjustments remain absent. |
| Readiness, wellness, sleep, HRV, resting HR, steps and recovery trends | Evidence-aware readiness plus their explicitly named daily/7-day/28-day windows; calendar-week RPE uses stamped dates. | Recovery keeps Overview/Stats progressive disclosure, neutral no-data states and source/confidence copy; weekly nav is intentionally absent from rolling metrics. | Health signals depend on user-entered/Health Connect coverage and never default missing data to a penalty or diagnosis. |
| ATL, CTL, ACWR/load ratio, TSB/form, systemic/local/aerobic fatigue, spikes and momentum | Canonical date-filled rolling load models; status is relative to the athlete's own 28-day baseline. | Neutral baseline wording replaces safe/productive/detraining and recovery-clearance claims; thresholds/limitations remain visible in detail. | Heuristics are load-management signals, not injury prediction or medical diagnosis. |
| Hybrid Score and pillars | Existing score model with evidence coverage; Strength remains program-week progression by deliberate product rule while other inputs retain their named scopes. | Score remains tappable; pillar panels expose all contributing signals, missing inputs and reasoning through expandable detail. | It is a directional coaching summary, not a performance grade; no Health Connect data is not itself a deduction. |
| Home In Focus and At a Glance | Shared calendar-week chart model/aggregate, same units/comparisons as detail. | Strength opens Weekly Volume, Running opens Running, populated day bars open the exact workout/run or date chooser; empty/future bars do not navigate. | Home stays a small summary surface rather than duplicating evidence-level analytics. |
| Adherence, consistency, program progress, bodyweight and fasting | Program adherence remains plan-position based; bodyweight/fasting retain their natural daily/rolling scopes. | Retained in their existing focused views; not forced into calendar-week navigation. | These metrics answer different questions and were deliberately not merged into Weekly Volume. |

### Volume methodology and exercise audit record

The app counts one valid completed working-set row per exercise, not one per limb. A
three-set Bulgarian split squat therefore contributes three credits, not six. Missing load
is allowed for bodyweight/band work; positive reps (or duration/distance stored in that field)
are required. Warm-ups, blank rows, unchecked/skipped sets, zero-rep/invalid rows and the 11
conditioning-station entries contribute zero. Superset exercises count separately; completed
drop-set rows count as one estimated set because the app cannot infer a more precise stimulus.
Dominant muscle credit is 1.0, meaningful indirect credit 0.5, and minor credit 0.25; the
minor tier is a transparent product heuristic. Research supports set count as a useful volume
proxy when other variables are controlled and fractional treatment of indirect work, while
also showing diminishing returns, effort dependence and individual variability:
[Schoenfeld et al. 2017](https://pubmed.ncbi.nlm.nih.gov/27433992/),
[Remmert et al. 2025](https://pubmed.ncbi.nlm.nih.gov/41343037/),
[Baz-Valle et al. 2021](https://pubmed.ncbi.nlm.nih.gov/30063555/),
[Refalo et al. 2023](https://pubmed.ncbi.nlm.nih.gov/36334240/), and
[Scarpelli et al. 2022](https://pubmed.ncbi.nlm.nih.gov/32108724/).

Internal boundaries are retained only to draw broad guidance bands; the UI no longer names
them as a user's exact MEV/MAV/MRV. Confidence is moderate for set count/fractional direct-vs-
indirect use and low for any individual's boundary without longitudinal response data.

| Muscle | Internal band boundaries (low / typical start / upper / caution) | Final treatment | Confidence |
|---|---:|---|---|
| Chest | 8 / 10 / 20 / 22 | Calendar-week estimated credits; dominant press/fly 1.0, indirect 0.25–0.5. | Moderate method / low boundary |
| Upper chest | 4 / 6 / 12 / 14 | Incline press dominant; overhead press minor only. | Moderate / low |
| Lats | 6 / 10 / 20 / 22 | Vertical pull dominant; rows secondary; deadlift zero. | Moderate / low |
| Upper back | 6 / 10 / 20 / 25 | Rows dominant; vertical pulls/face pulls secondary. | Moderate / low |
| Traps | 0 / 4 / 16 / 20 | Shrugs dominant; carries/deadlifts minor-secondary. | Moderate / low |
| Erectors | 4 / 6 / 12 / 16 | Back extension dominant; hinges/squats minor-secondary. | Moderate / low |
| Quads | 6 / 8 / 18 / 20 | Squat/lunge/knee extension dominant; no hamstring credit from squats. | Moderate / low |
| Hamstrings | 4 / 6 / 16 / 20 | RDL/curl dominant; deadlift secondary; squat zero. | Moderate / low |
| Glutes | 0 / 4 / 12 / 16 | Hip thrust/deadlift dominant; squat/lunge secondary. | Moderate / low |
| Adductors | 0 / 4 / 12 / 16 | Sumo secondary; squat/lunge minor. | Low / low |
| Calves | 6 / 8 / 16 / 20 | Calf-raise variations dominant only. | Moderate / low |
| Front delts | 0 / 6 / 12 / 16 | Overhead press dominant; bench minor; incline secondary. | Moderate / low |
| Side delts | 6 / 8 / 22 / 26 | Lateral raise dominant; shoulder press minor. | Moderate / low |
| Rear delts | 0 / 6 / 18 / 25 | Rear-delt fly/face pull dominant; rows minor-secondary. | Moderate / low |
| Biceps | 4 / 8 / 20 / 26 | Supinated curls dominant; pulls/rows secondary-minor. | Moderate / low |
| Triceps | 4 / 6 / 14 / 18 | Extensions/close-grip work dominant; presses secondary. | Moderate / low |
| Brachialis | 0 / 4 / 12 / 16 | Hammer/reverse curl dominant; other curls minor. | Moderate / low |
| Forearms | 0 / 4 / 12 / 18 | Carries/dead hangs dominant; hammer/reverse curl minor-secondary. | Low / low |
| Core | 0 / 6 / 16 / 25 | Direct core work dominant; carries/selected compounds minor, most stabilisation zero. | Low / low |

Major legacy classification corrections (aliases in each row share the new treatment):

| Exercise family | Previous treatment | Implemented treatment | Reason |
|---|---|---|---|
| Back/front/paused/goblet squats | Several muscles full or uniform 0.5 secondary | Quads 1.0; glutes 0.5; adductors/erectors/core 0–0.25 by variation | Avoids treating every involved muscle as a full hypertrophy set. |
| Conventional/deficit deadlift | Hamstrings + glutes full; erectors/traps/lats 0.5 | Glutes 1.0; hamstrings/erectors 0.5; traps 0.25; lats 0 | Lats stabilise the bar but are not credited as a hypertrophy set. |
| RDL/stiff-leg/good morning | Hamstrings + glutes full | Hamstrings 1.0; glutes 0.5; erectors 0.25–0.5 | Keeps the dominant lengthened hamstring stimulus distinct. |
| Bulgarian split squat/lunges/step-ups | Quads + glutes full; sometimes hamstrings 0.5 | Quads 1.0; glutes 0.5; adductors 0–0.25; hamstrings 0 | One logged bilateral set row stays one credit, not per leg. |
| Flat bench/push-up | Chest + front delts full in places | Chest 1.0; triceps 0.5; front delts 0.25 | Pressing involvement is not equal stimulus for all three. |
| Incline presses | Upper chest + front delts full | Upper chest 1.0; front delts/triceps 0.5 | Reduces duplicated full credit. |
| Dips/close-grip/diamond work | Chest and triceps often both full | One dominant target by variation, other 0.5, front delts 0–0.25 | Separates chest-biased dips from triceps-biased variants. |
| Overhead presses | Front delts full; triceps/upper chest/core uniformly 0.5 | Front delts 1.0; triceps 0.5; upper chest/side delts 0–0.25; core 0 | Stabilisation alone gets no set credit. |
| Pull-ups/chin-ups/pulldowns | Multiple back/arm muscles full | Lats 1.0; upper back/biceps 0.25–0.5 | Distinguishes direct from indirect pulling work. |
| Barbell/cable/DB/chest-supported rows | Upper back + lats full; biceps/rear delts/erectors 0.5 | One dominant back region 1.0; others 0.25–0.5 | Prevents four or five full-equivalent credits per row. |
| Face pulls/rear-delt flies/pull-aparts | Separate incomplete tables | Rear delts 1.0; upper back 0.25–0.5 | One shared catalogue now drives search, swaps and analytics. |
| Hammer/reverse curls | Biceps + brachialis full or unmapped | Brachialis 1.0; biceps 0.25–0.5; forearms 0.25–0.5 | Reflects grip/elbow-flexor emphasis without triple full credit. |

Inventory result: 120 exercises reviewed (109 volume-eligible strength/core entries and 11
identity-only conditioning stations); 82 canonical entries were not represented by the old
library, while the searchable list grows by 73 net because nine duplicate legacy display names
are merged. There are 125 compatibility aliases and zero unresolved built-in program labels.
The catalogue itself (`js/exercises/catalog.js`) is the exhaustive per-exercise inventory;
validation fails on duplicate IDs/aliases, unknown muscles/movements/equipment, invalid credits,
missing dominant muscles, or unresolved program references.

## Prioritization model

Priority is based on severity, likelihood, user trust, launch dependency, and blast radius. Effort is a delivery estimate for one experienced product engineer with review, not elapsed calendar time. Each item includes the evidence required for completion; code existing or a happy-path manual check is not sufficient.

## Current execution focus

Completed recommendations remain in the implementation register and phase tables as
acceptance evidence; they are not the active queue. R17, R18, R21, R22, R28, R29, and the
R30 inventory/shared-contract/Running and the Strength volume-family slice, R31 recovery-first
entry, plus the
legacy-compatible R20 program-editor foundation, are engineering-complete; remaining Strength e1RM/profile/calendar/balance and
Recovery/Health/Hybrid/Home/Profile follow-ups remain reviewable Stage 4–5 slices, and R25
remains an incremental seam-by-seam practice.
The active launch item is **R15 release evidence**: required Android JVM/lint/APK checks must
pass, then the owner completes `docs/android-gps-device-checklist.md`; failures return to R15
before beta.

In parallel, complete the human-owned device and release evidence below. R20, R23, R24,
and R26 remain deferred until the public-beta/evidence gates are satisfied; R24 additionally
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
| R8 | Workout/adherence | Session lifecycle was overloaded with perfect plan adherence, leaving deliberately ended work resumable/“partial.” | Explicit `in_progress|finished` lifecycle plus separate planned/completed/skipped adherence and confirmed discard. | `js/workout.js`, completion/lifecycle/delete helpers, picker/detail/Brain. | Empty/warm-up-only, skipped sets/exercises, leave/resume, finish twice, edit finished and discard tests. | Corrected/completed with R28 on `codex/exercise-volume-finish-audit`. |
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
| R20 | Program schema/editor | The editor formerly exposed seven long free-text day cards and could leave stale active-workout scaffolding; shared weekly targets/free-text still cannot represent marketed prescriptions. | Completed editor foundation: compact day focus, catalogue picker, validation/exact preview and logged-day-safe rematerialisation. Remaining: legacy-compatible normalized prescription resolver and structured overrides. | editor model/UI, state reconciliation; later schema, engine, catalog adapters, detail/workout. | Editor model/reconciliation, exact preview, 320–412px/large-text browser journey; later catalog golden corpus, consumer equality and custom round trip. | Editor foundation complete on `codex/program-editor-foundation`; normalized prescription ADR/multi-PR work remains Phase 3. |
| R21 | Exercise progression | `computeDiagnosticForLift` only checked prior numeric weeks/same day; display-name variants split later history. | Chronological all-session query with explicit scope plus explicit canonical alias resolution. | engine/history query, exercise catalogue, activation/session records, progression tests. | Cross-day/program/archive/canonical-alias/custom-exact identity cases. | Complete; aliases plus logger/ghost/recap carry-over completed in R28 follow-up. |
| R22 | Analytics maintenance | Duplicate model exports can drift; “lifetime” scope is active-run-only. | One supported model per metric and scope-correct labels/queries. | metrics-load/readiness re-exports, strength calculations/views. | Golden formula and all-activation history tests. | Complete on `codex/r21-r22-release-hardening`. |
| R23 | Running analytics | Broad best-run VDOT selection lacks effort and robust quality confidence. | Qualify source efforts, reject outliers, expose projection confidence. | running performance/projection modules, import/GPS quality metadata. | Race/easy/interval/manual/outlier/sparse-history fixtures. | Phase 3 / after R15 data quality. |
| R24 | Persistence/sync scale | Critical saves serialize/upsert lifetime history as one blob. | Incrementally store immutable sessions while retaining versioned snapshot portability. | state repositories, Supabase schema/RLS, offline queue, migrations/export. | Dual-read/write, rollback, RLS, conflicts, large-history perf. | Phase 3 / dedicated ADR and multi-PR migration, only with telemetry. |
| R25 | Maintainability/design | Large cross-cutting modules plus inline styles/`!important` raise regression cost. | Split along tested seams and migrate touched UI to primitives. | workout/app/settings/state and CSS/components. | Pre-split behavior coverage and visual regression. | Phase 3 / small per-seam PRs, never a mechanical rewrite. |
| R26 | Product hierarchy | Program taxonomy and optional advanced/wellness surfaces repeat/compete with the core loop. | Simplify discovery and progressively disclose unused advanced areas based on beta evidence. | program library/Home/Start/navigation renderers. | Funnel/usability study plus no-regression discovery tests. | Phase 3 / product-evidence-led PRs. |
| R27 | FIT import | `js/garmin.js:extractData` fills `aerobicTE` from anaerobic fields and shows success before the write callback completes. | Correct the field contract, validate parsed units/types, and make callbacks return an awaited save result before success. | `js/garmin.js`, import callbacks in `js/app.js`, FIT fixtures. | Real/anonymized run+gym FIT fixtures, malformed/multi-session files, save failure, unit/field assertions. | Phase 2 / small PR `codex/fit-import-contract`. |
| R28 | Workout/exercises/volume | Finish lifecycle was overloaded with 100% adherence; exercise/history tables split identity; unbounded duplicated e1RM and optimistic progression overstated certainty; MEV wording implied personal precision. | Separate lifecycle/adherence; canonical read-time identity/history; bounded e1RM; conservative set/RPE progression; calendar-week estimated set credits and typical-range copy. | workout lifecycle/policy/delete, exercise catalogue/history/substitutions, strength/e1RM/calendar/volume analytics, roadmap. | Finish/skip/empty/idempotence; catalogue/all-program history; e1RM eligibility; top-load/RPE progression; volume-credit/browser flows. | Engineering complete on `codex/exercise-volume-finish-audit`. |
| R29 | Analytics hierarchy/evidence | Important cards were static or routed to generic screens; duplicate comparison/week logic mixed periods, and exercise/muscle evidence was difficult to inspect. | Establish summary → detail → evidence; add Weekly Volume and strength-entity drill-downs; centralize calendar periods/comparisons; align Home, Running, Recovery and Hybrid Score wording/interactions. | analytics aggregates/navigation/views/charts, Home In Focus, Hybrid Score UI, analytics CSS/HTML, service-worker precache. | Valid-set/date/future/partial/zero/alias/program-switch fixtures, navigation/render tests, mobile overflow/touch QA, full verify. | Engineering complete on `codex/analytics-drilldowns`. |
| R30 | Complete analytics interaction contract | Inventory confirmed 135 metrics/173 surface instances: only four exact detail destinations before this work, generic Running routes, 79 static metrics, and a mixed-cache boot failure. | Keep the executable inventory as the guard; land one evidence-backed domain family at a time. Running, Strength volume and Home Gym Performance are complete; continue Strength e1RM/profile/calendar/balance, then Recovery/Health/Hybrid/Home/Profile. | metric inventory/registry, analytics routes/views/charts, canonical domain calculations, Home/Profile adapters, cache bootstrap/precache. | Every metric contract field; summary/detail/unit/period/evidence identity; new/established/1,000-activity fixtures; edit/delete/future/undated/same-day/archive; 360/390/412, 200% text, theme/motion/offline browser journeys. | Inventory/shared contract + Running complete on `codex/analytics-contract-running`; Strength volume family complete on `codex/r30-strength-metrics`; Gym Performance complete on `codex/gym-performance-logger`; remaining Stage 4–5 domains open. |
| R31 | Login/onboarding recovery | Clearing browser/app data removes both local state and the saved auth session, so returning users were forced into new-user onboarding while JSON restore was hidden in Settings; boot also scheduled a blank-state autosave. | Put cloud and offline-file restore on the first welcome screen and block blank local/cloud persistence until recovery or deliberate setup resolves. | onboarding markup/controller, app import routing, state persistence gate, core CSS/precache. | Fresh-write lock, recovery-choice contract, auth/modal focus, 320–412px/200%-text and full required browser journeys. | Complete on `codex/recovery-first-welcome`; physical Android clear-data/cloud/JSON restore remains part of the owner portability/device evidence. |

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
| R8 | Separate explicit workout lifecycle from plan adherence; align recap, resume, picker, detail and coaching. | Significant | A deliberately finished workout is finished even with skipped work, while adherence remains honest. | Complete | Medium: backward compatibility. | Additive sidecars and legacy inference. | Empty/warm-up-only, skipped, leave/resume, idempotent finish, edit and discard fixtures; browser copy. | Finish persists `finished`; incomplete plan items are recorded as skipped, never productive volume; only non-finished work resumes. |
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
| R29 | Build a period-honest analytics hierarchy with tappable Weekly Volume, exercise/muscle evidence and shared calendar comparison/navigation. | Significant | Lets athletes understand and verify the sessions behind important trends instead of trusting disconnected totals. | Complete | Medium: broad read-only surface. | R2 identities, R21/R28 canonical history/catalogue, calendar-week aggregate. | Valid/skipped/warm-up/edited/deleted/duplicate/program-switch/future/partial/year/DST fixtures; render/navigation and 390 px mobile QA. | Major strength summaries open period-consistent detail/evidence, exact records remain traceable, and shared labels match their calculations. |
| R30 | Give every inventoried analytic a stable identity and exact, evidence-backed detail; deliver one safe domain slice at a time. | Significant | Makes summaries understandable for a first session and verifiable across years of history. | Stage 1–3 + Strength volume + Gym Performance complete; Stage 4–5 open | Medium–High: broad read-only surfaces and calculation drift risk. | R2/R21/R22/R28/R29 canonical session, identity, load and calendar seams. | Executable 135-metric inventory; exact destination/period/unit/evidence guards; sparse and 1,000-activity fixtures; required phone/theme/motion/text/offline browser matrix. | Every genuine tile is visibly interactive and summary, history, comparison and exact evidence share one tested calculation; Running, Strength volume and Home Gym Performance satisfy this now, remaining domains do not yet. |

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
- [ ] Complete the TalkBack, touch-target, Android system save/share, cancel, overwrite,
  automatic offline backup, clear-data survival, and JSON reimport checklists on
  minimum/current supported devices.
- [ ] Deploy and verify the `delete-account` edge function so account deletion removes the
  authentication record as well as local/cloud user data.
- [ ] Have the privacy policy and terms reviewed; replace every placeholder; confirm the
  Sentry retention and provider-sharing classifications; host the policy as a public HTTPS
  web page; add its link in Settings; publish/test the external account-deletion request
  path; then complete the Play Data Safety and Health apps declarations from
  `docs/legal/play-data-safety.md`.
- [ ] Produce final launcher/splash assets, phone screenshots, feature graphic, and store listing
  media only after the device matrices pass.
- [x] Configure `main` branch protection so the required verification workflow cannot be bypassed.
- [ ] Produce the signed release through CI, upload it to Play internal testing, invite testers,
  triage Sentry findings, complete final QA/versioning, then promote to closed/public beta.
- [ ] Review coaching/health copy for product and legal positioning before store submission.

Engineering should provide exact checklists, fixtures, expected results, and build artifacts for each item.

## Session log

Newest first; keep entries short and link commits or checklists instead of repeating the
implementation register.

- 2026-07-24 · Settings close button vs Android status bar — on
  `claude/settings-close-button-android-mope1q`. The Settings header (`index.html`
  `.settings-header`, avatar hero + close ✕ in one flex row) had `padding: 20px 20px 16px`
  with no top safe-area inset, so under `viewport-fit=cover` the whole header (close button
  included) sat behind the Android status icons.
  **A CSS-only fix was tried first and did NOT work on device — recording why, because it
  is not obvious:** `MainActivity` runs edge-to-edge
  (`WindowCompat.setDecorFitsSystemWindows(window, false)`), so the WebView draws behind the
  status bar, but Android WebView only reports a non-zero `env(safe-area-inset-top)` for a
  **display cutout** — not for the status bar. On a notchless phone `env()` is `0px`, so
  padding by it alone changes nothing. There was no native inset plumbing at all
  (no insets listener, no `--app-safe-top`; the layout is a bare `FrameLayout` with no
  `fitsSystemWindows`, so insets do reach the WebView).
  Fix now spans both layers: (1) **native** — `installSafeAreaBridge()` attaches an
  `OnApplyWindowInsetsListener` to the WebView, unions `statusBars()`+`displayCutout()`,
  converts device px → CSS px by display density, and publishes it as `--app-safe-top`
  (formatted `Locale.US` so a comma-decimal locale can't emit `24,5px`); it returns the
  insets unconsumed, re-fires on rotation, and republishes on `onPageFinished` because the
  listener fires before a document exists. (2) **CSS** — the header top padding is
  `calc(20px + max(env(safe-area-inset-top, 0px), var(--app-safe-top, 0px)))`, so the APK
  uses the native value while installed-PWA/browser/notched devices use `env()`; a literal
  `padding: 20px 20px 16px` precedes it so an engine without `max()` falls back instead of
  collapsing to 0. The button stays in normal flex flow (not viewport-absolute), stays
  centred with the avatar via the existing `align-items:center`, and remains 44×44 through
  the shared `--touch-target` rule — the shared `.settings-close-btn` class (5 modals) was
  left untouched. `tests/settings_safe_area_guard.test.js` guards both halves (verified to
  fail when either is reverted). Note: `env(safe-area-inset-bottom)` usages elsewhere have
  the same latent blind spot on this shell; deliberately NOT changed here (untested layout
  risk across the nav) — worth a follow-up. **Kotlin verified by CI**: the Android
  verification job (`gradle testDebugUnitTest lintDebug assembleDebug`) passed on 57d2b1e,
  so the native change compiles, lints and assembles (it could not be built locally — this
  container has no Android SDK). Next `[You]`: device-test portrait + landscape against the
  reported screenshot; the inset value itself is only observable on hardware.
- 2026-07-24 · CI note (no code change) — `Required verification` is RED on
  `claude/settings-close-button-android-mope1q` (runs 111–114) and this is **inherited from
  `main`, not from the Settings work**. The Web job fails at `npm run browser:verify` with 5
  assertions in `scripts/jt-shed-browser-check.mjs`: B4d/B4e (T1 shows
  `4 × 8–12 (double progression)` and T2a shows `15RM + 2 MRS` — the two labels are
  swapped/unresolved) and B4h/B4i/B4j (set roles come back `[null,null,null,null]`, so no
  `repmax`/`backoff`/`plus` tags render in the live logger). Verified pre-existing by running
  the same check on a clean worktree at `9e7d2c4` (stock `main`, none of this branch's
  commits): **identical 5 failures**. So the J&T set-role work merged in #171 regressed its
  own browser contract. Not fixed here — out of scope for the Settings fix and it needs the
  J&T tier/role owner. Also worth noting: `verify.yml` only triggers on `pull_request` and
  pushes to `claude/**`/`codex/**`, so pushes to `main` are never verified — the regression
  landed unseen. Consider adding `main` to the push triggers.
- 2026-07-24 · Jacked & Tan: Shed Edition — Block-2 dynamic back-off + stable stored roles on
  `claude/jacked-tan-shed-logger-p9nco1` (builds on the approved af4b225 set-role rendering).
  (1) **Dynamic T1 Block-2 back-off (weeks 7–11):** the back-off load is now 85%/90% of THAT
  DAY's entered top-set weight. `jtBackoffFromTopSet` (pure, rounded to the 2.5 increment, null
  never NaN/0 on missing input) + a live `recalcJtBackoff` hooked into the cockpit `input`
  event recompute the suggestion the instant the rep-max weight changes — updating the WEIGHT
  placeholder + a source line ("85% of 120kg top set · 102.5kg") on untouched back-off rows
  only. A row the athlete has filled is a deliberate override and is never overwritten;
  clearing the top set clears the suggestion (restores `data-ghost-default`, no stale load). The
  suggestion is recomputed at render from the persisted top-set weight, so reload restores it
  with no recalculation over entered actuals. (2) **Stable stored roles:** roles + prescription
  metadata (`role`, `roleReps`, `boPct`, `boSrc`) are now STAMPED onto the materialised J&T set
  objects (`jtStoredRolesFor`, threaded through `prescribeSetsForLift` + `reconcilePrescribedSets`
  via `jtRoleStampsForCtx`), so a role travels with its row and can't be shifted by a warm-up
  insertion or a middle-set removal. The render prefers the stored role (`jtStoredRoleTag`) and
  falls back to the af4b225 positional mapping for pre-role sessions. The stamps are metadata
  only — the draft/warmup/reconcile predicates key off w/r/type/rpe/rir/bw/band/loadMode and
  ignore them, so a fresh stamped day is still not a started draft (asserted). Non-J&T programs
  stay byte-identical plain `{w,r,c}`. (3) **History roles:** the completed-session breakdown
  (`session-recap.js` `_liftSetGrid`) renders role chips from the SNAPSHOT's stored role (MRS
  numbered in order), never re-derived from the current program; old workouts without role
  metadata render unchanged. Files: `js/programs/jt-shed-model.js`, `js/engine.js`, `js/state.js`,
  `js/workout.js`, `js/templates.js`, `js/session-recap.js`, `css/styles.css`,
  `scripts/jt-shed-browser-check.mjs`, `tests/jt_shed_block2_backoff.test.js` (+17 cases:
  W7–W11 percentages, rounding, recalc/clear semantics, override protection, materialised
  stamps, snapshot immutability, warm-up/extra-set role stability, omitted-set representation,
  history role rendering, old-workout compat, non-J&T untouched). Browser check Scenario D
  (main-lift days) drives live recalc → override → warm-up/extra-set role stability → reload
  persistence → finish-with-omitted-set → history breakdown role chips. Evidence: `node --test`
  1275/1275, typecheck + smoke + precache:check + workflow:check green, full Playwright J&T
  browser check passed (A–D). Cache advances to v121. Next: TM management from the workout
  (weeks 1–5 back-off suggestion needs an entered training max) and per-set notes.

- 2026-07-24 · Jacked & Tan: Shed Edition — logger set-role rendering on
  `claude/jacked-tan-shed-logger-p9nco1`. The tier-aware resolver already produced the correct
  set COUNTS + rich card label, but the live cockpit still drew generic identical "Log S1/S2…"
  rows: the structured `setPlan` roles (top set / back-off / plus / target / MRS / light /
  assessment) were resolved but never shown per row. Added a pure `jtSetRoleTags(setPlan)`
  formatter (`js/programs/jt-shed-model.js`) that maps each set-plan entry to a short role tag
  (numbering MRS in order; plain straight-set `work` stays untagged so ordinary sets are
  uncluttered). `js/workout.js` maps those tags onto the WORKING set rows in prescription order
  (warm-ups skipped, so an inserted warm-up never shifts the top-set/back-off labels; appended
  extra rows get no tag), and `buildSetRow` (`js/templates.js`) renders a full-width role chip
  + `data-set-role` on both the row and the tag. RENDER-ONLY: nothing is stamped onto stored
  sets (still plain `{w,r,c}`), so draft/reconcile/warmup predicates, snapshots, completed
  history and analytics are byte-for-byte unchanged; non-J&T programs pass `roleTag=null` and
  are unaffected. CSS: `.set-role-tag` chip, warm/blue accents for the load-driving rows,
  light+dark. Tests: `tests/jt_shed_logger.test.js` (11 cases — T1 top-set/back-off/plus labels
  tracking the weekly rep-max, week-6 single + week-12 assessment, T2b/T2c + T3 target/MRS
  numbering, T2a/pull-up/spec-row/core untagged, week-6 recovery/light, defensive junk input,
  `buildSetRow` role markup + generic-program no-tag + warm-up suppression, tag-count == set-
  count per tier). Browser check extended (`scripts/jt-shed-browser-check.mjs` B4h–B4l): real
  cockpit T1 rows read `['repmax','backoff','backoff','plus']` with a "Back-off +" plus
  indicator + "Top set · 10RM" label, and an expanded accessory reads `['target','mrs','mrs']`.
  Local evidence: `node --test` 1258/1258, typecheck + smoke + precache:check + workflow:check
  green, and the full Playwright J&T browser check passed (Chromium available here). Cache
  advances to v120. Next: consider surfacing the same role labels in completed workout history
  (re-derivable from the snapshot's program/week/day + working-set index) and dynamic T1
  block-2 back-off load recalculation in-session.

- 2026-07-24 · Jacked & Tan: Shed Edition — tier-aware prescription fix on
  `claude/jacked-tan-shed-edition-52x0g5`. Root cause: every J&T lift is a bare string with
  no inline spec, so `liftTarget`/`prescribeSetsForLift` fell back to the single shared
  `weeklyVolModifiers` week value (`{sets:4, reps:10}`) for ALL exercises — the "everything is
  4 × 10" bug, affecting both generated set counts and every prescription label. Fix: a central
  tier-aware resolver (`resolveJtPrescription`/`jtLiftTarget`/`jtSchemeFor` in
  `js/programs/jt-shed-model.js`) returns one structured prescription per program/week/day/
  exercise (tier, sets, targetReps/repRange, percentage+source, repMax+back-off, plus-set,
  MRS count, loadMode, displayLabel, setPlan). `liftTarget`/`prescribeSetsForLift` take an
  optional `ctx` and delegate to it only when `program.progressionModel === 'jt-shed'` (all
  other programs byte-for-byte unchanged). Threaded that ctx through EVERY resolution surface:
  `verifyWeekStorageSchema` (materialise + reconcile), `reseedActiveProgramIntoWeek`,
  `reconcileActiveProgramEdits` (state.js), cockpit label + reset/blank materialisers
  (workout.js), day preview + sample session (detail.js), week-view schedule (schedule.js),
  session completion/adherence (completion-policy.js), volume guide and program export.
  Per-set roles (target/MRS/back-off/plus) are a RENDER concern in `setPlan` and are NOT
  stamped onto stored sets, so `hasUnfinishedEditedSet`/`reconcilePrescribedSets`/warmup
  predicates are unaffected (a fresh J&T day is not mis-detected as a started draft). Logged
  sets and user notes are preserved; the existing non-destructive reconcile only pads blank
  rows to the corrected per-tier count. Week 1 now resolves correctly per day (T1 10RM + 3×6
  @ 70% +, T2a 4 × 10 @ 50%, T2b/T2c 15RM + 2 MRS, T3 20RM + 2 MRS, Pull-Up 3 × 6–10, Saturday
  row 4 × 8–12, core 3 × 6–15), and the Monday week-view shows 23 working sets (4+4+3+3+3+3+3)
  not 28. Tests: `tests/jt_shed_prescription.test.js` (13 cases — all 15 required scenarios
  incl. same-day tier divergence, missing-TM no-4×10 fallback, independent week changes, no
  non-J&T regression, snapshot/notes preserved) plus the existing 19-case suite (32/32).
  Browser check extended to assert day-preview specs (Back Squat not 4×10; only T2a shows
  4×10 per day; Saturday row 4×8–12) and real cockpit generated set counts + tier labels.
  Local: typecheck, precache:check, smoke green; `node --test` 1237/1238 (the one failure is
  the pre-existing `route_db_migration.test.js`). Cache advances to v119. Browser suite is
  CI-only here (Playwright not installed locally).

- 2026-07-24 · Jacked & Tan: Shed Edition program on `claude/jacked-tan-shed-edition-52x0g5`.
  New 12-week, five-day home-gym program added through the EXISTING catalog shape
  (`js/programs/catalog/jt-shed.js`: `days{}` bare-string lifts + `weeklyVolModifiers`),
  registered via the catalog aggregator, so activation/switch/cockpit/day-preview/persistence
  reuse the standard path — one library entry, no parallel program model, no duplicate on
  activation, and existing programs/completed workouts untouched. The tiered per-exercise/
  per-week progression maths (T1 rep-max + back-off, T2a percentages, T2b/T2c/T3 target-rep,
  pull-up and Saturday-row double progression, TM rounding + honest missing-TM handling) and
  the authored program/week/day/exercise notes live in a pure, side-effect-free model
  (`js/programs/jt-shed-model.js`) surfaced additively in the program detail view (program
  notes, per-week phase brief that tracks the selected week, expandable per-exercise coaching
  notes) — nothing mutates state or the program definition. User session notes reuse the
  existing per-day snapshot (`state.weeks[wk].notes[day]`), kept separate from the static
  authored notes. Tests: `tests/jt_shed_program.test.js` (19 cases — registration, single-copy
  activation, five-day schedule, per-day exercises, full T1/T2a/T2b/T2c/T3 tables for all 12
  weeks, pull-up + Saturday-row exceptions, deload/pivot/assessment weeks, TM calc/rounding,
  missing-TM handling, note content, session-note snapshot persistence + reload, completed-
  workout snapshot protection, program-switch isolation, no-duplicate creation, existing-program
  regression). Browser check `scripts/jt-shed-browser-check.mjs` (wired into the required list)
  drives library→preview→notes→per-day exercises (Pull-Up on Tue, Band Lat Pulldown on Sat)→
  activation→session-note save+reload→switch-away-and-back isolation. Local evidence: typecheck,
  precache:check, workflow:check, smoke green; `node --test` 1224/1225 pass (the one failure is
  the pre-existing `route_db_migration.test.js`, which needs the `fake-indexeddb` dev dependency
  absent from this environment — unrelated to this change). The Playwright browser suite is
  CI-only in this environment (Playwright not installed locally), so the new browser check was
  verified for syntax + skip-path but runs for real in CI. Cache advances to v118.

- 2026-07-24 · EZ-bar equipment + Copy-program-as-text on
  `claude/program-editor-mobile-picker-wr1kn6`. (1) EZ bar is now a proper canonical
  equipment type (`ezBar`) with a readable label, added to the exercise-equipment vocabulary,
  the settings/onboarding/default equipment model (opt-in, never assumed for existing users),
  the substitution equipment gate, `compare.js` equipmentFit, the workout label map, and the
  Settings UI. `ez_bar_curl` keeps its stable id but is reclassified from `barbell` to `ezBar`
  with expanded aliases (EZ Bar/E-Z Bar/EZ curl bar/Ezy bar…); `Barbell Curl` stays a separate
  straight-bar exercise. Added EZ-Bar Skull Crusher (distinct from the dumbbell `skull_crusher` —
  its "Lying EZ-Bar Triceps Extension" aliases stay off the dumbbell one), EZ-Bar Reverse Curl,
  EZ-Bar Overhead Triceps Extension, EZ-Bar Close-Grip Bench Press, EZ-Bar Spider Curl and
  EZ-Bar Upright Row. New pure `searchExercises` gives the picker token-based ranked search so
  "ez bar skull crusher" ranks the EZ-bar variation first while "lying skull crusher" surfaces
  both. (2) New "📋 Copy for AI review" action on Program Detail and Active Program copies the
  CURRENT resolved program (personal/edited wins over catalog) as deterministic GPT-friendly
  Markdown via a pure, DOM-free serializer (`js/programs/program-export.js`): all seven days
  incl. rest days, `day.lifts`-owned exercise names/order with `liftTarget` prescriptions,
  narrative-only session notes (stale desc names and prose can't leak), cardio lines, every
  progression week in order, and program metadata — no personal history/health/account/internal
  ids. A shared `copyTextToClipboard` (`js/ui/clipboard.js`) uses the async Clipboard API then a
  hidden-textarea fallback, and a select-and-copy preview modal opens when both fail (honest
  success/failure toasts). Copying mutates nothing. Evidence: 1,208 JS tests (+22; new
  `program_export` incl. real home_gym_rebuild_5day edited-personal regression, extended
  `exercise_catalog` for EZ-bar identity/equipment/search), typecheck, smoke, precache green;
  new `copy-program-browser-check.mjs` proves the edited personal text reaches the clipboard
  (mocked + fallback) through the real UI with no state mutation, registered in
  `run-browser-checks`. The export's Equipment line is the union of the program's declared
  equipment AND the equipment inferred from the current `day.lifts` (canonical-catalogue
  resolved, deduped, canonical-order), so an edited program that adds EZ-Bar work honestly
  discloses "EZ bar" — never the user's whole Settings kit, never stale desc/source equipment.
  Copy is a SECONDARY utility: on Program Detail it lives in a new compact "⋯" overflow menu
  (`js/ui/action-menu.js` — anchored, viewport-clamped, closes on outside tap / Escape /
  Android Back via `__onAndroidBack` / after selection, focus returns to the trigger, no leaked
  document listeners) and on Active Program it's a small ≥44px clipboard icon beside the rating
  control — no large full-width button, primary Edit/Activate stays dominant. Visible wording is
  the neutral "Copy program"; the toast is "Program copied". Cache advances to v117. · Next: none.
- 2026-07-23 · Program-editor preview consistency, canonical exercise names, mobile picker +
  home-gym exercises on `claude/program-editor-mobile-picker-wr1kn6`. Fixed the reported phone
  bug: the Lower Strength day-preview kept showing stale/narrative exercises after an edit. Root
  cause was two-fold — (A) the day-preview sheet's fallback renderer parsed `day.desc` with a
  broad regex, so the narrative "Squat + hinge foundation." merged into "Back Squat" and a removed
  "Weighted Sit-Up" kept rendering; (B) the preview merged the source catalog day OVER the personal
  day. Now `day.lifts` is the single canonical source of exercise names/order on every surface;
  each lift resolves its prescription through `liftTarget` (exact desc label → week modifier), the
  broad `_parseDescExercises` parser is deleted, and a personal/editable program day is authoritative
  (`isCustomProgram`) so the source catalog can never override an edited day (also flipped
  `library.js` next-workout + `detail.js` merge to prefer the resolved personal program). New central
  mutation helpers in `editor-model.js` (`replaceProgramExercise`/`add`/`remove`/`move`/
  `makeProgramDayRest`) keep the duplicated `day.desc` label and `workoutPreview.exercises` in sync —
  a replacement inherits the old slot's exact "(3×15)" label without touching surrounding prose, and
  stale preview entries can't reappear; the builder now routes every structural edit through them.
  Mobile picker: rebuilt as a top-anchored, near-full-screen modal sized to the REAL visible
  viewport via new `js/ui/visible-viewport.js` (publishes `--visible-viewport-height` from
  `window.visualViewport`, tracks resize/scroll/orientation, cleans up on close) so search results
  stay above the on-screen keyboard; results scroll independently, header+search stay pinned, desktop
  stays a centered card. Exercise library: added `Barbell Standing Calf Raise` (distinct barbell+rack
  variation) plus 17 home-gym exercises (barbell shrug/floor press/glute bridge/reverse lunge/
  Bulgarian split squat/step-up, band row/pull-through/overhead-triceps/good-morning/RDL, dumbbell
  front squat, Zercher/pin/tempo squat, landmine row, rack pull, single-leg dumbbell calf raise) and
  dumbbell/seated aliases; generic `Calf Raise(s)` still resolves deterministically to the dumbbell
  standing entry, no alias collisions. Evidence: 1,186 JS tests (+27; new `program_editor_sync`,
  `visible_viewport`, extended `exercise_catalog`), typecheck, smoke, precache green; new real-UI
  browser checks `program-preview-consistency-browser-check.mjs` (real `home_gym_rebuild_5day`:
  activate→edit→replace Weighted Sit-Up with Seated Calf Raise→preview+cockpit agree, 3×15 inherited,
  reload persists, source catalog untouched, no dupe) and `exercise-picker-browser-check.mjs`
  (390×844 with a simulated keyboard viewport) both registered in `run-browser-checks`. Manual
  Android verification steps in `docs/android-program-editor-checklist.md`. · Next: none.
- 2026-07-22 · Edit-active-built-in identity transfer on `claude/hybridq-audit-review-h86qze`.
  Fixed the remaining gap: editing the ACTIVE program only worked when it already lived in
  customPrograms — for an active BUILT-IN, `customizeProgram` created a personal copy but left
  `activeProgramId` on the catalog id, so every active view kept showing the old exercises. New
  `ensureActiveProgramEditable()` (state.js) transfers the active identity to the primary personal
  copy (reuse/adopt/fork-keeping-name) and retargets the active activation record's `programId` —
  SAME activation, SAME currentWeek, history untouched; it is NOT a program switch (no Week 1
  reset, no archive, no pause). `editActiveProgram()` (app.js) drives it + refreshes views; wired
  to a new active-plan "✏️ Edit program" button and the detail screen's action for an active
  built-in (Edit, not Customize). Also fixed a `Date.now()` id-collision hazard earlier in the
  session. New browser Scenario C uses a real active built-in (`stronglifts_5x5`, empty
  customPrograms): proves the id transfers built-in→personal, week/activation preserved, no
  duplicate, immediate detail+cockpit refresh with no reload, reload keeps the personal id (built-in
  not restored), and re-Edit reuses the same copy. Scenario A relabelled "active personal program
  edit". Verify green: 1,168 tests (+5), typecheck, smoke, precache, editor + active-edit browser
  checks. · Next: none.
- 2026-07-22 · Active-program edit e2e browser check on `claude/hybridq-audit-review-h86qze`.
  Added `scripts/active-program-edit-browser-check.mjs` (registered in run-browser-checks): drives
  the real UI — cockpit (the next-workout surface, one tap from Home), program detail, day-preview
  and builder — asserting on specific elements (`.cockpit-ex-name`, `.wpm-exercise-item span`), not
  page text. Scenario A: active personal program shows "Edit" (not Customize); editing in place
  makes detail AND cockpit reflect the new exercises with NO reload and a single navigation; exactly
  one program (no duplicate); reload/hydration keeps the edit and the active id. Scenario B: a
  Bench-Press set completed before the edit stays byte-for-byte in storage and the started day never
  absorbs the new exercise, while the template updates for future workouts. No app defect found —
  the only fixes were test artifacts (init-script reseeding on reload; set-complete selector). All
  green: 1,163 tests, typecheck, smoke, precache, editor + new e2e browser checks. · Next: none.
- 2026-07-22 · Program identity edge cases on `claude/hybridq-audit-review-h86qze`. Hardened the
  customization model: `findPersonalCopyOfSource` (first-match by array order) is replaced by an
  explicit three-state `isPrimaryCustomization` (`true` = the one primary a built-in's Customize
  reopens · `false` = a deliberate variant, e.g. the Duplicate action · `undefined` = legacy).
  `customizeProgram` opens the explicit primary, else adopts a LONE legacy copy
  (`adoptLegacyPrimaryCustomization`, idempotent, never guesses when ambiguous), else forks a new
  primary; variants can never be opened by mistake and deleting the primary deterministically
  forks a fresh one. Fixed a real id-collision bug: `duplicateCustomProgram`/`createCustomProgram`
  used `prog_${Date.now()}` which minted DUPLICATE ids in the same millisecond (fork-then-
  duplicate) — now `newProgramId()` adds a random suffix. Added active-program propagation proof
  (edit reseeds future untouched weeks via the stable id; completed + in-progress sessions stay
  immutable; survives reload) and a "From <template>" attribution line on My Programs cards so
  same-template copies are identifiable/removable (Delete already safe; no auto-delete, no merge).
  Verify green: 1,163 tests (+9), typecheck, smoke, precache, editor browser check. · Next: none.
- 2026-07-22 · Stable program-edit identity on `claude/hybridq-audit-review-h86qze`. Root cause
  of "editing a program spawns a duplicate that shows the OLD exercises": the program-detail
  "Customize" button was shown for EVERY program and `customizeProgram` unconditionally cloned
  (`duplicateCustomProgram`) — so editing a program you already own forked a new "(Copy)" while
  the detail you were looking at still showed the original. There is NO revision system; all
  read paths already resolve one canonical record (`getProgramById` → `customPrograms`), proven
  by reproduction, so the fix is identity/entry, not storage. Now: a personal program is edited
  IN PLACE (detail shows "✏️ Edit" → `open-builder`, no clone); a built-in forks ONCE into a
  personal copy tagged with `sourceProgramId`, and re-customizing reuses that copy
  (`findPersonalCopyOfSource`). `sourceProgramId` is additive/optional so no migration is needed
  and existing user copies are left intact (never deleted). Verified end-to-end in Chromium
  (Edit in place, +1 exercise, card count stays 1). Verify green: 1,154 tests (+4 customize),
  typecheck, smoke, editor browser check. · Next: none blocking.
- 2026-07-22 · Recovery Trends + editor save fix on `claude/hybridq-audit-review-h86qze`.
  (1) Extended the shared period-totals engine to a third surface: `recovery-performance.js`
  + `views/view-recovery-performance.js` give a 7D/4W/1Y view of the manual wellness check-in
  (`state.wellnessLog`: sleep / mood / soreness), proving the core generalises from sums to
  AVERAGES — soreness is inverse (lower is better), each metric is pre-filtered to days it was
  actually logged so an empty bucket is an honest "—", never a zero. Opened from a "Recovery
  Trends" CTA on the Recovery overview. Works fully offline (no Health Connect needed).
  (2) Program editor could fail silently ("edit doesn't apply at all"): handlers persist before
  re-rendering, so an uncaught throw in `persistProgram` (reconcile) or a section renderer left
  the change unrendered. Hardened both — reconcile/save wrapped, save result reported honestly
  (a suppressed local write no longer shows a false "Saved"), and each editor section renders
  defensively. Verify green: 1,150 tests (+6 recovery), typecheck, precache (cache → v114),
  smoke; new Chromium contract for Recovery Trends. · Next: confirm the editor fix resolves the
  reported symptom, or capture the surfaced error.
- 2026-07-22 · Run Performance on `claude/hybridq-audit-review-h86qze`: reused the Gym
  Performance daily/weekly/yearly pattern for running. Extracted the subtle 7D/4W/1Y period +
  bin + honest partial-period comparison math into a shared engine (`js/analytics/period-totals.js`),
  refactored `gym-performance.js` onto it (output unchanged, tests green), and built
  `run-performance.js` + `views/view-run-performance.js` on the same core using the existing
  date-strict `collectRunningHistory`. Metrics are the honest summables — Distance / Time /
  Sessions (pace stays in the Running metric detail as a distance-weighted average, not forced
  into a totals chart). The Home "Run Performance" card and the running fitness-graph CTA now open
  it (fixing a label/behaviour mismatch — the card already said "Run Performance"). Reuses the
  `gym-performance` CSS; adds favourable/unfavourable comparison tint (amber, not red, so a
  partial-week dip is attention not alarm). Verify green: 1,144 tests (+5 run-performance),
  typecheck, precache (cache → v112), smoke; new Chromium contract mirrors the gym one. · Next:
  optional rTSS running-load refinement; consider a Recovery period-totals view on the same core.
- 2026-07-22 · Audit review on `claude/hybridq-audit-review-h86qze`: traced the recent gym-
  performance, logger-history, completion-policy, sync-recovery and program-editor work through
  their call sites and persisted state. Recent changes hold up — warm-up exclusion, calendar/
  program-week separation, session identity, "use previous values" (fills blanks, never sets
  `c`), and partial-period comparisons are all correct and well tested. One genuine defect fixed:
  the Gym Performance detail counted note-/RPE-only days (zero working sets, no recorded duration)
  as workouts, inflating the Sessions total and the "N workouts" evidence while they contributed
  nothing to Sets/Volume/Time. `buildGymPerformance` now counts only sessions with real trained
  work (a valid working set OR a recorded duration, so duration-only FIT imports still count).
  Verify green: 1,139 tests (+1 regression), typecheck, smoke and Chromium checks pass. · Next:
  none blocking; consider aligning the same "real session" definition across other gym counters.
- 2026-07-23 · Android backup/export invocation fix on `codex/android-auto-backup-fix`:
  reproduced the Sentry `TypeError: Illegal invocation` with WebView-strict timer doubles and
  corrected the receiver for automatic folder selection/writes, manual JSON/CSV export and the
  browser save picker. Full verify is green with 1,138 tests and cache advances to v111. Local
  Android Gradle/ADB are unavailable, so required PR CI must compile the release shell and the
  physical APK checklist must confirm folder selection plus first/manual/session backup. · Next:
  review/merge the hotfix, install the new APK and run the portability rows.
- 2026-07-23 · R30 Gym Performance and logger history on `codex/gym-performance-logger`:
  added an exact Garmin-style 7D/4W/1Y Gym Performance detail from Home, canonicalized strength
  duration, made previous workout sets and exact activity context useful in the logger, and
  replaced the premature plateau label with an evidence-gated progress check. Unit/render/model
  coverage includes same-day and archived sessions, future/undated exclusions, legacy duration,
  blank-only value reuse and early-program progression. Every required Chromium journey passes,
  including 320/390/412px Gym Performance checks with no overflow or sub-44px controls; full
  verify is green with 1,136 tests. · Next: review/merge this independent slice, then continue
  R30 Strength e1RM/profile/calendar/balance; R15 physical-device/Play evidence remains the
  launch blocker.
- 2026-07-22 · Android import-picker fix on `codex/android-import-picker-fix`: corrected the
  WebView extension-to-MIME mismatch that prevented APK users from selecting `.json` backups
  (and could affect `.fit` files), with native fixtures for JSON, mixed/deduplicated filters,
  FIT providers, image wildcards and safe fallback. `npm run verify` is green with 1,123 tests;
  Android JVM/compile/lint/APK confirmation remains in required PR CI because local Gradle is
  unavailable. · Next: open the small fix PR, then confirm Settings and recovery-welcome imports
  with an automatic backup on a physical APK.
- 2026-07-22 · PR #158 conflict resolution on `codex/offline-auto-backups`: merged the
  Volume Guide mainline commit without rewriting history, retained both roadmap records and
  both offline module graphs, and kept the newer v109 cache boundary. `npm run verify` is green
  with 1,123 tests plus typecheck, precache, workflow policy and smoke. · Next: let required
  Web/Android PR checks complete, then run the physical automatic-backup acceptance rows.
- 2026-07-22 · Automatic offline JSON backup on `codex/offline-auto-backups`: Android now
  uses one explicitly chosen shared-storage folder for complete route-inclusive JSON backups,
  with latest + seven daily + four weekly retention, finished-session checkpoints, daily launch
  catch-up, status/manual-run/change-folder/disable controls and an unencrypted-file warning.
  Browser fallback keeps manual import/export and explains the platform boundary. `npm run
  verify` is green with 1,119 tests; the 390×844 Settings journey has no overflow or console
  errors. Local Android Gradle is unavailable in this checkout, so the new native JVM retention/
  validation tests and compile gates remain for required PR CI; physical clear-data/reimport
  evidence is still owner-run. · Next: open a PR after owner approval, then run the expanded
  Android export checklist before beta.
- 2026-07-22 · Volume Guide Phase 1 on `codex/volume-guide`: added athlete-owned Grow / Maintain /
  Track priorities, calendar-week logged versus program-week planned set credits, direct/indirect
  transparency, an eight-week muscle corridor, conditional Home card, and custom-program projected
  coverage using the logger's target resolver. Removed generic volume-band coaching/readiness
  penalties and retained neutral reference language. Unit/render/precache checks plus live browser
  journeys for priority persistence, Home origin, Plan, muscle detail, and editor preview are green;
  cache advances to v108. · Next: consider observed personal corridors only after 6–8 valid weeks
  and beta evidence; merge/rebase after the recovery-first welcome branch, while physical Android
  release evidence remains open.
- 2026-07-22 · R31 recovery-first welcome on `codex/recovery-first-welcome`: fresh/cleared
  devices now offer Set up, cloud sign-in restore and offline JSON restore before requesting a
  name. Boot's empty scaffold cannot be saved locally or uploaded while recovery is unresolved,
  closing the sign-in autosave race; real local/cloud data, validated import or deliberate setup
  releases the lock. `npm run verify` is green with 1,110 tests and every required Chromium
  journey passes at phone widths, 200% text and keyboard/modal navigation; cache advances to
  v107. · Next: review/merge this standalone data-safety PR, then prove clear-data → cloud and
  JSON restore on the physical Android owner checklist; R15/release evidence remains open.
- 2026-07-22 · Workout logger visual cleanup on `codex/program-editor-foundation`: removed
  the inline “plates per side” breakdown from progression targets while retaining the useful
  target weight/reps and the underlying tested plate-math utility. Merged via PR #155.
- 2026-07-22 · R20 program-editor foundation on `codex/program-editor-foundation`: replaced
  the storage-shaped seven-card form with a compact day-focused schedule, canonical exercise
  search/custom fallback, safe day actions, editable metadata/progression, validation and an
  exact logger preview. Active-plan edits rebuild only untouched scaffolding and preserve every
  started/logged day. Unit/reconciliation tests and the required 320/360/390/412px + 1.5× text
  Chromium journey are green; cache advances to v106. · Next: review/merge this independent
  foundation; keep normalized per-exercise prescriptions in the deferred R20 ADR/multi-PR work.
- 2026-07-22 · R30 Strength volume-family detail on `codex/r30-strength-metrics`:
  4-Week Volume, Volume Progression and Muscle Set Credits now derive from one date-strict
  history, open dedicated 4w/12w/6m/1y/all details, disclose their calculation/limitations and
  retain exact workout IDs for Activity evidence. The cards no longer describe program-week
  buckets as calendar volume; volume direction is neutral rather than automatically good/bad.
  Archived activations, future/undated exclusions, warm-up/incomplete filtering, zero states,
  comparison periods, routes and render contracts are covered by the 1,099-test suite.
  Full verify (1,099 tests) and every required browser gate are green; a 390×844 in-app browser
  journey also has no console errors or horizontal overflow. · Next: review
  and merge this independent slice, then address Strength e1RM/profile/calendar/balance as the
  next R30 PR; R15 physical-device/Play evidence remains the launch blocker.
- 2026-07-20 · Hybrid Score consistency early-week fix on `claude/hybrid-score-audit-gimuci`
  (follow-up to the same session's volume fix below). User reported the score still read "27%
  of this week done" on a Monday and felt *marked down for completing today's session*. Two
  root causes confirmed by deterministic repro: (1) the Consistency baseline `avgConsistency`
  **included the in-progress current week**, so a week that is only 27% done because it just
  started dragged the program-long baseline from 100→85 every Monday; (2) the pillar judged
  adherence as done ÷ the **whole week's** plan, so a completed Monday read ~27% and the driver
  said "27% of this week's plan done". Fix: `avgConsistency` now averages **completed weeks
  only** (`js/home/dashboard-model.js`); the model additionally computes **scheduled-to-date**
  adherence (`consistencyPctToDate` — only days strictly past this week, keyed off today's LOCAL
  weekday so no `weekStartedAt` UTC skew, plus any day already trained), and the Consistency
  pillar + its signals now judge on that (`js/brain/hybrid-score/pillars.js`), with the
  whole-week `consistencyPct` preserved for progress tiles. Also: the Strength upkeep no-basis
  default was lowered 60→50 (the formula's true centre) so logging a merely on-pace session can
  no longer *lower* the pillar, and `project.js` advances the to-date view so the "train today
  → +N" projection stays consistent. Result on the repro: baseline 85→100, Consistency pillar
  86→100, signal "27% of this week's plan done" → "on track — up to date this week"; Monday
  morning holds at baseline (nothing due yet, not a miss); a genuinely missed *past* session is
  still surfaced. New `tests/hybrid_score_consistency_todate.test.js` (7 fixed-date cases:
  baseline exclusion, Monday-after-workout, Monday-morning, log-never-lowers-score,
  future-not-missed, real-miss-still-shown, whole-week preserved). `npm test` 1082/1083 (the one
  fail is the pre-existing `fake-indexeddb` dev-dep), typecheck + smoke green. · Next: consider
  reframing the Home progress-tile copy and unifying `avgConsistency`/`weekCompare` collectors.
- 2026-07-20 · Hybrid Score partial-week comparison fix on `claude/hybrid-score-audit-gimuci`.
  Full audit of the eight-pillar Hybrid Score (engine + pillars + dashboard model). Confirmed
  the reported Monday bug: the **Strength** pillar's volume-upkeep term (and the **Endurance**
  pillar's distance-volume term) compared the current *in-progress* week's cumulative total
  (e.g. one Monday session) against completed prior weeks' full totals, so an early week read as
  a "volume down" decline even when today's session out-lifted the equivalent day last week.
  Reproduced deterministically: this Monday 1620 kg > last Monday 1590 kg, yet the pillar
  emitted "lifting volume down" and scored 68 instead of 81 (the misleading decline also dragged
  the day-over-day score delta). The dashboard's `model.week.volume`/`calendarWeek` tiles were
  already pace-matched and correctly showed "+30 kg / up 2%" — only the Hybrid Score pillars
  still read the raw program-week series. Fix: added a shared `paceMatchedWeekVolume` selector
  (`js/brain/load_models.js`) that judges the current week only over its trained weekdays vs the
  SAME weekdays across the trailing weeks, and routed both pillars' volume terms + their
  "volume rising/down" captions through it (`js/brain/hybrid-score/pillars.js`). Progression
  terms (e1RM, best-effort pace, VDOT) are max-based and already partial-week-safe, so were left
  unchanged; the Consistency E1 baseline-anchor already prevents the Monday consistency cliff
  (verified, not assumed). Audit also confirmed no timezone/date-boundary or double-counting
  regressions in the changed paths (Recovery already excludes ACWR; Momentum reads past scores).
  New `tests/hybrid_score_partial_week.test.js` (10 deterministic, fixed-date cases: Monday
  one-workout on/below pace, partial vs full week parity, Wed week-to-date, completed-week
  compare, different-weekday weeks, endurance). `npm test` 1075/1076 (the one fail is the
  pre-existing `fake-indexeddb` missing-dev-dep in `route_db_migration.test.js`, unrelated),
  typecheck + smoke green. · Next: consider unifying the dashboard's inline `paceMatchedPrev`
  onto the shared selector, and pace-matching the eScore `weeklyAvgDist` input.
- 2026-07-20 · Pages-deploy resilience on `claude/hybridq-product-audit-0bp0e9`. The Deploy
  Pages run for the merged metrics fix failed in the `deploy` job at `actions/configure-pages@v5`
  with a transient GitHub Pages API 5xx ("No server is currently available to service your
  request"); `verify` (web + Android + required real-browser checks) had passed, so this was a
  platform hiccup, not a code defect, and a manual re-run of the failed job published cleanly.
  Root gap: the workflow's auto-retry wrapped only the Deploy step, so a transient failure in
  the earlier `configure-pages`/`upload-pages-artifact` steps skipped the retry and failed the
  whole run. Hardened `.github/workflows/pages.yml` to give configure, upload and deploy each one
  automatic retry (continue-on-error + a conditional second attempt + a short pause), with a
  single terminal gate that fails only if the deploy never succeeded — mirroring the existing
  native pattern rather than adding a third-party retry action (supply-chain posture).
  `npm run workflow:check` still passes. · Next: continue R30 Stage 4–5 analytics slices.
- 2026-07-19 · Today's-Summary modal metric-consistency fix on
  `claude/hybridq-product-audit-0bp0e9`. A full new-user → onboarding → home → workout →
  finish browser pass (390 px) confirmed the core loop, warm-up exclusion, lifecycle Finish
  and honest empty states are all correct. It surfaced two real defects in
  `openTodaySummaryModal` (`js/app.js`), the "Today" dashboard tile: (1) the run-pace line
  used an inline `MM:SS`-only split, so an `HH:MM:SS` time (any run ≥1 h — long runs, most
  GPS sessions) read only the hours and rendered a wildly wrong pace (e.g. 12 km in 1:05:30
  showed ~0:05/km instead of 5:28/km); (2) the "vs last week" baseline counted warm-ups while
  the current-week headline excluded them, skewing every Volume/Sets delta whenever the prior
  session logged warm-ups. Both now route through the canonical, tested primitives —
  `paceSecondsPerKm` (engine, `HH:MM:SS`-aware) and `strengthDayStats` (weekly-aggregate,
  warm-up/incomplete/zero-rep-excluding) — removing the divergent inline loops so this modal
  can no longer disagree with the rest of the app. Regression: new `strengthDayStats` unit
  test (`tests/weekly_aggregate.test.js`) locks warm-up/zero-rep exclusion + honest delta;
  the pace path is covered by the existing `paceSecondsPerKm` `h:mm:ss` tests. Verified in a
  390 px Chromium drive: pace 5:28/km, vs-last-week +100 kg / equal sets. `npm run verify` is
  green with 1,075 tests, plus typecheck/precache/workflow/smoke. · Next: continue R30 Stage
  4–5 analytics slices; device/Play/legal owner gates remain open.
- 2026-07-19 · Timezone misdating of today's activity on
  `claude/workout-missing-analytics-history-j9dudu`. Root cause: `resolveSlotDate`
  (`js/analytics/logged-days.js`) reconstructed a slot's calendar date by serializing a
  locally-built `Date` through `toISOString().slice(0,10)` — UTC — so in any zone ahead of
  UTC (the app default is Australia/Sydney) an evening session resolved one day early. That
  resolver feeds the GPS-run start date fallback and the quick-start/manual-run "date → slot"
  mapping, so a run started *today* could be filed under *yesterday* and vanish from today's
  Activities list and this-week analytics. Fixed to anchor on `localDayKey` + `addDaysISO`
  (canonical local-date API); the source guard no longer allowlists that file. Also hardened
  the deliberate Finish to stamp the local date (`_ensureWorkoutDateStamp`) so a completed
  session — even one whose completed sets arrived via sync/import without a local stamp — can
  never finish undated (undated = excluded from calendar analytics and sorted to the bottom of
  history). The strength log/read path was verified correct end-to-end and left unchanged.
  Regression tests: cross-timezone `resolveSlotDate`/`resolveDateToSlot` local-day
  reconstruction (`tests/logged_days.test.js`, proven to fail under UTC+14 with the old code)
  and finish-stamps-undated-workout (`tests/workout_logging.test.js`). `npm run typecheck`,
  `precache:check`, `npm run smoke`, and 1,064/1,065 tests pass across UTC / UTC+14 / UTC−12
  and Australia/Sydney; the one failure is the pre-existing missing `fake-indexeddb` dev
  dependency in `tests/route_db_migration.test.js` (red on clean `main`, unrelated).
- 2026-07-20 · Sync recovery + workout-session integrity on
  `codex/sync-recovery-workout-session`: protects newer cloud state before replacement and
  exposes recovery in Settings; adds a two-step destructive choice; quarantines foreign logged
  rows from the live workout/completion/recap projection; and scopes duration to the exact workout.
  `npm run verify` passes 1,071 tests and all required browser checks pass after making the Running
  fixture correctly exclude its future Tuesday evidence on Monday. · Next: merge this bug-fix PR,
  then continue R30 Stage 4–5 as small independent slices; device/Play/legal gates remain open.

- 2026-07-19 · R30 analytics contract + Running slice on
  `codex/analytics-contract-running`: executable inventory covers 135 distinct metrics across
  173 surface instances (five explicit non-analytic exclusions), with 30 Running metrics newly
  routed to dedicated range-selectable history, inspectable points, period comparison,
  calculation/source/confidence disclosure and exact Activity evidence. Home/Profile Running
  summaries now reuse the same date-strict all-activation history; Profile Health field drift
  and future/undated PBs are corrected. The v103 early-update/compatibility seam prevents mixed
  service-worker caches from blanking the app. `npm run verify` passes 1,062 tests; every
  required Chromium check passes, including Running at 360/390/412 px, light/dark, reduced
  motion, 200% text, empty state, Back/evidence journeys and an offline detail reload; the 1,000-activity pure detail
  model remains roughly 5–11 ms locally, while the 23-month/1,000-activity browser fixture
  opens from cold load in 2.6 s and changes to All time in 420 ms. · Next: merge this independently useful Stage 1–3 slice,
  then deliver remaining R30 Strength and Recovery/Health/Hybrid/Home/Profile metrics in small
  Stage 4–5 PRs; R23 projection confidence and physical-device/Play/legal gates remain open.
- 2026-07-19 · R29 analytics hierarchy on `codex/analytics-drilldowns`: Weekly Volume now
  opens a date-strict calendar-week detail with honest live/completed comparison, selectable
  day/workout/exercise/muscle breakdowns and exact Activity Detail evidence. Added alias-aware
  exercise and estimated muscle detail, reusable comparison/calendar aggregation, selected-week
  Running totals, date-strict Recovery RPE, neutral ACWR/TSB language, expandable Hybrid Score
  pillars, parent-aware back navigation, 44 px controls and a v102 offline cache boundary.
  Analytics inventory and limitations are consolidated above; no parallel tracker was created.
  `npm run verify` is green with 1,040 tests, and a 390×844 in-app browser pass has no
  horizontal overflow. · Next: review one stacked PR after the R28 base is merged;
  physical-device/Play/legal owner gates remain.
- 2026-07-19 · R28 e1RM/progression/history follow-up on
  `codex/exercise-volume-finish-audit`: one bounded, exercise-aware Epley source now powers
  every e1RM/PR surface; high-rep, bodyweight-effective, assisted/band and conditioning loads
  cannot fabricate strength trends or kilogram targets. Load-up requires every top-load set
  to meet the prescription, same-exercise/gym RPE can hold, unrelated lift/run RPE cannot,
  and a flat trend holds for review rather than auto-deloading. Logger history, ghosts,
  quick-log/manual autofill and recap/PR comparison now carry canonical dated history across
  weekdays, programs and archived activations. `npm run verify` is green with 1,030 tests,
  including the exact rendered program-switch card regression. · Next: review and open the
  combined R28 PR to `main`; physical-device/Play/legal owner gates remain.
- 2026-07-19 · R28 fresh logger/exercise/volume audit on
  `codex/exercise-volume-finish-audit`: explicit `in_progress|finished` lifecycle is now
  separate from adherence; deliberately skipped work can be finished while empty/warm-up-only
  sessions cannot. A 120-exercise canonical catalogue with 125 explicit aliases resolves all
  233 built-in labels without rewriting stored history; PR/history/search/swap and muscle-volume
  readers share it. Selected-calendar-week set credits now use explicit 1.0/0.5/0.25 attribution,
  valid working sets only, and typical-range/caveated copy instead of personal MEV/MRV claims.
  Undated legacy analytics and truthy completion false-positives were removed. `npm run verify`
  is green with 1,018 tests; all five required Chromium journeys pass, including explicit
  finish/keep/discard and the no-data guard. · Next: review and open one PR to `main`; R15
  physical-device, Play/legal and signed-release owner gates remain the launch path.
- 2026-07-18 · R21 + R22 with a bounded R25 extraction on
  `codex/r21-r22-release-hardening`: progression now follows exact exercises across real
  dated sessions/program runs; load/readiness duplication is removed; rolling load and
  Lifetime/Profile scopes include archived and one-off history honestly. Play privacy,
  Data Safety, deletion, and store-copy drafts were reconciled to actual behavior without
  claiming human/legal/device gates complete. `main` now requires up-to-date Web and Android
  verification through a pull request, resolves review conversations, protects administrators,
  and blocks force-pushes/deletion. `npm test`, typecheck, and smoke are green with 1,003
  tests. · Next: merge the PR after required Web/Android verification, then
  complete the physical-device and owner/legal release evidence before public beta.
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
