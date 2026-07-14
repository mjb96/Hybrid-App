# Helyx UI/UX Audit

**Audit date:** 14 July 2026  
**Primary viewport:** 390×844 mobile; desktop sanity check at 1280px  
**Method:** representative first-run and returning-user journeys in Chromium, accessibility-tree/geometry inspection, and source review

## UX verdict

Helyx's core interaction model is better than its feature count suggests. The user can understand the next mission, open a prescribed session, log work, and see progress without learning a novel navigation system. The bottom navigation, active-plan context, workout cockpit, and calendar-week graphs form a coherent base.

The largest UX risks are truth and accessibility, not visual taste. Several screens imply that a choice or action has stronger meaning than the data model supports: Home can show the wrong program phase, onboarding equipment can disagree with Settings, an incomplete workout receives “Session Complete,” and a one-signal readiness score can recommend a PR. At the same time, hidden dialogs remain keyboard-focusable and many controls are below comfortable touch sizes.

**Mobile UX score: 6.0/10**  
**Accessibility readiness: 4.5/10**

## Journey findings

### Onboarding

What works:

- Short, single-purpose steps with an obvious progress rhythm.
- Goal, experience, equipment, and bodyweight are expressed in user language.
- Program recommendations show commitment and equipment fit.
- The flow ends on Home with a specific first mission rather than a generic success screen.

What needs correction:

| Finding | Severity | Evidence | Recommendation |
|---|---|---|---|
| Selected goal is not durably written to `settings.fitnessGoal`. | Significant | `js/onboarding.js:_finish`; selected onboarding state versus persisted settings. | Persist the selected goal once, using the same enum consumed by recommendation and analytics copy. Add a finish-state test for every goal. |
| “Home” persists an equipment tier but leaves detailed gym equipment enabled. | Significant | Browser: Home selected; Settings then showed barbell, rack, dumbbells, cables, and pull-up equipment checked. | Derive the equipment map from the chosen tier, then let the user refine it. Show a concise confirmation on the recommendation screen. |
| Beginner can receive an Intermediate program without seeing the difficulty label. | Moderate | Beginner journey recommended Helyx Foundations; the recommendation card omitted its Intermediate classification. | Show difficulty and a one-line rationale such as “A step up, recommended because…”, or restrict default recommendations to the selected level. |
| Bodyweight uses a raw UTC date stamp. | Significant | A 14 July Sydney entry was stored as 13 July in the inspected state. | Use the canonical local-day helper for every human-entered day record. |

The onboarding should not grow. Fix the meaning of the existing controls and add disclosure, not more questions.

### Home

What works:

- The next mission is visually dominant and actionable.
- Program/week context appears before analytics.
- The page had no observed document-level horizontal overflow at 390px.
- Progressive disclosure keeps the default route more focused than the underlying feature set.

What needs correction:

- The phase label is not guaranteed to be the active program's phase. A global phase cycle appears in Home and briefing paths. This can label a week or deload incorrectly.
- Readiness and training advice should carry confidence/evidence next to the number, not only in deeper explanations.
- Empty and partial states should distinguish “no data,” “not enough data,” “planned,” and “completed.” A zero can be honest without implying the user failed.
- Fasting should remain available but should not compete with the plan/train/track hierarchy for users who have never used it.

Recommended hierarchy:

1. Next mission and active-program week.
2. Recovery/readiness only when actionable, with confidence.
3. Two “In Focus” trends.
4. Compact progress summary and deeper analytics entry.
5. Optional wellness modules based on use.

Text wireframe for the retained mobile hierarchy:

```text
┌─────────────────────────────────────┐
│ Good morning                 [sync] │
│ Helyx Foundations · Week 1          │
├─────────────────────────────────────┤
│ NEXT MISSION                        │
│ Tuesday · Hybrid Session            │
│ Intervals + 4 lifts · ~70 min       │
│                         [Start]     │
├─────────────────────────────────────┤
│ READINESS · Good · limited evidence │
│ Sleep + recent load; HRV unavailable│
├──────────────────┬──────────────────┤
│ Strength In Focus│ Running In Focus │
│ 7-day chart      │ 7-day chart      │
├──────────────────┴──────────────────┤
│ Progress summary        [See detail]│
├─────────────────────────────────────┤
│ Optional wellness, only when used   │
└─────────────────────────────────────┘
```

### Programs

What works:

- Search, fit metadata, active-program state, detail pages, plan timeline, and day preview create genuine decision support.
- “Customize” is correctly framed as making a copy rather than editing shared catalog data.
- Week-stepped preview matches the engine's resolved target instead of a decorative preview.

What needs correction:

- Mobile discovery repeats taxonomy through top tabs, filter chips, horizontal category rails, and “browse categories.” This makes breadth feel like navigation work.
- Dense horizontal chips and carousel controls often miss a 44px target.
- Commitment and difficulty need consistent placement on recommendation, library, detail, and activation-confirmation surfaces.
- Starting/switching a program during a partial workout needs a hard choice: finish/save the current session, discard it, or cancel. A warning followed by archival is not enough.
- There is no user-facing way to resume a prior activation. History is preserved internally but “return to this run” is not.

Simplify discovery to personalized recommendations, search, two or three high-value filters, and one all-programs catalog. Preserve the Plan tab; it carries more decision value than additional category rails.

### Workout cockpit

What works:

- Session context, run prescription, lift list, rest timer, plate math, substitutions, and day swipe coexist without separate app sections.
- Set completion is quick once the user understands the controls.
- Logged data is preserved when exercises are swapped.
- Source inspection confirms warm-up/add/remove-set flows, an undo snapshot for removed sets, session/run notes, previous-performance quick fill, targeted rerenders that preserve card/scroll state, and auto-advance after a finished exercise.

What needs correction:

| Problem | Observed behavior | Better behavior |
|---|---|---|
| Bodyweight entry is hidden. | Pull-Ups initially showed Weight/Reps; “Bodyweight” was behind the overflow action. | Show an explicit Bodyweight/Weighted segmented choice on applicable exercises. Default from exercise metadata, not user discovery. |
| Set shortcut is undiscoverable. | The small `S1` label contains quick-log behavior without an affordance. | Make the row or completion button the shortcut and expose the action in its label. |
| Run is misclassified. | `6×800m (90s recovery)` displayed as Recovery. | Parse interval tokens before generic words in recovery instructions; show “Intervals.” |
| Partial work celebrates completion. | One of 12 lift sets and no run produced “Session Complete / Great work today.” | Use “Save partial session” below the completion threshold; reserve celebration/adherence credit for explicit rules. |
| Advanced controls appear after completion. | “Reps left” surfaced only after a set was checked. | Keep the common path short, but allow RIR/RPE before or during the set through a labelled details affordance. |

In the observed first Pull-Up set, reaching the successful bodyweight log took four distinct actions after locating the row: open overflow, select Bodyweight, enter reps, and check complete. With an explicit default mode, the common path becomes enter reps and complete. Repeated-set speed is otherwise helped by history/ghost fill and row-level quick logging, but the latter needs a visible label.

The audit did not claim success for keyboard/inset or Android-back behavior: the browser path verified focus and scroll behavior in Chromium, while physical Android keyboard, one-hand use, and back-stack handling remain required device checks.

Touch and motion guidance:

- Make the primary tap target at least 44×44 CSS px even when the visual glyph is smaller.
- Keep swipe navigation optional and retain visible day controls.
- Honor reduced-motion settings for confetti, sheets, and chart transitions; the repo already contains reduced-motion guards that should become a shared primitive.
- Keep pinch zoom enabled.

Text wireframe for a faster bodyweight set row and honest finish state:

```text
Pull-Ups                         [Swap]
Target 3 × 8 · Rest 2:00
[ Bodyweight | Weighted ]

Set   Previous        Reps   RIR    Done
1     BW × 7          [ 8 ]  [2]    [✓]
2     BW × 6          [   ]  [ ]    [ ]
3     —               [   ]  [ ]    [ ]

[+ Warm-up] [+ Set]              [History]

[Save partial]        [Complete workout]
                      disabled until policy met
```

### Running and GPS

The product needs to communicate the state of a run as a durable session: preparing, tracking, paused, saving locally, saved, or recovery needed. Today, the UI can imply a durable save while the native store is only in memory and same-day identity can overwrite another run.

Before beta:

- Show a persistent run-session identifier/state across the JS/native boundary.
- Preserve more than one run per day.
- Warn when GPS quality is poor and distinguish filtered versus raw distance.
- Recover or clearly report an interrupted native session after process restart.
- Validate that export/save works on the Android device.

### Analytics and coaching

What works:

- Calendar week labels and zero-current-week behavior are honest.
- Strength and running detail navigators use calendar weeks.
- Hybrid Score can communicate provisional status and confidence.

What needs correction:

- Readiness needs an input count/confidence band. A high number based on one signal is not equivalent to a multi-signal score.
- “Primed for a PR,” “time trial,” and back-off recommendations need exercise/distance-specific evidence and recent completion context.
- “Lifetime PR” must mean all retained activations or be renamed “this program run.”
- Running projections should reject obvious GPS/manual outliers and distinguish a race-like effort from an arbitrary qualifying run.
- Technical load terms should be secondary explanations, not primary calls to action.

Recommended advice format:

> **Readiness: good, limited evidence**  
> Based on sleep and recent load; no HRV or resting-HR trend. Follow today's plan and keep 1–2 reps in reserve.

This is more useful than a precise score paired with an unsupported performance claim.

### Settings, import/export, and trust

Backup and deletion are trust journeys. Their success states must be stronger than ordinary toasts.

- “Export complete” should only appear after the platform confirms a file was saved/shared.
- JSON export should state that it contains app state and routes, then report route count.
- CSV should state its scope and include archived activations.
- Import should preview user/program/history/route counts, validate/migrate in memory, and require a final replacement choice.
- Account deletion and local reset must explicitly distinguish device data, cloud data, route data, and recoverable backups.

## Accessibility audit

### Confirmed issues

1. **Hidden focusable UI:** the accessibility snapshot exposed closed Workout Summary, Settings, quick-start, preview, and fasting surfaces. Thirteen inactive dialog-like containers had focusable descendants without `inert` or `aria-hidden`.
2. **Multiple modal claims:** closed off-canvas containers retain `aria-modal="true"`, so assistive technology can encounter more than one modal at a time.
3. **Target sizing:** at 390px, 115 of 129 measured visible interactive elements had at least one dimension below 44px. Not every inline link must be 44px square, but the concentration includes primary tabs, chips, bookmarks, overflow controls, and carousel dots.
4. **Tiny secondary type:** the stylesheet frequently uses approximately 0.5–0.68rem labels/hints. Low-emphasis copy still needs readable size and contrast.
5. **Celebration dialog behavior:** the dynamic celebration dialog does not establish modal semantics, focus trapping/restoration, or Escape behavior.
6. **Fragmented modal implementations:** some dialogs implement confirmation semantics properly while several sheets rely on CSS visibility alone.

### Required modal primitive

Every modal/sheet should use one shared controller that:

- sets `inert` and `aria-hidden` on inactive content;
- applies `role="dialog"` and `aria-modal="true"` only while open;
- names the dialog via `aria-labelledby` or `aria-label`;
- moves focus to a logical first control and restores it on close;
- traps Tab/Shift+Tab while open;
- closes on Escape when safe;
- supports Android back in the same close stack;
- locks background scrolling without shifting layout;
- honors reduced motion.

### Accessibility acceptance checks

- Complete onboarding, start/finish a workout, switch a program, and export using keyboard only.
- Repeat with TalkBack on the minimum supported Android version and a current Android device.
- Test 200% text size and Android display scaling.
- Verify 4.5:1 contrast for body/small text and 3:1 for large text/UI boundaries.
- Verify touch targets at 44×44 CSS px or Android's equivalent, with sufficient spacing.
- Confirm closed dialogs expose zero focusable descendants and zero active modal semantics.

## Visual system and maintainability

The visual language is recognizable—dark surfaces, accent-led actions, metric cards, and compact athletic typography—but implementation is fragmented:

- roughly 12.4k CSS lines across the principal stylesheets;
- 704 inline `style=` occurrences in HTML/JS rendering;
- 526 `!important` occurrences;
- repeated literal colors and multiple modal/card/control variants.

This does not justify a redesign. It justifies a small token and component pass after beta blockers:

1. semantic tokens for surface, text, border, state, spacing, radius, type, and motion;
2. shared button, chip, card, input, tab, modal/sheet, empty-state, and metric primitives;
3. one minimum type scale and touch-target mixin;
4. migrate only touched screens, avoiding a high-risk CSS rewrite.

## UX priorities

### Before public beta

1. Correct local-day stamps and run/session identity.
2. Make Android backup/export real and verifiable.
3. Persist onboarding choices accurately.
4. Separate partial-save from completed-session language.
5. Fix phase truth and interval classification.
6. Remove hidden dialogs from the accessibility tree.

### First beta iteration

1. Enlarge primary touch targets and small text on the core loop.
2. Add readiness confidence/evidence and remove unsupported PR claims.
3. Simplify Program discovery without reducing catalog depth.
4. Make bodyweight logging direct.
5. Add prior-activation resume/history clarity.

### Later

1. Structured prescription controls and progressive disclosure.
2. Desktop-specific planning layout, only if usage supports it.
3. Broader design-token migration.

## Screens and behavior intentionally preserved

- Home's next-mission-first hierarchy.
- The active program card and Plan timeline.
- Calendar-week analytics.
- Workout rest timer, substitution, plate math, and swipe/day controls.
- Hybrid Score's provisional/confidence framing.
- Pinch zoom and reduced-motion support.
- Explicit sync conflict choice and local snapshot recovery.

The goal is not to make Helyx smaller by deleting valuable capability. It is to make every visible promise—selected, completed, ready, saved, exported—correspond to a durable and testable fact.
