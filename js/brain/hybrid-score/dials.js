// @ts-check
// =============================================================================
// HYBRID SCORE — 3 DIALS (js/brain/hybrid-score/dials.js)
//
// V2 presentation layer: the eight pillars a human can't hold collapse into
// three a human can — TRAIN, RECOVER, PROGRESS. The composite MATH is untouched
// (see PRODUCT_V2 §2). This is a pure re-grouping of the pillar sub-scores the
// engine already produced, weighted by each pillar's own renormalised weight so
// a dial stays consistent with the score it helps explain. The 8 pillars remain
// available underneath as the "under the hood" expansion.
// =============================================================================
import { PILLAR_WEIGHTS } from './config.js';

// Which pillars feed each dial. (PRODUCT_V2 §2.1 lists TRAIN/RECOVER/PROGRESS;
// Body — body-composition-vs-goal — is a "getting fitter" signal, so it lives in
// PROGRESS, the honest home the doc leaves it out of.)
export const DIAL_MAP = Object.freeze({
  train:    { label: 'TRAIN',    pillars: ['consistency', 'load'] },
  recover:  { label: 'RECOVER',  pillars: ['recovery', 'lifestyle'] },
  progress: { label: 'PROGRESS', pillars: ['strength', 'endurance', 'momentum', 'body'] },
});

// Build the three dials from a computed hybrid-score result (the object returned
// by computeHybridScore, which carries `pillars` keyed by pillar id, each with a
// `score` 0–100|null and a renormalised `weight`). A dial averages its available
// members weighted by their weight; members without data are skipped and the dial
// renormalises across what's left. A dial whose members are all data-less is null
// (calibrating) — never a misleading zero.
export function computeDials(result) {
  const pillars = (result && result.pillars) || {};
  return Object.entries(DIAL_MAP).map(([id, def]) => {
    let weighted = 0, wsum = 0;
    const active = [];
    for (const k of def.pillars) {
      const p = pillars[k];
      if (!p || p.score == null || p.included === false) continue;
      const w = (p.weight != null ? p.weight : (PILLAR_WEIGHTS[k] || 0) * 100) || 1;
      weighted += p.score * w;
      wsum += w;
      active.push(k);
    }
    return {
      id,
      label: def.label,
      score: wsum > 0 ? Math.round(weighted / wsum) : null,
      pillars: def.pillars,     // the members, for the "under the hood" expansion
      activePillars: active,    // those that actually had data today
    };
  });
}
