# Play Console — Data Safety form: fill-in guide

This maps Helyx's actual data handling to the Play Console **Data Safety**
questionnaire so `[You]` can complete it quickly and accurately. Answers below
reflect the app as built; re-check if data practices change.

> Play's definition of **"collected"** = data transmitted off the device. Helyx
> stores training/health/location data **on-device by default**; it is only
> *collected* (transmitted) when the user **signs in** (cloud sync) or, for
> crash data, when Sentry is enabled. Because sign-in is a real feature, declare
> these as **Collected — Optional**.

## Global answers
- **Is all data encrypted in transit?** → **Yes** (HTTPS/TLS to Supabase, Sentry, CDNs, tile server).
- **Do you provide a way to request data deletion?** → **Yes** — see "Account deletion" below.
- **Data collected is required or optional?** → Mostly **Optional** (only email is required, and only if the user chooses to create an account).
- **Do you share data with third parties?** Sharing = transfer to a third party acting as an independent controller. Our providers are **processors** running the service (see privacy policy). Declare **No data "shared"** unless your legal review concludes Sentry/tiles count as sharing; if so, list Diagnostics/Location accordingly.

## Data types to declare

| Play category → type | Collected? | Optional? | Purpose(s) | Notes |
|---|---|---|---|---|
| **Personal info → Email address** | Yes | Optional* | Account management | *Required only if the user creates an account. Stored by Supabase Auth. |
| **Location → Approximate/Precise location** | Yes | Optional | App functionality (GPS run tracking) | Foreground only, while a run is active; visible notification. Synced only if signed in. |
| **Health & fitness → Health info** | Yes | Optional | App functionality | From Health Connect (steps, calories, sleep, HR, RHR, HRV, weight, exercise) — only the types the user approves. |
| **Health & fitness → Fitness info** | Yes | Optional | App functionality | Workouts, runs, body weight, streaks, goals the user logs. |
| **Photos and videos → Photos** | Yes | Optional | App functionality (profile avatar) | Only if the user sets an avatar; stored with their synced data. |
| **App activity → Other user-generated content** | Yes | Optional | App functionality | Notes / wellness / fasting entries. |
| **App info & performance → Crash logs** | Yes (if Sentry enabled) | Optional | Diagnostics (crash fixing) | PII-scrubbed; no health/location/training content. Off until a DSN is set. |
| **App info & performance → Diagnostics** | Yes (if Sentry enabled) | Optional | Diagnostics | As above. |
| **Device or other IDs** | **No** | — | — | No advertising ID, no analytics IDs. |

For each declared type, the Play form asks: *collected*, *shared*, *processed
ephemerally*, *required/optional*, and *purpose*. Use the table above:
purpose = **App functionality** for everything except crash data (**Diagnostics**).
None is used for **Advertising or marketing**, **Analytics** (beyond crash), or
**sold**.

## Health Connect specifics
Play + Health Connect have an **additional** policy: apps reading Health Connect
data must show an in-app privacy policy link and only request data types they
use. Helyx requests exactly the types listed above and links the policy from
Settings — confirm both before submitting the Health Connect declaration.

## Account deletion (Play requirement)
Play requires a way to request account + data deletion, reachable without
reinstalling.
- **Today:** users can export all data (Settings → Export), clear local data by
  uninstalling, and request account/cloud deletion by emailing
  {{CONTACT_EMAIL}}. Provide that email (or a deletion web form URL) in the
  Data Safety "deletion" field.
- **Recommended `[CC]` follow-up:** add an in-app "Delete account & cloud data"
  button (deletes the Supabase row + auth user) so deletion is self-serve. Flag
  if you want this built.

## Content rating & target audience (adjacent forms)
- **Target age:** {{16+ recommended}} (health data; not directed at children).
- **Content rating questionnaire:** no violence/sexual/gambling content →
  expect an **Everyone / PEGI 3** style rating. Answer truthfully in the IARC
  questionnaire.
