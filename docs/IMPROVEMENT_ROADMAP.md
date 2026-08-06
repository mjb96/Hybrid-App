# Helyx Product Improvement Roadmap

> Product and engineering source of truth.
>
> Reframed on **3 August 2026** around product quality rather than release
> readiness.

## 1. Product objective

Make Helyx feel like the most natural way to combine strength and running:

- obvious without being simplistic;
- fast during training;
- calm and useful outside training;
- trustworthy when interpreting progress;
- adaptable without exposing unnecessary complexity.

The active goal is **not** Play Store release. Release work is parked while the
core product is improved. The next milestone is an app that feels coherent and
effortless in repeated personal use, not an app with more features.

Helyx should answer three questions exceptionally well:

1. **What should I do today?**
2. **How do I log it with minimal friction?**
3. **Is my training working, and what should I do next?**

Everything on a primary screen must help answer one of those questions.

## 2. Current-state assessment

### What is strong

- The core training model is unusually capable: planned and one-off strength
  sessions, running, program activations, real calendar attribution, exercise
  history, bodyweight loading, swaps, supersets, timers, GPS, Health Connect,
  backups, and sync protection.
- The app has meaningful analytics rather than decorative charts: strength,
  running, recovery, load, readiness, exact workout evidence, and honest
  partial-week comparisons.
- The visual identity is established and distinctive.
- Data safety and automated verification are strong foundations.
- The program and exercise catalogues are deep enough for product work to focus
  on discovery and clarity rather than more content.

### What holds the experience back

- The product exposes too much of its capability at once. Home, Insights,
  Programs, Settings, and the workout cockpit can all become information-dense.
- The four-destination shell now uses Home / Train / Progress / Plans, but Train
  still opens directly into the workout cockpit rather than a true landing
  surface. Quick starts and recent activities need a more coherent Train home.
- Home contains several competing summaries and calls to action before the
  user reaches the answer to “what do I do now?”
- Analytics has many valid metrics but insufficient hierarchy. Users can see
  numbers without immediately knowing which matter, why they changed, or what
  action follows.
- Programs offers 57 choices before establishing a strong recommended path.
- Advanced logging controls are valuable but can visually compete with the
  basic set-completion flow.
- Some surfaces still behave like separate feature additions rather than one
  continuous interaction system.
- Non-EZ exercise technique metadata remains incomplete.
- Large modules and CSS specificity make consistent UX changes riskier than
  they should be.

### Product diagnosis

Helyx does not need a broad redesign or a new visual identity. It needs
**progressive disclosure, clearer hierarchy, fewer competing actions, and
stronger continuity between planning, training, and review**.

## 3. Opinionated product direction

These are the working decisions for the improvement programme. They can change
when usability evidence contradicts them.

### Recommended information architecture

Use four primary destinations:

1. **Home** — today, immediate coaching, and this-week orientation.
2. **Train** — planned session, quick start, active session, and recent
   activities.
3. **Progress** — strength, running, consistency, and recovery.
4. **Plans** — current plan, recommendations, programme discovery, and builder.

Profile and Settings remain accessible from the avatar. The current central
Start destination should become part of **Train** and context-aware Home actions
rather than compete with Workout in the bottom navigation.

This is a proposed structural change. Implement it behind focused browser tests
and keep existing deep links/back routes working during migration.

### Home should be a decision surface

The first viewport should contain:

- a concise greeting/date;
- one dominant Today card;
- planned session or rest-day status;
- Start, Resume, or Review as the single primary action;
- one short coaching sentence;
- a compact weekly-progress strip.

Hybrid Score, readiness, streaks, weekly charts, goals, and highlights can
remain, but below the primary decision or inside Progress. Home should not
repeat the same metric in multiple forms.

### Train should feel physical and immediate

- Planned training and quick-start modes live in one place.
- During a workout, the current exercise and next action dominate.
- Advanced controls appear when requested or when context makes them relevant.
- Inputs favour one-handed use, large targets, predictable keyboard behaviour,
  and immediate feedback.
- Finishing creates a short useful review, not another form to complete.
- Running gets an equally clear active-session mode rather than feeling like an
  attachment to the strength cockpit.

### Progress should explain, not merely report

Every analytics surface should answer, in order:

1. What changed?
2. Is the change meaningful and comparable?
3. What contributed to it?
4. What, if anything, should I do?
5. How was it calculated?

The default Progress landing page should prioritise:

- consistency and completed training;
- strength progress;
- running progress;
- training balance/recovery.

Advanced metrics remain available through drilldowns. Do not add more metrics
until the existing ones have a clear audience, hierarchy, and action.

### Plans should recommend before asking users to browse

- Lead with the active plan and its next week.
- Offer a small set of clearly explained recommendations based on goal,
  experience, schedule, and equipment.
- Keep Browse all as a secondary path.
- Explain why a plan fits, its weekly commitment, progression, and equipment
  before showing catalogue-style detail.
- Offer Simple and Advanced editing paths rather than presenting every
  programme field at once.

### Coaching should be brief, specific, and inspectable

- One primary recommendation at a time.
- Name the evidence behind it.
- State confidence when data is sparse.
- Prefer “because” over unexplained scores.
- Offer one relevant action, not several generic question chips.
- Never let coaching contradict the planned session, completion status, or
  recovery warning.

## 4. Interaction principles

Every new or revised surface must follow these rules:

1. **One obvious primary action.** Secondary actions are visually quieter.
2. **Progressive disclosure.** Show the common path first; advanced options
   remain reachable without dominating it.
3. **Direct manipulation.** Tapping the thing should edit or open the thing.
4. **Immediate feedback.** Logging, reordering, filtering, saving, and deleting
   visibly respond without requiring a refresh.
5. **Safe reversibility.** Prefer Undo and recoverable edits over repeated
   confirmation dialogs.
6. **Spatial continuity.** Closing a sheet returns focus and scroll to the
   initiating context.
7. **No gesture-only behaviour.** Swipes may accelerate an action but never be
   the only way to perform it.
8. **Natural language.** Use training language rather than storage, schema, or
   analytics jargon.
9. **Honest states.** Loading, empty, unavailable, partial, failed, and offline
   states are visually and verbally distinct.
10. **One-handed mobile use.** Frequent controls stay reachable, at least
    44px, and clear of keyboards and safe areas.
11. **Respect user attention.** Avoid decorative alerts, duplicate summaries,
    and low-value badges.
12. **Preserve identity.** Keep the current technical visual character,
    restrained orange accent, and dark/light themes.

## 5. Prioritised roadmap

Status: **ACTIVE**, **NEXT**, **LATER**, **DONE**, or **PARKED**.

## Phase 0 — Experience map and product contract

**Status: DONE 2026-08-03**

**Outcome:** a shared model of the app’s main jobs, destinations, and interface
rules before individual screens are polished in isolation.

### Tasks

- Inventory every app screen, sheet, modal, entry point, back route, primary
  action, empty state, loading state, and destructive action.
- Map these end-to-end journeys:
  - first use to first useful session;
  - open app to start/resume today’s workout;
  - quick-start strength/run/walk;
  - log, edit, finish, and review a workout;
  - understand this week’s progress;
  - choose or modify a plan;
  - find and understand an exercise;
  - recover from offline, sync, permission, or data errors.
- Classify every visible item as primary, supporting, advanced, or removable.
- Create a shared vocabulary for page headers, section titles, metric labels,
  actions, empty states, and error language.
- Record a baseline for taps, decision points, and time-to-completion on the
  core journeys.

### Completed experience inventory

The inventory below was reconciled against `index.html`, the app/action routers,
the analytics context router, programme and workout modules, automated browser
journeys, and the rendered app at 320px and 390px. It describes product
surfaces, not implementation-file ownership.

#### Primary and full-screen surfaces

| Surface | Current user job and entry | Important states/actions | Product owner |
| --- | --- | --- | --- |
| **Home** | Open app and decide what matters today | One state-aware Today card, alerts, two retained In Focus graphs, Activities; sparse-data, rest-day, completed, active-fast, warning, and offline states | **Home**. Today owns the first decision; In Focus remains the intentional weekly analytics surface and Progress owns deeper interpretation. |
| **Train** (`workout` route retained) | Start/resume a planned or one-off session and log strength/running | Day selector, schedule context, session timer, GPS/manual run, exercise/set logger, advanced set options, swap/add/reorder/superset/plate math, finish, clear; rest, empty one-off, in-progress, completed, GPS wait/failure and invalid-input states | **Train**. The new shell owns both the old Workout destination and Quick Start. A true Train landing remains future work. |
| **Progress hub** (`analytics` route retained) | Understand training history and choose a domain | Hybrid Score, Strength, Running, Recovery & Load, Review, optional Fasting, Body Weight, Projections | **Progress**. The old visible “Insights” label is retired; internal context IDs remain compatible. |
| **Progress details** | Explain a metric and expose evidence | Strength overview/stats, weekly volume, Gym Performance, exercise/muscle/metric drilldowns; Running overview/stats/performance/metric; Recovery overview/stats/performance; Review week/month; Hybrid Score; activity calendar; fasting/bodyweight/projections | **Progress**. Origin-aware Back returns to Home or Progress; entity drilldowns return to their parent and preserve calendar week. |
| **Plans library** (`program` route retained) | Continue, discover, save, compare, or create a plan | Active-plan banner, Discover/Saved/Completed, search, 16 category filters, five level filters, recommendations, collections and empty results | **Plans**. Phase 4 will lead with fit/recommendations before catalogue controls. |
| **Plan detail / active plan** | Decide whether a plan fits and inspect the current run | Overview/Structure/Plan, week/day preview, commitment/equipment, compare, save/copy/start/customise; current week/schedule and prior-run continuity | **Plans**. Preserve preview/logger prescription parity and activation isolation. |
| **Plan builder** | Create or modify a personal plan | Name/duration, days, exercise picker, order/replace/remove, weekly progression, preview/save/delete; unsaved and invalid states | **Plans**. Split Simple and Advanced paths later. |
| **Profile** | Review identity, all-time stats, active plan and achievements | Opened from Home avatar; links to plan, settings and goal editing; sparse-stat and no-plan states | **Profile**, reached from avatar rather than primary navigation. |
| **Settings** | Configure identity, units, training behaviour, equipment, notifications, appearance, backups, Health Connect and account | Long modal panel; permission unavailable, signed-out, backup unavailable, recoverable snapshot, destructive reset/delete and import-replace states | **Profile/Settings**. Preserve focus return, Android Back/Escape and explicit destructive scope. |
| **Activities list/detail** | Find exact logged strength, run and walk evidence; edit/delete a record | Filtered list, same-day separate runs, detail, route, empty history, missing route, delete with Undo | **Train** for recent activity; linked evidence also remains reachable from **Progress**. |
| **Session recap** | Review a just-finished or historical session | Completed work, comparisons, notable progress, share, route; sparse/partial session states | **Train**, with deep links into Progress evidence. |
| **Quick activity** | Track a run or walk now | GPS acquisition, live time/distance/pace, pause/resume, finish/cancel, permission/background/replay failures | **Train**. Phase 2C will give this surface parity with the strength cockpit. |
| **Onboarding and auth/restore** | Start safely with a new profile or recover existing work | Restore-first gateway, name, goal, experience/frequency/recovery/equipment, recommended plan, optional units/bodyweight, notification choice, provisional score; sign-in/import failure paths | **First use**. New setup must never obscure restore options or trap a permission denial. |

#### Visible hierarchy classification

| Surface | Primary | Supporting | Advanced / disclose on demand | Merge, move, or remove from default hierarchy |
| --- | --- | --- | --- | --- |
| **Home** | Today status + Start/Resume/Review | Greeting/date, one coaching sentence, retained Strength/Running In Focus cards | Calculation details beyond In Focus | Keep briefing/CTA/status merged into Today; remove repeated glance metrics; preserve In Focus and suppress score prominence while calibrating |
| **Train** | Current session, active exercise/set or active run, Finish | Day/session context, remaining outline, rest timer, Last performed | RPE/RIR, set type, load mode, notes, swap/add/reorder/superset, plate math | Move imports/setup out of active run; collapse completed/future exercise detail; keep alternate activity behind Quick Start |
| **Progress** | Consistency, Strength, Running, Recovery & Load headlines | Trend, interpretation, evidence link | Formula explanations, CTL/ATL/TSB, diagnostics, optional fasting | Merge overlapping Gym/Strength destinations; make Hybrid Score optional synthesis; remove equal visual weight from all eight current hub entries |
| **Plans** | Active plan and three-to-five explained recommendations | Weekly commitment, fit, sample week, progression, Browse all | Full filters, compare, complete plan, Advanced builder | Move 16 category and five level filters behind Browse all; remove repeated stats/decorative labels |
| **Profile/Settings** | Identity and entry to settings | Current goals, active plan and all-time context | Equipment map, notification tuning, integrations, backup/account controls | Group the long settings panel by job; never mix destructive data/account actions with everyday preferences |
| **Onboarding** | Restore existing data or set up a new profile; start first plan | Goal, experience, schedule/equipment fit | Units/bodyweight, notifications, score explanation | Shorten or defer optional score reveal/settings if first-session observation shows they delay training |

#### Dialog, sheet, and system-state inventory

| Group | Surfaces | Required close/recovery contract |
| --- | --- | --- |
| **Training** | Today summary, manual run logger, finish review, add exercise, exercise detail, swap exercise, clear today, workout picker, Quick Start, workout preview, rest/plate/set action disclosures | Escape/Android Back/visible Close where dismissible; commit current inputs before navigation; return focus and scroll to the trigger. Clear/discard names the exact workout and must not imply account deletion. |
| **Plans** | Create programme, activation/start-week choice, compare, builder exercise picker, programme-text fallback, programme rating | Return to the exact library/detail/builder context. Starting/restarting archives prior runs; it never edits catalogue data. |
| **Progress/profile** | Fasting detail, PR goal, settings, avatar/photo choice, celebration/share | Dismissal returns to the originating card. Optional or unavailable integrations remain skippable. |
| **Data and account safety** | Generic confirm, auth, sync conflict choose-device-version, migration recovery, import preview, pre-sync/pre-overwrite recovery, reset all data, delete account | No silent default. Explain local/cloud scope, retain recovery snapshot where supported, and require an explicit destructive verb. |
| **System feedback** | Offline status, toast, loading copy, GPS acquisition/quality, Health Connect permission, service-worker update | Loading, offline, permission-denied, partial success and failure use different language; logging remains locally safe. |

#### Duplicate and competing ownership

| Current overlap | Decision |
| --- | --- |
| Workout tab versus global Start tab | **Resolved in the shell prototype:** Train owns the planned cockpit and Quick Start; no fifth Start destination. |
| Home CTA, Morning Briefing mission and Choose another workout | Phase 1B combines status/coaching/action into one Today card. One primary action; alternate workout remains secondary. |
| Home In Focus graphs, former At-a-Glance tiles and Progress domains | **Resolved:** Home retains the two owner-preferred In Focus graphs; the repeated At-a-Glance grid is removed. Progress owns deeper comparison and calculation detail. |
| Home Activities, Progress activity calendar and session evidence | Train owns recent/history browsing. Progress links to the same exact records as evidence rather than maintaining a competing history. |
| Manual run logger, cockpit run card and GPS Quick Activity | Train distinguishes **Track now** from **Log a past activity**; the active-session hierarchy is shared in Phase 2C. |
| Active-plan banner in Plans, Home programme week and workout day selector | Plans owns plan management; Home shows only today/this-week context; Train owns session/day selection. |
| Current body weight in Settings and Body Weight history in Progress | Settings owns the profile baseline/unit; Progress owns dated entries and trend interpretation. |

### Journey map and baseline

Tap counts are the shortest current path from the named start with the needed
data already present. “Decision points” count screens/sheets where the user must
choose a path, not individual form fields. Human recognition time has not been
measured; the repeatable baseline is tap/decision count plus the visible
first-viewport evidence. Phase acceptance that specifies seconds still requires
direct usability observation.

| Journey | Current shortest path and completion | Baseline | Recovery and principal friction | Intended owner |
| --- | --- | --- | --- | --- |
| **First use → first useful session** | Restore/new gateway → name → goal → experience/equipment → choose recommended plan → optional setup → notification choice → score reveal → Home → Today | 8–10 taps after text entry; 7 decision surfaces | Back exists through setup; import/sign-in are available before creating empty data. It is capable but long, and the provisional score delays first training. | First use → Home → Train |
| **Open → planned start/resume** | Home → Start/Resume today | 1 tap; 0 intermediate decisions | Strong path. Rest/completed/unresolved-day states must never reuse the wrong action. | Home → Train |
| **Choose another strength session** | Home → Choose another workout → programme/empty/copy-past choice | 2 taps plus session choice; 1 sheet | Choice sheet is safe and activation-aware, but “planned”, “empty” and “copy past” need clearer hierarchy. | Home/Train |
| **Quick run/walk/fast** | Train → Quick start → mode | 2 taps when already in Train; 3 from another destination | The four-tab prototype removes a competing global Start destination but adds one tap from Home. A future Train landing should expose common modes without crowding the active cockpit. | Train |
| **Log → edit → finish → review strength** | Edit weight/reps → complete set; repeat → Finish Workout → Finish → recap | Normal set: 3 interactions; finish: 2 taps; 1 finish decision | Explicit validation, session persistence, Keep Training and Discard exist. Advanced controls and long scrolling compete with the active exercise. | Train |
| **Understand this week** | Home orientation → tap strength/run/readiness/volume → Progress detail/evidence | 1 tap to a detail; 1 domain decision if entering Progress directly | Accurate calendar attribution is strong; Home repeats summaries and Progress presents eight equal entry choices before interpretation. | Home → Progress |
| **Choose or modify a plan** | Plans → search/filter/recommendation → detail → Start/Customise → activation/builder | 3–6 taps before activation; 2–4 catalogue decisions | Compare, fit and safe copy exist. Sixteen category filters and 57 programmes precede a confident recommendation path. | Plans |
| **Find and understand an exercise** | Train add/swap or builder picker → search/filter → detail → select | 3–5 taps; 2 picker decisions | Shared search/detail/aliases are consistent and custom exercises are preserved. Technique metadata outside reviewed EZ-bar entries remains incomplete. | Train/Plans shared picker |
| **Recover from failure** | Offline banner/local save; GPS/Health permission message; sync choose-version modal; import preview; snapshot recovery in Settings | 1–3 decisions depending on failure | Data recovery is strong but scattered. Error copy and a single “where do I fix this?” route need standardisation. | Context first, Settings for durable repair |

### Shared product vocabulary

| Meaning | Use | Avoid or reserve |
| --- | --- | --- |
| Primary destinations | **Home, Train, Progress, Plans** | Workout/Insights/Programs as destination labels |
| Named schedule | **plan** in navigation and general guidance; **programme** when referring to a specific catalogue/builder object | Routine, template, schema |
| One performed occurrence | **session**; use **workout** for strength-oriented sessions and **activity** for cross-modality history | Day slot, record, blob |
| Begin/resume/review | **Start**, **Resume**, or **Review** according to actual state | Go to, continue when the resulting state is ambiguous |
| Persist deliberate work | **Save** for forms/imports; set completion is direct and immediate; **Finish workout/activity** ends a session | Submit, commit, sync as user-facing verbs |
| History-derived values | **Last performed** for read-only evidence; **Suggested next** for active-run progression; **Use previous values** for explicit copying | Previous target, auto-filled history |
| Empty/loading/error | “No … yet” + next action; “Loading …”; “Saved on this device”; specific failure + recovery action | Blank cards, perpetual spinners, generic “Something went wrong” |
| Destructive actions | Verb + exact object: **Discard workout**, **Delete activity**, **Reset all data**, **Delete account and cloud data** | Clear, remove, reset without scope |

### Four-destination route contract

The visible information architecture can change without a risky route rewrite:

| Stable internal target | Visible destination | Compatibility rule |
| --- | --- | --- |
| `home` | Home | Remains the default landing and owner of today’s single primary action. |
| `workout` | Train | Existing Home, programme, quick-start and resume actions continue to resolve. Train owns the Quick Start trigger. |
| `analytics` + existing context IDs | Progress | All current contexts and `app:navigate` deep links remain valid. Internal origin value `insights` is retained for compatibility; visible Back copy says Progress. |
| `program` | Plans | Programme details, active-plan view, builder, profile links and browser checks retain their current targets. |
| `profile` / `custom:settings` | Avatar surfaces | No primary nav item. Back closes the modal/subview before returning Home. |
| full-screen activity/recap and managed modals | Contextual child surfaces | Android Back/Escape closes the top child first and restores the initiating surface/focus. |

### Acceptance

- **Met:** each journey has a stated start, completion, recovery and friction.
- **Met:** every destination, important full-screen surface and modal group has a
  user job and product owner.
- **Met:** duplicate actions have an explicit owner and resolution.
- **Met:** Home / Train / Progress / Plans keeps stable internal route IDs and
  was validated against current action routes before the shell prototype.

## Phase 1 — Navigation and Home hierarchy

**Status: FOUNDATION COMPLETE — In Focus polish remains a later bounded pass**

**Outcome:** opening Helyx immediately answers what matters today.

### 1A. Navigation

- **DONE 2026-08-03:** Replaced the five-item Home / Workout / Start / Insights /
  Programs shell with four intent-led destinations: Home / Train / Progress /
  Plans. Quick Start moved inside Train, visible analytics/back copy now says
  Progress, and internal route/context IDs remain unchanged for compatibility.
- [x] Prototype the four-destination navigation.
- [x] Consolidate Workout and Start into Train.
- [x] Rename Insights to Progress.
- [x] Keep avatar access to Profile and Settings.
- [x] Preserve history/back behaviour for every analytics and programme drilldown.
- [x] Make active state, labels, and icons unambiguous at 320–412px and 200% text.

### 1B. Home

- **DONE 2026-08-03:** Replaced the full Hybrid Score hero, Morning Briefing,
  standalone workout CTA, and separate alternate-workout action with one
  calendar-day-aware Today card. It owns the first decision and does not follow
  a stale day last selected in Train.
- **DONE 2026-08-03:** Support these mutually exclusive states:
  - planned session ready;
  - session in progress;
  - session completed;
  - rest day;
  - unresolved workout from another day;
  - limited/offline data.
- **SETTLED:** a missing/corrupt active plan continues to route directly to the
  existing Plans recovery surface, which explains that history is safe and asks
  for a replacement. The pure Today model also has a no-plan fallback, but Home
  must not bypass that stronger data-recovery contract.
- [x] Combine readiness/coaching into one short contextual message.
- [x] Reduce Hybrid Score to a supporting summary unless it has enough evidence to
  explain a meaningful change.
- **OWNER DIRECTION 2026-08-03:** Keep the Strength and Running **In Focus**
  cards on Home. Their inspectable weekly bars and exact-day interaction are a
  valued part of the product, not expendable duplication.
- **DONE 2026-08-03:** Removed the four-card At-a-Glance grid because its
  Readiness, Weekly Volume, Top Lifts, and Average Pace repeated information
  already owned by Today, In Focus, and Progress.
- [x] Preserve and clarify the In Focus cards, including their exact Progress
  and activity routes.
- [x] Move repeated supporting metrics out of Home.
- [ ] Revisit In Focus visual density only as a deliberate polish pass; do not
  replace or remove the cards without owner direction.
- [x] Make Choose another workout a clear secondary action inside Today/Train.

### Acceptance

- **Needs direct observation:** a user can identify and start the intended
  action in under five seconds.
- **Met in responsive browser checks:** the first viewport has one primary
  button and the complete decision card remains visible at 320–412px.
- **Met:** no separate At-a-Glance grid repeats Today/In Focus metrics; the
  retained In Focus cards remain the intentional Home analytics surface.
- **Met in state and routing tests:** rest, completed, in-progress, and
  unresolved states cannot recommend starting the wrong
  session.
- **Met:** Home remains useful with no history and sparse data; missing/corrupt
  plans use the explicit Plans recovery surface.

## Phase 2 — Natural workout and run logging

**Status: ACTIVE**

**Outcome:** logging feels faster than remembering the workout later.

### 2A. Strength cockpit

- **DONE 2026-08-03:** Separate global Last performed history from
  activation-and-workout-day-scoped progression suggestions. New-program fields
  stay blank and historical values enter them only after **Use previous values**.
- **DONE 2026-08-05:** Make the active exercise visually dominant; collapse
  completed/future exercises while retaining a clear session overview. The
  accordion already did the dominance and collapsing; the session outline (below)
  supplied the missing "clear session overview" half.
- Design a consistent set-row interaction:
  - **DONE 2026-08-05 — previous values visible.** Last time's numbers were only
    ever an input PLACEHOLDER, so they vanished on the first keystroke — exactly
    when you want to compare against them. Each row now carries a persistent
    `Last 62.5kg × 8` line (`previousSetLabel`), from the same
    `priorPerformance.workingSets` the call site was already computing and
    `buildSetRow` was silently discarding.
  - weight and reps easy to edit;
  - **DONE 2026-08-05 — completion is the strongest row action.** Quick-log and
    the tick both complete a set, and quick-log was the loud one: a filled blue
    button beside a plain grey square. Quick-log is now a quiet outline and the
    tick is drawn as the primary control even before it is ticked. Touch targets
    unchanged at 44px — this de-emphasises, it does not shrink.
  - RIR/RPE, set type, load mode, and notes progressively disclosed *(RIR is
    already disclosed on completion via CSS; set type/load/remove sit behind the
    `⋯` control)*;
  - **DONE 2026-08-05 — invalid or incomplete input explained inline.**
    Completion previously ran a blank-check only, so `-50` and `0` reps were
    both accepted. `validateSetEntry` (`js/workout/set-entry.js`) refuses
    impossible values and warns on merely surprising ones, and the message
    renders on the offending row instead of in a toast.
- **SETTLED 2026-08-05:** ticking a set opens the rest timer (existing
  behaviour) rather than advancing focus. Keeping it: rest is the thing that
  actually happens next, and with the timer now attached to the card and
  pausable, it no longer takes the screen away from the athlete. Advancing focus
  would also fight the auto-flow accordion, which already moves on when an
  exercise finishes. Recorded as a decision, not left implicit.
- **DONE 2026-08-05:** Keep rest timing attached to the active exercise/set,
  with obvious pause/skip/adjust controls. Adjust (±30s) and skip (Done) already
  existed and the bar already re-parents into the open card; **pause did not** —
  the bar rendered a decorative "⏸ REST" label with no pause behind it.
  `toggleRestPause` makes that label the control it looked like.
- **PARTLY DONE 2026-08-05:** Make add, swap, reorder, superset, warm-up, and
  plate-math actions contextual instead of equally prominent. `+ Warmup` now
  steps aside once a working set is logged (you do not warm up after your work;
  any row can still be re-typed to a warm-up from its ⋯ menu). Superset, reorder
  and plate-math prominence are untouched.
- **DONE 2026-08-05:** Lightweight session outline above the accordion
  (`js/workout/session-outline.js` pure model + render in `js/workout.js`):
  one row per exercise with its working-set count and done/active/todo status,
  plus a summary stating remaining WORK ("4 sets left · 1 of 5 exercises done"),
  never a percentage. Tapping a row jumps to that exercise. Counting rules
  match the logger exactly — warm-ups excluded, `isCompletedSet` decides done —
  so the outline can never promise more remaining work than the card beneath it.
- Preserve all existing data and programme-target semantics.

### 2B. Session completion

**Status: ACTIVE — notable progress done 2026-08-06.**

- Replace the current completion form feeling with a concise review:
  completed work, duration, optional effort, notable progress, and one Finish
  action.
  - **DONE 2026-08-06 — notable progress.** The sheet showed two numbers and
    asked for three inputs, and could not have shown an achievement even if it
    wanted to: `updateExercisePRs()` runs inside the finish handler, after the
    sheet is populated and as it closes. `js/workout/session-review.js`
    (`buildSessionReview`, pure) computes the session's bests from the SAME
    canonical primitives the Strength screen uses — `isValidWorkingSet`,
    `estimatedE1rmForSet`, `isE1rmPr`/`E1RM_PR_EPSILON` — so a "new best" here
    can never be one the rest of the app disagrees with. Hidden entirely when
    nothing was beaten: most good sessions are not PR sessions, and a line that
    appears every time is a line nobody reads. The previous best spans archived
    program runs, so switching programs cannot hand out fresh records.
  - [ ] Remaining: the three inputs (duration, gym RPE, run RPE) still read as
    a form. Consider deferring effort capture to the recap.
- Keep notes optional and remember where they were entered.
- Explain low adherence without blocking deliberate completion.
- Make discard/delete scope unmistakable and recoverable where possible.
- Return to a useful completed state with Review workout and Progress links.

### 2C. Running

- Give active GPS/manual running its own focused session surface.
- Prioritise elapsed time, distance, pace, GPS quality, pause/resume, and Finish.
- Move imports and setup controls out of the active-session hierarchy.
- Clarify GPS acquisition, permission denial, background tracking, replay, and
  partial-route states.
- Use the user’s distance unit consistently at every boundary.

### Acceptance

- A normal working set can be logged with one edit-and-complete sequence.
- Advanced controls never obstruct basic logging.
- No keyboard covers the active input or primary action.
- Changing exercise/day/session preserves user-entered work.
- Strength and running finish flows use the same interaction vocabulary.

## Phase 3 — Progress and analytics redesign

**Status: COMPLETE except readiness-component details, which need a persisted
readiness history (see 3D) and are deferred to a data-model change.**

**Outcome:** Progress turns training history into understandable decisions.

### 3A. Progress landing page

Create four primary domains:

1. **Consistency** — sessions completed, planned versus performed, and streak
   context without shame.
2. **Strength** — comparable lift progress, volume, and muscle set credits.
3. **Running** — distance, pace, duration, and performance trends.
4. **Recovery & Load** — readiness inputs, training load, and balance.

Each domain shows one headline, one trend, one interpretation, and one link to
detail. Optional fasting analytics appear only when the user enables fasting.

- **DONE 2026-08-04:** The hub is no longer a static index of eight equal links.
  `js/analytics/progress-landing.js` (pure model) and
  `js/analytics/views/view-progress-hub.js` (presentation) render the four
  domains above, each with a headline, a like-for-like comparison, one
  plain-language interpretation and one route to its evidence.
- [x] Consistency exists as a first-class domain for the first time, built from
  real stamped dates so archived activations still count.
- [x] Hybrid Score demoted to a secondary destination (optional synthesis).
- [x] Fasting appears only for profiles with an active or completed fast.
- [x] Review is owned by the Consistency card alone — the duplicate secondary
  entry to the same screen was removed.
- [x] **DONE 2026-08-04:** domain cards now carry a labelled trend sparkline
  where an honest series exists — Consistency (training days, 8 weeks),
  Strength (the named lift's own e1RM, 12 weeks, same-exercise) and Running
  (the metric engine's weekly points). Recovery has no trend, because
  readiness keeps no history and a fabricated flat line would be worse than
  none. Fixed `spark()` while doing it: a constant series was pinned to the
  baseline, so a steady 3 sessions a week rendered identically to zero.

**Volume Guide (MEV) — DONE 2026-08-04.** The guide was the weakest analytics
surface: buried under Strength → Stats, drawn as one unlabelled bar stacking
four overlays, and described in vocabulary rather than facts.

- [x] Unified onto the single `classifyVolume` landmark classifier. The module
  had been re-implementing weaker thresholds of its own, so the guide and the
  muscle landmark report could describe identical volume differently.
- [x] Rows now carry the full MV/MEV/MAV/MRV scale and draw against an axis that
  runs to the usual ceiling, with the landmarks labelled. Previously the band
  collapsed to min–max and discarded MRV, so 30 credits against a ceiling of 26
  looked identical to a merely productive week.
- [x] Statuses state facts and distances — "4 credits below the 8–18 typical
  range", "26 credits is the usual weekly ceiling" — replacing "Below general
  reference" / "Covered". Guidance never becomes a prescription; a browser
  assertion fails the build if any status starts instructing.
- [x] Focus tab sorts by what needs attention (below range, then above ceiling,
  then in range).
- [x] Priority selects moved off the 19-row default list into their own
  Priorities tab.
- [x] Summary splits into in-range / below / above-ceiling / not-started, and
  the four buckets always sum to the focus count.
- [ ] Deferred by owner decision: per-muscle multi-week corridor charts
  (`muscleVolumeCorridor` exists but is barely surfaced) and any review of the
  landmark values themselves.

### 3B. Metric hierarchy

Classify every metric:

- **Headline:** useful to most users and actionable.
- **Supporting:** explains a headline.
- **Advanced:** useful to an informed subset.
- **Diagnostic:** visible only when explaining a model.
- **Remove/merge:** duplicates another metric or has no clear action.

Initial recommendations:

- Promote completed sessions, same-exercise estimated 1RM trend, weekly running
  volume, best sustainable pace, and readiness confidence.
- Keep CTL/ATL/TSB and formula-level values behind explanations.
- Treat Hybrid Score as an optional synthesis, not the sole definition of
  progress.
- Merge “Gym Performance”, “Strength Stats”, and overlapping strength
  destinations into a clearer Strength Progress hierarchy.
- Use Training Load and Recovery as related but distinct concepts.

### 3C. Detail-screen contract

Every metric detail includes:

- plain-language title and current value;
- date range and comparison basis;
- accessible trend visual;
- “What changed” summary;
- exact contributing activities;
- “How this is calculated” disclosure;
- honest empty, sparse, partial-week, and permission-limited states.

### 3D. Remaining model work

**Status: SUBSTANTIALLY DONE 2026-08-04 — one item deliberately not attempted.**

- [x] **Strength Performance on calendar-dated, same-exercise e1RM + exact
  evidence.** Satisfied by `strength-calendar.js` / `calendarStrengthSummary`
  (same-exercise only, identity = the lift's bare-string name) plus
  `strength-detail.js`'s evidence rows. Verified during the audit below rather
  than rebuilt.
- [x] **Recovery details** for sleep, resting HR, HRV and steps —
  `js/analytics/recovery-detail.js` + `views/view-recovery-metric.js`. Soreness
  and mood were added alongside them.
- [ ] **Readiness COMPONENTS remain undone, and not by oversight.** Readiness is
  computed on demand and no history is persisted, so a component detail would
  have no series to show. Giving it one means persisting a readiness history —
  a data-model change with sync and migration consequences, which does not
  belong inside a presentation phase. Deliberately deferred, not forgotten.
- [x] **Projection sample-size/confidence treatment** — `trendQuality` grades
  each projection on sample count AND fit, and the horizon it may claim is
  capped by that grade.
- [x] **Calendar-week/program-week audit.** Result: `running-detail.js`,
  `strength-detail.js` and `strength-volume-detail.js` contain ZERO genuine
  `state.currentWeek` reads (their `currentWeek` mentions are local period
  parameters). The only real reads are `logged-days.js`'s `resolveSlotDate`
  pair, which legitimately owns the legacy program-slot mapping used when
  writing an activity back to a program day. `tests/analytics_calendar_guard.js`
  now covers five further modules so this stays true; the extension was verified
  by planting a violation and confirming it fails.
- [x] **Edit/delete/import propagation** — `tests/analytics_propagation.test.js`
  mutates state in place (the same object identity the app mutates) and asserts
  every model recomputes: deleting a workout, editing a set weight, correcting a
  DATE so work moves week, importing a run, importing wellness readings, and
  coaching projections losing confidence as history is removed.

### Acceptance

- A non-expert can explain the main trend after reading one screen.
- No default screen requires knowledge of analytics acronyms.
- Every recommendation links to its evidence.
- Partial weeks compare like-for-like elapsed periods.
- Zero, sparse, or missing data never produces false precision.
- No new analytics metric is added without an audience and action statement.

## Phase 4 — Plans, exercise discovery, and editing

**Status: LATER**

**Outcome:** choosing and changing training feels guided rather than
catalogue-driven.

### 4A. Plans landing page

- Lead with the active plan, current week, next session, and progress.
- Show three to five recommendations with explicit “why it fits” reasons.
- Ask only for missing information needed to improve recommendations.
- Make Browse all secondary but complete.
- Reduce category-chip and collection overload.
- Let users compare no more than two or three programmes with consistent fields.

### 4B. Programme detail

- Present in this order:
  1. who it is for;
  2. weekly commitment;
  3. equipment fit;
  4. sample week;
  5. progression;
  6. full plan;
  7. Start or Customise.
- Remove repeated stats and decorative labels that do not affect a decision.
- Keep preview/logger prescription parity.

### 4C. Builder

- Introduce **Simple** editing for name, days, exercises, and broad progression.
- Keep **Advanced** editing for weekly targets, deloads, and future per-lift
  prescriptions.
- Make day selection, reorder, replace, copy, rest-day conversion, and preview
  feel direct and reversible.
- Do not introduce normalised per-lift prescriptions until an ADR covers
  migration, old workout history, exports, sync, and rollback.

### 4D. Exercises

- Complete instructions, difficulty, safety notes, muscles, movement, and
  equipment for the remaining catalogue in reviewed batches.
- Add primary-muscle and equipment browsing without exposing anatomical clutter.
- Preserve distinct identities for materially different equipment variations.
- Consider favourites and recent exercises only if they reduce repeat search.
- Keep custom exercises first-class and clearly identified.

### Acceptance

- A user can reach a suitable plan without browsing all 57.
- Plan recommendation reasons are understandable and correct.
- Common programme edits require no knowledge of the storage schema.
- Exercise search, filters, details, aliases, and custom entries behave the same
  in workout and programme flows.

## Phase 5 — Coaching and personalisation

**Status: LATER**

**Outcome:** the app adapts its presentation and advice without becoming opaque.

- Let users choose the domains they care about: strength, running, recovery,
  fasting, body weight, and advanced load metrics.
- Hide irrelevant optional surfaces while keeping them recoverable in Settings.
- Turn Morning Briefing into one recommendation with evidence and one action.
- Remember dismissed or repeatedly ignored prompts locally.
- Make recommendation confidence explicit.
- Improve goal-aware coaching only when the underlying evidence is sufficient.
- Investigate personal volume baselines after at least 6–8 stable weeks of data;
  do not label general ranges as personal limits.
- Keep all coaching deterministic or inspectable unless a future product
  decision explicitly changes that rule.

## Phase 6 — Visual system, accessibility, and performance

**Status: CONTINUOUS**

These are part of every phase, not a final polish pass.

### Visual system

- Establish a small spacing scale and use it consistently.
- Reduce unnecessary nested cards, borders, badges, and uppercase micro-labels.
- Increase minimum body/metadata legibility where the current dense style falls
  below comfortable mobile reading.
- Standardise headers, section spacing, cards, list rows, inputs, segmented
  controls, bottom sheets, dialogs, toasts, and empty states.
- Keep colour semantic: orange for restrained emphasis, red for destructive or
  genuine danger, green for completion/success, blue for information/action.
- Use motion to explain continuity, never to delay interaction.

### Mobile viewport correctness

**Status: SAFE-AREA SYSTEM DONE 2026-08-06.** Split out of the accessibility
bullet below, because "test safe areas" had been true on paper while the app
shipped controls underneath the Android status bar for months.

- **DONE 2026-08-06:** `--safe-top` / `--safe-bottom` tokens
  (`css/styles.css`, beside `--touch-target`) consult BOTH inset sources, and
  every top-anchored surface pads from them: `.view-container` (all five
  destinations), `.modal-overlay`, `.ob-step`, `.auth-overlay`,
  `.migration-recovery`, `.week-nav-bar`, plus bottom clearance on
  `.bottom-sheet`, `.profile-customiser-sheet` and `.fasting-sheet`.
- **DONE 2026-08-06:** `scripts/safe-area-browser-check.mjs` publishes a
  non-zero inset the way the Android shell does — the first check in the suite
  to do so, and the reason this class of defect was previously invisible.
- **DONE 2026-08-06:** `CACHE_NAME` now carries a content hash, so a CSS-only
  fix actually reaches installed PWA clients.
- [ ] Remaining: `--app-safe-bottom` has no publisher in `MainActivity`, so
  bottom clearance still relies on `env()` alone. Add it if a gesture-bar
  overlap is observed on device; the CSS side already consumes it.
- [ ] Remaining: landscape and keyboard-open layouts are not yet covered by the
  safe-area check.

### Accessibility

- Maintain 44px targets and zoom support.
- Test TalkBack, keyboard, Switch Access, focus return, Android Back/Escape,
  reduced motion, light/dark contrast, landscape, and 200% text.
- Ensure charts have meaningful summaries and interactive data has a non-visual
  equivalent.
- Avoid noisy live regions and unlabeled icon controls.

### Performance

- Establish baselines on representative hardware for:
  - cold and warm startup;
  - Home and Train first meaningful render;
  - opening a workout;
  - filtering 154 exercises and 57 programmes;
  - analytics over five years of history;
  - service-worker upgrade/offline startup.
- Set budgets from measured baselines.
- Optimise only demonstrated bottlenecks.
- Prefer bounded DOM, keyed updates, deferred optional work, and smaller modules
  without weakening offline behaviour.

### Maintainability

- Split `js/workout.js` by rendering, set mutations, exercise selection, run
  logging, and completion.
- Split `js/app.js` routing/event ownership.
- Continue decomposing State and Settings by domain.
- Retire the now-dormant Home tile registry/renderers after Progress confirms
  which pieces still merit reuse; retain the weekly-chart presenter used by In
  Focus.
- Reduce inline styles and specificity/`!important` hotspots.
- Add reusable view primitives only after two real surfaces share the pattern.

## 6. Cross-cutting data and reliability rules

Product improvement must not weaken these foundations:

- Local data and successful training logs are never silently overwritten.
- Programme activations never leak old workout slots into a new run.
- Calendar analytics use real dates; programme progression uses programme week.
- Warm-ups and incomplete work do not become completed training evidence.
- Exercise aliases preserve historical identity without rewriting stored keys.
- Sync, import, restore, deletion, and programme edits require recovery paths.
- An imported activity is attributed to the day it HAPPENED, from the source
  file's own timestamp — never to whichever day a screen happened to be showing.
  Imports carry an identity so re-importing the same file is refused rather than
  silently double-counted.
- Estimates remain labelled as estimates.
- Runtime JavaScript remains bundled and origin-restricted.
- Every bug fix adds the smallest useful regression test.

## 7. Product validation loop

Each shippable slice follows this loop:

1. **State the user job.**
2. **Record the current friction** with screenshots, taps, decision points, and
   failure cases.
3. **Implement the smallest coherent change.**
4. **Test the full journey**, not only the changed component.
5. **Compare before and after** at compact/mobile/desktop widths and sparse,
   normal, long-history, loading, empty, offline, and error states.
6. **Keep, adjust, or revert** based on evidence.
7. **Record the result** in the session log.

Use a small set of representative profiles:

- new user with no data;
- beginner following a simple plan;
- experienced strength-focused user;
- running-focused user;
- balanced hybrid user;
- sparse recovery permissions;
- long-history user;
- offline/local-only user;
- signed-in multi-device user;
- user returning after missed weeks.

## 8. Definition of done for a product slice

A slice is complete only when:

- the primary user job is easier or clearer;
- the common path has fewer or better decisions;
- loading, empty, offline, error, and recovery states are covered;
- mobile, text scaling, keyboard, and accessibility behaviour are verified;
- existing user work and historical data remain intact;
- unit, typecheck, smoke, precache, and relevant browser checks pass;
- the roadmap status and session log are updated;
- the change is committed as one understandable unit.

## 9. Explicitly parked

These are valid future concerns but are not active priorities:

- Play Store submission, listing assets, legal publication, and signed release
  evidence;
- iOS, Capacitor, TWA, and other shell migrations;
- subscriptions, billing, advertising, and paywalls;
- normalised Supabase session persistence;
- major framework rewrites;
- social feeds, public leaderboards, or community marketplace features;
- additional analytics families without a clear user decision;
- further catalogue expansion before discovery and metadata quality are strong.

Data-loss, security, sync-isolation, and destructive-action defects remain P0
even while release work is parked.

## 10. Delivered foundations

| Area | Current capability |
| --- | --- |
| Navigation | Four intent-led destinations — Home, Train, Progress, Plans — with stable legacy route IDs and origin-aware drilldown Back behaviour |
| Home/coaching | One state-aware Today card followed by retained Strength/Running In Focus cards; repeated At-a-Glance tiles are removed |
| Training | Planned/one-off strength, running, set logging, timers, swaps, supersets, bodyweight modes, session completion |
| Plans | 57-program catalogue, recommendations, comparison, details, timeline, editable personal copies, builder |
| Exercises | 154 canonical exercises, aliases, equipment/muscle data, filters, details, 16 fully reviewed EZ-bar entries |
| Progress | Calendar-week strength/running, exact evidence, load/readiness, weekly/monthly review, Gym/Run/Recovery detail |
| History/data | Activity history, exact deletion/undo, activation isolation, export/restore, backups, optional cloud sync/conflict UI |
| Quality | 1,312 tests, typecheck, smoke, precache/workflow gates, responsive/accessibility browser checks |

## 11. Immediate execution queue

Work in this order unless user evidence changes it:

1. **DONE — Complete the Phase 0 experience inventory and journey map.**
2. **DONE — Prototype Home / Train / Progress / Plans navigation without
   changing stored data.**
3. **DONE — Establish Home hierarchy with one Today decision card, retain the
   owner-preferred In Focus cards, and remove the repeated At-a-Glance grid.**
4. **DONE — Simplified the common strength set-row interaction.** Persistent
   previous values, inline entry validation, completion as the strongest row
   action, a pausable rest timer attached to the card, and the session outline.
   One 2A item remains: making add/swap/reorder/superset/plate-math contextual
   rather than equally prominent (only `+ Warmup` was done).
5. **DONE — Create the new Progress landing hierarchy.** Metric classification
   (3B) and the Volume Guide / MEV rebuild remain.
5a. **DONE — Rebuilt the Volume Guide (MEV) presentation.** Unified onto the
   existing `classifyVolume` classifier, full MV→MEV→MAV→MRV scale with
   labelled landmarks, factual statuses, attention-ordered focus list and
   priorities moved to their own tab.
5b. **DONE 2026-08-04 — Phase 3B metric classification.**
   `js/analytics/metric-tiers.js` classifies every metric, and Gym Performance /
   Weekly Volume merged into one Volume destination. (This entry read ACTIVE for
   two days after it shipped; the audit caught the drift.)
5c. **DONE 2026-08-06 — Mobile viewport correctness + cache busting.** Safe-area
   tokens across every surface, and a content-hashed `CACHE_NAME` so a CSS-only
   fix actually reaches installed PWA clients.
5d. **DONE 2026-08-06 — Imported-activity identity.** FIT files are dated from
   the activity's own start and a re-import is refused rather than
   double-counted.
6. **ACTIVE — Phase 2B session completion.** Replace the completion-form feel
   with a short review, keep notes optional, explain low adherence without
   blocking a deliberate finish, make discard scope unmistakable, and land on a
   useful completed state.
7. **Phase 2C running:** give the active run its own focused session surface.
8. **Rework Plans discovery around recommendations before Browse all.** Also
   surfaces the fact that the Plans landing renders 25 of 58 programmes, so a
   new programme is findable only by search.
9. **Continue exercise metadata and shared visual-system cleanup in bounded
   batches.**

Avoid parallel redesign of every screen. Each step should be usable and
testable on its own.

## 12. Session log

- **2026-08-06 — Finish review: notable progress (Phase 2B) + agent-brief and
  tooling cleanup.**
  - **The finish sheet could not have shown an achievement.** It rendered Total
    Volume and Sets Completed and asked for duration and two RPEs — two numbers
    and three inputs, which reads as a form. And `updateExercisePRs()` runs
    inside the finish HANDLER, after the sheet is populated and as it closes, so
    the one moment the athlete is looking at the screen and cares most was the
    one moment the app had nothing to say.
  - `js/workout/session-review.js` is a pure model computing the session's
    completed work and any lift that beat its previous best. It reuses the
    canonical primitives rather than recomputing: `isValidWorkingSet` (warm-ups
    and zero-rep rows are not training), `estimatedE1rmForSet` (refuses
    bodyweight/assisted/band work instead of fabricating a load) and
    `isE1rmPr`/`E1RM_PR_EPSILON` (one shared 0.5 threshold; a first-ever log is
    a BASELINE, not a record). A "new best" the Strength screen did not also
    show would be worse than showing nothing.
  - The previous best is scoped ALL and spans archived `arch:` runs on purpose:
    a personal best is a fact about the athlete, not the program, so switching
    programs must not hand out fresh records for lifts already beaten.
  - **Hidden entirely when nothing was beaten.** Most good sessions are not PR
    sessions; praise on every finish is a line nobody reads. Verified in the
    real cockpit both ways — a PR session renders "Barbell Bent-Over Row 122.5
    kg est. 1RM · +5.8", a normal session renders nothing at all.
  - Labelled as an estimate at the point of display ("Estimated from your best
    set — not a tested max"), per the cross-cutting rule.
  - **Still outstanding in 2B:** duration and the two RPE inputs still read as a
    form; discard scope wording; the completed-state links.
  - **Cleanup bundle, committed separately.** (1) CLAUDE.md and AGENTS.md are
    the same brief for two tools and had drifted — CLAUDE.md still named the
    PARKED Play-Store goal as active and denied the exercise alias layer that
    exists. Both auto-load at session start, so an agent reading the stale copy
    began from wrong facts. Kept as two full copies (a pointer would leave an
    agent with no brief if unexpanded) and pinned identical below the title by
    `tests/agent_brief_sync.test.js`. (2) `run-browser-checks.mjs` exited on the
    first failure, so one environment-sensitive check hid the ~14 behind it; it
    now runs everything and fails at the end, with `--bail` for the old loop and
    counts that describe what actually ran. (3) Roadmap §11 listed Phase 3B as
    ACTIVE two days after it shipped.
  - Verified: 1582 unit tests, typecheck, precache, workflow gates, smoke, and
    the cockpit browser checks.

- **2026-08-06 — FIT import: real dates and duplicate detection.** Two defects
  found in the repository audit. Neither had a roadmap entry, and both quietly
  corrupted the date-strict analytics the app has invested most heavily in.
  - **The importer never read the activity's start time.** `extractSessionStats`
    mapped distance, duration, HR, elevation, cadence, training effect, zones and
    laps — but not `start_time` or `timestamp`. The handler then stamped the run
    with `weeks[currentWeek].dates[selectedDay] || today`, i.e. whichever day the
    cockpit happened to be showing. Import last Tuesday's run today and it was
    logged as today, and since every weekly aggregate, streak, calendar week and
    load model attributes by the stamped date, all of them followed it.
  - **Nothing identified an activity**, so every import minted a fresh
    `newRunSessionId()` and appended. Re-importing the same file created a second
    identical run, double-counting distance and load in every total built on it.
  - Fixed by reading the activity's own start: `sessionStartTs` prefers
    `start_time` and falls back to the session `timestamp` **minus the duration**,
    because FIT writes `timestamp` at the END of a session — using it raw would
    push a late-evening run into the next day. Implausible values (pre-2000, more
    than two days ahead) are refused rather than dating an import to 1989.
  - The stored date needed no relocation work: `running-detail.js` and
    `activities/model.js` already resolve `run.localDate || week.dates[day]`, so
    stamping the session's own `localDate` is sufficient and nothing has to move
    between week/day slots — which also means an import can never re-date the
    strength work sharing that slot.
  - Dedup keys on the activity start timestamp (two activities cannot begin in
    the same millisecond), scoped to `source: 'fit'` so a live-tracked GPS run
    can never block a file import. It scans **archived `arch:<id>:<n>` weeks
    too** — a program switch moves weeks there, and without that a switch would
    silently re-enable duplicate imports of everything already logged. Proven by
    planting the naive numeric-keys-only version and watching the test fail.
  - A refused re-import is **not** reported as a failure. `extractData` gained a
    `{ handled: true }` return so the destination's specific message ("Already
    imported — logged on 2026-07-14") is not overwritten by a generic "Import
    failed", which would have been both wrong and alarming.
  - The gym import got the same date correction, but no dedup: it writes into a
    slot-scoped `gymStats[day]` object that overwrites rather than appending, so
    it never had the duplication defect.
  - **Deliberately NOT done:** no fuzzy matching between a live-tracked run and a
    later file import of the same session. That is a genuinely different and
    much less certain problem, and a false positive there would refuse a real
    import.
  - `tests/fit_import_identity.test.js` (15 tests) covers extraction from Date /
    ISO / epoch inputs, end-timestamp fallback, implausible-value rejection,
    duplicate detection across archived weeks, source scoping, malformed state,
    and all three destination outcomes.
  - Verified: 1562 unit tests, typecheck, precache, workflow gates, smoke.

- **2026-08-06 — Added Shed PPLUL (Push/Pull/Legs/Upper/Lower).** A 12-week,
  five-day intermediate program authored by the owner.
  - **Why it needed more than a catalog entry.** A program is a one-week
    `days{}` template plus `weeklyVolModifiers`, and `getWeekModifier` returns
    ONE modifier per week shared by every day. This program runs two main-lift
    progressions simultaneously — bench/squat/press on 4×8→4×6→5×4 and the
    deadlift on 3×6→3×5→4×3 — which one shared modifier cannot express.
  - Resolved with `js/programs/shed-pplul-model.js` + `progressionModel:
    'shed-pplul'`, consulted by `liftTarget` (`js/engine.js`) through the same
    declarative hook Jacked & Tan already uses. Four added lines in the engine,
    gated on a field no other program sets; a test asserts every other catalog
    program is refused by the new resolver.
  - **Not shared with J&T, deliberately.** The Simplified table is close but
    wrong here: its deadlift is 2×6 in week 4 and 3×4 in weeks 5–7 where this
    spec calls for 2×5 and 3×5, its week 12 is a single set rather than an
    assessment plus two back-offs, and it anchors main lifts on mon/tue/thu/fri
    rather than mon/wed/fri/sat. Sharing one table would also have meant a
    future edit to either program silently changing the other.
  - **No stored-shape change.** `day.lifts` stay bare strings and nothing
    per-set is persisted, so this adds no migration, sync or export surface. The
    Phase 4C ADR gate concerns *normalised per-lift prescription data*, which is
    untouched — this is a pure read-time resolver.
  - `days` and `dayExercises` are BUILT from one `DAY_PLAN` in the model, so the
    Structure preview, day-preview sheet and cockpit cannot drift apart. Verified
    in a real browser: the week-1 detail view renders 4×8 for the primaries and
    3×6 for the deadlift, both resolved through `liftTarget` — the same call the
    logger makes.
  - Accessories hold their rep range across the block (double progression adds
    reps, then load) and halve their sets only in weeks 4 and 8. Week 12 keeps
    accessories at full volume, which differs from the J&T table on purpose.
  - Added one exercise the catalogue lacked, `Band Kneeling Crunch`. The other
    28 already resolved — `Dumbbell Farmer Carry` and `Dumbbell Reverse Lunge`
    via existing aliases/canonical names.
  - **Observation, not a defect:** the Plans landing renders 25 of the now 58
    programs, so a new entry is reachable via search but not by browsing. That is
    the discovery problem Phase 4A already owns; no change made here.
  - `tests/shed_pplul_program.test.js` (20 tests) pins both progression tables
    week by week, the divergence between them in all 12 weeks, deload accessory
    scaling, per-day prescriptions for a lift appearing on two days (Pull-Up,
    EZ-Bar Curl), and that an unauthored lift falls through instead of
    inheriting a main-lift prescription.
  - Verified: 1547 unit tests, typecheck, precache, workflow gates, smoke, and
    8 browser checks including preview/logger parity and the J&T check.

- **2026-08-06 — Safe-area system + content-hashed cache name.** Two coupled
  defects found by a full-repository audit. Neither was a new regression; both
  had been shipping for months, and each was hiding the other.
  - **The status-bar bug was diagnosed correctly a year ago and fixed on ONE
    element.** `--app-safe-top` (published by `MainActivity` from the real
    window insets) existed precisely because Android only reports
    `env(safe-area-inset-top)` for a DISPLAY CUTOUT — on a notchless phone
    `env()` is 0px, so `env()` alone silently does nothing. That mechanism was
    wired to `.settings-header` and nowhere else. `.view-container` — the
    wrapper for Home, Train, Progress, Plans and Profile — consulted `env()`
    only. Measured before the fix at 390×844 with a 48px inset published:
    `.settings-header` padding-top 20px → 68px, `.view-container` 20px → **20px**,
    and the first control on Home stuck at y=26px.
  - **The occluded control was the avatar button** — `aria-label="Open your
    profile"`, the only route to Profile and Settings. So the one screen whose
    header had been fixed had become the one screen you could not reach. That is
    the detail that turned this from a polish item into the audit's P1.
  - Fixed as `--safe-top` / `--safe-bottom` tokens beside `--touch-target`,
    consumed by `.view-container`, `.modal-overlay`, `.ob-step` (first run),
    `.auth-overlay`, `.migration-recovery` (the route out of a failed
    migration), `.week-nav-bar`, and bottom clearance on `.bottom-sheet`,
    `.profile-customiser-sheet` and `.fasting-sheet`. Every site keeps its
    pre-token declaration FIRST as a fallback, so an engine that cannot resolve
    the token keeps today's clearance rather than collapsing to none.
    `.sheet-backdrop`, `.fasting-sheet-backdrop` and `.settings-overlay` were
    deliberately NOT padded: they render no content, so the content surfaces
    behind them are what had to change.
  - **Why no test ever caught it:** every browser check runs desktop Chromium,
    where BOTH inset sources are 0px, so the entire defect class was
    structurally invisible. `scripts/safe-area-browser-check.mjs` is the first
    check to publish a non-zero inset. It asserts nothing interactive lands
    above the inset across Home/Train/Progress/Plans/Profile, onboarding and
    migration-recovery at 320/360/390/412px in both themes, AND that the
    zero-inset case is unchanged so the tokens can never quietly reflow desktop.
    Proven non-vacuous by deleting the `.view-container` line and confirming
    exit 1 on all four widths.
  - **The second defect is why the first one may never have reached you.**
    Non-JS assets are cache-first and a browser only reinstalls a service worker
    whose BYTES changed, so a commit touching only CSS left `sw.js` identical:
    no reinstall, no re-`addAll`, and installed clients kept serving the old
    stylesheet indefinitely while network-first JS moved on. **Ten of the last
    twenty-three CSS/HTML commits shipped that way — including both Android
    status-bar fixes (`57d2b1e`, `7728951`).** `CACHE_NAME` now carries a
    12-hex content hash generated by `gen-precache.mjs`; `precache:check` fails
    when it is stale. This also explains the long-standing impression that the
    APK is more reliable than the PWA: the APK re-copies its bundled assets on
    every build and never consults the service-worker cache.
  - **A mistake worth recording:** while proving the cache guard bites I
    appended a probe line to `css/styles.css` and reverted it with
    `git checkout css/styles.css` — which discarded every uncommitted safe-area
    edit in that file along with the probe. Caught immediately by `git status`
    and reapplied. Subsequent revert-and-restore cycles used a file copy, not
    git. The guard itself worked correctly both times.
  - `tests/settings_safe_area_guard.test.js` → `tests/safe_area_guard.test.js`,
    widened from one element to the token contract, every consuming surface, the
    dvh caps, the native half, and a check that the browser check stays
    registered. Also added `dvh` fallbacks to `.program-workout-picker` and
    `.profile-customiser-sheet`, which had kept `vh`-only caps the
    `.bottom-sheet` comment already explains are wrong on Android.
  - Verified: 1527 unit tests, typecheck, precache, workflow gates, smoke, and
    24 browser checks (every check except `running-analytics-check.mjs`, which
    fails locally on a hardware-dependent performance threshold — 15.3s vs
    ~2.2s in CI — and was deliberately not weakened).
  - **Deliberately NOT done:** no `--app-safe-bottom` publisher in
    `MainActivity` (the CSS consumes it, but nothing reports it yet, so bottom
    clearance still comes from `env()`); no landscape or keyboard-open coverage
    in the safe-area check; no visual/spacing changes of any kind.

- **2026-08-05 — Estimated 1RM audit + correctness fixes.** Traced e1RM end to
  end (set entry → live state → completion → storage → sync → history → PR
  detection → analytics → Hybrid Brain → UI) before changing anything.
  - **Good news first, because it shaped the fix:** there is exactly ONE formula
    and one implementation (`js/strength/e1rm.js`, Epley, capped at 12 reps).
    Eleven modules import it; none reimplement it (`engine.epley1RM` is a thin
    alias). Set eligibility, exercise identity, same-date dedup, program-run
    archiving and prescription-vs-performance separation were all already sound.
    So this is a set of targeted corrections, not a rebuild — and **Epley is
    kept**, because swapping formulas would rewrite every historical chart and PR
    for a metric that is directional by design.
  - **D1 (high) — `exerciseStats.allTimeMax` only ever ROSE.** Documented as
    deliberate, but it made the field permanently wrong the first time anyone
    mistyped a load. Logging 500 for 50 and correcting it immediately pinned the
    baseline at 583 kg; deleting the workout did not help. The field is persisted
    AND synced, so the bad number followed the athlete to every device, and the
    cockpit's PR gate reads it — so no genuine PR for that lift could fire again.
    Now DERIVED from the logged sets on every call, and rebuilt on state load so
    a deletion propagates without waiting for the next logged set.
    A **legacy floor** (`legacyMax`) preserves any pre-existing max the stored
    sets cannot account for — real history for anyone whose early sessions
    predate reliable set storage — gated on an explicit `derived: true` marker.
    My first attempt inferred legacy from "old value exceeds new", which cannot
    distinguish genuine legacy from a value derived moments ago whose set was
    then deleted: it laundered every typo straight back into a permanent floor.
    Two tests caught that before it shipped.
  - **D2 (medium) — a tested single was inflated 3.3%.** Epley's algebraic form
    gives w × 31/30 at one rep, so a 100 kg single reported as 103.3 kg. The
    app's most reliable data point was its most distorted, and an actual max
    could never report as the weight actually lifted. One rep now returns the
    load itself. Recalculated dynamically — nothing stored, nothing migrated;
    single-rep points on existing charts drop 3.3% and nothing else moves.
  - **D3 (medium) — five PR sites, four different rules.** Two counted an exact
    TIE as a record (so a lift matched every week reported a PR every week), two
    required +0.5, one +0.01. All now share `isE1rmPr` / `E1RM_PR_EPSILON`.
    0.5 is chosen as a meaningfulness threshold, not a float epsilon: the
    displayed value is rounded to whole units, so a difference too small to see
    must not fire a trophy.
  - **D4 (medium) — hardcoded `kg` on PR display.** The exercise-picker chips
    rendered "225kg PR" whatever the athlete's unit. The existing guard missed
    them twice over: it did not cover `js/workout.js`, AND its pattern required a
    SPACE before `kg` so the glued `}kg` form was invisible. Widening the pattern
    also exposed three more sites in `js/brain/hybrid-score/pillars.js` that were
    already in scope. Guard verified non-vacuous by planting an offender.
  - **Deliberately NOT done:** no persisted per-estimate metadata (formula,
    version, confidence, source-set IDs). Everything is deterministically
    recalculable from the sets, so storing it would add sync surface for no gain.
    Calculation versioning only earns its place if the formula changes again.
  - **Conventions now documented in tests:** `w` is the number the athlete typed
    and is never multiplied or divided, so dumbbell/unilateral loads mean
    whatever they mean to the athlete — and the logger, the estimate and the
    display all agree. Barbell and dumbbell variants keep separate identities.
    Bodyweight/assisted/band work is refused rather than fabricated.
  - **A false alarm worth recording:** mid-verification a logged set appeared to
    vanish on reload — apparent catastrophic data loss. It reproduced on
    unmodified `main`, then turned out to be my harness: Playwright's
    `addInitScript` re-runs on EVERY navigation, so the fixture re-seeded blank
    weeks on each reload. Real persistence is fine, confirmed with a seed-once
    fixture. Checked before reporting it.
  - `tests/e1rm_correctness.test.js` (39 tests) covers the brief's rep ranges,
    eligibility rules, identity, conventions, PR detection, edit/delete
    propagation, program-switch isolation, and empty/single/malformed history.
    One assertion in `tests/engine.test.js` was changed deliberately and
    annotated: it pinned `epley1RM(60, 1) === 62`, i.e. the D2 defect itself.

- **2026-08-05 — Rest timer pause + row action prominence (Phase 2A).**
  - **A control that looked real and did nothing.** The rest bar rendered a
    decorative `⏸ REST` label with no pause behind it, beside working −30s,
    +30s and Done buttons. That is worse than having no pause: you press it,
    nothing happens, and you stop trusting the whole bar. `toggleRestPause`
    makes the label the control it appeared to be. Rest is not always
    uninterrupted — a machine is taken, someone talks to you — and the only
    options before were to watch it run out or dismiss it and lose the
    prescription.
  - The state machine's real risk is leakage, so that is what the tests pin: a
    hold carried into the next set would mean that set's rest never counts down
    at all. Cleared on both `triggerRestTimerEngine` and `dismissRestTimer`.
    Adjusting while paused deliberately stays paused — ±30s corrects the
    prescription, it is not a request to start counting.
  - **Completion is now the strongest row action.** Quick-log and the tick both
    complete a set and quick-log was the loud one — a filled blue button next to
    a plain grey square. Reversed: quick-log is a quiet outline, the tick is
    drawn as primary even unticked. Targets stay 44px; this de-emphasises rather
    than shrinks, and the browser check asserts both halves.
  - **`+ Warmup` is contextual.** It steps aside once a working set is logged.
    The capability is not lost — any row can still be re-typed to a warm-up from
    its ⋯ menu.
  - **Ticking a set keeps opening the rest timer** rather than advancing focus.
    Settled and recorded rather than left implicit: rest is what actually
    happens next, the timer no longer takes the screen away now that it is
    attached to the card and pausable, and advancing focus would fight the
    auto-flow accordion that already moves on when an exercise finishes.
  - **Two mistakes worth recording.**
    1. I first made `+ Warmup` a template branch on a `hasLoggedWork` flag. It
       worked at render and was wrong from the first tick, because ticking
       updates the DOM *without* re-rendering the card — the third time this
       session that same path has caught a change. It is now one CSS-driven
       class kept current by `refreshContextualRowActions()`, beside
       `refreshSessionOutline()`.
    2. A backtick inside an HTML comment **inside a JS template literal** closed
       the string early and killed the whole exercise-card render. Unit tests
       and typecheck both passed; only the browser check saw it, and only after
       I fixed that check to print console errors before bailing out — it was
       reporting a dozen confusing assertion failures while swallowing the one
       line that explained them.
  - `tests/rest_timer_pause.test.js` (7 tests, verified non-vacuous by planting
    the pause-leak regression) and `scripts/rest-timer-browser-check.mjs`, which
    drives the real timer: pause it, prove the clock is frozen across 1.8s,
    resume it, prove it moves again.

- **2026-08-05 — Set row: previous values and inline validation (Phase 2A).**
  Two of the set-row contract's five requirements.
  - **A data-integrity defect, not a UX one.** Completing a set only ever asked
    "is this field non-empty?", so `-50` kg and `0` reps both logged. `setVolume`
    is `parseFloat(w) * parseInt(r)`, so a negative weight **subtracts** from
    tonnage, weekly volume, muscle set credits and every MV/MEV/MAV/MRV
    comparison built on them — one mistyped minus quietly corrupting the
    analytics the app exists to provide. A zero-rep set was worse in a different
    way: it read as done in the cockpit while `isValidWorkingSet` dropped it
    from analytics, so the screen and the numbers disagreed.
  - `js/workout/set-entry.js` (pure) draws the line deliberately asymmetrically.
    Impossible values are **errors** and block the tick; merely surprising ones
    (>100 reps, >1500 load) are **warnings** that inform and get out of the way.
    An athlete really can rep 120 bodyweight squats, and a logger that argues
    with them is a logger they stop using. The weight bound is set at the loose
    (lbs) end because the app never converts units — a missed warning costs far
    less than refusing a real lift.
  - Blank weight is exempt on **bodyweight/assisted** rows, which derive their
    load from body mass and band assistance. Where the load mode is unreadable
    it defaults to `weighted` — the strict mode — so the fallback can only
    over-require, never under-require.
  - **Previous values visible.** `buildSetRow` was already being *handed*
    `previousSetData` — real work at the call site, from
    `priorPerformance.workingSets` — and threw it away. Each row now shows a
    persistent `Last 62.5kg × 8`, which stays put while typing rather than
    living in a placeholder that clears on the first keystroke. No prior set
    renders nothing at all: `-- × --` reads as data that failed to load.
  - The message renders **on the row**, replacing the old toast — a toast
    appears away from the offending field and is gone before you look up.
  - **Found by driving it, not by a test:** clearing the error was wired to
    `change`, which only fires on blur, so the complaint sat there through the
    entire retype. Moved to an `input` listener that only *clears* — re-validating
    per keystroke would flag `-` and `1.` as the number is still being typed.
  - `tests/set_entry.test.js` (25 tests) and
    `scripts/set-row-browser-check.mjs`, which drives the real cockpit and
    asserts the refused set never reaches `localStorage` — the tick bouncing
    visually would be worth little if the value were stored anyway.
  - **Still outstanding in 2A:** completion as the strongest row action (the
    blue `Log Sn` quick-log button still competes with the checkbox), the
    tick-advances-focus vs opens-rest-timer question, and making
    add/swap/reorder/superset contextual rather than equally prominent.

- **2026-08-05 — Session outline (Phase 2A).** The cockpit already collapsed
  completed and inactive exercises, but answering "how much is left?" still
  meant scrolling the accordion and counting sets by eye. Added a compact index
  above the exercise list.
  - `js/workout/session-outline.js` is a pure model (`buildSessionOutline`,
    `outlineSummaryLine`) — no DOM, no state. Its counting rules are the
    logger's own: warm-ups are not working sets and `isCompletedSet` decides
    done, so the outline and the card below it can never disagree. 15 tests pin
    that, including the degenerate cases: an empty session and a
    warm-ups-only session are NOT "complete" — congratulating someone for an
    empty workout is the failure mode worth guarding.
  - The summary states remaining work, not a percentage. "3 sets left" is
    actionable; "62%" is not.
  - Tapping a row opens that exercise, reusing the accordion's existing
    single-open invariant rather than adding a second one.
  - **Bug the browser check found, not the unit tests:** ticking a set uses a
    DOM-only update path, so the outline went stale the moment anyone logged
    anything — a wrong index being worse than none. Fixed with
    `refreshSessionOutline()` called at the top of
    `evaluateAccordionAutoFlowTransitions()`, ahead of its early return.
  - `scripts/session-outline-browser-check.mjs` drives the real cockpit and
    asserts the outline mirrors the accordion exactly (same names, same order,
    same counts), updates after a logged set, and keeps 44px rows at 320/390/412px.
    Registered in `run-browser-checks.mjs`.
  - **Still outstanding in 2A:** the set-row interaction redesign itself, the
    tick-advances-focus vs opens-rest-timer question, and making
    add/swap/reorder/superset contextual rather than equally prominent.

- **2026-08-04 — Phase 3D completion + branch consolidation.** Folded the
  recovery-details and projection-confidence branches into one and finished the
  phase's remaining model work.
  **Calendar audit.** Swept every analytics module for program-week/calendar
  conflation. Clean where it matters: `running-detail`, `strength-detail` and
  `strength-volume-detail` have no genuine `state.currentWeek` reads. Extended
  `analytics_calendar_guard` from 4 modules to 9 and proved the extension bites
  by planting a violation.
  **Propagation.** `tests/analytics_propagation.test.js` mutates state IN PLACE
  — the same object identity the app mutates, so anything memoising on identity
  rather than content would return stale data — and asserts every model
  recomputes across delete, edit, re-date, run import, wellness import and
  coaching projections.
  **Steps** added to the recovery details, completing that 3D bullet.
  **Readiness components deliberately NOT done:** readiness is computed on
  demand with no persisted history, so a component detail would have no series.
  Adding one means persisting a readiness history — a data-model change with
  sync and migration consequences that does not belong in a presentation phase.
  Verified: 1431 unit tests, typecheck, precache, workflow gates, smoke, and
  every browser gate.

- **2026-08-04 — Recovery metric details (3D).** Recovery was the only domain
  with NO inspectable metrics: Running had 30 detail screens, Strength 3,
  Recovery zero — every recovery number was `static` or `domain-only` in the
  inventory, so the new Progress hub's Recovery card drilled into a screen
  where nothing could be examined.
  `js/analytics/recovery-detail.js` registers sleep, HRV, resting heart rate,
  soreness and mood with dated series, honest period comparisons, exact
  contributing readings and stated confidence; `views/view-recovery-metric.js`
  renders them on the shared Phase 3C contract footer rather than a fourth
  hand-rolled copy. Recovery Stats gained a "Recovery signals" card row so they
  are reachable.
  Two obligations unique to this domain, both enforced by tests AND a browser
  assertion in the same fixture: **lower is better** for resting HR and
  soreness (a fall reads green there and amber on sleep — tone comes from the
  metric, never the arrow), and **self-reported vs device-measured** readings
  state different confidence instead of being presented as equally objective.
  Missing days are skipped rather than counted as zero; future-dated and
  implausible readings are excluded and counted in the footer.
  Two further fixes found by looking at the rendered screen:
  1. `.metric-range` buttons had `min-height: 36px` — below the 44px target.
     That rule is SHARED, so every range selector in Running, Strength and
     Recovery details was undersized. Raised at source.
  2. The headline showed "55 bpm" while the sentence beneath said "54.6 bpm" —
     one number, two answers. The interpretation now quotes the same formatted
     value the headline renders.
  Verified: 1409 unit tests, typecheck, precache, workflow gates, smoke, and
  `scripts/recovery-metric-browser-check.mjs` across both themes at
  320/390/412px including an empty profile.
- **2026-08-04 — Projection confidence (3D).** Projections promised ETAs with
  no statement of how much data stood behind them. Worse, the trend maths made
  the LEAST trustworthy input the most optimistic: a noisy three-week series
  (100 → 150 → 110) produced "+5/week", a faster promise than a clean six-week
  100 → 110 progression at "+2/week", and both rendered identically.
  `trailingTrend` now also computes the fit (R²) alongside the sample count,
  and `trendQuality` grades a projection high / moderate / low. The horizon a
  projection may claim is capped by that grade — 78 weeks at high confidence,
  26 at moderate, 8 at low — so a weak trend that arithmetically "reaches" a
  distant target returns no ETA rather than a guess dressed as a plan. Every
  projection carries its grade and a plain note ("Based on only 3 weeks of
  inconsistent data — a rough indication, not a forecast"), rendered as a chip
  on the Projections screen.
  Also fixed three more hardcoded `kg` sites, all in coaching text —
  `predictions.js`'s briefing line, plus the weekly and monthly review copy.
  These survived the earlier unit sweep because that guard only swept
  `js/analytics`. The guard now also covers `js/brain` **recursively**
  (`js/brain/hybrid-score/` would otherwise have stayed invisible), and was
  verified by planting a temporary offender in that subdirectory to prove it
  fails rather than passing vacuously.
  Verified: 1396 unit tests, typecheck, precache, workflow gates, smoke.

- **2026-08-04 — CI fix: the Volume merge broke a check I could not see fail.**
  `gym-performance-browser-check.mjs` waited on `#analytics-gym-performance`,
  the section Phase 3B deleted when it merged Gym Performance into the Volume
  screen. CI caught it; local runs did not, because that check was among the
  only TWO browser checks lacking the `net::ERR_` console filter every other
  check has — so behind a restrictive egress proxy it died on third-party font
  and Sentry fetches long before reaching its assertions. It had been dismissed
  as an environmental failure, which is exactly when it stopped being one.
  Fixes, in order of importance:
  1. **Root cause** — added the standard `net::ERR_` filter to
     `gym-performance`, `run-performance` and `running-analytics`, so every
     browser check is now runnable locally and this class of regression is
     catchable before CI. (running-analytics still fails locally on a genuine
     PERFORMANCE threshold — 15.3s vs CI's 2.2s on this hardware. That
     threshold was deliberately NOT weakened.)
  2. **A real product bug the check exposed** — the Home gym card, which is
     about gym activity over time, was landing on the current week's tonnage
     breakdown after the merge. Added an explicit `strength-volume-trends`
     deep link so it opens on Trends, and the check now asserts that landing
     tab rather than only the controls.
  3. The gym check keeps its unique assertions (per-range bin counts, exact
     evidence rows) and drives the merged screen the way a user does.

- **2026-08-04 — Train landing (Phase 0/2).** Train opened straight into the
  workout cockpit: a day-selector bar and an exercise list, with no answer to
  "what am I doing today, and what else could I start?". Quick start hid behind
  a sheet and recent activity was not on the screen at all.
  Train now opens on a **landing** — one dominant Today card with a single
  primary action, the four quick starts inline, and recent activity. The
  cockpit sits behind an explicit action and keeps a Back control; entering
  Train from the nav always returns to the landing, the same rule Progress
  follows. Today comes from `buildTodayCardModel`, the SAME model Home renders,
  so Train and Home can never disagree about today's session or whether it is
  finished.
  Safety: an unfinished session is never buried — the landing surfaces it as
  "In progress · Resume workout" with a visual marker, and both faces stay
  rendered so switching never tears down the cockpit's state machine mid-session.
  This changed the app's most-used path, so six existing browser checks needed
  updating to step into the cockpit rather than assume it is the tab's first
  face (core-ergonomics, modal-accessibility, workout-history, exercise-picker,
  active-program-edit, program-preview-consistency). Their assertions were kept
  intact, and core-ergonomics now additionally asserts the LANDING at 200% text.
  Verified: 1389 unit tests, typecheck, precache, workflow gates, smoke, and
  every runnable browser gate including the new
  `scripts/train-landing-browser-check.mjs`.

- **2026-08-04 — Phase 3C: one detail-screen contract.** Every detail screen
  must answer the same five questions, but Running and Strength each
  hand-rolled the "How this is calculated" footer — which is precisely how they
  drifted: Running stated Confidence, Strength did not, and neither said how
  much interpretive weight a metric deserved.
  `views/metric-contract.js` now owns that footer, so the contract is
  implemented once and enforced by a test rather than by a reviewer noticing a
  missing `<dt>`. Required rows: Source, Confidence, **How to read it** (the
  Phase 3B tier, in plain words), Included history, Excluded. A caller that
  cannot supply a field gets an honest statement ("No explicit confidence
  treatment for this metric") rather than a silently omitted row, which had
  read as "this metric has no such concern" instead of "unknown".
  Care taken not to regress on the way: running's `paceIneligible` exclusion
  category is passed through rather than dropped by the shared shape, and the
  footer takes an explicit plural because naive `+ 's'` produced "independent
  activitys". Verified: 1389 unit tests, typecheck, precache, workflow gates
  and smoke, including a test that drives BOTH real detail screens and asserts
  every contract row survives.

- **2026-08-04 — Phase 3B: metric hierarchy + merged the Volume destination.**
  Two parts.
  **(1) Classification.** `js/analytics/metric-tiers.js` classifies every metric
  as headline / supporting / advanced / diagnostic, and declares which surfaces
  each tier may appear on. An UNCLASSIFIED metric defaults to `advanced`, so a
  new metric has to earn promotion by being named rather than defaulting onto a
  primary screen. Headline is deliberately scarce — exactly four, one per
  Progress-landing domain, and a test fails if a fifth appears. Hybrid Score is
  `supporting`, not headline: a composite summarises the domains, it does not
  replace them.
  **(2) The merge.** Weekly Volume and Gym Performance were two screens
  answering "how much have I lifted" at different scopes, with no route between
  them — Gym Performance was reachable ONLY from a Home carousel card. They are
  now one **Volume** destination (`view-strength-volume.js`) with "This week"
  (day/workouts/exercises/muscles depth) and "Trends" (7D/4W/1Y across time,
  sessions, sets and volume). Both old views became body renderers that take a
  container, so no functionality was rewritten or lost. The `weekly-volume` and
  `gym-performance` contexts both resolve to the merged screen and choose the
  opening tab, so every existing entry point, Back destination and saved deep
  link keeps working. Verified: 1379 unit tests, typecheck, precache, workflow
  gates, smoke, plus `scripts/strength-volume-browser-check.mjs` proving both
  legacy deep links land on the right tab, every control from BOTH old screens
  survives, and the merged screen has one title rather than two stacked headers.

- **2026-08-04 — Progress hub trends (finishes Phase 3A).** Added a labelled
  sparkline to each domain card that has an honest series behind it:
  Consistency draws training days over 8 weeks from the same date-strict set
  as its headline, Strength follows the exact lift the headline names (12
  weeks, same-exercise — never a cross-lift line), and Running reuses the
  metric engine's own weekly points rather than computing distance a second
  way. Recovery deliberately has no trend: readiness keeps no history, and a
  flat fabricated line would imply stability nobody measured.
  Found and fixed a flaw in the shared `spark()` helper while verifying: a
  constant series has zero span, so every point was pinned to the baseline and
  a steady 3-sessions-a-week trend rendered identically to a series of zeros.
  Constant series now draw through the middle; genuine zeros still sit on the
  floor. Also replaced the Running card's empty-state copy, which was echoing
  the metric engine's internal phrasing ("0 contributing activities in the
  current scope") onto a default screen. 1366 unit tests, typecheck, precache,
  workflow gates, smoke and the browser gates all pass.

- **2026-08-04 — Analytics correctness pass.** Three defects where the app
  contradicted itself, each with a regression test.
  **(1) Two streak numbers.** Home used the date-strict `computeStreak` while
  Progress → Review → Stats rebuilt its own trained-date set by approximating
  each slot from `weekStartedAt ± currentWeek` arithmetic — so the two screens
  disagreed whenever a session moved, logging had gaps, or an activation was
  archived. Progress now consumes the canonical `computeStreak` /
  `activeTrainingDates`, which are date-strict and honour streak freezes.
  **(2) NaN heatmap cells.** Both training calendars are PROGRAM-week indexed
  but ran `parseInt` over every week key, including an archived activation's
  `arch:<id>:<n>`. That yields NaN, which slipped past the renderers' range
  guards — every NaN comparison is false — and emitted `<rect x="NaN">`.
  Builders now skip non-numeric keys via the existing `isNumericWeekKey`, and
  both renderers reject non-finite coordinates as defence in depth.
  **(3) Mislabelled weights.** Weight display had no owner, so a single screen
  could read `settings.weightUnit` for one figure and hardcode "kg" for the
  next; an lbs athlete saw both labels at once. Added `weightUnitOf` /
  `formatWeight` to `analytics/utils.js` (labelling only — the app has no
  weight conversion by design, since a set is stored in the unit it was
  entered in) and threaded the unit through the strength view, charts,
  insights, weekly review, monthly report, projections, body weight and the
  timeline table. A source guard over `analytics/views`, `analytics/charts`
  and `analytics/insights` now fails the build on a hardcoded kg suffix; it
  deliberately permits `'kg'` as a fallback *value*. Verified with an
  lbs-profile browser pass: zero stray kg across Strength overview/stats,
  Review and Projections. 1358 unit tests, typecheck, precache, workflow
  gates, smoke and the browser gates all pass.

- **2026-08-04 — Volume Guide (MEV) rebuilt on the single classifier.** The
  guide had been running its own weaker thresholds while
  `calculations/volume-landmarks.js` already owned a five-zone `classifyVolume`
  — two classification systems, with the richer one unused, so the guide and
  the landmark report could describe the same volume differently. Unified onto
  the shared classifier and kept the full MV/MEV/MAV/MRV scale in the model
  instead of collapsing it to a min–max band, which had been discarding the MRV
  ceiling entirely: 30 credits against a ceiling of 26 rendered exactly like a
  merely productive week. Rows now draw against a labelled axis running to that
  ceiling, lead with "12 of 10–20 typical", and state distances as facts —
  "4 credits below the 8–18 typical range" — instead of "Below general
  reference"/"Covered". Scheduled work that will reach the band reads as "On
  plan" rather than a shortfall. Focus sorts by what needs attention; the 19
  per-row priority selects moved to their own Priorities tab; the summary splits
  into in-range/below/above-ceiling/not-started buckets that always sum to the
  focus count. Guidance is held to description, not prescription, by both a unit
  test and a browser assertion. Verified: 1349 unit tests, typecheck, precache,
  workflow gates, smoke, and a new `scripts/volume-guide-browser-check.mjs`
  across both themes at 320/390/412px. Next: Phase 3B metric classification and
  merging the overlapping Gym Performance / Strength Stats / Weekly Volume
  destinations.
- **2026-08-04 — Progress landing hierarchy (Phase 3A).** Replaced the static
  eight-link Progress index with four live domain cards — Consistency,
  Strength, Running, Recovery & Load — each answering what changed, how it
  compares, what it means and where the evidence is, before the user taps
  anything. Split as a pure model (`analytics/progress-landing.js`) plus
  presentation (`views/view-progress-hub.js`), with readiness injected from the
  shared dashboard model so Progress and Home can never disagree about it.
  Consistency became a first-class domain for the first time, built from real
  stamped dates via `loggedDateSet`, so archived activations count and nothing
  lands on a guessed date. Hybrid Score dropped to a secondary destination,
  Fasting now appears only for profiles that actually fast, and Review's
  duplicate secondary entry was removed so the Consistency card owns it.
  **Bug found and fixed while verifying:** the DEFAULT programme's Sunday
  (`js/constants.js`) was titled "Full Rest" with desc "No lifting. No running."
  but carried `runs: "Rest execution criteria verified."`, which matched none of
  `scheduledRun`'s rest patterns — so the canonical `classifyPlannedSession`
  returned **"Run Day"** for the rest day of the programme every new user gets,
  misleading the Today card, coach and morning briefing. Set to the `"Rest"`
  convention every other programme uses, with a regression test.
  `plannedTrainingDays` now calls that canonical classifier rather than a second
  reading of `day.runs`. Verified: 1340 unit tests, typecheck, precache,
  workflow gates, smoke, plus a new `scripts/progress-hub-browser-check.mjs`
  covering both themes at 320/390/412px, 44px targets, no overflow, the empty
  profile and domain routing. Next: the Volume Guide / MEV surface — unify it
  onto the single `classifyVolume` landmark classifier it already owns but does
  not use, show the full MV→MEV→MAV→MRV scale, and replace vocabulary statuses
  with actionable ones.
- **2026-08-03 — Home Today timezone CI correction.** Made the pure Today-card
  model accept an optional display timezone so calendar-day fixtures are
  deterministic without changing the runtime default of the user's device
  timezone. Added a same-instant UTC/Sydney regression and verified every
  Today state in both process timezones. The full Node 20 verification and
  browser suites pass, including mobile layouts and preservation of both In
  Focus cards. Next: simplify the common strength set-row interaction.
- **2026-08-03 — Home analytics hierarchy, corrected by owner direction.**
  Preserved the full Strength and Running In Focus cards, including historical
  week navigation, exact-day activity taps, and Progress detail routes. Removed
  only the repeated four-card At-a-Glance grid, whose Readiness, Weekly Volume,
  Top Lifts, and Average Pace duplicated Today, In Focus, or Progress. Recorded
  In Focus as a deliberate product preference so future density work polishes
  rather than replaces it. Verified calendar attribution, exact activity
  routing, dark/light responsive layouts, and Home overflow. Next: simplify the
  common strength set-row interaction.
- **2026-08-03 — State-aware Home Today card.** Replaced the competing Home
  score, briefing, and standalone actions with one calendar-day-aware decision
  card. Added Start, Resume, Review, rest, unresolved-session, offline, and
  sparse-data behaviour; kept missing plans on the safer Plans recovery route;
  made Hybrid Score supporting only at meaningful confidence; and fixed Home
  opening a stale day last selected in Train. The browser flow also exposed and
  fixed blank one-off workouts remaining unresolved after Discard, including a
  two-dialog history race that could navigate to a blank page. Verified state
  routing, summary review, safe one-off cleanup, dark/light layouts, 44px
  targets, first-viewport fit, and no overflow at 320/390/412px. Next: replace
  the two full Home charts and repeated metric tiles with a compact weekly strip
  and one or two highlights.
- **2026-08-03 — Experience map and four-destination shell.** Completed the
  screen/modal inventory, journey baselines, action ownership, shared vocabulary
  and route-compatibility contract. Replaced the competing Workout + Start
  navigation with Home / Train / Progress / Plans, moved Quick Start into Train,
  and kept the existing internal targets so deep links and historical state were
  untouched. Verified 44px controls, no horizontal overflow from 320–412px,
  200% text, modal focus return and Progress back routing. Next: Phase 1B, a
  single Today card for Home's first viewport.
- **2026-08-03 — New-program logger progression isolation.** Traced the stale
  target to the diagnostic engine querying all exercise history and reusing the
  newest global set as a target/quick-log ghost. Scoped progression to the
  active program activation and workout day, kept global history in a quieter
  expandable Last performed panel, removed implicit history prefills, and kept
  the explicit Use previous values action. Next: continue the broader strength
  set-row simplification with this prescription/history boundary preserved.
- **2026-08-03 — Roadmap refocused on product experience.** Release readiness
  moved to the parked list. Reorganised the work around Home, Train, Progress,
  Plans, natural workout controls, understandable analytics, guided programme
  discovery, coaching, accessibility, performance, and evidence-based product
  iteration. Next: inventory all screens/actions/states and prototype the
  proposed four-destination information architecture.
- **2026-08-03 — Repository/UI/exercise review.** Reconciled implementation and
  documentation, expanded the catalogue to 16 reviewed EZ-bar variations,
  added shared exercise filtering/details, fixed obsolete service-worker CDN
  behaviour, and completed unit/browser verification.
- **2026-08-03 — Simplified Jacked & Tan option.** Added a lower-complexity
  programme while retaining the advanced version.
- **2026-07-24 — Programme editor and exercise discovery.** Added mobile
  keyboard-safe selection, preview/logger parity, active-program edit
  reconciliation, and home-gym catalogue coverage.
