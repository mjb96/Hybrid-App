// @ts-check
// Pure, ordered classifier for the free-text prescriptions stored in programs.
// Structure wins over incidental words: "6×800m (90s recovery)" is intervals,
// not a recovery run. Unknown text gets a neutral label rather than a false type.

const TYPES = {
  intervals: { key: 'intervals', label: 'Intervals', color: '#ef4444', specific: true },
  race: { key: 'race', label: 'Race Pace', color: '#ec4899', specific: true },
  hills: { key: 'hills', label: 'Hills', color: '#f97316', specific: true },
  tempo: { key: 'tempo', label: 'Tempo', color: '#f59e0b', specific: true },
  long: { key: 'long', label: 'Long Run', color: '#8b5cf6', specific: true },
  recovery: { key: 'recovery', label: 'Recovery', color: '#10b981', specific: true },
  aerobic: { key: 'aerobic', label: 'Zone 2', color: '#22d3ee', specific: true },
  conditioning: { key: 'conditioning', label: 'Conditioning', color: '#a855f7', specific: true },
  run: { key: 'run', label: 'Run', color: '#64748b', specific: false },
  training: { key: 'training', label: 'Training', color: '#64748b', specific: false },
};

/**
 * @param {unknown} prescription
 * @returns {{key:string,label:string,color:string,specific:boolean}|null}
 */
export function detectRunType(prescription) {
  const source = String(prescription || '').trim();
  if (!source || /^(?:rest|none|off)$/i.test(source)) return null;
  const s = source.toLowerCase().replace(/[–—]/g, '-');

  // Repetition structure is authoritative, even when the recovery interval is
  // also written in the prescription.
  if (
    /\b(?:intervals?|repeats?|fartlek|speed work)\b/.test(s)
    || /\b\d+\s*[×x]\s*\d+(?:\.\d+)?\s*(?:m|km|min|sec)\b/.test(s)
    || /\(\s*[×x]\s*\d+\s*\)/.test(s)
  ) return { ...TYPES.intervals };

  if (/\b(?:race pace|5k pace|10k pace|half marathon pace|marathon pace|goal race pace)\b/.test(s))
    return { ...TYPES.race };
  if (/\b(?:hills?|hill repeats?|strides?)\b/.test(s)) return { ...TYPES.hills };
  if (/\b(?:tempo|threshold|comfortably hard|lactate)\b/.test(s)) return { ...TYPES.tempo };
  if (/\b(?:long run|long zone 2|zone 2 long|long slow|long aerobic|lsd)\b/.test(s))
    return { ...TYPES.long };
  if (/\b(?:recovery|shakeout|very easy)\b/.test(s)) return { ...TYPES.recovery };
  if (/\b(?:zone 2|z2|easy run|easy pace|aerobic base|conversational|low heart)\b/.test(s))
    return { ...TYPES.aerobic };
  if (/\b(?:conditioning|amrap|emom|metcon|circuit|hyrox|simulation)\b/.test(s))
    return { ...TYPES.conditioning };

  // A neutral fallback stays useful for catalog copy without inventing an
  // intensity. Non-run modalities share the same field in the v1 schema.
  if (/\b(?:run|jog|cardio|walk|pace|race)\b/.test(s)) return { ...TYPES.run };
  return { ...TYPES.training };
}
