// ==========================================
// SERVICE WORKER (sw.js)
// ------------------------------------------
// Offline strategy:
//  - REQUIRED_ASSETS are cached ATOMICALLY (cache.addAll). If any single one
//    fails to download, the whole install rejects and the PREVIOUS working
//    cache is kept — the user is never left on a half-updated app.
//  - OPTIONAL_ASSETS (icons, map marker sprites) are best-effort and never
//    block activation.
//  - On activate we VALIDATE that the new cache actually holds every required
//    asset before deleting older caches, so an interrupted install can't purge
//    the last good version (no mixed-version app).
//
// REQUIRED_ASSETS is generated from the real ES-module import graph by
// scripts/gen-precache.mjs and enforced in CI by scripts/check-precache.mjs
// (a node --test), so a newly-added, offline-reachable module can never again
// be silently omitted from the cache.
// ==========================================
const CACHE_NAME = 'helyx-v122-h540f8f082813';

// GENERATED — do not hand-edit. Run: node scripts/gen-precache.mjs
const REQUIRED_ASSETS = [
  "./",
  "./css/analytics.css",
  "./css/brand-consistency.css",
  "./css/hybrid-score.css",
  "./css/programs.css",
  "./css/styles.css",
  "./index.html",
  "./js/activities.js",
  "./js/activities/model.js",
  "./js/activities/mutations.js",
  "./js/analytics.js",
  "./js/analytics/calculations/load-calcs.js",
  "./js/analytics/calculations/math-utils.js",
  "./js/analytics/calculations/recovery-calcs.js",
  "./js/analytics/calculations/running-calcs.js",
  "./js/analytics/calculations/session-compare.js",
  "./js/analytics/calculations/strength-calcs.js",
  "./js/analytics/calculations/volume-landmarks.js",
  "./js/analytics/charts.js",
  "./js/analytics/charts/chart-primitives.js",
  "./js/analytics/charts/fasting-charts.js",
  "./js/analytics/charts/recovery-charts.js",
  "./js/analytics/charts/strength-charts.js",
  "./js/analytics/comparison.js",
  "./js/analytics/gym-performance.js",
  "./js/analytics/insights/build-insights.js",
  "./js/analytics/insights/insight-engine.js",
  "./js/analytics/logged-days.js",
  "./js/analytics/metric-tiers.js",
  "./js/analytics/navigation.js",
  "./js/analytics/period-comparison.js",
  "./js/analytics/period-totals.js",
  "./js/analytics/progress-landing.js",
  "./js/analytics/recovery-calendar.js",
  "./js/analytics/recovery-detail.js",
  "./js/analytics/recovery-performance.js",
  "./js/analytics/run-performance.js",
  "./js/analytics/running-detail.js",
  "./js/analytics/scoring/readiness-scoring.js",
  "./js/analytics/strength-calendar.js",
  "./js/analytics/strength-detail.js",
  "./js/analytics/strength-volume-detail.js",
  "./js/analytics/utils.js",
  "./js/analytics/views/metric-contract.js",
  "./js/analytics/views/screen-kit.js",
  "./js/analytics/views/view-bodyweight.js",
  "./js/analytics/views/view-fasting.js",
  "./js/analytics/views/view-gym-performance.js",
  "./js/analytics/views/view-monthly-report.js",
  "./js/analytics/views/view-progress-hub.js",
  "./js/analytics/views/view-progress.js",
  "./js/analytics/views/view-projections.js",
  "./js/analytics/views/view-recovery-metric.js",
  "./js/analytics/views/view-recovery-performance.js",
  "./js/analytics/views/view-recovery.js",
  "./js/analytics/views/view-run-performance.js",
  "./js/analytics/views/view-running-metric.js",
  "./js/analytics/views/view-running.js",
  "./js/analytics/views/view-strength-entity.js",
  "./js/analytics/views/view-strength-metric.js",
  "./js/analytics/views/view-strength-volume.js",
  "./js/analytics/views/view-strength.js",
  "./js/analytics/views/view-weekly-review.js",
  "./js/analytics/views/view-weekly-volume.js",
  "./js/analytics/volume-guide.js",
  "./js/analytics/week-chart-model.js",
  "./js/analytics/week-nav.js",
  "./js/analytics/weekly-aggregate.js",
  "./js/app.js",
  "./js/athlete-profile.js",
  "./js/brain/briefing.js",
  "./js/brain/coach-evidence.js",
  "./js/brain/coach-memory.js",
  "./js/brain/coach-qa.js",
  "./js/brain/day-verdict.js",
  "./js/brain/hybrid-score/config.js",
  "./js/brain/hybrid-score/dials.js",
  "./js/brain/hybrid-score/history.js",
  "./js/brain/hybrid-score/hybrid-score.js",
  "./js/brain/hybrid-score/levels.js",
  "./js/brain/hybrid-score/pillars.js",
  "./js/brain/hybrid-score/project.js",
  "./js/brain/hybrid-score/share-card.js",
  "./js/brain/hybrid-score/ui.js",
  "./js/brain/load_models.js",
  "./js/brain/monthly-report.js",
  "./js/brain/morning-briefing.js",
  "./js/brain/pr-share.js",
  "./js/brain/predictions.js",
  "./js/brain/recommendations.js",
  "./js/brain/risk.js",
  "./js/brain/streak.js",
  "./js/brain/weekly-review.js",
  "./js/constants.js",
  "./js/dashboard.js",
  "./js/dates.js",
  "./js/db.js",
  "./js/debug.js",
  "./js/dragdrop.js",
  "./js/engine.js",
  "./js/exercises/catalog.js",
  "./js/exercises/detail.js",
  "./js/fasting.js",
  "./js/fasting/fasting-achievements.js",
  "./js/fasting/fasting-actions.js",
  "./js/fasting/fasting-calcs.js",
  "./js/fasting/fasting-insights.js",
  "./js/fasting/fasting-nudge.js",
  "./js/fasting/fasting-ring.js",
  "./js/garmin.js",
  "./js/gps-tracker.js",
  "./js/gps/active-run-display.js",
  "./js/gps/native-bridge.js",
  "./js/gps/route-quality.js",
  "./js/gps/run-notices.js",
  "./js/haptics.js",
  "./js/health/health-bridge.js",
  "./js/health/health-fields.js",
  "./js/home.js",
  "./js/home/activity-calendar.js",
  "./js/home/dashboard-model.js",
  "./js/home/fasting-card.js",
  "./js/home/today-card.js",
  "./js/home/weekly-fitness-graph.js",
  "./js/metrics/metrics-load.js",
  "./js/metrics/metrics-running.js",
  "./js/metrics/metrics-strength.js",
  "./js/metrics/training-load.js",
  "./js/monitoring/report-error.js",
  "./js/monitoring/sentry-config.js",
  "./js/monitoring/sentry.js",
  "./js/notifications.js",
  "./js/onboarding.js",
  "./js/onboarding/preferences.js",
  "./js/onboarding/provisional-score.js",
  "./js/onboarding/starter-programs.js",
  "./js/portability/auto-backup.js",
  "./js/portability/csv-export.js",
  "./js/portability/export-service.js",
  "./js/profile-stats.js",
  "./js/program_builder.js",
  "./js/programs/activation.js",
  "./js/programs/active-plan-banner.js",
  "./js/programs/attribution.js",
  "./js/programs/catalog.js",
  "./js/programs/catalog/fitness.js",
  "./js/programs/catalog/hybrid.js",
  "./js/programs/catalog/hypertrophy.js",
  "./js/programs/catalog/hyrox.js",
  "./js/programs/catalog/jt-shed.js",
  "./js/programs/catalog/running.js",
  "./js/programs/catalog/shed-pplul.js",
  "./js/programs/catalog/strength.js",
  "./js/programs/collections.js",
  "./js/programs/compare-ui.js",
  "./js/programs/compare.js",
  "./js/programs/copy-program.js",
  "./js/programs/detail-fit.js",
  "./js/programs/detail.js",
  "./js/programs/editor-model.js",
  "./js/programs/jt-shed-model.js",
  "./js/programs/library.js",
  "./js/programs/phase.js",
  "./js/programs/program-card.js",
  "./js/programs/program-export.js",
  "./js/programs/progression.js",
  "./js/programs/recommendation-fit.js",
  "./js/programs/recommendations.js",
  "./js/programs/schedule.js",
  "./js/programs/search.js",
  "./js/programs/shed-pplul-model.js",
  "./js/programs/timeline.js",
  "./js/run-logger.js",
  "./js/schema.js",
  "./js/session-recap.js",
  "./js/set-utils.js",
  "./js/settings.js",
  "./js/state.js",
  "./js/state/activation-identity.js",
  "./js/state/auth.js",
  "./js/state/import-export.js",
  "./js/state/import-validate.js",
  "./js/state/lift-id.js",
  "./js/state/migration-recovery-ui.js",
  "./js/state/migrations.js",
  "./js/state/recovery-gate.js",
  "./js/state/recovery-vault.js",
  "./js/state/route-identity.js",
  "./js/state/route-portability.js",
  "./js/state/run-sessions.js",
  "./js/state/supabase.js",
  "./js/state/sync-conflict-ui.js",
  "./js/state/sync-guard.js",
  "./js/strength/duration.js",
  "./js/strength/e1rm.js",
  "./js/sw-reload.js",
  "./js/templates.js",
  "./js/timers.js",
  "./js/toast.js",
  "./js/train/train-landing.js",
  "./js/train/view-train-landing.js",
  "./js/ui/action-menu.js",
  "./js/ui/celebration.js",
  "./js/ui/clipboard.js",
  "./js/ui/confirm-modal.js",
  "./js/ui/icons.js",
  "./js/ui/leaflet-loader.js",
  "./js/ui/modal-stack.js",
  "./js/ui/render.js",
  "./js/ui/sortable.js",
  "./js/ui/undo-bar.js",
  "./js/ui/visible-viewport.js",
  "./js/util.js",
  "./js/util/bridge-callback-id.js",
  "./js/vendor/fit-parser.js",
  "./js/vendor/leaflet/leaflet.css",
  "./js/vendor/leaflet/leaflet.js",
  "./js/vendor/sentry-browser-8.55.0.min.js",
  "./js/vendor/supabase-js-2.45.4.umd.js",
  "./js/workout-map.js",
  "./js/workout-order.js",
  "./js/workout.js",
  "./js/workout/completion-policy.js",
  "./js/workout/delete-day.js",
  "./js/workout/exercise-history.js",
  "./js/workout/load-mode.js",
  "./js/workout/one-off-session.js",
  "./js/workout/plates.js",
  "./js/workout/program-session-picker.js",
  "./js/workout/run-type.js",
  "./js/workout/session-identity.js",
  "./js/workout/session-outline.js",
  "./js/workout/session-review.js",
  "./js/workout/session-status.js",
  "./js/workout/set-entry.js",
  "./js/workout/set-plan.js",
  "./js/workout/substitutions.js",
  "./manifest.json",
];

const OPTIONAL_ASSETS = [
  "./icon-512.png",
  "./js/vendor/leaflet/images/marker-icon.png",
  "./js/vendor/leaflet/images/marker-icon-2x.png",
  "./js/vendor/leaflet/images/marker-shadow.png",
  "./js/vendor/leaflet/images/layers.png",
  "./js/vendor/leaflet/images/layers-2x.png",
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Atomic — rejects (and aborts the install, keeping the old cache) if any
    // required asset can't be fetched.
    await cache.addAll(REQUIRED_ASSETS);
    // Optional assets: best-effort, never block activation.
    await Promise.allSettled(
      OPTIONAL_ASSETS.map((a) =>
        cache.add(a).catch((err) =>
          console.warn('[SW] optional asset skipped:', typeof a === 'string' ? a : a.url, err)
        )
      )
    );
    // Only take over fast once the required set is guaranteed present.
    await self.skipWaiting();
  })());
});

// Confirm the freshly-installed cache holds every required asset before we trust
// it enough to delete the previous one.
async function cacheIsComplete(cache) {
  for (const asset of REQUIRED_ASSETS) {
    const hit = await cache.match(asset);
    if (!hit) return false;
  }
  return true;
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (await cacheIsComplete(cache)) {
      // Safe to purge older versions — the replacement is complete + validated.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    } else {
      console.warn('[SW] new cache incomplete — keeping previous cache(s) to avoid a mixed-version app');
    }
    await self.clients.claim();
  })());
});

// Network-first for JS modules so bug fixes reach users immediately; fall back
// to cache only when offline; re-throw if cache is also empty.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isJSModule = url.pathname.startsWith('/js/') || url.pathname.endsWith('.js');

  if (isJSModule) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            throw new Error('[SW] Offline and not in cache: ' + event.request.url);
          })
        )
    );
  } else {
    // Cache-first for everything else (HTML, CSS, icons, fonts, approved assets).
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((err) => {
          console.log('[Service Worker] Network request failed, relying on cache.', err);
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});
