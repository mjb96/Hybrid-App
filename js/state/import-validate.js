// @ts-check
// =============================================================================
// IMPORT VALIDATION + SANITIZATION (js/state/import-validate.js)
//
// Pure, DOM-free guards run BEFORE an imported JSON snapshot can replace live
// state (R17). The old import path did a shallow `currentWeek && weeks` check,
// so a malformed-but-shaped file could overwrite real training data, an
// oversized blob could be accepted, and a hostile `settings.avatarDataUrl`
// (which reaches an <img src>/CSS url() sink) rode straight into state.
//
// Contract:
//   - validateImport() deep-checks types/size/schema and NEVER returns ok for a
//     malformed file, so the caller can refuse without touching current state.
//   - sanitizeImportedState() drops an unsafe avatar (the one imported field
//     that reaches an HTML/CSS sink) losslessly — a real avatar is a
//     data:image;base64 URL and survives.
//   - importCounts() gives accurate numbers for an honest success/preview.
// =============================================================================

const MAX_IMPORT_BYTES = 25 * 1024 * 1024; // whole-file guard (snapshots are well under this)
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;  // a resized avatar is tens of KB; 3 MB is generous

// A safe raster-image data URL: data:image/<type>;base64,<base64>. Everything
// else — javascript:, data:text/html, an http(s) URL, or an attribute-breakout
// string like `x" onerror="…` — fails this test and is rejected.
const SAFE_IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** True only for a safe, in-bounds base64 image data URL. */
export function isSafeImageDataUrl(url) {
  return typeof url === 'string'
    && url.length <= MAX_AVATAR_BYTES
    && SAFE_IMAGE_DATA_URL.test(url);
}

/** UTF-8 byte length (TextEncoder exists in Node and browsers). */
function byteLength(str) {
  return (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(str).length : String(str).length;
}

/**
 * Shallow-sanitized COPY of an imported state: strips an unsafe avatar data URL
 * while leaving everything else intact. Never mutates the input.
 * @param {any} state
 */
export function sanitizeImportedState(state) {
  if (!state || typeof state !== 'object') return state;
  const out = { ...state };
  if (out.settings && typeof out.settings === 'object' && !Array.isArray(out.settings)) {
    const s = { ...out.settings };
    if (s.avatarDataUrl != null && !isSafeImageDataUrl(s.avatarDataUrl)) {
      delete s.avatarDataUrl; // drop hostile/oversized avatar rather than import it
    }
    out.settings = s;
  }
  return out;
}

/** Accurate, cheap counts for the import success line / preview. */
export function importCounts(state) {
  const weeks = (state && state.weeks && typeof state.weeks === 'object' && !Array.isArray(state.weeks)) ? state.weeks : {};
  let runs = 0, loggedDays = 0;
  for (const wk of Object.values(weeks)) {
    if (!wk || typeof wk !== 'object') continue;
    const week = /** @type {any} */ (wk);
    const dayKeys = new Set([
      ...Object.keys(week.lifts || {}), ...Object.keys(week.runs || {}),
      ...Object.keys(week.runSessions || {}), ...Object.keys(week.notes || {}),
      ...Object.keys(week.gymRpe || {}), ...Object.keys(week.gymStats || {}),
    ]);
    for (const day of dayKeys) {
      const sessions = Array.isArray(week.runSessions?.[day])
        ? week.runSessions[day].filter(hasImportedRunData)
        : [];
      const legacyRun = sessions.length === 0 && hasImportedRunData(week.runs?.[day]) ? 1 : 0;
      runs += sessions.length + legacyRun;
      const strength = Object.values(week.lifts?.[day] || {}).some((sets) =>
        Array.isArray(sets) && sets.some((set) => isRecord(set) && (
          set.c === true || set.c === 'true' || set.c === 'on' || set.c === 1 ||
          String(set.w ?? '').trim() || String(set.r ?? '').trim()
        ))
      );
      const metadata = !!String(week.notes?.[day] || '').trim()
        || !!String(week.gymRpe?.[day] || '').trim()
        || Object.values(week.gymStats?.[day] || {}).some((value) =>
          Array.isArray(value) ? value.length > 0 : value != null && String(value).trim() !== ''
        );
      if (strength || sessions.length > 0 || legacyRun || metadata) loggedDays++;
    }
  }
  return {
    weeks: Object.keys(weeks).length,
    programs: Array.isArray(state && state.customPrograms) ? state.customPrograms.length : 0,
    bodyWeights: Array.isArray(state && state.bodyWeightLog) ? state.bodyWeightLog.length : 0,
    runs,
    loggedDays,
  };
}

function hasImportedRunData(run) {
  if (!isRecord(run)) return false;
  return ['dist', 'time', 'rpe', 'pace', 'avgHR', 'maxHR', 'elev', 'cals', 'notes', 'splits']
    .some((key) => Array.isArray(run[key]) ? run[key].length > 0 : run[key] != null && String(run[key]).trim() !== '');
}

/** Honest, compact copy for the destructive import confirmation modal. */
export function importPreviewMessage(counts, routeCount = 0) {
  const c = counts || { loggedDays: 0, runs: 0, programs: 0, bodyWeights: 0 };
  const routes = Math.max(0, Number(routeCount) || 0);
  return [
    `${c.loggedDays || 0} logged day${c.loggedDays === 1 ? '' : 's'} · ${c.runs || 0} run${c.runs === 1 ? '' : 's'}`,
    `${c.programs || 0} custom program${c.programs === 1 ? '' : 's'} · ${c.bodyWeights || 0} body-weight entr${c.bodyWeights === 1 ? 'y' : 'ies'}`,
    `${routes} GPS route${routes === 1 ? '' : 's'}`,
    '',
    'This replaces the data currently on this device. A local backup is created first.',
  ].join('\n');
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidWeek(week) {
  if (!isRecord(week)) return false;
  const objectMaps = ['lifts', 'runs', 'runSessions', 'notes', 'gymRpe', 'bodyWeight', 'gymStats', 'liftMeta', 'liftOrder', 'dates'];
  for (const key of objectMaps) {
    if (week[key] != null && !isRecord(week[key])) return false;
  }
  for (const dayLifts of Object.values(week.lifts || {})) {
    if (!isRecord(dayLifts)) return false;
    for (const sets of Object.values(dayLifts)) {
      if (!Array.isArray(sets) || sets.some(set => !isRecord(set))) return false;
    }
  }
  for (const sessions of Object.values(week.runSessions || {})) {
    if (!Array.isArray(sessions) || sessions.some(session => !isRecord(session))) return false;
  }
  return true;
}

function isValidCustomProgram(program) {
  if (!isRecord(program) || typeof program.id !== 'string' || typeof program.name !== 'string') return false;
  if (!isRecord(program.days)) return false;
  if (program.totalWeeks != null && (!Number.isFinite(Number(program.totalWeeks)) || Number(program.totalWeeks) < 1)) return false;
  for (const day of Object.values(program.days)) {
    if (!isRecord(day)) return false;
    if (day.lifts != null && (!Array.isArray(day.lifts) || day.lifts.some(lift => typeof lift !== 'string'))) return false;
    for (const field of ['title', 'badge', 'color', 'desc', 'runs']) {
      if (day[field] != null && typeof day[field] !== 'string') return false;
    }
  }
  return true;
}

/**
 * Deep-validate a parsed import BEFORE it may replace live state. Returns a
 * discriminated result: `{ ok:false, reason }` (caller refuses, current state
 * untouched) or `{ ok:true, state, counts }` where `state` is sanitized.
 * @param {any} parsed
 * @param {{ currentSchemaVersion?: number, rawText?: string }} [opts]
 * @returns {{ ok:false, reason:string } | { ok:true, state:any, counts:ReturnType<typeof importCounts> }}
 */
export function validateImport(parsed, { currentSchemaVersion = Infinity, rawText } = {}) {
  if (rawText != null && byteLength(rawText) > MAX_IMPORT_BYTES) return { ok: false, reason: 'too-large' };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'not-object' };
  if (typeof parsed.currentWeek !== 'string' && typeof parsed.currentWeek !== 'number') return { ok: false, reason: 'no-current-week' };
  if (!parsed.weeks || typeof parsed.weeks !== 'object' || Array.isArray(parsed.weeks)) return { ok: false, reason: 'no-weeks' };
  if (Object.keys(parsed.weeks).length === 0) return { ok: false, reason: 'empty-weeks' };
  for (const wk of Object.values(parsed.weeks)) if (!isValidWeek(wk)) return { ok: false, reason: 'bad-week' };
  if (parsed.customPrograms != null && !Array.isArray(parsed.customPrograms)) return { ok: false, reason: 'bad-programs' };
  if (Array.isArray(parsed.customPrograms) && parsed.customPrograms.some(program => !isValidCustomProgram(program))) {
    return { ok: false, reason: 'bad-program' };
  }
  if (parsed.bodyWeightLog != null && !Array.isArray(parsed.bodyWeightLog)) return { ok: false, reason: 'bad-bodyweight' };
  if (parsed.settings != null && (typeof parsed.settings !== 'object' || Array.isArray(parsed.settings))) return { ok: false, reason: 'bad-settings' };
  // Future schema: refuse rather than run partial/unknown migrations. (migrateState
  // also guards this; refusing here keeps current state untouched with a clear message.)
  if (Number.isInteger(parsed.schemaVersion) && parsed.schemaVersion > currentSchemaVersion) return { ok: false, reason: 'future-schema' };

  const state = sanitizeImportedState(parsed);
  return { ok: true, state, counts: importCounts(state) };
}

/** User-facing copy for a validation failure. Always reassures nothing was lost. */
export function importReasonMessage(reason) {
  switch (reason) {
    case 'too-large': return 'That file is too large to import.';
    case 'future-schema': return 'This backup is from a newer app version. Update Helyx, then import.';
    default: return 'File structure failed validation — your data was not replaced.';
  }
}
