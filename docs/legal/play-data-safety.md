# Play Console — Data Safety form: fill-in guide

This maps Helyx's actual data handling to the Play Console **Data Safety**
questionnaire so `[You]` can complete it quickly and accurately. Answers below
reflect the app as built; re-check if data practices change.

> Play's definition of **"collected"** = data transmitted off the device. Helyx
> stores training/health/location data **on-device by default**; it is only
> *collected* (transmitted) when the user **signs in** (cloud sync) or, for
> crash data, through the configured Sentry reporter. Because sign-in is optional,
> synced user data is generally **Collected — Optional**. Crash/diagnostic
> collection is automatic in the distributed build and is therefore **Required**
> unless an opt-out is added or the DSN is removed before release.

Official references (re-check at submission time):
- [Google Play Data Safety form](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Health Connect / sensitive-permission policy](https://support.google.com/googleplay/android-developer/answer/16558241)

## Global answers
- **Is all data encrypted in transit?** → **Yes** (HTTPS/TLS to Supabase, Sentry, Google Fonts, and the tile server).
- **Do you provide a way to request data deletion?** → **Do not submit Yes yet.**
  First deploy/verify the auth-deletion edge function and publish the required
  external web deletion-request resource described below.
- **Data collected is required or optional?** → Synced user data is **Optional**;
  configured crash/diagnostic reporting is currently **Required** because the
  distributed build has no user opt-out.
- **Do you share data with third parties?** → **Legal/contract review required.**
  Supabase and Sentry may qualify for Play's service-provider exception. The
  public OpenStreetMap tile service and Google Fonts must be classified before
  selecting **No sharing**. A conservative declaration treats map-tile location
  context as shared for App functionality unless counsel confirms an exception.

## Data types to declare

| Play category → type | Collected? | Optional? | Purpose(s) | Notes |
|---|---|---|---|---|
| **Personal info → Name** | Yes | Optional | App functionality | Optional profile/display name; transmitted only when signed in. |
| **Personal info → Email address** | Yes | Optional* | Account management | *Required only if the user creates an account. Stored by Supabase Auth. |
| **Personal info → User IDs** | Yes | Optional* | Account management | Supabase account identifier; only created for signed-in users. |
| **Location → Approximate/Precise location** | Yes | Optional | App functionality (GPS run tracking) | Foreground only, while a run is active; visible notification. Synced only if signed in. |
| **Health & fitness → Health info** | Yes | Optional | App functionality | From Health Connect: steps, sleep duration, resting heart rate, and HRV — only selected/granted fields. |
| **Health & fitness → Fitness info** | Yes | Optional | App functionality | Workouts, runs, body weight, streaks, goals the user logs. |
| **Photos and videos → Photos** | Yes | Optional | App functionality (profile avatar) | Only if the user sets an avatar; stored with their synced data. |
| **App activity → Other user-generated content** | Yes | Optional | App functionality | Notes / wellness / fasting entries. |
| **App info & performance → Crash logs** | Yes | **Required*** | Analytics (app health/crash fixing) | Automatic Sentry error reporting; PII-scrubbed; no performance tracing. *Required unless release configuration changes. |
| **App info & performance → Diagnostics** | Yes | **Required*** | Analytics (app health/crash fixing) | As above. |
| **Device or other IDs** | **No** | — | — | No advertising ID, no analytics IDs. |

For each declared type, the Play form asks: *collected*, *shared*, *processed
ephemerally*, *required/optional*, and *purpose*. Use the table above:
purpose = **App functionality** for most user data, **Account management** for
account identifiers, and **Analytics** for crash/diagnostic data. None is used
for **Advertising or marketing** or sold.

## Health Connect specifics
Play + Health Connect have an **additional** policy: apps reading Health Connect
data must show an in-app privacy policy link and only request data types they
use. Helyx requests exactly the four fields listed above, but the current app
still needs the hosted privacy-policy link added to Settings before submission.

## Account deletion (Play requirement)
Play requires both an in-app deletion path and an external web resource where a
user can request deletion without reinstalling.
- **In-app (built):** Settings → Account → **Delete Account & Data** erases the
  user's synced data row (RLS-permitted own-row delete) and all local data, then
  signs out. Shown only when signed in.
- **Full auth-record removal:** requires the `delete-account` edge function
  (`supabase/functions/delete-account/`) — `[You]` deploy it with
  `supabase functions deploy delete-account`. The app calls it automatically and
  falls back to data-row deletion if it isn't deployed yet, so data is erased
  either way.
- **External request resource (still required):** publish the privacy policy's
  prominent **Account and data deletion requests** section at a stable public
  HTTPS URL and put its anchored URL in Play Console. It must let the user make
  a request (the drafted support-email flow is acceptable only after the real
  email and response process exist).
- **In-app privacy link (still required):** add the hosted policy URL to Settings.
- **Submission gate:** verify the edge function deletes the auth record and data,
  verify the public request path end-to-end, then answer the Play deletion fields.

## Content rating & target audience (adjacent forms)
- **Target age:** {{16+ recommended}} (health data; not directed at children).
- **Content rating questionnaire:** no violence/sexual/gambling content →
  expect an **Everyone / PEGI 3** style rating. Answer truthfully in the IARC
  questionnaire.
