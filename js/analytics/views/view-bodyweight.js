// ==========================================
// BODY WEIGHT VIEW (analytics/views/view-bodyweight.js)
// ==========================================
import { renderBodyWeightWithMA } from '../charts.js';

export function renderBodyWeightAnalytics(data, getState) {
  const bwArticle = document.getElementById('bwChartContainer')?.closest('article') ||
                    document.getElementById('bwChartContainer')?.parentElement;
  const bwContainer = document.getElementById('bwChartContainer');
  renderBodyWeightWithMA(bwContainer, data.bodyWeightLog);

  // Weekly average stats
  const parent = bwArticle || bwContainer?.parentElement;
  if (!parent) return;

  let statsDiv = document.getElementById('bwWeeklyStats');
  if (!statsDiv) {
    statsDiv = document.createElement('div');
    statsDiv.id = 'bwWeeklyStats';
    parent.after(statsDiv);
  }

  const log = (data.bodyWeightLog || []).filter(e => e && e.date && e.weight > 0);
  if (log.length < 2) {
    statsDiv.innerHTML = '';
    return;
  }

  // Group by ISO week
  const byWeek = {};
  log.forEach(e => {
    const d = new Date(e.date);
    // ISO week: use a simple approach — group by year+week number
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-W${weekNum}`;
    if (!byWeek[key]) byWeek[key] = [];
    byWeek[key].push(e.weight);
  });

  const weekKeys = Object.keys(byWeek).sort();
  const weekAvgs = weekKeys.map(k => {
    const vals = byWeek[k];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  // Last 7-day average
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);
  const avg7 = last7.reduce((a, e) => a + e.weight, 0) / last7.length;

  // Least-squares slope (kg/week)
  let trendKgPerWk = null;
  if (weekAvgs.length >= 2) {
    const nw = weekAvgs.length;
    const xs = weekAvgs.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / nw;
    const meanY = weekAvgs.reduce((a, b) => a + b, 0) / nw;
    const num = xs.reduce((sum, x, i) => sum + (x - meanX) * (weekAvgs[i] - meanY), 0);
    const den = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
    trendKgPerWk = den > 0 ? num / den : 0;
  }

  let trendHtml = '';
  if (trendKgPerWk !== null) {
    const sign = trendKgPerWk >= 0 ? '+' : '';
    const abs = Math.abs(trendKgPerWk);
    // Color: losing weight = green, gaining = red, flat = grey
    const color = abs <= 0.1 ? 'rgba(255,255,255,0.5)' : trendKgPerWk < 0 ? '#10b981' : '#ef4444';
    trendHtml = `<div class="flex-between py-2">
      <span class="text-sm text-muted">Trend</span>
      <span class="font-heavy" style="color:${color};">${sign}${trendKgPerWk.toFixed(1)} kg/wk</span>
    </div>`;
  }

  statsDiv.innerHTML = `
    <article class="card-dark p-3 mt-3">
      <div class="flex-between py-2 border-b-glass">
        <span class="text-sm text-muted">7d Avg</span>
        <span class="font-heavy text-inverse">${avg7.toFixed(1)} kg</span>
      </div>
      ${trendHtml}
    </article>
  `;
}
