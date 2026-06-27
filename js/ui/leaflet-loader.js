// @ts-check
// =============================================================================
// LEAFLET LOADER — load the mapping library on demand, never at boot.
//
// Leaflet (~150KB JS + CSS) is only needed on the few screens that draw a route
// map (GPS live tracking, the run map, the home mini-map). Loading it from a CDN
// in <head> put it on the critical boot path: if unpkg was slow or unreachable,
// the whole app waited on it before first paint. This fetches it the moment a
// map is actually needed, caches the promise, and lets boot proceed regardless.
// =============================================================================

const CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS_URL  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let _promise = null;

/**
 * Resolves with the Leaflet global (`L`) once it is loaded. Cached, so repeated
 * calls share one fetch. Rejects (and clears the cache so a later call can
 * retry) if the script fails to load.
 * @returns {Promise<any>}
 */
export function ensureLeaflet() {
  const w = /** @type {any} */ (typeof window !== 'undefined' ? window : {});
  if (w.L) return Promise.resolve(w.L);
  if (_promise) return _promise;

  _promise = new Promise((resolve, reject) => {
    try {
      if (!document.querySelector('link[data-leaflet]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = CSS_URL;
        link.setAttribute('data-leaflet', '');
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = JS_URL;
      script.async = true;
      script.setAttribute('data-leaflet', '');
      script.onload = () => {
        if (w.L) resolve(w.L);
        else { _promise = null; reject(new Error('Leaflet loaded but global L is missing')); }
      };
      script.onerror = () => { _promise = null; reject(new Error('Failed to load Leaflet')); };
      document.head.appendChild(script);
    } catch (err) {
      _promise = null;
      reject(err);
    }
  });
  return _promise;
}
