# Helyx V2 — Execution Tracker

Companion to `PRODUCT_V2.md` (the philosophy) and `PROGRESS.md` (the Android-launch
tracker). This file turns V2's quarter roadmap (§9) into session-sized, file-level
slices. Same legend: `[CC]` Claude Code drives · `[You]` human action required.

**THE PATTERN (owner-endorsed 2026-07-03):** the fasting redesign is the template for
the *whole app* — **simple UI, powerful behind the scenes.** One signature gauge hero ·
a lean default surface with one synthesized insight line · all the power one tap deeper
under a Stats tab, never deleted. Codified in `docs/v2/ui-pattern.md`; every remaining
slice below must follow it.

**Working rules for every slice** (inherited from CLAUDE.md, restated because V2 is
mostly subtraction and subtraction is where data gets lost):
- One slice = one commit; `npm test` + `npm run typecheck` + `npm run smoke` green
  before each commit.
- **Feature code changes; user data does not.** Removing or restyling a feature never
  deletes or rewrites what a user already logged (their hidden-tile prefs, etc. stay
  untouched inside the state blob). State-schema fields are only ever abandoned, not
  stripped, so old cloud blobs load cleanly.
- Every deletion slice starts with a grep manifest (all references) and ends with a
  guard test where behavior changed.
- Old routes that die get a redirect in the analytics router, not a crash —
  notifications and saved deep links still resolve.

---

## Sequencing decision (made, revisit if wrong)

`PROGRESS.md`'s Play-beta push and V2 interleave like this: **ship Phase V2-1
(Subtract) before inviting testers or producing store screenshots.** The beta isn't
live and screenshots don't exist yet — first impressions and store assets should show
the V2 home, not the 13-surface one. The `[You]` device-test items from PROGRESS
Phase 2–3 can proceed in parallel at any time; Phase 4 (submit) waits for V2-1 only.

---

## OWNER OVERRIDE — fasting is retained (2026-07-03)

PRODUCT_V2.md §1 lists the fasting subsystem as the headline *deletion* (~3,150 lines).
**The owner has overruled that one line of the doc:** fasting stays. The directive is
**"minimal feel but still powerful"** — keep the calculation/insight/streak engine
(it's genuinely good), but subject its *presentation* to the same V2 laws as
everything else: one calm surface, no sprawl, premium not busy. So fasting is not an
exception to V2 — it gets the V2 treatment (redesign-to-minimal) instead of the
delete. Everything else in PRODUCT_V2.md stands. A pointer note is added to
PRODUCT_V2.md §1 so no future session re-reads "kill fasting" as live.

## Phase V2-0 — Guardrails before the knife  ·  (half a session) ✅
- [x] `[CC]` Tag the pre-V2 tree (`pre-v2` → `15152ff`) so any cut is one revert away.
- [x] `[CC]` Change manifest: grep-mapped fasting (keep/trim), the 24 analytics leaves,
      19 tiles, settings → `docs/v2/change-manifest.md` so slices can't miss a dangling
      import.

## Phase V2-1 — Subtract (Month 1)  ·  branch: this one

### S1 — Zero-style fasting: signature ring + protocols, powered by the existing engine
**Design decided with owner (2026-07-03):** a Zero-level fasting feature, minimalist
because the app is workout-focused. The engine already matches/beats Zero's paid tier
(6 metabolic zones, streaks, fasting score, HRV/sleep/recovery/bodyweight
correlations) — the gap is a **signature ring** and **named protocols**. Owner picks:
*"Ring + a Stats tab"* (hero ring primary, richer analytics one tap deeper) and
*"Add extended fasts"* (named presets incl. 24/36/48h with a caution note).

Build order (each a tested commit):
- [x] **S1a — Protocols (data layer, pure):** `FASTING_PROTOCOLS` in `js/fasting.js` —
      14:10, 16:8, 18:6, 20:4, OMAD (23:1) + extended 24h/36h/48h (`caution:true`).
      Helpers `protocolById`, `protocolForGoalHours`, `protocolLabelForGoal`. Additive:
      `goal` stays the numeric hours (back-compat); 23h added to `FAST_GOAL_OPTIONS`.
      7 tests. ✅
- [x] **S1b — Signature ring hero:** `js/fasting/fasting-ring.js` (`fastingRingSVG` +
      `ringArcOffset` + `ringCaption`) modelled on the Hybrid Score `gaugeSVG` — elapsed
      time centre, stage named + coloured, arc fills toward goal; live ticker rolls the
      arc/stage as zones cross. Replaces the linear bar in `fasting-card.js`; protocol
      chips replace the raw-hours `<select>` (new `fast-set-protocol` action); extended
      picks reveal the caution note. 6 ring tests; rendered + verified in Chromium. ✅
- [x] **S1c — Ring primary + Stats tab:** `view-fasting.js` now renders an
      Overview | Stats tab bar. **Overview** = Fasting Score card (+ streak/week/longest)
      · current-fast recap · daily insights · ONE `Fasting × Recovery` line
      (`_fastingRecoveryLine`, strongest of HRV→sleep→mood from the correlation engine —
      the hybrid-athlete angle). **Stats** = the deep analytics one tap deeper (metrics,
      advanced, trends, correlations, calendar, distribution, all-time, achievements,
      knowledge — power kept per owner's "Ring + a Stats tab"). New `fa-tab-*` actions;
      education deep-link jumps to Stats. Routing verified in Chromium (Overview lean,
      Stats deep). typecheck / smoke green. Note: education wall NOT pruned (kept in
      Stats); a later CSS sweep can drop the now-unused `.fasting-sheet-hero` block.
- [x] **S1d — Quiet home + stage nudges:** stage-entry + goal-reached notifications
      via a pure decider (`js/fasting/fasting-nudge.js`, 6 tests) + `pushFastingStageNudge`
      wired through the native NotifyBridge, fired on home render / app-open (marker
      persisted per-fast so each stage nudges once; `notifFastingStage` default on).
      Quiet Home: the fasting quick-action hides for users with no active fast and no
      history. Honest limitation documented: backgrounded WebView freezes timers, so a
      crossing lands on next foreground (same as every timer reminder). `[You]` device-
      test the nudges. ✅
- [x] **Kill the fasting learning/knowledge section (owner, 2026-07-03):** deleted
      `js/fasting/fasting-education.js` (505 lines), the "📚 Learn" button, the Fasting
      Knowledge section + its edu-hub renderers/handlers/actions, and the ~200 lines of
      education-only CSS (kept `.fa-edu-tip` callouts). Verified in Chromium: Stats still
      carries metrics/trends/calendar/achievements, no knowledge library.
- [ ] **Lifestyle pillar unchanged** — stays steps + fasting (E3); fasting stays a
      live Hybrid Score signal. No recompute.
- [ ] `[You]` Judge the ring + Stats split on the phone — minimal *and* still capable?

### S2 — Analytics: 24 leaves → 5 screens + fasting
Target mapping (each fact in exactly one place, per §4). Fasting is retained as its
own focused surface (owner override) — the other 23 leaves collapse to 5:
| New screen | Absorbs (current router cases) |
|---|---|
| **Score** | hybrid-score, projections |
| **Strength** | strength, strength_pr, weekly-volume |
| **Running** | running, avg-pace, vdot, run-crossref |
| **Recovery & Load** | recovery, recovery-score, training-status, load-focus, stress-balance |
| **Review** | weekly-review, weekly-summary, monthly-report, progress, activity, streak, bodyweight, goal-progress |
| **Fasting** *(kept)* | fasting — one minimal-but-powerful screen (see S1) |
Hero = **real headline number + spark** (owner-chosen 2026-07-03), not an invented
0–100 index. Reusable pattern classes: `.an-tabbar` / `.an-tab` / `.an-hero` /
`.an-spark` (analytics.css).
- [x] **Strength (template) ✅** — `view-strength.js` rebuilt into Overview | Stats.
      Overview: headline **Est. 1RM · top lift** + its weekly-e1RM spark + delta,
      Weekly Volume + PRs This Week, one synthesized insight. Stats: the full training-
      load dashboard, volume/strength progression, muscle balance, calendar, and the
      **1RM PR list** — absorbing the old `strength_pr` and `weekly-volume` leaves
      (router redirects both → Strength/Stats). Rendered + verified in Chromium.
- [x] **Running ✅** — Overview: headline **VDOT** + weekly-distance spark, Weekly
      Distance + Best Pace, one insight. Stats: endurance hero, fitness dashboard, pace
      analysis, race predictors, HR analysis, running load, distance. Absorbs avg-pace,
      vdot, run-crossref (router redirects → Running/Stats). Shared pieces factored into
      `_screen-kit.js` (tab bar · spark · esc); Strength refactored onto it too.
      Rendered + verified in Chromium.
- [x] **Recovery & Load ✅** — Overview: the **readiness gauge** as hero + status +
      recommendation, Form (TSB) + Load Ratio (ACWR) cards, one insight. Stats: the full
      recovery+load detail (`renderRecoveryScoreDetail`, generalised to any host
      section). Collapses all FIVE leaves — recovery, recovery-score, training-status,
      load-focus, stress-balance — into one screen ("three names for one concept", §4)
      via router redirects. Rendered + verified in Chromium.
- [x] **Review ✅** — Overview: headline **this week's Hybrid Score** + score-arc spark
      + delta, Sessions + Adherence cards, the week's focus line. Stats: the full Week in
      Review + Monthly Report. Absorbs weekly-review, weekly-summary, monthly-report
      (router redirects). Rendered + verified in Chromium. *(Scoped: bodyweight,
      progress, streak, goal-progress, activity kept as their own leaves for now — they
      carry distinct content not in the weekly story; fold into Review Stats in a
      follow-up rather than regress them.)*
- [x] `[CC]` **Cleanup:** Insights hub rewritten to the clean IA — 6 primary (Hybrid
      Score · Strength · Running · Recovery & Load · Review · Fasting) + a "More" group
      (Body Weight · Projections). The 11 absorbed leaves dropped from the hub (reachable
      via each screen's Stats tab); unused analytics.js imports stripped; unknown/absorbed
      contexts fall back to the hub. Nothing stranded (the 4 tiles' navigation resolves
      through the router redirects). typecheck / smoke green.
- [ ] `[CC]` Remaining follow-up (low priority): delete the orphaned view files
      (view-training-status / load-focus / run-crossref / vdot / avg-pace / stress-balance
      / weekly-summary) + their dead `#analytics-*` sections, and fold progress / streak /
      goal-progress into Review Stats (their router cases still exist but are hub-unlinked).

**Score screen** already carries the pattern from V2-2 (number + 3 dials + coaching
sentence; 8 pillars under the hood). So all five screens now read as one system.

### S3 — Tiles: 19 defs + customiser → 4 fixed
- [x] `[CC]` Home now renders exactly **Readiness · Weekly Volume · Top Lifts ·
      Avg Pace** (`HOME_TILE_IDS` in dashboard.js). The customiser is gone: removed the
      "Edit" button, `openTileCustomiser` / `closeTileCustomiser` / `resetTileCustomiser`,
      the `open/close/reset-tile-customiser` actions, `mountTileDragAndDrop` on Home, and
      the app.js imports. 3 tests. *(Dead-but-harmless remnants left for a later sweep:
      the `#tileCustomiserSheet` DOM in index.html and the now-unused tile fns in
      dragdrop.js; `dashboardTiles` state field abandoned in place.)*

### S4 — Home: one hero, then silence
- [x] `[CC]` Home is now **hero → briefing (session + mission) → "Go to Today's Workout"
      CTA → flag slot → 4 tiles**. The Hybrid Score card (with the 3 dials) is the hero,
      showAction:false so the briefing owns the one action (one voice). Flag slot = the
      existing overtraining/deload cards (already deduped by `risk.js`).
- [x] `[CC]` Moved off Home (hidden; all still reachable via Insights): weekly-progress
      header, week-compare card, engine-stall alert, the In-Focus performance graphs, and
      the quick-actions row (fasting / check-in / weight). Smoke renders the real Home
      graph clean. *(Kept on Home: the walk/run quick-start row — no other entry yet.)*
- [ ] `[You]` Look at it on the phone — the §3 two-second test is yours to judge
      (headless can't render the full booted Home; smoke confirms no crash).

### S5 — Settings: trim the power-user knobs ✅
- [x] `[CC]` Retired the doc's exact power-user examples — **band weights, progression
      step, per-tier rest tuning + remembered-rest reset** — by hiding them (elements
      kept so `settings.js` reads never null; underlying state keeps working defaults, so
      zero functional regression). **Kept** everything functional/consumer: name · body
      weight · units · goal/experience · threshold pace · equipment (drives programming)
      · program week · fasting · all notifications · theme · data export/delete. Scoped
      deliberately narrower than "→10": equipment and program-week affect behaviour, so
      they stay — cutting them would regress a limited-equipment user, which headless
      can't catch. Kept the Auto-rest on/off toggle (consumer), dropped its tuning.

### S6 — Pillars → 3 dials (display only; §9 puts this in Month 1)
- [x] `[CC]` Pure module `js/brain/hybrid-score/dials.js` (`computeDials` + `DIAL_MAP`):
      **TRAIN** = Consistency + Load · **RECOVER** = Recovery + Lifestyle · **PROGRESS**
      = Strength + Endurance + Momentum + Body (Body assigned here — §2.1 omits it but
      the composite math is untouchable per §2, so PROGRESS is its honest home). Each
      dial = weight-blended mean of its available members (pillar renormalised weights),
      null when all members are data-less; every pillar claimed by exactly one dial. 8
      pillars stay as the "under the hood" expansion. 6 tests. ✅ *(UI wiring of the
      dials into the Score card lands with V2-2's card rebuild.)*

**Phase V2-1 done when:** fasting redesigned to one minimal-but-powerful surface,
5 analytics screens (+ fasting), 4 fixed tiles, one-hero Home, ~10 settings, 3 dials
— and the §10 scorecard's first three rows hit target.

## Phase V2-2 — Make the number tellable (Month 1–2)
- [x] `[CC]` **Score card rebuilt around the 3 dials (§2.1 wireframe).** `dialsRow` in
      hybrid-score/ui.js renders TRAIN / RECOVER / PROGRESS (value + accent bar) into
      BOTH the Home hero (number + level + delta/momentum + confidence + biggest-lift +
      3 dials + one coaching sentence) and the Score detail. The 8 pillars are now an
      `<details>` "Under the hood" expander, collapsed by default — power one tap
      deeper. Confidence meter + E7 attribution kept. 3 UI tests; rendered + verified in
      Chromium (matches the wireframe). ✅
- [ ] `[CC]` Onboarding: "3 questions → provisional Score" so the wow is instant.
      (Provisional = low-confidence composite from self-reported level/frequency/
      recovery; confidence meter already communicates the uncertainty honestly.)
- [ ] `[CC]` Onboarding: "3 questions → provisional Score" so the wow is instant.
      (Provisional = low-confidence composite from self-reported level/frequency/
      recovery; confidence meter already communicates the uncertainty honestly.)

## Phase V2-3 — The morning hook (Month 2)
- [ ] `[CC]` Forward-looking score: pure `projectScore(state, {completeToday |
      skipUntil})` — simulate today's planned session through the existing pillars;
      render "rises to ~85 if you train" on the card + in the morning push.
- [ ] `[CC]` Morning push rewrite: decisive, forward-looking, one sentence
      (`composeMorningReminder` exists; the voice changes, not the plumbing).
- [ ] `[CC]` Streak-at-stake framing ("you'll lose your 12-day streak unless…") —
      `js/brain/streak.js` freeze/repair already makes it fair.
- [ ] `[You]` Device-test the push loop for a week. Retention is felt, not unit-tested.

## Phase V2-4 — One coach with memory (Month 2–3)
- [ ] `[CC]` Voice rewrite in `recommendations.js`/briefing: never quote mechanisms
      (no "ACWR 1.52"), speak consequences. Memory lines from daily history ("third
      strong week", "last time a deload broke this wall").
- [ ] `[CC]` **Retire the R8 so-what banners** — §7 says one voice in one place
      (Score card + push). R8 was right for V1's 23 leaves; the 5 V2 screens keep at
      most their own single headline. (Explicitly noted: this undoes recent work — the
      doctrine changed, the code follows.)

## Phase V2-5 — The shareable card (Month 3)
- [ ] `[CC]` Canvas/SVG export of the Score card: number, level, 3 dials, identity
      line, streak — the gauge card's visual language at share size. `navigator.share`
      + clipboard fallback (pattern exists in weekly-review).
- [ ] `[CC]` Weekly variant riding on `weekly-review.js`.

---

## Scorecard (from PRODUCT_V2 §10 — tick when true)
- [ ] Home: 1 hero + ≤3 quiet surfaces (today ~13)
- [ ] Analytics screens: 5 (today 23)
- [ ] Pillars shown by default: 3 (today 8)
- [ ] One-sentence explainability · one shareable thing · a reason to open before logging

## Session Log
_Newest first: date · what changed · what's next._

- 2026-07-03 · **Fasting redesign S1a–c shipped + pattern generalised to the app.**
  S1a named protocols (Zero-style presets incl. extended 24/36/48h), S1b signature ring
  hero (gauge-card language, live ticker, protocol chips) — verified in Chromium, S1c
  Overview | Stats tab split (lean default + one Fasting×Recovery line, power one tap
  deeper). Owner saw it, loved it, and asked for the *whole app* to follow the pattern —
  codified in `docs/v2/ui-pattern.md` (one gauge hero · lean surface + one synthesized
  line · power under Stats · curated-not-configurable). First generalisation shipped:
  **S6 3-dial collapse** (`dials.js`, pure, 6 tests) — 8 pillars → TRAIN/RECOVER/
  PROGRESS, engine math untouched. 357 tests / typecheck / smoke green. · Next: S1d
  (quiet home + stage nudges) then roll the pattern onto the Score card (V2-2) and the
  5 analytics screens (S2).
- 2026-07-03 · **Owner override: fasting is KEPT, not killed.** PRODUCT_V2.md §1's
  headline deletion is overruled — fasting stays as "minimal feel but still powerful":
  engine (calcs/insights/achievements/streaks) intact, presentation trimmed to one
  calm premium surface under the V2 laws. S1 rewritten from "delete the subsystem" to
  "redesign to minimal"; Lifestyle pillar stays steps+fasting (no recompute); fasting
  retained as its own focused analytics surface (IA is 5 collapsed screens + fasting);
  V2-0 fasting-confirm gate removed. Pointer note added to PRODUCT_V2.md §1.
- 2026-07-03 · Execution tracker created from PRODUCT_V2.md after codebase survey
  (fasting = 3,153 JS lines / 8 files; 23 router leaves; 19 tile defs; 49 settings
  rows). Sequencing decided: V2-1 before beta screenshots/testers. · Next: `[CC]`
  V2-0 guardrails (pre-v2 tag + change manifest), then V2-1 S1 fasting redesign.
