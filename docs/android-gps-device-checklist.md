# Android GPS durability and route-quality device acceptance (R15)

Use the debug APK from `android/app/build/outputs/apk/debug/app-debug.apk` or the
PR artifact on two **physical** phones: one minimum-supported Android 8 / API 26
device and one current Android device. Record device model, Android version,
app commit and result for every row. Do not mark R15 device-verified until every
row passes on hardware — this is a `[You]` release artifact and engineering must
not simulate it as done.

Before each destructive row, finish or discard any run you want to keep. Use a
short, known outdoor route where the measured distance can be compared with a
trusted watch or mapped reference. Open an activity's **Breakdown → GPS quality
audit** to capture accepted/filtered points, segment breaks, average accuracy,
confidence and removed distance.

## Matrix

| # | Check | Exact action | Pass evidence |
|---|---|---|---|
| 1 | Foreground baseline | Start a 10–15 minute run, keep Helyx open, follow the known route, stop and save. | Timer/route advance; one exact activity is saved; map is plausible; GPS audit is present; filtered distance is within the agreed tolerance of the reference. |
| 2 | Screen lock | Start another run, lock the screen for at least 5 minutes while moving, unlock and return. | Android foreground-service notification stays visible; buffered points catch up; locked movement is present; no straight-line teleport inflates distance. |
| 3 | Background activity recreation | While tracking, switch apps for 3 minutes and enable Android Developer options → **Don't keep activities** (or let the activity be reclaimed), then reopen Helyx. | Native tracking continues; Helyx reconstructs the live run from the journal; no duplicate activity is created. |
| 4 | Process/service restart | While tracking, run `adb shell am kill com.helyx.app`, wait 30 seconds, then reopen Helyx. If the OEM prevents that command from killing a foreground process, use its battery/process-kill control and record the method. | Helyx shows an explicit recovered, paused run at the last durable GPS fix; the unseen gap is not counted; Resume and Finish both work. |
| 5 | Force-stop recovery | While tracking, run `adb shell am force-stop com.helyx.app`, then manually relaunch. | The durable journal is offered as recover/pause-or-finish data; the app never claims uninterrupted tracking during force-stop; no earlier saved activity is overwritten. |
| 6 | Pause/resume distance | Track 2 minutes, Pause, move at least 200 m, Resume, then move another 200 m and save. | Movement while paused adds no distance; audit shows a segment break; post-resume movement is measured normally. |
| 7 | Finalizing recovery | Stop a native run, then kill the app during the save/return transition and reopen. | Run reopens in an explicit finishing state or is already saved exactly once; the native journal remains protected until route + state save acknowledgement. |
| 8 | Damaged recovery choice (debug build) | Start a run, force-stop it, then run `adb shell run-as com.helyx.app sh -c 'truncate -s 1 files/gps-active-session/active.meta'` and relaunch. | Helyx reports damaged recovery and offers **Keep protected** or **Discard damaged recovery**; it does not start a replacement run silently. Test Keep first, then explicitly Discard. |
| 9 | Poor accuracy | Track beside tall buildings/tree cover or temporarily obstruct sky view, then return to open sky and finish. | Poor-accuracy fixes are filtered; the route resumes from the last accepted anchor; the audit shows rejected fixes and honest medium/low confidence when warranted. |
| 10 | Mock teleport | On a debug phone with a mock-location app, inject a jump of at least 1 km between normal fixes, return to the real route, then save. | The jump is counted under `teleport`, does not inflate filtered distance, and later valid movement continues from the prior accepted anchor. |
| 11 | Walk ceiling | Quick Start a Walk, inject or produce an implausible >18 km/h location jump, then continue at walking speed. | The implausible segment is filtered using the stricter walk ceiling; normal walking fixes continue. |
| 12 | Same-day isolation | Save two GPS activities on the same day, then delete one from Activities and use Undo once; repeat and let deletion complete. | Both have distinct maps/audits; Undo restores the exact activity; final deletion removes only its route and leaves its sibling intact. |
| 13 | Export/import | Export JSON after rows 1 and 12, clear app data, then import it. | Both session IDs, filtered distances, routes and GPS quality audits return; the export reports `version: 4`; no duplicate route is created on repeat import. |
| 14 | Offline completion | Start, track and save in airplane mode with GPS enabled. | Route and run save locally; Android journal clears only after save; no cloud-dependent success or data loss. |

## Evidence log (fill before Play beta)

- Minimum device / Android:
- Current device / Android:
- App commit / APK artifact:
- Reference route and trusted distance:
- Row 2 screen-lock notification + route screenshots:
- Row 4/5 recovered-paused screenshots and kill method:
- Row 6 pause/resume audit screenshot:
- Row 9/10 raw-vs-filtered audit screenshots:
- Row 12 source → final activity/route counts:
- Row 13 exported → restored session/route/audit counts:
- Result / notes:
