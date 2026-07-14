# Android TalkBack acceptance checklist

Use the release-candidate APK on a physical Android phone. Record the device,
Android version, TalkBack version, APK/commit, tester, and date. Do not mark a
row passed from emulator, keyboard, or Chromium evidence.

## Setup

- Install the APK cleanly, then enable TalkBack.
- Set system font and display size to their larger presets.
- Pair a hardware keyboard if available.
- Start once online, then repeat the workout/export portion offline.

## Required journeys

- [ ] Fresh onboarding: focus starts in Setup; headings, choices, selected states,
  recommendation difficulty, Back, and Continue are announced in a sensible order.
  Escape/Android Back must not dismiss required onboarding. Finish with Strength,
  Beginner, Home basics, then confirm those exact values in Settings.
- [ ] Program switch: open a program and Start/Switch it. The confirmation title,
  history-preserved warning, start-week choices, Cancel, and focus return are announced.
  Android Back closes only the confirmation.
- [ ] Partial workout: log one prescribed set, open Finish, and hear “Save partial
  session” plus “will not be marked complete.” Cancel returns to the triggering control.
- [ ] Complete workout: log every prescribed working set and any prescribed run.
  Finish announces “Session complete”; the recap opens only after the completion action.
- [ ] Settings/export: open Settings, traverse every control without focus escaping
  behind the panel, export JSON and CSV, cancel once, save once, and verify the app
  reports the real picker result. Android Back closes Settings before leaving the app.
- [ ] Sheets/modals: Quick Start, Workout Preview, Add/Swap Exercise, run logger,
  session detail, PR goal, and confirmations each move focus inside, trap traversal,
  close on Back/Escape where dismissible, and restore focus to the trigger.
- [ ] Blocking recovery: migration recovery and sync-conflict choices cannot be
  bypassed with Back; every option and consequence is announced.
- [ ] Reduced motion: with Remove animations enabled, dialogs/sheets appear and close
  without scale/slide motion while remaining fully operable.

## Evidence record

| Field | Value |
|---|---|
| Device / Android | |
| TalkBack version | |
| APK / commit | |
| Tester / date | |
| Result | Pass / Fail |
| Failure notes / screen recording | |

Any failure blocks the public beta. Attach the completed table and screen recording to
the release issue; file code defects with the exact surface, control, spoken output,
expected output, and reproduction steps.
