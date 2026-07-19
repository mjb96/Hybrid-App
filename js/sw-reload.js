// Register the service worker before the ES-module app starts. Keeping this in
// a classic, dependency-free script is an upgrade-safety boundary: even if a
// stale cached module makes the app import graph fail, the browser can still
// discover, install and activate the repaired worker/cache.
//
// Reload once when a NEW worker takes over an already-controlled page. Skip
// this on the first visit: clients.claim() also fires controllerchange there,
// but the page already came from the network and a reload only causes a flash.
// This file stays classic/non-module so it can enforce the boundary without
// importing any app code and while the strict CSP forbids inline script.
if ('serviceWorker' in navigator) {
  const wasControlled = Boolean(navigator.serviceWorker.controller);

  if (wasControlled) {
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    });
  }

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch((err) => {
    console.warn('Service worker registration failed:', err);
  });
}
