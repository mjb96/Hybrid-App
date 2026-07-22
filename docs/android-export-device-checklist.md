# Android export device acceptance

Use the debug APK from `android/app/build/outputs/apk/debug/app-debug.apk` or the
PR artifact. Record the device model, Android version, app commit, and result for
each row. Do not mark R4 device-verified until every row passes on a physical phone.

| Check | Exact action | Pass evidence |
|---|---|---|
| JSON cancel | Settings → Export Training Data → cancel the Android save picker. | App says “Export cancelled”; no success message and no file is created. |
| JSON save | Export again, keep the suggested `.json` name, choose Downloads, save. | Success appears only after returning from the picker; file is non-empty and opens as JSON. |
| JSON overwrite | Export to the same name and accept Android’s replace prompt. | One valid replacement file exists; it parses and has `format: "helyx-export"`. |
| CSV save | Settings → Export Spreadsheet, save the suggested `.csv` file. | File opens with 21 columns; commas, quotes, and line breaks remain inside their original cells. |
| Archived history | Before export, switch/restart a program so an `arch:*` week exists and log identifiable work in both activations. | CSV contains both exact week keys and JSON contains both week objects. |
| Same-day runs/routes | Store two runs on one calendar day, with a GPS route on at least one. | JSON has both `sessionId` values and every route record; counts match the source device. |
| Clear and reimport | Note counts, clear app data, relaunch, then Import Backup File and choose the saved JSON. | Programs, active/archived workouts, both same-day runs, notes, bodyweight, and route maps return with matching counts. |
| Offline save | Put the phone in airplane mode and export JSON + CSV. | Both saves work; no network dependency or misleading cloud message appears. |
| Automatic backup opt-in | In Settings, read the privacy note, choose **Automatic Backup Folder**, and select a private device-local folder (not a cloud provider). | The app does not write before selection; after selection it reports automatic backup on and creates `helyx-auto-latest.json`, today's dated file, and this week's Monday-dated file. |
| Complete checkpoint | Finish one strength session and one GPS run, then tap **Back Up Now** after each if needed for inspection. | Latest JSON parses as `helyx-export` v4, contains the new sessions and every route record, and Settings shows the successful backup time. |
| Automatic retention | Accumulate backups on eight distinct calendar days and five distinct Monday weeks without removing unrelated test files from the folder. | Only the newest seven `helyx-auto-YYYY-MM-DD.json` and four `helyx-auto-week-YYYY-MM-DD.json` snapshots remain; latest and unrelated files are untouched. |
| Permission loss | Revoke the app's folder access (or remove the folder), finish a session, then reopen Settings. | Training still saves locally; backup failure is disclosed, no false success appears, and choosing a folder again recovers future writes. |
| Clear-data survival | Confirm a current automatic file, clear Helyx app data, relaunch, choose JSON restore, and select that file; then reselect the automatic folder. | The shared-storage JSON remains after app/WebView data is cleared; workouts, runs and routes restore; folder access can be granted again and a new backup succeeds. |
| Automatic offline | With the folder configured, use airplane mode and finish a session. | The automatic JSON files update without cloud/network access and the logged activity remains usable. |

Record evidence here before Play beta:

- Device / Android:
- Commit:
- JSON filename and size:
- Source → restored week count:
- Source → restored run-session count:
- Source → restored route count:
- Automatic folder and latest/daily/weekly filenames:
- Automatic retention counts (daily / weekly):
- Result / notes:
