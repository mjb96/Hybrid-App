// @ts-check
// =============================================================================
// ICON SET (js/ui/icons.js)
//
// One restrained inline-SVG stroke set that replaces emoji on the premium chrome
// (bottom nav + Insights hub). 24×24, currentColor, 2px round strokes — so icons
// inherit the surrounding text colour and read as one system instead of the
// multicoloured emoji grab-bag. Static surfaces mark a span with
// `data-icon="name"` and call paintIcons() once on boot; dynamic surfaces can
// call icon(name) directly in their template strings.
// =============================================================================

// Path bodies only (the <svg> wrapper is shared). Kept deliberately geometric
// and simple so every glyph renders crisply at 24px and reads at a glance.
const PATHS = Object.freeze({
  home:      '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  dumbbell:  '<path d="M6.5 7v10M17.5 7v10M4 9.5v5M20 9.5v5M6.5 12h11"/>',
  chart:     '<path d="M4 20h16"/><path d="M7.5 20v-5M12 20V8M16.5 20v-8"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5a3 3 0 0 1 6 0"/><path d="M9 11h6M9 15h4"/>',
  gauge:     '<path d="M4 16.5a8 8 0 1 1 16 0"/><path d="M12 16.5 16 11"/>',
  activity:  '<path d="M3 12h4l2.5-7 5 14 2.5-7H21"/>',
  heart:     '<path d="M12 20s-7-4.6-9-9.2A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 9 4.8C19 15.4 12 20 12 20z"/>',
  book:      '<path d="M5 5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2z"/><path d="M5 5v13"/>',
  clock:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  scale:     '<path d="M4 20h16"/><path d="M12 4v16"/><path d="M7.5 8h9l-2.2 5H9.7z"/>',
  sparkle:   '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  plus:      '<path d="M12 5v14M5 12h14"/>',
  user:      '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
});

/**
 * One inline SVG icon string. Inherits colour (currentColor) and sizes to `size`.
 * @param {string} name
 * @param {{size?:number, cls?:string}} [opts]
 */
export function icon(name, { size = 24, cls = '' } = {}) {
  const body = PATHS[name];
  if (!body) return '';
  return `<svg class="ic${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// Fill every [data-icon] span under `root` with its glyph. Idempotent — safe to
// call again after DOM changes (skips spans already painted).
export function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    if (!name || el.firstElementChild) return;
    const svg = icon(name);
    if (svg) el.innerHTML = svg;
  });
}
