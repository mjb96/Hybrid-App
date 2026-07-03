# Helyx V2 — Execution Tracker

Companion to `PRODUCT_V2.md` (the philosophy) and `PROGRESS.md` (the Android-launch
tracker). This file turns V2's quarter roadmap (§9) into session-sized, file-level
slices. Same legend: `[CC]` Claude Code drives · `[You]` human action required.

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

### S1 — Redesign fasting: minimal feel, powerful engine (KEEP, don't delete)
Goal: fasting stops being "a whole second app" (its own 25-leaf-style sprawl) and
becomes **one focused, premium surface** — while the engine underneath stays intact.
- [ ] `[CC]` **Keep the engine:** `js/fasting/fasting-calcs.js`,
      `fasting-insights.js`, `fasting-achievements.js`, `fasting-actions.js`. This is
      the "still powerful" half — fasting-stage math, streaks, insights all survive.
- [ ] `[CC]` **Trim the surface** to minimal: collapse the fasting analytics view +
      charts (`view-fasting.js` 836 lines, `fasting-charts.js` 357) to one calm screen
      with the hero fast state + at most one supporting insight/chart, matching the
      gauge-card visual language (§8). Prune `fasting-education.js` (505 lines) to the
      essential in-context copy, not a wall.
- [ ] `[CC]` **Home presence stays quiet:** `js/home/fasting-card.js` shows a compact
      card *only while a fast is active or scheduled* (a live timer is worth the hero
      moment); otherwise fasting lives one tap away, not on the reduced Home.
- [ ] `[CC]` **Lifestyle pillar unchanged** — stays steps + fasting (E3). Fasting
      remains a real signal into the Hybrid Score; that's what "powerful" buys us.
- [ ] `[You]` Judge the redesigned fasting surface on the phone — is it minimal *and*
      still feels capable? Your call on where the line sits.

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
- [ ] `[CC]` One slice per new screen (5 commits): build the merged view from the
      existing view modules' best parts, then delete the absorbed views + hub entries
      + add router redirects. Bodyweight/goal-progress → Review is a judgment call
      (V2 doc is silent) — flag at review if it reads wrong.
- [ ] `[CC]` Delete orphaned chart/calc code only after all 5 land (calcs feed the
      Score engine — most survive; views die, math lives). Fasting calcs are kept.

### S3 — Tiles: 19 defs + customiser → 4 fixed
- [ ] `[CC]` Keep exactly: **Readiness · Weekly Volume · Top Lifts (strength #) ·
      Avg Pace (running #)**. Delete the other 15 defs, `js/dragdrop.js` customiser,
      `DEFAULT_HIDDEN_TILES` machinery, customiser settings row. `dashboardTiles`
      state field abandoned in place.

### S4 — Home: one hero, then silence
- [ ] `[CC]` Above the fold: Hybrid Score card only (it absorbs the morning-briefing
      card's action + coaching sentence — one voice, §7). Below: today's-session card
      → 4 tiles → one **flag slot** merging the overtraining danger card + deload
      advisory into a single calm surface (`js/brain/risk.js` already dedupes them).
- [ ] `[CC]` Off Home: weekly-progress header, week-compare, In-Focus graphs,
      activity calendar (→ Review screen), quick actions (→ Workout tab), engine
      alerts (→ the flag slot or death).
- [ ] `[You]` Look at it on the phone. The two-second test from §3 is yours to judge.

### S5 — Settings: 49 rows → ~10
- [ ] `[CC]` Keep account/auth, units, notifications, health-connect, data export/
      delete, theme. Kill power-user knobs (band weights, progression step,
      remembered-rest reset, …). Underlying state fields abandoned, defaults apply.

### S6 — Pillars → 3 dials (display only; §9 puts this in Month 1)
- [ ] `[CC]` Pure module `js/brain/hybrid-score/dials.js`: **TRAIN** = Consistency +
      Load (+E5 adherence) · **RECOVER** = Recovery + Lifestyle · **PROGRESS** =
      Strength + Endurance + Momentum + Body. (V2 §2.1 omits Body from the mapping —
      the composite math is untouchable per §2, so Body must live somewhere; PROGRESS
      is the honest home. Flag at review.) 8 pillars stay as "under the hood"
      expansion. Tests: dial values are pure functions of pillar contributions.

**Phase V2-1 done when:** fasting redesigned to one minimal-but-powerful surface,
5 analytics screens (+ fasting), 4 fixed tiles, one-hero Home, ~10 settings, 3 dials
— and the §10 scorecard's first three rows hit target.

## Phase V2-2 — Make the number tellable (Month 1–2)
- [ ] `[CC]` Rebuild the Score card: huge number + level + delta/momentum + 3 dials +
      ONE coaching sentence (§2.1 wireframe). Keep confidence meter + E7 attribution.
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
