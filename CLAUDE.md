# Helyx — Claude Code Working Brief

Helyx is a hybrid strength + running PWA (~28k lines vanilla JS ES modules, no
framework; ~12k CSS; service-worker PWA). This file is auto-loaded every session.

## Commands (keep all green before every commit)
- `npm test` — node --test suite
- `npm run typecheck` — tsc over jsconfig
- `npm run smoke` — scripts/smoke.mjs (jsdom import + home render)

## Architecture facts (verify before relying on them)
- State: one big `appState` object → localStorage (source of truth) + Supabase table
  `user_data` as a single JSON blob per user, written via `upsert` in `js/state.js`.
  This is **last-write-wins with no merge** — a known data-loss risk under multi-device.
- Auth/sync: `js/state/auth.js`, `js/state/supabase.js`. Anon key is hardcoded (public
  by design — safe ONLY if Supabase RLS is enforced; treat as unverified until proven).
- Android: custom WebView shell (NOT Capacitor/TWA) in `android/`, minSdk 26, loads
  bundled assets. Native Health Connect bridge in `js/health/health-bridge.js`
  (Android-only). GPS in `js/gps-tracker.js` uses web geolocation (unreliable when the
  screen locks — a problem for run tracking).
- No iOS project exists. iOS is OUT OF SCOPE for the current launch push.

## Roadmap Working Agreements
Active goal: Android public beta on Google Play (free at launch). See `PROGRESS.md`
for the phased plan and live status. iOS/Capacitor and any billing/paywall are
explicitly deferred — do not build them now.

### Session protocol
- START: read this file, `PROGRESS.md`, and `git log --oneline -15`. State in one line
  where we are and what this session will do.
- WORK: smallest shippable slice. Run test + typecheck + smoke after each change; all
  must pass before commit.
- END: tick completed items in `PROGRESS.md`, add a Session Log entry (date · what
  changed · what's next), commit. Never end on a broken tree or with unrecorded work.

### Operating rules
- Security and data-safety first. Never ship a change that could leak or lose user
  data. When touching sync, add backups/guards *before* changing behavior.
- Don't assume — read the actual code before changing it. If a fact here is wrong, fix
  this file.
- Verify by running things. Never report as working what you haven't run; if tests
  fail, say so with output.
- Tests are part of every feature — especially sync, security, and the currently
  under-tested large files (`js/workout.js`, `js/app.js`).
- Git: short-lived feature branch per phase (e.g. `phase1-security`). Commit in logical
  units. Do NOT push to the default branch or open PRs without asking. No force-push of
  shared branches.
- `[You]` tasks are the human's (accounts, applying SQL in Supabase, device testing,
  screenshots/art, legal review, store submission). For each, produce the exact
  artifact needed (SQL, checklist, copy, config) and STOP — never simulate it as done.
- Ask before anything irreversible or outward-facing (pushing, deleting data, external
  calls). One clear question at a time.
- No fabricated secrets, keys, or model identifiers in committed files.
