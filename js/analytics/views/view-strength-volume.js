// @ts-check
// =============================================================================
// STRENGTH VOLUME (analytics/views/view-strength-volume.js) — roadmap Phase 3B
//
// ONE destination for "how much lifting have I done", replacing two that
// overlapped:
//
//   • Weekly Volume    — one calendar week in depth (day / workouts /
//                        exercises / muscles), reached from Strength
//   • Gym Performance  — Time / Sessions / Sets / Volume over 7D / 4W / 1Y,
//                        reachable ONLY from a Home carousel card
//
// Both were good screens presenting the same facts at different scopes, with
// no route between them — so the same question had two answers depending on
// which entry point you happened to use. They are now two tabs of one screen:
// "This week" (depth) and "Trends" (period explorer).
//
// Deep links are preserved: the `weekly-volume` and `gym-performance` contexts
// both resolve here and choose the opening tab, so existing entry points, Back
// destinations and any saved links keep working.
// =============================================================================

import { renderWeeklyVolumeBody } from './view-weekly-volume.js';
import { renderGymPerformanceBody } from './view-gym-performance.js';
import { esc } from './screen-kit.js';

/** @type {'week'|'trends'} */
let _tab = 'week';

/** Chosen by the routing context so a deep link opens on the right tab. */
export function setStrengthVolumeTab(tab) { _tab = tab === 'trends' ? 'trends' : 'week'; }
export function getStrengthVolumeTab() { return _tab; }

const TABS = Object.freeze([
  ['week', 'This week', 'One calendar week in depth'],
  ['trends', 'Trends', '7D · 4W · 1Y across sets, time and volume'],
]);

function tabBar() {
  return `<nav class="an-segment sv-tabs" aria-label="Strength volume view">
    ${TABS.map(([id, label, hint]) => `<button type="button" class="an-segment__button${_tab === id ? ' is-active' : ''}"
      data-strength-volume-tab="${id}" aria-pressed="${_tab === id}" title="${esc(hint)}">${esc(label)}</button>`).join('')}
  </nav>`;
}

/** @param {any} state */
export function renderStrengthVolume(state) {
  const root = document.getElementById('strengthVolumeDetail');
  if (!root) return;

  root.innerHTML = `
    <header class="an-detail-head">
      <div><span class="an-detail-kicker">Strength analytics</span><h2>Volume</h2></div>
    </header>
    ${tabBar()}
    <div id="strengthVolumeBody"></div>`;

  const body = document.getElementById('strengthVolumeBody');
  if (body) {
    if (_tab === 'trends') renderGymPerformanceBody(body, state);
    else renderWeeklyVolumeBody(body, state);
  }

  root.querySelectorAll('[data-strength-volume-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      _tab = button.getAttribute('data-strength-volume-tab') === 'trends' ? 'trends' : 'week';
      renderStrengthVolume(state);
    });
  });
}
