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
## 5. Health/readiness language — (pending)
## 6. Creator attribution — (pending)
## 7. Persistence performance — (pending)
## 8. Automated testing & CI — (pending)
## 9. Accessibility — (pending)
## 10. Android release packaging — 🟡 (debug flag done; asset allowlist pending)
## 11. Dependency reproducibility — 🟡
- `package-lock.json` un-ignored + committed; production libs pinned to exact
  versions in `package.json`; `engines.node` documented.
