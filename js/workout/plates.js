// @ts-check
// =============================================================================
// PLATE MATH (js/workout/plates.js)
//
// Pure, DOM-free. "What do I load per side?" — table stakes for barbell lifters
// and a gap vs every competitor. Greedy breakdown of a target weight onto a bar,
// per side, from the standard plate set. C4b of the audit plan; surfaced inline
// on the cockpit's coach-target line (no new buttons).
// =============================================================================

export const KG_BAR = 20;
export const LB_BAR = 45;
export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];

/**
 * Break a total barbell weight into plates PER SIDE.
 * @param {number} total  total weight incl. bar
 * @param {number} [bar]
 * @param {number[]} [plates]  available plate denominations (desc)
 * @returns {{ perSide: {plate:number,count:number}[], exact:boolean, leftover:number, barOnly:boolean, belowBar:boolean }}
 */
export function computePlateBreakdown(total, bar = KG_BAR, plates = KG_PLATES) {
  const t = Number(total);
  if (!Number.isFinite(t)) return { perSide: [], exact: false, leftover: 0, barOnly: false, belowBar: false };
  if (t < bar) return { perSide: [], exact: t === bar, leftover: 0, barOnly: t === bar, belowBar: t < bar };
  if (t === bar) return { perSide: [], exact: true, leftover: 0, barOnly: true, belowBar: false };

  let perSideWeight = (t - bar) / 2;
  const perSide = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    if (perSideWeight <= 0) break;
    const count = Math.floor((perSideWeight + 1e-9) / p);
    if (count > 0) { perSide.push({ plate: p, count }); perSideWeight -= count * p; }
  }
  return {
    perSide,
    exact: perSideWeight < 1e-6,
    leftover: Math.max(0, Math.round(perSideWeight * 100) / 100),
    barOnly: false,
    belowBar: false,
  };
}

const trimNum = (n) => (Number.isInteger(n) ? String(n) : String(n));

/** Short per-side string, e.g. "20 + 20 + 2.5". Empty when it's just the bar. */
export function formatPlates(breakdown) {
  if (!breakdown || breakdown.barOnly) return 'bar only';
  if (breakdown.belowBar) return '';
  if (!breakdown.perSide.length) return '';
  const parts = [];
  for (const { plate, count } of breakdown.perSide) {
    for (let i = 0; i < count; i++) parts.push(trimNum(plate));
  }
  let s = parts.join(' + ');
  if (!breakdown.exact && breakdown.leftover > 0) s += ` (+${trimNum(breakdown.leftover)} short)`;
  return s;
}

/** One-call convenience: target + unit → "per side: 20 + 20". */
export function plateHint(total, unit = 'kg') {
  const bar = unit === 'lb' ? LB_BAR : KG_BAR;
  const plates = unit === 'lb' ? LB_PLATES : KG_PLATES;
  const bd = computePlateBreakdown(total, bar, plates);
  const s = formatPlates(bd);
  return s ? `${s} / side` : '';
}
