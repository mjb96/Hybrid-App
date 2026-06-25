# Hybrid Engine — Full Platform Audit

**Audited revision:** `claude/fitness-app-full-audit-qj25bw` (HEAD `5a1194f`)
**Date:** 2026-06-25
**Reviewer roles:** Architecture · Staff Eng · UX · Performance · QA · Product
**Codebase:** ~27k LOC vanilla ES-module PWA + Capacitor-less native Android WebView wrapper.
**Test status at audit time:** `node --test` → **139 / 139 passing** (calc layer only; zero DOM/integration tests).

> **Goal of this audit:** identify what stops this from feeling like Garmin Connect / COROS /
> TrainingPeaks / Athlytic, and give a concrete, file-level path to get there.

---

## TL;DR — the five things that matter most

1. **🔴 The native health integration is dead code.** JS calls `window.HybridAndroidBridge.*`
   (settings.js:519,535) but the Android interface is registered as `HybridHealthBridge`
   (MainActivity.kt:147) with a completely different method surface (`readHealthDataByDay`,
   `requestPermissions`, `notifyRestComplete`…). **No JS file references the real bridge.**
   Result: Health Connect "connect" always silently falls back to *placeholder data*
   (settings.js:524-531), the 8-hour `HealthSyncWorker` feeds nothing the UI reads, and
   backgrounded rest-timer notifications never fire. Every recovery/readiness metric a user
   sees on a fresh install is fabricated. This is the single biggest blocker to "commercial."

2. **🔴 Timezone is hardcoded to `Australia/Sydney`** (dates.js:14). Every "today", streak,
   calendar day and date-key is computed in Sydney time for *all* users worldwide. A user in
   London logging an evening workout can have it land on the wrong calendar day, breaking
   streaks, the activity calendar, and "today" detection.

3. **🔴 First-run crash risk + lossy schema migration in the state loader.** `appState` literal
   has no `settings` key (state.js:26-54); `baseDefaults` (which does) is only merged *if
   localData exists* (state.js:376-378). A brand-new user hits `appState.settings.avatarDataUrl`
   (state.js:429) → `TypeError`. The shallow `{...baseDefaults, ...localData}` merge also means
   **new nested keys added in future versions never reach returning users** — there is no real
   migration layer.

4. **🟠 Persistence is heavy and chatty.** `saveStateToLocalStorage` (called from **81 sites**)
   is `async`, recomputes the *entire* CTL/ATL timeline on every call (state.js:317), serializes
   the whole state blob to `localStorage` synchronously, then does a network `getSession()` +
   `upsert` of the full state to Supabase. Several flows save twice in a row.

5. **🟠 God files + render-by-innerHTML.** `workout.js` (1,275 LOC), `app.js` (1,241),
   `dashboard.js` (994). UI is rebuilt with full `innerHTML` string replacement (218 occurrences
   across 32 files) and per-render `addEventListener` attachment — no diffing, no virtualization,
   listeners re-bound on every hydrate.

The good news: the **analytics calculation layer is genuinely strong** — pure, well-factored,
unit-tested functions (CTL/ATL EWMA, ACWR, VDOT, Daniels race predictors, HRV baselines). The
*science* is mostly sound; the problems are integration, data plumbing, and polish.

---

# PHASE 1 — Architecture & Data Flow

## 1.1 High-level map

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Android shell (WebView)  — android/app/.../MainActivity.kt                │
│   • Loads BuildConfig.APP_URL via WebViewAssetLoader (appassets origin)    │
│   • addJavascriptInterface(HybridHealthBridge, "HybridHealthBridge")       │
│   • HealthSyncWorker (every 8h)  • predictive back  • geo perm  • download  │
│        ▲  (JS↔native contract BROKEN — see §1.6)                            │
└────────┼─────────────────────────────────────────────────────────────────┘
         │
┌────────┴─────────────────────────────────────────────────────────────────┐
│  index.html (1,805 lines — ALL screens/modals inline) + 3 CSS files        │
│  <script type="module" src="js/app.js">                                    │
└────────┬─────────────────────────────────────────────────────────────────┘
         │
┌────────┴───────────────── js/app.js  (ROUTER / ORCHESTRATOR) ─────────────┐
│  • global document click/change/blur/input/keydown delegation             │
│  • switchGlobalAppTab → hydrateCurrentView → renderHome/Workout/Analytics… │
│  • bootstrapApp(): checkActiveSession → pullEngineDataFromStorage → render │
│  • initXxx(getState, …) dependency injection into every feature module     │
└───┬───────────────┬──────────────┬───────────────┬──────────────┬─────────┘
    │               │              │               │              │
┌───┴───┐    ┌──────┴─────┐  ┌─────┴──────┐  ┌─────┴──────┐  ┌────┴────────┐
│ state │    │  workout   │  │ analytics  │  │   home /   │  │  programs/  │
│ .js   │    │  .js       │  │  .js +     │  │ dashboard  │  │  library    │
│(store)│    │ (cockpit)  │  │ views/*    │  │            │  │  catalog/*  │
└───┬───┘    └────────────┘  └─────┬──────┘  └────────────┘  └─────────────┘
    │                              │
    │  ┌───────────────────────────┴───────────────────────────────┐
    │  │ calculations/ (pure)  scoring/  metrics/  brain/  charts/   │
    │  └─────────────────────────────────────────────────────────────┘
    │
┌───┴──────────────── PERSISTENCE ──────────────────────────────────────────┐
│ localStorage  'hybrid_engine_v2_state'  → entire appState blob (JSON)      │
│ Supabase      table user_data(user_id, state_data jsonb)  → same blob      │
│ IndexedDB     HybridTrainingDB / runMaps  → GPS coords keyed "week_day"    │
└───────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Major modules

| Domain | Entry | Notable |
|---|---|---|
| Bootstrap/router | `app.js` | event delegation, tab switching, device-import wiring |
| State store | `state.js` (+ `state/auth.js`, `state/import-export.js`, `state/supabase.js`) | single mutable `appState`, save = localStorage + cloud |
| Schema | `schema.js` | v1→v2 program materialization, WeakMap-memoized, non-destructive |
| Workout cockpit | `workout.js` | set logging, supersets, RPE, quick-log, finish-session |
| Engine | `engine.js` | 1RM (Epley), diagnostics, set prescription, deload suggestion |
| Analytics | `analytics.js` + `analytics/**` | 13 view modules, pure calc/scoring layers, SVG charts |
| Brain | `brain/load_models.js`, `briefing.js`, `recommendations.js` | CTL/ATL, sRPE, daily briefing |
| Programs | `programs/**` | catalog (6 categories), library, detail, builder, drag-drop |
| Home | `home.js`, `dashboard.js`, `home/**` | tiles, glance grid, weekly graph, activity calendar |
| Fasting | `fasting.js`, `fasting/**` | sessions, insights, achievements, education |
| Recovery/health | `settings.js` (HC toggle), `analytics/calculations/recovery-calcs.js` | **integration broken** |
| Native | `android/**` (Kotlin) | WebView host, Health Connect bridge, sync worker |
| GPS | `gps-tracker.js`, `workout-map.js`, `db.js` | Leaflet maps, IndexedDB coords |
| Garmin | `garmin.js` | `.FIT` file parsing via `fit-file-parser` from esm.sh |

## 1.3 Dependencies between modules

- **`state.js` is the hub** — imported by nearly everything; it in turn imports `engine`,
  `schema`, `constants`, `brain/load_models`, `programs/catalog`, and the three `state/*` subs.
- Feature modules avoid importing `state.js` directly for the *store* and instead receive
  `getState`/`saveState` accessors via `initXxx(...)` from `app.js` (good — reduces cycles).
  But many still `import { showToast } from './state.js'` (re-export), creating incidental coupling.
- `engine.js` re-exports the entire `metrics/*` surface (engine.js:421-433) — a façade that hides
  where calculations actually live and encourages reaching through engine for unrelated things.
- **Circular-import avoidance is manual and fragile**: `auth.js` takes a callback to call
  `pullEngineDataFromStorage` instead of importing it (auth.js:11). Works, but it's a smell that
  the store boundary isn't clean.

## 1.4 Critical execution paths

1. **Boot** — `bootstrapApp` (app.js:1207): `determineDefaultCalendarDay → checkActiveSession
   (3s race) → pullEngineDataFromStorage (4s cloud race) → verifyWeekStorageSchema →
   setCockpitActiveDay → switchGlobalAppTab → applySettingsOnBoot → checkForAutomaticWeekAdvance →
   initNotifications → onboarding`. Everything is gated behind a single `try/catch` that swallows
   fatal errors with a console line (app.js:1227) — a crash here yields a blank app, not a message.

2. **Log a set** — input/checkbox → `updateInputState`/`toggleGymCheckLoggingState` →
   `commitWorkoutUIState` → `saveStateToLocalStorage` → (recompute load + localStorage + cloud).

3. **Switch program** — `applyProgramSwitch` (app.js:175): `mergeWeekSchema → save →
   hydrateCurrentView` (note: `hydrateCurrentView` itself calls `verifyWeekStorageSchema` again).

4. **Render a tab** — `hydrateCurrentView` (app.js:198) re-verifies schema then full-renders the
   active view via `safeRenderExecution` (swallows render errors per-view).

## 1.5 State, storage & analytics

- **State:** one module-level mutable object `appState` (state.js:26). Mutations are direct
  (`appState.x = …`) followed by an explicit `saveStateToLocalStorage()`. No reactivity — the UI
  is re-rendered imperatively by whoever mutated. `activeTab`/`selectedDay` are separate
  module-level vars with setter functions.
- **Storage:** the whole state is one JSON blob in `localStorage` *and* mirrored as one `jsonb`
  row per user in Supabase `user_data`. GPS polylines are split out to IndexedDB (`db.js`) keyed
  `"{week}_{day}"`. There is no per-entity storage, no indexes, no pagination.
- **Analytics:** computed on demand from `appState.weeks`. The calc layer (`analytics/
  calculations/*`, `metrics/*`, `scoring/*`, `brain/*`) is **pure and tested**. CTL/ATL is
  persisted (`appState.loadMetrics`) and recomputed from the full timeline on every save
  (load_models.js:208). Everything else is recomputed per render.

## 1.6 Garmin & native interaction — **the broken seam**

- **Garmin (`.FIT`)**: works in-browser. `garmin.js` loads `buffer` + `fit-file-parser` from
  `esm.sh` at runtime (network dependency, not in the SW precache — **fails offline**), parses
  sessions/laps/records, recursively hunts for a session object, converts semicircle GPS to
  degrees, and calls back into `app.js` which writes runs/gymStats and saves the polyline to
  IndexedDB. Reasonable, but brittle (see Phase 2).

- **Android ↔ JS contract is mismatched (flagship bug):**
  - Native exposes `window.HybridHealthBridge` with `getAvailabilityStatus()`,
    `requestPermissions(typesJson, cbId)`, `readHealthData(...)`, `readHealthDataByDay(...)`,
    `notifyRestComplete(title, body)`, `saveTextFile(...)` (HybridHealthBridge.kt:110-225).
  - JS only ever looks for `window.HybridAndroidBridge?.requestHealthConnect` /
    `?.syncHealthConnect` (settings.js:519,535) and `window.__onAndroidBack` (called by native,
    but never *defined* by JS — back always falls through to "press back twice to exit").
  - `grep` across `js/` for `HybridHealthBridge`, `__hcCB`, `readHealthDataByDay`,
    `notifyRestComplete`, `saveTextFile` → **0 hits.**
  - **Consequences:**
    1. Health Connect connect/sync are placebo (`hc.connected = true` with demo data).
    2. `notifyRestComplete` is never invoked → no rest-timer notification when the screen is off
       (the JS only does Web Audio + haptics, which the OS suspends in background).
    3. `saveTextFile` is reachable only incidentally through the WebView download listener for
       `data:` URLs (export works), but the bridge's richer API is unused.
    4. `HealthSyncWorker` (8h) reads Health Connect natively but nothing carries it into the JS
       `appState.healthConnect.*` arrays the recovery views read.

> This is the #1 architecture finding. The native and web halves were built to two different
> contracts and never integrated. Until fixed, "recovery/readiness" is decorative.

---

# PHASE 2 — Bug Hunt

Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low

### 🔴 B1 — First-run TypeError / settings never defaulted
**Files:** `js/state.js:26-54, 376-378, 429`
**Root cause:** the exported `appState` literal omits `settings`. `baseDefaults` (which defines
`settings`) is only spread when `localData` exists. A fresh install (no localStorage, no cloud)
skips the merge, then `if (!appState.settings.avatarDataUrl …)` dereferences `undefined`.
**Effect:** boot throws inside `pullEngineDataFromStorage`; the `bootstrapApp` catch swallows it,
so schema verification, sub-module wiring (`initAuth`/`initImportExport`) and the
`app:storage-loaded` event never fire → broken first launch for some users.
**Fix:** always seed defaults: `appState = { ...baseDefaults, ...(localData || {}) }`, and make
`settings` deep-merge (`settings: { ...baseDefaults.settings, ...(localData?.settings||{}) }`).

### 🔴 B2 — Hardcoded timezone for all users
**Files:** `js/dates.js:14-25` (and every caller of `todayKey`/`dateKey`)
**Root cause:** `DEFAULT_TZ = 'Australia/Sydney'`. `todayKey()` formats `new Date()` in Sydney.
**Effect:** streaks (`logActivityForStreak` state.js:469), the activity calendar, "today" in the
cockpit/summary, and wellness `today` lookups (recovery-calcs.js:266) all use a foreign calendar
day. Worst near midnight and for Western-hemisphere users (can be a full day off).
**Fix:** default to the device zone: `Intl.DateTimeFormat().resolvedOptions().timeZone`, with an
optional Settings override. Persist the chosen zone so historical keys stay stable.

### 🔴 B3 — Native health bridge contract mismatch (see §1.6)
**Files:** `js/settings.js:519,535`; `android/.../HybridHealthBridge.kt`; `MainActivity.kt:147,187`
**Effect:** all Health Connect data is fake; background rest notifications never fire; back-button
handler `__onAndroidBack` undefined.
**Fix:** implement a single JS health-bridge module that (a) feature-detects
`window.HybridHealthBridge`, (b) calls `getAvailabilityStatus`/`requestPermissions`/
`readHealthDataByDay` with the `window.__hcCB[callbackId]` callback protocol, (c) maps results
into `appState.healthConnect.{hrv,restingHR,sleep,steps}`. Define `window.__onAndroidBack` to
close modals/return tabs. Call `window.HybridHealthBridge.notifyRestComplete(...)` from the rest
timer when `document.hidden`.

### 🔴 B4 — Lossy state migration (no schema versioning)
**Files:** `js/state.js:376-378, 410-429`
**Root cause:** shallow spread merge + ad-hoc `if (!appState.x)` patching. Nested objects
(`settings`, `healthConnect`, `programLibrary`, `streakData`) are taken wholesale from stored
data; any *new* sub-key shipped in a later version is absent for existing users, and the patch
block only covers a hand-maintained subset.
**Effect:** silent feature breakage after updates (e.g. a new `settings.fooEnabled` reads
`undefined`), and divergence between local and cloud copies.
**Fix:** introduce `appState.schemaVersion` and an ordered `migrations[]` runner; deep-merge
defaults; write a single `normalizeState(raw)` used by both local load and import.

### 🟠 B5 — `loadComponent` ignores its own "ATL/CTL ratio" intent for readiness
**Files:** `js/analytics/scoring/readiness-scoring.js:45-55`
**Root cause:** comment says ACWR but it uses raw `atl/ctl` from EWMA values where ATL (7-day) and
CTL (28-day) are different-horizon EWMAs — their ratio is *not* the standard ACWR (which is
rolling-sum acute ÷ rolling-mean chronic). With both seeded at 0 and identical daily input, the
ratio trends to ~1.0 regardless of actual spikes, compressing the load signal.
**Effect:** "load" readiness component is biased toward "optimal" and under-responsive to genuine
overreaching. **Fix:** compute ACWR from `recoveryCostBalance` (acute=this week, chronic=4-week
mean) and feed *that* ratio; keep EWMA TSB (`ctl-atl`) as a separate "form" signal.

### 🟠 B6 — ACWR "chronic" = single previous week
**Files:** `js/brain/load_models.js:119-133`
**Root cause:** `chronic = costs[idx-1]` (last week only) instead of the 3–4 week rolling mean the
ACWR model requires. One light week inflates next week's ACWR into the "danger" band.
**Effect:** spurious deload suggestions (`shouldSuggestDeload` engine.js:406 keys off `atl/ctl`),
noisy stress-balance view. **Fix:** `chronic = mean(costs[idx-4 .. idx-1])` (guard <4 weeks).

### 🟠 B7 — Garmin GPS scaling guard is wrong-signed for valid semicircles
**Files:** `js/garmin.js:175-176`
**Root cause:** `if (Math.abs(lat) > 180) lat = lat * (180/2^31)`. Valid Garmin latitudes are
stored as *semicircles* (e.g. −419, with magnitude up to ~10⁹) so the guard usually fires; but a
device that already emits **degrees** with a momentary |value|≤180 (legit) is left unscaled while
one that emits raw semicircles near the equator (small magnitude? no—semicircles are always
large) — the real risk is the inverse: any record where the parser already returns degrees but
the value is large (>180 is impossible for degrees) is fine. The genuine bug is **no validation
that the result is in range** afterward, so a corrupt record injects an off-map point that
distorts the whole polyline and distance.
**Effect:** occasional spike points / wrong map. **Fix:** scale unconditionally when the source is
known-semicircle, then **drop** any `[lat,lng]` outside `[-90,90]/[-180,180]`.

### 🟠 B8 — `recomputeLoadMetrics` on every save (perf + correctness coupling)
**Files:** `js/state.js:317`, `js/brain/load_models.js:208`
**Root cause:** every `saveStateToLocalStorage` rebuilds the full daily timeline across *all*
weeks and re-runs two EWMAs. With 80+ save sites and frequent autosaves while typing set weights,
this is O(weeks×7) on the keystroke path. It also means load metrics silently change shape if
`weekStartedAt` drifts. **Fix:** memoize by a cheap hash of `weeks`+`weekStartedAt`; recompute
only on session finish / import, not on every field edit.

### 🟠 B9 — Double save on common flows
**Files:** `app.js:178-179` (`mergeWeekSchema`→`saveStateToLocalStorage`), `app.js:686-688`
(`saveStateToLocalStorage` then `verifyWeekStorageSchema` which can mutate but isn't re-saved),
`state.js` setters that save then callers save again.
**Effect:** two full serialize+network round-trips; in B-while-typing cases, redundant toasts
suppressed but cloud upserts doubled. **Fix:** consolidate to one save at the end of a user action.

### 🟠 B10 — `pullEngineDataFromStorage` overwrites local with cloud unconditionally
**Files:** `js/state.js:402-404`
**Root cause:** if cloud responds within 4s, `appState = { ...baseDefaults, ...cloudData }` even
when local is newer (e.g. user trained offline, cloud is stale). No `updatedAt`/version compare.
**Effect:** last-writer-wins by *fetch timing*, not by recency → silent data loss across devices.
**Fix:** store `updatedAt` in state; pick the newer of local/cloud; reconcile `weeks` by union.

### 🟡 B11 — Import has no schema validation / no migration / no backup
**Files:** `js/state/import-export.js:82-105`
**Root cause:** import accepts any JSON with `currentWeek` + non-empty `weeks`, spreads it over a
4-key base, and overwrites live state with no `normalizeState`, no version check, and **no
pre-import backup**. A malformed or older export can brick the app or drop data silently.
**Fix:** run the same `normalizeState`/migration as load; snapshot current state to a
`hybrid_backup_*` key before replacing; validate types.

### 🟡 B12 — CSV export breaks on quotes/newlines and lift-id keys
**Files:** `js/state/import-export.js:35-80`
**Root cause:** notes only strip commas/newlines (not quotes); the `Exercise` column writes the
raw `lift` *key* (which may be an opaque `lift_xxxx` id from the identity map, engine.js:63) not
the display name. **Effect:** unreadable exercise names in exports; CSV injection risk
(`=`,`+`,`@` prefixes unescaped). **Fix:** RFC-4180 quoting; resolve `getLiftDisplayName`; prefix
guard for formula characters.

### 🟡 B13 — `streakData` day diff uses local `new Date(yyyy-mm-dd)` (UTC parse) vs Sydney keys
**Files:** `js/state.js:477-483`
**Root cause:** `todayKey()` is Sydney-formatted, but `new Date(today)` parses the `YYYY-MM-DD`
as **UTC midnight**, then `setHours(0,0,0,0)` shifts to local — mixing two zones in one diff.
**Effect:** off-by-one streak increments/resets around midnight. **Fix:** compute day deltas with
the pure `daysBetween(a,b)` helper already in dates.js (which parses both as UTC).

### 🟡 B14 — `checkForAutomaticWeekAdvance` uses wall-clock `Date` subtraction across DST
**Files:** `js/app.js:1133-1138`
**Root cause:** `Math.floor((today - startDate)/86400000)` over local Dates double-counts/loses an
hour across DST, and `weekStartedAt` is reset to "4 days ago" on cancel (app.js:428-431) — a hack
that will re-prompt every app open. **Fix:** compare date-keys with `daysBetween`; on cancel, set
`weekStartedAt` to "now − 0" and add a `_weekAdvanceDismissedAt` guard.

### 🟡 B15 — Event listeners re-attached on every render (potential leak)
**Files:** `js/home.js:121-122, 174` (and similar in view modules)
**Root cause:** `renderGlanceGrid`/list builders call `el.addEventListener` on freshly created
nodes each `renderHome()`. New nodes replace old ones so old listeners are GC-eligible, **but**
any handler that closes over `appState`/large arrays keeps them alive until the node is collected,
and any listener attached to a *persistent* container (not rebuilt) accumulates. **Fix:** prefer
the existing global delegation (`data-action`) for these too; avoid per-node binding in render.

### 🟡 B16 — `getStat` substring matcher mis-maps Garmin fields
**Files:** `js/garmin.js:107-130`
**Root cause:** `getStat(['cal'])` for calories will also match `total_calories` *and* any key
containing "cal" (e.g. `calibration`), returning the first. `aerobicTE` is read from
`total_anaerobic_effect` (mislabeled — anaerobic mapped to the aerobic field). **Effect:** wrong
calories/training-effect on some files. **Fix:** exact field allow-list per metric; fix the
aerobic/anaerobic swap.

### 🟡 B17 — `applyDeloadToCurrentWeek` mutates set arrays while filtering completed sets only
**Files:** `js/state.js:229-251`
**Root cause:** logic keeps warmups + completed and the *first N* incomplete. If a lift's sets are
stored under an opaque id vs name inconsistently, the per-lift loop is fine, but there's no guard
for `week.lifts` being a legacy array (deleted elsewhere) — acceptable, but the deload is silently
a no-op when the current week has only completed sets, with no user feedback. **Fix:** report how
many sets were trimmed; disable the deload CTA when nothing is trimmable.

### ⚪ B18 — Dead/no-op code
- `populateExerciseDropdown(){}` and `handleExerciseDropdownSelectionChange(){}` are empty exports
  still imported & wired in app.js:44 (workout.js:1061-1062).
- `aerobicTE` extraction reads the wrong FIT field (B16).
- `_requestHealthConnectOrDemo` references a bridge that never exists (B3) — entire branch dead.

### ⚪ B19 — `resolveCallback` JS string-escaping in the bridge is fragile
**Files:** `HybridHealthBridge.kt:229-237`
**Root cause:** escapes only `\` and `'`, then injects JSON into a single-quoted JS string. A
newline or U+2028/2029 in any health field breaks the `evaluateJavascript` payload. **Fix:** use
`JSONObject.quote(json)` or pass via `evaluateJavascript` with proper encoding / `postMessage`.

### Race conditions / async
- **R1:** `saveStateToLocalStorage` is `async` but almost every caller ignores the promise; two
  rapid edits can interleave cloud upserts out of order (last network write wins, not last edit).
- **R2:** `pullEngineDataFromStorage` `Promise.race` with a 4s timeout — if the network resolves
  *after* the timeout, the late `cloudData` is discarded (fine) but `initAuth`/`initImportExport`
  may run against a half-populated state if any earlier await rejected.
- **R3:** Garmin import callback writes `appState.weeks[wk].runs[sd]` then `saveMapToDB(...).then`
  saves — if the user changes day/week between parse and `.then`, the map is keyed to the new
  slot (uses captured `wk/sd`, so actually safe; the *run fields* used captured values too — OK,
  but `hydrateCurrentView` after async may render a different day).

---

# PHASE 3 — Performance

| # | Issue | Why it costs | Impact | Fix |
|---|---|---|---|---|
| P1 | `recomputeLoadMetrics` on every save (state.js:317) | full timeline + 2 EWMAs per keystroke-save | jank while logging on long histories | memoize; recompute on finish/import only (B8) |
| P2 | Full-state JSON to localStorage on every save | synchronous serialize of entire blob (weeks, logs, library) | main-thread stall grows with history | debounce 300–500ms; persist deltas; move to IndexedDB store-per-week |
| P3 | Cloud upsert of whole state per save | network + JSON of entire blob | battery/data; rate-limit risk | debounce + only-if-dirty + send `updatedAt` |
| P4 | `innerHTML` rebuilds (218 sites) | full reparse + layout + GC of detached nodes | re-render flashes, lost scroll/focus | targeted updates; keyed list diffing; render only changed tiles |
| P5 | Per-render `addEventListener` (home.js et al.) | re-binding each hydrate | minor CPU + retained closures | use global `data-action` delegation everywhere |
| P6 | Analytics recompute per render | every view recomputes all series from `weeks` | slow Analytics tab on big datasets | cache derived series keyed by weeks-hash; compute once per tab open |
| P7 | SVG charts as innerHTML strings | string build + parse for each chart | adds to Analytics cost | reuse nodes; consider `<canvas>` for dense series |
| P8 | Runtime ESM from `esm.sh` (garmin.js:1-2, leaflet/supabase via CDN) | network fetch on first use; not all precached | offline import fails; slow first parse | bundle/vendor deps; add to SW precache |
| P9 | `verifyWeekStorageSchema` called repeatedly (boot, every switch, every hydrate) | rebuilds week objects / prescribes sets | redundant work each navigation | guard: skip if week already materialized |
| P10 | No code-splitting; all modules in SW precache (100+ files) | large install cache, many requests | slow first SW install | bundle into a few chunks; lazy-load Analytics/Programs |

**Startup:** boot serially awaits `checkActiveSession` (≤3s) then `pullEngineDataFromStorage`
(≤4s cloud race) before first paint of real data. On a cold cellular start that's up to ~7s of
potential blank/placeholder. **Fix:** render local state immediately, reconcile cloud in the
background, show a subtle "syncing" pill.

---

# PHASE 4 — Architecture Review

**God files:** `workout.js` (1,275), `app.js` (1,241), `dashboard.js` (994),
`view-fasting.js` (836), `programs/library.js` (816). `index.html` is itself a 1,805-line god
file holding every screen and modal.

**God functions:** `openTodaySummaryModal` (app.js:474-625, ~150 lines, DOM + calc + formatting),
the global `click` delegator (app.js:635-870, ~235 lines, one giant if/else chain),
`renderWorkout` (workout.js:151-487), `computeRunningAnalytics` (acceptable—pure but huge).

**Separation-of-concerns problems:**
- `app.js` mixes routing, modal rendering (rating modal, today summary), device-import side
  effects, week-advance business logic, and bootstrap. It should be a thin router.
- `state.js` mixes the store, program-library CRUD, deload business rules, streak/goal logic, and
  persistence. Extract `programLibrary.js`, `streaks.js`, `deload.js`, `persistence.js`.
- `settings.js` contains the (broken) health-connect integration — that belongs in a `health/`
  service.

**Duplicated logic:**
- `parseMinutes`/`parseDurationToMinutes` exist in both `load_models.js:21` and `engine.js:32`.
- Pace formatting in `engine.formatPace`, `app.js` (today summary 509-517), and running-calcs.
- Day-key maps (`['sun','mon',...]`, jsDay→key) reimplemented in app.js:296, app.js:476,
  state.js:258, dates.js:50 — at least 4 copies.
- EWMA/sRPE day-load computed in three places (`recoveryCostSeries`, `buildDailyTimeline`,
  `weeklyLoadMetricsSeries`) with copy-pasted bodies.

**Tight coupling / low cohesion:** `engine.js` re-exporting `metrics/*` (façade leak);
feature modules importing `showToast` from `state.js`; `app.js` importing ~60 named symbols.

**Recommended structure:**
```
js/
  core/        state.js  persistence.js  migrations.js  events.js
  domain/      programs/ workout/ fasting/ streaks.js deload.js
  health/      bridge.js (native) healthConnect.js garmin.js
  analytics/   (keep — it's the model citizen)
  ui/          router.js  components/ (Tile, Chart, Modal, DayPill…)  screens/
  platform/    haptics.js notifications.js gps.js
```
Introduce: a **repository layer** over storage (`WeekRepo`, `WellnessRepo`) so views never touch
`appState.weeks` directly; a **service layer** for cross-cutting domain ops (load, readiness);
a tiny **render/component** abstraction (even a 50-line `h()`/keyed-list helper) to kill innerHTML.

**Modernization roadmap:** (1) extract persistence + migrations; (2) build the JS health service
and wire the real bridge; (3) split `index.html` into templated partials and `app.js` into
`router.js` + screen controllers; (4) introduce a component helper + delegation-only events;
(5) optional: adopt a 3KB signals lib (or Preact) once boundaries are clean.

---

# PHASE 5 — UX Review (vs Garmin/COROS/Strava/TrainingPeaks/Athlytic)

**Navigation:** 5-tab bottom nav (Home/Workout/Program/Analytics/Profile) is correct and
familiar. But the Program tab juggles four mutually-exclusive `display:none` screens (library /
detail / active-plan / builder) via manual style toggles (app.js:142-166) — back behavior is
inconsistent and there's no breadcrumb. *Athlytic/COROS keep one clear hierarchy with animated
push/pop.*

**Discoverability / hidden functionality:**
- Today-summary, fasting detail, deload, and rating modals are reachable only by specific taps;
  no consistent affordance. The deload feature was literally dead until recently (commit history).
- Health-connect "connected" with placeholder data **misleads** users into thinking recovery is
  real — a trust-killer for a fitness app.

**Information density / hierarchy:** Home tiles are good, but values like "Volume 12,450 kg" and
readiness are shown without context (no sparkline, no vs-baseline). *Garmin/Whoop always pair a
number with a trend and a color band.* The vs-last-week block in today-summary is a good pattern —
promote it everywhere.

**Onboarding:** exists (`onboarding.js`) and sets goal/level/units, but doesn't establish
HRV/sleep source, threshold pace, or bodyweight up front — so analytics start empty and the app
feels lifeless for week 1. *COROS/TP collect a baseline and a goal race immediately.*

**Workout logging:** strong — supersets, per-set RPE, quick-log, set types, RPE-aware rest. This
is the most commercial-feeling part. Gaps: no plate calculator, no "repeat last week," no inline
1RM/e1RM feedback on a PR set, no undo.

**Analytics screens:** genuinely deep (VDOT, race predictors, decoupling, HR zones, stress
balance). But they're spread across 13 separate views with inconsistent empty states, and many
read from `healthConnect` data that's fake. Consolidate into Garmin-style "Training Status /
Load Focus / Recovery" hubs (you already have the calc primitives).

**Consistency:** colors are inlined as hex in JS templates (e.g. readiness colors in
readiness-scoring.js, today-summary fmt() in app.js:587) rather than CSS variables — theming and
dark/light parity will drift.

**Top friction points:** (1) fake recovery data; (2) Program tab navigation; (3) empty week-1
analytics; (4) no pull-to-refresh / loading skeletons; (5) modals that `display:flex/none`
without transitions feel web-like.

---

# PHASE 6 — Native App Feel

- **Scrolling:** `overScrollMode = OVER_SCROLL_NEVER` (MainActivity.kt:138) kills the Android
  stretch/overscroll glow — *remove it* or implement custom; native apps keep the stretch.
- **Pull-to-refresh:** none. Add a `SwipeRefreshLayout`-style gesture in the WebView or a JS
  touch handler on Home/Analytics to trigger cloud + health sync.
- **Transitions:** tabs/screens swap via `classList`/`display` with no enter/exit animation. Add
  CSS view-transitions (`@view-transition` / FLIP) for tab and push/pop.
- **Touch feedback:** haptics exist (`haptics.js`, recent commit) — good; extend to nav taps,
  toggles, PRs. Add `:active`/ripple states (CSS) on every `[data-action]`.
- **Loading states:** boot shows nothing real until cloud race resolves; add skeleton tiles.
- **Modals:** `display:flex` toggles; no backdrop fade, no swipe-to-dismiss bottom sheets. Fasting
  & today-summary should be bottom sheets with drag-to-close (Athlytic-style).
- **Keyboard:** `windowSoftInputMode=adjustResize` is correct; but numeric set inputs should use
  `inputmode="decimal"`, `enterkeyhint="next"`, and auto-advance between set fields.
- **Safe areas:** edge-to-edge is enabled (`setDecorFitsSystemWindows(false)`) — verify CSS uses
  `env(safe-area-inset-*)` for the bottom nav and headers (check `styles.css`).
- **Bottom nav:** present; add active-tab scale/haptic and badge support.
- **Back gesture:** predictive back is wired natively but JS never defines `window.__onAndroidBack`
  (MainActivity.kt:187) so back never closes modals/sheets first — **define it** to pop
  modal→sheet→tab→exit.

---

# PHASE 7 — Analytics Validity

**What's scientifically sound:**
- **Epley 1RM** (`engine.epley1RM`) — standard, fine for ≤10 reps; note it overestimates at high
  reps. Consider blending Epley/Brzycki and capping reps.
- **CTL/ATL via EWMA** with 42/7-day spans (load_models.js:17-19) — the Banister/TrainingPeaks
  approach; **good**. TSB = CTL−ATL is correct framing.
- **VDOT from threshold pace** + **Daniels race predictors** (running-calcs.js:18,141) — credible
  approximations; race-time scaling by %VO2max is a reasonable model.
- **HRV status vs 30-day baseline**, **RHR deviation**, **sleep debt** (recovery-calcs.js) — match
  Whoop/Garmin baseline-relative methodology.

**What's questionable / inconsistent:**
- **Readiness "load" component** uses EWMA `atl/ctl` as if ACWR (readiness-scoring.js:45) — wrong
  ratio (B5). Garmin/Whoop use rolling acute:chronic. Fix to use `recoveryCostBalance`.
- **ACWR chronic = last week only** (B6) — TrainingPeaks/Gabbett use a 28-day rolling mean. This
  makes deload triggers and stress-balance jumpy.
- **Two parallel "recovery" definitions:** `computeReadiness` (scoring) vs
  `dailyRecoveryScoreSeries` (recovery-calcs) weight signals differently (0.27/0.27/0.23/… vs
  0.40/0.35/0.25). Users will see two different "recovery" numbers. **Unify** into one model.
- **`enduranceScore`** mixes VDOT/consistency/volume with arbitrary constants (÷50km, ×0.5/0.3/0.2)
  — fine as a proprietary score but document it and clamp edge cases (0 weeks).
- **Aerobic decoupling** is approximated at *week* granularity (running-calcs.js:120) — real
  decoupling is within a single long run (first-half vs second-half HR:pace). With per-run splits
  now imported from Garmin, compute it properly per run.
- **Strength** relies on hardcoded names "Back Squat/Bench Press/Deadlift" (engine.js:329-335) for
  Big-3 — breaks for users who rename or use variations. Key off exercise *category*, not literal.

**Edge cases:** division by zero guarded in most places; but `pctChange`, `linearRegression` on
all-zero series, and single-data-point series should be re-verified (some return 0 silently,
hiding "no data" from the UI).

**Recommended additions** to reach Garmin/COROS parity: Training Load Focus (anaerobic / high
aerobic / low aerobic buckets — you already classify run types), Acute Load vs optimal range band,
VO₂max trend (from Health Connect once wired), HR-zone time-in-zone weekly, Body Battery-style
intraday energy (needs HRV/steps from bridge), and a real "Form/Fatigue/Fitness" PMC chart
(you already persist CTL/ATL — just plot the series from `weeklyLoadMetricsSeries`).

---

# PHASE 8 — Data Model Review

**Current shape:** one denormalized blob — `appState.weeks["3"].lifts["mon"]["Back Squat"] =
[{w,r,c,type,rpe,...}]`, parallel `runs/notes/gymRpe/gymStats/bodyWeight/dates` maps per day, plus
top-level `wellnessLog[]`, `healthConnect.{hrv,restingHR,sleep,steps}[]`, `fastingSession.history[]`,
`programLibrary`, `settings`. GPS coords in IndexedDB keyed `week_day`.

**Problems:**
- **Week-indexed, not date-indexed.** Everything hangs off a synthetic week number + day key, with
  real dates only estimated from `weekStartedAt` (load_models.js:159). This is the root of the
  timezone/DST/streak bugs and makes "show me June" queries impossible. *Garmin/Strava are
  date/activity-keyed.*
- **Lift identity duality** (string name vs `lift_xxxx` id, engine.js:63-80) — historical data
  mixes both; calc code defensively resolves both everywhere. Pick one (stable id) and migrate.
- **No per-activity records.** A "run" is fields on a day slot, not an entity, so you can't have
  two runs in a day, can't attach the GPS map by activity id, can't show an activity feed.
- **Unbounded arrays** in the same blob (`wellnessLog`, health arrays) grow forever and are
  serialized on every save.

**Recommendations:**
1. Add `schemaVersion` + a migration runner (Phase 2 B4).
2. Move to **IndexedDB object stores**: `activities` (id, date, type, payload),
   `wellness` (date PK), `health` (date+type PK), `weeksMeta`, keep `settings`/`programLibrary`
   small in localStorage. Index by date.
3. Keep the localStorage/Supabase blob as a *sync snapshot* with `updatedAt` for conflict
   resolution, but stop using it as the working store on the hot path.
4. **Backup strategy:** auto-snapshot to a rolling `hybrid_backup_{ts}` (keep last 3) before
   import/reset/migration. Offer "Download backup" + "Restore."
5. **Export/import:** version-stamp exports; validate + migrate on import; round-trip GPS maps
   (currently exports drop IndexedDB coords entirely).

---

# PHASE 9 — Security

- **🟠 Supabase anon key + URL hardcoded in client** (supabase.js:6-7). The anon key is *designed*
  to be public **only if Row-Level Security is enforced**. Verify RLS on `user_data` restricts
  rows to `auth.uid() = user_id`; otherwise any user can read/write any user's `state_data`.
  **This is the most important security item — confirm RLS.**
- **🟠 Stored/Imported XSS.** User-controlled strings (notes, custom exercise/program names, rating
  reviews, athlete name) are interpolated into `innerHTML` templates unescaped (home.js,
  athlete-profile.js, app.js today-summary — 218 innerHTML sites). Because state syncs across
  devices via Supabase and can be imported from a file, a crafted value executes script in the
  WebView (which has `HybridHealthBridge` privileges → health data exfiltration). **Add an
  `escapeHtml()` and apply to every user-string interpolation, or render via `textContent`.**
- **🟠 JS bridge is a privilege boundary.** `addJavascriptInterface` exposes health read + file
  write to *all* JS in the WebView. Combined with the XSS above and CDN script loads
  (`unpkg`/`jsdelivr`/`esm.sh` over the network), a compromised CDN or injected string can call
  the bridge. **Mitigations:** SRI on CDN scripts (or vendor them), a strict CSP `<meta>`,
  validate all bridge inputs, and gate the bridge behind an origin check.
- **🟡 No CSP.** `index.html` has no Content-Security-Policy; with multiple third-party origins
  this is wide open. Add CSP allowing only self + the specific CDNs (or self only after vendoring).
- **🟡 `network_security_config.xml`** — confirm it doesn't permit cleartext for arbitrary hosts
  (only `appassets` is needed; everything else is HTTPS).
- **🟡 Token handling** — Supabase session lives in `localStorage` (SDK default) inside the
  WebView; acceptable, but the XSS risk makes it exfiltratable. Fixing XSS is the real mitigation.
- **⚪ `evaluateJavascript` string injection** in the bridge (B19) — escape via `JSONObject.quote`.
- **⚪ Logging** — several `console.error` print raw error messages including DB errors
  (state.js:340) to the WebView console; fine for now, scrub before release.

---

# PHASE 10 — APK / Release Readiness

| Capability | State | Notes |
|---|---|---|
| WebView shell | ✅ solid | AssetLoader origin, predictive back, splash, downloads, geo perms |
| Capacitor | ❌ not used | This is a hand-rolled WebView host, not Capacitor — fine, but no plugin ecosystem |
| Offline mode | 🟡 partial | SW precaches local JS, **but** Leaflet/Supabase/Garmin-parser load from CDN at runtime → maps/import/cloud break offline; first-run needs network |
| Background sync | 🟡 worker exists, **not wired to JS** | `HealthSyncWorker` 8h runs natively; results never reach `appState` (B3) |
| Push notifications | 🟡 channel + bridge exist, **never called** | `notifyRestComplete` unused; no FCM; reminders are JS-only and die in background |
| Health Connect | 🔴 broken | bridge contract mismatch (B3); UI shows fake data |
| Garmin import | 🟡 works online only | CDN ESM dependency; field-mapping bugs (B16) |
| Data safety / RLS | ❓ unverified | must confirm Supabase RLS before any release |
| Play Store policy | 🟠 blockers | Health Connect declared permissions + `VIEW_PERMISSION_USAGE` alias present (good), but **shipping fake health data + requesting health permissions you don't use** risks rejection; needs privacy policy, data-safety form, target SDK check |
| Crash resilience | 🟡 | broad try/catch hides failures rather than reporting; no crash reporting (Crashlytics) |
| Versioning/migrations | 🔴 none | B4 — updates can silently drop user data |

**Release readiness score: 52 / 100.**
Strong workout core, deep analytics math, clean native shell — but a dead health integration,
fabricated recovery data, no real offline for key features, no migration safety, hardcoded
timezone, and unverified RLS keep it well short of store-ready. Closing B1–B4 + RLS + offline
vendoring would put it ~75; full health-bridge wiring + data-model migration ~85+.

---

# PHASE 11 — Priority Roadmap (impact × effort)

### TOP 10 CRITICAL FIXES
1. **Wire the real native health bridge** (B3) — unfaked recovery. *Impact 10 / Effort 6*
2. **Fix first-run/settings defaulting** (B1). *10 / 1*
3. **Device timezone instead of Sydney** (B2). *9 / 2*
4. **Schema version + migration + deep-merge** (B4). *9 / 4*
5. **Confirm/​enforce Supabase RLS** (Phase 9). *10 / 1 (verify) – 3 (fix)*
6. **Escape all user strings before innerHTML** (XSS). *9 / 3*
7. **Stop faking Health Connect** — gate UI on real bridge availability (B3). *8 / 2*
8. **Cloud/local conflict by `updatedAt`** (B10). *8 / 3*
9. **Define `window.__onAndroidBack`** for back/modal handling (Phase 6). *7 / 2*
10. **Vendor CDN deps + SW precache** for true offline (P8). *7 / 3*

### TOP 20 HIGH-VALUE IMPROVEMENTS
Real PMC (Fitness/Fatigue/Form) chart from existing CTL/ATL series · unify the two recovery models ·
fix ACWR chronic window (B6) · Training Load Focus view · plate calculator · "repeat last week" ·
per-activity data model · activity feed · backup/restore · import validation+migration (B11) ·
threshold-pace & bodyweight in onboarding · VO₂max trend (post-bridge) · proper per-run decoupling ·
Big-3 by category not name (B7-strength) · crash reporting · debounced persistence (P2/P3) ·
loading skeletons · streak/calendar correctness (B13) · auto-advance DST fix (B14) · CSP header.

### TOP 20 UX IMPROVEMENTS
Bottom-sheet modals with drag-dismiss · tab transitions · pull-to-refresh · ripple/active states ·
trend+baseline on every metric · consolidate 13 analytics views into 3 hubs · consistent empty
states · CSS-variable colors (no inline hex) · Program-tab hierarchy + breadcrumb · numeric
inputmode + auto-advance set fields · PR celebration on e1RM · undo for set edits/reset · onboarding
baseline capture · "today" hero with readiness band · weekly summary card · clearer deload CTA with
trim count · settings search · avatar/profile polish · streak calendar heatmap · contextual tips.

### TOP 20 PERFORMANCE IMPROVEMENTS
Memoize load metrics (B8) · debounce localStorage (P2) · dirty-flag cloud upsert (P3) · keyed
list diffing (P4) · delegation-only events (P5) · cache analytics series per weeks-hash (P6) ·
canvas for dense charts (P7) · vendor/bundle deps (P8) · skip redundant schema verify (P9) ·
code-split Analytics/Programs (P10) · render local-first before cloud · lazy-load Leaflet only on
map view · virtualize long history lists · precompute day-load timeline incrementally · avoid
double saves (B9) · move GPS-heavy parsing to a worker · shrink state blob (split unbounded logs) ·
throttle rest-timer DOM writes (250ms→rAF) · reuse chart DOM nodes · compress exports.

### TOP 20 ANALYTICS IMPROVEMENTS
Correct ACWR (B6) · single recovery model · real PMC chart · per-run decoupling · Big-3 by
category · blend Epley/Brzycki + rep cap · Training Load Focus buckets · time-in-HR-zone weekly ·
VO₂max + RHR trend (bridge) · sleep-stage quality (data already in bridge) · readiness "why"
breakdown · injury-risk band on ACWR · taper readiness for races · strength imbalance by
push/pull/legs · running economy from real splits · bodyweight-adjusted strength (Wilks/DOTS) ·
fasting↔recovery correlation · weekly consistency score · projected race readiness vs goal date ·
document every proprietary score's formula in-app.

### Roadmaps
- **30 days (stabilize & de-fake):** B1, B2, B5, B6, B9, B13, B14 (low-effort correctness) +
  RLS verification + XSS escaping + define `__onAndroidBack` + remove dead code + render
  local-first. *Outcome: honest data, no first-run crash, correct dates, safer.*
- **60 days (integrate & make-native):** implement the JS↔native health service (B3), vendor CDN
  deps + offline (P8/P10), schema version + migration + backup (B4/B11), debounced persistence
  (P2/P3), bottom-sheet modals + transitions + pull-to-refresh, unify recovery + real PMC chart.
  *Outcome: real Health Connect, true offline, store-safe data, native feel.*
- **90 days (commercial polish):** per-activity data model + activity feed, Analytics → 3 hubs
  with Training Load Focus & VO₂max trends, plate calc / repeat-week / onboarding baseline,
  component+delegation render refactor, crash reporting, Play Store data-safety + privacy + listing.
  *Outcome: feels like Garmin Connect/Athlytic; ready for a closed beta → release.*

---

## Appendix — evidence index (file:line)
state.js:26-54 (no settings) · state.js:376-378,429 (B1) · state.js:402-404 (B10) ·
dates.js:14 (B2) · settings.js:519,535,524-531 (B3 fake HC) · MainActivity.kt:147,187 (bridge
name, __onAndroidBack) · HybridHealthBridge.kt:110-225,229-237 (real API, B19) ·
readiness-scoring.js:45-55 (B5) · load_models.js:119-133 (B6), :208,:317-caller (B8) ·
garmin.js:107-130,175-176 (B16,B7) · import-export.js:35-105 (B11,B12) · engine.js:329-335
(Big-3 names) · app.js:1126-1158,428-431 (B14) · home.js:121-122,174 (B15) · supabase.js:6-7
(anon key/RLS) · sw.js:111-115 (CDN not fully offline) · workout.js:1061-1062 (dead code).
</content>
</invoke>
