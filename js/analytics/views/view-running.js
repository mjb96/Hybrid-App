// ==========================================
// RUNNING VIEW (analytics/views/view-running.js)
// ==========================================
import { formatPace, paceZoneColour } from '../utils.js';
import { renderHrZonesChart, renderCadenceChart } from '../charts.js';

export function renderRunningAnalytics(data) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('allTimeRunDist', data.globalTotalDist.toFixed(1) + ' km');
  setText('allTimeRunElev', Math.round(data.globalTotalElev) + ' m');
  setText('allTimeRunCals', Math.round(data.globalTotalCals).toLocaleString());

  const thresholdInput = document.getElementById('analyticsThresholdPaceInput');
  if (thresholdInput && data.thresholdSecs && !thresholdInput.value) {
    thresholdInput.value = data.thresholdSecs;
  }

  const paceContainer = document.getElementById('paceTrendContainer');
  if (paceContainer) {
    const paceRows = data.weekLabels.map((lbl, i) => {
      if (data.paceData[i] <= 0) return '';
      const colour = paceZoneColour(data.paceData[i], data.thresholdSecs);
      return `<div class="flex-between py-2 border-b-glass text-base">
          <span class="text-inverse font-bold">${lbl}</span>
          <span class="font-heavy" style="color:${colour};font-variant-numeric:tabular-nums;">${formatPace(data.paceData[i])}</span>
         </div>`;
    }).filter(Boolean);

    paceContainer.innerHTML = paceRows.length
      ? paceRows.join('')
      : '<p style="color:rgba(255,255,255,0.6);font-size:0.9rem;">Log runs with time to see pace trends.</p>';
  }

  renderHrZonesChart(document.getElementById('hrZonesChartContainer'), data.weekLabels, data.hrZonesData);
  renderCadenceChart(document.getElementById('cadenceChartContainer'), data.weekLabels, data.cadenceData);
}
