// =============================================================================
// SENTRY CONFIG — [You] fill in the DSN after creating the Sentry project.
//
// The DSN is publish-safe (like the Supabase anon key) — it can only *send*
// events, not read them. Leaving it '' keeps crash reporting fully disabled: no
// data leaves the device. Paste the Project DSN from Sentry → Project Settings →
// Client Keys (DSN) between the quotes below.
// =============================================================================
export const SENTRY_DSN = '';

// Bump when you cut a release so Sentry can group issues by version.
export const SENTRY_RELEASE = 'helyx@web';
