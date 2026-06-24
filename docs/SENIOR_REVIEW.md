# Hybrid Training — Senior Engineering Review

_Staff-level review of architecture, UI/UX, native feel, performance, and maintainability._
_Date: 2026-06-24_

---

## 1. What this app is

A vanilla-JS **ES-module PWA** (no framework, no build step) wrapped in a thin,
well-built **Android WebView** shell, with optional Supabase sync and Health
Connect integration. ~44k lines of HTML/CSS/JS plus a Kotlin native layer.

- **Entry:** `index.html` (1809 lines) hosts 5 `view-container` sections (home,
  workout, analytics, program, profile). One DOM, view toggling by class.
- **Router/glue:** `js/app.js` (1227 lines) — boots modules, owns the global
  `data-action` click delegation and tab switching.
- **State:** `js/state.js` + `state/{auth,import-export,supabase}.js`. Single
  `appState` object persisted to `localStorage` (`hybrid_engine_v2_state`),
  events (`app:storage-loaded`, `app:navigate`, `app:library-updated`) decouple
  modules.
- **Domains:** `analytics/`, `metrics/`, `brain/`, `fasting/`, `programs/`,
  `home/` are cleanly separated into views / calculations / charts.
- **Native:** `MainActivity.kt` — edge-to-edge, splash, predictive back,
  `WebViewAssetLoader` (assets served over `https://appassets.androidplatform.net`,
  not `file://` — correct & secure), geolocation, file chooser, Health Connect,
  `HealthSyncWorker` periodic sync. **This layer is genuinely good.**
- **SW:** `sw.js` — network-first for JS modules (fixes reach users fast),
  cache-first/stale-while-revalidate for static assets.

---

## 2. Architecture — strengths

1. **Clean JS modularisation.** The `analytics/` tree (views ↔ calculations ↔
   charts ↔ scoring) is exemplary separation for a solo project. `home/`,
   `fasting/`, `programs/` follow the same shape.
2. **Centralised event delegation.** One `document` click listener resolving
   `[data-action]` via `closest()` — no inline `onclick`, no per-element
   listener leakage. Keyboard activation for `role="button"` is handled.
3. **Event-driven decoupling.** Modules talk through `CustomEvent`s rather than
   importing each other's render functions, which keeps the dependency graph
   mostly acyclic.
4. **No build step = zero toolchain rot.** For a solo founder this is a feature:
   it will still run in 5 years.
5. **Solid native shell.** Asset-loader origin, predictive back, edge-to-edge,
   WorkManager sync, scoped permissions — better than most Capacitor wrappers.
6. **Real design-token foundation** already exists in `:root` (surfaces, text,
   accents, 8pt spacing, type scale, radii, motion, z-index, shadow, borders).

---

## 3. Architecture — weaknesses & technical debt

| # | Issue | Evidence | Impact |
|---|-------|----------|--------|
| D1 | **Test suite is red and ignored.** 20 of 134 tests fail. | All 20 import modules deleted in the `revert: restore original web app` commit (`brain/core.js`, `brain/analysis.js`, `health/*`, `dashboard-tiles.js`, `computeGoalAdherence`). CI (`build-apk.yml`) never runs `npm test`. | A permanently-red suite means nobody can spot a *real* regression. Highest-priority debt. |
| D2 | **CSS `!important` epidemic.** 561 uses (styles 400, programs 84, analytics 77) + 16 in `index.html`. | `grep -c '!important'` | Specificity wars; every new rule needs another `!important`. The clearest signal the styling is fighting itself. |
| D3 | **Inline styles & a 233-line `<style>` block in `index.html`.** 132 `style=` attributes. | `index.html` head | Styling lives in three places (tokens, component CSS, inline). Hard to theme, impossible to reuse. |
| D4 | **Hardcoded colours duplicate tokens.** `#0f172a`×58, `#f8fafc`×32, `#3b82f6`×15… even though `--color-blue` etc. exist. | `grep -oE '#[0-9a-f]{3,6}'` | Theme drift; light-mode overrides must chase each literal. |
| D5 | **Giant if/else dispatch.** `app.js` click handler is a ~250-line `else if` chain. | `app.js:633+` | Adding actions is append-only; hard to read, no grouping by feature. A `Map<action, handler>` would flatten it. |
| D6 | **Oversized files.** `styles.css` 7430, `programs.css` 3029, `index.html` 1809, `workout.js` 1257, `app.js` 1227, `athlete-profile.js` 1125, `dashboard.js` 978, `view-fasting.js` 835. | `wc -l` | Cognitive load; merge conflicts; slow to navigate. |
| D7 | **`innerHTML` string rendering everywhere.** ~200 sites. | `grep -c innerHTML` | Full-subtree re-render on every update (scroll reset, lost focus, GC churn), and an XSS surface if any user string is ever interpolated unescaped. |
| D8 | **Two full themes shipped in one file.** 452 `data-theme="light"` overrides interleaved with dark rules. | `grep -c` | Doubles the surface area of every visual change. |

---

## 4. UI/UX audit

**The foundation is better than the prompt assumes** — there *is* a token
system, a card/button/input/nav/modal/bottom-sheet component set, skeleton
shimmer states, and motion tokens. The polish gap is **consistency of
application**, not absence of a system.

Highest-impact UX findings:

- **Sticky hover states (the #1 "this is a web app" tell).** 561 `:hover`
  rules, only **one** guarded by `@media (hover: hover)`. On a touchscreen,
  `:hover` fires on tap and *stays* until you tap elsewhere — so cards/buttons
  look stuck "lifted" after every press. → **Fixed** (see §8).
- **Long-press selects text / shows the callout menu** — pure web behaviour.
  `user-select:none` is applied piecemeal to ~10 components but not globally to
  chrome. → **Fixed** (see §8).
- **Number jitter.** Live metrics (timers, paces, loads) aren't uniformly
  tabular-figured, so digits shift width as they tick. Garmin/Coros always use
  tabular numerals for data. → partially present; recommend standardising.
- **Touch targets.** Nav items and several icon buttons rely on padding; a few
  (`.btn-set-delete`, chart toggles) are below the 44px minimum.
- **Information density** in analytics is strong (a genuine differentiator) but
  card padding (`22px`) vs glance-card padding (`10px`) vs inline overrides is
  inconsistent — the same "card" looks different across screens.

---

## 5. Performance

- **Render:** `innerHTML` rebuilds whole sections; on the analytics tab this
  rebuilds many charts at once. No `requestAnimationFrame` batching (1 use in
  the whole codebase). Acceptable today (data sets are small) but the main
  scaling risk.
- **Startup:** CDN `<script>` for Leaflet + Supabase block in `<head>`
  (Supabase is `defer`, Leaflet is not). Leaflet is only needed on the map —
  candidate for lazy load.
- **Storage:** entire `appState` re-serialised to `localStorage` on every save
  (synchronous, main-thread). Fine at current size; watch as history grows.
- **CSS:** ~12k lines parsed on every cold start; the light theme is dead weight
  for dark-mode users.

---

## 6. Accessibility

- Good: `aria-label` on views, keyboard activation for `role="button"`,
  `color-scheme: dark`.
- Gaps: heavy reliance on colour alone for status; some sub-44px targets;
  `maximum-scale=1.0, user-scalable=no` disables pinch-zoom (common in apps but
  an a11y trade-off); icon-only buttons without labels in places.

---

## 7. Scores (pre-change baseline)

| Dimension | Score | Note |
|-----------|------:|------|
| Architecture | 7.5/10 | Excellent JS modularity; CSS & dispatch drag it down |
| UI polish | 6.5/10 | Real system, inconsistently applied |
| Native feel | 6/10 | Great shell; web-isms leak through (hover, select) |
| Code quality | 7/10 | Clean modules, but oversized files + red tests |
| Performance | 7/10 | Fine now; `innerHTML` is the ceiling |
| Maintainability | 6.5/10 | Tokens help; `!important` + dual theme + dead tests hurt |

---

## 8. Changes made in this pass (safe, high-leverage, additive)

1. **Restored a green, trustworthy test suite.** Removed the 20 dead test files
   that import modules deleted in the baseline revert. Confirmed *zero* live
   `js/` references to those modules first — this removes no live functionality,
   only un-runnable tests. Suite goes 114/134 → 114/114.
2. **Native-feel polish layer** appended to `styles.css`:
   - Neutralised sticky `:hover` transforms on touch devices via
     `@media (hover: none)` for cards, nav, tiles and buttons.
   - Disabled text selection + the long-press callout menu on UI chrome, while
     keeping inputs/textareas selectable.
   - Standardised momentum scrolling / overscroll containment.
   - Tabular numerals for inputs and metric text so data stops jittering.

These were chosen because they touch **every screen**, are **purely additive**
(no markup or JS behaviour changes), and address the two biggest "this is a
web app" tells without risking regressions.

---

## 9. Highest-impact future work (in priority order)

1. **Wire `npm test` into CI** so the suite can never silently rot again.
2. **Kill `!important`** by raising base specificity once and deleting overrides
   file-by-file (start with `analytics.css`, the smallest).
3. **Extract `index.html`'s inline `<style>` and `style=` attributes** into
   token-based classes; delete duplicated hex literals in favour of `--color-*`.
4. **Split the four 1000+ line files** (`workout.js`, `app.js`,
   `athlete-profile.js`, `styles.css`) along the seams that already exist.
5. **Replace the `app.js` if/else dispatch with an action→handler map.**
6. **Move the light theme into its own stylesheet** loaded only when selected.
7. **Adopt a tiny render helper** (tagged-template + targeted node patching, or
   `morphdom`) to stop full-subtree `innerHTML` rebuilds on hot paths.

---

## 10. Strategic questions

- **React + Capacitor?** Not worth it now. The Android shell already gives you
  near-native integration, and a rewrite would torch the working analytics
  engine for months. The real pain is **CSS**, which React doesn't fix. Revisit
  only if you add a second platform or multiple contributors.
- **TypeScript?** **Yes, incrementally** — and it's cheap here. Add
  `// @ts-check` + JSDoc to `state.js`, `engine.js`, and the analytics
  calculation modules first. The `appState` shape is the single most valuable
  thing to type; it would catch a whole class of schema-migration bugs with no
  build step.
- **Can the current architecture scale?** For a solo/personal power-user tool:
  **yes**, comfortably. The limiters are `innerHTML` re-render cost and CSS
  maintainability, both addressable incrementally without a rewrite. For a
  multi-developer commercial product, you'd want TS + a render layer + the CSS
  cleanup above first.
