// ==========================================
// APP SMOKE TEST (scripts/smoke.mjs) — run with: node scripts/smoke.mjs
// ------------------------------------------
// Imports the real app.js module graph under a minimal DOM mock and forces a
// home render. Catches cross-module import-resolution errors and module-eval /
// render crashes that `node --check` and unit tests do NOT (a bad import gives
// a blank screen in the browser). CDN (https://) imports are stubbed.
// ==========================================
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s,c,n){ if(s.startsWith('https://')) return {url:'stub:'+s,shortCircuit:true}; return n(s,c); }
export async function load(u,c,n){ if(u.startsWith('stub:')) return {format:'module',shortCircuit:true,source:"const d={from:()=>({})};export default d;export const Buffer=d;export class FitParser{parse(){}}"}; return n(u,c); }
`));

const noop = () => {};
const store = new Map();
const makeEl = (id) => {
  const e = { id: id || '', setAttribute: noop, getAttribute: () => null, removeAttribute: noop, appendChild: (c) => c,
    insertBefore: (c) => c, removeChild: noop, remove: noop, addEventListener: noop, removeEventListener: noop,
    dispatchEvent: noop, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    contains: () => false, click: noop, focus: noop, getBoundingClientRect: () => ({ top:0,left:0,width:100,height:50 }),
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    previousElementSibling: null, firstChild: null, parentElement: null, parentNode: { removeChild: noop }, children: [], offsetWidth: 100 };
  let h = '', t = '', v = '';
  Object.defineProperty(e, 'innerHTML', { get: () => h, set: (x) => { h = String(x); } });
  Object.defineProperty(e, 'textContent', { get: () => t, set: (x) => { t = String(x); } });
  Object.defineProperty(e, 'value', { get: () => v, set: (x) => { v = String(x); } });
  return e;
};
globalThis.document = { addEventListener: noop, removeEventListener: noop,
  getElementById: (id) => { if (!store.has(id)) store.set(id, makeEl(id)); return store.get(id); },
  querySelector: () => null, querySelectorAll: () => [], createElement: () => makeEl(), dispatchEvent: noop,
  readyState: 'complete', body: makeEl('body'), documentElement: makeEl('html') };
globalThis.window = { addEventListener: noop, removeEventListener: noop, supabase: undefined,
  location: { reload: noop, href: '' }, scrollTo: noop, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.localStorage = { s: {}, getItem(k){ return this.s[k] ?? null; }, setItem(k,v){ this.s[k] = String(v); }, removeItem(k){ delete this.s[k]; } };
Object.defineProperty(globalThis, 'navigator', { value: { serviceWorker: { register: () => Promise.reject(new Error('no sw')), addEventListener: noop, removeEventListener: noop }, vibrate: noop }, configurable: true });
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
globalThis.L = { map: () => ({ remove: noop, fitBounds: noop }), tileLayer: () => ({ addTo: () => ({}) }), polyline: () => ({ addTo: () => ({ getBounds: noop }) }) };

// Fail the smoke run on UNEXPECTED console.error / unhandled rejection / uncaught
// exception — a test that "passes" while the app logs runtime errors (the class
// of bug this audit calls out, e.g. `window.scrollTo is not a function`) is a
// false green. A short allowlist covers messages that are expected under the DOM
// mock (no Supabase global, no real service worker).
const ALLOWED_ERROR_PATTERNS = [
  /Supabase global not found/i,
  /Service worker registration failed/i,
  /\bno sw\b/i,
];
const isAllowed = (msg) => ALLOWED_ERROR_PATTERNS.some((re) => re.test(msg));

const unexpectedErrors = [];
const realConsoleError = console.error.bind(console);
console.error = (...args) => {
  const msg = args.map((a) => (a && a.stack) ? a.stack : String(a)).join(' ');
  if (!isAllowed(msg)) unexpectedErrors.push(msg);
  realConsoleError(...args);
};
process.on('unhandledRejection', (reason) => {
  const msg = (reason && reason.stack) ? reason.stack : String(reason);
  if (!isAllowed(msg)) unexpectedErrors.push('unhandledRejection: ' + msg);
});

try {
  const mod = await import(new URL('../js/app.js', import.meta.url));
  await new Promise(r => setTimeout(r, 150));
  if (mod.hydrateCurrentView) mod.hydrateCurrentView();
  if (unexpectedErrors.length) {
    realConsoleError('SMOKE FAIL — unexpected runtime error(s) logged:\n' + unexpectedErrors.join('\n---\n'));
    process.exit(1);
  }
  console.log('SMOKE OK — app graph imported and home rendered without throwing (no unexpected console errors)');
} catch (e) {
  realConsoleError('SMOKE FAIL:\n', e && e.stack ? e.stack : e);
  process.exit(1);
}
