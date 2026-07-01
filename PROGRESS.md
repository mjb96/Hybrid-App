# Helyx — Android Launch Progress Tracker

**Goal:** Signed Android app in Google Play closed/open beta with real users.
**Monetization:** Free at launch — do NOT build billing/paywall this month.
**Out of scope:** iOS, Capacitor migration, subscriptions.

**Definition of Done**
- [ ] No user can read another user's data (RLS enforced + proven)
- [ ] Multi-device use cannot silently destroy history
- [ ] Crashes are visible to the owner (reporting live)
- [ ] Store + legal (health/location) requirements met
- [ ] App live in Play beta with real testers

**Legend:** `[CC]` Claude Code drives · `[You]` human action required.

---

## Day 0 — Prerequisites `[You]`
- [ ] Create Google Play Developer account ($25, approval 1–2 days)
- [ ] Obtain a physical Android phone for testing
- [ ] Confirm Supabase dashboard access
- [ ] Decide single brand identity (Helyx vs com.hybridapp / hybrid-app)
- [ ] Create Sentry account (for Phase 1 crash reporting)

## Phase 1 — Security + Data Safety  ·  branch: `phase1-security`
- [x] `[CC]` Draft Supabase RLS SQL for `user_data` (own-row read/write only) → `supabase/rls_user_data.sql`
- [ ] `[You]` Apply both SQL files in Supabase dashboard (`rls_user_data.sql` + `migration_user_data_updated_at.sql`), then run the adversarial check
- [~] `[CC]` Adversarial test: prove user A cannot read user B's data — harness ready (`scripts/rls-adversarial-check.mjs`); `[You]` runs it post-apply with two accounts
- [x] `[CC]` Secret sweep: no service_role key / private secret in repo or bundle — **clean** (only public anon key; see `supabase/README.md`)
- [x] `[CC]` Fix last-write-wins sync (state.js): server `updated_at`/version + divergence detection → warn-and-choose conflict UI. Needs `migration_user_data_updated_at.sql` applied by `[You]`
- [x] `[CC]` Local safety net: snapshot/backup before every cloud pull (`snapshotLocalBeforeCloudPull` in state.js, tested)
- [x] `[CC]` Integrate Sentry web SDK — DSN-gated (off until configured), PII-scrubbed for health/location data. `js/monitoring/`
- [ ] `[You]` Paste Sentry DSN into `js/monitoring/sentry-config.js` to turn crash reporting on
- **Phase 1 done when:** RLS proven, no stale-device clobber possible, backups in place, crashes reported.

## Phase 2 — Android Hardening  ·  branch: `phase2-android`
- [ ] `[CC]` GPS reliability: foreground-service bridge OR foreground-only with honest UX (recommend first)
- [ ] `[You]` Real-run device test of GPS
- [ ] `[CC]`+`[You]` Brand unification (name / icons / splash / package identity)
- [ ] `[CC]` WebView hardening (back-button/nav, resume state restore, offline behavior)
- [ ] `[CC]` Android 13+ notification permission flow + Health Connect permission finalize
- [ ] `[You]` Device-test notifications + Health Connect
- **Phase 2 done when:** app behaves correctly on a real device across GPS, notifications, resume, offline.

## Phase 3 — Compliance + Store Assets + Tests  ·  branch: `phase3-launch-prep`
- [ ] `[CC]` Draft Privacy Policy + Terms (health & location = GDPR special category)
- [ ] `[You]` Get policy reviewed + hosted (public URL)
- [ ] `[You]` Complete Play Data Safety form (with `[CC]` guidance)
- [ ] `[CC]` Draft store listing copy / description / categorization
- [ ] `[You]` Produce screenshots + feature graphic
- [ ] `[CC]` Integration/UI tests on workout.js + app.js (log-a-workout + new sync path)
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

- 2026-07-01 · Phase 1 (cont.) · Sentry web SDK integrated (`js/monitoring/`): DSN-gated so nothing is sent until `[You]` pastes a DSN into `sentry-config.js`; conservative config for a health/location app (sendDefaultPii false, event + breadcrumb scrubbers strip request/user/device and redact network URLs). 6 new tests. All green (204 / typecheck / smoke). All Phase 1 `[CC]` items now done. · Next: `[You]` apply both SQL files + run adversarial check + add Sentry DSN; then Phase 2 (Android hardening).
- 2026-07-01 · Phase 1 (cont.) · Last-write-wins sync fix: `js/state/sync-guard.js` tracks the server `updated_at` this device last saw; before every cloud save, state.js checks whether the server row is newer (another device wrote) and, if so, raises a warn-and-choose conflict modal (`js/state/sync-conflict-ui.js`) instead of clobbering — keep-this-device overwrites, use-cloud reloads. Pull records the version; save/pull degrade gracefully if the migration isn't applied yet. `supabase/migration_user_data_updated_at.sql` (`[You]` apply). 7 new tests. All green (198 / typecheck / smoke). · Next: `[You]` apply both SQL files + adversarial check; then `[CC]` Sentry.
- 2026-07-01 · Phase 1 started. Secret sweep (clean — only public anon key). Drafted RLS SQL (`supabase/rls_user_data.sql`) + adversarial proof harness (`scripts/rls-adversarial-check.mjs`) + `supabase/README.md`. Added local safety net: `snapshotLocalBeforeCloudPull` backs up local state before a cloud pull can clobber it (state.js, 5 tests). All green (191 tests / typecheck / smoke). · Next: `[You]` apply RLS SQL + run adversarial check; then `[CC]` last-write-wins sync fix (updated_at + divergence) and Sentry.
- YYYY-MM-DD · Tracker + working brief created (PROGRESS.md, CLAUDE.md). · Next: Phase 1 Task 1 — RLS SQL + adversarial test.
