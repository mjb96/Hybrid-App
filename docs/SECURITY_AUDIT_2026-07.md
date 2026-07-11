# Helyx Security & Hardening Audit — 2026-07-10

Implementation pass against the 11-point brief. Each item lists status, the real
change, and the test/verification that proves it. Truthful by design: items that
could not be completed in this environment say so with the concrete reason.

## Status legend
- ✅ done + tested
- 🟡 partial (real change landed; remainder noted)
- ⏸ deferred (reason stated)

## 1. Android WebView & native bridges — 🟡
- CSP meta added to `index.html`: `script-src 'self' https://cdn.jsdelivr.net`,
  `object-src 'none'`, `frame-ancestors 'none'`, scoped `connect-src`. Blocks
  arbitrary/inline remote script in the privileged WebView.
- **Leaflet bundled** (`js/vendor/leaflet/`, pinned) — no CDN, works offline.
- **Supabase** exact-pinned `@2.45.4` + **SRI** integrity + `crossorigin`.
- **Sentry** exact-pinned `@8.55.0`.
- Only former inline script moved to `js/sw-reload.js`; font `onload` handler removed.
- Kotlin bridges: `BridgeSafe.callbackId` sanitises the callback channel;
  applied in `GpsBridge`/`NotifyBridge`. `WebView.setWebContentsDebuggingEnabled`
  gated to debug builds.
- Tests: `tests/bridge_input.test.js` (JS↔native id contract). Threat model:
  `docs/security/webview-threat-model.md`.
- ⏸ Full offline vendoring of the webpack-chunked Supabase build deferred
  (unverifiable without a real browser; pin+SRI gives equal tamper-resistance).

## 2. Account & data deletion — (in progress)

## 3. Service-worker caching — ✅
- Precache generated from the real ES-module graph (`scripts/module-graph.mjs`
  + `scripts/gen-precache.mjs`); 14 previously-missing reachable modules
  (program-compare, substitutions, coaching, plates, timeline…) now cached.
- Atomic install (`cache.addAll(REQUIRED_ASSETS)`); activate validates cache
  completeness before purging old caches (no mixed-version app on failed
  upgrade). Required vs optional assets separated.
- Tests: `tests/precache_manifest.test.js` (reachable ⊆ cached; generator not
  drifted; SW keeps old cache on partial install). CI: `npm run precache:check`.

## 4. GPS routes in export/import — ✅
- Routes live in IndexedDB (`HybridTrainingDB/runMaps`, "week_day" keys), not
  appState, so JSON export dropped them and import never restored them.
- Versioned export envelope (`js/state/route-portability.js`, `format`+`version`)
  now carries `state` + validated `routes`; `parseImport` accepts BOTH the
  envelope AND legacy raw-appState exports (backward-compatible).
- `db.js` `getAllRoutes`/`putRoutes` dump+restore routes; import is idempotent by
  key (no duplicates on re-import). `sanitizeRoutes` validates lat/lng bounds,
  strips extra fields, caps points-per-route and route-count (malformed/huge
  payloads can't crash import or bloat storage).
- **Also fixed two silent bugs:** `handleImportFile` and `confirmResetAllData`
  read/wrote a dead `hybridAppState` key (real key is `hybrid_engine_v2_state`),
  so import AND reset were no-ops. Now use `STORAGE_KEY` (+ pre-import backup).
- **Cloud-sync decision:** routes are intentionally NOT cloud-synced (large +
  sensitive location data); disclosed in Settings, with JSON export as the
  route-backup / device-migration mechanism.
- Tests: `tests/route_portability.test.js` (round-trip, legacy, missing routes,
  duplicate import, malformed, oversized, coord-range).
## 5. Health/readiness language — ✅
- Removed the one absolute medical claim ("This prevents injury.", risk.js) →
  advisory "…may help reduce injury risk… This isn't a medical diagnosis."
- Other coaching copy already used advisory wording ("consider", "keep it easy").
- Added subtle, non-alarming fitness-not-medical notices IN-FEATURE: the
  acknowledge-required overtraining card and the readiness/recovery hero (which
  already surface the contributing signals + note that readiness is an estimate).

## 6. Creator attribution — ✅
- Real named coaches (Wendler, Rippetoe, nSuns, GZCL, Candito, StrongLifts…)
  were flagged "Verified creator ✓", falsely implying endorsement. There is no
  verification mechanism.
- New `js/programs/attribution.js` is the single source of truth: official →
  "by Helyx", coach → "Inspired by {name}", community → "Community program ·
  inspired by {name}", structural blocks → none. The legacy `author.verified`
  boolean is now ignored everywhere; the ✓ badge + its CSS are removed.
- Tests: `tests/attribution.test.js` (incl. a scan proving NO catalog program
  renders "verified/endorsed" wording).
## 7. Persistence performance — (pending)
## 8. Automated testing & CI — 🟡
- **Fixed false greens:** tests emitted swallowed `window.scrollTo is not a
  function` + `localStorage is not defined` while passing. Completed the DOM
  mocks so those no longer occur; smoke now FAILS on unexpected console errors /
  unhandled rejections (allowlisting only the known mock messages).
- CI (`test.yml`) adds `precache:check`; new `android.yml` runs JVM unit tests
  (incl. `BridgeSafeTest`), Android Lint, and a debug build on PRs. Node pinned
  to 20 across all workflows.
- New manifest/allowlist tests (`precache_manifest`, `web_root_allowlist`) run in
  the normal `npm test`.
- ⏸ Real-browser E2E + offline-PWA browser test: NOT added — no wired
  browser-driver harness in this environment to author+verify them honestly.
  Deferred with the reason; the smoke (real module graph) + unit + manifest
  tests cover the same code paths headlessly.

## 9. Accessibility — 🟡
- Icon-only buttons (search-clear, week stepper, rating stars) got aria-labels;
  key interactive inputs (auth, run/gym entry, search, date, FIT/backup file
  pickers) got accessible names. Zero icon-only buttons remain without a name.
- All `role="dialog"` now declare `aria-modal` + a label (fixed settingsPanel).
- Confirm modal restores focus to the triggering element on close (no
  keyboard/SR dead-end); it already had role/aria-modal + Escape.
- **Android WebView zoom ENABLED** (`setSupportZoom(true)` + built-in zoom,
  controls hidden) — it previously disabled pinch-zoom, blocking low-vision
  users despite the zoom-friendly viewport.
- Tests: `tests/accessibility.test.js` (button names, input names, dialog
  semantics, zoom-permissive viewport) lock these against regression.
- ⏸ Full audit of every screen (contrast ratios, colour-only status, keyboard
  traps, touch-target sizes) not exhaustively completed — needs a real
  browser/AT pass; the static guard covers the highest-impact structural gaps.

## 10. Android release packaging — ✅ (packaging) / 🟡 (wrapper)
- **Explicit production allowlist** (`scripts/stage-web-root.mjs`) replaces the
  broad rsync that copied docs/SQL/audits/tests/config into the APK + Pages site.
  Used by both `release-aab.yml` and `pages.yml`; enforced by
  `tests/web_root_allowlist.test.js`. (Gradle's `copyWebAssets` was already an
  allowlist; the leak was the workflow rsync layered on top of it.)
- WebView content-debugging disabled in release (Item 1); release keeps
  `isMinifyEnabled` + ProGuard.
- Version info aligned (Settings/export/Sentry all read `APP_VERSION`); see
  `docs/versioning.md`.
- ⏸ **Gradle wrapper jar** still missing — can't fetch it offline; documented as
  a one-time `[You]` `gradle wrapper` step. CI unaffected (uses setup-gradle).
- ⏸ Clean release build from fresh checkout: not run here (no Android SDK in the
  audit env); `android.yml` performs it in CI.

## 11. Dependency reproducibility — ✅
- `package-lock.json` un-ignored + committed; production libs pinned to exact
  versions; `engines.node` set. Toolchain matrix + update guidance in
  `docs/versioning.md`; CI uses the documented Node/JDK/Gradle/SDK versions.
