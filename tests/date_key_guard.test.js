// =============================================================================
// LOCAL DATE-KEY GUARD
//
// A user-facing calendar day must come from js/dates.js. Raw ISO slicing is UTC
// and shifts "today" around midnight for much of the world. The only exceptions
// below are calendar-key/schedule arithmetic that deliberately operates in UTC
// after starting from an already-valid YYYY-MM-DD key.
// =============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_ROOT = path.join(ROOT, 'js');
const RAW_ISO_DAY = /\.toISOString\(\)\.slice\(0,\s*10\)/g;

function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(abs));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(abs);
  }
  return out;
}

// Exact counts make each exception reviewable. A new raw ISO day anywhere — or
// another occurrence in an allowed file — fails until its UTC semantics are
// explicitly justified here.
const ALLOWED_UTC_DAY_ARITHMETIC = new Map([
  ['js/dates.js', 2],                    // addDaysISO + slotDateISO
  ['js/analytics/weekly-aggregate.js', 1], // Monday key after noon-UTC math
  ['js/analytics/logged-days.js', 1],      // legacy program-slot date estimate
  ['js/fasting/fasting-calcs.js', 1],      // ISO-week Monday after UTC math
]);

test('raw UTC ISO day slicing is limited to reviewed calendar arithmetic', () => {
  const seen = new Map();
  for (const abs of jsFiles(JS_ROOT)) {
    const rel = path.relative(ROOT, abs);
    const count = (readFileSync(abs, 'utf8').match(RAW_ISO_DAY) || []).length;
    if (count) seen.set(rel, count);
  }
  assert.deepEqual(seen, ALLOWED_UTC_DAY_ARITHMETIC);
});

test('dates.js owns local day resolution; weekly aggregate only re-exports it', () => {
  const dates = readFileSync(path.join(ROOT, 'js/dates.js'), 'utf8');
  const weekly = readFileSync(path.join(ROOT, 'js/analytics/weekly-aggregate.js'), 'utf8');
  assert.match(dates, /export function localDayKey/);
  assert.match(weekly, /import \{ addDaysISO, localDayKey \} from '\.\.\/dates\.js'/);
  assert.doesNotMatch(weekly, /new Intl\.DateTimeFormat/);
});
