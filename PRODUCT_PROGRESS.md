# Helyx — Product Progress

**Last full audit:** 2026-07-04 (`PRODUCT_AUDIT.md` — the design source of truth).
**This file:** live product status. Update it when product-facing work ships.
**Android launch operations** (Play Console, signing, device tests, legal) live in
`PROGRESS.md` — that tracker is still current for `[You]` launch steps; this file owns
product/UX status only. Historical plans (`PRODUCT_V2.md`, `PROGRESS_V2.md`,
`docs/LAUNCH-AUDIT-PLAN.md`, the 2026-07-02 audits) are archived under `docs/archive/`
and are **superseded** — do not execute from them.

---

## Overall product rating: **6.5 / 10** (2026-07-04)

A 9/10 scoring engine and an 8/10 surface pattern, held back by a 3/10 first-run and a
4/10 cross-surface coherence. Full scorecard in `PRODUCT_AUDIT.md` §11. The rating is
expected to move to ~8 when Sprints 1–2 (below) ship, with **zero new features**.

---

## Completed improvements (what is already true — do not re-recommend)

Condensed record of the three overhaul waves. All shipped, tested (437 node tests,
typecheck, smoke green at audit), and verified in headless Chromium at the time.

**Wave 1 — Coach & retention spine (2026-07-02):** Hybrid Score engine (8 pillars,
additive "why", confidence, XP levels) + E1–E8 defect fixes (de-sawtooth, de-double-count,
best-effort pace, auto-VDOT from hard efforts, robust compound-weighted strength, recovery
trend, day-over-day attribution, workout-quality/true-adherence) · Morning Briefing +
Mission (one Home coaching surface) · onboarding notification step · streak freezes ·
celebrations · Weekly Review + Monthly Report + projections · overtraining risk card ·
styled modals · guided first session.

**Wave 2 — V2 subtraction & the pattern (2026-07-03):** ui-pattern doctrine (one hero ·
lean Overview + one line · power under Stats · curated-not-configurable) applied
everywhere: 24 analytics leaves → 5 screens + fasting (redirects kept) · 19 tiles +
customiser → 4 fixed · one-hero Home · settings trimmed to consumer set · 8 pillars → 3
dials (engine untouched) · provisional-score onboarding reveal · forward-looking
projection + streak-at-stake push · consequence-voice rewrite + coach memory ·
share cards (score + weekly) · Profile/Programs/Workout rebuilt on the pattern · fasting
ring + protocols + quiet Home.

**Wave 3 — Program transparency & cockpit agency (2026-07-04):** Plan timeline tab ·
commitment strip · week-accurate previews · Customize-any-program (fork) · per-week
progression editor · in-session swap (targets preserved) · program compare · starter
program from onboarding answers · ask-the-coach chips · deload explainers · plate math ·
day swipe · PR share card · session recap Summary|Breakdown · single-focus accordion ·
ghost targets + "Log all".

---

## Current product status

- **Gates:** 437/437 tests, typecheck, smoke — green (verified this audit).
- **Security/data:** RLS applied + adversarially proven on live DB; sync divergence
  detection + conflict UI + pre-pull snapshots; Sentry live (DSN set 2026-07-02).
  `docs/LAUNCH-CHECKLIST.md` items 1–2 are DONE per `PROGRESS.md` despite unticked boxes
  there (checklist updated this audit).
- **Where the product actually stands:** excellent for a day-60 user, broken for a day-0
  user, and self-contradicting whenever surfaces narrate the same day independently.
  Evidence and mechanics: `PRODUCT_AUDIT.md` §1, §3, §4.1.

## Known UX issues (open bugs, verified 2026-07-04)

P0 — trust/correctness (beta blockers):
1. Day-0 Hybrid Score renders **0/100 "At Risk"** ("−50 Consistency — 89 planned sessions
   still open"); provisional reveal score never blended; sets mislabeled as sessions
   (`js/brain/hybrid-score/pillars.js:85`).
2. First screen is an email/password wall before any value (`index.html:345`).
3. Contradictory day narration: rest-day mission vs "train and it rises" projection vs
   "push it today" coach/cockpit lines; "APPLY DELOAD" offered during a deload week
   (`js/engine.js:490` uses `week % 4`, ignores the program's real deload map); Strength
   "add sets" / Recovery "block push" / Review "repeat it" insights are deload-blind.
4. Same fact, different numbers: Home readiness 93 vs Recovery&Load 80 (load-included vs
   load-excluded, unlabeled); Home weekly volume 9.2t vs Strength Overview "--";
   Score detail "ACWR 0.92" vs Recovery&Load "ACWR --".
5. Fabricated social proof shipped in the catalog (`rating: 4.8, ratingCount: 1560,
   enrolledCount: 9200` — `js/programs/catalog/*.js`), rendered as real ratings.
6. Fasting is unreachable for never-fasted users: Insights empty state points to a Home
   entry that is hidden for exactly them (`js/home.js:252`).

P1 — quality:
7. "BIGGEST LIFT" label means biggest score driver; reads as barbell lift.
8. Strength hero spark drops to zero on the in-progress week under a "+3 kg this week"
   caption; Running shows "↓ 100% vs last week" beside a null "--" value.
9. Program detail: 4-button CTA clutter, rating row overflows 390px, "4 SETS/WEEK"
   mislabel; duplicate cards across Discover rails.
10. Emoji iconography app-wide (nav, hub, tiles, program art, milestones).
11. Strength-band calibration (Squat 1.42×BW "Novice" vs Bench 1.23×BW "Intermediate");
    XP ignores pre-score history ("Initiate · 28 XP" for an 8-week athlete); profile
    streak text truncates.
12. Machine-ese copy: "ready recovery", "0 over the week", chip stack "New today · →
    Building trend"; cockpit START WORKOUT on no-lift days; day chips don't mark today;
    onboarding program step gives no duration/frequency meta.

P2/P3 — polish: week-nav shown on non-week screens · "More" hub bucket · day-0 tile
dashes · VDOT empty for easy-pace runners · splash/boot flash · dead `#tileCustomiserSheet`
DOM + CSS · type-ramp audit (deferred C7).

---

## Current roadmap & next recommended sprint

Full tables with effort/impact in `PRODUCT_AUDIT.md` §10. Sequence is fixed:

1. **Sprint 1 — "The first two minutes"** ← **NEXT.** Day-0 score fix (blend provisional,
   never "At Risk" without data), auth after onboarding, strip fake ratings, fasting
   dead-end, same-fact-same-number plumbing. *All P0, blocks beta.*
2. **Sprint 2 — "One coach."** Shared `dayVerdict()` (one train/rest/deload decision +
   one readiness number) consumed by briefing/cockpit/projection/flag; every Overview
   insight gated by it; program-aware deload suggestions; copy pass.
3. **Sprint 3 — "Looks like it costs money."** Icon set replaces emoji; program cover art;
   CTA hierarchy; chip/spark null-guards; band calibration; XP backfill.
4. **Sprint 4 — Beta.** Device tests (`PROGRESS.md` `[You]` list), store screenshots taken
   *after* Sprint 3, submit.

**Development priorities (standing):** integrity > coherence > polish > features. No new
surfaces; any addition retires something. The rejected-ideas list (`PRODUCT_AUDIT.md` §9)
is binding until a new full audit says otherwise.

## UX debt register (not user-visible, keep from rotting)

- `js/workout.js` (1,676) and `js/app.js` (1,324) god-modules — extract only seams that
  Sprint 1–2 work touches (per the standing "no tidiness refactors pre-beta" rule).
- Dead DOM/CSS: `#tileCustomiserSheet`, customiser styles, `.fasting-sheet-hero` block.
- Render-shield failures go to `console.warn` only — pipe to Sentry breadcrumbs post-beta.
- Synthetic-seed caveat: the "--" volume/distance discrepancies were observed with seeded
  state; Sprint 1.5 must reproduce with organically logged data before/while fixing.

---

## Session log
_Newest first: date · what changed · what's next._

- 2026-07-04 · **Complete product re-audit (this document + `PRODUCT_AUDIT.md`).** Read
  all prior docs; walked every screen headlessly as new + returning user; verified the
  shipped state of all three overhaul waves. Found the two beta-blocking themes: the
  day-0 trust collapse (auth wall → provisional 65 → real 0 "At Risk") and cross-surface
  incoherence (five conflicting verdicts on one deload rest day), plus fabricated program
  social proof and the fasting dead-end. Replaced the 2026-07-02 audit and the V2
  planning docs (archived to `docs/archive/`); updated the stale launch-checklist boxes.
  No product code changed. · **Next:** Sprint 1 ("the first two minutes"), then Sprint 2
  ("one coach") — both before any store screenshot or tester invite.
