# Hybrid Score™ — Deep Review & Evolution Roadmap

**Date:** 2026-07-02 · **Scope:** the shipped engine (`js/brain/hybrid-score/*`) + its inputs.
**Mandate:** evolve, don't rewrite. No duplicate systems. Change only where there's a
*measurable* improvement.

> TL;DR — the model's **architecture is excellent** (transparent additive pillars, one
> action, adaptation, a genuinely novel Balance pillar). It has **five real defects** that
> undermine trust and scientific defensibility, all fixable by evolving existing code:
> (1) a within-week **sawtooth** in Consistency, (2) **signal double-counting** across
> pillars, (3) an **average-pace regression penalty** that punishes correct easy-volume
> training, (4) **static VDOT** that never updates from real runs, (5) **e1RM gaming +
> accessory dilution** in Strength. Fix those and add **day-over-day "why it changed"
> attribution**, and Hybrid Score becomes the benchmark hybrid-athlete metric.

---

## 1. How Hybrid Score is calculated today (precise)

`computeHybridScore(model, state, days)` (`hybrid-score.js`):
1. Computes **8 pillar sub-scores** (0–100) via `computePillars` (`pillars.js`).
2. Drops pillars with `null` (no data); **renormalises weights** across the rest.
3. `score = Σ wᵢ′·pillarᵢ`, clamped 0–100.
4. **Contributions** `cᵢ = wᵢ′·(pillarᵢ − 50)` — so they sum to `score − 50` and become the
   additive "why today" drivers.
5. **Confidence** = covered weight ÷ total weight. **Delta** = today − yesterday (history).
6. **Adaptation:** level thresholds (beginner/intermediate/advanced), deload reweighting,
   returning-from-layoff load floor.

**Default weights** (`config.js`): Consistency **0.22** · Recovery **0.18** · Strength
**0.14** · Endurance **0.14** · Load **0.12** · Momentum **0.10** · Body **0.05** ·
Lifestyle **0.05**.

---

## 2. Pillar-by-pillar audit

### Consistency — 0.22 (highest) · `pillars.js:54`
- **Input:** `model.week.consistencyPct` (this-week set/session completion), `goal.avgConsistency`
  (program-long), `streak.current`. `score = 0.6·thisWeek + 0.4·avg + streakNudge(≤8)`.
- **✅** Correctly the top weight — adherence is the strongest long-run predictor and hardest
  to fake.
- **🔴 DEFECT 1 — within-week sawtooth.** `consistencyPct = consistencyDone / consistencyTotal`
  where the denominator is the **whole week's** planned sets (`dashboard-model.js:135`). On
  Monday almost nothing is done → `thisWeek ≈ 0` → the score **drops every Monday** regardless
  of behaviour, then climbs through the week. The daily delta a user sees is dominated by
  *day-of-week*, not by what they did. This directly erodes "anticipation" and "reward
  consistency not perfection," and makes "why did my score drop?" unanswerable ("you did
  nothing wrong — the week reset").
- **🟠** Streak nudge saturates at 7 days: a 7-day and a 300-day streak both get +8. No
  long-term reward.
- **🟠** Per-*set* completion conflates adherence with volume — skipping 2 accessory sets reads
  as "missed the plan."

### Recovery — 0.18 · `pillars.js:78`
- **Input:** `model.ready.score` (the Garmin-style readiness: HRV, sleep, RHR, wellness,
  **load**), or a TSB fallback when no readiness signals exist.
- **✅** Reuses a solid multi-signal readiness — the right foundation.
- **🔴 DEFECT 2a — double-counts load.** Readiness already contains an ACWR-based `load`
  component (weight 0.23 inside readiness, `readiness-scoring.js:11`). The **Load pillar also
  scores ACWR.** The same signal drives the score through two pillars with two different
  mappings — the nominal weights understate load's true influence and it's hard to defend
  "what is ACWR worth?".
- **🟠** For the (many) users without a wearable or a daily check-in, Recovery collapses to
  **TSB only** — thin, and it barely moves day-to-day.
- **🟠 Missing "Recovery trend"** (explicitly in the brief): the pillar is a *snapshot*. A
  3-day declining HRV/readiness slide isn't reflected until it's already low. Only the separate
  risk engine sees the trend.

### Strength — 0.14 · `pillars.js:103`
- **Input:** `0.6·progression + 0.4·volumeUpkeep`. Progression = **average per-lift e1RM
  %-change over ~4 weeks** across *all* lifts. Upkeep = current tonnage vs 3-week avg.
- **✅** Level-scaled thresholds (beginner 2%/advanced 5%) are a good adaptation.
- **🔴 DEFECT 5a — e1RM gaming.** e1RM from a single heavy low-rep set spikes the estimate;
  a user chasing the number is rewarded for **testing** rather than building. Uses a single
  session's best, not a smoothed best.
- **🔴 DEFECT 5b — accessory dilution.** A 10% jump on a biceps curl counts **equally** to a
  10% squat gain. Big-3 / compounds should dominate "hybrid strength."
- **🟠** `progressionPct` compares `lastNonZero` to `priorNonZero(idx−4)` — for sporadically
  trained lifts the "past" value can be 8+ weeks old, so the %/week isn't time-normalised.
- **🟠 Mixed incentive:** upkeep rewards *more* tonnage, which fights the Load pillar's
  "don't spike" message.

### Endurance — 0.14 · `pillars.js:143`
- **Input:** mean of {distance-progression, pace-progression, `enduranceScore(vdot,…)`}.
- **🔴 DEFECT 3 — average-pace regression penalty.** Pace progression reads `weeklyPaceSeries`
  = the **distance-weighted mean pace** of the week. A week with more easy Zone-2 volume (the
  *correct* thing) lowers average pace → scored as "pace slowing" → penalised. **The model
  actively penalises polarised training.** Running fitness must be judged at matched intensity
  (best-effort pace, or pace-at-HR / aerobic decoupling), never weekly-average pace.
- **🔴 DEFECT 4 — static VDOT.** `vdotFromThresholdPace(state.thresholdPaceSeconds)` uses a
  **single manually-typed** threshold. It never updates from actual runs, and most users never
  set it → the whole science-based endurance component is **absent** for them. Running
  *progression* is essentially not automated.
- **🟠** Distance-progression rewards more km → again fights Load.

### Training Load — 0.12 · `pillars.js:180`
- **Input:** `0.6·ACWR-zone + 0.4·hybrid-balance`. Zone mapping peaks at ACWR 0.8–1.0
  (Gabbett sweet spot). Balance rewards an even lift/run split; a single modality is capped.
- **✅ The Balance sub-score is the model's most novel, defensible idea** — nobody else scores
  strength/endurance balance. This is the heart of "hybrid."
- **🟠 Overlaps Recovery** (ACWR, DEFECT 2a) and **Momentum** (CTL).
- **🟠** Balance can over-punish a deliberate strength/run *block*; it isn't goal-aware.

### Momentum — 0.10 · `pillars.js:235`
- **Input:** average fractional slope of the **last 3 weekly points** of volume, distance, CTL.
- **🔴 DEFECT 2b — re-counts the same signals.** Volume is already in Strength (upkeep),
  distance in Endurance, CTL in Load. Momentum re-derives trends from the **same three series**,
  so volume/distance effectively count *twice*, inflating their true weight well beyond the
  nominal 0.10.
- **🟠** Only 3 points → volatile; one big week swings it.
- **Better basis:** momentum of the **Hybrid Score itself** (is the composite rising?) is
  orthogonal and is what the user actually cares about.

### Body Composition — 0.05 · `pillars.js:263`
- **Input:** 7-day weight delta vs goal (cut/bulk/maintain). Sensible, goal-aware.
- **🟠** Weight-only (no body-fat — not tracked); `delta7` is noisy (water/glycogen). Low
  weight correctly limits the damage. Acceptable.

### Lifestyle — 0.05 · `pillars.js:284`
- **Input:** mean of {sleep vs 8h, steps vs 10k, fasting streak/active}.
- **🔴 DEFECT 2c — double-counts sleep** (already in Recovery via readiness).
- **🟠** Fasting as a *performance* input is ideological — it's a preference, not a driver of
  hybrid performance. Low weight mitigates, but consider moving it to "habits," not the score.

---

## 3. Does the score genuinely reflect a better hybrid athlete?

**Mostly yes — with a lean and a leak.**
- **Right things, right order:** consistency > recovery > (strength = endurance) > load. The
  Balance pillar uniquely enforces *both* modalities. Level/deload/comeback adaptation is fair.
- **The lean:** because of **double-counting** (§Defect 2) and **Momentum re-counting**
  (§Defect 2b), the *effective* weight of **training volume and load** is materially higher
  than the nominal weights imply, while **true progression quality** (real strength/endurance
  gains) is under-weighted and partly mismeasured (Defects 3–5). So today the score leans
  slightly toward "did a lot / balanced load" over "actually got fitter."
- **The leak:** for a user **without a wearable**, Recovery≈TSB, Lifestyle is sparse,
  Body is optional — the score is carried by Consistency + Load + volume trends, and moves
  little day-to-day. It reflects *training behaviour* well but *physiological progress* weakly.

---

## 4. Scientific defensibility & manipulation resistance

**Defensible cores:** ACWR sweet-spot (Gabbett), CTL/ATL/TSB (Banister EWMA), readiness
composite, level-scaled progression, hybrid balance. Additive transparency is a defensibility
*asset* — every point is traceable.

**Weakest links (all fixable):** average-pace-as-fitness (Defect 3) is scientifically
**backwards**; single-session e1RM (Defect 5a) is noise-sensitive; double-counting (Defect 2)
makes stated weights misleading.

**Gameability — two open vectors:**
1. **e1RM testing** — frequent near-max singles inflate Strength progression.
2. **Volume spamming** — junk volume raises Strength-upkeep *and* Momentum *and* nudges CTL,
   a triple reward, partly offset by ACWR spiking Load down. Net: volume is over-rewarded.
Everything else is well defended (Balance blocks single-modality gaming; progression windows
block one-session spikes on the composite; Recovery caps the ceiling). Closing the two vectors
(smoothed compound-weighted strength; de-double-counted momentum) makes it **hard to game.**

---

## 5. Missing / additional inputs worth adding

| Input | Verdict | How to add (evolve, not new system) |
|---|---|---|
| **Workout quality / true program adherence** | **Add** (brief names it) | Planned-vs-done sets *at target RPE/load* → a sub-signal of Consistency; distinct from raw set-count. |
| **Auto-VDOT from real runs** | **Add** (fixes Defect 4) | Estimate VDOT from best recent effort (Riegel/Daniels: hard-run pace×distance). Feeds Endurance + the existing Projections. |
| **Recovery trend** | **Add** (brief names it) | 3-day readiness/HRV slope folded into Recovery as a small ± term (early-warning). |
| **Respiratory rate / temp (wearable)** | Add *if present* | Health Connect, when available — improves Recovery precision toward Whoop/Oura. |
| **Nutrition / protein / hydration** | Optional | Reserved-weight pillar that activates only when data exists (Health Connect nutrition / manual protein target). Architecture already supports drop-in pillars. |
| **Body-fat %** | Optional | Into Body Comp when tracked. |
| **Fasting** | **Demote** | Keep as a habit/streak, not a hybrid-performance input — or gate behind "fasting is a goal." |

---

## 6. Psychology review (the five questions)

1. **Open every morning?** *Partly.* The gauge + delta + briefing are a real hook, **but** the
   delta is polluted by the Monday sawtooth (Defect 1) and, for non-wearable users, the number
   barely moves day-to-day → weak reason to check *daily*. Whoop moves every morning because
   recovery is genuinely daily. **Fix:** de-sawtooth + a small daily quality/effort term so the
   number moves for *everyone*.
2. **Anticipation?** *Under-delivered* for the same reason — mostly weekly inputs → small daily
   movement. Day-over-day "why it changed" attribution (§7) would create real "what changed
   overnight?" pull.
3. **Rewards consistency over perfection?** *Directionally yes* (top weight) but the sawtooth
   and per-set penalty punish *showing up on schedule* early in the week and *one* missed
   accessory. Fixing Defect 1 makes this genuinely true.
4. **Motivates beginners without plateauing advanced?** *Yes — this is a strength.* Level-scaled
   thresholds + floors do exactly this. Keep.
5. **Long-term identity, not a number?** *Yes* — the **Hybrid Level** ladder (Initiate→Legend
   via career XP) is the identity spine and it's good. Tighten the loop by making level-ups
   reference *what earned them* ("100k kg lifted → Competitor").

---

## 7. UI/UX — already strong; one premium gap

**Already best-in-class:** the gauge + additive drivers + confidence + top-contributor + **one
action for tomorrow** is more explainable than Whoop/Oura/Garmin (they show contributors, none
give a single prescriptive next action).

**🔴 The premium gap — "why did it *change*?"** The drivers explain today's **level** (why the
score *is* 87), not the **change** (why it went 82→87). They're computed independently of the
delta. A user seeing "−5" wants "recovery dropped −4, you missed yesterday's run −3, momentum
+2." **Evolve:** store yesterday's per-pillar contributions and show the **day-over-day
contribution diff** as the delta explanation. This is the single biggest perceived-intelligence
upgrade and directly answers the brief's "why increased / why reduced."

**Other premium touches:** confidence-gate the presentation (visually hedge a <50%-confidence
score rather than showing it at full authority, like Whoop's "insufficient data"); animate the
gauge from yesterday's value to today's so the delta is *felt*.

---

## 8. Competitive benchmark

| Metric | What it is | Hybrid Score vs it |
|---|---|---|
| **Garmin Body Battery** | Real-time energy 0–100 from HRV/stress/activity | **Broader** (progression+balance+consistency, not just energy); **behind** on real-time/all-day granularity. |
| **Whoop Recovery** | Daily 0–100% from HRV/RHR/sleep/resp | **Broader** (Whoop says nothing about whether training is *productive* or *balanced*); **behind** on recovery precision + daily reliability (24/7 sensor). |
| **Oura Readiness** | Sleep/HRV/temp readiness | Same as Whoop — broader scope, thinner recovery sensing. |
| **Strava Fitness/Freshness** | Raw CTL/ATL/TSB | **More actionable** (one number + one action vs an expert chart); Strava is more transparent to data nerds. Hybrid *contains* this as one pillar. |
| **Apple Training Load** | 7-vs-28-day RPE load ratio | Hybrid is far richer; Apple is a single load ratio. |

**Where Hybrid Score is already superior:** it is the **only** score that fuses recovery +
strength + endurance + **balance** + consistency + progression into one explainable number with
a prescriptive next action and a career identity. The **Balance pillar** and **"one action for
tomorrow"** are genuinely novel — nobody else has them.

**Where it still falls short:** daily reliability/granularity without a wearable; recovery
precision (no respiratory/temp); and the five defects above (sawtooth, double-counting,
pace-penalty, static VDOT, e1RM gaming). Close those and it is best-in-class **for hybrid
athletes specifically** — a segment none of the incumbents serve.

---

## 9. Prioritised evolution roadmap (evolve, not replace)

Ordered by (trust + science + psychology) impact ÷ effort. Each is a change to *existing* code
with a measurable acceptance test.

### P0 — Fix the trust/science defects
- **E1 · De-sawtooth Consistency** *(Defect 1).* Stop the Monday cliff: floor this-week
  adherence at the athlete's established baseline and only *credit* within-week progress
  (ideal: normalise to sessions-expected-by-today). **Measure:** daily delta no longer
  correlates with day-of-week on a fixed dataset. *→ pillars/consistency (+ optional model
  field).* **Low risk.**
- **E2 · Fix the pace penalty** *(Defect 3).* Replace weekly-average-pace trend with an
  intensity-aware signal — best-effort pace trend (and pace-at-HR / decoupling when HR exists);
  never score "more easy volume" as regression. **Measure:** a week that only adds easy Z2 km
  no longer lowers Endurance. *→ endurancePillar + a small running-calc.* **Low/med risk.**
- **E3 · De-double-count** *(Defect 2).* ✅ **SHIPPED 2026-07-02.** Pillars are now orthogonal:
  **sleep** removed from Lifestyle (Recovery owns it — Lifestyle = steps + fasting only);
  **Momentum** rebased on the **Hybrid Score's own history trend** (least-squares slope of the
  last ~7 daily scores) instead of re-deriving volume/distance/CTL; **Recovery** uses a
  load-excluded readiness (`model.readyNoLoad`) so ACWR is no longer counted by both Recovery
  and Load. No input now feeds >1 pillar; the stated weights are honest. *→ pillars + dashboard
  model.* Acceptance tests: Recovery is invariant to ACWR; Momentum reads history not series;
  sleep-only no longer creates a Lifestyle score.

### P1 — Close the named input gaps
- **E4 · Auto-VDOT from real runs** *(Defect 4).* ✅ **SHIPPED 2026-07-03.** VDOT is no longer
  static/manual-only: `vdotFromPerformance` (Daniels–Gilbert %VO₂max curve) turns any logged run
  into a VDOT; `bestEffortVdot` scans the last ~8 weeks (1.5–42.2 km, walks/sprints excluded) for
  the hardest effort; `effectiveVdot` prefers a manual threshold pace and otherwise falls back to
  the best-effort estimate. Wired into `endurancePillar` (science-based Endurance now lights up
  from runs alone) and `runningProjection` (race predictions + 5k ETA appear for anyone who logs
  runs, not just those who typed a threshold pace). *→ running-calcs + endurance + predictions.*
  Acceptance: 20:00 5k → VDOT 49–51 (matches Daniels' tables); a user with no threshold pace
  still gets a VDOT + race predictions from their runs (`tests/vdot.test.js`).
- **E5 · Workout-quality / true adherence.** Planned-vs-done at target RPE/load as a Consistency
  sub-signal. **Measure:** completing prescribed work at target RPE scores higher than logging
  junk sets. *→ a small quality calc + consistency.*
- **E6 · Recovery trend term.** Fold a 3-day readiness slope into Recovery. **Measure:** three
  declining readiness days nudge the score down before it's a crisis. *→ recoveryPillar.*

### P2 — Premium explainability & anti-game
- **E7 · "Why it changed" delta attribution.** ✅ **SHIPPED 2026-07-02.** Snapshots now store
  per-pillar contributions (`history.js`); the engine diffs yesterday→today into
  `deltaBreakdown` (sums to the delta); the detail view shows a "Since yesterday +N" block
  ("+5 Recovery improved · −2 Consistency slipped"), separate from the "why your score IS this"
  drivers. *→ history + engine + UI.*
- **E8 · Compound-weighted, smoothed Strength** *(Defect 5).* ✅ **SHIPPED 2026-07-03.** Two
  gaming vectors closed. (1) **Smoothing:** the e1RM formula over-estimates a grindy near-max
  single, so `weeklyE1rmByLift`'s single-session peak spiked the pillar. `robustE1rmSeries`
  replaces each training week's peak with the **trailing-median** of the last ~3 training weeks —
  a one-off is rejected outright (median ignores a lone outlier), a PR that's actually *repeated*
  persists within a couple of weeks (chosen over a naive rolling-max, which would *keep* the
  spike). (2) **Compound weighting:** `liftWeight` tiers each lift (primary barbell compound 1.0 ·
  secondary/assistance 0.6 · isolation 0.25 · unknown 0.5) and progression is a weighted mean with
  the denominator floored at one compound's worth — so an accessory-only block can't earn full
  credit, yet accessories added *on top of* compounds never dilute them. **Measure (tests):** a
  lone near-max single scores like a flat block while a repeated climb scores clearly higher; an
  identical curl PR moves Strength less than a squat PR. *→ metrics-strength + strengthPillar.*
- **E9 · Daily-movement term for non-wearable users.** A small "today's session done at target"
  signal so the number moves every day. **Measure:** score changes daily without Health Connect.

### P3 — Optional inputs (architecture already supports)
- **E10 · Nutrition/protein, hydration, body-fat** as drop-in optional pillars/sub-signals that
  activate when data exists; reserved weight; confidence reflects their absence.

### P4 — Presentation & identity
- **E11 · Confidence-gated presentation** (hedge <50%-confidence visually; gauge animates
  yesterday→today). **E12 · Long-streak reward** beyond 7 days; level-ups cite what earned them.

---

## 10. Recommended first move

**E1 + E2 + E7** together transform the day-to-day feel: the score stops dropping for no
reason (E1), stops punishing correct training (E2), and finally explains *why it changed* (E7)
— the three things that make a user trust it and open it every morning. All three evolve
existing modules; none add a parallel system. Start there.
