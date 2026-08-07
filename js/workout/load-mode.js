// Pure load-mode policy for exercises whose resistance can be body mass,
// added weight, band assistance, or the band ITSELF. `w` remains the effective
// moved load consumed by existing volume/strength readers; `band` records which
// band, and `loadMode` records which of the two opposite jobs it is doing.
//
// A band does two opposite things and the code only ever implemented one:
//
//   ASSIST  — a pull-up with a band is EASIER. Load = bodyweight − band.
//   RESIST  — a triceps pushdown with a band is the band. Load = band.
//
// Everything banded went through the assistance path, so a Band Triceps
// Pushdown with a Medium (20 kg) band on an 80 kg athlete logged **60 kg** and
// 720 volume credits instead of 20 kg and 240 — bodyweight leaking into an
// exercise that never lifts it, and roughly triple the volume, on catalogue
// exercises that really exist (`Band Triceps Pushdown`, `Band Leg Curl`).

const BODYWEIGHT_PATTERN = /\b(?:pull[ -]?ups?|chin[ -]?ups?|(?:chest |tricep )?dips?|push[ -]?ups?)\b/i;

export function isBodyweightExercise(name) {
  return BODYWEIGHT_PATTERN.test(String(name || ''));
}

/**
 * Which job the band is doing on this exercise.
 *
 * Bodyweight movements are the only ones a band can make easier — you cannot
 * subtract a band from a pushdown, because your body mass was never the load.
 *
 * @param {string} exerciseName
 * @returns {'assist'|'resist'}
 */
export function bandRole(exerciseName) {
  return isBodyweightExercise(exerciseName) ? 'assist' : 'resist';
}

export function resolvedLoadMode(set, exerciseName = '') {
  if (['bodyweight', 'weighted', 'assisted', 'banded'].includes(set?.loadMode)) return set.loadMode;
  // Legacy sets carry `band` with no loadMode. Resolve by role rather than
  // assuming assistance, so an old banded pushdown stops claiming to be
  // assisted — its stored `w` is left exactly as logged either way.
  if (set?.band) return bandRole(exerciseName) === 'assist' ? 'assisted' : 'banded';
  if (set?.bw) return 'bodyweight';
  if (isBodyweightExercise(exerciseName) && !Number.isFinite(Number.parseFloat(set?.w))) return 'bodyweight';
  return 'weighted';
}

function positive(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function applyLoadMode(set, mode, { bodyweight = 75, bandWeights = {} } = {}) {
  const next = { ...(set || {}) };
  delete next.bw;
  delete next.band;
  next.loadMode = mode;

  const mass = positive(bodyweight, 75);
  if (mode === 'bodyweight') {
    next.bw = true;
    next.w = String(mass);
  } else if (mode === 'assisted') {
    next.band = set?.band || 'M';
    const assistance = positive(bandWeights[next.band], 0);
    next.w = String(Math.max(0, mass - assistance));
  } else {
    next.loadMode = 'weighted';
    next.w = '';
  }
  return next;
}

export function applyBandAssistance(set, band, { bodyweight = 75, bandWeights = {} } = {}) {
  const mass = positive(bodyweight, 75);
  const assistance = positive(bandWeights?.[band], 0);
  const next = {
    ...(set || {}),
    loadMode: 'assisted',
    band,
    w: String(Math.max(0, mass - assistance)),
  };
  delete next.bw;
  return next;
}

/**
 * The band IS the load. No body mass involved — a pushdown does not lift you.
 */
export function applyBandResistance(set, band, { bandWeights = {} } = {}) {
  const next = {
    ...(set || {}),
    loadMode: 'banded',
    band,
    w: String(positive(bandWeights?.[band], 0)),
  };
  delete next.bw;
  return next;
}

/**
 * Apply a band to a set, using whichever role the exercise calls for.
 *
 * The single entry point the cockpit should use: picking assistance vs
 * resistance is a property of the EXERCISE, not something a caller should have
 * to remember.
 *
 * @param {any} set
 * @param {string} band 'L' | 'M' | 'H'
 * @param {{exercise?:string, bodyweight?:number, bandWeights?:Record<string,number>}} ctx
 */
export function applyBandLoad(set, band, { exercise = '', bodyweight = 75, bandWeights = {} } = {}) {
  return bandRole(exercise) === 'assist'
    ? applyBandAssistance(set, band, { bodyweight, bandWeights })
    : applyBandResistance(set, band, { bandWeights });
}
