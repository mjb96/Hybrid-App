# Helyx — Launch Checklist (`[You]` runbook)

Every human-only step to get Helyx into a Google Play beta, in order. All the
`[CC]` code + drafts are done and on the branch; this is what needs *you*.
Each step points at the artifact that makes it quick.

---

## 1. Supabase (security + data)
- [x] Apply `supabase/rls_user_data.sql` in the SQL Editor. *(done)*
- [x] Turn OFF "Confirm email" for beta (Authentication → Providers → Email). *(done)*
- [x] Apply `supabase/migration_user_data_updated_at.sql` (enables multi-device
      conflict detection). *(done 2026-07-02)*
- [x] **Prove RLS:** adversarial check run against the live DB — `✅ PASS`
      (2026-07-02, `scripts/rls-adversarial-check.mjs`).
- [x] Deploy the account-deletion function:
      `supabase functions deploy delete-account`. *(deployed 2026-07-02)*

## 2. Crash reporting
- [x] Sentry project created; DSN set in `js/monitoring/sentry-config.js`
      (2026-07-02) — crash reporting is live.

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
- [x] Upload keystore + GitHub secrets + signed-AAB CI pipeline — built and
      verified 2026-07-02 (see `docs/archive/PROGRESS-legacy-2026-07-14.md`).
- [ ] Run **Actions → Release AAB → Run workflow** for the release candidate,
      set the version name, download the signed `.aab` artifact.
      **Do this only after PRODUCT_AUDIT.md Sprints 1–3** — screenshots and the
      testers' first run should show the fixed day-0 experience, not the current one.

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
