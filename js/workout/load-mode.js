// Pure load-mode policy for exercises whose resistance can be body mass,
// added weight, or assistance. `w` remains the effective moved load consumed by
// existing volume/strength readers; `band` records the assistance source.

const BODYWEIGHT_PATTERN = /\b(?:pull[ -]?ups?|chin[ -]?ups?|(?:chest |tricep )?dips?|push[ -]?ups?)\b/i;

export function isBodyweightExercise(name) {
  return BODYWEIGHT_PATTERN.test(String(name || ''));
}

export function resolvedLoadMode(set, exerciseName = '') {
  if (['bodyweight', 'weighted', 'assisted'].includes(set?.loadMode)) return set.loadMode;
  if (set?.band) return 'assisted';
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
