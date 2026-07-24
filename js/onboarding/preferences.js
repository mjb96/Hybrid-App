// @ts-check
// Canonical translation from onboarding answers to durable Settings values.
// Keep this DOM-free so every answer combination is directly testable.

const GOALS = new Set(['strength', 'hybrid', 'endurance']);
const LEVELS = ['beginner', 'intermediate', 'advanced', 'elite'];

const EQUIPMENT_BY_TIER = Object.freeze({
  home: Object.freeze({
    barbell: false,
    rack: false,
    dumbbells: true,
    cables: false,
    pullupBar: true,
    bands: true,
    kettlebells: true,
    // An EZ bar is a deliberate opt-in — never assumed from a tier.
    ezBar: false,
    treadmill: false,
  }),
  gym: Object.freeze({
    barbell: true,
    rack: true,
    dumbbells: true,
    cables: true,
    pullupBar: true,
    bands: true,
    kettlebells: true,
    ezBar: false,
    treadmill: true,
  }),
});

export function equipmentForTier(tier) {
  return { ...(EQUIPMENT_BY_TIER[tier] || EQUIPMENT_BY_TIER.gym) };
}

/** Durable settings owned by the existing onboarding controls. */
export function onboardingSettings(answers = {}) {
  const goal = GOALS.has(answers.goal) ? answers.goal : 'hybrid';
  const level = LEVELS.includes(answers.level) ? answers.level : 'intermediate';
  const equipmentTier = answers.equipmentTier === 'home' ? 'home' : 'gym';
  return {
    fitnessGoal: goal,
    fitnessLevel: level,
    equipmentTier,
    equipment: equipmentForTier(equipmentTier),
  };
}

/** Explain when a recommended program differs from the selected experience. */
export function difficultyDisclosure(programDifficulty, selectedLevel) {
  const programIndex = LEVELS.indexOf(String(programDifficulty || '').toLowerCase());
  const userIndex = LEVELS.indexOf(String(selectedLevel || '').toLowerCase());
  if (programIndex < 0) return { label: 'Open level', relation: 'unknown', explanation: '' };

  const label = LEVELS[programIndex][0].toUpperCase() + LEVELS[programIndex].slice(1);
  if (userIndex < 0 || programIndex === userIndex) {
    return { label, relation: 'match', explanation: 'Matches your selected experience.' };
  }
  const gap = programIndex - userIndex;
  if (gap === 1) {
    return { label, relation: 'stretch', explanation: 'A step up — included as a supported stretch option.' };
  }
  if (gap === -1) {
    return { label, relation: 'easier', explanation: 'A step down — included for a gentler start.' };
  }
  return {
    label,
    relation: gap > 0 ? 'advanced' : 'easier',
    explanation: gap > 0
      ? 'Above your selected experience — review the workload before choosing.'
      : 'Below your selected experience — useful for a conservative restart.',
  };
}
