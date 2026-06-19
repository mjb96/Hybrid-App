// =============================================================================
// COLLECTIONS ENGINE — Dynamic, rule-based program collections
// =============================================================================
import { PROGRAM_CATALOG } from './catalog.js';

// Collection definitions — each has an ID, label, rules, and sort logic
export const COLLECTION_DEFINITIONS = [
  {
    id: 'hybridhq-picks',
    label: "HybridHQ Picks",
    subtitle: "Curated by our coaching team",
    icon: '⚡',
    filter: p => p.author.type === 'official',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'most-popular',
    label: "Most Popular",
    subtitle: "What everyone is training right now",
    icon: '🔥',
    filter: p => p.popularity >= 80,
    sort: (a, b) => b.enrolledCount - a.enrolledCount,
    limit: 10,
  },
  {
    id: 'highest-rated',
    label: "Highest Rated",
    subtitle: "Top-rated by the community",
    icon: '⭐',
    filter: p => p.rating >= 4.6,
    sort: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
    limit: 8,
  },
  {
    id: 'new-programs',
    label: "New Programs",
    subtitle: "Recently added to the library",
    icon: '🆕',
    filter: p => p.isNew === true,
    sort: (a, b) => b.popularity - a.popularity,
    limit: 6,
  },
  {
    id: 'beginner-friendly',
    label: "Beginner Friendly",
    subtitle: "Perfect if you're just getting started",
    icon: '🌱',
    filter: p => p.difficulty === 'beginner',
    sort: (a, b) => b.completionRate - a.completionRate,
    limit: 8,
  },
  {
    id: 'hybrid-collection',
    label: "Hybrid Athlete",
    subtitle: "Strength meets endurance",
    icon: '⚡',
    filter: p => p.category === 'hybrid',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'strength-collection',
    label: "Strength Programs",
    subtitle: "Get brutally strong",
    icon: '🏋️',
    filter: p => p.category === 'strength' || p.category === 'powerlifting',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'hyrox-collection',
    label: "Hyrox Collection",
    subtitle: "Race day ready",
    icon: '🏟️',
    filter: p => p.category === 'hyrox' || p.tags?.includes('hyrox'),
    sort: (a, b) => b.popularity - a.popularity,
    limit: 6,
  },
  {
    id: 'running-collection',
    label: "Running Programs",
    subtitle: "From 5K to marathon",
    icon: '🏃',
    filter: p => p.category === 'running' || p.tags?.includes('running'),
    sort: (a, b) => b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'hypertrophy-collection',
    label: "Build Muscle",
    subtitle: "Maximum hypertrophy protocols",
    icon: '💪',
    filter: p => p.category === 'hypertrophy',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'body-composition-collection',
    label: "Body Composition",
    subtitle: "Transform your physique",
    icon: '🔥',
    filter: p => p.category === 'body_composition',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 6,
  },
  {
    id: 'time-efficient',
    label: "Time Efficient",
    subtitle: "Great results in 4 days or less",
    icon: '⏱️',
    filter: p => p.sessionsPerWeek <= 4,
    sort: (a, b) => a.sessionsPerWeek - b.sessionsPerWeek || b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'tactical-collection',
    label: "Tactical Fitness",
    subtitle: "Military & first responder standards",
    icon: '🎖️',
    filter: p => p.category === 'tactical',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 4,
  },
  {
    id: 'endurance-collection',
    label: "Endurance",
    subtitle: "Build your aerobic engine",
    icon: '🫀',
    filter: p => p.category === 'endurance' || p.category === 'running' || p.tags?.includes('aerobic') || p.goals?.includes('aerobic-base'),
    sort: (a, b) => b.popularity - a.popularity,
    limit: 8,
  },
  {
    id: 'general-fitness-collection',
    label: "General Fitness",
    subtitle: "All-round health and performance",
    icon: '🎯',
    filter: p => p.category === 'general_fitness',
    sort: (a, b) => b.popularity - a.popularity,
    limit: 6,
  },
  {
    id: 'community-favourites',
    label: "Community Favourites",
    subtitle: "Battle-tested by thousands of athletes",
    icon: '👥',
    filter: p => p.ratingCount >= 600 && p.rating >= 4.4,
    sort: (a, b) => b.ratingCount - a.ratingCount,
    limit: 8,
  },
];

// Main homepage collection layout — ordered for best discovery UX
export const HOME_COLLECTION_ORDER = [
  'hybridhq-picks',
  'most-popular',
  'hybrid-collection',
  'beginner-friendly',
  'strength-collection',
  'hyrox-collection',
  'running-collection',
  'highest-rated',
  'hypertrophy-collection',
  'time-efficient',
  'body-composition-collection',
  'new-programs',
  'community-favourites',
];

// Resolve a collection to its programs
export function resolveCollection(collectionId) {
  const def = COLLECTION_DEFINITIONS.find(c => c.id === collectionId);
  if (!def) return [];

  return PROGRAM_CATALOG
    .filter(def.filter)
    .sort(def.sort)
    .slice(0, def.limit);
}

// Get collection definition
export function getCollectionDef(collectionId) {
  return COLLECTION_DEFINITIONS.find(c => c.id === collectionId) || null;
}

// Get all home collections with their resolved programs
export function getHomeCollections(recommendedIds = []) {
  const collections = [];

  // Inject personalised recommendations at top if we have them
  if (recommendedIds.length > 0) {
    const recommended = PROGRAM_CATALOG.filter(p => recommendedIds.includes(p.id));
    if (recommended.length > 0) {
      collections.push({
        id: 'recommended-for-you',
        label: 'Recommended For You',
        subtitle: 'Based on your goals and training history',
        icon: '✨',
        programs: recommended,
      });
    }
  }

  for (const id of HOME_COLLECTION_ORDER) {
    const def = COLLECTION_DEFINITIONS.find(c => c.id === id);
    if (!def) continue;
    const programs = resolveCollection(id);
    if (programs.length === 0) continue;
    collections.push({ ...def, programs });
  }

  return collections;
}

// Filter programs by category chip
export function filterByCategory(category) {
  if (!category || category === 'all') return [...PROGRAM_CATALOG];
  return PROGRAM_CATALOG.filter(p =>
    p.category === category ||
    p.subcategory === category ||
    p.tags?.includes(category)
  );
}
