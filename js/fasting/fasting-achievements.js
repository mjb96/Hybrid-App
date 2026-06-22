// ==========================================
// FASTING ACHIEVEMENTS — js/fasting/fasting-achievements.js
// ==========================================

export const FASTING_ACHIEVEMENTS = [
  {
    id: 'first_fast',
    label: 'First Fast',
    description: 'Completed your first fast.',
    icon: '⭐',
    tier: 'bronze',
    check: c => c.totalFasts >= 1,
  },
  {
    id: 'first_16h',
    label: '16 Hour Fast',
    description: 'Completed a 16-hour fast.',
    icon: '🌙',
    tier: 'bronze',
    check: c => c.longestFast >= 16,
  },
  {
    id: 'first_24h',
    label: 'Full Day Fast',
    description: 'Completed a 24-hour fast — entered ketosis.',
    icon: '⚡',
    tier: 'silver',
    check: c => c.longestFast >= 24,
  },
  {
    id: 'first_36h',
    label: 'Extended Fast',
    description: 'Completed a 36-hour extended fast.',
    icon: '🧬',
    tier: 'silver',
    check: c => c.longestFast >= 36,
  },
  {
    id: 'streak_3',
    label: '3 Day Streak',
    description: 'Fasted on 3 consecutive days.',
    icon: '🔥',
    tier: 'bronze',
    check: c => c.longestStreak >= 3,
  },
  {
    id: 'streak_7',
    label: '7 Day Streak',
    description: 'Fasted on 7 consecutive days.',
    icon: '🔥',
    tier: 'silver',
    check: c => c.longestStreak >= 7,
  },
  {
    id: 'streak_30',
    label: '30 Day Streak',
    description: 'Fasted for 30 consecutive days — elite consistency.',
    icon: '🏆',
    tier: 'gold',
    check: c => c.longestStreak >= 30,
  },
  {
    id: 'fasts_10',
    label: '10 Fasts',
    description: 'Completed 10 fasts.',
    icon: '✅',
    tier: 'bronze',
    check: c => c.totalFasts >= 10,
  },
  {
    id: 'fasts_50',
    label: '50 Fasts',
    description: 'Completed 50 fasts — strong commitment.',
    icon: '🎯',
    tier: 'silver',
    check: c => c.totalFasts >= 50,
  },
  {
    id: 'fasts_100',
    label: '100 Fasts',
    description: 'Completed 100 fasts — elite dedication.',
    icon: '💯',
    tier: 'gold',
    check: c => c.totalFasts >= 100,
  },
  {
    id: 'hours_100',
    label: '100 Hours Fasted',
    description: 'Accumulated 100 total hours of fasting.',
    icon: '⏱️',
    tier: 'bronze',
    check: c => c.totalHours >= 100,
  },
  {
    id: 'hours_500',
    label: '500 Hours Fasted',
    description: 'Accumulated 500 total hours of fasting.',
    icon: '⌛',
    tier: 'gold',
    check: c => c.totalHours >= 500,
  },
  {
    id: 'goal_keeper',
    label: 'Goal Keeper',
    description: '80%+ goal completion across 10+ fasts.',
    icon: '🎖️',
    tier: 'silver',
    check: c => c.totalFasts >= 10 && c.goalCompletionPct >= 80,
  },
  {
    id: 'consistency_king',
    label: 'Consistency',
    description: '70%+ consistency score over 30 days.',
    icon: '📅',
    tier: 'silver',
    check: c => c.consistencyScore >= 70,
  },
];

export function getUnlockedAchievements(calcs) {
  return FASTING_ACHIEVEMENTS.map(a => ({ ...a, unlocked: a.check(calcs) }));
}
