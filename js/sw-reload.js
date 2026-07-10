// Reload once when a NEW service worker takes over an already-controlled page
// (i.e. an app update), so the user gets the fresh cached assets. Crucially,
// skip this on the FIRST visit: there, the page loaded from the network and the
// SW's initial clients.claim() fires controllerchange too — reloading then is
// pointless and causes a jarring first-launch flash.
//
// Extracted from an inline <script> so the page can enforce a strict
// Content-Security-Policy (script-src without 'unsafe-inline').
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) { reloading = true; window.location.reload(); }
  });
}
