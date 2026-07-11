# Helyx — User-Experience Audit (2026-07-11)

Method: the app was **actually run** in a real Chromium browser at Pixel phone size
(412×915, touch, 2× DPR), driven through real user journeys — a fresh install through
onboarding, logging a workout set-by-set, reloading mid-session, browsing programs,
and reading analytics. Findings are from observed behaviour, not code reading. This is
a *fresh-eyes usage* pass on top of an already heavily-audited app (Sprints 1–4 +
security hardening); it does **not** repeat that work.

Branch: `claude/helyx-ux-audit-6g6r4q`.

---

## 1. Journey-by-journey review

### 1. First-time experience — **strong**
Clean install boots straight into onboarding (no auth wall). Name → goal (auto-advances)
→ one combined profile screen (level · frequency · recovery · equipment) → program pick →
units → daily-coach permission → **provisional Hybrid Score reveal** in the exact card
language Home uses → Home, with a "Welcome, Alex!" moment that (correctly) fires on Home,
not a screen later. Onboarding is ~6 taps of real choice; it does not feel long.
- *Minor:* the combined profile screen defaults **equipment = Full Gym** even though the
  next screen recommends a program from it; a home-gym user must notice and switch. Two
  options, easy to change — left as-is (deferred).
- *Minor:* onboarding card is vertically centred on a tall screen, leaving large empty
  margins. Cosmetic.

### 2. Starting & completing a workout — **fixed a real friction (see §3)**
The cockpit is genuinely good: single-focus accordion, per-set WEIGHT/REPS/DONE columns,
ticking a set turns it green, **auto-starts the rest timer** (3:00, ±30s, Done) and the
session clock, reveals an inline plain-English **"Reps left"** (RIR) pad, and confirms with
a toast. Swap / warm-up / working-set / superset controls are all one tap. **But** logging
straight sets was slower than it should be, and one path fabricated numbers — fixed below.

### 3. Logging under realistic conditions — **data safety verified, one bug found**
- **Reload mid-workout survives.** Logged 42.5 kg × 8, reloaded the page, returned to the
  cockpit — the set (value + completed state) was intact. Active-workout persistence holds.
- **Wrong/decimal numbers** accept fine; `type=number` took `42.5`.
- **Empty-set honesty:** ticking a set with nothing to log correctly **bounces** with
  "Enter weight & reps first" rather than inventing a load… *except* the one-tap quick-log
  path, which still fabricated **40 × 10** (bug — fixed).

### 4. Program browsing — **fixed two strength-centric leaks**
Rich, premium library (Discover/Saved/Completed, search, goal + level filters, featured
hero, Recommended/Trending rails, categories, Build-Your-Own). Program detail has
Overview | Structure | **Plan**, and the Plan tab **does** show exact run prescriptions
("Week 1: 8×(60sec run / 90sec walk)"). **But** on a *running-only* program the
strength vocabulary leaked in — fixed below.

### 5. Returning-user Home — **clean, on-brand**
One hero (Hybrid Score gauge + 3 dials), a single coaching voice (Morning Briefing +
Mission), a day-aware primary CTA (correctly "Log a wellness check-in" on a rest day),
and a lean At-a-Glance strip. Not a dashboard of micro-metrics. No duplication observed.

### 6. Analytics & Hybrid Brain — **understandable, one jargon gap**
Insights hub is well bucketed ("One number each, then the depth"). Empty states explain
what to do ("Log a hard run … to unlock your VDOT"). **VDOT** itself is never *defined* for
a lay user — paired with "Running fitness" as a subtitle, which softens it. Deferred (a
tooltip pass), not a blocker.

### 7. Health Connect — not re-tested here (Android-native bridge; covered by prior work).

### 8. Running & GPS — not exercised in-browser (web geolocation unavailable headless;
native foreground-service path is covered by prior device-test items in `PROGRESS.md`).

### 9. Settings & 10. Native feel — spot-checked; consistent with the polished chrome.
Folded a small native-keyboard fix into the logging change (`inputmode`).

---

## 2. Issues found, ranked

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | **High** | One-tap quick-log fabricated **40 × 10** on an empty set (the manual-tick path already bounced honestly — inconsistent + a silent-data bug) | **Fixed** |
| 2 | **High** | New user / no-history exercise: straight sets required **re-typing every field** — no inheritance from the set you just did; one-tap couldn't work at all | **Fixed** |
| 3 | Medium | Running-only programs showed **"~1 sets per lift"** and **"1×8" volume badges** — meaningless strength vocabulary on a run block | **Fixed** |
| 4 | Low | Cockpit's first-time banner read **"Baseline Loading Profile Verified"** — machine jargon on a new user's first exercise | **Fixed** |
| 5 | Low | Weight/reps inputs had no `inputmode` (marginal mobile-keyboard nicety) | **Fixed** |
| 6 | Low | Onboarding equipment defaults to Full Gym; VDOT undefined; onboarding card vertical centring | Deferred |

---

## 3. Improvements implemented

**A. Straight-set inheritance + killed the 40×10 fabrication (logging — top priority).**
When a set is completed with an empty field and there's no coach target and no last-week
history, both completion paths (manual checkbox tick **and** one-tap quick-log) now carry
forward the athlete's **own nearest earlier completed set of the same kind** (warm-ups and
working sets don't cross-inherit). If there is genuinely nothing to inherit, the quick-log
path now **bounces** ("Enter weight & reps first") exactly like the manual path, instead of
logging a fabricated 40×10. The fill sets the input **value only** — never the placeholder —
so an inherited set is never banked as a "prescribed target" and E5 true-adherence scoring
stays honest (verified: persisted inherited sets carry no `tw`/`tr`). Core decision extracted
to a pure, unit-tested `pickInheritedSet(sets, idx)` in `js/workout-order.js`.

**B. Running programs no longer wear strength clothing (program browsing).**
Added a pure `programHasLifts(program)` (a program is lift-less when every day's `lifts`
is empty) and `programStats().hasLifts`. On lift-less programs the commitment strip now
shows **"3× · runs per week"** instead of the phantom "~1 sets per lift", the Plan-timeline
**"1×8" badge is suppressed** (the real prescription is the row label it already renders),
and the side-by-side compare shows "—" for Set volume instead of "~1 sets/lift".

**C. Plain-language first-exercise banner (first-use clarity).**
"Baseline Loading Profile Verified" → **"First time logging this — today sets your baseline"**.

**D. Native keyboards (native feel).** Weight input `inputmode="decimal"`, reps
`inputmode="numeric"`.

---

## 4. Improvements deferred (with reason)
- **Onboarding equipment default** (Full Gym vs the home-gym persona) — a one-tap change on
  a two-option control; low value, touches the tested onboarding flow.
- **Define VDOT** for lay users — wants a small tooltip/definition system; a coherent
  analytics-glossary pass, not a one-liner.
- **Run-program volume bars** render uniformly full (sets:1 every week) — not *wrong*, just
  flat; a proper run-volume model is scope creep beyond this pass.
- Onboarding card vertical centring — cosmetic.

---

## 5. Before → after behaviour

| Situation | Before | After |
|---|---|---|
| New user, 3×8 @ 42.5 kg, tick S2/S3 empty | Bounced ("enter weight & reps") — must re-type all 4 fields per set | S2/S3 inherit 42.5 × 8 on tick — one tap each |
| New user, one-tap quick-log S2 empty | Logged a **fabricated 40 × 10** | Inherits S1 (or bounces if nothing to inherit) |
| Couch-to-5K commitment strip | "~1 · SETS PER LIFT" | "3× · RUNS PER WEEK" |
| Couch-to-5K Plan timeline row | "Week 1: 8×(60s run/90s walk) … **1×8**" | "Week 1: 8×(60s run/90s walk)" (no phantom badge) |
| First exercise, no history | "Baseline Loading Profile Verified" | "First time logging this — today sets your baseline" |
| Weight/reps field focus (mobile) | Generic numeric keyboard | Decimal / numeric keypad |

---

## 6. Tests added (all green)
- `tests/workout_order.test.js` (+4): `pickInheritedSet` — carries the nearest completed
  set, prefers the most recent, returns null when there's nothing to inherit (first set /
  prior not completed / prior blank / null input), and does **not** cross warm-up↔working.
- `tests/program_compare.test.js` (+3): `programHasLifts` true for lifting / false for a
  run-only block; `programStats.hasLifts` flag; compare shows no "sets/lift" for a run block.

**Suite: 512 → 519 node tests, all pass. typecheck ✓, smoke ✓, precache ✓.** Each behaviour
change was also re-verified end-to-end in the real browser (inheritance on both paths, the
honest bounce, the running-program strip/timeline, reload survival).

---

## 7. Remaining product risks / unfinished
- GPS/Health Connect/notifications still need **real-device** verification (`[You]`, per
  `PROGRESS.md`) — not testable headless.
- Analytics still assume some fitness literacy (VDOT, e1RM, ACWR labels are surfaced,
  though mostly with plain-language subtitles).
- Run-program timeline volume bars are visually flat (see §4).

---

## 8. Ratings (out of 10)
- Onboarding: **8.5** — fast, honest, ends on a personalised score.
- Workout logging: **8.5** (was ~7.5 for straight-set/new-user friction) — now fast, honest, forgiving.
- Program browsing: **8** — rich and premium; running metadata now coherent.
- Home screen: **8.5** — glanceable, one voice, on-brand Garmin direction.
- Analytics: **7.5** — deep and mostly explained; a couple of undefined terms remain.
- Settings: **7.5** — organised, destructive actions separated (not deeply re-audited here).
- Native-app feel: **8** — real transitions, icon set, safe areas, timers, haptics; `inputmode` added.
- Overall retention potential: **8**.

## 9. Would I keep using it after a week?
**Yes.** The daily loop (score → mission → log → celebrate) is coherent and the logging is
now quick enough to use between sets while tired. The two logging fixes remove the friction
that would most have annoyed a home-gym lifter doing straight sets.

## 10. Next five improvements by user value
1. **Carry inheritance one step further:** when a coach target exists but the athlete
   deviates on S1, let S2+ ghost the athlete's actual S1 (today's reality) rather than the
   stale plan number — the same idea, extended to coached programs.
2. **A tiny definitions layer** for VDOT / e1RM / ACWR (tap-to-explain) so analytics serve
   non-experts.
3. **Home-gym-aware onboarding default** for the equipment control.
4. **A run-volume model** so run-program Plan bars actually show the weekly build.
5. **Rest-timer polish:** surface a subtle "next set ready" cue when it hits 0 without being
   intrusive (observed it counts down but is easy to forget mid-set).
