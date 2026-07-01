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
- [ ] `[CC]` Draft Supabase RLS SQL for `user_data` (own-row read/write only)
- [ ] `[You]` Apply RLS SQL in Supabase dashboard
- [ ] `[CC]` Adversarial test: prove user A cannot read user B's data
- [ ] `[CC]` Secret sweep: no service_role key / private secret in repo or bundle
- [ ] `[CC]` Fix last-write-wins sync (state.js): server `updated_at`/version + divergence detection
- [ ] `[CC]` Local safety net: snapshot/backup before every cloud pull (build on import-export.js)
- [ ] `[CC]` Integrate Sentry web SDK
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

- YYYY-MM-DD · Tracker + working brief created (PROGRESS.md, CLAUDE.md). · Next: Phase 1 Task 1 — RLS SQL + adversarial test.
