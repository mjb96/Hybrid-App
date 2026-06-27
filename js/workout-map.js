// ==========================================
// WORKOUT RUN MAP (workout-map.js)
// Renders the IndexedDB-stored GPS route for the active day via Leaflet.
// Extracted verbatim from workout.js renderWorkout(); logic unchanged.
// ==========================================
import { getMapFromDB } from './db.js';
import { ensureLeaflet } from './ui/leaflet-loader.js';

// Private module-scoped Leaflet instance for the active workout map.
let activeWorkoutMapInstance = null;

// Returns a colour string for a given pace relative to threshold.
// delta = secPerKm - thresholdSec: positive = slower, negative = faster.
function paceZoneColour(secPerKm, thresholdSec) {
  if (!thresholdSec) return '#f43f5e';
  const delta = secPerKm - thresholdSec;
  if (delta >  90) return '#22d3ee';  // cyan   — very easy
  if (delta >  30) return '#10b981';  // green  — easy
  if (delta > -30) return '#f59e0b';  // amber  — at threshold
  if (delta > -60) return '#f97316';  // orange — hard
  return '#ef4444';                   // red    — very hard
}

// Draws coloured polylines per km split onto an already-initialised map.
// splits: [{ coordsStartIdx, coordsEndIdx, time (sec) }]
// coords: [[lat, lng], …] full route array
function drawPaceSegments(map, coords, splits, thresholdSec) {
  for (const split of splits) {
    const segment = coords.slice(split.coordsStartIdx, split.coordsEndIdx + 1);
    if (segment.length < 2) continue;
    const secPerKm = split.time;  // time is already sec/km for a 1 km split
    const colour = paceZoneColour(secPerKm, thresholdSec);
    L.polyline(segment, { color: colour, weight: 5, opacity: 0.9 }).addTo(map);
  }
  // Draw the tail after the last full km in pink (no split data yet)
  const lastIdx = splits.length > 0 ? splits[splits.length - 1].coordsEndIdx : 0;
  if (lastIdx < coords.length - 1) {
    const tail = coords.slice(lastIdx);
    if (tail.length >= 2) {
      L.polyline(tail, { color: '#f43f5e', weight: 5, opacity: 0.9 }).addTo(map);
    }
  }
}

// hasDistance: pass the run's recorded distance (truthy => a run exists to map).
// options: { splits, thresholdSec } — when provided, draws pace-zone colouring.
export function renderRunMap(wk, selectedDay, hasDistance, options = {}) {
  const runMapContainer = document.getElementById('runMapContainer');
  if (!runMapContainer) return;

  if (hasDistance) {
    getMapFromDB(wk, selectedDay).then(async coords => {
      if (coords && coords.length > 0) {
        runMapContainer.style.display = 'block';
        try { await ensureLeaflet(); } catch { runMapContainer.style.display = 'none'; return; }
        setTimeout(() => {
          if (activeWorkoutMapInstance) { activeWorkoutMapInstance.remove(); activeWorkoutMapInstance = null; }
          runMapContainer.innerHTML = '';
          activeWorkoutMapInstance = L.map('runMapContainer');
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(activeWorkoutMapInstance);

          const { splits, thresholdSec } = options;
          const hasPaceData = splits && splits.length > 0 && splits[0].coordsStartIdx !== undefined;

          if (hasPaceData) {
            drawPaceSegments(activeWorkoutMapInstance, coords, splits, thresholdSec);
          } else {
            L.polyline(coords, { color: '#f43f5e', weight: 4, opacity: 0.9 }).addTo(activeWorkoutMapInstance);
          }

          const bounds = L.latLngBounds(coords);
          activeWorkoutMapInstance.fitBounds(bounds, { padding: [10, 10] });
          activeWorkoutMapInstance.invalidateSize();
        }, 100);
      } else {
        runMapContainer.style.display = 'none';
      }
    });
  } else {
    runMapContainer.style.display = 'none';
  }
}