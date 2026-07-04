# Helyx — Launch Audit Implementation Plan

Execution plan for the 2026-07-04 launch-readiness audit. Sequenced into four
phases, each item a self-contained, tested, committable slice. Ordered so the
highest-impact / lowest-effort work (the program "mystery box") ships first and
the beta is never blocked on a rewrite.

**Guardrails (every commit):** `npm test` · `npm run typecheck` · `npm run smoke`
all green before commit. Branch: `claude/helyx-launch-audit-qn9cg0`. Logical
commits per item. No push / PR without explicit OK. Forks are copies — never
in-place edits of shared catalog data.

**Baseline at plan time:** 383 tests pass, typecheck + smoke clean.

Legend — Impact ▮▮▮▮▮ · Effort ◔ (hrs) → ● (days). AC = acceptance criteria.

---

## Phase A — Program transparency (the mystery box) · **launch sprint**

The core purchase decision. Most of the data already exists in the catalog and
is only unrendered. This phase alone moves "Program browsing & detail" from 4.5
to ~8.

### A1 · Program "Plan" timeline  — Top-20 #1  ▮▮▮▮▮ · ◑
- **Goal:** a week-by-week view of the whole program before committing —
  progression, phase labels and deloads made legible.
- **Data source (exists):** each program's `weeklyVolModifiers['1'..'N']` =
  `{ sets, reps, intensityLabel }` (present in 48/55 programs). Generic fallback:
  `WEEK_PHASE_NAMES` (`js/constants.js`). Duration from `durationWeeks`.
- **Build:**
  1. New pure module `js/programs/timeline.js` →
     `buildProgramTimeline(program)` returns
     `[{ week, label, sets, reps, volumeScore, kind }]` where `kind` ∈
     `base | build | intensify | deload | peak | taper` derived from the label
     text (regex on "deload", "peak/test", "taper", "accumulat", "intensif").
     `volumeScore` = normalised `sets` (× reps if present) for the bar width.
     Graceful degrade: no `weeklyVolModifiers` → synthesise from
     `WEEK_PHASE_NAMES` up to `durationWeeks`, `volumeScore` flat.
  2. `js/programs/detail.js`: add a third tab **Plan** to the existing
     `an-tabbar` (`_detailTab` gains `'plan'`; reuse the re-render-on-switch
     machinery already there). Render a week list: week no · phase label · a
     volume bar · label-driven tint (deload = cyan, peak = red).
- **Tests:** `tests/program_timeline.test.js` — weeks contiguous 1..N, deload
  weeks flagged, degrade path yields N rows, kind classification cases.
- **AC:** open StrongLifts 5×5 → Plan tab shows 12 weeks, week 6 tinted/labelled
  distinctly from week 1, deload identified. Headless render clean.

### A2 · Commitment strip (the four deciding numbers) — #2  ▮▮▮▮ · ◑
- **Goal:** answer "what does this cost me?" above the fold.
- **Data (exists):** `durationWeeks`, `sessionsPerWeek`, `sessionDurationMinutes
  {min,max}`, `weeklyVolModifiers` (weekly working-set count), `equipment[]`,
  `settings.equipment {…}` for the owner.
- **Build:** in `detail.js` replace the flat stat row with a strip:
  - **Total time** = `sessionsPerWeek × avg(sessionDurationMinutes) × durationWeeks`
    → "~34h over 12 wks".
  - **Cadence** = "3×/wk · 30–50 min".
  - **Weekly volume** = working sets/wk from the week modifier (range across weeks).
  - **Equipment** = diff `program.equipment` vs `settings.equipment` → ✓ Own /
    ✗ Missing (X), colour-coded.
- **Tests:** pure helper `programCommitment(program, settings)` in
  `timeline.js`; test time-cost math and equipment diff (own / partial / missing).
- **AC:** strip renders real numbers; a user without a rack sees the barbell
  program flag the missing item.

### A3 · Full week-accurate day preview — #7  ▮▮▮ · ◔
- **Problem:** `openDayPreviewModal` / `renderSampleWorkout` always show week 1.
  (Note: exercise *selection* is constant across weeks by design — only
  sets/reps/intensity change via the week modifier — so "preview week N" means
  applying that week's modifier to the day, not swapping exercises.)
- **Build:** pass an optional `weekIndex` into `openDayPreviewModal(dayKey,
  programId, weekIndex)`; resolve sets/reps through
  `getWeekModifier(program, weekIndex)` so the preview reflects the chosen week.
  Wire Plan-tab week rows and day-split rows to pass their week.
- **Tests:** extend detail render test — modal for week 8 shows week-8 sets/reps.
- **AC:** tapping a day from week 8 shows week-8 numbers, not week-1.

### A4 · Quick wins bundle (sub-hour each)  ▮▮ · ◔
- **A4a Deload chip in day-split:** read the current week's `intensityLabel`;
  tint matching rows in the existing day list. (A taste of A1 for ~free.)
- **A4b Honest time-cost everywhere:** reuse `programCommitment` for the library
  card + active-program banner subtitles.
- **A4c Equipment ✓/✗ chips** on the detail tags row (reuses A2 diff).
- **A4d Hero carousel pause:** stop the 4s auto-advance on focus/hover and when
  `matchMedia('(prefers-reduced-motion)')` — `js/programs/library.js`
  `initHeroCarousel`. (A11y + native-feel.)
- **Tests:** guard test for reduced-motion (no interval created); equipment/time
  helpers already covered by A2.

**Phase A exit:** a user can read the entire arc of any program — weeks,
progression, deloads, volume, time cost, equipment fit — before committing.

---

## Phase B — Program agency (edit · fork · swap)

Answers the founder's direct ask ("make any program editable") and the lifter's
first instinct ("I'd swap that"). Plumbing is ~90% present.

### B1 · "Customize this program" — fork any catalog program — #3  ▮▮▮▮ · ◔
- **Exists:** `getProgramById(id)` normalises any catalog program to editable
  shape; `duplicateCustomProgram(id)` deep-clones **any** id into
  `customPrograms` re-authored to "You".
- **Build (Phase-1, hours):** add a **Customize** button to every catalog detail
  CTA block (`detail.js`). Handler → `duplicateCustomProgram(id)` (rename "Copy
  of …") → `openBuilder(newId)`. Original untouched. New fork surfaces in
  "My Programs".
- **Tests:** clone-from-catalog produces an editable custom program with `days`
  + `weeklyVolModifiers` intact; original unchanged.
- **AC:** from any catalog program → Customize → edit → Make Active works
  end-to-end.

### B2 · Deep builder (sets / reps / RPE / per-week progression) — #5  ▮▮▮ · ●
- **Problem:** `program_builder.js` edits only lift *names* + day title + run
  string; `createCustomProgram` seeds a flat `3×10` for every week.
- **Build:**
  1. Per-lift structure: let a day's `lifts[]` optionally carry
     `{ name, sets, reps, rpe }` (keep plain-string back-compat — resolver treats
     a string as name-only). Builder gains sets/reps/RPE inputs per lift row.
  2. Per-week editor: a compact table over `weeklyVolModifiers` (sets/reps/label
     per week) with "duplicate week" and "mark deload".
  3. Migration-safe: absent fields fall back to today's behaviour; `getWeekModifier`
     already defaults.
- **Tests:** builder edits round-trip through state; a forked+edited program
  loads the edited sets/reps in the cockpit (extend `workout_logging.test.js`).
- **AC:** fork StrongLifts, change week-3 to 3×5 + add an accessory at RPE 8 →
  cockpit shows the edited prescription in week 3.

### B3 · In-session exercise swap — #4 (highest retention)  ▮▮▮▮ · ●
- **Build:**
  1. Pure `js/workout/substitutions.js` — movement-pattern map (squat / hinge /
     h-push / v-push / h-pull / v-pull / carry / core) → ranked alternatives,
     filtered by `settings.equipment`.
  2. Cockpit: a **Swap** control on each exercise card → sheet of substitutes;
     remembered for the session (optionally the week) via `weekData.liftMeta`.
  3. **Preserve targets:** carry the prescribed target (`tw`/`tr`) onto the
     substitute so adherence + the Hybrid Score workout-quality term stay valid.
- **Tests:** substitution respects equipment; swapped lift keeps its target;
  history for the original isn't corrupted.
- **AC:** no rack → swap Back Squat → Goblet Squat; target carries; score
  quality term still computes.

### B4 · Compare two programs — #6  ▮▮▮ · ◑
- **Build:** a compare sheet: pick two → two-column diff of focus bars
  (`metrics`), weekly volume, days/week, level, time cost (reuse `programCommitment`).
  Entry from the library and from detail ("Compare").
- **Tests:** compare model builds from two ids; handles a WOD vs multi-week gracefully.
- **AC:** StrongLifts vs Starting Strength shows a readable side-by-side.

---

## Phase C — Onboarding, coach & native polish

### C1 · Onboarding goal → recommended starting program — #9  ▮▮▮▮ · ◑
- **Exists:** onboarding captures `fitnessGoal`, `fitnessLevel`, `equipmentTier`;
  `js/programs/recommendations.js` already ranks programs.
- **Build:** add a final onboarding step that runs the recommender against the
  captured answers and offers 1 tap to **Start this program** (sets
  `activeProgramId`). New users leave onboarding already training.
- **Tests:** recommender returns a sane pick for each (goal × level × equipment).
- **AC:** finish onboarding as "hybrid / intermediate / full gym" → a fitting
  program is pre-selected and startable in one tap.

### C2 · Ask-the-coach (canned intents first) — #8 (highest retention)  ▮▮▮ · ●
- **Build:** a coach input on Home / briefing answering a small set of intents
  from the **existing engine numbers** (no LLM v1): "should I train today?"
  (readiness + plan), "why did my score change?" (reuse `deltaBreakdown`),
  "am I overtraining?" (reuse `risk.js`), "what's my next PR?" (reuse
  `predictions.js`). Router maps phrase → deterministic answer.
- **Tests:** each intent returns the right engine-derived answer for fixture state.
- **AC:** typing "why is my score down" returns the real day-over-day attribution.
- **Later (post-beta):** guarded, PII-safe LLM phrasing layer over the same facts.

### C3 · Deload as an explained event — #18  ▮▮ · ◔
- **Build:** when a deload week is entered/applied, the briefing + timeline
  explain *why* ("planned recovery — you grow here"), reusing risk/label data.
- **AC:** deload week shows a one-line rationale, not a silent change.

### C4 · Cockpit ergonomics — #10, #11, #16  ▮▮ · ◑
- **C4a Rest auto-start** on working-set log (`timers.js` already tiered).
- **C4b Plate / warm-up math** surfaced on the exercise card (barbell table-stakes).
- **C4c Swipe between days** in the cockpit (gesture; guard reduced-motion).

### C5 · Analytics hero visual per leaf — #13  ▮▮ · ◑
- **Build:** give each of the 10 leaves one confident lead chart with an
  emphasised endpoint / area fill above the existing "so what" line, instead of
  equal-weight tile stacks. (Use the dataviz conventions.)
- **AC:** each leaf opens with a single clear answer visual.

### C6 · First-run empty states + share cards — #15, #17  ▮▮ · ◑
- **C6a** Aspirational day-0 states for score/analytics (sell the future, not a blank).
- **C6b** PR / milestone share cards beyond the score card (Strava-grade,
  reuse `share-card.js` canvas export).

### C7 · Type & spacing scale pass — #19  ▮▮ · ◑
- **Build:** consolidate to a documented type/spacing scale in `css/`; the last
  10% between "web app" and "native". Low risk, visual-only.

---

## Phase D — Code health (only where it de-risks the above)

### D1 · God-module teardown — #20  ▮ · ●
- `js/workout.js` (1,552) and `js/app.js` (1,302) are the two god-modules. Extract
  **only** the seams the above work touches (e.g. the cockpit swap + builder
  surfaces), behaviour-preserving, each extraction its own parity-tested commit.
  Do **not** refactor for tidiness before the beta.

---

## Recommended sequencing

1. **Sprint 1 (pre-beta, ~days):** A1 → A2 → A4 → B1 → A3. Ships the whole program
   shop-window fix + the founder's editability ask (Phase-1 fork). Biggest score
   move for least effort.
2. **Sprint 2:** C1 (goal→program) → B4 (compare) → C6a (empty states). Rounds out
   the new-user path.
3. **Post-beta:** B3 (swap) + C2 (ask-the-coach) — the two highest-retention
   builds — then B2 (deep builder), C3–C7, D1 as capacity allows.

**Projected readiness:** 7.0 → ~8.5 after Sprint 1; 8.5+ after Sprint 2.

## Item → Top-20 map
A1→#1 · A2→#2 · A3→#7 · A4d→#14 · B1→#3 · B2→#5 · B3→#4 · B4→#6 · C1→#9 ·
C2→#8 · C3→#18 · C4→#10,#11,#16 · C5→#13 · C6→#15,#17 · C7→#19 · D1→#20.
