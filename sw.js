// ==========================================
// SERVICE WORKER (sw.js)
// ==========================================
const CACHE_NAME = 'hybrid-training-v29';

const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.json',
  './icon-512.png',
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
  './js/util.js',
  './js/dates.js',
  './js/schema.js',
  './js/metrics/metrics-strength.js',
  './js/metrics/metrics-running.js',
  './js/metrics/metrics-load.js',
  './js/brain/load_models.js',
  './js/brain/briefing.js',
  './js/analytics/utils.js',
  './js/analytics/charts.js',
  './js/analytics/views/view-strength.js',
  './js/analytics/views/view-running.js',
  './js/analytics/views/view-recovery.js',
  './js/analytics/views/view-bodyweight.js',
  './js/analytics/views/view-progress.js',
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
