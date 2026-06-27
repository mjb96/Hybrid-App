# Helyx — Analytics Hub Migration & Full Product/UX/Navigation Audit

_Release audit performed as PM + UX + Mobile Eng + QA + Architect._
_Date: 2026-06-27 · Branch: `claude/analytics-hub-audit-r4hk6p`_

---

## 0. Headline finding (read this first)

The premise needs one correction, and that correction matters for the fix list:

> **"At a Glance" was NOT removed.** It is still rendered on Home
> (`index.html:391-396`, `js/home.js:76 renderGlanceGrid`). The Analytics work
> (commit `8917394`) was **purely additive** — it added an "Insights" hub
> (`#analytics-hub`) and two Home buttons. It deleted no tiles and no actions.

So the thing the user "feels" — that workflows got lost — is **real**, but it was
**not** caused by the Analytics Hub. It was caused by **two earlier changes** that
the Hub then failed to compensate for:

1. **Fasting was demoted from a dedicated Home card to a buried dashboard tile**
   (commit `bb72bcd` "Refactor fasting into a standard toggleable At-a-Glance
   tile"). It is now tile **order 17 — the very last tile** (`js/dashboard.js:919`),
   sitting *behind* five "Connect Health app" placeholder tiles. That is why
   "start a fast" feels impossible to find.

2. **A block of Home coaching UI was wrapped in `display:none` and never
   restored** (`index.html:319-334`). The deload suggestion, week-vs-week
   comparison, and engine stall-alert cards are still **computed every render**
   (`js/home.js:247-270, 468-557`) and still have **working button handlers**
   (`js/app.js:844-853`) — but the user can never see them. This is dead UI for
   three genuine features.

The Analytics Hub itself is **good and should stay** — it solved a real
discoverability problem (19 analytics sections previously reachable only by
hunting for scattered cards). The job now is to fix the regressions *around* it
and to stop mixing **actions** into an **analytics index**.

---

## Phase 1 — App inventory & maps

### 1.1 Tech shape
Vanilla-JS ES-module PWA, no framework/build step, Android WebView shell, optional
Supabase sync + Health Connect. Single `appState` in `localStorage`. One DOM, view
toggling by `.active` class. Router = `js/app.js` global `[data-action]` delegation.

### 1.2 Navigation map (4 tabs — `index.html:1640-1644`)

```
BOTTOM NAV (4)         Home 🏠   Workout 🏋️   Programs 📋   Profile 👤
                         │          │            │            │
   ┌─────────────────────┘          │            │            └─ gear → Settings overlay
   │                                 │            │               (ONLY entry to Settings)
   │                                 │            └─ Library → Detail → Active Plan → Builder
   │                                 └─ Cockpit (start workout, log sets, run, .FIT import)
   │
   └─ HOME (scroll order):
        1. Header (Helyx / Week N)
        2. "In Focus" carousel → Gym Perf (→strength)  ·  Run Perf (→running, +FAB→run logger)
        3. Brain Coach card (→recovery-score)
        4. "At a Glance" tile grid (~19 tiles, customisable/hideable)
        5. [Insights & Analytics] button  → #analytics-hub  ◀── the new hub
        6. [Activity History] button      → analytics:activity

ANALYTICS is NOT a tab. It is a hidden view reachable ONLY from Home (tiles, the
two buttons, the In-Focus cards, the Brain Coach card). Back button returns to Home.
```

### 1.3 Feature inventory (what exists today)
- **Training:** program library/detail/builder, active-plan view, week scheduler,
  workout cockpit, per-set logging, rest/session timers, deload engine, auto week-advance.
- **Running:** manual run logger (FAB), GPS live tracker, `.FIT` import (Garmin/Apple).
- **Analytics (19 sections via Hub):** weekly summary, progress/consistency, activity
  calendar, training status (ACWR), stress balance, load focus, recovery, recovery
  score, strength, 1RM/PR, running, VDOT, pace, run cross-ref, body weight, fasting,
  weekly volume, streak, goal progress.
- **Fasting:** start/stop, edit start/end, history edit, zones timeline, fasting analytics.
- **Recovery/wellness:** daily check-in (sleep/mood/soreness), readiness, HRV/RHR/sleep/
  steps/VO₂ (Health Connect).
- **Profile:** athlete profile + wellness summary + session detail; **Settings** (units,
  theme, goals, fasting default, notifications, Health Connect, import/export, reset, auth).
- **Platform:** Supabase auth/sync, schema migrations + pre-import backup, notifications,
  haptics, onboarding.

### 1.4 Orphaned / dead / disconnected code
| Item | Evidence | Status |
|---|---|---|
| **Deload suggestion card** | `index.html:325-332` inside `display:none`; logic `home.js:537-557`; handlers `app.js:844-853` | **Computed, wired, never visible** |
| **Week-compare card** | `index.html:333` inside `display:none`; logic `home.js:468-535` | **Computed, never visible** |
| **Engine stall-alert card** | `index.html:324` inside `display:none`; logic `home.js:247-270` | **Computed, never visible** |
| `data-context="weekly-volume"` / `"streak"` / `"goal-progress"` leaf sections | routed in `analytics.js:336-348` | Reachable only via tiles, **absent from the Hub index** (Hub lists 16 of 19) |
| Hidden legacy hero/sub spans | `index.html:319-323` | Intentionally hidden by graphs (OK) |

---

## Phase 2 — Analytics Hub impact assessment

| # | Feature | Previous access | Current access | Severity | Fix |
|---|---|---|---|---|---|
| A1 | **Start a fast** | Dedicated wellness/fasting card on Home | Scroll past ~16 tiles (incl. 5 greyed "Connect Health" tiles) → **last tile** → sheet → "Start Fast". Tile is **hideable** → can reach **zero** entry points. | **Critical** | Add a persistent "Start Fast / active-fast" control near top of Home; raise fasting tile order; pin fasting tile (non-hideable) |
| A2 | **Deload suggestion (Apply/Dismiss)** | Visible Home card | **None** — parent `display:none` | **Critical** | Move `#homeDeloadSuggestionCard` out of the hidden wrapper |
| A3 | **Week-vs-week comparison** | Visible Home card | **None** — hidden | High | Move `#homeWeekCompareCard` out of hidden wrapper |
| A4 | **Engine stall alerts** | Visible Home card | **None** — hidden | High | Move `#homeEngineAlertCard` out of hidden wrapper |
| A5 | **Analytics as a destination** | (always was Home-only) | Still Home-only; not in bottom nav | Medium | Promote Analytics/Insights to a nav tab (see Phase 5) |
| A6 | **Wellness check-in** | — | Home → Insights → Recovery → Recovery Score → form (**4 taps**, `view-recovery.js:500-558`) | High | Surface a "Check-in" CTA on Home/Profile |
| A7 | **Two different "Fasting" entries** | one fasting surface | Tile (`custom:fasting` → start sheet) **and** Hub "Fasting" (`fasting` → read-only analytics). Same label, different behaviour. | Medium | Rename hub entry "Fasting Insights"; let it deep-link a "Start fast" button |

**Net:** the Hub *improved* analytics discoverability (19 scattered → 1 index) but
*did not* give back the lost **actions** (start fast, see deload, check in). It is an
**index of charts**, and the app quietly relies on it as the home for actions too.

---

## Phase 3 — Critical action audit (taps from cold Home)

| Action | Taps | Visibility | Discoverability | UX | Verdict |
|---|---|---|---|---|---|
| Start a fast | 2 taps **+ long scroll past dead tiles** | 1/5 | 1/5 | 2/5 | 🚩 **Excessive** |
| End a fast | 2 (active fast shows in tile) | 3/5 | 3/5 | 4/5 | OK |
| Start workout | 2 (Workout tab → Start) | 4/5 | 4/5 | 4/5 | Good |
| Log a run | 1 (Run card FAB `index.html:365`) | 4/5 | 3/5 | 4/5 | Good |
| Log weight | 2–3 (bw tile → view → Log) | 2/5 | 2/5 | 3/5 | Weak |
| Wellness check-in | **4** | 1/5 | 1/5 | 3/5 | 🚩 **Buried** |
| View today's progress | 1 (Today tile → modal) | 3/5 | 3/5 | 4/5 | Good |
| Open analytics / trends | 1→2 (Insights → section) | 4/5 | 4/5 | 4/5 | Good (Hub win) |
| View goals | 2 (goal-progress tile/hub) | 3/5 | 2/5 | 3/5 | OK |
| Update profile / Settings | 2 (Profile → gear `athlete-profile.js:105`) | 2/5 | 2/5 | 3/5 | Weak (single hidden entry) |
| Add exercise | 2 (Workout → +Add) | 4/5 | 4/5 | 4/5 | Good |
| Add food / water / measurement / progress photo | — | — | — | — | **Not implemented** (see Phase 4/7) |

**Rule-of-thumb breaches:** _start a fast_ and _wellness check-in_ are
high-frequency habit actions stuck behind 2–4 taps and heavy hunting.

---

## Phase 4 — Feature regression analysis

**Lost (built, no longer reachable):**
- Deload suggestion + Apply/Dismiss (A2) — `index.html:325`
- Week comparison (A3) — `index.html:333`
- Engine stall alert (A4) — `index.html:324`

**Hidden (reachable but undiscoverable):**
- Start a fast (A1) — last tile behind Health-Connect placeholders
- Daily wellness check-in (A6) — 4 taps deep inside Recovery analytics
- Body-weight logging — only inside `bodyweight` analytics view
- Settings — single entry via Profile gear

**Broken / confusing:**
- Dual "Fasting" meaning (A7)
- Hub omits 3 of 19 sections it claims to index ("Every metric… in one place",
  `index.html:639`): **weekly-volume, streak, goal-progress** have leaf views
  (`analytics.js:336-348`) but no Hub link.

**Underutilised (exists, low surfacing):** training status / ACWR, load focus,
run cross-reference, VDOT — all solid analytics buried one level below the Hub with
no Home signal.

**Worth restoring first:** A1, A2 (both Critical), then A3/A4/A6.

---

## Phase 5 — First-time-user navigation review

- **Can a new user tell what the app does?** Partly. Home leads with charts ("In
  Focus" analytics, Brain Coach, metric tiles) before any **action**. It reads as a
  dashboard to *look at*, not a tool to *use*.
- **Can they start core functionality fast?** Workout: yes. Fast: no. Check-in: no.
- **Buried:** start-fast, check-in, settings, half the analytics depth.
- **Too many taps:** fasting, check-in.
- **Missing shortcuts:** no global "+" / quick-action affordance; no Analytics tab.
- **Is the Hub helping?** **Helping** for analytics; **not the cause** of the action
  problems, but it absorbed actions it shouldn't own.

**Proposed navigation redesign (low-risk, high-impact):**
1. **Promote Analytics to the 4th/5th nav slot** (it's currently a hidden view) so
   "Insights" is a first-class destination, not a Home-only button.
2. **Add a Home quick-action row** (Start/!Resume Fast · Check-in · Log Weight)
   directly under the header, above "In Focus".
3. **Re-tier the tile grid:** real data tiles first, Health-Connect placeholders
   collapsed into a single "Connect Health app" tile, and **pin Fasting high**.
4. Keep the Hub; split it visually into **"Do" (actions)** vs **"See" (analytics)**.

---

## Phase 6 — Mobile / native-feel review

(The prior `SENIOR_REVIEW.md` already shipped the hover/selection/tabular-number
fixes — those remain valid.) Remaining, migration-relevant:

- **Empty states sell "website".** Five Health-Connect tiles render "Connect Health
  app · Setup" (`dashboard.js:783-908`) as full-size tiles even when the user will
  never connect — dead grey real estate that pushes Fasting off-screen.
- **Tile grid has no skeleton→content transition continuity**; `renderTileContent`
  swaps innerHTML (`home/tile-renderers.js`), fine, but error tiles silently show
  "Error" with no retry.
- **No gesture to reach Analytics** (no swipe, no tab) — it's tap-only from Home.
- **Touch targets:** hub links and tiles are fine; `fhr-edit-btn` (✏) and rest-adjust
  buttons are near/below 44px.
- **Scroll position:** recently fixed (commit `4df5343`) — keep.
- **Recommendation:** collapse HC placeholders; add a real quick-action row;
  give tiles a long-press → "Customise/Hide" affordance (discoverability of the
  existing customiser, which is currently an "Edit" text button only).

---

## Phase 7 — Product opportunities (ranked)

| Rank | Opportunity | Impact | Effort | User value | Priority |
|---|---|---|---|---|---|
| 1 | Home quick-actions (Start Fast / Check-in / Log Weight) | High | **<1 day** | High | **P0** |
| 2 | Restore deload/compare/alert cards | High | **<1 day** | High | **P0** |
| 3 | Pin + reorder Fasting tile; collapse HC placeholders | High | <1 day | High | **P0** |
| 4 | Promote Analytics to a nav tab | High | ~1 day | Med | P1 |
| 5 | Add weekly-volume/streak/goal-progress to Hub | Med | <½ day | Med | P1 |
| 6 | "Do vs See" split in Hub; rename Fasting→Fasting Insights | Med | ~1 day | Med | P1 |
| 7 | Onboarding that ends on a *first action* (start fast / log) not a dashboard | High | ~3 days | High | P2 |
| 8 | Habit loop: streak nudges + check-in reminder already in notifications — wire a Home prompt | Med | ~2 days | High | P2 |
| 9 | Measurements / progress-photo logging (net-new; no backend today) | Med | ~1 wk | Med | P3 |

---

## Phase 8 — Executive summary

### Critical (fix before shipping)
1. **A1 — Start-a-fast is effectively lost.** Last tile, behind 5 dead placeholders,
   hideable. → quick-action + pin/reorder tile.
2. **A2 — Deload suggestion is dead UI.** Computed + wired, hidden by a parent
   `display:none`. → unwrap `#homeDeloadSuggestionCard`.

### Functionality lost in the broader migration (restore list)
A1 start-fast affordance · A2 deload card · A3 week-compare card · A4 stall-alert
card · A6 surfaced wellness check-in. (A2–A4 are a single 3-line markup move.)

### Quick wins (<1 day)
- Move `#homeEngineAlertCard`, `#homeDeloadSuggestionCard`, `#homeWeekCompareCard`
  **out of** the `display:none` wrapper (`index.html:319-334`). _One edit, three
  features back._
- Change Fasting tile `order: 17 → ~2` and set it non-hideable (`dashboard.js:919`).
- Add Hub links for weekly-volume / streak / goal-progress (`index.html:642-680`).
- Collapse the 5 disconnected Health-Connect tiles into one "Connect" tile.

### Medium (<1 week)
- Home **quick-action row** (Start/Resume Fast · Daily Check-in · Log Weight).
- **Promote Analytics to a nav tab**; keep Home buttons as secondary.
- Hub "Do vs See" split + Fasting rename/deep-link.
- Surface a one-tap **Daily Check-in** from Home/Profile.

### Major
- Action-first **onboarding**; habit-loop nudges; measurements/progress-photo module.

### Recommended roadmap
- **Sprint 1 (this release):** all Quick Wins + A1 quick-action. Pure restores/markup.
- **Sprint 2:** Analytics nav tab, check-in surfacing, Hub Do/See split.
- **Sprint 3:** onboarding redesign + habit nudges.
- **Backlog:** measurements/photos, nutrition if strategically desired.

---

### Appendix — exact targets for the P0 fixes
- `index.html:319` — the `<div style="display:none;">` wrapping the 3 live cards. Pull
  `#homeEngineAlertCard`, `#homeDeloadSuggestionCard`, `#homeWeekCompareCard` out so
  their own `style.display` toggles (set in `home.js`) take effect.
- `js/dashboard.js:911-947` — Fasting tile config; bump `order`, and have
  `home.js:renderGlanceGrid`/`dragdrop` treat it as pinned.
- `js/dashboard.js:770-981` — HC tiles (`hrv/resting-hr/sleep/steps/vo2max`): gate
  behind `healthConnect.connected` or fold into one placeholder.
- `index.html:642-680` — Hub groups; add the 3 missing leaf links.
- Nav: `index.html:1640-1644` + `app.js:104-122` — add an `analytics` `nav-item`
  (the `view-analytics` panel and routing already exist).
</content>
</invoke>
