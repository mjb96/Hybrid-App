// @ts-check
// ==========================================
// UTILITY HELPERS (util.js)
// ==========================================
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (str) => String(str).replace(/[&<>"']/g, (c) => ESC[c]);

export const truncate = (str, max) => str.length > max ? str.slice(0, max - 1) + '…' : str;

export const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
