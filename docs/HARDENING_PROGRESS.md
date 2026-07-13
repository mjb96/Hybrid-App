# Hardening Progress Log

Live status for the production-hardening effort. Updated as work lands, not only at
the end. See `HARDENING_PLAN.md` for the full item list and verified findings.

---

## Phase 1 — Baseline  ✅ complete

**Baseline validation (2026-07-13, branch `claude/hybrid-engine-hardening-lc8n4k`):**

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | clean |
| Tests | `npm test` | **742 pass / 0 fail** |
| Smoke import | `npm run smoke` | OK |
| Precache manifest | `npm run precache:check` | up to date |

- `node_modules` was absent → `npm install` (23 pkgs). Working tree clean; no
  unrelated user work overwritten. Node v22.22.

**Subsystem map (verified by inspection):**
- App state: `js/state.js` (847 lines) — one `appState` object → localStorage (source
  of truth) + Supabase `user_data` single JSON blob via `upsert`.
- Local persistence: localStorage in `js/state.js`; debounced autosave (line ~465).
- IndexedDB routes: `js/db.js` (125 lines), store keyed `"week_day"`.
- Supabase sync: `js/state.js` + `js/state/supabase.js` + `js/state/auth.js` +
  `js/state/sync-guard.js` + `js/state/sync-conflict-ui.js`.
- Programs/activation: `js/state.js` (`startProgramActivation`),
  `js/state/activation-identity.js`, `js/programs/catalog/*`.
- Workout session identity: activation id + `week.activationId` (no per-session UUID).
- Analytics/Brain: `js/analytics/**`, `js/brain/**`, `js/home/dashboard-model.js`.
- Android: `android/app/src/main/java/com/helyx/app/*` (MainActivity + 3 bridges).
- Service worker: `sw.js` (10 KB) + `scripts/gen-precache.mjs`.

---

## Phase 2 — Android WebView security  🟢 core done (2.1–2.3, 2.6 backup)

| Item | Status | Files | Tests | Validation |
|---|---|---|---|---|
| 2.1 Exact origin validation | ✅ | `TrustedOrigin.kt` (new), `MainActivity.kt` | `TrustedOriginTest.kt` (new) | Logic proven on JVM 25/25 (see below) |
| 2.2 Geolocation origin gate | ✅ | `MainActivity.kt` | via `TrustedOriginTest` | code review |
| 2.3 External URL intent | ✅ | `MainActivity.kt` (`openExternally`) | — (needs instrumented test) | code review |
| 2.4 Bridge hardening | ⏳ planned | — | `BridgeSafe` covers callbackId today | — |
| 2.5 Remote FIT scripts | ⏳ planned (→8.1) | `js/garmin.js`, `index.html` CSP | — | finding confirmed |
| 2.6 Backup off | ✅ | `AndroidManifest.xml`, `data_extraction_rules.xml` (new) | manifest review | — |
| 2.6 Account-deletion structure | ⏳ planned | `js/db.js`, deletion flow | `account_delete.test.js` | — |

**JVM verification of the origin logic** (Android SDK/Gradle not installed here, so
the Kotlin `test` task can't run in-container; the helper is pure `java.net.URI` and
was ported verbatim to a JVM harness):

```
25/25 PASS — valid app origins, lookalike hosts (…net.attacker.example),
embedded credentials (…net@attacker.example, user:pass@…), http/file/javascript/data
schemes, non-default ports, percent-encoded host, empty/malformed.
```

**Remaining risks (Phase 2):** the Kotlin unit tests and the intent/geolocation
behaviour need one run on the Android toolchain / a device (instrumented). The FIT
remote-import (2.5) is still present and CSP-blocked — tracked in 8.1.

**Regression check:** Android-only changes; JS suite unaffected (re-run pending in the
Phase-2 commit). No JS files changed in 2.1–2.3/2.6.

---

## Phase 5 — Sports-science correctness  🟡 5.7 + 5.8 done

| Item | Status | Files | Tests | Validation |
|---|---|---|---|---|
| 5.7 Foster monotony from daily loads | ✅ | `load-calcs.js`, `metrics-load.js` (`weekDailyLoads`) | `foster_monotony.test.js` | `npm test` 749 pass |
| 5.8 Neutral acute:chronic wording | ✅ | `load-calcs.js` (`trainingLoadStatus`), `insight-engine.js` | `foster_monotony.test.js` | same |
| 5.1–5.6, 5.9 | ⏳ planned | see plan | — | — |

- **5.7 root cause:** `trainingMonotony` averaged a series of *weekly totals* —
  Foster's monotony is mean/SD of *daily* loads within one week. Fixed to daily
  method; strain follows. Returns null (not a huge number) when SD=0 or <2 training
  days. Verified numerically (daily `[480,0,350,0,240,0,0]` → monotony 0.8, strain
  856; all-equal → null; single-day → null).
- **5.8:** `trainingLoadStatus` now emits "Insufficient baseline / Below / Near /
  Above / Well above / Substantially above baseline" (zones unchanged); the danger
  insight is reworded from "Risk of overtraining injury is elevated" to
  load-management guidance. Remaining: `view-recovery.js` and `briefing.js` compute
  their own duplicate status strings — de-dup tracked under Phase 4/7.4.

**Regression:** full suite 749 pass (was 742) after this slice. No existing test
asserted the old monotony math or status strings.

## Phases 3, 4, 6–9 — ⏳ planned, not yet implemented this session

Verified current behaviour and concrete remediation steps are recorded in
`HARDENING_PLAN.md`. Key confirmed findings so the next session starts from evidence,
not assumption:

- **3.1** `js/db.js` routes keyed `"week_day"` → collisions across activations and
  same-day runs. **Confirmed.**
- **3.3** `js/state.js` already has a non-silent sync guard (`updated_at` + snapshot +
  warn-and-choose modal). The *silent* clobber is already mitigated; the full 8-case
  startup decision table and record-level merge are the remaining work. **Confirmed.**
- **2.5/8.1** `js/garmin.js` imports the FIT parser from `esm.sh`, which is absent from
  the `index.html` CSP → feature is broken as shipped and would be RCE if allowed.
  **Confirmed.**

These three are the highest-priority remaining items (data-at-rest identity, sync
correctness, remote-code surface) and should lead the next session.
