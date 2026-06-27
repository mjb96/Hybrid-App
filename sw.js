// ==========================================
// SERVICE WORKER (sw.js)
// ==========================================
const CACHE_NAME = 'helyx-v68';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/analytics.css',
  './css/programs.css',
  './manifest.json',
  './icon-512.png',
  // Core app
  './js/app.js',
  './js/constants.js',
  './js/analytics.js',
  './js/dashboard.js',
  './js/db.js',
  './js/dragdrop.js',
  './js/engine.js',
  './js/debug.js',
  './js/garmin.js',
  './js/home.js',
  './js/state.js',
  './js/templates.js',
  './js/timers.js',
  './js/workout.js',
  './js/workout-map.js',
  './js/program_builder.js',
  './js/toast.js',
  './js/haptics.js',
  './js/util.js',
  './js/ui/render.js',
  './js/dates.js',
  './js/schema.js',
  './js/onboarding.js',
  './js/settings.js',
  './js/run-logger.js',
  './js/athlete-profile.js',
  './js/profile-stats.js',
  './js/gps-tracker.js',
  './js/fasting.js',
  './js/notifications.js',
  // Health (native bridge)
  './js/health/health-bridge.js',
  // State sub-modules
  './js/state/auth.js',
  './js/state/import-export.js',
  './js/state/supabase.js',
  './js/state/migrations.js',
  // Metrics
  './js/metrics/metrics-strength.js',
  './js/metrics/metrics-running.js',
  './js/metrics/metrics-load.js',
  // Brain / AI
  './js/brain/load_models.js',
  './js/brain/briefing.js',
  './js/brain/recommendations.js',
  // Fasting sub-modules
  './js/fasting/fasting-achievements.js',
  './js/fasting/fasting-calcs.js',
  './js/fasting/fasting-education.js',
  './js/fasting/fasting-insights.js',
  // Programs
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
  './js/programs/recommendations.js',
  './js/programs/search.js',
  // Home sub-modules
  './js/home/activity-calendar.js',
  './js/home/fasting-card.js',
  './js/home/tile-renderers.js',
  './js/home/weekly-fitness-graph.js',
  // Analytics
  './js/analytics/utils.js',
  './js/analytics/charts.js',
  './js/analytics/week-nav.js',
  './js/analytics/calculations/load-calcs.js',
  './js/analytics/calculations/math-utils.js',
  './js/analytics/calculations/recovery-calcs.js',
  './js/analytics/calculations/running-calcs.js',
  './js/analytics/calculations/strength-calcs.js',
  './js/analytics/charts/chart-primitives.js',
  './js/analytics/charts/fasting-charts.js',
  './js/analytics/charts/load-charts.js',
  './js/analytics/charts/recovery-charts.js',
  './js/analytics/charts/running-charts.js',
  './js/analytics/charts/strength-charts.js',
  './js/analytics/insights/insight-engine.js',
  './js/analytics/scoring/readiness-scoring.js',
  './js/analytics/views/view-strength.js',
  './js/analytics/views/view-running.js',
  './js/analytics/views/view-recovery.js',
  './js/analytics/views/view-bodyweight.js',
  './js/analytics/views/view-fasting.js',
  './js/analytics/views/view-load-focus.js',
  './js/analytics/views/view-progress.js',
  './js/analytics/views/view-run-crossref.js',
  './js/analytics/views/view-training-status.js',
  './js/analytics/views/view-vdot.js',
  './js/analytics/views/view-avg-pace.js',
  './js/analytics/views/view-stress-balance.js',
  './js/analytics/views/view-weekly-summary.js',
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
