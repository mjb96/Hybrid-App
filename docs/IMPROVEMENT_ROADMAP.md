# Helyx Improvement Roadmap

> Product, engineering, and release source of truth.
>
> Last reconciled against the repository and rendered application: **3 August
> 2026**.

## 1. Current objective

Ship a trustworthy **free Android public beta on Google Play**. The web/PWA and
custom Android WebView shell are the launch surfaces. iOS, Capacitor/TWA
migration, subscriptions, paywalls, and advertising are explicitly out of
scope.

Helyx is already a broad, coherent hybrid-training product. The constraint is
not a missing feature set; it is release proof. The next milestone is reached
when the existing core works safely on real Android devices for long-lived,
offline-first training data.

### Repository snapshot

- Vanilla JavaScript ES modules, service-worker PWA, custom Android WebView.
- 57 built-in programs plus editable personal copies and custom programs.
- 154 canonical exercises; 16 reviewed EZ-bar variations.
- Local-first state with optional Supabase blob sync, conflict choice, and
  pre-overwrite recovery snapshots.
- Calendar-correct strength/running analytics, deterministic coaching, GPS,
  Health Connect, export, restore, and Android automatic backups.
- 1,292 Node tests after the 3 August catalogue/UI review, plus typecheck,
  smoke, workflow, precache, and required real-browser gates.

## 2. Settled product and data rules

These are constraints, not backlog items:

1. **Android public beta first.** Do not build iOS or monetisation during this
   launch push.
2. **Local-first and loss-averse.** Local storage remains the primary working
   copy. Sync changes require recovery points and conflict guards before any
   behavioural change.
3. **One user-owned cloud blob for now.** Supabase `user_data` remains
   last-write-wins at blob level, with server `updated_at`, warn-and-choose
   conflict UI, RLS, and recovery snapshots. Normalised cloud sessions require
   a separate migration ADR and are deferred.
4. **Program activations never share workout slots.** Old runs stay archived in
   `state.weeks` and count toward dated/all-time history, but never leak into a
   new active program.
5. **Program week and calendar week are different domains.** Prescriptions,
   adherence, deloads, and “Week N” use the program week. “This week” analytics
   and detail navigation use real Monday-based calendar dates.
6. **Logged evidence beats plans.** Analytics count completed working sets and
   actual run sessions. Warm-ups, incomplete rows, future dates, and undated
   legacy work are excluded where the metric requires real dated activity.
7. **Finishing is deliberate.** A user can finish below 100% adherence, but a
   blank or warm-up-only workout cannot become training history.
8. **Guidance must be honest.** Set credits, load, readiness, projections, and
   reference ranges are estimates—not medical advice, personal recovery limits,
   or promised outcomes. Sparse evidence must be labelled.
9. **No mutable remote JavaScript in the privileged WebView.** Runtime
   libraries are vendored, CSP uses `script-src 'self'`, and the service worker
   must never reintroduce remote executable assets.
10. **Accessibility and data recovery are release features.** TalkBack,
    keyboard/focus behaviour, large text, export/restore, and offline recovery
    are not optional polish.
11. **Human evidence stays human-owned.** Accounts, SQL deployment, signed
    builds, device testing, legal review, listing assets, and store submission
    are `[You]` tasks. Engineering may prepare the exact artifact but must not
    mark the task complete without evidence.

## 3. Reconciliation: roadmap versus implementation

### Completed or materially complete

- The original truth/security foundation (R1–R6) is implemented: evidence-aware
  briefing, shared load/readiness models, conflict-safe sync, RLS proof, crash
  scrubbing, and honest recovery language.
- Core product expansion (R7–R14) is implemented: workout UX, program
  discovery/detail/compare/customisation, Hybrid Score, analytics foundations,
  one-off workouts, history, exact deletion/undo, and week-correct reporting.
- Runtime/data hardening (R16–R19, R21–R22) is implemented: vendored runtime
  JavaScript, signed publication gates, account deletion path, bodyweight load
  modes, export/restore, GPS journal recovery, and Android automatic backups.
- Product/visual consolidation (R27–R29, R31) is implemented: shared brand
  system, focused Home, calendar-correct Profile, and simplified Jacked & Tan
  program variants.
- Several R30 analytics families are complete: Running Performance, Strength
  Volume, Gym Performance, Run Performance, and Recovery Performance.
- Program-editor foundations from R20 are complete: personal copies, stable
  identity, schedule/progression editing, preview parity, active-program
  reconciliation, and mobile keyboard-safe exercise selection.

### Partially complete

- **R15 Android release evidence:** engineering controls, CI, checklists,
  backups, bridge security, and browser proof exist. Physical GPS/Health
  Connect/TalkBack/export/backup evidence, signed install proof, legal URLs,
  listing assets, and dogfood evidence remain open.
- **R20 normalised prescriptions:** the editor works within the existing
  single-week template plus shared weekly modifier. True per-lift/per-week
  prescriptions and migration do not exist and remain deliberately deferred.
- **R23 projections:** VDOT fallbacks and transparent projections exist, but
  confidence/sample-size treatment and long-term calibration remain incomplete.
- **R25 maintainability:** analytics has been split substantially, but
  `js/workout.js`, `js/app.js`, `js/state.js`, `js/settings.js`, the main
  stylesheet, inline styles, and specificity overrides remain large.
- **R26 product hierarchy:** Home is focused, but 57 programs, a long Settings
  sheet, and deep Insights navigation still need observation-led simplification.
- **Exercise details:** the schema and UI now support instructions, difficulty,
  movement, equipment, muscles, and safety. The 16 EZ-bar entries are complete;
  the other catalogue entries still need an editorial enrichment pass before
  claiming catalogue-wide technique guidance.

### Outdated items corrected in this review

- Security/versioning docs still described Supabase/Sentry CDN execution and
  only three native bridges. Runtime code is vendored and five bridges ship.
- The service worker still attempted a best-effort jsDelivr Supabase fetch even
  though the application had moved to bundled runtime JavaScript. The obsolete
  fetch was removed and regression-tested.
- Store copy still advertised MEV/MAV/MRV guidance after the product moved to
  transparent estimated set credits and general references. The claim was
  corrected.
- The Hybrid Score document still called Morning Briefing integration a future
  task even though it is implemented.
- Older status text treated the program editor, analytics details, automatic
  backups, and Jacked & Tan simplification as future work.

### Duplicated material consolidated

The previous roadmap repeated the same work across an audit, recommendation
register, implementation register, phase tables, active queue, and a very long
session log. This version keeps:

- one ordered phase plan;
- one quality backlog;
- one delivered-foundations register;
- one human release gate;
- a short recent session log.

Git history remains the durable line-by-line implementation archive.

### Missing items added

- Exercise catalogue editorial completeness and duplicate/alias QA.
- Equipment/category filtering and exercise-detail accessibility.
- Service-worker remote-JavaScript drift protection.
- Documentation/product-claim drift review before store submission.
- Measured performance budgets for startup, render, long-history analytics, and
  picker/program-list interaction.
- Consistent loading/error/retry/empty-state language across networked surfaces.
- Real-device TalkBack plus large-font checks for newly added picker/detail
  flows.
- Explicit beta evidence for Settings and Programs information density before
  any subjective redesign.

## 4. Prioritised delivery plan

Status: **DONE**, **ACTIVE**, **NEXT**, **LATER**, or **DEFERRED**.

## Phase 0 — Public-beta release gate

**Outcome:** a signed candidate survives real-device, offline, recovery, and
legal checks. This phase blocks Play submission.

| Status | Task | Owner | Acceptance evidence |
| --- | --- | --- | --- |
| ACTIVE | Run the complete Android device checklist on at least one Android 14+ phone and one compact/older supported device | `[You]` | Completed `docs/android-device-checklist.md` with device/OS/build and screenshots or recordings for failures |
| ACTIVE | Prove GPS cold start, background/locked-screen tracking, permission denial, process death, journal replay, duplicate prevention, and route persistence | `[You]` | Device evidence attached to release record; no acknowledged fixes lost |
| ACTIVE | Prove Health Connect absent/denied/partial/full permissions and metric refresh | `[You]` | All checklist branches recorded; no misleading success state |
| ACTIVE | Run TalkBack, 200% text/display size, keyboard, rotation, Android Back, and touch-target checks across onboarding, Home, workout, exercise picker/detail, program editor, Insights, Settings, export, and conflict dialogs | `[You]` | No focus escape, unreachable control, clipped blocking action, or unlabelled interactive element |
| ACTIVE | Prove complete export/restore and Android automatic daily/weekly backups with GPS routes, failure injection, and empty-state recovery gate | `[You]` | Byte-valid export, successful restore, retained routes, and failed writes never reported as success |
| NEXT | Restore and commit the Gradle wrapper so local Android builds match CI | Engineering | `./gradlew test lintDebug assembleDebug` works from a clean checkout |
| ACTIVE | Produce a signed internal release through CI and install the exact artifact on a device | `[You]` | Artifact checksum, versionName/versionCode, install/upgrade proof, WebView debugging off |
| ACTIVE | Deploy and verify account deletion edge function; host privacy/deletion URLs; complete Play Data Safety answers | `[You]` | Real URLs, independent-account deletion test, no placeholders, legal review recorded |
| ACTIVE | Complete a minimum 30-day dogfood with normal edits, deletes, program switches, offline periods, sync conflicts, exports, restores, and app upgrades | `[You]` | No unexplained data loss; issues triaged with reproduction/evidence |
| ACTIVE | Prepare final store listing, screenshots, feature graphic, support email, and release notes | `[You]` | Play Console accepts all assets/copy; screenshots match the candidate |

Do not compensate for missing device evidence by adding features. Fix only
release-blocking defects discovered by this phase, with regression coverage.

## Phase 1 — Core-loop quality after the release gate is underway

**Outcome:** lower friction and clearer evidence without changing the training
model.

### Delivered in the 3 August review

- **DONE — Exercise discovery:** shared equipment/category filters in workout
  addition and program editing; alias-aware ranked search; result counts; clear
  empty states; 44px detail controls; shared detail sheet; nested-modal focus
  return.
- **DONE — EZ-bar data:** 16 distinct variations spanning push, pull, arms,
  shoulders, back, and suitable leg/posterior-chain work, with instructions,
  difficulty, muscle credits, movement pattern, equipment, and safety notes.
- **DONE — Runtime drift:** removed obsolete service-worker CDN request and
  added a remote-JavaScript regression test.
- **DONE — Documentation claims:** corrected security, versioning, store,
  Hybrid Score, and Android picker/device-check documents.

### Next low-risk slices

| Priority | Task | Acceptance |
| --- | --- | --- |
| P1 | Complete R30 Strength Performance detail (estimated 1RM, comparable same-lift evidence, calendar ranges) | One shared model, exact contributing workouts, sparse/zero states, edit/delete refresh, no cross-exercise subtraction |
| P1 | Complete remaining R30 Recovery detail (sleep, resting HR, HRV, steps, readiness components) | Permission-aware fields, source/confidence labels, calendar-correct ranges, no medical thresholds |
| P1 | Audit all network-dependent loading/error/retry states | Auth, sync, map tiles, Health Connect, deletion, export/share, and optional crash reporting use consistent plain-language states; offline remains usable |
| P1 | Catalogue data-quality pass | Every alias is unique; every built-in program lift resolves; ambiguous generic names are documented; no duplicate canonical exercise; reviewed metadata coverage reported |
| P1 | Enrich non-EZ exercise guidance in bounded, sourced batches | Each edited entry has two or more actionable steps, difficulty, safety notes, and reviewed muscle/equipment classification; browser details never imply missing content is complete |
| P1 | Add the new picker/detail flow to the physical accessibility checklist | TalkBack names filters and info controls; topmost modal traps focus; close restores context; 200% text and compact width remain usable |

### Observation-led UX work

Do not redesign these from taste alone. Collect beta evidence first:

- **Programs:** measure whether 57 choices, chips, collections, and compare
  controls slow first-program selection. Candidate intervention: progressive
  disclosure around recommended/equipment-compatible programs, while keeping
  full search and filters.
- **Settings:** measure findability and completion time in the long modal.
  Candidate intervention: a short account/training/data landing page with
  deeper subpages, without hiding export/delete/recovery actions.
- **Insights:** identify dead-end or duplicated destinations. Candidate
  intervention: keep the four-domain hub and move optional fasting/projection
  surfaces behind explicit interests.
- **Desktop/tablet:** the narrow phone canvas is intentional for Android launch.
  Only introduce wider layouts when a real PWA/tablet use case is prioritised;
  first improve information density, not visual identity.
- **Workout forms:** observe weight/reps/RIR/error recovery with sweaty, one-hand
  use. Fix clear focus, validation, keyboard, and destructive-action issues;
  retain the established cockpit structure.

## Phase 2 — Training-model correctness and personalisation

**Outcome:** deepen the coaching model only after beta evidence shows the core
data is trustworthy.

| ID | Status | Task | Required decision/evidence |
| --- | --- | --- | --- |
| R20 | DEFERRED | Normalised per-lift/per-week prescription schema | ADR covering schema, v1 string migration, inline target precedence, custom-program compatibility, preview/logger parity, activation reconciliation, export/sync compatibility, and rollback |
| R23 | LATER | Projection confidence and calibration | Minimum sample rules, uncertainty wording, test profiles, comparison against observed outcomes; never present deterministic race promises |
| VOLUME | LATER | Individual volume baselines | At least 6–8 weeks of stable training evidence, deload/recovery adjustment, direct versus indirect credits, and explicit non-medical framing |
| COACH | LATER | Learn from accepted/rejected recommendations | Privacy-preserving local signals first; clear controls and no opaque behavioural profiling |
| JT | LATER | Further Jacked & Tan management | Only after beta feedback: training-max UX, per-set role clarity, notes/rest fields, and Block 2 progression evidence |

## Phase 3 — Maintainability, performance, and scale

**Outcome:** reduce change risk without a framework rewrite.

| ID | Status | Task | Acceptance |
| --- | --- | --- | --- |
| R25-A | NEXT | Split `js/workout.js` by logger rendering, mutations, exercise selection, run logging, and session completion | Public behaviour unchanged; focused unit tests; smoke/browser gates green |
| R25-B | NEXT | Split `js/app.js` routing/event delegation and large Settings/state surfaces | Clear ownership boundaries; no duplicate listeners; import graph remains offline-precache complete |
| R25-C | NEXT | Continue CSS tokenisation and remove inline styles/`!important` hotspots by surface | Visual regression/browser evidence at 320, 390, 412, desktop, light/dark, reduced motion |
| PERF | NEXT | Establish measured budgets before optimisation | Record cold/warm startup, JS/CSS transfer, Home/workout render, 57-program filtering, 154-exercise filtering, and 5-year history analytics on target Android hardware |
| PERF | LATER | Optimise only budget failures | Prefer keyed updates, bounded DOM, deferred optional work, and smaller modules; preserve offline behaviour |
| DOCS | NEXT | Add release-time documentation/claim audit | Automated checks for placeholders, remote runtime claims, version alignment, privacy copy, and store-copy model names |
| R24 | DEFERRED | Normalised Supabase session persistence | Separate ADR, RLS migration, dual-read/write rollout, backup/rollback, conflict semantics, and adversarial proof; never a launch-blocker |

## 5. Cross-cutting quality backlog

### Bugs and reliability

- Treat any lost/duplicated workout, route, export, restore, sync, or program
  activation data as P0.
- Close the local Gradle wrapper gap.
- Continue process-death and duplicate-delivery tests for native callback paths.
- Verify service-worker upgrades retain the prior cache if any required asset
  fails; remote executable assets remain forbidden.
- Test long custom exercise names, Unicode, duplicate aliases, missing metadata,
  and imported legacy labels in both pickers and analytics.

### Accessibility

- Finish physical TalkBack and Switch Access review; automated names/focus tests
  are necessary but not sufficient.
- Maintain 44px touch targets for primary/icon controls.
- Verify focus return and Back/Escape behaviour for every nested modal.
- Keep zoom enabled and test 200% font/display scaling, landscape, compact
  phones, reduced motion, light/dark contrast, and safe areas.
- Add `aria-live` only for meaningful state changes; avoid noisy per-keystroke
  announcements beyond concise result counts.

### Performance

- Create a repeatable target-device benchmark before setting numerical budgets.
- Watch the 8k+ line main stylesheet, large vendored runtime bundles, 57-program
  catalogue, analytics over archived history, and full exercise lists.
- Measure service-worker install/upgrade and offline startup separately.
- Avoid speculative lazy loading that could break signed-bundle/offline
  guarantees.

### Testing

- Keep `npm run verify` green: typecheck, precache generation/check, workflow
  validation, Node tests, and smoke.
- Keep required browser checks green at 320/390/412 widths, desktop, reduced
  motion, light/dark, keyboard-simulated viewport, and mandatory CI mode.
- Add pure-model tests before UI for analytics, prescriptions, state migration,
  and data mutation.
- Every bug fix needs a failing regression test at the lowest useful layer.
- Android release candidates additionally require Gradle unit tests, lint,
  assemble/bundle, signed install, and physical checklist evidence.

### Exercise and program data quality

- Canonical ID, display name, and aliases must be unique.
- Equipment describes what the movement actually requires; EZ-bar, straight
  barbell, dumbbell, cable, and bodyweight variations stay distinct.
- Primary muscle uses credit `1`; meaningful secondary credits use `0.5` or
  `0.25`; stabilisers are not inflated into volume claims.
- Only include mechanically reasonable variations. An available implement is
  not sufficient reason to create an exercise.
- Built-in program lift strings remain compatible with the canonical resolver.
- Instructions and safety notes are concise general guidance, not diagnosis or
  a substitute for coaching.

### UX consistency

- Every list needs search/filter feedback, a meaningful empty state, and a
  reachable reset path.
- Every asynchronous action needs one clear loading, success, failure, and
  retry story.
- Destructive actions name the exact scope and preserve undo/recovery where
  practical.
- Editing previews and the workout logger must resolve the same prescription.
- Preserve the technical dark/light identity, orange accent restraint, type
  hierarchy, and compact Android-first layout unless measured usability
  evidence supports a change.

## 6. Human-owned public-beta checklist

These are not complete until `[You]` records evidence:

- [ ] Physical GPS, Health Connect, notifications, export, restore, and backup
      checklist.
- [ ] TalkBack, large text, compact phone, rotation, keyboard, Back, and
      reduced-motion checklist.
- [ ] Signed internal candidate installed and upgraded from a prior build.
- [ ] Gradle wrapper restored for clean local reproduction.
- [ ] Account deletion function deployed and independently verified.
- [ ] Privacy policy and account deletion URLs hosted; placeholders removed.
- [ ] Play Data Safety and content rating legally reviewed.
- [ ] Support email, screenshots, feature graphic, listing copy, and release
      notes finalised.
- [ ] At least 30 days of representative dogfood with no unexplained data loss.
- [ ] Final `npm run verify`, Android tests/lint/bundle, artifact checksum, and
      release sign-off recorded.

## 7. Delivered foundations register

This preserves the useful outcome history without duplicating implementation
detail already visible in tests and Git:

| Area | Delivered |
| --- | --- |
| State safety | Activation isolation, v3 adoption, additive session status, exact deletion/undo, cloud conflict choice, local/cloud recovery snapshots |
| Security/privacy | Proven RLS, vendored runtime JS, strict CSP, external-link routing, bridge input sanitisation, PII-scrubbed DSN-gated crash reporting, no ads/behavioural analytics |
| Android native | Health Connect, foreground GPS, fsynced journal and acknowledgement, notifications, file export, automatic backup bridge |
| Workout | Fast logging, previous values, warm-ups/drop/failure sets, bodyweight/weighted/assisted modes, exercise swaps, supersets, plate math, one-off sessions, deliberate finish |
| Programs | 57-program catalogue, equipment fit, comparison, detail Plan timeline, stable editable personal copies, builder preview parity, Jacked & Tan variants |
| Analytics | Calendar-week strength/running aggregation, exact evidence drilldowns, load/readiness, Hybrid Score, weekly/monthly reviews, Gym/Run/Recovery performance details |
| Coaching | Evidence-aware Morning Briefing, deterministic Q&A, completion-aware recommendations, sparse-data confidence language |
| Recovery/portability | Complete JSON/CSV export, route-inclusive restore, Android daily/weekly backups, empty-scaffold overwrite guard |
| Quality system | Typecheck, 1,292 tests, smoke, precache integrity, workflow guards, real-browser responsive/accessibility gates, Android CI |

## 8. Significant changes made by the 3 August review

1. Reframed the roadmap from a feature backlog to a **release-proof plan**.
2. Promoted physical Android evidence, legal hosting, signed install, Gradle
   wrapper, and dogfood to the blocking Phase 0.
3. Consolidated repeated completed work into one delivered register.
4. Marked program editing and several analytics families as implemented rather
   than future work.
5. Kept normalised prescriptions, session persistence, and personal volume
   models deferred behind ADR/evidence requirements.
6. Added explicit exercise data quality, metadata completeness, picker/detail
   accessibility, documentation drift, and performance measurement work.
7. Corrected obsolete remote-runtime and MEV/MAV/MRV claims.
8. Put subjective Programs/Settings/Insights/desktop redesign behind beta
   observation rather than arbitrary visual change.

## 9. Recent session log

- **2026-08-03 — Full repository/roadmap/UI/exercise review.** Reconciled code,
  docs, tests, data, and rendered desktop/mobile flows. Rewrote the roadmap.
  Expanded the catalogue from 145 to 154 exercises and from 7 to 16 EZ-bar
  variations with complete reviewed metadata. Added equipment/category filters,
  alias-aware results, counts, empty states, and shared exercise details to
  workout/program pickers. Removed obsolete service-worker CDN runtime fetch.
  Corrected security/versioning/store/Hybrid Score/device-check docs. Added
  catalogue, detail, remote-runtime, and mobile real-browser coverage. Next:
  execute Phase 0 physical release evidence.
- **2026-08-03 — Simplified Jacked & Tan option.** Added a lower-complexity
  Block 1 base-volume variant while retaining the advanced program.
- **2026-07-24 — Home-gym catalogue and picker.** Added missing home-gym
  movements, canonical EZ-bar equipment, mobile keyboard-safe editor picker,
  preview/logger parity, and active-program edit reconciliation.
- **2026-07-23 — Roadmap reconciliation and analytics completion.** Closed
  Gym/Run/Recovery performance slices and documented the remaining release and
  architecture work.
- **2026-07-22 — Android automatic backups.** Added persisted folder access,
  daily/weekly route-complete backups, recovery gate, and native/JS tests.
- **2026-07-19 — Release hardening.** Vendored privileged runtime JavaScript,
  added signed publication and accessibility gates, and strengthened export,
  restore, GPS, and release evidence.

## 10. Stop conditions

Stop a release and investigate immediately if:

- any training, route, sync, backup, export, restore, or activation data is
  lost, duplicated, silently overwritten, or attributed to the wrong date/run;
- RLS isolation or account deletion cannot be independently proven;
- a required runtime module is missing offline or remote JavaScript reaches the
  privileged WebView;
- a blocking dialog is inaccessible with TalkBack, large text, keyboard, or
  Android Back;
- tests, typecheck, smoke, precache, workflow, browser, Android unit, lint, or
  signed-build gates are red;
- legal/store copy claims a capability, privacy behaviour, or scientific
  certainty the shipped product does not support.
