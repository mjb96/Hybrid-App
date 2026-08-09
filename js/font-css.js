// Promote the webfont stylesheet from a non-blocking load to an applied one.
//
// index.html requests it with media="print" so it cannot block first paint.
// A print stylesheet is still FETCHED, just not applied to the screen, so this
// only has to flip the media attribute once it has arrived.
//
// Why a file instead of an onload attribute: the CSP forbids inline script, and
// that is worth more than the two lines this costs. Same boundary as
// js/sw-reload.js — classic, no imports, no app dependencies.
//
// Why it matters: the previous plain stylesheet link blocked rendering until it
// loaded or timed out. On any start where fonts.googleapis.com is unreachable —
// which is EVERY offline start of this PWA, cached or not — that measured
// 12,530ms of a 12,656ms first contentful paint. The app was fully cached and
// still painted nothing, because a font it does not need was in front of it.
(function () {
  var link = document.querySelector('link[data-async-font]');
  if (!link) return;

  function apply() { link.media = 'all'; }

  // Already complete (memory/disk cache) — `sheet` is set once it has parsed.
  if (link.sheet) { apply(); return; }

  link.addEventListener('load', apply);
  // A failed font is not an error worth surfacing; the fallback stack is fine.
  link.addEventListener('error', function () { link.media = 'all'; });
})();
