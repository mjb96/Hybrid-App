// @ts-check
// =============================================================================
// EXERCISE SUBSTITUTIONS (js/workout/substitutions.js)
//
// Pure, DOM-free. Given an exercise, return sensible in-session swaps — same
// movement pattern, filtered by the equipment the athlete actually has
// (settings.equipment). B3 of the launch-audit plan: removes the #1 reason a
// lifter abandons a plan ("the rack's taken / I don't have that machine").
//
// The engine keys everything by movement PATTERN so a swap trains the same
// quality. Equipment keys match settings.equipment:
//   barbell · rack · dumbbells · cables · pullupBar · bands · kettlebells
// An empty `equip: []` means bodyweight — always available.
// =============================================================================

// Ordered roughly closest-first within each pattern.
const PATTERNS = {
  squat: [
    { name: 'Back Squat', equip: ['barbell', 'rack'] },
    { name: 'Front Squat', equip: ['barbell', 'rack'] },
    { name: 'Goblet Squat', equip: ['dumbbells'] },
    { name: 'Bulgarian Split Squat', equip: ['dumbbells'] },
    { name: 'Kettlebell Goblet Squat', equip: ['kettlebells'] },
    { name: 'Bodyweight Squat', equip: [] },
    { name: 'Walking Lunge', equip: [] },
  ],
  hinge: [
    { name: 'Deadlift', equip: ['barbell'] },
    { name: 'Romanian Deadlift', equip: ['barbell'] },
    { name: 'Dumbbell Romanian Deadlift', equip: ['dumbbells'] },
    { name: 'Kettlebell Swing', equip: ['kettlebells'] },
    { name: 'Barbell Hip Thrust', equip: ['barbell'] },
    { name: 'Back Extension', equip: [] },
    { name: 'Single-Leg Hip Bridge', equip: [] },
  ],
  hpush: [
    { name: 'Bench Press', equip: ['barbell'] },
    { name: 'Incline Bench Press', equip: ['barbell'] },
    { name: 'Dumbbell Bench Press', equip: ['dumbbells'] },
    { name: 'Cable Chest Press', equip: ['cables'] },
    { name: 'Push-Up', equip: [] },
    { name: 'Dips', equip: [] },
  ],
  vpush: [
    { name: 'Standing OHP', equip: ['barbell'] },
    { name: 'Dumbbell Shoulder Press', equip: ['dumbbells'] },
    { name: 'Arnold Press', equip: ['dumbbells'] },
    { name: 'Landmine Press', equip: ['barbell'] },
    { name: 'Pike Push-Up', equip: [] },
  ],
  hpull: [
    { name: 'Barbell Row', equip: ['barbell'] },
    { name: 'Pendlay Row', equip: ['barbell'] },
    { name: 'Dumbbell Row', equip: ['dumbbells'] },
    { name: 'Cable Row', equip: ['cables'] },
    { name: 'Inverted Row', equip: [] },
  ],
  vpull: [
    { name: 'Pull-Ups', equip: ['pullupBar'] },
    { name: 'Chin-Ups', equip: ['pullupBar'] },
    { name: 'Lat Pulldown', equip: ['cables'] },
    { name: 'Band Pulldown', equip: ['bands'] },
  ],
  biceps: [
    { name: 'Barbell Curl', equip: ['barbell'] },
    { name: 'Dumbbell Curl', equip: ['dumbbells'] },
    { name: 'Hammer Curl', equip: ['dumbbells'] },
    { name: 'Cable Curl', equip: ['cables'] },
    { name: 'Band Curl', equip: ['bands'] },
    { name: 'Chin-Ups', equip: ['pullupBar'] },
  ],
  triceps: [
    { name: 'Tricep Pushdown', equip: ['cables'] },
    { name: 'Skull Crusher', equip: ['barbell'] },
    { name: 'Overhead Tricep Extension', equip: ['dumbbells'] },
    { name: 'Tricep Band Pushdown', equip: ['bands'] },
    { name: 'Diamond Push-Up', equip: [] },
    { name: 'Dips', equip: [] },
  ],
  lateral: [
    { name: 'Lateral Raise', equip: ['dumbbells'] },
    { name: 'Cable Lateral Raise', equip: ['cables'] },
    { name: 'Band Lateral Raise', equip: ['bands'] },
  ],
  core: [
    { name: 'Plank', equip: [] },
    { name: 'Hollow Body Hold', equip: [] },
    { name: 'Hanging Leg Raise', equip: ['pullupBar'] },
    { name: 'Ab Wheel Rollout', equip: [] },
    { name: 'Cable Crunch', equip: ['cables'] },
  ],
};

// Keyword → pattern. Order matters: earlier, more-specific rules win.
/** @type {[RegExp, string][]} */
const RULES = [
  [/lateral raise|side raise|lat raise/, 'lateral'],
  [/tricep|pushdown|skull|dips?\b|overhead extension/, 'triceps'],
  [/curl\b/, 'biceps'],
  [/pull[- ]?up|chin[- ]?up|pulldown|lat pull|pull ?down/, 'vpull'],
  [/row|pull[- ]?apart/, 'hpull'],
  [/ohp|overhead press|shoulder press|military|arnold|pike/, 'vpush'],
  [/bench|chest press|push[- ]?up|floor press|dips?\b/, 'hpush'],
  [/deadlift|rdl|romanian|hinge|swing|good ?morning|hip thrust|hip bridge|back extension/, 'hinge'],
  [/squat|lunge|split squat|leg press|step[- ]?up/, 'squat'],
  [/plank|crunch|leg raise|ab wheel|hollow|rollout|sit[- ]?up|core|dead bug/, 'core'],
];

/** Normalise a name for comparison (strip prescription noise like "4×8"). */
function norm(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\d+\s*[×x]\s*\S+/g, ' ')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Classify an exercise name into a movement pattern, or null if unknown. */
export function classifyMovement(name) {
  const n = norm(name);
  if (!n) return null;
  for (const [re, pattern] of RULES) {
    if (re.test(n)) return pattern;
  }
  return null;
}

/** Two names refer to the same exercise (ignoring prescription/case noise). */
function sameExercise(a, b) {
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Is every piece of required equipment available? When the athlete's equipment
 * map is empty/unknown we don't filter (better to over-offer than hide
 * everything for a user who never set it).
 */
function hasEquipment(required, available) {
  if (!required || required.length === 0) return true;
  if (!available || Object.keys(available).length === 0) return true;
  return required.every(k => available[k]);
}

/**
 * Ranked substitutes for an exercise, same movement pattern, equipment-filtered.
 * @param {string} name                exercise being swapped
 * @param {Record<string, boolean>} [available]  settings.equipment
 * @param {number} [limit]
 * @returns {{ name: string, pattern: string, equip: string[], bodyweight: boolean }[]}
 */
export function getSubstitutions(name, available = {}, limit = 6) {
  const pattern = classifyMovement(name);
  if (!pattern) return [];
  return PATTERNS[pattern]
    .filter(c => !sameExercise(c.name, name) && hasEquipment(c.equip, available))
    .slice(0, limit)
    .map(c => ({ name: c.name, pattern, equip: c.equip, bodyweight: c.equip.length === 0 }));
}
