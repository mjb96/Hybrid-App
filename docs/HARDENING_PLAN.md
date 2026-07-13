# Helyx / Hybrid Engine — Production Hardening Plan

Status legend: `[x]` implemented + tested · `[~]` partially done / pre-existing
mitigation · `[ ]` verified & planned, not yet implemented · `[disproven]` finding
does not hold against current code.

This plan is derived from **direct inspection of the current repository** (branch
`claude/hybrid-engine-hardening-lc8n4k`), not from an earlier audit's line numbers.
Each item records verified current behaviour, affected files/functions, the fix,
migration implications, test requirements, risk, and dependencies.

Baseline (2026-07-13, this branch, pre-change):
`npm run typecheck` clean · `npm test` → 742 pass / 0 fail · `npm run smoke` OK ·
`npm run precache:check` up to date. Working tree clean. Node v22.

---

## Phase 1 — Baseline & safety  `[x]`
- Verified: full suite green (above). Dependencies were not installed; ran
  `npm install` (23 pkgs) then the suite.
- Subsystem map recorded in `docs/HARDENING_PROGRESS.md` §Phase 1.
- No uncommitted user work existed (clean tree).

---

## Phase 2 — Android WebView security

### 2.1 Exact trusted-origin validation  `[x]`
- **Verified current behaviour:** `MainActivity.AppWebViewClient.shouldOverrideUrlLoading`
  used `!url.startsWith(APP_ORIGIN)` where `APP_ORIGIN =
  "https://appassets.androidplatform.net"`. Prefix match → lookalike authorities
  (`…androidplatform.net.attacker.example`, `…net@attacker.example`) satisfy it.
- **Fix:** new pure helper `android/.../TrustedOrigin.kt` parses with `java.net.URI`
  and requires scheme==https, host==exact (case-insensitive), no user-info, default
  port. Wired into navigation, geolocation, external-link handling.
- **Tests:** `TrustedOriginTest.kt` (valid, lookalike, credentials, scheme, port,
  malformed). Logic proven on the JVM (25/25) since the Android SDK is not installed
  in this environment to run the Gradle `test` task.
- **Migration:** none. **Risk:** low. **Deps:** foundation for 2.2/2.3.

### 2.2 Geolocation permission gating  `[x]`
- **Verified:** `onGeolocationPermissionsShowPrompt` granted to *any* `origin` as
  long as the Android runtime permission was held — it never checked the origin.
- **Fix:** reject (`callback.invoke(origin, false, false)`) unless
  `TrustedOrigin.isTrusted(origin)`; only then consult runtime permission.
- **Tests:** covered by `TrustedOriginTest`; the branch is a one-line gate.
- **Risk:** low. **Deps:** 2.1.

### 2.3 External URL handling  `[x]`
- **Verified:** non-app URLs returned `true` from `shouldOverrideUrlLoading` but
  **no intent was launched** → external links silently did nothing.
- **Fix:** `openExternally(uri)` launches `ACTION_VIEW` for http/https only (drops
  intent:/custom schemes), `FLAG_ACTIVITY_NEW_TASK`, `ActivityNotFoundException`
  handled with a toast.
- **Risk:** low. **Deps:** 2.1.

### 2.4 Native bridge exposure  `[~]`
- **Verified:** bridges (`HybridHealthBridge`, `GpsBridge`, `NotifyBridge`) already
  sanitise the echoed `callbackId` via `BridgeSafe.callbackId` (allowlist regex) and
  `resolveCallback` escapes JSON. `addJavascriptInterface` is only reachable from the
  asset origin because off-origin navigation is now blocked (2.1/2.3). Remaining
  hardening: validate `saveTextFile` filename against path traversal; bound payload
  size; confirm health/GPS values are not logged. **Planned.**
- **Risk:** medium. **Deps:** 2.1.

### 2.5 Remote scripts in the privileged context  `[ ]` (shared with 8.1)
- **Verified:** `js/garmin.js` dynamically `import()`s `https://esm.sh/buffer` and
  `https://esm.sh/fit-file-parser`. `esm.sh` is **not** in the `index.html`
  `script-src`/`connect-src` CSP → the import is CSP-blocked, so FIT import is
  currently non-functional in the shipped app, *and* if allowed it would be remote
  code execution inside the bridged WebView. Fix in 8.1 (vendor + pin locally).
- **Risk:** high (RCE surface + broken feature). **Deps:** none.

### 2.6 Backup / local privacy  `[x]` (backup) · `[ ]` (account-deletion structure)
- **Verified:** `AndroidManifest.xml` had `android:allowBackup="true"` → WebView
  localStorage + IndexedDB (health, GPS, workouts) eligible for Auto Backup /
  device transfer.
- **Fix:** `allowBackup="false"`, `fullBackupContent="false"`,
  `dataExtractionRules="@xml/data_extraction_rules"` (new file excludes all domains
  from cloud-backup + device-transfer). Decision recorded as ADR-002.
- **Still planned:** structured account-deletion results (2.6 second half) — see
  Phase 3.5 below and `clearRouteDatabase()`.
- **Risk:** low.

---

## Phase 3 — Stable identity & synchronization

### 3.1 Stable record IDs  `[ ]`
- **Verified:** `js/db.js` stores GPS routes in object store keyed by `"week_day"`
  (`saveMapToDB(week, day, …)` → `"1_mon"`). Collides across program activations and
  multiple same-day runs; comment at line 42 documents the format.
- **Fix:** add UUID (`crypto.randomUUID()` + fallback) identity for activation,
  workout session, run/activity, route, custom program. Route record to carry
  `{id,userId,activationId,programId,workoutSessionId,localDate,startTs,updatedTs,
  version,payload}`.
- **Migration:** IndexedDB v2 upgrade (3.2). **Risk:** high (data at rest). **Deps:** none.

### 3.2 IndexedDB migration  `[ ]`
- Non-destructive version bump; migrate legacy `week_day` values into new shape with
  generated ids; keep legacy coords as metadata; collision-preserve; record migration
  version/outcome; handle blocked/`versionchange`. Tests enumerated in the task.
- **Risk:** high. **Deps:** 3.1.

### 3.3 Local/cloud sync decision  `[~]`
- **Verified (partial mitigation already exists):** `js/state.js` keeps a
  server-managed `updated_at`, `snapshotLocalBeforeCloudPull`, and `sync-guard.js` /
  `sync-conflict-ui.js` raise a warn-and-choose modal when the server is newer than
  last-seen before an upsert (lines ~584–614, 734–765). This is blob-level LWW but
  **no longer silent**.
- **Remaining gap:** the startup load path does not implement the full 8-case
  decision table (both-changed true conflict, offline pending, auth-expiry
  preserve). **Planned:** revision metadata (localRev, lastLocalMod, lastSyncTs,
  cloudRev, dirty) + explicit decision.
- **Risk:** high. **Deps:** 3.1 for record-level; blob-level can proceed independently.

### 3.4 Conflict granularity  `[ ]`
- Record-level merge for sessions/routes/bodyweight/wellness/custom programs/settings
  with conflict-copy preservation. Intermediate safe layer acceptable. **Deps:** 3.1, 3.3.

### 3.5 Account deletion structured results  `[ ]`
- **Verified:** `clearRouteDatabase()` (js/db.js) resolves `false` when IndexedDB is
  unavailable and the deletion is fire-and-forget; account-deletion flow needs to
  surface partial failure (routes/cloud/auth/local/caches) and allow retry. Tests in
  `tests/account_delete.test.js` exist — extend for blocked-deletion + partial-failure.
- **Risk:** medium.

---

## Phase 4 — Migration safety & state architecture  `[ ]`
- `js/state/migrations.js` transactional per-step (deep clone, validate in/out, bump
  version only on success, quarantine malformed weeks instead of dropping).
- Separate store / persistence / cloud / registry / activation / migrations / memo /
  nav responsibilities without a framework rewrite (compat exports retained).
- `engine.js`: pass state snapshot + explicit program/date/unit context instead of
  reading singletons; keep DOM/persistence out.
- Program resolution: explicit result union instead of silent `hybrid_engine`
  fallback. Memo signatures include every result-affecting field.
- **Deps:** informs 5/6/7. **Risk:** high (broad surface).

## Phase 5 — Sports-science correctness  `[ ]`
Verified targets to inspect: `js/brain/load_models.js`,
`js/analytics/calculations/load-calcs.js`, `js/analytics/scoring/readiness-scoring.js`,
`js/brain/recommendations.js`, `js/home/dashboard-model.js`.
- 5.1 EWMA stops at local today (no future days). 5.2 data-quality metadata
  (`complete/estimated/missingDuration/missingRpe/insufficientBaseline`). 5.3 no
  chronic baseline → `null`/insufficient, never ACWR 0 "optimal". 5.4 keep real
  zero-load weeks. 5.5 readiness confidence tier + min signals. 5.6 HRV/RHR baseline
  excludes today. 5.7 Foster monotony from *daily* loads within the week. 5.8 neutral
  ACWR wording. 5.9 outlier bounds. **Risk:** medium; each is a bounded, well-tested unit.

## Phase 6 — Versioned program schema  `[ ]`
- Explicit `schemaVersion` contract for strength + running prescriptions; validator +
  normaliser + legacy adapter enforced at register/create/edit/import/activate/
  materialise/execute/analytics. Transactional activation. **Deps:** 4. **Risk:** high.

## Phase 7 — Power-user integrity  `[ ]`
- 7.1 canonical kg storage + safe legacy unit migration (backup + validate + version).
- 7.2 stable exercise IDs + alias, history follows exercise. 7.3 PR provenance
  (computed vs manual). 7.4 diagnosis == prescription (structured progression output).
- 7.5 debounced builder persistence (a `persistence_debounce.test.js` already exists —
  verify the builder actually uses it). **Risk:** medium/high (unit migration).

## Phase 8 — Android workflow completion  `[ ]`
- 8.1 vendor+pin FIT parser locally (also resolves 2.5); works offline under CSP;
  update precache. 8.2 native export bridge path (`saveTextFile` exists — wire export).
  8.3 navigation/surface stack for back. 8.4 SW update coordinator (guard active
  workout/run/edit). 8.5 generated cache/version token; namespaced cache deletion.
- **Risk:** medium.

## Phase 9 — Onboarding & first-run  `[ ]`
- Value-in-2-min, program preview before activation, activation-failure handling (no
  empty catches), provisional Hybrid Score labelling, guided custom-program starts,
  first-workout destination. Existing tests: `onboarding_*`, `starter_programs`.
- **Risk:** low/medium. **Deps:** 6 (schema), 4 (activation).

---

## Cross-cutting completion standard (from the brief)
- [x] No untrusted page can reach the privileged bridges (2.1–2.3 block off-origin
  navigation + bridge origin assumptions).
- [ ] Program activation cannot silently succeed after failure (6.4).
- [ ] Unit changes cannot reinterpret historical values (7.1).
- [ ] Route identity cannot collide on week/day (3.1/3.2).
- [ ] Readiness cannot recommend a PR from one low-confidence signal (5.5).
- [ ] Current-week EWMA excludes future days (5.1).
- [ ] Migration failure cannot be stamped migrated (4.1).
- [ ] FIT import without remote executable imports (8.1/2.5).
- [x] Android export has a supported native path — `saveTextFile` bridge exists;
      wiring/validation tracked in 8.2.
