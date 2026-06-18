// ==========================================
// RUN CROSS-REFERENCE VIEW (analytics/views/view-run-crossref.js)
// ==========================================
import { formatPace, parsePaceSeconds } from '../utils.js';

function divergenceFlag(rpe, te) {
  if (!rpe || !te) return { label: '—', color: 'rgba(255,255,255,0.3)' };
  const rpeNorm = rpe / 10;
  const teNorm  = te / 5;
  if (rpeNorm > teNorm + 0.2) return { label: 'Felt harder',   color: '#f59e0b' };
  if (teNorm  > rpeNorm + 0.2) return { label: 'Physio harder', color: '#3b82f6' };
  return                               { label: 'Aligned',       color: '#10b981' };
}

function rpeColor(rpe) {
  if (rpe >= 8) return '#ef4444';
  if (rpe >= 6) return '#f59e0b';
  return '#10b981';
}

export function renderRunCrossRefAnalytics(data, getState, getDays) {
  const appState  = getState();
  const days      = getDays();
  const container = document.getElementById('rcTable');
  if (!container) return;

  // Collect up to 10 most recent runs, newest first
  const runs = [];
  const sortedWks = Object.keys(appState.weeks || {})
    .map(Number).sort((a, b) => b - a);

  outer: for (const wkNum of sortedWks) {
    const wkData = appState.weeks[String(wkNum)];
    if (!wkData) continue;
    const revDays = [...days].reverse();
    for (const d of revDays) {
      const run = wkData.runs?.[d];
      if (!run || !(parseFloat(run.dist) > 0)) continue;
      runs.push({ wkNum, day: d, run });
      if (runs.length >= 10) break outer;
    }
  }

  if (!runs.length) {
    container.innerHTML = `<p style="color:rgba(255,255,255,0.5);font-size:0.9rem;padding:1rem 0;">No runs logged yet.</p>`;
    return;
  }

  const rows = runs.map(({ wkNum, day, run }) => {
    const dist = parseFloat(run.dist) || 0;
    const rpe  = run.rpe  != null && run.rpe  !== '' ? parseFloat(run.rpe)  : null;
    const te   = run.trainingEffect != null && run.trainingEffect !== ''
                   ? parseFloat(run.trainingEffect) : null;

    const secsPerKm = parsePaceSeconds(dist, run.time || '');
    const paceStr   = secsPerKm > 0 ? formatPace(secsPerKm) : '—';

    const { label: divLabel, color: divColor } = divergenceFlag(rpe, te);
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

    return `<tr>
      <td>W${wkNum}&thinsp;${dayLabel}</td>
      <td>${dist.toFixed(1)}&thinsp;km</td>
      <td>${paceStr}</td>
      <td style="color:${rpe != null ? rpeColor(rpe) : 'inherit'}">${rpe ?? '—'}</td>
      <td>${te != null ? te.toFixed(1) : '—'}</td>
      <td style="color:${divColor};font-size:0.75rem;white-space:nowrap;">${divLabel}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `<table class="analytics-table w-full">
    <thead>
      <tr>
        <th>Wk / Day</th>
        <th>Dist</th>
        <th>Pace</th>
        <th>RPE</th>
        <th>TE</th>
        <th>Verdict</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}
