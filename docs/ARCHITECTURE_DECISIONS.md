# Architecture Decision Records — Hardening

Short, dated records of decisions taken during the production-hardening effort.
Format: context → decision → consequences.

---

## ADR-001 — Exact-origin trust check for the privileged WebView
**Date:** 2026-07-13 · **Status:** accepted · **Phase:** 2.1

**Context.** The Android shell runs the whole app from
`https://appassets.androidplatform.net/assets/www/` (served locally by
`WebViewAssetLoader`). This WebView owns three native JavaScript bridges (health,
GPS, notifications). "Is this the app origin?" was answered with
`url.startsWith("https://appassets.androidplatform.net")`, which also matches
`…androidplatform.net.attacker.example` and `…net@attacker.example` — different
origins that would then be treated as in-app and could reach the bridges.

**Decision.** Introduce a single pure helper `TrustedOrigin.isTrusted(url)` that
parses with `java.net.URI` and requires: scheme exactly `https` (case-insensitive),
host exactly `appassets.androidplatform.net` (case-insensitive), no user-info, and a
default/absent port. Fail closed on any parse error or non-strict host. Use it for
page navigation, geolocation grants, and external-link handoff.

**Consequences.** Off-origin navigation now leaves the WebView (opens in the system
browser); geolocation is refused for any non-app origin regardless of the OS
permission state. The helper is Android-dependency-free so it is JVM-unit-testable.
Marginal case-normalisation cost per navigation (negligible).

---

## ADR-002 — Disable Android backup for the app data directory
**Date:** 2026-07-13 · **Status:** accepted · **Phase:** 2.6

**Context.** Workout history, GPS routes and imported health data live in the WebView
data directory (localStorage + IndexedDB). `android:allowBackup="true"` made all of it
eligible for Google Auto Backup (cloud) and device-to-device transfer, moving sensitive
health/location data off-device with no explicit user action.

**Decision.** Set `allowBackup="false"` and `fullBackupContent="false"`, and add
`res/xml/data_extraction_rules.xml` excluding every domain from both `cloud-backup` and
`device-transfer`. Users move data deliberately via in-app export and optional Supabase
sync.

**Alternatives considered.** *Selective backup rules* (keep backup, exclude the
sensitive stores) — rejected because the app has no data we actively want backed up by
the platform, and a blanket off is simpler to reason about and audit. Revisit if a
"restore on reinstall" feature is ever desired (then use encrypted, explicit rules).

**Consequences.** Reinstalling the app or switching phones does not carry data over
automatically; this is the intended privacy posture. Documented in the store-listing
data-safety section is required (`[You]` task).

---

## ADR-003 — External links leave the privileged WebView
**Date:** 2026-07-13 · **Status:** accepted · **Phase:** 2.3

**Context.** Untrusted navigations previously returned `true` from
`shouldOverrideUrlLoading` without launching anything, so external links did nothing.
Letting them load in-place would run third-party content next to the native bridges.

**Decision.** Untrusted `http(s)` URLs open via an explicit `ACTION_VIEW` intent
(system browser). Non-web schemes (`intent:`, custom app schemes, `javascript:`) are
dropped, not forwarded — the app is not a redirector. Missing-browser is handled with a
user-visible toast.

**Consequences.** External content can never execute in the bridged context. A rare
device with no browser shows a toast instead of silently failing.
