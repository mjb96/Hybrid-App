<!--
  DRAFT — [You] before publishing:
  1. Have this reviewed by someone qualified (health + location = GDPR special
     category data; this draft is a starting point, not legal advice).
  2. Fill every {{PLACEHOLDER}}.
  3. Host it at a public HTTPS URL and put that URL in the Play listing +
     in-app Settings.
  4. Keep "Last updated" accurate whenever you change data practices.
-->

# Helyx — Privacy Policy

**Last updated: {{DATE}}**

Helyx ("the app", "we", "us") is a strength-and-running training app. This
policy explains what data Helyx handles, why, and your rights over it. We built
Helyx to keep your data on your device by default and to sync only what you
choose to.

**Data controller:** {{YOUR NAME OR COMPANY}}
**Contact:** {{CONTACT_EMAIL}}

---

## 1. Summary (the short version)
- Your training data lives **on your device** first. It is only sent to the
  cloud if you **create an account and sign in**.
- We do **not** sell your data, show ads, or use advertising/analytics trackers.
- Health and location data are treated as **sensitive**. We minimise what we
  collect and never use it for advertising.
- You can **export or delete** your data at any time.

## 2. What data Helyx handles

### 2.1 Data you enter or generate
- **Training logs:** workouts, sets, reps, weights, RPE/RIR, running distance
  and time, body weight, notes, program choices, streaks, goals.
- **Wellness & fasting:** any wellness check-ins or fasting sessions you log.
- **Profile & settings:** display name, units, an optional avatar image, and
  reminder preferences.

### 2.2 Health & fitness data (sensitive)
If you connect **Health Connect** (Android, optional), Helyx reads the data
types you approve, which may include: steps, active calories, sleep, heart
rate, resting heart rate, heart-rate variability, body weight, and exercise
sessions. This is read **on your device** to power your analytics. It is only
uploaded if you are signed in (see cloud sync below). You control this
permission and can revoke it in Health Connect at any time.

### 2.3 Location data (sensitive)
If you use **GPS run tracking**, Helyx uses your device location **while a run
is active** to record your route, distance, and pace. On Android this runs in a
foreground service with a visible notification while tracking, and stops when
you end the run. Location is **not** collected in the background outside of an
active run, and is never used for advertising. Your saved routes are stored
with the rest of your training data.

### 2.4 Account data
If you create an account, our authentication provider (Supabase) stores your
**email address** and a securely hashed password.

### 2.5 Diagnostics (crash reports)
If enabled, we use **Sentry** to receive crash reports so we can fix bugs.
Crash reports are **scrubbed**: we disable personally-identifying data, strip
request/user/device details, and redact network URLs. We do not send your
training, health, or location data in crash reports.

### 2.6 Data we do **not** collect
No advertising identifiers, no analytics/behavioural tracking, no contacts, no
microphone/camera access beyond an avatar image you choose to add.

## 3. How your data is stored and synced
- **On your device:** your training data is saved locally so the app works
  offline.
- **Cloud sync (only if signed in):** your training data is stored as your own
  private record in our database (Supabase). Access is restricted so that **only
  your account** can read or write your record (enforced by row-level security).
- Data in transit is protected with HTTPS/TLS.

## 4. Third parties that may process data
We use a small number of service providers strictly to run the app:

| Provider | Purpose | Data they may see |
|---|---|---|
| Supabase | Account + cloud sync | Email, hashed password, your synced training data |
| Sentry (if enabled) | Crash reporting | Scrubbed crash diagnostics (no health/location/training data) |
| OpenStreetMap | Map tiles for run maps | Your IP address and the map area viewed |
| jsDelivr / unpkg / esm.sh | Serving app code libraries | Your IP address |
| Google Fonts | Fonts | Your IP address |

These providers process data on our behalf or as independent controllers for
the limited purpose above. We do not sell data to anyone.

## 5. Legal bases (GDPR/UK GDPR)
- **Contract:** to provide the app and sync your account data.
- **Consent:** for optional features you switch on — Health Connect access, GPS
  tracking, notifications, and crash reporting. You can withdraw consent at any
  time by turning the feature off or revoking the permission.
- **Legitimate interests:** keeping the app secure and fixing crashes.

Health and location data are **special-category / sensitive** data and are
processed only with your explicit consent (by enabling the relevant feature).

## 6. Data retention
- Local data stays until you delete it or uninstall the app.
- Cloud data stays until you delete your account or ask us to delete it.
- Crash reports are retained per Sentry's default retention and then deleted.

## 7. Your rights
Depending on where you live (e.g. EEA/UK), you have the right to access,
correct, export (portability), delete, or restrict processing of your data, and
to withdraw consent. Helyx lets you:
- **Export** your full data as a file (Settings → Export).
- **Delete** local data by clearing app data or uninstalling.
- **Delete your account and cloud data** by contacting us at {{CONTACT_EMAIL}}.

To exercise any right, contact {{CONTACT_EMAIL}}. You also have the right to
complain to your local data-protection authority.

## 8. Children
Helyx is not directed to children under {{MIN_AGE, e.g. 16}} and we do not
knowingly collect their data.

## 9. International transfers
Your data may be processed on servers located outside your country (e.g. by the
providers above). Where required, appropriate safeguards apply.

## 10. Changes to this policy
We will update this policy as the app evolves and revise the "Last updated"
date. Material changes will be surfaced in the app.

## 11. Contact
{{YOUR NAME OR COMPANY}} — {{CONTACT_EMAIL}}
