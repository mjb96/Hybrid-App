# Helyx — Launch Checklist (`[You]` runbook)

Every human-only step to get Helyx into a Google Play beta, in order. All the
`[CC]` code + drafts are done and on the branch; this is what needs *you*.
Each step points at the artifact that makes it quick.

---

## 1. Supabase (security + data)
- [x] Apply `supabase/rls_user_data.sql` in the SQL Editor. *(done)*
- [x] Turn OFF "Confirm email" for beta (Authentication → Providers → Email). *(done)*
- [ ] Apply `supabase/migration_user_data_updated_at.sql` (enables multi-device
      conflict detection).
- [ ] **Prove RLS:** create two throwaway accounts, then run the adversarial
      check (exact command in `supabase/README.md`). Need a `✅ PASS`.
- [ ] Deploy the account-deletion function:
      `supabase functions deploy delete-account`
      (from `supabase/functions/delete-account/`). Without it, in-app deletion
      still erases user data but leaves the auth email record.

## 2. Crash reporting
- [ ] Create a Sentry project; paste its DSN into `js/monitoring/sentry-config.js`
      (`SENTRY_DSN`). Until then, crash reporting stays off.

## 3. Legal (health + location = extra scrutiny)
- [ ] Fill every `{{PLACEHOLDER}}` in `docs/legal/privacy-policy.md` and
      `docs/legal/terms-of-service.md` (name, contact email, jurisdiction, dates).
- [ ] Have both reviewed (not legal advice as drafted).
- [ ] Host both at public HTTPS URLs; link the privacy policy from the Play
      listing and in-app.

## 4. Play Console setup
- [ ] Create a Google Play Developer account ($25, 1–2 day approval).
- [ ] **Data Safety form:** copy the answers from `docs/legal/play-data-safety.md`.
- [ ] **Content rating:** complete the IARC questionnaire (expect Everyone/PEGI 3).
- [ ] **Store listing:** paste from `docs/store-listing.md` (name, short/full
      description, category = Health & Fitness).
- [ ] **Health Connect declaration:** confirm the policy link + requested data
      types (see the Health Connect note in the data-safety doc).

## 5. Signing + release build
- [ ] Create an upload keystore (`keytool -genkey -v -keystore ...`).
- [ ] Add GitHub repo secrets (Settings → Secrets → Actions):
      `KEYSTORE_BASE64` (base64 of the keystore), `KEYSTORE_PASSWORD`,
      `KEY_ALIAS`, `KEY_PASSWORD`.
- [ ] Run **Actions → Release AAB → Run workflow**, set the version name.
      Download the signed `.aab` artifact.

## 6. Device testing (needs a physical Android phone)
- [ ] GPS: track a real run with the **screen locked** — distance keeps counting,
      route saves, run restores if the app is killed mid-run.
- [ ] Notifications: enable reminders; confirm the permission prompt and that a
      reminder fires (including with the app closed).
- [ ] Health Connect: connect and confirm data pulls in.

## 7. Store assets (design)
- [ ] App icon 512×512, feature graphic 1024×500, 4–8 phone screenshots
      (checklist in `docs/store-listing.md`). Keep the dark + orange Helyx look.

## 8. Ship
- [ ] Upload the `.aab` to **Internal testing**, add testers, promote to
      **Closed beta**, invite real testers.
- [ ] Watch Sentry for crashes; report back and `[CC]` can fix the top issues.

---

### Recommended order if you want the fastest path to "testers using it"
1 (migration + RLS proof + edge fn) → 5 (signing + AAB) → 6 (device test) →
8 (internal testing) — you can do 2/3/4/7 in parallel while testers try it
internally, before promoting to closed beta.
