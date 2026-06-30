// @ts-check
// ==========================================
// UTILITY HELPERS (util.js)
// ==========================================
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ESC[c]);

export const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

// Program completion %, by *completed* weeks: in week N you've finished N-1 of
// `total`. Single source of truth so the library banner and active-plan hero
// can't drift apart. Clamped to 0–100.
export const programProgressPct = (currentWeek, totalWeeks) => {
  const n = parseInt(currentWeek, 10) || 1;
  const t = parseInt(totalWeeks, 10) || 12;
  return Math.min(100, Math.max(0, Math.round(((n - 1) / t) * 100)));
};
