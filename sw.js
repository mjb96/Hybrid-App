// ==========================================
// SERVICE WORKER (sw.js)
// ==========================================
const CACHE_NAME = 'helyx-v91';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png',
  './css/analytics.css',
  './css/hybrid-score.css',
  './css/programs.css',
  './css/styles.css',
  './js/analytics.js',
  './js/analytics/calculations/load-calcs.js',
  './js/analytics/calculations/math-utils.js',
  './js/analytics/calculations/recovery-calcs.js',
  './js/analytics/calculations/running-calcs.js',
  './js/analytics/calculations/strength-calcs.js',
  './js/analytics/calculations/volume-landmarks.js',
  './js/analytics/charts.js',
  './js/analytics/charts/chart-primitives.js',
  './js/analytics/charts/fasting-charts.js',
  './js/analytics/charts/load-charts.js',
  './js/analytics/charts/recovery-charts.js',
  './js/analytics/charts/running-charts.js',
  './js/analytics/charts/strength-charts.js',
  './js/analytics/insights/build-insights.js',
  './js/analytics/insights/insight-engine.js',
  './js/analytics/logged-days.js',
  './js/analytics/scoring/readiness-scoring.js',
  './js/analytics/utils.js',
  './js/analytics/views/screen-kit.js',
  './js/analytics/views/view-bodyweight.js',
  './js/analytics/views/view-fasting.js',
  './js/analytics/views/view-monthly-report.js',
  './js/analytics/views/view-progress.js',
  './js/analytics/views/view-projections.js',
  './js/analytics/views/view-recovery.js',
  './js/analytics/views/view-running.js',
  './js/analytics/views/view-strength.js',
  './js/analytics/views/view-weekly-review.js',
  './js/analytics/week-nav.js',
  './js/app.js',
  './js/athlete-profile.js',
  './js/brain/briefing.js',
  './js/brain/coach-memory.js',
  './js/brain/hybrid-score/config.js',
  './js/brain/hybrid-score/dials.js',
  './js/brain/hybrid-score/history.js',
  './js/brain/hybrid-score/hybrid-score.js',
  './js/brain/hybrid-score/project.js',
  './js/brain/hybrid-score/levels.js',
  './js/brain/hybrid-score/pillars.js',
  './js/brain/hybrid-score/ui.js',
  './js/brain/load_models.js',
  './js/brain/monthly-report.js',
  './js/brain/morning-briefing.js',
  './js/brain/predictions.js',
  './js/brain/recommendations.js',
  './js/brain/risk.js',
  './js/brain/streak.js',
  './js/brain/weekly-review.js',
  './js/constants.js',
  './js/dashboard.js',
  './js/dates.js',
  './js/db.js',
  './js/debug.js',
  './js/dragdrop.js',
  './js/engine.js',
  './js/fasting.js',
  './js/fasting/fasting-achievements.js',
  './js/fasting/fasting-actions.js',
  './js/fasting/fasting-calcs.js',
  './js/fasting/fasting-insights.js',
  './js/fasting/fasting-nudge.js',
  './js/fasting/fasting-ring.js',
  './js/garmin.js',
  './js/gps-tracker.js',
  './js/gps/native-bridge.js',
  './js/haptics.js',
  './js/health/health-bridge.js',
  './js/home.js',
  './js/home/activity-calendar.js',
  './js/home/dashboard-model.js',
  './js/home/fasting-card.js',
  './js/home/morning-briefing-card.js',
  './js/home/tile-renderers.js',
  './js/home/weekly-fitness-graph.js',
  './js/metrics/metrics-load.js',
  './js/metrics/metrics-running.js',
  './js/metrics/metrics-strength.js',
  './js/monitoring/sentry-config.js',
  './js/monitoring/sentry.js',
  './js/notifications.js',
  './js/onboarding.js',
  './js/onboarding/provisional-score.js',
  './js/profile-stats.js',
  './js/program_builder.js',
  './js/programs/catalog.js',
  './js/programs/catalog/fitness.js',
  './js/programs/catalog/hybrid.js',
  './js/programs/catalog/hypertrophy.js',
  './js/programs/catalog/hyrox.js',
  './js/programs/catalog/running.js',
  './js/programs/catalog/strength.js',
  './js/programs/collections.js',
  './js/programs/detail.js',
  './js/programs/library.js',
  './js/programs/program-card.js',
  './js/programs/recommendations.js',
  './js/programs/search.js',
  './js/run-logger.js',
  './js/schema.js',
  './js/session-recap.js',
  './js/set-utils.js',
  './js/settings.js',
  './js/state.js',
  './js/state/auth.js',
  './js/state/import-export.js',
  './js/state/migrations.js',
  './js/state/supabase.js',
  './js/state/sync-conflict-ui.js',
  './js/state/sync-guard.js',
  './js/templates.js',
  './js/timers.js',
  './js/toast.js',
  './js/ui/celebration.js',
  './js/ui/confirm-modal.js',
  './js/ui/leaflet-loader.js',
  './js/ui/render.js',
  './js/ui/sortable.js',
  './js/util.js',
  './js/workout-map.js',
  './js/workout-order.js',
  './js/workout.js',
];

const CDN_ASSETS = [
  new Request('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', { mode: 'cors' }),
  new Request('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', { mode: 'cors' }),
  new Request('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', { mode: 'cors' }),
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets');
      const all = [...LOCAL_ASSETS, ...CDN_ASSETS];
      return Promise.allSettled(
        all.map((asset) =>
          cache.add(asset).catch((err) =>
            console.warn('[Service Worker] Failed to cache:', typeof asset === 'string' ? asset : asset.url, err)
          )
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first for JS modules so bug fixes reach users immediately;
// fall back to cache only when offline; re-throw if cache is also empty.
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
    // Cache-first for everything else (HTML, CSS, icons, CDN)
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
