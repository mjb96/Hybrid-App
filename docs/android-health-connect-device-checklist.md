# Android Health Connect permission-matrix device acceptance (R14)

Use the debug APK from `android/app/build/outputs/apk/debug/app-debug.apk` or the
PR artifact, on a **physical** phone with Google Health Connect installed and
seeded with real Steps, Resting Heart Rate, HRV, and Sleep data. Run the matrix
on both a **minimum-supported** device (Android 8 / API 26) and a **current**
device. Record device model, Android version, Health Connect version, app commit,
and result for every row. Do **not** mark R14 device-verified until every row
passes on real hardware — this file is a `[You]` release artifact; engineering
must not simulate it as done.

## Supported-field contract under test

Helyx supports **exactly four** Health Connect fields, and nothing else may be
requested or read (see `js/health/health-fields.js` and
`android/app/src/main/java/com/helyx/app/HealthFieldContract.kt`):

| Field id    | Settings toggle              | Health Connect permission                              |
|-------------|------------------------------|--------------------------------------------------------|
| `steps`     | Daily Steps                  | `android.permission.health.READ_STEPS`                 |
| `restingHR` | Resting Heart Rate           | `android.permission.health.READ_RESTING_HEART_RATE`    |
| `hrv`       | Heart Rate Variability (HRV) | `android.permission.health.READ_HEART_RATE_VARIABILITY`|
| `sleep`     | Sleep Duration               | `android.permission.health.READ_SLEEP`                 |

Plus `android.permission.health.READ_HEALTH_DATA_HISTORY` (enables the >30-day
backfill; the app must still work when it is denied). VO₂ max, Weight, Exercise,
Active Calories and raw Heart Rate must **never** appear in the Health Connect
permission sheet or in `Settings → Apps → Helyx → permissions`.

## Matrix

| # | Check | Exact action | Pass evidence |
|---|---|---|---|
| 1 | Only-selected request | In Settings turn OFF HRV + Sleep, leave Steps + Resting HR ON, tap **Connect**. | The Health Connect sheet lists **only** Steps and Resting Heart Rate (plus History). HRV and Sleep are absent. |
| 2 | Grant all selected | Re-enable all four, tap Connect, grant everything. | Status → **Connected**; each toggle shows `Synced · N days`; Home/Recovery show real Steps/RHR/HRV/Sleep. |
| 3 | Deny one field | Revoke Sleep in Health Connect (Settings → Health Connect → App permissions → Helyx), Sync Now. | Sleep toggle shows **Permission needed**; the other three still show `Synced`; no crash; no fake sleep value appears. |
| 4 | Deny everything | Revoke all four in Health Connect, tap Connect and deny at the sheet. | Toast “No Health Connect permissions were granted”; status stays **Not connected**; no data written. |
| 5 | Revocation after connect | While connected, revoke all Helyx permissions in Health Connect, return to Helyx, Sync Now. | Every enabled toggle shows **Permission needed**; previously-synced history is preserved (not wiped); no fake fresh values. |
| 6 | No-data honesty | Grant permissions on a Health Connect profile that has **no** records for the selected fields. | Toast “Connected — no recent data found for the selected types”; toggles show **No data yet**; no zero/placeholder metrics are shown as real. |
| 7 | Deselect stops reading | Connected with all four; turn OFF Steps, Sync Now, then inspect Health Connect access log. | No new Steps read occurs after the toggle is off; Steps status shows **Off**; existing steps history is retained but not updated. |
| 8 | History denied, recent works | Grant the four field permissions but DENY “Access all previous data”. | Recent (≤30 day) data still syncs; the app degrades to a 30-day window without error. |
| 9 | Partial read error | Trigger a read failure for one field (e.g. Health Connect update mid-sync / provider error). | That field shows **Read error**; the others still sync; app does not report overall failure or fake the field. |
| 10 | Offline behavior | Airplane mode on, open Settings, Sync Now. | Health Connect is local, so reads still work OR a clear local message shows; no misleading “cloud” error; app remains usable. |
| 11 | Web/PWA has no fake controls | Open the PWA in a browser (no native bridge). | Connect shows “Health Connect is only available in the Android app”; no phantom connected state. |
| 12 | Permission-usage screen | From Health Connect, open Helyx’s “See app data / why” rationale. | The `VIEW_PERMISSION_USAGE` screen opens (activity-alias) and lists only the four supported data types. |
| 13 | Reinstall/upgrade | Upgrade over a prior build that had legacy toggles (incl. VO₂ max). | No VO₂ max toggle remains; previously-stored health history is intact; syncFields normalize to the four supported fields. |

## Evidence log (fill before Play beta)

- Device / Android (min-supported):
- Device / Android (current):
- Health Connect app version:
- App commit:
- Permission sheet contents for row 1 (screenshot):
- Row 3 / 5 revocation screenshots:
- Row 6 no-data screenshot:
- Result / notes:
