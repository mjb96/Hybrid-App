# Helyx Improvement Roadmap

**Prepared:** 14 July 2026  
**Goal:** reach a trustworthy Android public beta without expanding scope  
**Constraint:** iOS, billing, paywalls, and new feature categories remain deferred

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
  adoption. **Next integrity slice:** R4 complete Android portability/export.
- **R4 implementation complete — 14 July 2026** on `codex/beta-integrity-migrations`.
  JSON and CSV now use one text-export service with three honest adapters: Android's
  Storage Access Framework, the browser file picker, and a clearly-labelled download
  fallback. Android reports saved/cancelled/error only after the selected Uri write;
  bridge inputs and callback scripts are validated. JSON refuses to claim completeness
  if any IndexedDB route cannot be read/preserved. CSV keeps archived activation keys,
  multiple same-day sessions, metadata-only days, and RFC 4180 user text. Local evidence:
  801/801 JS tests plus Android JVM tests, lint, and debug APK assembly. Physical-device
  save/cancel/overwrite/reimport evidence remains the `[You]` checklist in
  `docs/android-export-device-checklist.md`. **Next integrity slice:** R5 release gates.
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

## Prioritization model

Priority is based on severity, likelihood, user trust, launch dependency, and blast radius. Effort is a delivery estimate for one experienced product engineer with review, not elapsed calendar time. Each item includes the evidence required for completion; code existing or a happy-path manual check is not sufficient.

## Recommended first PR

### PR-1 — Canonical Local Dates

**Scope:** R1 only.  
**Why first:** it closes the currently proven production defect and makes the required suite green without mixing date semantics with route/storage migrations.  
**Expected files:** `js/dates.js`, streak/coach-memory, onboarding/bodyweight, score/history, recovery/wellness, Home/settings date writers, and fixed-clock/timezone tests.  
**Exclude:** route identity, export, visual redesign, structured program schema, new analytics, iOS, billing, catalog expansion.

Required merge evidence:

- full `npm run verify` green in Sydney and UTC;
- all 764 existing tests plus the added timezone matrix pass under UTC and Australia/Sydney;
- state-writing local-day producers use the canonical helper;
- fixed-clock fixtures do not depend on the weekday the suite happens to run;
- browser-created day records remain on the selected Sydney calendar date.

The rest of the Phase 0 gate should land as separate PRs: PR-2 session/run identity (R2), PR-3 transactional migrations (R3), PR-4 Android portability (R4), and PR-5 release gating (R5).

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
| R15 | Android GPS | `GpsPointStore` is process memory and service is non-sticky; filtering lacks teleport-quality model. | Durable active-session journal, restore UX, raw/filtered quality. | GPS service/store/bridge, JS tracker, route model. | Instrumentation kill/restart and point-quality fixtures/device runs. | Phase 2 / migration PR series `codex/gps-durable-session`. |
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

## Ranked priority bands

- **Immediate blockers:** R1 local dates, R2 run/route identity, R3 migrations, R4 Android portability, R5 release gates.
- **High-priority improvements:** R6 onboarding truth, R7 phase resolver, R8 completion policy, R10 modal accessibility, R11 mobile ergonomics, R13 coaching confidence, R14 Health contract, R15 GPS durability, R16 privileged-runtime hardening, R20 prescription resolver, R21 cross-program history.
- **Medium-priority improvements:** R9 run classifier, R12 bodyweight entry, R17 safe import, R18 activation continuity, R19 invalid-program recovery, R22 analytics consolidation, R23 running projection confidence, R24 persistence scale, R26 product simplification, R27 FIT import contract.
- **Low-priority polish/maintenance:** R25 incremental module/design-system cleanup and desktop-specific layout work only if beta evidence supports it.

## Top 10 improvements by product impact

1. R1 — canonical local calendar dates.
2. R2 — session-level run and route identity.
3. R3 — transactional/retryable migrations.
4. R4 — complete, device-verified Android portability.
5. R5 — verification-gated production releases.
6. R6 — onboarding choices that actually drive the product.
7. R7 — one program-aware phase source.
8. R8 — one truthful workout completion policy.
9. R10 — accessible modal/sheet navigation.
10. R13/R14 — confidence-gated coaching and an enforceable Health Connect privacy contract.

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

**Phase 0 exit gate:** R1–R5 complete, full suite green, Android export/device evidence attached, and no unresolved blocker in the evidence index.

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

## Quick wins

These are small, but should not displace Phase 0:

- R9: reorder/test run-type detection.
- R12: expose bodyweight/weighted mode.
- R19: remove unknown-program silent fallback.
- Rename current-scope “lifetime PR” immediately if the all-history query is not yet ready.
- Add explicit “limited data” copy for readiness with fewer than the agreed signal threshold.
- Make viewport scripts report a clear skip/failure instead of a successful-looking no-op.

## Major projects

- Session/run identity and route migration (R2).
- Transactional state migration/import system (R3, R17).
- Accessible modal and mobile-control system (R10, R11).
- Health Connect contract and GPS durability (R14, R15).
- Structured prescription resolver (R20).
- Event/session-oriented persistence and sync, only after telemetry (R24).

## Human-owned validation and release items

These require the product owner/device/accounts and must not be simulated as complete:

- `[You]` Run the supplied device matrix for foreground/background/lock/process-kill GPS and attach route comparisons.
- `[You]` Grant/revoke each Health Connect permission on supported devices and capture Settings/result evidence.
- `[You]` Confirm Android system save/share and reimport on at least one minimum/older supported and one current Android device.
- `[You]` Configure branch protection and Play Console internal/public beta tracks after workflow gating is merged.
- `[You]` Review coaching/health copy for product and legal positioning before store submission.

Engineering should provide exact checklists, fixtures, expected results, and build artifacts for each item.

## Stop conditions

Do not proceed to public beta if any of the following remains true:

- required Node/type/precache/smoke or Android unit/lint/assemble check is red;
- a second same-day run can replace another run or route;
- migration failure can advance the schema version;
- Android JSON export cannot be saved and reimported;
- local calendar records can be stamped as the wrong day in supported timezones;
- a production deployment/signed artifact can bypass required verification.

The roadmap intentionally puts fewer, deeper integrity changes ahead of feature breadth. The beta should test whether the existing core loop is valuable—not whether users will tolerate losing or misclassifying the data created by that loop.
