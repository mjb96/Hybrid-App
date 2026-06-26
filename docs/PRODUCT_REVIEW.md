# Hybrid Engine — Full Product Review

_Founder-level product, UX, data-science, sports-science and monetisation review._
_Reviewer hats: Senior PM · Senior UX · Senior Mobile Eng · Data Scientist · Sports Scientist · Startup Advisor._
_Date: 2026-06-26 · Scope: entire codebase (`index.html`, `js/**`, Android shell, `sw.js`)._

> A separate **engineering** review already exists (`docs/SENIOR_REVIEW.md`). This document is deliberately **product-first**: what to build, kill, merge, automate, and charge for. It does not repeat the architecture/CSS findings except where they block product outcomes.

---

## 1. Executive Summary

**What you have actually built is impressive and badly under-monetised.** Hybrid Engine is one of the few apps that genuinely sits at the intersection of **strength + endurance + recovery + fasting**. The analytics engine (CTL/ATL/TSB/ACWR, training monotony, strain, VDOT, readiness, nervous-system status, recovery/sleep debt, fasting correlations) is **more sophisticated than most funded competitors**, and the fasting module rivals Zero on its own. This is a real moat hiding in plain sight.

But the product is being held back by five structural gaps, in priority order:

1. **There is no monetisation layer at all** — zero subscription, paywall, tier, or billing code anywhere in the repo. The single most valuable thing in the app (deep analytics + coaching) is given away with no capture mechanism.
2. **The "AI brain" is not AI** — it is a well-written rule/template engine (`brain/recommendations.js`, `brain/briefing.js`). There is no LLM, no conversational coach, no natural-language weekly review. This is the most obvious differentiator you are leaving on the table.
3. **Data entry is mostly manual.** Garmin is **FIT-file upload only** (no Garmin Connect API), COROS is **not integrated at all** (only referenced as a label), there is **no Apple HealthKit / iOS health**, and no Strava/Whoop/Oura/Polar. Health Connect (Android) is the only live feed. Friction kills the daily loop.
4. **The daily engagement loop is thin.** Notifications are `setTimeout`-based (`notifications.js`) and will not fire reliably when the app is closed — there is no push/FCM and no native scheduled notification. Streaks exist but are fragmented (one training streak, a separate fasting streak), and there is no morning "today" ritual screen.
5. **No goal spine.** There is no target race / event countdown, no target body-weight or target-lift goals with projections. For endurance and hybrid athletes the "event on the calendar" is the #1 retention hook and it is absent.

**The strategic thesis:** you are 1–2 months of focused work away from a genuinely category-defining *Hybrid Athlete OS* — but only if you (a) ship a subscription, (b) put a real AI coach on top of the analytics you already compute, and (c) reduce logging friction with at least one auto-sync integration.

---

## 2. Product Scorecard

| Dimension | Score | One-line rationale |
|---|---:|---|
| **Current product** | **6.5 / 10** | Elite analytics + fasting depth, dragged down by manual data entry, thin daily loop, no real AI. |
| **Market potential** | **8 / 10** | Hybrid (strength+endurance+recovery+fasting) is genuinely underserved; no incumbent owns all four. |
| **Retention** | **5 / 10** | Streaks + fasting habit help; unreliable notifications, no push, no social, no goal spine cap it. |
| **Monetisation** | **2 / 10** | Nothing exists. The 2 is purely because the analytics depth is *highly* monetisable once a paywall is added. |
| **Differentiation** | **7 / 10** | The cross-domain analytics + fasting combo is rare; needs an AI layer to be unmistakable. |
| **Native feel** | **6 / 10** | Great Android shell; web-isms still leak (per the engineering review); no iOS native. |

### Core App Purpose

- **Problem solved today:** a single place for a hybrid athlete to **program** (large catalog + builder), **log** (lifts, runs, fasting, wellness), and **understand** (deep load/recovery/fasting analytics) their training — without juggling a lifting app + a running app + a fasting app + a recovery app.
- **Persona it serves now:** the **data-literate hybrid athlete** (Hyrox / "strength + 5K" crowd) who already owns a Garmin, likes numbers, and is willing to export FIT files. Power-user, Android-first.
- **Persona it *should* serve:** broaden to the **time-pressed performance-minded generalist** — wants to lift, run, fast, and recover well, but will not manually export FIT files or read an ACWR chart. This persona needs **auto-sync + an AI coach that tells them what to do in one sentence**. That is the mass-market unlock.
- **Where positioning is weak:** the app name/identity wobbles ("Hybrid Engine" in manifest/home, "HybridHQ" in fasting education content, "Hybrid Training" in notifications). Pick one brand. The value prop is also buried — the home screen leads with "In Focus" cards, not with the one number a user cares about (today's readiness + what to do).
- **Where user journeys break down:**
  - **Analytics is not in the bottom nav** (`index.html:1587` — only Home/Workout/Programs/Profile). The richest, most differentiating surface in the app is only reachable by tapping a card. Most users will never find half of the 19 analytics views.
  - **First-run has no data**, so every score shows "—" / "Log a few sessions". There is no demo-data or "connect your watch" moment to deliver instant value.
  - **Wellness check-in has no obvious daily entry point** on Home — readiness depends on it but the loop to capture it isn't surfaced.

---

## 3. Feature Audit

### 3.1 KEEP (strong — protect and polish)

| Feature | Where | Why it's strong |
|---|---|---|
| **Analytics engine** | `js/analytics/**` (19 views) | CTL/ATL/TSB/ACWR, monotony, strain, consistency, load distribution, run-zone distribution, VDOT, run cross-ref, weekly summary. Genuinely best-in-class for an indie app. |
| **Readiness scoring** | `analytics/scoring/readiness-scoring.js` | Multi-signal composite (HRV 0.27 / sleep 0.27 / load 0.23 / RHR 0.10 / wellness 0.13) with graceful weight redistribution when signals are missing. This is the crown jewel. |
| **Recovery analytics** | `analytics/calculations/recovery-calcs.js` | HRV status vs baseline, nervous-system status, sleep debt, recovery momentum, recovery/RHR deviation, recovery debt. |
| **Fasting suite** | `js/fasting/**` | Metabolic phases, education library (articles/studies/guides/glossary), 15 achievements, ranked insights with HRV/sleep/mood/bodyweight correlation, routine-stability, fasting score. Rivals Zero standalone. |
| **Program library + builder** | `js/programs/**`, `program_builder.js`, `dragdrop.js` | Large multi-discipline catalog (Hyrox, strength, running, hybrid, hypertrophy) with search, collections, recommendations, and a drag-drop builder. |
| **Native Android shell** | `android/**`, `health/health-bridge.js` | Health Connect bridge, WorkManager periodic sync, edge-to-edge, predictive back, secure asset loader. |
| **Deload engine** | 114 refs | Auto-deload suggestion + apply. Differentiated and genuinely useful. |

### 3.2 IMPROVE (potential, needs enhancement)

Each row: **Current weakness → Proposed improvement → User benefit → Complexity**.

| # | Feature | Weakness → Improvement → Benefit | Cx |
|---|---|---|---|
| I1 | **The "brain" coach** | Rule-based templates only → wrap the *same* computed context (ACWR, TSB, readiness, RPE, fasting) in an LLM call to produce natural-language, personalised daily/weekly advice; keep the rule engine as the offline fallback and as the structured input. → Feels like a real coach, not a fortune cookie. | M |
| I2 | **Garmin integration** | FIT-upload only → add **Garmin Connect OAuth + Activity API** auto-sync (and/or "Health Connect already carries Garmin data" messaging for Android). → Kills the #1 friction point; activities appear automatically. | H |
| I3 | **Notifications** | `setTimeout` won't fire when app is closed → use native scheduled notifications via the Android shell (and FCM push for server-driven nudges). → Reminders/streak alerts actually arrive → big DAU lift. | M |
| I4 | **Home dashboard** | Leads with carousel cards, buries readiness; no daily check-in CTA → make Home a **morning briefing**: today's readiness ring + one-sentence AI directive + "log wellness" + planned session. → Clear daily reason to open the app. | M |
| I5 | **Navigation** | Analytics absent from bottom nav → add an **Insights/Coach** tab; consider merging Programs into Workout to free a slot. → The best content becomes discoverable. | L |
| I6 | **Wellness check-in** | Manual mood/soreness/sleep, no prompt → 10-second morning check-in card + auto-pull sleep/HRV/RHR from Health Connect so only mood/soreness need a tap. → Higher readiness coverage, less typing. | L |
| I7 | **Streak system** | Two disconnected streaks (training, fasting), under-surfaced → unify into a single **"active days"** streak with freezes/grace days and a home badge. → Stronger habit loop. | L |
| I8 | **VDOT/VO2max** | VDOT computed for runs but no unified VO2max trend; `vo2max` is a stub array (`types.d.ts:29`) → estimate VO2max from pace+HR and chart the trend. → A headline number athletes track over months. | M |
| I9 | **Onboarding** | Collects name/goal/program/units but no **goal target** and no wearable connect → add target race/date, target weight, target lifts, and a "connect health" step. → Personalised projections from day one. | M |
| I10 | **Body composition** | Body-weight only → add body-fat %, girth measurements, progress photos (local). → Retention via visible transformation. | M |

### 3.3 REMOVE / MERGE (clutter or duplication)

- **Merge the two "brains"** — `brain/` (prescriptive) and the Analytics "brain"/insight engine (descriptive) overlap conceptually. Unify into one **Coach** service so advice is consistent across Home and Analytics. (Engineering review notes the duplication too.)
- **Merge duplicated streak logic** — `dashboard.js:668` recomputes streaks while `state.streakData` already exists; pick one source of truth.
- **Reconsider the 19 separate analytics "contexts"** (`analytics.js` switch). Several (e.g. `weekly-volume`, `streak`, `goal-progress`, `avg-pace`) are thin detail views that fragment the experience. **Merge into a smaller set of scrollable dashboards** (Training Load, Recovery, Strength, Running, Fasting). Fewer, richer screens feel more premium than many shallow ones.
- **Hidden dead DOM** — `index.html:319` ships a `display:none` block of legacy home cards (`homeWeeklyProgress*`, `homeWeekCompareCard`). Remove or re-activate; shipping hidden UI is debt.
- **Brand naming** — remove the "HybridHQ" / "Hybrid Training" / "Hybrid Engine" inconsistency. One name.

### 3.4 MISSING (should exist, does not)

Ranked by strategic impact:

1. **Subscription / paywall / tiering** — *nothing exists.* (Section 8.)
2. **Real AI coach** (LLM) — daily/weekly/performance/recovery/health. (Section 7.)
3. **Goal spine** — target race + countdown, target body-weight, target 1RMs, with projected trajectories and **taper/peaking** logic.
4. **Auto-sync integration** — Garmin Connect / Strava / Apple HealthKit (iOS) / COROS.
5. **iOS native app** — currently Android-shell + PWA only; no HealthKit, no App Store presence.
6. **Nutrition & hydration** — no protein/calorie/water logging at all (the fasting and energy modules cry out for it).
7. **Performance Management Chart (PMC)** — a per-day Fitness/Fatigue/Form chart (TrainingPeaks' signature view). You already compute CTL/ATL/TSB — you just don't plot the daily PMC.
8. **Predictive analytics** — race-time prediction, recovery forecast, fatigue forecast, plateau detection.
9. **Weekly review screen** — a rich, shareable weekly digest (you only have a weekly-summary *notification* toggle).
10. **Social layer** — friends, challenges, leaderboards, shareable cards.
11. **Sleep depth** — only total hours; no stages, sleep need, or sleep coaching.
12. **Cross-domain "Discover" correlations** — surface Sleep↔HRV↔Recovery↔Load↔Fasting relationships app-wide (today correlations live only inside fasting).

---

## 4. Analytics & Insights Review

**Verdict: your strongest asset. The job here is curation and presentation, not more metrics.**

**What's already there (don't rebuild):** weekly volume, sRPE load, ACWR/TSB, monotony, strain, consistency, load distribution, run-zone distribution, VDOT, avg pace, recovery score series, HRV status, RHR deviation, nervous-system status, sleep debt, recovery momentum, fasting score + correlations.

**Metrics users care about that you should surface more prominently:** Readiness (already computed — should be the home hero), Training Status/Form (TSB), HRV trend vs baseline, sleep last night + 7-day, fasting streak. These five are the daily "care" set.

**Duplicate / overlapping:** TSB appears as both `stress-balance` view and inside training-status/load-focus; recovery score logic exists in both `recovery-calcs.js` and `readiness-scoring.js` (different weights). Reconcile to one canonical recovery number to avoid two different "recovery" values confusing users.

**Poor visualisations / presentation gaps:** many views are `innerHTML` bar lists; there is no continuous **daily** time-series PMC. The big win is **one PMC chart** (Fitness=CTL, Fatigue=ATL, Form=TSB over days) — it visually unifies everything you already calculate.

### Suggested new metrics / charts (with care, calc, sources)

| Metric | Why users care | How to calculate | Data sources |
|---|---|---|---|
| **Performance Management Chart (PMC)** | The single chart that explains "am I fit, fatigued, or fresh?" | Plot daily CTL (42-day EWMA of load), ATL (7-day EWMA), TSB=CTL−ATL. You already compute weekly; extend to daily. | `weeks` sRPE load, run/lift load |
| **VO2max trend** | Headline fitness number athletes obsess over | From runs: estimate via Daniels VDOT (you have it) or `15.3 × (maxHR/restHR)` (Uth–Sørensen) as a rough proxy; chart 30/90-day. | runs (pace), Health Connect (maxHR/RHR) |
| **Sleep vs Recovery** | Validates the #1 lever they control | Scatter/overlay nightly sleep vs next-day recovery score; report Pearson r. | `wellnessLog.sleep`, `dailyRecoveryScoreSeries` |
| **Sleep vs HRV** | Shows recovery mechanism | Overlay sleep hours vs HRV rmssd; r + lag-1. | `wellnessLog.sleep`, `healthConnect.hrv` |
| **Fasting vs Recovery / HRV** | Answers "is fasting helping or hurting me?" | Already partially in fasting insights — promote to a first-class chart with effect size. | fasting log, HRV, recovery |
| **Training Load vs Sleep** | Detects under-recovery from hard blocks | Weekly load vs weekly avg sleep; flag when load↑ & sleep↓. | load series, sleep |
| **HRV vs Readiness** | Builds trust in the readiness score | Overlay HRV status vs readiness components. | HRV, readiness |
| **Stress vs Recovery** | All-day strain context | Requires an all-day stress signal (Body-Battery-style from HRV/HR) — see §6. | HR/HRV throughout day |
| **Acute:Chronic per-day band** | Injury-risk early warning | Daily ACWR with the 0.8–1.3 "sweet spot" shaded; alert on breach. | load series |

**Predictive / AI analytics (high differentiation):**
- **Recovery forecast** — predict tomorrow's recovery from today's load + sleep + HRV trend (simple gradient-boosted or even a linear model on-device).
- **Race-time prediction** — from VDOT + recent training, project 5K/10K/HM times with a confidence band.
- **Plateau / overreaching detection** — flag when monotony >2 and TSB trending sharply negative.
- **Auto-correlation discovery** — nightly job ranks the strongest correlations in *this user's* data and writes them as insights ("Your recovery is 18% higher when you sleep >7.5h").

---

## 5. Garmin & COROS Opportunities

**Current reality:** Garmin = manual `.FIT` upload (`garmin.js`, lazy-loaded `fit-file-parser`). COROS = **not integrated** (only a "Coros-style" status label in `briefing.js`). This is the biggest friction gap in the product.

**Untapped data already in the FIT you parse but barely use:** HR zones (`time_in_hr_zone`), training effect (aerobic/anaerobic), cadence, elevation, splits — you extract these (`garmin.js:149`) but they're under-surfaced in analytics. Also available in FIT and unused: **running power, ground-contact time, vertical oscillation, stride length, lactate-threshold HR, performance condition**.

**Workflow improvements:**
1. **Garmin Connect OAuth + Activity/Health API** → auto-import activities + daily wellness (sleep, HRV, RHR, Body Battery, stress) with no file juggling. Single biggest UX upgrade available.
2. **COROS Training Hub API** (OAuth) → same for COROS users.
3. **Bulk/zip FIT import** and **drag-to-import** for the power users you have today.
4. **Strava OAuth** as a universal fallback (covers Garmin/COROS/Apple/Wahoo/Polar in one integration).

### Advanced athlete metrics (you already have the ingredients)

| Metric | Implementation in this codebase |
|---|---|
| **Acute Training Load (ATL)** | Already computed (7-day EWMA) in `brain/load_models.js`. Surface as daily series. |
| **Chronic Training Load (CTL)** | Already computed (42-day EWMA). Plot daily. |
| **Training Stress Balance (TSB)** | `tsbSeries()` exists. Make it the PMC "Form" line. |
| **Recovery forecasting** | New: regress next-day recovery on (load, sleep, HRV Δ, RHR Δ). Start with a transparent weighted formula, upgrade to a model. |
| **Race readiness** | Composite of CTL (fitness), TSB (freshness ≥ +5 to +15 at race), and VDOT trend → a 0–100 "Race Ready" gauge with taper guidance. |
| **Performance trends** | Roll up VDOT, e1RM (you compute `weight×(1+reps/30)`), and CTL into a single "Performance" index over 90 days. |

---

## 6. Fasting Module Review

**Verdict: already excellent — the closest thing you have to a standalone product.** It rivals Zero on tracking, beats FastHabit on analytics, and beats both on athlete integration (fasting↔HRV/sleep/recovery correlation is unique).

What's already great: metabolic phases, real-time tracking, 15-achievement system, education library (articles + 5 cited studies + guides + glossary), ranked insights, routine-stability, fasting score, weekday/weekend adherence.

**Gaps vs Zero / FastHabit / Easy Fast:**

- **Better Tracking:** add **preset protocols** (16:8, 18:6, 20:4, OMAD, 5:2) as one-tap starts with auto goal; **circadian/early-window** scoring; **mood/energy/hunger** prompts at fast-end (Zero does this and it drives the correlation data you're already half-using).
- **Better Analytics:** a **fasting calendar heatmap** (Zero's signature), eating-window-start histogram, and **fast-end glucose/ketone** logging for the hardcore (manual or CGM later).
- **Better Education:** you have static content — add **stage-timed micro-content** ("you just hit 16h — here's what's happening") delivered as the metabolic phase changes. Convert education into a **daily learn streak**.
- **Better Motivation:** **milestone celebrations** during an active fast (12h/16h/18h/24h animations + haptics), shareable "I just completed a 20h fast" card, and **freeze/grace days** for streaks.
- **Better Retention:** **weekly fasting report** (you compute the data, you only need the screen), **personalised recommendations** ("you're most successful with 16:8 starting at 8pm — want to schedule it?"), and **smart reminders** at window open/close (needs native notifications, §3.2 I3).

This module is your best candidate for a **standalone marketing wedge** ("the only fasting tracker built for athletes that correlates your fasts with HRV and recovery").

---

## 7. Recovery & Wellness

You already compute most of this — the work is **forecasting, all-day stress, and coaching language.**

### Recovery score improvements
- Reconcile the **two** recovery formulas (`recovery-calcs.js` daily score: sleep 0.40 / mood 0.35 / soreness 0.25 vs `readiness-scoring.js` 5-signal composite) into one canonical model; expose readiness as the daily hero and recovery as its sleep/wellness sub-component.
- Add **baseline personalisation**: scores should be relative to *this user's* 30/60-day baselines (you already do this for HRV/RHR/sleep — extend everywhere).

### Readiness improvements
Already strong. Add a **confidence indicator** ("based on 4/5 signals") and **why** breakdown (you compute `components` — render them as a stacked contribution bar). Trust comes from explainability.

### Stress tracking (currently missing as a physiological signal)
- **All-day stress / Body-Battery analogue:** if you can get intraday HR + HRV (Garmin/COROS API or Health Connect HR samples), compute a rolling autonomic-balance score that drains with stress/activity and recharges with rest. Formula sketch: `battery(t) = clamp(battery(t-1) + recoveryRate·(restSignal) − drainRate·(stressSignal), 0, 100)` where `stressSignal` rises with HR above resting and falls with high HRV. This is the single most "Whoop/Garmin-like" feature you could add.

### Sleep coaching
- From total hours → add **sleep need** (baseline + load-adjusted) and **sleep debt** (you have `sleepDebt7d`), then coach: "You're carrying 4.2h of sleep debt; aim for 8.5h tonight."
- If stages become available (HealthKit/Garmin), add stage-based sleep quality.

### Recovery coaching & daily recommendations
- You already produce a daily recommendation (`brain/recommendations.js`). Upgrade it to combine **readiness + recovery + sleep debt + fasting state + planned session** into one directive, and add **explicit actions** ("do X, skip Y, in bed by Z"). This is the home-screen payload.

---

## 8. AI Opportunities

**This is your clearest differentiation lever.** You already compute rich structured context every render — feed it to an LLM. Recommend the latest Claude models (e.g. Claude Opus / Sonnet 4.x) via a thin backend proxy (keep keys server-side; the app already has Supabase for auth/sync).

| Coach | User value | Data required (already computed) | Tech cx | Monetisation |
|---|---|---|---|---|
| **Daily Coach** | One-sentence "what to do today" in natural language | readiness, TSB/ACWR, sleep debt, fasting state, planned session | M | Core premium hook |
| **Weekly Coach** | Narrative weekly review + next-week focus | weekly load, monotony, strain, consistency, PRs, recovery momentum | M | High (digest → re-engagement) |
| **Performance Coach** | "Your VDOT stalled — here's the session you're missing" | VDOT trend, e1RM, run-zone distribution, load distribution | M | High |
| **Recovery Coach** | Proactive under-recovery warnings + fixes | HRV status, RHR deviation, sleep debt, recovery debt | M | High |
| **Health/Lifestyle Coach** | Fasting + sleep + bodyweight lifestyle nudges | fasting correlations, sleep, bodyweight trend | M | Medium |
| **Ask-anything chat** | "Why is my recovery low this week?" answered from *their* data | full appState summary as context | M | Sticky premium |

**Implementation pattern:** build one `js/coach/` service that (1) assembles a compact JSON context from existing calc modules, (2) calls the model server-side, (3) caches the response per-day in `appState`, (4) **falls back to the existing rule engine offline**. The rule engine you already wrote becomes the safety net and the structured-prompt scaffold — so this is additive, not a rewrite.

**Cost control & moat:** cache daily/weekly outputs (1 call/user/day), gate behind subscription, and use the rules engine for free-tier. The structured analytics you already have make the prompts cheap and the outputs accurate — competitors with shallow data can't match the personalisation.

---

## 9. Retention Opportunities (ranked by impact)

| Rank | Feature | Why it moves the metric | Cx |
|---|---|---|---|
| 1 | **Reliable native notifications + AI daily nudge** | DAU: the app currently can't reliably reach a closed app. Fix this first. | M |
| 2 | **Morning briefing home screen** (readiness + 1-line directive + check-in) | Creates a daily ritual / reason to open. | M |
| 3 | **Goal spine** (race countdown, target weight/lifts, projections) | The calendar event is the strongest long-horizon retention hook; endurance athletes live by it. | M |
| 4 | **Unified streak with freezes** + milestone celebrations | Habit loss-aversion; proven in Zero/Duolingo. | L |
| 5 | **Weekly AI review** (shareable) | WAU: pulls lapsed users back every Sunday; sharing drives acquisition. | M |
| 6 | **Challenges** (e.g. "30-day consistency", "Hyrox prep", "fast 5 days") | Session duration + cohort retention. | M |
| 7 | **Achievements beyond fasting** (training PRs, load milestones, recovery streaks) | You have the fasting pattern — generalise it. | L |
| 8 | **Social / friends / leaderboards** | Network effects; biggest ceiling but highest effort + needs backend. | H |

**Quick behavioural wins already in reach:** you compute streaks, achievements (fasting), and momentum — they're just under-surfaced. Putting them on Home is mostly presentation work.

---

## 10. Monetisation Opportunities

**There is no monetisation code in the repo. This is the highest-ROI gap.** Recommendation: **freemium subscription** with the analytics/AI depth behind the wall.

**Suggested tiering:**

- **Free:** logging (lifts/runs/fasting/wellness), basic program library, current-week summary, rule-based daily tip, manual FIT import, 7-day history.
- **Premium (~£6–8/mo, £40–50/yr):**
  - **AI coaches** (daily/weekly/performance/recovery/chat) — the headline.
  - **Full analytics** (PMC, VO2max trend, all correlations, readiness breakdown, training status history).
  - **Auto-sync** (Garmin/COROS/Strava/HealthKit).
  - **Goal spine + race readiness + predictions.**
  - **Unlimited history + data export.**
- **(Optional) Pro/Elite (~£12/mo):** advanced sports-science (monotony/strain alerts, recovery forecasting), program builder pro, CGM/glucose, coach-sharing.

| Premium feature | User value | Competitive advantage | Est. conversion impact |
|---|---|---|---|
| AI Daily/Weekly Coach | "Tells me what to do" | No competitor combines strength+endurance+fasting context | **Highest** — primary purchase reason |
| Auto-sync (Garmin/Strava) | Zero-friction logging | Removes the one thing stopping mass adoption | High (also a free-tier funnel) |
| Full analytics + PMC | Pro-grade insight | Matches TrainingPeaks at a fraction of price | High for serious athletes |
| Race readiness + predictions | Confidence before goal events | TrainingPeaks-only today; you'd undercut it | Medium-High |
| Athlete-grade fasting analytics | Unique fasting↔recovery link | Zero can't do training context | Medium (and a standalone wedge) |

**Mechanics:** RevenueCat-style billing through the Android (and future iOS) shells; 7-day free trial; annual default; paywall placed *after* the first AI daily coach impression (show value, then gate). Add a soft paywall on the deepest analytics views.

**Why now:** every additional analytic you've already built is unpaid inventory. A paywall is mostly product/packaging work on top of an engine that already exists.

---

## 11. Competitive Analysis

| Capability | Hybrid Engine | Garmin Connect | COROS | Whoop | Athlytic | TrainingPeaks | Strava | Zero |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Strength programming + logging | ✅ strong | ⚠️ weak | ⚠️ weak | ❌ | ❌ | ⚠️ | ⚠️ | ❌ |
| Endurance/run analytics | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ❌ |
| CTL/ATL/TSB (PMC) | ✅ (weekly) | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ best | ⚠️ paid | ❌ |
| Readiness/recovery | ✅ | ✅ | ✅ | ✅ best | ✅ | ❌ | ❌ | ❌ |
| HRV/sleep | ✅ (HC) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Fasting | ✅ best-in-class | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| AI coach (LLM) | ❌ (rules only) | ⚠️ | ❌ | ⚠️ | ❌ | ❌ | ❌ | ⚠️ |
| Auto wearable sync | ⚠️ Android HC only | ✅ | ✅ | ✅ | ✅ (HealthKit) | ✅ | ✅ | ⚠️ |
| Social | ❌ | ✅ | ✅ | ✅ | ❌ | ⚠️ | ✅ best | ⚠️ |
| iOS native | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Price | free (no model) | hardware | hardware | $$/mo | $/one-off | $$$/mo | $/mo | $/mo |

**Features they have that you don't:** auto wearable sync, iOS/HealthKit, all-day stress/Body Battery, social, race-readiness/PMC daily (TP), LLM coaching at scale.

**Features you have that they don't (your moat):**
1. **Strength + endurance + recovery + fasting in one model** — nobody else spans all four.
2. **Fasting correlated with HRV/recovery/sleep** — unique.
3. **Hybrid-athlete program library + builder** with load-aware analytics.
4. **Deload automation** tied to ACWR.

**How to leapfrog:** (a) put a **real AI coach** on top of the four-domain context — instantly something no incumbent can copy without your data model; (b) **PMC + readiness as the home hero** to match TrainingPeaks/Whoop on their own turf; (c) **one auto-sync integration** to remove the friction that keeps you niche.

---

## 12. Native App Experience

The Android shell is genuinely good; the gaps are web-isms and iOS absence. (The engineering review covers the CSS/`innerHTML` detail; product-relevant items here.)

- **Navigation:** add Analytics/Coach to the bottom nav; current 4-tab nav hides the best content. Consider a center FAB for "log / start".
- **Daily loop UI:** Home should open to a morning briefing, not a marketing carousel.
- **Non-native interactions:** sticky `:hover` and long-press text selection were addressed in the engineering pass — verify across new screens. Ensure all touch targets ≥44px (chart toggles, set-delete are flagged sub-44).
- **Number jitter:** standardise tabular numerals on every live metric (timers/paces/loads) — partially done.
- **Performance:** `innerHTML` full-subtree re-renders on analytics cause scroll reset / GC churn; for premium feel, move hot paths (home tiles done; do charts next) to targeted DOM patching.
- **Empty states:** first-run shows "—" everywhere. Add seeded demo data or a guided "connect health / log first session" so the app is never blank.
- **iOS:** no native app and no HealthKit. For a category-leading platform this is a must on the roadmap (Capacitor or a second thin shell), even if Android-first.
- **Accessibility:** reduce colour-only status encoding; add labels to icon-only buttons; revisit `user-scalable=no`.

---

## 13. Prioritised Development Roadmap

### Quick Wins (1–2 days) — highest impact / lowest effort
1. **Add Analytics/Coach to the bottom nav** + surface Readiness as the Home hero (you already compute it). *(I5, I4-lite)*
2. **Unify the streak** into one "active days" badge on Home; remove duplicate streak calc in `dashboard.js`. *(I7)*
3. **Daily wellness check-in card** on Home, auto-prefilled from Health Connect sleep/HRV/RHR. *(I6)*
4. **Fix brand naming** to one name across manifest/home/fasting/notifications.
5. **Remove the hidden legacy DOM block** (`index.html:319`) and seed a first-run demo state.
6. **Promote existing insights** (fasting correlations, recovery momentum, achievements) onto Home — pure presentation.

### Short-Term (1–2 weeks) — major improvements
1. **Native scheduled notifications** via the Android shell + AI daily-nudge copy. *(I3)*
2. **AI Daily Coach v1** — wrap existing `brain` context in an LLM call server-side, rules engine as fallback. *(§8)*
3. **Subscription scaffolding** — tiers, paywall component, trial, billing via the shell. *(§10)*
4. **Performance Management Chart (daily CTL/ATL/TSB)** from data you already compute. *(§4)*
5. **Consolidate the 19 analytics contexts** into ~5 scrollable dashboards; reconcile the two recovery formulas. *(3.3)*
6. **Fasting protocol presets + milestone celebrations + weekly fasting report.** *(§6)*

### Medium-Term (1–2 months) — strategic upgrades
1. **Garmin Connect (and/or Strava) OAuth auto-sync.** *(I2, §5)*
2. **AI Weekly Coach + shareable weekly review.** *(§7,§9)*
3. **Goal spine:** target race/date countdown, target weight/lifts, race-readiness gauge + taper. *(§3.4)*
4. **VO2max trend + recovery forecast + race-time prediction.** *(§4,§5)*
5. **All-day stress / Body-Battery analogue** if intraday HR/HRV is available. *(§6)*
6. **Achievements/challenges generalised** beyond fasting. *(§9)*

### Long-Term (3–6 months) — category-defining
1. **iOS native app + HealthKit** parity.
2. **Ask-anything AI coach over the full data model** (the unmistakable moat). *(§8)*
3. **Social layer** — friends, challenges, leaderboards, club/coach sharing.
4. **Nutrition & hydration** (protein/calorie/water) to close the recovery loop.
5. **COROS API + Strava + Apple Watch** breadth → "connect any wearable."
6. **On-device/edge predictive models** for recovery & performance forecasting at scale.

---

## 14. The One-Paragraph Founder Takeaway

You have quietly built the **analytics and fasting engine of a category-leading hybrid-athlete platform** — and then given it away with no AI layer, no auto-sync, and no way to pay you. The next two months are not about building more analytics; they're about **packaging** (subscription), **voice** (a real AI coach on the context you already compute), and **friction** (one auto-sync integration + reliable notifications). Do those three and Hybrid Engine stops being a brilliant power-user tool and becomes a product Garmin, Whoop, TrainingPeaks and Zero each only half-cover.
