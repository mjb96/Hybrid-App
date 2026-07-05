# Helyx — Product Progress

**Last full audit:** 2026-07-04 (`PRODUCT_AUDIT.md` — the design source of truth).
**This file:** live product status. Update it when product-facing work ships.
**Android launch operations** (Play Console, signing, device tests, legal) live in
`PROGRESS.md` — that tracker is still current for `[You]` launch steps; this file owns
product/UX status only. Historical plans (`PRODUCT_V2.md`, `PROGRESS_V2.md`,
`docs/LAUNCH-AUDIT-PLAN.md`, the 2026-07-02 audits) are archived under `docs/archive/`
and are **superseded** — do not execute from them.

---

## Overall product rating: **6.5 → ~7.2 / 10** (Sprint 1 shipped 2026-07-04)

A 9/10 scoring engine and an 8/10 surface pattern. **Sprints 1, 2 and 3 are shipped**,
plus the nav refactor (3.4). Sprint 1 fixed the first-run trust collapse + integrity bugs;
Sprint 2 ("one coach") fixed cross-surface incoherence; Sprint 3 was the premium/polish
pass (icon set on the chrome, analytics null-guards, XP backfill, cockpit/day-chip fixes,
program de-dupe + CTA + labels). First-run, integrity, coherence and premium-feel are all
materially better. Remaining polish is a deliberate follow-up list (below). Full scorecard
in `PRODUCT_AUDIT.md` §11.

### Sprint 3 — "looks like it costs money" — shipped (2026-07-04)
- **3.1** New `js/ui/icons.js` inline-SVG stroke set replaces emoji on the bottom nav
  (home · dumbbell · chart · clipboard) and the Insights hub (gauge · dumbbell · activity ·
  heart · book · clock · scale · sparkle) — one coherent system via `paintIcons()`.
- **3.2** Programs: commitment strip "~4 sets per lift" (was "4 SETS/WEEK"); Discover rails
  de-dupe (a program appears once); detail CTA collapses to one primary + a compact
  Customize/Compare row; onboarding program cards gain a duration·frequency·length meta line.
- **3.3a** Spark trims trailing zeros (no crash-to-floor); Running Weekly Distance reads the
  current week + null-guarded delta (was "-- ↓100%").
- **3.3b** XP backfill from logged history (an 8-week athlete now reads Builder, not
  Initiate·28XP). Strength bands verified correct against published standards, left as-is.
- **3.3c** Cockpit START button hidden on run/rest days; today-marker on the day chips.
- **3.2b** Program cover-art system: a modality glyph watermark (bolt/dumbbell/run/flame/
  mountain) over the program gradient replaces the emoji on cards, the featured hero banner
  and the detail hero — the catalogue now reads as one designed system.
- **Deliberate follow-ups (not yet done):** icon set extended to Home tiles / milestones /
  quick-start sheet / program filter chips, VDOT-from-easy-runs estimate, "More" hub-bucket
  fold, type-ramp audit, splash polish, dead-DOM sweep.

### Sprint 2 — "one coach" — shipped (2026-07-04)
- **2.1** New pure `js/brain/day-verdict.js`: the day's single disposition
  (mode train|rest|deload|recover|done, isDeloadWeek, readiness, canProjectGain),
  computed once and read by the other surfaces instead of each re-deriving it.
- **2.4** `projectScore` is rest-aware — "train today and it rises to X" no longer fires
  on a rest day (it was reading the whole week's remaining sets).
- **coach voice** `generateRecommendation` gained rest-day + deload branches, so the coach
  line matches the mission ("Rest day — recovery" / "Deload week — keep it light") instead
  of "push it today". Fixes the briefing card, cockpit header and push at once.
- **2.3** Deload suggestion is program-aware (dropped the `week%4` heuristic) and gated on
  `isDeloadWeek` — no more "Apply deload" card during a deload week.
- **2.2** All four analytics Overviews (Strength/Running/Recovery/Review) show a
  deload-consistent insight on a deload week instead of "add sets / push / repeat it".
- **2.5** One readiness number — the Recovery & Load screen reads the shared `model.ready`
  (was recomputing its own → 93 vs 80).
- **2.6** Copy: "Biggest lift"→"Biggest driver"; "ready recovery"→"well recovered";
  "0 over the week"→"Held steady this week".
- Gates: 453 tests green, typecheck, smoke; verified in Chromium on the seeded deload
  rest day (briefing, mission, coach line, cockpit header, insights all agree).
- **Deferred to Sprint 3.3** (they're UX, not copy): cockpit START button matching the
  day type on no-lift days; today-marker on the day chips.

### Sprint 1 — "the first two minutes" — shipped (2026-07-04)

### Sprint 1 — shipped (branch `claude/fitness-app-design-audit-cedgym`)
- **1.1** Day-0 Hybrid Score no longer renders 0/"At Risk": the consistency pillar
  returns null before there's a baseline, the onboarding provisional score is persisted
  and blended as a low-confidence prior that decays as real data lands, the band is
  floored to "Building" while provisional, XP/history never bank a provisional score,
  and the "sessions" mislabel is fixed. Home + Score detail now read 65/Building,
  matching the reveal.
- **1.2** No front-door auth wall: fresh installs boot into onboarding, existing local
  users boot into the app; auth is opt-in via "Already have an account? Sign in"
  (onboarding) and "Sign in to back up & sync" (Settings).
- **1.3** Fabricated social proof removed from the UI (star ratings, "N ratings",
  "N athletes", "% finish", live-community rail claims); catalog numbers kept as hidden
  curation weights only.
- **1.4** Fasting Insights empty state starts a fast inline (killed the unreachable-Home
  dead-end).
- **1.5** Weekly volume + ACWR now read the current training week, matching Home/Score
  (was reading the program's padded final week → "--").
- Gates: 446 tests green, typecheck, smoke; every change verified in headless Chromium.

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

- **Gates:** 453/453 tests, typecheck, smoke — green (after Sprint 2).
- **Security/data:** RLS applied + adversarially proven on live DB; sync divergence
  detection + conflict UI + pre-pull snapshots; Sentry live (DSN set 2026-07-02).
  `docs/LAUNCH-CHECKLIST.md` items 1–2 are DONE per `PROGRESS.md` despite unticked boxes
  there (checklist updated this audit).
- **Where the product actually stands:** excellent for a day-60 user, broken for a day-0
  user, and self-contradicting whenever surfaces narrate the same day independently.
  Evidence and mechanics: `PRODUCT_AUDIT.md` §1, §3, §4.1.

## Known UX issues (bug register)

P0 — trust/correctness (beta blockers). **All P0s are now closed (Sprints 1 + 2).**
1. ~~Day-0 Hybrid Score renders 0/100 "At Risk"~~ — **FIXED (1.1)**: provisional prior
   blended, band floored to Building, consistency null before a baseline, sessions copy.
2. ~~First screen is an auth wall~~ — **FIXED (1.2)**: onboard first, auth opt-in.
3. ~~Contradictory day narration (rest-mission vs "train and it rises" vs "push it today";
   "Apply deload" during a deload week; deload-blind Overview insights)~~ — **FIXED
   (2.1–2.4, 2.2)**: shared `dayVerdict()`; rest-aware projection + coach; program-aware
   deload suggestion; deload-gated Overview insights.
4. ~~Same fact, different numbers: volume 9.2t vs "--"; ACWR 0.92 vs "--"~~ — **FIXED
   (1.5)**; ~~Home readiness 93 vs Recovery&Load 80~~ — **FIXED (2.5)** (shared model.ready).
5. ~~Fabricated social proof in the catalog UI~~ — **FIXED (1.3)**: display stripped,
   numbers kept as hidden curation weights.
6. ~~Fasting unreachable for never-fasted users~~ — **FIXED (1.4)**: empty state starts a
   fast inline (+ Home quick-action / centre "+" via 3.4).

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

1. **Sprint 1 — "The first two minutes"** ✅ **SHIPPED (2026-07-04).** Day-0 score fix,
   auth after onboarding, stripped fake ratings, fasting dead-end, volume/ACWR integrity.
2. **Sprint 2 — "One coach"** ✅ **SHIPPED (2026-07-04).** Shared `dayVerdict()`, rest/
   deload-aware projection + coach voice, program-aware deload suggestion, deload-gated
   Overview insights, one readiness number, copy pass.
3. **Sprint 3 — "Looks like it costs money."** ✅ **SHIPPED (2026-07-04)** except the
   deliberate follow-ups (program cover art; icon set on tiles/milestones/quick-start).
   Icon set on nav+hub; analytics null-guards; XP backfill; cockpit START-by-day +
   today marker; program de-dupe/CTA/label + onboarding meta.
   **Item 3.4
   (central "+" nav quick-start) — ✅ SHIPPED early (2026-07-04):** nav is now `Home ·
   Workout · ⊕ · Insights · Programs`; the orange centre "+" opens a Run/Walk/Fast sheet
   from any tab; Profile moved to an avatar tap in the Home header; Home Walk/Run row +
   fasting chip removed (quiet Home), with a live fasting status pill kept for an active
   fast. Verified in Chromium.
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

- 2026-07-04 · **Sprint 3 shipped — "looks like it costs money" (5 commits).** A restrained
  inline-SVG icon set (`js/ui/icons.js` + `paintIcons()`) replaces the emoji on the bottom
  nav and the Insights hub — the loudest remaining "web app" signal. Plus the correctness
  cluster: spark trailing-zero trim + Running current-week distance/delta (no "-- ↓100%"),
  XP backfill from logged history (8-week athlete → Builder not Initiate), cockpit START
  hidden on run/rest days + today-marker on day chips, program rail de-dupe + CTA hierarchy
  + "~4 sets per lift" label + onboarding program meta line. Strength bands checked against
  published standards and left correct. 453 tests / typecheck / smoke green; verified in
  Chromium. Then the **program cover-art system** (3.2b): a modality glyph watermark over the
  program gradient replaces the emoji on cards / hero banner / detail hero. · **Next /
  deliberate follow-ups:** icon set on tiles/milestones/quick-start/filter-chips,
  VDOT-from-easy-runs, "More"-bucket fold, type ramp, splash, dead-DOM sweep. Sprints 1–3
  (the beta-blocking work + the premium pass) are complete.
- 2026-07-04 · **Sprint 2 shipped — "one coach" (6 commits) + nav refactor (3.4).**
  Killed the cross-surface incoherence: a shared `dayVerdict()` decides the day once, and
  the projection, coach line, deload flag and analytics insights all read it. On a deload
  rest day the briefing, mission, coach line, cockpit header and every Overview now agree
  ("rest/recover/keep it light") — no more "train and it rises", "push it today" or "Apply
  deload" during a deload. Readiness is one shared number (Home == Recovery). Copy pass
  (Biggest driver / well recovered / held steady). Also shipped the centre-"+" nav (3.4):
  Home · Workout · ⊕ · Insights · Programs, Profile → avatar, quiet Home + live fast pill.
  453 tests / typecheck / smoke green; verified in Chromium. · **Next:** Sprint 3 (premium
  polish — icon set replacing emoji, program cover art, CTA hierarchy, null-guards, band
  calibration, XP backfill, cockpit START-by-day + day-chip today marker).
- 2026-07-04 · **Sprint 1 shipped — "the first two minutes" (5 commits).** Closed every
  P0 that a first-run user or store reviewer hits: **1.1** day-0 Score (provisional prior
  blended + decaying, band floored to Building, consistency null before a baseline, no
  XP banked for a provisional score, sessions-not-sets copy) — Home + Score detail now
  read 65/Building matching the reveal; **1.2** removed the front-door auth wall (onboard
  first, sign-in opt-in from onboarding + Settings); **1.3** stripped fabricated social
  proof from the programs UI (kept as hidden curation weights); **1.4** fasting empty
  state starts a fast inline; **1.5** weekly volume + ACWR read the current week (were
  reading the program's padded final week → "--"). 10 new tests (446 total), typecheck +
  smoke green; every change verified in headless Chromium. · **Next:** Sprint 2 ("one
  coach") — the shared `dayVerdict()` and insight-gating that kill the five-voices day.
- 2026-07-04 · **Complete product re-audit (this document + `PRODUCT_AUDIT.md`).** Read
  all prior docs; walked every screen headlessly as new + returning user; verified the
  shipped state of all three overhaul waves. Found the two beta-blocking themes: the
  day-0 trust collapse (auth wall → provisional 65 → real 0 "At Risk") and cross-surface
  incoherence (five conflicting verdicts on one deload rest day), plus fabricated program
  social proof and the fasting dead-end. Replaced the 2026-07-02 audit and the V2
  planning docs (archived to `docs/archive/`); updated the stale launch-checklist boxes.
  No product code changed. · **Next:** Sprint 1 ("the first two minutes"), then Sprint 2
  ("one coach") — both before any store screenshot or tester invite.
