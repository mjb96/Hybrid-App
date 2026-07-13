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

## MIG-2026-07 (this session)

No user-data migration shipped this session. Phase 2 changes are Android-shell-only
(Kotlin + manifest + XML) and do not read or transform any persisted store.

---

## Planned migrations (designed, not yet shipped) — see HARDENING_PLAN.md

### PLAN-A · IndexedDB routes v1 → v2 (Phase 3.1/3.2)  — **not shipped**
- **Trigger:** `onupgradeneeded` when opening at version 2.
- **Transform:** for each legacy `"<week>_<day>"` entry, create a record
  `{id: uuid(), legacyKey, activationId: <unknown/legacy>, programId, localDate?,
   startTs?, updatedTs: now, version: 2, payload: coords}`. Keep `legacyKey` as
  metadata. Do not delete the source until the new record is written; on collision keep
  both (suffix the id).
- **Recovery:** legacy store retained read-only until migration success is recorded;
  export includes both shapes during the transition.
- **Failure handling:** blocked upgrade (`onblocked`) and `versionchange` surface a
  diagnostic to the UI; the app continues on v1 rather than corrupting v2.
- **Tests (planned):** legacy migration, two activations same week/day, two routes one
  calendar day, blocked upgrade, deletion, export/import round-trip.

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
