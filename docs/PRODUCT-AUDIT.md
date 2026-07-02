# Helyx — World-Class Product Audit & Roadmap

**Date:** 2026-07-02
**Reviewer role:** Staff Engineer · Principal Product Designer · UX Researcher · Behavioural Psychologist · PM
**Scope:** Full codebase (~29k JS, ~12k CSS, PWA + Android WebView shell)
**Baseline at audit:** 244 tests / typecheck / smoke all green.

> **How to read this:** Section 1 is the honest verdict. Sections 2–8 are the findings
> by domain, each with evidence (file:line), *why it matters*, and a concrete fix.
> Section 9 is the prioritised roadmap (impact × effort × retention × business).
> Section 10 is the "do this first" shortlist.

---

## 1. Executive verdict

Helyx is **genuinely very good** — and further along than most solo fitness apps ever
get. The engineering is disciplined: one shared "brain pass" (`js/home/dashboard-model.js`)
feeds every dashboard number so they never diverge; analytics math is factored into pure,
tested modules (`js/analytics/calculations/*`, `js/metrics/*`); sync now has divergence
detection + local backups; RLS is proven. The information *architecture* of the analytics
layer (the Insights hub indexing ~20 views) is excellent.

The gap between Helyx and best-in-class (Whoop / Garmin / Strava / Duolingo) is **not more
data**. Helyx already computes more than most users can act on. The gap is three things:

1. **It's a tracker, not a coach.** The "brain" is one reactive card. There is no morning
   briefing, no daily mission, no weekly/monthly review, no prediction, no overtraining
   escalation. The app *shows* readiness/ACWR/TSB; it rarely *tells you what to do with your
   day* in a way that creates a reason to open it every morning.
2. **The habit loop has no reward spine.** There is a training-streak tile and PR badges,
   but no identity system, no XP/levels, no cross-domain achievements, no variable reward,
   no "you are becoming a Hybrid Athlete" narrative. Nothing *anticipates* tomorrow.
3. **The home screen is heavy and redundant.** "At a Glance" (17 tiles) largely duplicates
   the Insights hub, and Home stacks *two* competing "most important thing" surfaces (the
   coaching card **and** the insight banner). Premium apps lead with one clear next action.

Fix those three and Helyx moves from "very good tracker" to "coach you don't want to miss."

---

## 2. Feature audit — what exists, what's redundant, what's missing

### 2.1 Inventory (everything that exists and is reachable)
- **Home:** At-a-Glance tiles (17, customisable order + hide via `dashboard.js`/`dragdrop.js`),
  brain coaching card, dismissible insight banner, weekly-progress header, week-vs-week
  compare card, deload-suggestion card, two Garmin-style weekly fitness graphs (strength/run),
  activity calendar, fasting card, Quick-Start walk/run, quick actions.
- **Workout cockpit** (`js/workout.js`, 1,421 lines): per-day set logging, warm-ups/drop/failure
  set types, rest timers, add-exercise from library, Garmin import, RPE, notes, deload apply.
- **Activity screen** (`#activityScreen`): full-screen GPS walk/run tracker (native FG service
  on Android, web fallback), splits, route map, session recap on finish.
- **Insights hub** (`analytics.js` + 20 leaf views): weekly summary, progress/consistency,
  streak, goal progress, activity history, training status (ACWR), stress balance (CTL/ATL),
  load focus, recovery, recovery score, strength, weekly volume, 1RM/PR, running, VDOT,
  pace, run cross-ref, bodyweight, fasting.
- **Programs** (`js/programs/*`): catalog (strength/hybrid/hyrox/running/fitness/hypertrophy),
  library with filters/search/bookmarks, detail pages, custom program builder, active-plan
  view with week stepper + schedule, ratings.
- **Profile** (`athlete-profile.js`, `profile-stats.js`): athlete dashboard, PR goals,
  session detail, share, customisable cards, avatar.
- **Fasting** (`js/fasting/*`): sessions, zones, streaks, achievements, education library,
  insights, calendar.
- **Settings** (759 lines): units, goals, level, week start, fasting default, reminders,
  notification toggles, equipment, bands, rest periods, theme, Health Connect, import/export,
  CSV, account delete, sign-out.
- **Platform:** Sentry (DSN-gated, PII-scrubbed), Supabase sync + conflict UI, native
  Health Connect bridge, native notifications + background reminder, service-worker PWA.

**Verdict:** the feature *surface* is large and, contrary to the brief's worry, the
At-a-Glance → Analytics Hub refactor did **not** orphan analytics — every leaf view is
reachable from the hub (`index.html` `#analytics-hub`) **and** from a tile. If anything the
problem is the opposite: **too much duplication**, below.

### 2.2 Redundant / duplicated (simplify these)
- **F-R1 · Two "hero" surfaces on Home compete.** `#brainCoachCard` (`home.js:39`) and
  `#dashboardInsight` banner (`home.js:165`) both claim "the single most important thing."
  They can show overlapping or subtly different messages (both read ACWR/readiness). Users
  can't tell which to trust. **Fix:** merge into one prioritised "Today" coaching surface;
  the banner becomes the coach's one-liner, the card its expansion. (See §6.1.)
- **F-R2 · At-a-Glance largely duplicates the Insights hub.** Every tile's `navTarget`
  (`dashboard.js`) points at a hub leaf. 17 tiles + a full hub index is two doors to the same
  20 rooms. **Fix:** cut Home to ~6 *decision-driving* tiles (Today, Readiness, Training
  Status, Streak, Weekly Volume, Body Weight) and let Insights be the encyclopedia. Keep the
  customiser for power users. Less scroll, clearer hierarchy.
- **F-R3 · Fasting appears three ways** (Home tile, quick action, hub section) — fine, but the
  daily fasting sheet and the fasting analytics duplicate streak/zone logic paths; keep one
  source (`js/fasting/fasting-calcs.js`) and have both render from it.

### 2.3 Missing / unfinished (biggest value)
- **F-M1 · No Morning Briefing / daily open reason.** `briefing.js` is *only* an ACWR label
  map (18 lines). There is no "here's your day" surface. **This is the #1 retention miss.**
- **F-M2 · No weekly review or monthly report.** `metrics/*` computes everything needed;
  nothing assembles it into a shareable recap. Strava/Whoop's weekly wrap is a top re-engagement
  driver.
- **F-M3 · No global achievement / identity / level system.** Achievements live only in
  fasting (`fasting-achievements.js`). No "Hybrid Athlete" identity, no XP, no cross-domain
  milestones (first sub-25 5k, 100k lifted, 4-week streak).
- **F-M4 · No overtraining / injury-risk escalation.** ACWR ≥1.5 changes a card's wording but
  never *escalates* (no push, no forced acknowledgement, no auto-deload offer beyond the
  existing suggestion card).
- **F-M5 · No performance prediction.** VDOT + 1RM trends exist but nothing says "on this
  trajectory you'll hit a sub-20 5k in ~5 weeks" — the single most motivating sentence a
  hybrid app can say.
- **F-M6 · Notification permission is never requested during onboarding** (`onboarding.js` has
  zero references) — so the daily-reminder retention loop is opt-in-by-accident.

---

## 3. UX & user-journey audit

### 3.1 Onboarding (`js/onboarding.js`)
- **U1 (High)** — 5 steps collect name/goal/program/level/units but **never ask for the
  notification permission** and never explain the daily loop. First run should end on a
  "Turn on your daily coach?" step wired to `requestNotificationPermission()`. *Why:* apps
  that capture notification consent in onboarding see materially higher D7 retention.
- **U2 (Med)** — Onboarding picks a program but drops the user on **Home**, not on "here's
  your first session." Premium onboarding ends with a **guided first action** ("Log your first
  set" / "Start a 10-min walk"). First-session completion is the strongest activation signal.
- **U3 (Low)** — No "restore from cloud" affordance on first run for returning users on a new
  device; they must sign in via Settings. Surface auth earlier.

### 3.2 Navigation & flow
- **U4 (Med)** — Home scroll is long: header + banner + card + progress + compare + deload +
  2 graphs + 17 tiles + calendar + fasting. On a phone that's 5–7 screens of vertical scroll
  before you reach the calendar. Cutting tiles (F-R2) and collapsing secondary cards fixes this.
- **U5 (Med)** — **No gestures.** Everything is tap. Premium native feel wants: swipe between
  the 5 tabs, swipe the day-selector, pull-to-refresh sync, swipe-to-dismiss the coaching card,
  swipe back from leaf analytics views. The app is a WebView, so this is CSS/JS work, not native.
- **U6 (Low)** — Analytics leaf "back" goes to hub (good), but there's no swipe-back and no
  breadcrumb; deep links (e.g. `open-fasting-education`) rely on `setTimeout` scroll hacks
  (`app.js:871`) — brittle.
- **U7 (Med)** — Transitions are instant `classList` swaps (`switchGlobalAppTab`, `app.js:113`).
  No enter/exit animation, no shared-element continuity. A 180–220ms cross-fade/slide would
  read dramatically more "native." Respect `prefers-reduced-motion`.

### 3.3 Interaction consistency
- **U8 (Low)** — Some dismissals persist per-day keyed by content (coaching card, insight
  banner) — good — but the *interaction* differs (× button vs swipe absent). Standardise.
- **U9 (Low)** — `confirm()`/`alert()` used in places (`executeDeleteProgram`, `app.js:503`)
  break the premium feel and are unstyled on WebView. Replace with the app's modal system.

---

## 4. Behavioural psychology & retention

The brief names the right benchmarks. Mapped to Helyx:

| Lever | Best-in-class | Helyx today | Gap / opportunity |
|---|---|---|---|
| **Daily habit loop** | Whoop morning recovery, Duolingo streak | Reactive coaching card | **No daily open reason.** Build Morning Briefing (§5). |
| **Reward / dopamine** | Strava kudos, PR fireworks | PR badge 🏆 in recap only | Add a *moment*: full-screen PR celebration, haptics (`haptics.js` exists!), confetti. |
| **Variable reward** | Whoop's "what's my score today" | Fixed tiles | Make the briefing feel *fresh* daily — rotate insight type, surprise "did you know your 5k pace dropped 4%." |
| **Streaks** | Duolingo streak freeze | Training-streak tile | Add **streak freeze / repair**, streak milestones (7/30/100), and *loss-aversion* nudges ("don't lose your 12-day streak"). |
| **Progress viz** | Garmin fitness trend | Strong (CTL/ATL graphs) | Already good. Surface it in the briefing, not buried in a leaf view. |
| **Personalisation** | Adaptive plans | Program picked once | Adapt tone/goals to the athlete; name them; reference *their* PRs in copy. |
| **AI coaching** | Whoop Coach, Runna | One rule card | Biggest gap — §5. |
| **Goal setting** | Concrete targets | PR goals + program goal | Add **process goals** ("3 sessions this week") *and* **outcome goals** ("sub-20 5k") with predicted ETA. |
| **Identity** | "I'm a runner" (Nike) | None | **"You are becoming a Hybrid Athlete"** — a level/title system (Novice → Competitor → Hybrid Athlete → Elite) driven by combined strength+endurance score. |
| **Re-engagement** | Win-back push | Generic reminder | Behavioural pushes: "Your readiness is high today," "You're 1 session from a new streak record." |
| **Curiosity/anticipation** | "Unlock next week" | None | Tease tomorrow ("Big session tomorrow — here's how to prep"). Weekly review "unlocks" Sunday. |
| **Plateau motivation** | Trend reframes | Deload card | Reframe plateaus as expected; show the longer trend; celebrate *consistency* when PRs stall. |
| **Delight** | Micro-animations | Sparse | Haptics on set-complete, confetti on PR, streak flame animation, sound (optional). |

**Retention thesis:** the single highest-leverage build is the **Morning Briefing + Daily
Mission** loop (§5.1–5.2), because it converts all the analytics Helyx already computes into a
*reason to open the app before training* — the moment habits are actually formed.

---

## 5. AI Coach — from passive tracker to proactive coach

Today: `js/brain/` = `briefing.js` (ACWR label map), `recommendations.js` (one card),
`load_models.js`. All rule-based and **descriptive/reactive**. Everything below can be built
on the *existing* pure metrics (`js/metrics/*`, `js/analytics/calculations/*`, readiness
scoring) with **no LLM required** for v1 — deterministic, testable, offline. An LLM layer can
come later for natural-language phrasing.

### 5.1 Morning Briefing (build first) — `js/brain/morning-briefing.js`
A single deterministic function `buildMorningBriefing(state, days, program, day) → Briefing`
that assembles, once per day:
- **Greeting + identity** ("Morning, Alex. Day 3 of your Hybrid week.")
- **Readiness verdict** (reuse `readiness-scoring.js`) → one sentence + colour.
- **Today's plan** (from blueprint) → what + the *one* adjustment (reuse `recommendations.js`).
- **One number that changed** (variable reward): pick the most-moved metric vs last week.
- **The mission** (§5.2).
Render as a top-of-Home card that replaces the two competing surfaces (F-R1). Cache per date
key so it's stable through the day. **Testable in isolation** like `recommendations.js`.

### 5.2 Daily Mission — one concrete, tickable action
Derive a single mission from readiness + plan: "Hit all 3 working sets on squat," "Keep today's
run in Zone 2," "Log your body weight." Ticking it feeds the streak/XP. One mission, one tap,
one dopamine hit — the Duolingo pattern.

### 5.3 Recovery advice — escalate, don't just label
When readiness is low or ACWR ≥1.5 (`recommendations.js:196`), *escalate*: offer a one-tap
"apply deload" (the machinery exists — `applyDeloadToCurrentWeek`), and send a push if a hard
session is planned on a low-readiness day.

### 5.4 Weekly Review — `js/brain/weekly-review.js` (unlocks Sunday)
Assemble the week: volume/distance vs last week (data already in `weekCompare`), consistency %,
best session, PRs, streak status, and *one* focus for next week. Full-screen, shareable (reuse
`session-recap.js` layout). Fire a Sunday push: "Your week in review is ready."

### 5.5 Monthly Report — trend + prediction
28-day rollup: CTL trend, VDOT/1RM trajectory, adherence, body-comp trend. Include **F-M5
prediction**: linear/EWMA projection of VDOT→race time and 1RM→plate milestone with an ETA.

### 5.6 Overtraining / injury warning — `js/brain/risk.js`
Deterministic signals: ACWR ≥1.5 for N days, monotony/strain (already computable from RPE),
readiness dropping 3+ days, sleep debt (Health Connect). Escalate to a *dismiss-with-acknowledge*
warning + push. This is a genuine user-safety feature for a health app.

### 5.7 Later: LLM phrasing layer
Once the deterministic briefing is solid, an optional Claude-backed pass can rewrite the
briefing/review in natural, personalised language (server-side via a Supabase Edge Function to
keep the anon key clean). Keep the deterministic core as the offline fallback and the source of
truth for numbers — never let the model invent metrics.

---

## 6. Dashboard & Analytics review

- **A1 (High)** — **Analytics displays; it rarely prescribes.** Every leaf ends at a chart.
  Add a one-line "So what?" action to each view (e.g. Training Status → "You're overreaching —
  consider a deload," linking to the deload action). Turn charts into decisions.
- **A2 (Med)** — The **hub is a flat directory of 20 links**. Add a "For you" strip at the top:
  the 2–3 views that changed most / matter most today, so users don't have to know where to look.
- **A3 (Confirmed not-lost)** — Nothing from the old At-a-Glance is inaccessible; the hub covers
  it. The real debt is duplication (F-R2), not loss.
- **A4 (Low)** — `collectAnalyticsData()` (`analytics.js:79`) recomputes a full pass on every
  render and iterates all weeks; fine at current scale, but memoise per state-version if week
  count grows (scalability, §7).

---

## 7. Code quality

**Strengths:** clean ES-module boundaries; pure calc modules with tests; one-source dashboard
model; defensive render shields (`safeRenderExecution`); graceful sync degradation; good test
coverage (244) on the risky paths (sync, brain, metrics).

- **C1 (Med)** — **`workout.js` (1,421) and `app.js` (1,389) are god-modules.** `app.js` is one
  giant `click` switch (`app.js:688`). Extract feature routers (programs, fasting, settings,
  gps) into per-domain delegates. Lowers merge-conflict risk and cognitive load.
- **C2 (Low)** — **Dead CSS.** Session log notes orphaned `.cal-m*` rules; `index.html` is 114kB
  with large inline `<style>`. Sweep unused selectors; consider extracting inline CSS to `/css`.
- **C3 (Med)** — **Repeated week-iteration logic** (collect lifts/runs per week) appears in
  `analytics.js`, `dashboard.js`, `recommendations.js`, `home/dashboard-model.js`. Factor a
  shared `iterateLoggedDays(state)` helper. Single source, fewer drift bugs.
- **C4 (Low)** — Error handling swallows render crashes to `console.warn` in prod
  (`safeRenderExecution`). Good for resilience, but pipe those to Sentry breadcrumbs so silent
  failures are visible post-launch.
- **C5 (Low)** — Inline styles scattered in template strings (e.g. `home.js:378`) fight the
  design system; migrate to utility/token classes for consistency and theming.
- **C6 (Scalability)** — State is one JSON blob (`user_data`), last-write-wins with divergence
  detection. Fine for a single user's history for years, but *field-level* merge is the eventual
  ceiling; note it, don't build it now.
- **Offline:** solid — SW cache versioned (v86), reconnect re-sync, GPS run recovery. No action.

---

## 8. UI review

- **UI1 (Med)** — **Visual hierarchy on Home is flat:** the coaching card, banner, compare card
  and tiles all read at similar weight. Establish one clear primary (the briefing), everything
  else secondary. Type scale and spacing should encode importance.
- **UI2 (Med)** — **One-handed ergonomics:** primary actions (Edit tiles, Start workout) and the
  week nav sit high on screen. Move key CTAs into thumb reach (bottom third). The bottom nav is
  correct; extend that principle to primary actions.
- **UI3 (Accessibility)** — Good `role="button"`/keyboard handling (`app.js:960`) and aria labels
  on tiles. Gaps: verify colour-contrast of muted text on dark (`--text-muted` on cards), ensure
  focus-visible rings, and that emoji-only icons have text labels (mostly do). Add `prefers-reduced-motion`
  guards before shipping animations (§3.2 U7).
- **UI4 (Low)** — Colour usage is semantic (green/amber/red) and consistent via CSS vars — good.
  Ensure the same green means the same thing everywhere (it mostly does).
- **UI5 (Low)** — Component reuse is strong in analytics (chart primitives, tile renderers).
  Home's bespoke cards (compare, deload) could adopt the same card primitives for consistency.
- **UI6 (Delight)** — `haptics.js` exists but is under-used. Wire haptics to: set complete, PR,
  streak increment, mission tick, fast start/stop. Cheap, high-perceived-quality.

---

## 9. Prioritised roadmap

Scoring: **Impact** (user value), **Effort** (dev), **Retention**, **Business**. H/M/L.

| # | Recommendation | Impact | Effort | Retention | Business | Priority |
|---|---|---|---|---|---|---|
| R1 | **Morning Briefing** card (merge the 2 hero surfaces) §5.1, F-R1 — ✅ **SHIPPED 2026-07-02** (`js/brain/morning-briefing.js`), anchored by Hybrid Score | H | M | **H** | H | **P0** |
| R2 | **Daily Mission** (one action, derived from logged data) §5.2 — ✅ **SHIPPED 2026-07-02** inside the briefing (ungameable: completes by doing) | H | M | **H** | H | **P0** |
| R3 | Request **notification permission in onboarding** + daily loop §3.1 U1, F-M6 — ✅ **SHIPPED 2026-07-02** (step 6 "Meet your daily coach"; JS reminder now sends the real briefing via `composeMorningReminder`) | M | **L** | **H** | M | **P0** |
| R4 | **Trim Home tiles** to ~6; Insights stays the encyclopedia §2.2 F-R2 — ✅ **SHIPPED 2026-07-02** (`DEFAULT_HIDDEN_TILES`; `hidden:null` = focused default, saved customisations untouched) | M | L | M | M | **P0** |
| R5 | **PR / streak celebration moment** (haptics + confetti) §4, UI6 — ✅ **SHIPPED 2026-07-02** (`js/ui/celebration.js` + milestone detection in the score recorder) | M | L | H | M | **P1** |
| R6 | **Weekly Review** (Sunday, shareable, push) §5.4 — ✅ **SHIPPED 2026-07-02** (`js/brain/weekly-review.js` + "Week in Review" hub leaf + share + real-numbers Sunday push) | H | M | H | **H** (share=growth) | **P1** |
| R7 | **Streak freeze + milestones + loss-aversion nudge** §4 | M | M | **H** | M | **P1** |
| R8 | **"So what?" action line on every analytics leaf** §6 A1 — ✅ **SHIPPED 2026-07-02** (`js/analytics/so-what.js`, one injection point in the router — 19 leaves covered, views untouched) | M | M | M | M | **P1** |
| R9 | **Identity/level system** ("Hybrid Athlete" tiers) §4, F-M3 — ✅ largely **SHIPPED 2026-07-02** via Hybrid Score XP → Initiate→Legend ladder + level-up celebrations; remaining: surface the level on the Profile tab | H | M | H | M | **P1** |
| R10 | **Overtraining/injury escalation** + one-tap deload §5.3/5.6 | M | M | M | M (safety) | **P1** |
| R11 | **Tab transitions + swipe gestures + pull-to-refresh** §3.2 | M | M | M | M | **P2** |
| R12 | **Performance prediction** (race time / plate ETA) §5.5 F-M5 | H | M | M | M | **P2** |
| R13 | **Monthly report** §5.5 | M | M | M | M | **P2** |
| R14 | **Guided first session** post-onboarding §3.1 U2 | M | L | M | M | **P2** |
| R15 | Replace `confirm()/alert()` with app modals §3.3 U9 | L | L | L | L | **P2** |
| R16 | Refactor `app.js`/`workout.js` god-modules §7 C1 | L | M | – | – (debt) | **P3** |
| R17 | Dead-CSS sweep + extract inline styles §7 C2 | L | L | – | – | **P3** |
| R18 | Shared `iterateLoggedDays` helper §7 C3 | L | L | – | – (debt) | **P3** |

### Quick wins (<1 hour each)
- R3 onboarding notification step (HTML step + one handler).
- R4 tile trim (change `order`/default-hidden in `dashboard.js`; the customiser already exists).
- R5 haptics on set-complete/PR (`haptics.js` already imported paths).
- R15 swap `confirm()` in `executeDeleteProgram` for the existing modal.
- R17 dead `.cal-m*` CSS sweep.

### Features to remove / simplify
- **Merge** coaching card + insight banner (F-R1).
- **Demote** At-a-Glance from 17 tiles to a focused 6 (F-R2); keep the customiser for power users.
- **Consolidate** fasting streak/zone logic to one module (F-R3).

---

## 10. Do-this-first shortlist (the 20% that delivers 80%)

1. **R1+R2 Morning Briefing + Daily Mission** — the daily open reason. Build
   `js/brain/morning-briefing.js` (pure, tested), render one Home hero card, retire the two
   competing surfaces. *This is the keystone; most other retention wins hang off it.*
2. **R3 Notification consent in onboarding** — a <1h change that turns the existing daily
   reminder + (new) briefing into an actual habit loop.
3. **R4 Trim Home** — immediately calmer, more premium, clearer hierarchy; near-zero risk (the
   customiser already supports show/hide + order).
4. **R5 Celebration moment** — cheap dopamine using `haptics.js` you already ship.
5. **R6 Weekly Review** — the re-engagement + word-of-mouth growth surface, reusing the recap UI.

**Guardrail (from CLAUDE.md):** ship each as its own small, tested slice; run test + typecheck +
smoke before every commit; verify UX changes on a real device before release (this audit could
not device-test). Never let the coach *invent* numbers — the deterministic metric core stays the
source of truth; any future LLM layer only rephrases.

---

*Prepared as an actionable roadmap. Recommend building R1→R5 in the order above, each behind the
existing gates, before the Play beta so first testers meet the coach, not just the tracker.*
