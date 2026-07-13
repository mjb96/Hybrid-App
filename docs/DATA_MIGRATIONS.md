# Data Migrations Register

Every migration that touches persisted user data — application state (localStorage +
Supabase blob), IndexedDB routes, weight units, and program schema — is recorded here
with its trigger, transform, recovery path, and test coverage. A migration must never
advance a version stamp on failure and must always leave a recovery path.

---

## Current persisted stores (verified 2026-07-13)

| Store | Location | Key / shape | Version mechanism |
|---|---|---|---|
| App state | localStorage `appState` + Supabase `user_data.state_data` (JSON blob) | one `appState` object | `appState.schemaVersion` via `js/state/migrations.js`; cloud `updated_at` column |
| GPS routes | IndexedDB (`js/db.js`) | object store keyed `"week_day"` (e.g. `"1_mon"`), value = coord array | DB version 1, no in-store record version |
| Cloud sync marker | localStorage | last-seen `updated_at` | `getStoredCloudVersion` / `setStoredCloudVersion` |

Existing safeguards already in the tree:
- `snapshotLocalBeforeCloudPull(rawLocal)` keeps a pre-cloud-pull local backup.
- `sync-guard.js` + `sync-conflict-ui.js` raise a warn-and-choose modal when the
  server row is newer than last-seen before an upsert (no longer a silent clobber).
- `js/state/migrations.js` performs step-wise `appState` migrations (v3 adopts legacy
  weeks into one activation).

---

## MIG-2026-07-A (Phase 2) — no data migration

Android-shell-only (Kotlin + manifest + XML); reads/transforms no persisted store.

## MIG-2026-07-B · IndexedDB routes v1 → v2  — **SHIPPED** (Phase 3.1/3.2)

- **Trigger:** `onupgradeneeded` when `js/db.js` opens `HybridTrainingDB` at v2.
- **Transform:** each legacy `"<week>_<day>"` row in `runMaps` → a `routes` record
  `{id: uuid(), activationId:'legacy', programId:null, week, day, startTs, updatedTs,
   version:2, legacyKey, slotKey, coordinates}` (via `makeRouteRecord`). Empty rows
  skipped. A `__migration_v2__` meta row records the count.
- **Non-destructive:** the legacy `runMaps` store is **retained** (never deleted), so a
  failed/partial migration loses nothing and old data stays recoverable. Reads fall
  back active→legacy→raw-v1, so pre-migration routes display until overwritten.
- **Blocked upgrade:** `openDB` `onblocked` → reject with a recognisable error; the
  calling op returns its safe default (null/undefined) instead of hanging. Late
  connections (block cleared after reject) are closed so nothing leaks;
  `onversionchange` closes our connections so we never block a future upgrade.
- **Rollback/recovery:** v2 records are additive; the v1 store is intact, so reverting
  code to v1 still reads all original routes. Export (`{week_day:coords}`) is unchanged.
- **Tests (`tests/route_db_migration.test.js`, fake-indexeddb):** legacy migration
  survives + readable; two activations sharing Week1/Mon don't overwrite; slot upsert
  (no duplicate); delete clears the slot; export→import round-trip; blocked-upgrade
  fail-safe. Pure identity/transform: `tests/route_identity.test.js`.

---

## Planned migrations (designed, not yet shipped) — see HARDENING_PLAN.md

### PLAN-B · Application-state transactional migrations (Phase 4.1) — **not shipped**
- Each step: deep-clone → validate prerequisites → apply one version → validate output
  → bump version only on success → on failure preserve original + quarantine malformed
  weeks into a named recovery collection + surface diagnostic. No silent partial save.

### PLAN-C · Weight-unit canonicalisation to kg (Phase 7.1) — **not shipped**
- Record canonical unit + migration version in state; convert logged sets / PRs /
  e1RM / bodyweight atomically at a single version step; keep a pre-migration backup;
  validate converted ranges; block unit-toggle from reinterpreting raw historical
  numbers. Tests: kg→lb→kg round trip, bodyweight/PR/tonnage conversion.

### PLAN-D · Program schema versioning (Phase 6) — **not shipped**
- Introduce `schemaVersion` contract + legacy adapter; existing built-in and custom
  programs adapted on read; logged sets / activation history / custom names preserved.

---

## Rules for every migration in this project
1. Never advance the version stamp unless the transform validated successfully.
2. Never delete malformed/unconvertible records — quarantine with a reason.
3. Always keep a pre-migration backup or an untouched source store until success.
4. Surface failures to the UI/diagnostics; never silently continue on the new version.
5. Add a test for both the success path and the failure/rollback path.
