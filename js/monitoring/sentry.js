// =============================================================================
// SENTRY — crash reporting for the PWA, configured conservatively because this
// is a health + location app (GDPR special-category data).
//
//  - Disabled unless a DSN is configured (see sentry-config.js). No DSN → no
//    egress whatsoever.
//  - sendDefaultPii: false, and beforeSend strips request/user data so we never
//    ship emails, IPs, or the app's state blob.
//  - beforeBreadcrumb redacts network breadcrumb URLs to their path (drops
//    query strings / the Supabase user_id) so breadcrumbs can't leak identifiers.
//  - Errors only (no performance tracing) to minimise data collected.
// =============================================================================

// Reduce a breadcrumb URL to just its path so query params / ids don't ride
// along in crash reports. Returns the original string if it can't be parsed.
export function redactUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  try {
    const u = new URL(url, 'http://local.invalid');
    return u.pathname;
  } catch {
    return String(url).split('?')[0];
  }
}

// Strip identifying fields from an outgoing event. Exported for testing.
export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  delete event.request;   // headers, cookies, url with params
  delete event.user;      // id / email / ip_address
  if (event.contexts) delete event.contexts.device; // avoid fingerprinting detail
  return event;
}

export function scrubBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== 'object') return crumb;
  if ((crumb.category === 'fetch' || crumb.category === 'xhr') && crumb.data) {
    if (crumb.data.url) crumb.data.url = redactUrl(crumb.data.url);
    delete crumb.data.body;
  }
  return crumb;
}

// Initialise Sentry if a DSN is present and the SDK loaded. Returns true when
// reporting is active, false when it stays disabled (no DSN, no SDK, or error).
export function initSentry(dsn, release) {
  if (!dsn) return false;
  if (typeof window === 'undefined' || !window.Sentry) return false;
  try {
    window.Sentry.init({
      dsn,
      release: release || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,               // errors only
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    });
    return true;
  } catch (e) {
    console.warn('Sentry init failed:', e);
    return false;
  }
}
