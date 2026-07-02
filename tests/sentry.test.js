// ==========================================
// SENTRY TEST (tests/sentry.test.js)
// Phase 1 crash reporting: verify it stays disabled without a DSN and that the
// privacy scrubbers strip identifying data (health/location app). `node --test`.
// ==========================================
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initSentry, scrubEvent, scrubBreadcrumb, redactUrl } from '../js/monitoring/sentry.js';

test('initSentry stays disabled without a DSN', () => {
  assert.equal(initSentry('', 'r'), false);
  assert.equal(initSentry(null, 'r'), false);
  assert.equal(initSentry(undefined), false);
});

test('initSentry stays disabled when the SDK is not loaded (no window.Sentry)', () => {
  // Under node --test there is no window/window.Sentry.
  assert.equal(initSentry('https://abc@o1.ingest.sentry.io/1'), false);
});

test('redactUrl drops query strings and keeps only the path', () => {
  assert.equal(
    redactUrl('https://x.supabase.co/rest/v1/user_data?user_id=eq.abc-123&select=*'),
    '/rest/v1/user_data',
  );
  assert.equal(redactUrl('/rest/v1/user_data?user_id=eq.abc'), '/rest/v1/user_data');
  assert.equal(redactUrl(''), '');
  assert.equal(redactUrl(null), null);
});

test('scrubEvent strips request, user, and device context', () => {
  const event = {
    message: 'boom',
    request: { url: 'https://x?token=secret', headers: { cookie: 'sb=1' } },
    user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' },
    contexts: { device: { name: 'Pixel' }, os: { name: 'Android' } },
  };
  const out = scrubEvent(event);
  assert.equal('request' in out, false);
  assert.equal('user' in out, false);
  assert.equal('device' in out.contexts, false);
  assert.equal(out.contexts.os.name, 'Android'); // non-identifying context kept
  assert.equal(out.message, 'boom');
});

test('scrubBreadcrumb redacts fetch/xhr urls and drops bodies', () => {
  const crumb = scrubBreadcrumb({
    category: 'fetch',
    data: { url: 'https://x.supabase.co/rest/v1/user_data?user_id=eq.abc', body: '{"secret":1}' },
  });
  assert.equal(crumb.data.url, '/rest/v1/user_data');
  assert.equal('body' in crumb.data, false);
});

test('scrubBreadcrumb leaves non-network breadcrumbs untouched', () => {
  const crumb = { category: 'ui.click', message: 'button' };
  assert.deepEqual(scrubBreadcrumb(crumb), { category: 'ui.click', message: 'button' });
});
