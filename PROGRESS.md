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

- 2026-07-01 · Phase 3 `[CC]` sweep · Drafted GDPR-grade Privacy Policy + Terms + Play Data Safety mapping + store listing (`docs/`). Integration tests for the log-a-workout path (`workout.js`, 7 tests). Built in-app account & data deletion (client erase + `delete-account` edge function for `[You]` to deploy). All Phase 3 `[CC]` items done. 233 tests / typecheck / smoke green; Phase 2 background-reminder build #112 confirmed green. · Next: `[You]` (policy host/review, data-safety form, screenshots, edge-function deploy, device tests); `[CC]` Phase 4 prep (signed release/AAB CI) is the next codeable item.
- 2026-07-01 · Phase 2 push · GPS reliability shipped (native location foreground service, CI-compiled). Offline edits re-sync on reconnect. Brand unified (all user-facing = Helyx; package renamed `com.hybridapp`→`com.helyx.app`; export filenames). Notification permission + native delivery for Android (WebView lacks Web Notifications API) — foreground reliable; background scheduling flagged as follow-up. All JS gates green (221 tests / typecheck / smoke); Kotlin CI-verified. · Next: `[You]` device tests; `[CC]` optional native reminder scheduling, or move to Phase 3 (Privacy Policy / tests).
- 2026-07-01 · Phase 1 wrap · `[You]` applied `rls_user_data.sql` (RLS lock now ON — users protected). Turned OFF Supabase "Confirm email" for beta (email-link confirmation didn't fit the WebView app; was causing otp_expired failures on signup). Adversarial proof + `migration_user_data_updated_at.sql` **deferred to after Phase 2** (proof needs desktop+Node; user is on phone). These gate public launch (Phase 4), not Phase 2. · Next: begin Phase 2 — Android Hardening (GPS reliability first).
- 2026-07-01 · Phase 1 (cont.) · Sentry web SDK integrated (`js/monitoring/`): DSN-gated so nothing is sent until `[You]` pastes a DSN into `sentry-config.js`; conservative config for a health/location app (sendDefaultPii false, event + breadcrumb scrubbers strip request/user/device and redact network URLs). 6 new tests. All green (204 / typecheck / smoke). All Phase 1 `[CC]` items now done. · Next: `[You]` apply both SQL files + run adversarial check + add Sentry DSN; then Phase 2 (Android hardening).
- 2026-07-01 · Phase 1 (cont.) · Last-write-wins sync fix: `js/state/sync-guard.js` tracks the server `updated_at` this device last saw; before every cloud save, state.js checks whether the server row is newer (another device wrote) and, if so, raises a warn-and-choose conflict modal (`js/state/sync-conflict-ui.js`) instead of clobbering — keep-this-device overwrites, use-cloud reloads. Pull records the version; save/pull degrade gracefully if the migration isn't applied yet. `supabase/migration_user_data_updated_at.sql` (`[You]` apply). 7 new tests. All green (198 / typecheck / smoke). · Next: `[You]` apply both SQL files + adversarial check; then `[CC]` Sentry.
- 2026-07-01 · Phase 1 started. Secret sweep (clean — only public anon key). Drafted RLS SQL (`supabase/rls_user_data.sql`) + adversarial proof harness (`scripts/rls-adversarial-check.mjs`) + `supabase/README.md`. Added local safety net: `snapshotLocalBeforeCloudPull` backs up local state before a cloud pull can clobber it (state.js, 5 tests). All green (191 tests / typecheck / smoke). · Next: `[You]` apply RLS SQL + run adversarial check; then `[CC]` last-write-wins sync fix (updated_at + divergence) and Sentry.
- YYYY-MM-DD · Tracker + working brief created (PROGRESS.md, CLAUDE.md). · Next: Phase 1 Task 1 — RLS SQL + adversarial test.
