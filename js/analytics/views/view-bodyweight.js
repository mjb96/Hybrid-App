// ==========================================
// BODY WEIGHT VIEW (analytics/views/view-bodyweight.js)
// ==========================================
import { renderBodyWeightChart } from '../charts.js';

export function renderBodyWeightAnalytics(data) {
  const bwContainer = document.getElementById('bwChartContainer');
  renderBodyWeightChart(bwContainer, data.bodyWeightLog);
}
