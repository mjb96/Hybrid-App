# Helyx — Product Audit & Design Blueprint

**Audit date:** 2026-07-04 · **Status:** the single source of truth for product/UX decisions.
**Method:** full documentation review, full codebase read, and a headless-Chromium walk of
every screen in two personas — a brand-new user (fresh install through onboarding to day-0)
and a returning athlete (8 seeded weeks of hybrid training). All findings below were
**observed in the running app on this date** or verified in code (`file:line`). Everything
recommended by previous audits that has shipped has been removed from this document — see
`PRODUCT_PROGRESS.md` for the record of completed work.

> **How to read this:** §1 is the verdict. §2 is the vision and the design laws that are
> already codified and working — do not re-litigate them. §3 is the one systemic problem
> this audit exists to name. §4 is screen-by-screen. §5–§8 are workflows, IA, gaps and
> polish. §9 is what NOT to build. §10 is the prioritised roadmap. §11 is the scorecard.

---

## 1. Executive summary

Helyx is two different apps depending on which day you meet it.

**The app on day 60 is genuinely excellent.** The returning-athlete pass showed a calm,
premium Home: one Hybrid Score hero (84, three dials, one coaching card), a focused
four-tile glance row, a clean 5+1 Insights hub, a program surface with a real week-by-week
plan, in-session exercise swap, plate math, and a deep, honest, tested scoring engine that
no competitor has. The V2 subtraction work (25 analytics leaves → 5 screens, 19 tiles → 4,
one hero per screen) *worked*. The bones of a best-in-class hybrid training product are here.

**The app on day 0 breaks its own promise within two minutes.** A new user hits an
email/password wall before seeing any value, walks a good onboarding, is shown a
provisional Hybrid Score of ~65 ("Here's your starting Hybrid Score") — and then lands on
Home where the real engine renders **0 / 100 · "At Risk"** in red, with the driver
"−50 Consistency — 89 planned sessions still open." The single most carefully designed
moment in the product (the reveal) is contradicted by the very next screen.

**And on any day, the app speaks with several voices at once.** On one seeded deload-week
rest day, the same user was told: "Rest day — rest well, recovery is where you grow"
(Home mission), "Train today and your score climbs to 86" (same card, two lines up),
"Well rested — push it today" (Workout header), "Below effective volume — add sets"
(Strength insight), "Ready for a training block push" (Recovery insight), "A strong week —
repeat it, progressive overload wins" (Review insight), and was offered an "APPLY DELOAD"
button — *during the deload week the briefing had just explained*. Each line is locally
defensible; together they read as a machine, not a coach. Whoop and Garmin feel premium
not because their screens are prettier but because **every surface agrees**.

The engine is a 9. The presentation pattern is an 8. The **coherence is a 4**, and
coherence is the product. The roadmap in §10 is therefore not a feature list: Sprint 1
fixes the first two minutes, Sprint 2 makes the app one coach with one voice, Sprint 3
spends polish where the eye actually lands. Nothing new gets built until those land.

**Top 5 actions (all pre-beta):**
1. Fix day-0: blend the provisional score until real data earns confidence; never show
   0/"At Risk" to a user who hasn't missed anything (§4.1, P0).
2. Move account creation out of the front door — onboard first, offer sync when there is
   something to sync (§4.1, P0).
3. Build the shared **Day Verdict** — one rest/train/deload decision consumed by every
   surface, and gate every insight line through it (§3, P0).
4. Remove fabricated social proof (4.8★ · "1,560 ratings" · "9,200 enrolled" are hardcoded
   in the catalog). It is a trust landmine and a store-review risk (§4.5, P0).
5. Replace emoji iconography (nav, hub, tiles, program art) with one restrained icon set —
   the single loudest "not premium" signal left (§8, P1).

---

## 2. Product vision & design philosophy (settled — do not re-open)

**One sentence:** *Helyx gives a hybrid athlete a single daily number for how well they're
balancing strength and endurance — and tells them the one thing to do today.*

**Positioning:** the coach for people who lift *and* run. Garmin/Strava own running data,
Hevy/Strong own set logging, Whoop owns recovery. Nobody owns the *combination*, and the
Hybrid Score's balance pillar is a genuinely novel, defensible asset. The wedge is the
score + the daily verdict, not feature breadth.

**The design laws** (codified in `docs/v2/ui-pattern.md`, proven by the shipped surfaces —
every future change must pass them):
1. **One hero per screen.** If two things compete for the eye, one is wrong.
2. **Payoff before homework.** Value first; input is earned. (The auth wall and the day-0
   score currently violate this — §4.1.)
3. **Power one tap deeper, never deleted.** Lean Overview, depth under Stats.
4. **Curated, not configurable.** Defaults are our job, not the user's.
5. **One synthesized sentence, not a spreadsheet.** No mechanism-quoting on default surfaces.
6. **Data safety first.** Presentation changes never strip stored user data.

**New law this audit adds — the missing seventh:**
7. **One truth per day.** Every surface must agree on today's verdict (train / rest /
   deload), today's readiness number, and this week's totals. A fact rendered in two
   places with two values is a P0 bug, not a polish item. (§3.)

**Intentionally rejected directions** (recorded so they are not re-proposed): see §9.

---

## 3. The systemic finding: one engine, many voices

Every serious defect found this audit is one underlying architecture gap wearing different
costumes. There is one shared *data* model (`computeDashboardModel` — good), but **no shared
*decision* model.** Each surface re-derives "what should the athlete do/feel today" on its
own:

| Surface | Derives its verdict from | Said (same seeded day) |
|---|---|---|
| Home briefing | `buildMorningBriefing` (rest/deload-aware) | "Rest day · Rest well — recovery is where you grow" ✅ |
| Home briefing, 2 lines up | `projectScore` (not rest-aware in render) | "Train today and your score climbs to 86" ❌ |
| Home briefing coach line | `buildAdvice` (readiness-led) | "Well rested — **push it today** … Enjoy the rest day" ❌ self-contradicting in one sentence |
| Workout header | recommendation headline + projection | "push it today" / "84 → 86" ❌ |
| Home flag slot | `shouldSuggestDeload` (`js/engine.js:490` — `week % 4 === 0` heuristic, ignores the program's real deload weeks and the fact this week already IS one) | "APPLY DELOAD" ❌ |
| Strength Overview insight | muscle-volume heuristic (deload-blind) | "Below effective volume — add sets to reach the growth range" ❌ |
| Recovery & Load insight | TSB trend (deload-blind) | "Ready for a training block push" ❌ |
| Review insight | week-over-week momentum (deload-blind) | "A strong week — repeat it. Progressive overload wins" ❌ |
| Home briefing readiness | `model.ready` (load-included) | "Readiness **93 — Peak**" |
| Recovery & Load hero | load-excluded readiness | "**80 · Ready**" ❌ same fact, different number, no explanation |

Two readiness numbers exist for a good engine reason (E3 de-double-counting), but the user
was never told there are two; they just see the app disagree with itself.

**The fix is one small module, not a rewrite** — this is the highest-leverage project in
the entire document (§10, Sprint 2): a pure `dayVerdict(model, state, program)` that
returns `{ mode: 'train'|'rest'|'deload-train'|'recover', readiness, headline, projection? }`
computed **once**, consumed by the briefing, the cockpit header, the projection line, the
flag slot, and — critically — passed to every Overview insight builder as a **gate**: an
insight that says "add sets" or "push" must be suppressed or reframed when
`mode ∈ {rest, deload-*}`. One verdict, quoted everywhere. This is what "one coach" means
mechanically, and it's what separates Whoop-grade coherence from a dashboard with good CSS.

---

## 4. Screen-by-screen review

Grades are for what exists today, against "best fitness app on the market" standards.

### 4.1 First run: auth → onboarding → day 0 — **Grade: D** (the product's worst surface)

The single most important sequence in the app, because beta testers and store reviewers
only ever experience it once. Observed flow, fresh profile:

1. **The first screen is a login form** (`index.html:345` — static overlay, shown before
   anything else; "Continue Offline" is the quiet secondary). Sign-in *before any value* is
   the defining anti-pattern of failed consumer apps. Every leading fitness app onboards
   first and asks for an account when there is something worth saving.
   **Fix:** boot straight into onboarding; offer "Save your progress" as onboarding's last
   step and in Settings. Keep the auth overlay only for returning-user restore ("Already
   have an account? Sign in"). *Impact: activation + store rating · Effort: S · P0.*

2. **Onboarding itself is good** — name → goal → level/frequency/recovery/equipment →
   recommended program (level- and equipment-aware) → units → notification ask with honest
   copy → provisional-score reveal. Two gaps:
   - The program step shows only names + taglines ("Helyx Foundations — the definitive
     starting point"). The one decision that shapes week 1 gives none of the data the
     program system already has (duration · days/week · session length). Add a meta line
     per option. *Effort: S · P1.*
   - The reveal promises "sharpens into the real thing" — and then day 0 breaks it (next).

3. **Day-0 Hybrid Score is 0 / 100 · "At Risk" (red), driver "−50 Consistency — 89 planned
   sessions still open."** Root cause chain, verified: with zero history, every pillar is
   null except Consistency (a plan exists → it "has data" → 0% done); weights renormalise
   onto that single pillar; score = 0. The signal string counts *sets* but says *sessions*
   (`js/brain/hybrid-score/pillars.js:85`). The provisional score from the reveal is never
   blended into the real engine — it exists only on the reveal screen.
   This is the worst bug in the product: it punishes a user who has done nothing wrong,
   directly contradicts the reveal from 60 seconds earlier, and wears the scariest label
   the app has ("At Risk").
   **Fix (all three):** (a) a week-1/no-history state is "no data yet", not zero — seed the
   engine with the provisional score at its stated low confidence and decay it as real
   pillars come online; (b) never render "At Risk" below a minimum data threshold — use
   "Building · first week" framing; (c) count *sessions* in the signal, or say "sets".
   *Impact: activation, trust, reviews · Effort: M · **P0, the top item in the roadmap.***

4. **Day-0 tiles** show "SQ -- kg · BP -- kg" and "--:-- min/km" dashes. Honest but inert.
   Aspirational empty states ("Your first squat session unlocks this") were partially done
   for analytics leaves; finish the job on the four Home tiles. *Effort: S · P2.*

### 4.2 Home (returning user) — **Grade: B+**

The V2 shape is right and feels premium: score hero → briefing → CTA → flag slot → 4 tiles
→ activity calendar. Total page height ~2 viewports (was ~7 pre-V2). Remaining issues:

- **The briefing card holds three voices** (§3): mission says rest, projection says train,
  coach line says both in one sentence. Gate all three through the Day Verdict. *P0.*
- **"BIGGEST LIFT · Consistency — 3 planned sessions still open +12"** — in a *lifting*
  app, "biggest lift" reads as "your best barbell lift", and the value shown is…
  "Consistency". Rename to "Biggest driver" (and the open-sessions phrasing reads as a
  negative inside a positive +12 chip — use "leading the score" framing). *Effort: XS · P1.*
- **Week header duplication:** the page header says "Week 8 · Deload Week" and the briefing
  repeats "WEEK 8 · DELOAD WEEK" four lines lower. One context line is enough — drop the
  page-header phase label. *Effort: XS · P2.*
- The deload flag card contradiction is covered in §3 — `shouldSuggestDeload` must read the
  program's real deload map (the timeline module already computes it) instead of `week % 4`,
  and must never fire during a week that is already a deload. *Effort: S · P0 (part of Day Verdict).*

### 4.3 Workout cockpit — **Grade: B**

Strong: one primary CTA per state, collapsed Session Overview, achieved-summary accordions
("✓ 3 × 8 @ 80kg" in green), ghost targets with coach chip + "Log all", plate math, swap
with target preservation, day swipe. This is competitive with Hevy/Strong for programmed
lifting and ahead of them for hybrid days. Issues:

- Header repeats the un-gated "push it today" + projection line on rest days (§3). *P0 with the verdict.*
- **"START WORKOUT" renders on days with nothing scheduled** ("No lifting scheduled
  today" directly beneath it). The primary action should match the day: "Start Run" on run
  days, "Log something anyway" ghost on rest days. *Effort: S · P1.*
- The day chips (Mon/Tue/Wed…) don't mark **today** — the selected chip and today's chip
  can differ and nothing distinguishes them. *Effort: XS · P1.*
- Run day: manual dist/time/RPE entry + Track This Run + watch import is the right trio,
  well laid out. No change.

### 4.4 Insights (hub + 5+1 screens) — **Grade: B−** (pattern A, data integrity C)

The 5+1 IA (Score · Strength · Running · Recovery & Load · Review · Fasting, + "More")
is clean and each screen's Overview|Stats split works. The problems are *inside* the
Overviews — and they matter more than the layout wins, because an analytics screen that
contradicts another screen teaches the user to trust neither:

- **Strength Overview** (seeded data): hero "Est. 1RM · Deadlift 163 kg · **+3 kg this
  week**" above a sparkline whose last point **crashes to zero** — the chart refutes its
  own caption (current-week point rendered before the week has data). Suppress the
  in-progress week from the spark, or carry the last known value. *Effort: S · P1.*
- **Weekly Volume tile shows "--"** on the same day Home's tile shows "9.2t ▲3%". Two
  different series feed "this week's volume" (dashboard model vs analytics view). Whatever
  the cause, the law is §2.7: one fact, one number. Route both from the same model field.
  *Effort: S–M · P0 (data integrity).*
- **Running Overview:** "Weekly Distance **-- ↓ 100% vs last week**" — a delta chip
  rendered against a null current value (also missing a space: "100%vs"). Null-guard all
  delta chips. *Effort: XS · P1.* VDOT hero for a 16-run easy-pace user is an empty "Log a
  hard run (or set a threshold pace) to unlock" — homework framing on the screen's hero.
  Estimate conservatively from easy efforts with a "~" and low-confidence label, or lead
  with best pace instead and make VDOT the secondary. *Effort: M · P2.*
- **Recovery & Load Overview:** readiness 80 vs Home's 93 (§3); "Load Ratio (ACWR) --"
  renders as an amber-bordered empty card while the Score detail happily prints
  "ACWR 0.92" — same engine, one screen says unknown, another says 0.92. *P0 (data
  integrity, same fix class as volume).* The insight "Ready for a training block push"
  needs the deload gate (§3).
- **Review Overview:** "0 over the week" is machine copy (say "held steady"); the
  Momentum card's "repeat it / progressive overload wins" needs the deload gate. *P1.*
- **Week-nav bar** ("Week 8 · Current" + arrows) renders above every screen including
  Fasting, where program-week context is meaningless. Show it only where the data is
  week-indexed. *Effort: S · P2.*
- **Hub "More" bucket** (Body Weight · Projections) is an IA leak — two orphans that
  didn't fit. Fold Body Weight into Review/Stats (weight lives with the weekly story) and
  Projections into Score/Stats ("where you're headed" was the original V2 intent). Hub
  becomes exactly six doors. *Effort: M · P2.*

### 4.5 Programs — **Grade: B** (surface) / **D** (integrity)

Discover (hero + featured + 4 rails + category grid + Build Your Own) is a real shop
window now, and the detail page's identity header + Overview|Structure|Plan + commitment
strip answers the four buying questions. Remaining:

- **Fabricated social proof, hardcoded in the catalog** (`js/programs/catalog/hybrid.js:317`
  et al.): `rating: 4.8, ratingCount: 1560, enrolledCount: 9200, completionRate: 0.59` —
  rendered as "★ 4.8 · 1,560 ratings" on a pre-launch app with zero users. Beta testers
  will figure this out instantly ("Trending — surging in popularity right now"), and
  store reviewers may read it as deceptive. The rails sorted by these numbers are fine;
  the *display* of invented counts is not.
  **Fix:** strip rating counts/enrolled counts from the UI until real ratings exist (the
  in-app rating system already ships); keep curation as editorial ("Helyx Pick", "Staff
  favourite"). Keep the hardcoded numbers only as hidden sort weights if desired.
  *Impact: trust/legal · Effort: S · **P0.***
- **CTA block overload** on detail: four stacked/cramped buttons ("View Active Program",
  "Mark as Complete", "Customize — make an editable copy" wrapping to four lines,
  "Compare with another program") plus a rating row that **overflows the 390px viewport**.
  One primary CTA per state (Start / Continue), everything else into a ⋯ overflow or the
  tab body. *Effort: S · P1.*
- **Commitment strip says "4 SETS/WEEK"** — wrong or mislabeled (a 5-day program is not 4
  working sets a week; the number reads as per-lift sets). Label what it is ("~4 sets per
  lift") or show the true weekly range the timeline already computes. *Effort: XS · P1.*
- **Duplicate cards across rails:** HYROX Race Simulation appeared in three rails on one
  Discover screen. De-dupe: a program appears in at most one rail per render. *Effort: S · P2.*
- **Emoji card art** (⚡ / 🏟 / 🏃 on gradients) is the weakest visual in the app — Ladder
  and Peloton sell programs with art direction. A systematic generated-cover approach
  (modality glyph + program-specific gradient + typographic lockup, no emoji) lifts the
  whole store. *Effort: M · P1 (with §8 icon work).*

### 4.6 Profile — **Grade: B+**

Identity hero (avatar · Hybrid Athlete · weight · streak) + relative-strength bands +
Overview|Stats is the right shape; milestones grid is a good trophy room. Issues:
- **Strength band calibration looks wrong to the audience it serves:** Squat 1.42×BW
  labelled NOVICE while Bench 1.23×BW is INTERMEDIATE. By any common standard (Symmetric
  Strength, strength-level tables) 1.4×BW squat ≥ 1.2×BW bench. Lifters will screenshot
  this. Re-check the per-lift thresholds. *Effort: S · P1.*
- Streak text truncates in the hero ("🔥 2…") at 390px. *Effort: XS · P2.*
- An 8-week-consistent athlete shows "Initiate · 28 XP" because XP only accrues from
  score-recorded days. Backfill XP from historical logged sessions on first score run, or
  the level system insults exactly the loyal users it exists to retain. *Effort: M · P1.*

### 4.7 Fasting — **Grade: B, with one dead-end**

The ring + protocols + Overview|Stats redesign is the pattern's reference implementation,
and hiding fasting from Home for non-fasters is correct. But the loop has a hole:
**Insights → Fasting (never fasted) says "Start your first fast from the home screen" —
and the Home entry point is hidden for exactly those users** (`js/home.js:252`). The
feature is unreachable for anyone who hasn't already used it.
**Fix:** the empty state's CTA starts a fast right there (protocol picker inline), no
round-trip to Home. *Effort: S · P0 (it's a broken loop, not polish).*

### 4.8 Settings — **Grade: A−**

The trim to consumer-grade settings worked; nothing to remove or add. Keep resisting knobs.

### 4.9 States (loading / empty / error)

- Empty states: analytics leaves have honest copy; Home tiles day-0 are inert dashes
  (§4.1.4); Fasting's is a dead-end (§4.7).
- Error state: render shields + toasts are solid; sync conflict modal is best-in-class
  honesty. No SW/offline complaints observed.
- Loading: boot is a black flash then content; a 200ms branded splash-to-hero transition
  would finish the native feel. *Effort: S · P3.*

---

## 5. Workflow review (the six journeys that matter)

| Journey | State today | Verdict |
|---|---|---|
| **First open → first value** | Auth wall → onboarding (good) → reveal (good) → day-0 score contradicts reveal | **Broken at the last step** — Sprint 1 |
| **Morning check-in** | Open → score + briefing + mission in one viewport | **Works** once voices unify; the 2-second test passes |
| **Log a programmed lift day** | Cockpit → ghost targets → tap/Log-all → rest timer → finish → recap | **Strong**; equal to Hevy/Strong, better coached |
| **Log a run** | Quick Start GPS or cockpit manual/watch-import; recap with splits/map/zones | **Strong** (GPS needs the pending device test) |
| **Pick / trust a program** | Discover rails → detail (plan, cost, fit) → customize/fork | **Good** minus fake ratings + CTA clutter |
| **Weekly reflection** | Sunday push → Review screen → share card | **Good**; needs deload-aware voice |

The workflows are in materially better shape than the screens' insight lines — the
mechanics were fixed by the last three overhauls; the *narration* is what lags.

---

## 6. Information architecture

Current: 5 tabs · Home (verdict) · Workout (do) · Insights (understand: 6 doors) ·
Programs (plan) · Profile (identity). **This is right. Do not add tabs or doors.**
Remaining IA debt, all small: fold the "More" bucket (§4.4), fix the fasting dead-end
(§4.7), show week-nav only on week-indexed screens (§4.4), and de-dupe rails (§4.5).
Redirects for absorbed leaves are in place and correct.

**Central "+" quick-start (planned — see §10 item 3.4).** The three "start something
now" actions (Run · Walk · Fast, later the quick-log family) consolidate into a single
raised "+" in the **centre** of the nav bar rather than living as buttons on Home. This
is the native pattern (Strava/NRC/Instagram), makes starting reachable from *every* tab,
and lets Home go fully quiet — removing the Walk/Run row and the interim Home fasting
chip. Two rules: the "+" only ever *initiates*; an *in-progress* fast or GPS activity
must still surface a slim persistent status pill (never bury a live timer behind a menu).
**Decided layout (owner, 2026-07-04):** the bar becomes **`Home · Workout · ⊕ · Insights
· Programs`** — 4 tabs + a centre "+". **Profile leaves the bar and is reached by tapping
the athlete avatar in the Home header** (the universal "account" pattern); the Profile
view itself is unchanged.

---

## 7. Feature gap analysis (vs. the field)

What Helyx already has that the field doesn't: the balance-aware score, honest additive
"why", deload explanation, fork-any-program, hybrid-day cockpit. Gaps that matter
commercially, in priority order:

1. **Coherence** (§3) — Whoop's actual moat. No feature closes this; the Day Verdict does.
2. **Trust at first contact** (§4.1) — activation is the funnel's only gate that matters
   pre-beta.
3. **Visual authority** — emoji icons/art vs. Ladder/Whoop's restraint (§8). This is the
   gap between "impressive web app" and "premium product" in a store screenshot.
4. **Auto-VDOT for easy-pace runners** (§4.4) — most hybrid users never do a "qualifying
   hard effort"; their Running screen hero stays empty forever.
5. *(Post-beta, deliberately deferred)* wearable-grade recovery inputs via Health Connect
   already land when the user connects; no new integrations before launch.

Not gaps (despite being conventional): social feed, community, AI chat, meal tracking,
watch apps, live classes. See §9.

---

## 8. UI polish opportunities (the premium pass)

Ordered by perceived-quality-per-effort:

1. **One icon set.** Replace emoji in: bottom nav (🏠🏋️📊📋👤), Insights hub rows, tile
   headers, program art, milestone grid. A single 24px stroke set (inline SVG, ~20 glyphs)
   in the gauge-card language. This is the C7 successor and the loudest single upgrade.
   *Effort: M · P1.*
2. **Program cover system** — glyph + gradient + type lockup, generated per program
   (§4.5). *M · P1.*
3. **Null-safety for chips and sparks** — no delta chip without a current value; no spark
   endpoint for an in-progress week (§4.4). *S · P1.*
4. **Copy pass on machine-ese** — "ready recovery", "0 over the week", "89 planned
   sessions still open", "New today"+"→ Building trend" chip stack. One writing rule:
   every line must survive being read aloud by a coach. *S · P1.*
5. **CTA hierarchy on program detail** (§4.5). *S · P1.*
6. **Type ramp audit** — the deferred C7; do it after the icon pass, post-beta, screen by
   screen. *M · P3.*
7. **Dead DOM sweep** — `#tileCustomiserSheet` + customiser CSS still ship in index.html
   (harmless, off-screen — verified top:844px — but it's dead weight in every load and a
   confusing artifact in full-page captures). *XS · P3.*

---

## 9. Things NOT to build (rejected with reasons — do not re-propose)

- **iOS / Capacitor / TWA migration** — out of scope until Android beta proves retention.
- **Billing / paywall / subscriptions** — free beta; monetisation decisions need retention
  data first.
- **LLM coaching layer** — rejected *until* the deterministic voice is unified (§3).
  Layering language generation over contradictory verdicts would launder incoherence into
  fluent incoherence. Revisit only after Sprint 2 ships and holds on device.
- **Social feed / community / leaderboards** — the shareable card is the entire social
  surface. A feed is a different company.
- **More analytics leaves, tiles, or settings** — the subtraction was the feature. Any
  new surface must retire an old one.
- **More programs** — 55 is above the choice-paralysis line already; curation > catalog.
- **Field-level sync merge** — blob LWW + divergence modal + backups is proven adequate at
  current scale; revisit at real multi-device usage volume.
- **A second gamification layer** (leagues, badges beyond milestones, daily chests) — XP +
  levels + streak freezes + milestones is complete. Depth beats breadth here.
- **Configurability returns** (tile customiser, profile customiser, power-user knobs) —
  removed deliberately; the answer to a layout complaint is a better default.

---

## 10. Prioritised roadmap

Effort: XS <1h · S ~half-day · M 1–3 days · L 1–2 weeks. All pre-beta unless marked.

### Sprint 1 — "The first two minutes" (P0, blocks beta)
| # | Item | Why | Effort |
|---|---|---|---|
| 1.1 | Day-0 score: blend provisional, floor the no-history state, "Building" not "At Risk", sessions-not-sets copy | The reveal→Home contradiction is the first thing every tester sees | M |
| 1.2 | Auth after onboarding, not before (keep returning-user sign-in link) | Payoff before homework; activation | S |
| 1.3 | Strip fabricated rating/enrolled counts from all program UI | Trust + store risk | S |
| 1.4 | Fasting empty-state starts a fast inline (kill the dead-end) | Broken loop | S |
| 1.5 | Same-fact-same-number: weekly volume + ACWR routed from the one model everywhere | Data integrity is the brand | S–M |

### Sprint 2 — "One coach" (P0/P1, blocks beta)
| # | Item | Why | Effort |
|---|---|---|---|
| 2.1 | `dayVerdict()` module: one train/rest/deload decision + one readiness number, consumed by briefing, cockpit header, projection, flag slot | §3 — the audit's centre | M |
| 2.2 | Gate every Overview insight line through the verdict (suppress/reframe on rest & deload) | Kills the five-voices day | S–M |
| 2.3 | `shouldSuggestDeload` reads the program's real deload map; never fires on a deload week | Contradiction with its own briefing | S |
| 2.4 | Projection line hidden on rest/deload days (as V2-3 originally specified) | "Train today" on a rest day | XS |
| 2.5 | One user-facing readiness number (or label the two: "Readiness" vs "Recovery ex-load") | 93 vs 80 | S |
| 2.6 | Copy pass: Biggest driver rename, machine-ese lines (§8.4) | Coach voice | S |

### Sprint 3 — "Looks like it costs money" (P1, ship with beta if possible)
| # | Item | Effort |
|---|---|---|
| 3.1 | Icon set replaces emoji (nav, hub, tiles, milestones) | M |
| 3.2 | Program cover art system; de-dupe rails; detail CTA hierarchy; commitment-strip label fix | M |
| 3.3 | Chip/spark null-guards; strength-band calibration; XP backfill from history; onboarding program meta line; today-marker on day chips; START button matches day type | M (bundle of S/XS) |
| 3.4 | **Central "+" quick-start on the nav bar** — consolidate Start Run · Walk · Fast (later: log-a-lift, check-in, log-weight) into a raised centre "+" opening a small action sheet, reachable from every tab. Removes the Home Walk/Run row + the interim Home fasting chip → truly quiet Home. Keep the live-fast / active-GPS status as a slim persistent pill (the "+" only *starts*; it never hides an in-progress timer). **Decided layout:** `Home · Workout · ⊕ · Insights · Programs`; **Profile moves off the bar to an avatar tap in the Home header.** Supersedes the 2026-07-04 Home fasting quick-action. *Why: universal reach + native feel + calm Home · Effort: M · P1.* | M |

### Sprint 4 — Beta + post-beta
- Device-test list (GPS lock-screen run, notification loop, Health Connect, swap/plate/
  swipe) — unchanged from PROGRESS.md `[You]` items.
- Store assets **after** Sprint 3 (screenshots should show the icon set, not emoji).
- Post-beta: VDOT-from-easy-runs estimate, Home tile aspirational empty states, type ramp
  (C7), splash polish, "More" bucket fold, dead-DOM sweep, Sentry breadcrumbs for render
  shields.

---

## 11. Product scorecard (honest, 2026-07-04)

| Dimension | Score | Note |
|---|---|---|
| Scoring engine & analytics depth | **9/10** | Best-in-category idea, defended, tested (437 green) |
| Logging & cockpit mechanics | **8/10** | Ghost targets, Log-all, swap, plates — competitive+ |
| Program experience | **7.5/10** | Plan transparency + forking excellent; art + fake ratings drag it |
| Information architecture | **8/10** | 5 tabs, 6 doors, pattern held everywhere |
| Visual/premium feel | **6/10** | Gauge language strong; emoji + machine copy undercut it |
| **Coherence (one voice)** | **4/10** | The gap between engine and experience — §3 |
| **First-run / activation** | **3/10** | Auth wall + day-0 "At Risk" contradiction |
| Trust & integrity | **5/10** | Fake social proof + same-fact-different-number |
| Retention machinery | **7/10** | Morning hook, streaks, XP, share card all present; unproven on device |
| **Overall** | **6.5/10** | A 9/10 engine at ~70% presentation-integrity. Sprints 1–2 are worth more than any feature ever proposed for this app. |

**Would I pay for it?** After Sprints 1–3: yes — the score + verdict + hybrid cockpit is a
$5–8/mo product on current merits. Today: a tester would churn inside the first session on
the day-0 contradiction, and that answer is what the beta would measure.
