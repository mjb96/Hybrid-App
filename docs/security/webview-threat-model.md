# Helyx Android WebView — Threat Model & Hardening

_Last reviewed against the shipped code: 2026-08-03._

Helyx ships as a custom Android **WebView shell** (not Capacitor/TWA). The web
layer runs bundled assets and talks to five native `@JavascriptInterface`
bridges. Because those bridges reach real device capabilities (location, Health
Connect, notifications, file saving), the WebView is a **privileged execution
context** and is treated as a trust boundary.

## Assets & origins

- The app loads `https://appassets.androidplatform.net/assets/www/index.html`
  via `WebViewAssetLoader` (`MainActivity.configureWebView`). Content is served
  from the **bundled APK assets**, not a remote server — there is no live
  origin an attacker can MITM into the privileged context.
- `shouldOverrideUrlLoading` keeps only the `appassets.androidplatform.net`
  origin in-WebView; **every other URL opens in the user's external browser**,
  so a tapped external link can never run in the privileged context.
- `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs` are
  **false**; zoom controls off; overscroll off. No `file://` access is needed
  because assets are served over the virtual https origin.

## Executable code — bundled and origin-restricted

Production runtime JavaScript is shipped inside the signed app/PWA bundle.
Third-party code does not execute from a CDN:

1. **Content-Security-Policy** (meta tag in `index.html`):
   `script-src 'self'` and `object-src 'none'` — arbitrary remote scripts,
   inline scripts, and plugins **cannot execute**.
   `frame-ancestors 'none'` blocks clickjacking; `base-uri 'self'` blocks base
   tag injection. Network destinations are separated by type: `connect-src` is
   limited to Supabase and Sentry, `img-src` allows the approved map tiles, and
   font/style origins allow the configured Google font.
2. **Leaflet, Supabase, and Sentry are vendored** under `js/vendor/`, pinned to
   exact package versions, and included in the service-worker precache.
3. **Vendored Supabase bytes are hash-checked in tests**, and the service worker
   has a regression guard that rejects remote-JavaScript cache entries.
4. **Sentry remains DSN-gated** and inert without an explicit configuration.

## Bridges (`addJavascriptInterface`)

Five bridges are injected: `HybridHealthBridge`, `HybridGpsBridge`,
`HybridNotifyBridge`, `HybridFileExportBridge`, and
`HybridAutoBackupBridge`. Because CSP + bundled assets + external-link routing mean
**only first-party code executes in the WebView**, the bridges are only
reachable by trusted code. Defence-in-depth applied on top:

- **Parameter validation at the boundary.** Callback IDs passed from JS and
  echoed back into `evaluateJavascript` are sanitised to `[A-Za-z0-9_-]`
  (`BridgeSafe.callbackId`); a malformed id is rejected instead of being
  interpolated into a JS string (removes any script-injection vector via the
  callback channel). Numeric args (`getPointsSince(seq)`) are typed `Int`.
- **Least privilege.** Each bridge exposes only the methods the web layer calls
  (permission query/request, start/stop/drain for GPS, show/schedule for
  notifications, read/save for health/file). No generic "eval", "exec", or
  filesystem-path methods are exposed.
- **No sensitive data returned unnecessarily.** GPS returns only buffered
  fixes for the active run; health returns only the metrics the app requested.

## Verification

- `tests/bridge_input.test.js` exercises the callback-id sanitiser contract and
  proves the app only ever generates safe ids.
- `scripts/check-precache.mjs` / `tests/precache_manifest.test.js` prove the
  offline bundle is complete (no privileged screen silently fetches remote JS).
- `tests/csp_vendored_runtime.test.js` proves `script-src 'self'`, checks the
  reviewed Supabase bytes, and rejects CDN/remote-JS entries in the service worker.
- Manual device checks in `docs/android-device-checklist.md` remain required to
  confirm external-link routing and GPS/Health/notification/export/backup
  behaviour on the signed candidate.

## Assumptions that remain the user's responsibility

- Supabase **RLS** is the server-side isolation control (proven separately,
  2026-07-02). The anon key is public by design and safe **only** while RLS is
  enforced.
- Release builds must keep `isDebuggable=false` and WebView debugging off
  (enforced in `MainActivity` — see below).
