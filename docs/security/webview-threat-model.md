# Helyx Android WebView — Threat Model & Hardening

_Last reviewed: 2026-07-10._

Helyx ships as a custom Android **WebView shell** (not Capacitor/TWA). The web
layer runs bundled assets and talks to three native `@JavascriptInterface`
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

## Remote code — the main residual risk, now contained

The web app pulls a small number of third-party libraries. Left unpinned/uncsp'd
these ran with full bridge access. Mitigations:

1. **Content-Security-Policy** (meta tag in `index.html`):
   `script-src 'self' https://cdn.jsdelivr.net` and `object-src 'none'` —
   arbitrary remote scripts, inline scripts, and plugins **cannot execute**.
   `frame-ancestors 'none'` blocks clickjacking; `base-uri 'self'` blocks base
   tag injection; `connect-src` is limited to Supabase + Sentry + jsdelivr.
2. **Leaflet is bundled** (`js/vendor/leaflet/`, pinned to the version in
   `package.json`) — no CDN fetch, works offline.
3. **Supabase is exact-version-pinned + SRI-checked**
   (`@2.45.4/dist/umd/supabase.js`, `integrity=sha384-…`). A compromised or
   hijacked CDN cannot substitute different code: the browser rejects any script
   whose hash doesn't match.
4. **Sentry is exact-version-pinned** and DSN-gated (inert without a DSN).

> Deferred: fully vendoring the webpack-chunked Supabase UMD build was **not**
> done because its runtime `publicPath` behaviour can't be verified in this repo
> without a real browser, and breaking auth/sync would risk user data. Pin+SRI
> gives equivalent tamper-resistance with zero behavioural change.

## Bridges (`addJavascriptInterface`)

Three bridges are injected: `HybridHealthBridge`, `HybridGpsBridge`,
`HybridNotifyBridge`. Because CSP + bundled assets + external-link routing mean
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
- Manual device checks (see the final report) confirm external links open in the
  browser and that GPS/Health/notifications still function under CSP.

## Assumptions that remain the user's responsibility

- Supabase **RLS** is the server-side isolation control (proven separately,
  2026-07-02). The anon key is public by design and safe **only** while RLS is
  enforced.
- Release builds must keep `isDebuggable=false` and WebView debugging off
  (enforced in `MainActivity` — see below).
