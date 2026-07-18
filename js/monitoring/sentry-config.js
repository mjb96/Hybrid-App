// =============================================================================
// SENTRY CONFIG — production crash reporting is enabled by the configured DSN.
//
// The DSN is publish-safe (like the Supabase anon key) — it can only *send*
// events, not read them. Setting it to '' disables crash-report egress.
// =============================================================================
export const SENTRY_DSN = 'https://ebeda354909c9ebb5d9b5d7b22537db1@o4511663726329856.ingest.de.sentry.io/4511663733080144';

// Release identifier for grouping crashes by version. Derived from the single
// APP_VERSION source so Sentry releases stay aligned with package.json + the
// Android versionName instead of drifting on a hand-edited string.
import { APP_VERSION } from '../constants.js';
export const SENTRY_RELEASE = `helyx@${APP_VERSION}`;
