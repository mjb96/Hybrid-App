// =============================================================================
// SEARCH ENGINE — Full-text search across the program catalog
// =============================================================================
import { PROGRAM_CATALOG } from './catalog.js';

// Searchable fields and their weights (higher = more important)
const SEARCH_FIELDS = [
  { key: 'name',        weight: 10 },
  { key: 'tagline',     weight: 6  },
  { key: 'description', weight: 2  },
  { key: 'category',    weight: 8  },
  { key: 'subcategory', weight: 6  },
  { key: 'tags',        weight: 7  }, // array
  { key: 'author',      weight: 5  }, // nested .name
  { key: 'goals',       weight: 5  }, // array
];

// Simple alias map: maps user queries to additional search tokens
// Key = trigger phrase, value = additional tokens to search for
const QUERY_ALIASES = {
  'fat loss':       ['cut', 'body_composition', 'body-composition', 'recomp', 'deficit'],
  'weight loss':    ['cut', 'body_composition', 'body-composition', 'fat-loss'],
  'muscle':         ['hypertrophy', 'size', 'bulk', 'mass', 'bodybuilding'],
  'bulk':           ['hypertrophy', 'size', 'muscle', 'mass'],
  'cut':            ['body_composition', 'fat-loss', 'cutting', 'deficit'],
  'running':        ['run', 'aerobic', 'endurance'],
  'run':            ['running', 'aerobic', 'endurance'],
  'cardio':         ['running', 'aerobic', 'endurance', 'conditioning'],
  '5k':             ['5km', 'parkrun', 'running', 'sub-20'],
  '5km':            ['5k', 'running', 'sub-20'],
  'half marathon':  ['half-marathon', '21k', 'running', 'endurance'],
  'marathon':       ['42k', 'running', 'endurance'],
  'hyrox':          ['hyrox-collection', 'race'],
  'beginner':       ['starter', 'foundation', 'linear-progression', 'beginner-friendly'],
  'powerbuilding':  ['powerlifting', 'hypertrophy'],
  '531':            ['nsuns', '5/3/1', 'wendler'],
  '5/3/1':          ['nsuns', '531', 'wendler'],
  'ppl':            ['push-pull-legs', 'push_pull_legs'],
  'push pull legs': ['ppl', 'push-pull-legs'],
  'zone 2':         ['zone2', 'aerobic', 'easy', 'endurance'],
  'zone2':          ['zone 2', 'aerobic', 'easy', 'endurance'],
  'tactical':       ['military', 'fitness-test'],
  'recomp':         ['body_composition', 'recomposition'],
  'strength':       ['barbell', 'powerlifting', 'compound'],
  'hypertrophy':    ['muscle', 'size', 'volume', 'bodybuilding'],
};

// Tokenise a string into lowercase words
function tokenise(str) {
  if (!str) return [];
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

// Get the searchable text for a program field
function getFieldText(program, fieldKey) {
  const val = program[fieldKey];
  if (!val) return '';
  if (Array.isArray(val)) return val.join(' ');
  if (typeof val === 'object') {
    if (fieldKey === 'author') return val.name || '';
    return '';
  }
  return String(val);
}

// Expand a query with aliases — returns a flat array of search tokens
function expandQuery(query) {
  const lower = query.toLowerCase().trim();
  const baseTokens = tokenise(lower);
  const expanded = new Set(baseTokens);

  // Check for exact alias key matches
  for (const [trigger, extras] of Object.entries(QUERY_ALIASES)) {
    if (lower === trigger || lower.includes(trigger)) {
      extras.forEach(e => tokenise(e).forEach(t => expanded.add(t)));
    }
  }

  return Array.from(expanded);
}

// Score a single program against a query
function scoreProgram(program, queryTokens) {
  let contentScore = 0;

  for (const field of SEARCH_FIELDS) {
    const text = getFieldText(program, field.key).toLowerCase();
    if (!text) continue;

    const words = text.split(/[\s\-_\/]+/);

    for (const token of queryTokens) {
      if (token.length < 2) continue;

      // Exact word match (highest)
      if (words.includes(token)) {
        contentScore += field.weight * 2;
        // Title bonus
        if (field.key === 'name') contentScore += 4;
        continue;
      }

      // Substring match (lower)
      if (text.includes(token)) {
        contentScore += field.weight;
        if (field.key === 'name') contentScore += 2;
      }
    }
  }

  if (contentScore === 0) return 0; // No real keyword match — exclude

  // Popularity tiebreaker
  contentScore += (program.popularity / 100) * 2;

  return contentScore;
}

// Main search function
export function searchPrograms(query) {
  if (!query || query.trim().length < 2) return [];

  const expanded = expandQuery(query.trim());
  if (expanded.length === 0) return [];

  const scored = PROGRAM_CATALOG
    .map(program => ({ program, score: scoreProgram(program, expanded) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ program }) => program);
}

// Popular search suggestions shown before typing
export const POPULAR_SEARCHES = [
  { query: 'hybrid',          label: 'Hybrid Training' },
  { query: 'hyrox',           label: 'Hyrox Prep' },
  { query: 'strength',        label: 'Strength Programs' },
  { query: 'half marathon',   label: 'Half Marathon' },
  { query: 'fat loss',        label: 'Fat Loss' },
  { query: 'beginner',        label: 'Beginner Programs' },
  { query: 'muscle',          label: 'Build Muscle' },
  { query: 'ppl',             label: 'Push Pull Legs' },
  { query: 'running',         label: 'Running Plans' },
  { query: '5/3/1',           label: '5/3/1 Programs' },
];
