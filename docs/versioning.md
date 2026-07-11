# Versioning & Toolchain Reproducibility

## Single source of app version
`js/constants.js` → `APP_VERSION` is the one place the user-facing version lives.
It flows to:
- **Settings → App → Version** (populated at runtime, no hardcoded string).
- **Data export envelope** (`appVersion`).
- **Sentry release** (`helyx@${APP_VERSION}` in `sentry-config.js`).

Keep these aligned when bumping:
| Where | Value | How |
| --- | --- | --- |
| `js/constants.js` `APP_VERSION` | `1.0.0` | edit on release |
| `package.json` `version` | `1.0.0` | edit on release |
| Android `versionName` | `1.0.0` | `VERSION_NAME` env (CI) or default |
| Android `versionCode` | commit count | `VERSION_CODE` env (CI) |
| Service worker `CACHE_NAME` | `helyx-vNN` | bump to bust the offline cache |

The SW `CACHE_NAME` counter is deliberately independent — it busts the offline
cache on any asset change, which happens more often than a marketing version bump.

## Supported toolchain
| Tool | Version | Pinned in |
| --- | --- | --- |
| Node | 20.x (`>=20 <23`) | `package.json` engines; all CI `setup-node@v4` |
| Java (JDK) | 17 (Temurin) | CI `setup-java@v4`; `compileOptions` |
| Gradle | 8.13 | `gradle/actions/setup-gradle`; `gradle-wrapper.properties` |
| Android SDK / compile+targetSdk | 36 | `android/app/build.gradle.kts` |
| Android minSdk | 26 | `android/app/build.gradle.kts` |

## Dependencies
- Production JS libraries are pinned to **exact** versions in `package.json`
  (`@supabase/supabase-js`, `@sentry/browser`, `leaflet`) and `package-lock.json`
  is committed, so `npm ci` is reproducible.
- Leaflet is vendored (`js/vendor/leaflet/`); Supabase/Sentry are exact-pinned +
  (Supabase) SRI-checked CDN references. No broad `@2`/`@8` major-range CDN refs.
- **Dependency updates:** bump the exact version in `package.json`, run
  `npm install` to refresh the lockfile, re-vendor Leaflet if it changed
  (`cp node_modules/leaflet/dist/* js/vendor/leaflet/…`), recompute the Supabase
  SRI (`openssl dgst -sha384 -binary node_modules/@supabase/supabase-js/dist/umd/supabase.js | openssl base64 -A`),
  and run `npm run verify`. Do not enable automatic major upgrades.

## Known gap (requires a one-time local step)
`android/gradle/wrapper/gradle-wrapper.jar` and the `gradlew` scripts are **not**
committed, so `./gradlew` doesn't work locally. CI is unaffected — it uses
`gradle/actions/setup-gradle` with a pinned Gradle 8.13. To restore the wrapper
for local dev, run once (with a Gradle 8.13 on PATH):
`cd android && gradle wrapper --gradle-version 8.13` then commit the generated
`gradlew`, `gradlew.bat`, and `gradle/wrapper/gradle-wrapper.jar`.
(The jar couldn't be generated in the audit environment — no network access to
the Gradle distribution service.)
