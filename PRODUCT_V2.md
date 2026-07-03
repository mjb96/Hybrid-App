# PRODUCT_V2.md — The Helyx Redesign Philosophy

> **This document removes more than it adds.**
> The goal is not a better dashboard. The goal is an app a hybrid athlete *loves
> opening every morning* — and can explain to a friend in one sentence.
>
> Helyx today is a world-class analytics **engine** (8/10 execution) trapped in an
> overwhelming, low-retention **shell** (2/10 simplicity, 3/10 retention). V2 keeps
> the engine almost untouched and rebuilds everything around a single idea.

---

## 0. The North Star

**One sentence a user must be able to say:**

> "Helyx gives me a single number for how well I'm balancing strength and
> endurance — and tells me the one thing to do today."

Every screen, feature, notification, and setting is judged by one question:
**does it make that sentence more true?** If not, it is deleted, merged, or hidden.

Three non-negotiable design laws for V2:

1. **One hero per screen.** If two things compete for the eye, one of them is wrong.
2. **Payoff before homework.** The app gives value to *earn* input, never the reverse.
3. **Subtraction is a feature.** Shipping *less* is the primary work of the next quarter.

---

## 1. What we are killing (and why it makes the product better)

Deletion is not loss — it is the feature. Each removal buys focus, speed, and trust.

| Killed / Hidden | Lines saved (approx) | Why it dies |
|---|---:|---|
| **Fasting subsystem** (calcs, education, insights, charts, home card, leaf) | ~3,150 JS + CSS | A whole second app. A hybrid strength+running product is not a fasting product. Off-strategy. Spin out or delete. |
| **20 of 25 analytics leaves** | thousands | Nobody navigates 25 analytics screens. Most are the same data resliced. |
| **Tile customiser + most of 17 tiles** | — | Customization is a confession you couldn't choose defaults. Choose them. |
| **Home weekly-progress header, week-compare card, "In Focus" graphs, engine-stall card** | — | Four+ redundant renderings of "did you train this week." |
| **Avg Pace / VDOT / Run Cross-ref as destinations** | — | These are *inputs to the Score*, not places to visit. |
| **Stress Balance + Load Focus + Training Status as separate screens** | — | Three names for one concept: load vs recovery. |
| **~19 of 29 settings** | — | Band weights, progression step, remembered-rest reset — power-user knobs on a consumer stage. |

**Rule:** nothing above is "archived for later." Archiving is how sprawl comes back.
If it returns, it returns because a user *begged* for it, not because we were afraid
to cut.

---

## 2. The redesigned Hybrid Score — from dashboard to identity

The **math does not change.** The 8 weighted pillars, additive contributions,
availability renormalization, confidence, level adaptation, anti-gaming — all of it
stays. It is genuinely best-in-class and no competitor has it. **Only the
presentation changes**, because today an 8-pillar bar chart is a spreadsheet, and
spreadsheets are not tellable, motivating, or addictive.

### 2.1 One number, three dials, one sentence

```
        ┌─────────────────────────────┐
        │        HYBRID SCORE         │
        │            82               │   ← the number (huge)
        │         Competitor          │   ← the identity (level)
        │   ▲ +3 today · ↗ climbing    │   ← delta + momentum (surprise + arc)
        │                             │
        │   TRAIN 88   RECOVER 74     │   ← 3 dials, not 8 pillars
        │        PROGRESS 79          │
        │                             │
        │  "You're primed. Today is a │   ← ONE sentence of coaching
        │   day to push the run."     │
        └─────────────────────────────┘
```

- **The 8 pillars collapse into 3 dials a human can hold:**
  - **TRAIN** = Consistency + Load + true-adherence (are you doing the work?)
  - **RECOVER** = Recovery + Lifestyle (can your body take it?)
  - **PROGRESS** = Strength + Endurance + Momentum (are you actually getting fitter?)
- The 8 pillars still exist — as an optional **"under the hood"** expansion for the
  power user. Default view is 3 dials.
- **Keep** the confidence meter and the "since yesterday, here's why" attribution —
  these are premium *trust* mechanics competitors don't have. They stay.

### 2.2 Make it tellable

The success test is social: a user must be able to say
**"My Hybrid Score is 82 and I'm a Competitor"** as easily as
**"My Whoop recovery was 34%."**

- Lead with **number + level**, always together. The level *is* the identity.
- One shareable card (see §6). If a score can't be shared, it can't spread.

### 2.3 Make it move forward, not just mirror backward

Today's fatal flaw: without a wearable, the Score is largely a *lagging mirror* of
what you already logged — no surprise, no anticipation. V2 makes it **forward-looking**:

- "Your score will **rise to ~85** if you complete today's session at target."
- "Skip today and it **drifts to 78** by Friday."
- The morning number should tell you something you *didn't already know* and give
  you a lever to change it *today*. That is the entire retention mechanism.

---

## 3. The redesigned Home — one hero, then silence

**Above the fold: the Hybrid Score card and nothing else.** No progress bar above
it, no briefing restating it below it. The Score card *contains* the day's one
action and one coaching sentence (§2.1). That is the whole top of the app.

**Below the fold (quiet, one scroll):**

1. **Today's session** — one card: what's planned, one tap to start.
2. **Four tiles, maximum** — the raw glanceable numbers the Score is built from,
   for the user who wants to peek: Readiness, Weekly Volume, a strength number, a
   running number. Chosen by us. Not customizable.
3. A single **flag slot** — *only* when something needs attention (a recovery flag
   that merges today's overtraining + deload cards into one calm, honest message).
   Zero flags is the happy default, and the happy default should feel calm.

Everything else that lives on Home today (In-Focus graphs, week-compare, activity
calendar, quick actions, engine alerts) **moves off Home** into Analytics, the
Workout screen, or Profile — or dies.

**The test:** a new user opening Home should, in under two seconds, know
(a) their number, (b) whether today is a push or a pull-back, and (c) the one thing
to do. Nothing on screen should compete with those three facts.

---

## 4. Information architecture — 5 tabs, 5 analytics screens, zero duplication

Keep the 5-tab shell (Home · Workout · Program · Insights · Profile). Collapse the
**25 analytics leaves into 5 honest ones:**

1. **Score** — the full Hybrid Score story (3 dials → 8 pillars, drivers, why-it-
   changed, trend, projections folded in as "where you're headed").
2. **Strength** — everything lifting (PRs, e1RM trend, volume). Absorbs Top Lifts,
   1RM, weekly volume.
3. **Running** — everything running (pace, VDOT, distance, threshold). Absorbs Avg
   Pace, VDOT, Run Cross-ref.
4. **Recovery & Load** — one screen for the whole load/recovery concept. Absorbs
   Training Status, Stress Balance, Load Focus, Recovery.
5. **Review** — the weekly/monthly story and streak. Absorbs Weekly Review, Weekly
   Summary, Monthly Report, Progress, Activity.

**Law:** each fact appears in exactly **one** place. If "did you train this week"
shows up twice, one is a bug.

---

## 5. The morning habit loop — why they come back tomorrow

Today the honest reason to return is "you're disciplined." Discipline is not a
retention strategy. V2 builds a real pull:

1. **A morning call worth reading.** A push that tells the athlete something they
   *didn't know when they went to bed*: "Recovered — today's a green light to push
   the 5K" / "You're carrying fatigue — keep it Zone 2." Forward-looking, decisive,
   one sentence. (Built entirely on the existing readiness + load engine — no LLM.)
2. **A streak that is genuinely at stake.** Not a passive counter — an active
   "you'll lose your 12-day streak unless you log today," with the existing
   freeze/repair mechanic as the safety net that makes the stakes feel *fair*, not
   punishing.
3. **A score that responds today.** Because the Score is forward-looking (§2.3),
   the user has a lever every single day. Anticipation = "what will my number do if
   I train?" That question is the habit.
4. **A weekly identity moment.** Sunday: "You held Competitor for a 3rd week —
   here's your card." Progress toward the *next* level is the long arc that survives
   any single bad day.

**Principle:** open → *see a payoff / a call / a stake* → then act. Never
open → *do homework* → maybe get a payoff.

---

## 6. One shareable moment — the only free retention channel

Helyx has no wearable and no feed, so **word of mouth is the entire growth engine**,
and today nothing is shareable. V2 ships exactly one beautiful export:

- **The Hybrid Score card:** number, level, 3 dials, a one-line identity
  ("Competitor · balancing strength & endurance"), your streak. Gorgeous, dark,
  premium — the visual language of the existing gauge card extended to a full share
  asset.
- Weekly variant: "Week in the life of a Hybrid Athlete."

If a user is proud of their number, they will post it. That is free acquisition and
free retention. Build the one thing worth posting; build nothing else social.

---

## 7. Coaching — from spreadsheet to relationship

The recommendation engine's *logic* stays (ACWR, TSB, RPE — good science). The
*voice* is rewritten:

- **Never quote the mechanism.** Kill "ACWR is 1.52." Say "You're digging a hole —
  back off today." The math earns the advice; it doesn't narrate it.
- **Remember the athlete.** "Third strong week — you're building something." "You've
  hit this wall before; last time a deload broke it." Memory is what separates a
  coach from a calculator, and the daily-history data to do it already exists.
- **One voice, one place.** The coaching sentence lives in the Score card and the
  morning push. Retire the 25 scattered "so what" lines — concentrate them where the
  eyes are.
- **Under-explain the numbers, over-invest in belief.** A coach makes you feel
  capable, not audited.

---

## 8. Premium & delight — feel like a locker room, not a terminal

- **Adopt the gauge card's language everywhere.** It's the one premium surface;
  make the whole app look like it. Retire emoji metric icons for a restrained,
  consistent icon set.
- **Calm is a feature.** Whitespace, one hero, quiet defaults, zero-flag days that
  feel serene. Density is the enemy of premium.
- **Motion with meaning.** The gauge animating yesterday→today. A level-up that
  feels earned. Haptics on real milestones. Nothing decorative.
- **Ruthless typographic hierarchy.** The number is huge. Everything else recedes.

---

## 9. The 3-month roadmap (impact-ordered, no new tech)

No wearable dependency, no AI, no LLM, no subscription. Product and UX only.

**Month 1 — Subtract (highest impact, all deletion).**
- Remove/spin out fasting. Delete the tile customiser and 20 of 25 analytics leaves.
- Collapse Home to: Score card (with action + sentence) → session → 4 tiles → 1 flag.
- Collapse 8 pillars into 3 dials (8 kept under the hood).
- *The app feels twice as premium the day this ships — before a single new feature.*

**Month 1–2 — Make the number tellable & immediate.**
- Rebuild the Score card around number + level + 3 dials + one sentence.
- "3 questions → provisional Score" onboarding so the wow is instant, not gated
  behind a week of logging.

**Month 2 — Build the morning hook.**
- Forward-looking Score ("rises to 85 if you train today").
- A morning call worth reading; a streak genuinely at stake.

**Month 2–3 — One coach with memory.**
- Rewrite coaching voice; add pattern/streak memory; kill mechanism-quoting.

**Month 3 — The shareable card.**
- One beautiful Hybrid Score / weekly identity export. The only social surface.

**Explicitly not this quarter:** more analytics, more tiles, more metrics, iOS,
billing, fasting. The job is *less*.

---

## 10. How we'll know V2 worked

| Signal | Today (honest) | V2 target |
|---|---|---|
| Surfaces on Home | ~13 competing | 1 hero + ≤3 quiet |
| Analytics screens | 25 | 5 |
| Pillars shown by default | 8 | 3 |
| "Can a user explain the app in one sentence?" | No | Yes |
| "Is there one thing to share?" | No | Yes (the Score card) |
| "A reason to open before logging?" | No | Yes (the morning call) |
| Simplicity (self-scored /10) | 2 | 8 |
| D7 / D30 retention | churns in ~2 weeks | a morning habit |

---

## 11. The one belief behind all of it

> **Helyx's engineering quality and its simplicity are the same problem.**
> A talented team is spending world-class competence *adding* when the product needs
> *subtracting*. The Hybrid Score is a genuinely great, ownable idea. V2's entire job
> is to clear everything standing in front of it — so that one number, and the
> identity of becoming a Hybrid Athlete, is the first and last thing a user feels
> every morning.
>
> Build the best hybrid athlete app in the world by having the courage to make it
> *smaller*.
