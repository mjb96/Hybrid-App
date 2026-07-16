# Helyx Audit Evidence Index

**Audit date:** 14 July 2026  
**Purpose:** map every material audit finding to repository evidence, executed validation, and confidence

Confidence labels:

- **Confirmed:** directly observed in source, a deterministic check, or a browser reproduction.
- **Probable:** source establishes the vulnerable behavior, but device/production frequency or outcome was not executed locally.
- **Risk:** architectural exposure requiring validation; not asserted as a current user-visible failure.

## Finding-to-evidence map

| ID | Finding | Evidence locations | Executed/observed evidence | Confidence |
|---|---|---|---|---|
| AUD-01 | Local-day fragmentation shifts records and breaks streaks. | `js/dates.js`; `js/brain/streak.js` (`isoOffset`); raw `toISOString().slice(0, 10)` producers in onboarding/home/score/recovery/settings; `tests/streak_freeze.test.js`. | `npm test`: three streak-freeze failures in Australia/Sydney. Browser onboarding on local 14 July produced a 13 July bodyweight key. | Confirmed |
| AUD-02 | Same-day run/route replacement and export collapse. | `js/run-logger.js` manual assignment; `js/gps-tracker.js` run save; `js/db.js` route upsert and `getAllRoutes`; `js/state/route-portability.js`. | Data-flow trace shows a single `weeks[week].runs[day]` slot and activation/week/day route identity; `getAllRoutes` returns legacy `week_day` keys. | Confirmed |
| AUD-03 | Failed migrations can be marked current. | `js/state/migrations.js`, `migrateState` catch/continue/final schema stamp. | Control-flow inspection: an exception does not abort the final current-version assignment. | Confirmed |
| AUD-04 | Android cannot handle the export URL produced by web code. | `js/settings.js` JSON download; `js/state/import-export.js` CSV download; `MainActivity.kt`, `handleDownload`; native `saveTextFile` bridge. | Web creates `blob:` URLs; native handler branches only for `data:`, `http:`, and `https:` and export does not call the native text-file method. Device outcome still needs execution. | Confirmed integration gap; device UX probable |
| AUD-05 | Release publication bypasses verification dependencies. | `.github/workflows/tests.yml`; `android.yml`; `pages.yml`; `release.yml`. | Workflow trigger/dependency review; current `npm test` is red while release/deploy workflows remain independently triggerable. | Confirmed |
| AUD-06 | Onboarding goal/equipment state is incomplete. | `js/onboarding.js`, `_finish`; settings equipment rendering/consumers. | Browser selected True Hybrid/Beginner/Home; Settings retained detailed gym equipment. Selected goal is held transiently but not assigned to durable fitness-goal settings. | Confirmed |
| AUD-07 | Global week phases are used for program-specific meaning. | `js/home.js`; `js/app.js`; `js/brain/hybrid-score.js`; compare modifier-aware phase use elsewhere. | Source reference trace found shared global `WEEK_PHASE_NAMES` consumers independent of selected program modifiers. | Confirmed |
| AUD-08 | Progression history is limited to same weekday/current numeric weeks. | `js/engine.js`, `computeDiagnosticForLift`; `findLastPerformance` helper and call sites. | Loop/query inspection shows earlier numeric weeks and same `dayKey`; archived activation keys/other days are not queried. | Confirmed |
| AUD-09 | Prescription schema is too coarse for much of the marketed training depth. | `js/schema.js`; `js/engine.js` `liftTarget` and text parsing; `js/programs/catalog/*.js`. | Catalog scan: 56 programs; 41 with lifts; 539 lift slots; 33 detected inline description overrides; 40/41 lift programs with no detected override coverage. | Confirmed model limitation |
| AUD-10 | Readiness/advice can overstate sparse evidence. | `js/analytics/readiness-scoring.js`; `js/analytics/recommendations.js`. | Formula inspection shows weight renormalization across available signals without returned signal count/confidence; copy branches can recommend PR/time trial from aggregate load state. | Confirmed |
| AUD-11 | Health field controls do not match permission/read behavior. | `js/health/health-bridge.js`; Settings `syncFields`; `HybridHealthBridge.kt`; `AndroidManifest.xml`; `HealthSyncWorker.kt`. | Source contract trace: JS requests all permission types; selections are not used to filter apply/request; VO2 toggle has no native reader; permission declarations/readers diverge; worker snapshot has no reader. | Confirmed source mismatch; device behavior unverified |
| AUD-12 | Closed dialogs remain accessible/focusable. | `index.html` dialog/sheet markup; associated UI controllers. | Chromium accessibility/DOM inspection found 13 inactive dialog-like containers with focusable descendants and without `inert`/`aria-hidden`; several retain `aria-modal=true`. | Confirmed |
| AUD-13 | Mobile targets/type are often undersized. | Core HTML/JS renderers and CSS files. | Geometry inspection at 390×844: 115/129 visible interactive elements had width or height below 44px; examples included tabs, chips, bookmark, overflow, and dots. CSS audit found many ~0.5–0.68rem declarations. | Confirmed measurement; prioritization requires judgment |
| AUD-14 | Arbitrarily partial sessions receive completion celebration. | `js/workout.js` finish/modal path; separate completion predicates consumed by Brain/analytics. | Browser: logged one of 12 prescribed lift sets, no prescribed run, tapped Finish, received “Session Complete / Great work today.” | Confirmed |
| AUD-15 | Interval recovery text is classified as Recovery. | `js/workout.js`, `_detectRunType`. | Browser displayed `6×800m (90s recovery)` as Recovery; source checks recovery token before interval patterns. | Confirmed |
| AUD-16 | CSV omits archived activations and has incomplete escaping. | `js/state/import-export.js` CSV generation. | Archived keys are passed through `Number(...)` and skipped as `NaN`; row values are not handled by one standards-compliant CSV escape routine. | Confirmed |
| AUD-17 | Remote JavaScript executes at the privileged origin. | `index.html` CSP/script tags; Android trusted-origin/bridge setup; staging/build files. | Supabase remote asset is SRI-pinned; Sentry remote asset is not; jsDelivr is CSP-allowed and page owns native interfaces. No vendor compromise is asserted. | Confirmed exposure / Risk |
| AUD-18 | Active native GPS points were process-memory only. | `GpsPointStore.kt`; `GpsTrackingService.kt`; `GpsSessionJournal.kt`; `js/gps/route-quality.js`; `tests/gps_route_quality.test.js`; `docs/android-gps-device-checklist.md`. | Remediated 16 July: active metadata/fixes are atomically journalled, process recovery is explicit, and shared web/native filtering retains raw-vs-filtered audit metadata. JVM recovery/corruption tests and deterministic teleport/accuracy/replay fixtures pass; the supplied physical OEM-kill matrix remains a release gate. | Automated remediation confirmed; device outcome pending |
| AUD-19 | Route start timestamp becomes stop time. | `js/gps-tracker.js`, `stopTracking`. | `_startTime` is cleared before route construction uses it, causing fallback to current/stop time. | Confirmed |
| AUD-20 | Imports are shallow and imported/display strings expand markup risk. | `js/state/import-export.js`, `isAppState`; avatar render paths; `js/brain/celebration.js`. | Validation checks a small top-level shape; celebration title can include first name and is interpolated via `innerHTML`; avatar source is interpolated from imported state. | Confirmed exposure |
| AUD-21 | Activation can archive a partial current session; no prior-run resume. | activation confirmation/start flow; `js/state/activation-identity.js`; program detail/activation UI. | Source/UI review: warning is non-blocking, activation archives foreign weeks, library activation creates a new run rather than resuming prior activation. | Confirmed |
| AUD-22 | Unknown program IDs silently render a default program. | program registry lookup/fallback code. | Lookup inspection identifies Hybrid Engine fallback instead of invalid-state recovery. | Confirmed |
| AUD-23 | Lifetime blob creates write amplification. | `js/state.js` persistence/cloud upsert; state schema. | Synthetic Node state: 1 year/6,240 sets ~0.28 MB and ~0.93 ms stringify; 5 years/31,200 sets ~1.41 MB and ~4.8 ms. This excludes device/storage/network cost. | Confirmed architecture; mobile severity is Risk |
| AUD-24 | Behavioral automation gaps remain. | `package.json`; viewport scripts; `.github/workflows`; `android/src/test`; `tests/coach_memory.test.js`; repo Gradle files. | Clean install lacks Playwright, so three viewport scripts reported skips; only small JVM tests cover `BridgeSafe`/`TrustedOrigin`; no committed Gradle wrapper for local parity; the strong-weeks fixture derives dates from “days ago” and can split its intended weeks based on the current weekday. | Confirmed |
| AUD-25 | Metric families/scope labels can drift or mislead. | strength calculation/view modules; `metrics-load.js`; primary readiness modules and re-exports. | Call-site review shows “lifetime” result limited to numeric active weeks; multiple load/readiness implementations remain exported/tested. | Confirmed |
| AUD-26 | Discovery/advanced feature hierarchy competes with the core loop. | Programs/Home/Start sheet renderers and mobile screens. | Browser journey observed tabs + filter rows + rails + browse categories; fasting/advanced load surfaces are broadly available despite the primary plan/train/track goal. | Confirmed observation; product recommendation |
| AUD-27 | Beginner receives undisclosed Intermediate recommendation. | onboarding recommendation rules; program metadata. | Browser selected Beginner; Helyx Foundations appeared in recommendations without its Intermediate difficulty being displayed. | Confirmed |
| AUD-28 | Health callback escaping differs from other bridges. | `HealthConnectBridge.kt`; `BridgeSafe` and other bridge call sites. | Callback IDs are interpolated into `evaluateJavascript`; current JS generator uses safe IDs, so no exploit was reproduced. | Confirmed hardening gap / Risk |
| AUD-29 | CSS and inline styling are fragmented. | `css/*.css`; `index.html`; JS renderers. | Count: about 12,395 primary CSS lines, 704 inline `style=` occurrences in HTML/JS, 526 `!important` occurrences. | Confirmed |
| AUD-30 | Desktop remains a narrow mobile column. | responsive CSS/layout and browser viewport. | Browser inspection at 1280px showed a centered ~mobile-width app with unused side space and no horizontal overflow. | Confirmed observation; Minor |
| AUD-31 | FIT import mislabels training effect and reports success early. | `js/garmin.js`, `extractData`; destination callbacks in `js/app.js`. | `aerobicTE` searches `total_anaerobic_effect`/`anaerobic_training_effect`; `showToast('Garmin Imported!')` runs immediately before the non-awaited callback. | Confirmed |

## Positive-control evidence

| Area | Evidence | Assessment |
|---|---|---|
| Program-run isolation | `js/state/activation-identity.js`, activation tests, archived week-key readers | Stable activation IDs and archived numeric weeks prevent prior runs from leaking into the active workout while retaining dated history. |
| Calendar-week analytics | `js/analytics/weekly-aggregate.js`, `week-nav.js`, `strength-calendar.js`, guard tests | Current-week strength/running attribution is based on stamped local dates, not the program-week counter. |
| Sync conflict safety | `js/state/sync-guard.js`, `sync-conflict-ui.js`, Supabase `updated_at` migration, pre-pull snapshot | Whole-blob writes remain last-write-wins, but intervening device writes are no longer silently overwritten. |
| RLS | `supabase/rls_user_data.sql`, `scripts/rls-adversarial-check.mjs`, project progress record | RLS is documented as applied and adversarially proven on 2 July 2026. It was not re-run against live production in this audit. |
| Offline cache | service worker, generated precache manifest/check scripts | Required graph assets are validated and installed atomically; incomplete required caches are rejected. |
| Android WebView | `MainActivity.kt`, `TrustedOrigin`, manifest/network config | Exact trusted origin, debug-only WebView debugging, disabled file/content access, and cleartext restrictions are appropriate. |
| Monitoring privacy | `js/monitoring/*` | Sentry is DSN-gated and health/location PII is scrubbed before reporting. |
| Analytics performance | `scripts/analytics-verify.mjs --perf` | Synthetic `buildWeekChart` run passed at about 0.84 ms average in the audit environment. |
| Module reachability | app/service-worker import graph scan | All 151 non-vendor JS modules were reachable; unused exports/legacy branches still exist but no orphan feature modules dominated the graph. |

## Commands and results

Initial git state was **not clean**: `git status --short --branch` reported `main...origin/main` and an existing untracked `AGENTS.md`. The audit did not modify or remove it. Audit documents are new untracked files until an approved/green commit.

| Command | Result | Notes |
|---|---|---|
| `node --version`; `npm --version` | `v24.16.0`; `11.13.0` | `package.json` declares Node `>=20 <23`, so the audit runtime is newer than the supported engine range. |
| `git status --short --branch` | Not clean | Initially: `## main...origin/main`, `?? AGENTS.md`. |
| `npm run verify` (before install) | Fail | `tsc: command not found`; project dependencies were absent. |
| `npm ci` | Pass after network approval | npm warned that local Node v24.16 is outside package engine `>=20 <23`; audit reported 2 low/1 moderate package vulnerabilities but did not mutate dependencies. |
| `npm run verify` (after install) | Fail | Typecheck and precache check passed; Node tests then failed 3 streak cases, so the chained smoke step did not run. |
| `npm run typecheck` | Pass | TypeScript checking through `jsconfig`. |
| `npm run precache:check` | Pass | Generated service-worker dependency/precache state matches. |
| `npm test` | Fail | 764 total: 760 pass, 4 fail, 0 skipped; three streak-freeze local-date failures plus `coach_memory` consecutive-week fixture failure. |
| `npm run smoke` | Pass | `SMOKE OK`; expected Supabase-config/service-worker limitations in jsdom logs. |
| `node scripts/analytics-verify.mjs` | Pass | Analytics verification fixtures pass. |
| `node scripts/analytics-verify.mjs --perf` | Pass | Synthetic analytics performance check passes. |
| `node scripts/stage-web-root.mjs /private/tmp/helyx-audit-web-root` | Pass | 169 files, approximately 3.9 MB. |
| `node scripts/home-attribution-check.mjs` | Skipped | Playwright/core browser dependency unavailable. |
| `node scripts/preview-viewport-check.mjs` | Skipped | Same dependency gap. |
| `node scripts/program-detail-viewport-check.mjs` | Skipped | Same dependency gap. |
| Android Gradle unit/lint/assemble | Not run | No committed Gradle wrapper; local JDK 26 differs from CI JDK 17/Gradle 8.13 environment. |
| Lint | Not available | No lint script/tool is declared in `package.json`. |
| Production web build | Not defined | There is no framework build command; the staging script is the deployable-root validation used above. |
| `git diff --check` | Pass | No whitespace-error output for the audit documents. |

## Representative browser path

The inspected path was:

1. fresh origin;
2. onboarding as Audit User;
3. True Hybrid goal;
4. Beginner experience;
5. Home equipment;
6. choose Helyx Foundations;
7. bodyweight 75 kg;
8. skip notifications;
9. inspect Home/next mission;
10. inspect Programs at mobile and desktop widths;
11. open Tuesday Hybrid Session;
12. switch Pull-Ups to bodyweight mode, log one set, observe rest/RIR UI;
13. finish the otherwise incomplete session;
14. inspect Settings and closed modal/sheet accessibility state.

Key observations from this path are recorded under AUD-06, AUD-12–15, AUD-26, AUD-27, and AUD-30.

## Device/live validations still required

The following are evidence gaps, not passed checks:

- Android foreground/background/screen-lock/process-kill GPS recovery and route accuracy.
- Android JSON/CSV system save/share and destructive-clear/reimport round trip.
- Health Connect permission grant, partial denial, revocation, record sync, and worker behavior.
- Android back-button behavior through nested dialogs/sheets/workout.
- TalkBack journeys and large-text/display-scaling matrix.
- full PWA cold install, network loss, update activation, and offline relaunch.
- live Supabase multi-device conflict scenarios and current RLS adversarial check.
- Play Console signing/artifact/install validation.

No audit statement should be interpreted as closing these human/device checks.
