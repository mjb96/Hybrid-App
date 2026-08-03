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
- Make the active exercise visually dominant; collapse completed/future
  exercises while retaining a clear session overview.
- Design a consistent set-row interaction:
  - previous values visible;
  - weight and reps easy to edit;
  - completion is the strongest row action;
  - RIR/RPE, set type, load mode, and notes progressively disclosed;
  - invalid or incomplete input explained inline.
- Test whether ticking a set should advance focus or open the rest timer without
  surprising the user.
- Keep rest timing attached to the active exercise/set, with obvious
  pause/skip/adjust controls.
- Make add, swap, reorder, superset, warm-up, and plate-math actions contextual
  instead of equally prominent.
- Add a lightweight session outline so users can see what remains without
  scrolling through every expanded control.
- Preserve all existing data and programme-target semantics.

### 2B. Session completion

- Replace the current completion form feeling with a concise review:
  completed work, duration, optional effort, notable progress, and one Finish
  action.
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

**Status: NEXT**

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

- Complete Strength Performance around calendar-dated, same-exercise estimated
  1RM and exact evidence.
- Complete recovery details for sleep, resting HR, HRV, steps, and readiness
  components.
- Add projection sample-size/confidence treatment.
- Audit every metric for calendar-week/program-week correctness.
- Verify edit/delete/import changes propagate immediately across Home, Progress,
  detail screens, coaching, and Hybrid Score.

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

### Accessibility

- Maintain 44px targets and zoom support.
- Test TalkBack, keyboard, Switch Access, focus return, Android Back/Escape,
  reduced motion, light/dark contrast, landscape, safe areas, and 200% text.
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
4. **ACTIVE — Simplify the common strength set-row interaction.**
5. **Create the new Progress landing hierarchy and metric classification.**
6. **Rework Plans discovery around recommendations before Browse all.**
7. **Continue exercise metadata and shared visual-system cleanup in bounded
   batches.**

Avoid parallel redesign of every screen. Each step should be usable and
testable on its own.

## 12. Session log

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
