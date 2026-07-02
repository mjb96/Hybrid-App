# Hybrid Score™ — Design & Implementation Spec

**The signature feature of Helyx.** One number, updated daily, that answers:
*"How well am I progressing as a hybrid athlete — and what should I do about it today?"*

Status: **design + engine implemented** (this doc is the source of truth for the model).
Engine: `js/brain/hybrid-score/` (pure, tested). UI: Home hero gauge + Insights detail.

---

## 1. Audit — existing metrics that feed Hybrid Score (reuse, don't duplicate)

Everything below already exists and is **reused directly** by the engine via the shared
"brain pass" (`js/home/dashboard-model.js`), so no calculation is duplicated:

| Signal | Source (reused) | Feeds pillar |
|---|---|---|
| Readiness 0–100 (HRV, sleep, RHR, wellness, load) | `analytics/scoring/readiness-scoring.js` → `model.ready` | Recovery |
| CTL / ATL / TSB / ACWR (EWMA) | `brain/load_models.js` → `model.load` | Training Load, Recovery |
| Weekly tonnage series | `metrics/metrics-strength.js` `strengthLoadSeries` | Strength, Momentum |
| e1RM progression per lift | `metrics/metrics-strength.js` `weeklyE1rmByLift`, `big3Progression` | Strength |
| Weekly distance / pace / VDOT | `metrics/metrics-running.js`, `analytics/.../running-calcs.js` `vdotFromThresholdPace`, `enduranceScore` | Endurance |
| Recovery-cost split (gym vs run sRPE) | `brain/load_models.js` `recoveryCostBreakdown` | Training Load (balance) |
| Consistency % (this week) + program-long adherence | `model.week.consistencyPct`, `model.goal.avgConsistency` | Consistency |
| Training streak | `model.streak` | Consistency, XP |
| Body-weight trend vs goal | `model.bodyweight`, `settings.weightGoal` | Body Composition |
| Sleep / steps / fasting / wellness | `model.health`, `model.fasting`, `state.wellnessLog` | Lifestyle |
| Big-3 maxes, PRs | `model.big3`, `metrics-strength` | XP / celebrations |

### Gaps (deliberately optional — no fabricated data)
Not currently tracked, so **excluded from v1** and represented as optional pillars/signals
that auto-activate (with weight redistribution) if the data ever appears:
- **Nutrition / protein target**, **Hydration**, **Body-fat %**. When added, they slot into
  Body Composition / Lifestyle with pre-reserved weights (`config.js`). Until then the
  confidence indicator simply reflects their absence rather than penalising the athlete.

---

## 2. Scoring models considered

**Model A — Single weighted average of raw metrics.** Simple, but not explainable
(can't say "+5 for the workout"), easy to game (spam volume), and not hybrid-aware.

**Model B — Additive event points around a baseline (Duolingo-style).** Very explainable
("+5 workout, −2 sleep"), but arbitrary point values, no scientific grounding, and no
natural ceiling/personalisation.

**Model C — Pillar sub-scores (0–100) → availability-weighted composite, expressed as
additive contributions around 50.** ← **RECOMMENDED.**
Each pillar is a defensible 0–100 sub-score built from existing sports-science metrics;
the composite is a weighted average; and because `score − 50 = Σ wᵢ·(pillarᵢ − 50)`, the
same model yields **both** a rigorous score **and** the additive "+4 / −2" breakdown users
love. It is hybrid-aware (a Balance pillar requires *both* modalities), hard to game
(rewards progression + adherence + being in the productive load zone, not raw volume),
personalised (level-scaled thresholds), and gracefully handles missing data.

### Why C is hard to game
- **Consistency** rewards adherence to the *plan*, not mere activity.
- **Strength/Endurance** reward *progression* (e1RM / VDOT / pace trend), not tonnage spam.
- **Training Load** peaks in the productive ACWR zone (0.8–1.0) and *penalises spikes* — so
  grinding junk volume lowers the score.
- **Balance** requires *both* strength and endurance load; a pure lifter or pure runner is
  capped. This is the anti-game core and the essence of "hybrid."
- **Recovery** gates the ceiling — you can't score elite while wrecked.

---

## 3. The recommended model (v1)

**Pillars & default weights** (`js/brain/hybrid-score/config.js`, fully configurable):

| Pillar | Weight | What it measures | Reuses |
|---|---|---|---|
| **Consistency** | 0.22 | Adherence to plan + streak | `week.consistencyPct`, `goal.avgConsistency`, `streak` |
| **Recovery** | 0.18 | Readiness / freshness | `ready.score`, `load.tsb` |
| **Strength** | 0.14 | e1RM progression + volume upkeep | `weeklyE1rmByLift`, `strengthLoadSeries` |
| **Endurance** | 0.14 | VDOT / pace / distance progression | `enduranceScore`, `weeklyPaceSeries`, `weeklyDistanceSeries` |
| **Training Load** | 0.12 | ACWR zone + strength/run balance | `load.acwr`, `recoveryCostBreakdown` |
| **Momentum** | 0.10 | 4-week trajectory of the above | series slopes |
| **Body Composition** | 0.05 | Weight trend vs goal | `bodyweight.delta7`, `weightGoal` |
| **Lifestyle** | 0.05 | Sleep / steps / fasting | `health`, `fasting` |

**Composite:** drop pillars with no data, renormalise weights across the rest, weighted
average → clamp 0–100. **Confidence** = covered weight ÷ total weight.

**Weighting rationale (sports science):** Consistency is the strongest long-run predictor
of adaptation and the hardest to fake, so it leads. Recovery gates trainability (readiness /
TSB literature). Strength and Endurance are equal — the definition of hybrid. Training Load
encodes Gabbett's ACWR "sweet spot" plus modality balance. Momentum rewards trajectory over
absolute level so improvers feel it early. Body-comp/Lifestyle are supportive and frequently
partial, hence low weight.

### Adaptation (personalisation)
- **Level** (`settings.fitnessLevel`): beginner / intermediate / advanced scale the
  progression thresholds in Strength & Endurance — a beginner earns full marks for small,
  steady gains; an advanced athlete must sustain progression. Beginners also get a higher
  progression floor (never punished for a modest week).
- **Planned deload** (phase name contains "Deload" or `deloadApplied === currentWeek`):
  Training Load is scored on *appropriate* de-loading (rising TSB, ACWR easing toward 0.8),
  so a planned volume drop **raises** the score; Strength/Endurance progression penalties are
  frozen; weight shifts toward Recovery + Consistency. A well-executed deload should *improve*
  Hybrid Score, not tank it.
- **Returning from layoff** (≥14-day gap then activity in the last 7 days): load penalties are
  capped (low chronic load isn't punished) and showing up is rewarded via Consistency/Momentum.
  Flagged `returning: true` so the UI can frame it as a comeback.

---

## 4. Explainability — "Why is my score this today?"

The engine emits, every day:
- **Pillar contributions** `cᵢ = wᵢ′·(pillarᵢ − 50)` (sum ≈ score − 50) → breakdown bars.
- **Signal drivers** — human-readable signed items, ranked by impact, e.g.
  `+5 Completed scheduled workout` · `+4 Squat e1RM up 4%` · `−3 Poor sleep` ·
  `−2 High fatigue (ACWR 1.4)` · `−3 Missed yesterday's run`.
- **Top contributor** (biggest positive pillar) and **Top opportunity** (biggest *actionable*
  negative) → the single recommended action to raise tomorrow's score.

Users always see exactly what helped, what hurt, and the one thing to do next.

---

## 5. Psychology (why this drives daily return)

- **Anticipation / curiosity:** the score updates overnight — "what's my number today?" is a
  Whoop-style reason to open the app *before* training.
- **Variable reward:** the top driver and opportunity rotate with real signals, so the daily
  reveal feels fresh, not scripted.
- **Progress + identity:** a career **Hybrid Level** (below) turns daily effort into a
  long-arc "I am becoming a Hybrid Athlete" narrative — identity is the deepest retention hook.
- **Loss aversion:** momentum arrow + streak framing ("don't let momentum stall").
- **Agency (self-efficacy):** every score ships with *one* concrete action — control, not guilt.
- **Fairness:** level-scaling and deload/return handling mean the score feels *earned and
  just*, which sustains trust (a score people think is unfair gets ignored).

### Hybrid Level (identity system)
Career tiers driven by cumulative **XP** (not the volatile daily score), so the ladder only
ever goes up: **Initiate → Builder → Competitor → Hybrid Athlete → Elite → Apex → Legend.**
"Hybrid Athlete" is the aspirational midpoint (the app's namesake); Elite/Apex/Legend extend
mastery. XP accrues from completed *planned* sessions, sustained daily score, streak
milestones, and PRs (non-gameable, career-cumulative).

### Gamification (premium, not childish)
- **XP + Levels** (career, above). **Milestones** (first sub-25 5k, 100k kg lifted, 4-week
  streak, first 90+ score). **PR celebrations** (full-screen, haptic — reuse `haptics.js`).
- **Seasonal challenges** (config-driven, e.g. "8-week Hybrid Base") — deferred to v2 but the
  XP/level substrate is built to support them.

---

## 6. UI / UX

**Home hero (first thing users see):** a premium circular **score gauge** (0–100, colour by
band), the **Hybrid Level** title, a **trend arrow + daily delta** ("+5 since yesterday"), a
**momentum** indicator, a **confidence** ring/label, the **biggest contributor today**, and
**one recommended action** for tomorrow. Tapping opens the detail view.

**Insights → Hybrid Score detail:** pillar breakdown bars (contributions), full driver list,
score trend (daily/weekly/monthly), level progress to next tier, and history.

**Morning Briefing integration:** the briefing leads with the score —
*"Your Hybrid Score is 87 (+5). Biggest opportunity today: complete your Zone 2 run."*
Every coaching surface references the score so it becomes the app's spine.

Accessibility: numeric label + text status (never colour alone), `prefers-reduced-motion`
guard on the gauge animation, keyboard-activatable card.

---

## 7. User journey

1. **New user:** score shows with low **confidence** and encouraging copy ("Log 3 sessions to
   calibrate your Hybrid Score"). No punishment for missing data.
2. **Daily:** overnight recompute → open app → gauge + delta + one action. Complete the action
   → tomorrow's score reflects it.
3. **Weekly:** trend + level progress; weekly review references the score arc.
4. **Long term:** climb Hybrid Levels; unlock milestones; the score becomes identity.

---

## 8. Implementation plan (incremental, tested)

- **Stage A — Config + Levels** (`config.js`, `levels.js`) + tests. ✅
- **Stage B — Pillars** (`pillars.js`, pure, from `model` + `state`) + tests. ✅
- **Stage C — Engine** (`hybrid-score.js`: compose, drivers, momentum, confidence, delta,
  opportunity, adaptation) + tests. ✅
- **Stage D — History/XP recorder** (`history.js`: idempotent daily record, XP, level, trend)
  + tests. ✅
- **Stage E — UI**: Home hero gauge card + Insights detail view + Morning-Briefing/insight
  integration. (Incremental; each behind the render shield, verified via smoke.)

**Tech:** all pure and modular under `js/brain/hybrid-score/`; weights/thresholds/levels live
in `config.js` for easy tuning; one recompute reuses the existing dashboard model (no extra
passes); the only state write is the idempotent daily history entry.
