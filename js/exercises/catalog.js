// @ts-check
// Canonical exercise identity and muscle-volume attribution.
//
// Stored workouts intentionally keep their original display-name keys. This
// catalogue resolves those keys at read time so aliases share history without
// a destructive migration of the local/Supabase state blob.

export const MUSCLES = Object.freeze([
  'chest', 'upper_chest', 'lats', 'upper_back', 'traps', 'erectors',
  'quads', 'hamstrings', 'glutes', 'adductors', 'calves',
  'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'brachialis', 'forearms', 'core',
]);

export const MOVEMENT_PATTERNS = Object.freeze([
  'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push',
  'horizontal_pull', 'vertical_pull', 'shoulder_isolation',
  'elbow_flexion', 'elbow_extension', 'knee_extension', 'knee_flexion',
  'calf_raise', 'core', 'carry', 'conditioning', 'mobility',
]);

export const EQUIPMENT = Object.freeze([
  'barbell', 'ezBar', 'rack', 'bench', 'dumbbells', 'bands', 'cables', 'machine',
  'pullupBar', 'kettlebells', 'sled', 'sandbag', 'erg', 'bodyweight', 'other',
]);

// Human-readable labels for the canonical exercise-equipment keys. Used by the
// exercise picker and anywhere an equipment token is shown to the athlete, so a
// camelCase key like `ezBar` never leaks to the UI as "ezBar".
export const EQUIPMENT_LABELS = Object.freeze({
  barbell: 'Barbell', ezBar: 'EZ bar', rack: 'Rack', bench: 'Bench',
  dumbbells: 'Dumbbells', bands: 'Bands', cables: 'Cables', machine: 'Machine',
  pullupBar: 'Pull-up bar', kettlebells: 'Kettlebells', sled: 'Sled',
  sandbag: 'Sandbag', erg: 'Erg', bodyweight: 'Bodyweight', other: 'Other',
});

/** Readable label for an exercise-equipment key (falls back to the raw key). */
export function equipmentLabel(key) {
  return EQUIPMENT_LABELS[key] || String(key || '');
}

/** @param {string} id @param {string} name @param {any} options */
function exercise(id, name, options) {
  return Object.freeze({
    id,
    name,
    aliases: Object.freeze(options.aliases || []),
    movement: options.movement,
    equipment: Object.freeze(options.equipment || []),
    category: options.category || 'strength',
    muscles: Object.freeze(options.muscles || {}),
    compound: !!options.compound,
    unilateral: !!options.unilateral,
    bodyweight: !!options.bodyweight,
    volumeEligible: options.volumeEligible !== false,
  });
}

const P = (id, name, aliases, muscles, extra = {}) => exercise(id, name, {
  aliases, muscles, category: 'push', ...extra,
});
const L = (id, name, aliases, muscles, extra = {}) => exercise(id, name, {
  aliases, muscles, category: 'pull', ...extra,
});
const G = (id, name, aliases, muscles, extra = {}) => exercise(id, name, {
  aliases, muscles, category: 'legs', ...extra,
});
const C = (id, name, aliases, muscles = { core: 1 }, extra = {}) => exercise(id, name, {
  aliases, muscles, category: 'core', ...extra,
});
const X = (id, name, aliases, extra = {}) => exercise(id, name, {
  aliases, muscles: {}, category: 'conditioning', movement: 'conditioning',
  equipment: ['other'], volumeEligible: false, compound: true, ...extra,
});

// A credit is an estimate, not an anatomical involvement list: 1.0 dominant,
// 0.5 meaningful secondary, 0.25 minor contribution, stabilisers omitted.
export const EXERCISES = Object.freeze([
  // Chest and pressing
  P('barbell_bench_press', 'Barbell Bench Press', ['Bench Press'], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['barbell', 'bench'], compound: true }),
  P('incline_barbell_bench_press', 'Incline Barbell Bench Press', ['Incline Barbell Press', 'Incline Bench Press'], { upper_chest: 1, front_delts: .5, triceps: .5 }, { movement: 'horizontal_push', equipment: ['barbell', 'bench'], compound: true }),
  P('dumbbell_bench_press', 'Dumbbell Bench Press', ['DB Bench Press', 'Dumbbell Bench', 'DB Bench'], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['dumbbells', 'bench'], compound: true }),
  P('incline_dumbbell_press', 'Incline Dumbbell Press', ['Incline DB Press', 'Incline Dumbbell Bench Press'], { upper_chest: 1, front_delts: .5, triceps: .5 }, { movement: 'horizontal_push', equipment: ['dumbbells', 'bench'], compound: true }),
  P('dumbbell_floor_press', 'Dumbbell Floor Press', ['DB Floor Press'], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['dumbbells'], compound: true }),
  P('barbell_floor_press', 'Barbell Floor Press', ['Barbell Floor Presses'], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['barbell'], compound: true }),
  P('dumbbell_fly', 'Dumbbell Fly', ['DB Fly', 'Dumbbell Flye'], { chest: 1 }, { movement: 'horizontal_push', equipment: ['dumbbells', 'bench'] }),
  P('cable_fly', 'Cable Fly', ['Cable Flye'], { chest: 1 }, { movement: 'horizontal_push', equipment: ['cables'] }),
  P('machine_chest_fly', 'Machine Chest Fly', ['Machine Flye', 'Pec Dec Fly', 'Pec Deck Fly'], { chest: 1 }, { movement: 'horizontal_push', equipment: ['machine'] }),
  P('band_chest_press', 'Band Chest Press', [], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['bands'], compound: true }),
  P('push_up', 'Push-Up', ['Push-Ups'], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  P('feet_elevated_push_up', 'Feet-Elevated Push-Up', ['Decline Push-Up'], { upper_chest: 1, triceps: .5, front_delts: .5 }, { movement: 'horizontal_push', equipment: ['bodyweight', 'bench'], compound: true, bodyweight: true }),
  P('diamond_push_up', 'Diamond Push-Up', ['Diamond Push-Ups', 'Close-Grip Push-Up', 'Close-Grip Push-Ups'], { triceps: 1, chest: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  P('dip', 'Dip', ['Dips', 'Chest Dip', 'Chest Dips'], { chest: 1, triceps: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  P('bench_dip', 'Bench Dip', ['Tricep Dip', 'Tricep Dips'], { triceps: 1, chest: .25 }, { movement: 'elbow_extension', equipment: ['bodyweight', 'bench'], compound: true, bodyweight: true }),
  P('close_grip_bench_press', 'Close-Grip Bench Press', ['Close-Grip Bench'], { triceps: 1, chest: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['barbell', 'bench'], compound: true }),
  P('ez_bar_close_grip_bench_press', 'EZ-Bar Close-Grip Bench Press', ['Close-Grip EZ-Bar Bench Press', 'Close Grip EZ Bar Press', 'EZ-Bar Close-Grip Press', 'EZ Curl Bar Close-Grip Bench Press'], { triceps: 1, chest: .5, front_delts: .25 }, { movement: 'horizontal_push', equipment: ['ezBar', 'bench'], compound: true }),

  // Shoulders and triceps
  P('barbell_overhead_press', 'Barbell Overhead Press', ['Standing Barbell OHP', 'Standing OHP', 'Standing Barbell Overhead Press', 'Standing Overhead Press', 'Press'], { front_delts: 1, triceps: .5, upper_chest: .25 }, { movement: 'vertical_push', equipment: ['barbell'], compound: true }),
  P('dumbbell_shoulder_press', 'Dumbbell Shoulder Press', ['DB Shoulder Press', 'Seated DB Shoulder Press', 'Seated Dumbbell Shoulder Press'], { front_delts: 1, triceps: .5, side_delts: .25 }, { movement: 'vertical_push', equipment: ['dumbbells'], compound: true }),
  P('arnold_press', 'Arnold Press', [], { front_delts: 1, side_delts: .5, triceps: .25 }, { movement: 'vertical_push', equipment: ['dumbbells'], compound: true }),
  P('kettlebell_press', 'Kettlebell Press', ['KB Press'], { front_delts: 1, triceps: .5 }, { movement: 'vertical_push', equipment: ['kettlebells'], compound: true, unilateral: true }),
  P('push_press', 'Push Press', [], { front_delts: 1, triceps: .5, quads: .25 }, { movement: 'vertical_push', equipment: ['barbell'], compound: true }),
  P('pike_push_up', 'Pike Push-Up', ['Pike Push-Ups'], { front_delts: 1, triceps: .5 }, { movement: 'vertical_push', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  P('dumbbell_lateral_raise', 'Dumbbell Lateral Raise', ['DB Lateral Raise', 'Lateral Raise'], { side_delts: 1 }, { movement: 'shoulder_isolation', equipment: ['dumbbells'] }),
  P('band_lateral_raise', 'Band Lateral Raise', [], { side_delts: 1 }, { movement: 'shoulder_isolation', equipment: ['bands'] }),
  P('front_raise', 'Front Raise', [], { front_delts: 1 }, { movement: 'shoulder_isolation', equipment: ['dumbbells'] }),
  P('upright_row', 'Upright Row', [], { side_delts: 1, traps: .5 }, { movement: 'shoulder_isolation', equipment: ['barbell'], compound: true }),
  P('ez_bar_upright_row', 'EZ-Bar Upright Row', ['EZ Bar Upright Row', 'EZ-Bar Upright Rows', 'EZ Curl Bar Upright Row', 'Ezy Bar Upright Row'], { side_delts: 1, traps: .5 }, { movement: 'shoulder_isolation', equipment: ['ezBar'], compound: true }),
  P('band_triceps_pushdown', 'Band Triceps Pushdown', ['Band Tricep Pushdown', 'Tricep Band Pushdown'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['bands'] }),
  P('band_overhead_triceps_extension', 'Band Overhead Triceps Extension', ['Band Overhead Tricep Extension', 'Banded Overhead Triceps Extension'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['bands'] }),
  P('cable_triceps_pushdown', 'Cable Triceps Pushdown', ['Tricep Pushdown', 'Triceps Pushdown'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['cables'] }),
  P('skull_crusher', 'Skull Crusher', ['Skull Crushers', 'Dumbbell Skull Crusher', 'Lying DB Tricep Extension'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['dumbbells', 'bench'] }),
  // EZ-bar skull crusher is a distinct equipment identity from the dumbbell one —
  // its "Lying EZ-Bar Triceps Extension" aliases stay OFF the dumbbell skull_crusher.
  P('ez_bar_skull_crusher', 'EZ-Bar Skull Crusher', ['EZ Bar Skull Crusher', 'EZ Bar Skull Crushers', 'EZ-Bar Skull Crushers', 'E-Z Bar Skull Crusher', 'E-Z Bar Skull Crushers', 'Ezy Bar Skull Crusher', 'Ezy Bar Skull Crushers', 'EZ Curl Bar Skull Crusher', 'Lying EZ-Bar Triceps Extension', 'Lying EZ Bar Triceps Extension', 'EZ-Bar Lying Triceps Extension', 'EZ Bar Lying Tricep Extension', 'Lying EZ Curl Bar Triceps Extension'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['ezBar', 'bench'] }),
  P('overhead_triceps_extension', 'Overhead Triceps Extension', ['Overhead Tricep Extension', 'Dumbbell Overhead Triceps Extension', 'Tricep Extension'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['dumbbells'] }),
  P('ez_bar_overhead_triceps_extension', 'EZ-Bar Overhead Triceps Extension', ['EZ Bar Overhead Triceps Extension', 'EZ-Bar Overhead Tricep Extension', 'Overhead EZ-Bar Triceps Extension', 'EZ Curl Bar Overhead Extension', 'Ezy Bar Overhead Triceps Extension'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['ezBar'] }),
  P('dumbbell_triceps_kickback', 'Dumbbell Triceps Kickback', ['Tricep Kickback'], { triceps: 1 }, { movement: 'elbow_extension', equipment: ['dumbbells'] }),

  // Back and pulling
  L('barbell_row', 'Barbell Row', ['Barbell Bent-Over Row', 'Bent-Over Barbell Row'], { upper_back: 1, lats: .5, rear_delts: .5, biceps: .25, erectors: .25 }, { movement: 'horizontal_pull', equipment: ['barbell'], compound: true }),
  L('pendlay_row', 'Pendlay Row', [], { upper_back: 1, lats: .5, rear_delts: .25, biceps: .25, erectors: .25 }, { movement: 'horizontal_pull', equipment: ['barbell'], compound: true }),
  L('one_arm_dumbbell_row', 'One-Arm Dumbbell Row', ['One Arm Dumbbell Row', 'Single-Arm DB Row', 'Single Arm DB Row', 'DB Row', 'Dumbbell Row'], { lats: 1, upper_back: .5, biceps: .25, rear_delts: .25 }, { movement: 'horizontal_pull', equipment: ['dumbbells'], compound: true, unilateral: true }),
  L('chest_supported_dumbbell_row', 'Chest-Supported Dumbbell Row', ['Chest Supported Dumbbell Row', 'Chest Supported Row'], { upper_back: 1, lats: .5, rear_delts: .5, biceps: .25 }, { movement: 'horizontal_pull', equipment: ['dumbbells', 'bench'], compound: true }),
  L('cable_row', 'Cable Row', ['Seated Cable Row'], { upper_back: 1, lats: .5, rear_delts: .25, biceps: .25 }, { movement: 'horizontal_pull', equipment: ['cables'], compound: true }),
  L('inverted_row', 'Inverted Row', ['Inverted Rows'], { upper_back: 1, lats: .5, biceps: .25 }, { movement: 'horizontal_pull', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  L('renegade_row', 'Renegade Row', [], { lats: 1, upper_back: .5, core: .5, biceps: .25 }, { movement: 'horizontal_pull', equipment: ['dumbbells'], compound: true, unilateral: true }),
  L('kettlebell_row', 'Kettlebell Row', ['KB Row'], { lats: 1, upper_back: .5, biceps: .25 }, { movement: 'horizontal_pull', equipment: ['kettlebells'], compound: true, unilateral: true }),
  L('pull_up', 'Pull-Up', ['Pull-Ups'], { lats: 1, upper_back: .5, biceps: .5 }, { movement: 'vertical_pull', equipment: ['pullupBar'], compound: true, bodyweight: true }),
  L('chin_up', 'Chin-Up', ['Chin-Ups'], { lats: 1, biceps: .5, upper_back: .25 }, { movement: 'vertical_pull', equipment: ['pullupBar'], compound: true, bodyweight: true }),
  L('lat_pulldown', 'Lat Pulldown', [], { lats: 1, biceps: .5, upper_back: .25 }, { movement: 'vertical_pull', equipment: ['cables'], compound: true }),
  L('band_lat_pulldown', 'Band Lat Pulldown', ['Band Pulldown'], { lats: 1, biceps: .5, upper_back: .25 }, { movement: 'vertical_pull', equipment: ['bands'], compound: true }),
  L('dumbbell_pullover', 'Dumbbell Pullover', ['DB Pullover'], { lats: 1, chest: .25 }, { movement: 'vertical_pull', equipment: ['dumbbells', 'bench'] }),
  L('rear_delt_fly', 'Rear-Delt Fly', ['Rear Delt Fly', 'Rear Delt Flye', 'DB Rear Delt Fly', 'Dumbbell Rear Delt Raise'], { rear_delts: 1, upper_back: .25 }, { movement: 'shoulder_isolation', equipment: ['dumbbells'] }),
  L('face_pull', 'Face Pull', ['Face Pulls'], { rear_delts: 1, upper_back: .5 }, { movement: 'horizontal_pull', equipment: ['cables'], compound: true }),
  L('band_face_pull', 'Band Face Pull', [], { rear_delts: 1, upper_back: .5 }, { movement: 'horizontal_pull', equipment: ['bands'], compound: true }),
  L('band_pull_apart', 'Band Pull-Apart', ['Band Pull-Aparts'], { rear_delts: 1, upper_back: .5 }, { movement: 'horizontal_pull', equipment: ['bands'] }),
  L('dumbbell_shrug', 'Dumbbell Shrug', ['Shrug', 'Shrugs'], { traps: 1 }, { movement: 'shoulder_isolation', equipment: ['dumbbells'] }),
  L('barbell_shrug', 'Barbell Shrug', ['Barbell Shrugs'], { traps: 1 }, { movement: 'shoulder_isolation', equipment: ['barbell'] }),
  L('band_row', 'Band Row', ['Band Rows', 'Resistance Band Row', 'Seated Band Row'], { upper_back: 1, lats: .5, biceps: .25, rear_delts: .25 }, { movement: 'horizontal_pull', equipment: ['bands'], compound: true }),
  // A landmine is a barbell anchored at one end — represented honestly as a
  // barbell movement (no separate landmine equipment token is claimed).
  L('landmine_row', 'Landmine Row', ['Landmine Rows'], { upper_back: 1, lats: .5, biceps: .25, rear_delts: .25 }, { movement: 'horizontal_pull', equipment: ['barbell'], compound: true, unilateral: true }),
  L('dead_hang', 'Dead Hang', [], { forearms: 1 }, { movement: 'vertical_pull', equipment: ['pullupBar'], bodyweight: true }),

  // Biceps and forearms
  L('barbell_curl', 'Barbell Curl', ['Barbell Curl (Heavy)', 'Barbell Biceps Curl (Light)', 'Bicep Curl'], { biceps: 1, brachialis: .25 }, { movement: 'elbow_flexion', equipment: ['barbell'] }),
  L('dumbbell_curl', 'Dumbbell Curl', ['DB Curl', 'Alternating Dumbbell Curl'], { biceps: 1, brachialis: .25 }, { movement: 'elbow_flexion', equipment: ['dumbbells'] }),
  L('hammer_curl', 'Hammer Curl', ['Dumbbell Hammer Curl'], { brachialis: 1, biceps: .5, forearms: .25 }, { movement: 'elbow_flexion', equipment: ['dumbbells'] }),
  L('incline_dumbbell_curl', 'Incline Dumbbell Curl', ['Incline DB Curl'], { biceps: 1 }, { movement: 'elbow_flexion', equipment: ['dumbbells', 'bench'] }),
  // EZ-bar work is a distinct equipment identity from the straight barbell — the
  // stable id is kept so historical data still resolves, but equipment is now
  // ezBar (not barbell). "Barbell Curl" stays a separate straight-bar exercise.
  L('ez_bar_curl', 'EZ-Bar Curl', ['EZ Bar Curl', 'EZ Bar Curls', 'EZ-Bar Curls', 'E-Z Bar Curl', 'E-Z Bar Curls', 'EZ Curl Bar Curl', 'EZ Curl Bar Curls', 'Ezy Bar Curl', 'Ezy Bar Curls', 'EZ-Bar Biceps Curl'], { biceps: 1, brachialis: .25 }, { movement: 'elbow_flexion', equipment: ['ezBar'] }),
  L('ez_bar_reverse_curl', 'EZ-Bar Reverse Curl', ['EZ Bar Reverse Curl', 'EZ Bar Reverse Curls', 'EZ-Bar Reverse Curls', 'E-Z Bar Reverse Curl', 'Ezy Bar Reverse Curl', 'Reverse EZ-Bar Curl', 'EZ Curl Bar Reverse Curl'], { brachialis: 1, forearms: .5, biceps: .25 }, { movement: 'elbow_flexion', equipment: ['ezBar'] }),
  L('ez_bar_spider_curl', 'EZ-Bar Spider Curl', ['EZ Bar Spider Curl', 'EZ-Bar Spider Curls', 'Incline Bench EZ-Bar Spider Curl', 'EZ Curl Bar Spider Curl'], { biceps: 1, brachialis: .25 }, { movement: 'elbow_flexion', equipment: ['ezBar', 'bench'] }),
  L('cable_curl', 'Cable Curl', [], { biceps: 1 }, { movement: 'elbow_flexion', equipment: ['cables'] }),
  L('band_curl', 'Band Curl', [], { biceps: 1 }, { movement: 'elbow_flexion', equipment: ['bands'] }),
  L('concentration_curl', 'Concentration Curl', [], { biceps: 1 }, { movement: 'elbow_flexion', equipment: ['dumbbells'], unilateral: true }),
  L('reverse_curl', 'Reverse Curl', [], { brachialis: 1, forearms: .5, biceps: .25 }, { movement: 'elbow_flexion', equipment: ['barbell'] }),

  // Squat, lunge and knee-dominant work
  G('back_squat', 'Back Squat', ['Squat'], { quads: 1, glutes: .5, adductors: .25, erectors: .25 }, { movement: 'squat', equipment: ['barbell', 'rack'], compound: true }),
  G('front_squat', 'Front Squat', [], { quads: 1, glutes: .5, core: .25 }, { movement: 'squat', equipment: ['barbell', 'rack'], compound: true }),
  G('dumbbell_front_squat', 'Dumbbell Front Squat', ['DB Front Squat', 'Dumbbell Front Squats'], { quads: 1, glutes: .5, core: .25 }, { movement: 'squat', equipment: ['dumbbells'], compound: true }),
  G('zercher_squat', 'Zercher Squat', ['Zercher Squats'], { quads: 1, glutes: .5, core: .25 }, { movement: 'squat', equipment: ['barbell', 'rack'], compound: true }),
  G('pin_squat', 'Pin Squat', ['Pin Squats'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'squat', equipment: ['barbell', 'rack'], compound: true }),
  G('tempo_squat', 'Tempo Squat', ['Tempo Squats', '3-Second Squat'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'squat', equipment: ['barbell', 'rack'], compound: true }),
  G('paused_squat', 'Paused Squat', [], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'squat', equipment: ['barbell', 'rack'], compound: true }),
  G('goblet_squat', 'Goblet Squat', ['DB Goblet Squat'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'squat', equipment: ['dumbbells'], compound: true }),
  G('dumbbell_sumo_squat', 'Dumbbell Sumo Squat', ['DB Sumo Squat'], { quads: 1, glutes: .5, adductors: .5 }, { movement: 'squat', equipment: ['dumbbells'], compound: true }),
  G('bodyweight_squat', 'Bodyweight Squat', [], { quads: 1, glutes: .5 }, { movement: 'squat', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  G('bulgarian_split_squat', 'Bulgarian Split Squat', ['Dumbbell Bulgarian Split Squat'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'lunge', equipment: ['dumbbells', 'bench'], compound: true, unilateral: true }),
  G('barbell_bulgarian_split_squat', 'Barbell Bulgarian Split Squat', ['Barbell Bulgarian Split Squats'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'lunge', equipment: ['barbell', 'bench'], compound: true, unilateral: true }),
  G('reverse_lunge', 'Reverse Lunge', ['DB Lunge', 'Dumbbell Lunge'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'lunge', equipment: ['dumbbells'], compound: true, unilateral: true }),
  G('barbell_reverse_lunge', 'Barbell Reverse Lunge', ['Barbell Reverse Lunges'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'lunge', equipment: ['barbell'], compound: true, unilateral: true }),
  G('walking_lunge', 'Walking Lunge', ['Walking Lunges'], { quads: 1, glutes: .5, adductors: .25 }, { movement: 'lunge', equipment: ['bodyweight'], compound: true, unilateral: true, bodyweight: true }),
  G('step_up', 'Step-Up', ['DB Step-Up', 'Dumbbell Step-Up'], { quads: 1, glutes: .5 }, { movement: 'lunge', equipment: ['dumbbells', 'bench'], compound: true, unilateral: true }),
  G('barbell_step_up', 'Barbell Step-Up', ['Barbell Step-Ups'], { quads: 1, glutes: .5 }, { movement: 'lunge', equipment: ['barbell', 'bench'], compound: true, unilateral: true }),
  G('leg_press', 'Leg Press', [], { quads: 1, glutes: .5 }, { movement: 'squat', equipment: ['machine'], compound: true }),
  G('leg_extension', 'Leg Extension', [], { quads: 1 }, { movement: 'knee_extension', equipment: ['machine'] }),
  G('band_hip_abduction', 'Band Hip Abduction', [], { glutes: 1 }, { movement: 'lunge', equipment: ['bands'] }),

  // Hinge and posterior chain
  G('conventional_deadlift', 'Conventional Deadlift', ['Deadlift'], { glutes: 1, hamstrings: .5, erectors: .5, traps: .25 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('sumo_deadlift', 'Sumo Deadlift', [], { glutes: 1, quads: .5, adductors: .5, erectors: .25 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('deficit_deadlift', 'Deficit Deadlift', [], { glutes: 1, hamstrings: .5, quads: .5, erectors: .5 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('rack_pull', 'Rack Pull', ['Rack Pulls', 'Block Pull'], { erectors: 1, traps: .5, glutes: .5, hamstrings: .25 }, { movement: 'hinge', equipment: ['barbell', 'rack'], compound: true }),
  G('romanian_deadlift', 'Romanian Deadlift', ['RDL'], { hamstrings: 1, glutes: .5, erectors: .25 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('dumbbell_romanian_deadlift', 'Dumbbell Romanian Deadlift', ['DB Romanian Deadlift'], { hamstrings: 1, glutes: .5, erectors: .25 }, { movement: 'hinge', equipment: ['dumbbells'], compound: true }),
  G('band_romanian_deadlift', 'Band Romanian Deadlift', ['Band RDL', 'Banded Romanian Deadlift'], { hamstrings: 1, glutes: .5, erectors: .25 }, { movement: 'hinge', equipment: ['bands'], compound: true }),
  G('stiff_leg_deadlift', 'Stiff-Leg Deadlift', ['Stiff-Legged Deadlift'], { hamstrings: 1, glutes: .5, erectors: .25 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('single_leg_romanian_deadlift', 'Single-Leg Romanian Deadlift', ['DB Single-Leg Deadlift', 'Single-Leg RDL'], { hamstrings: 1, glutes: .5, erectors: .25 }, { movement: 'hinge', equipment: ['dumbbells'], compound: true, unilateral: true }),
  G('good_morning', 'Good Morning', ['Good Mornings'], { hamstrings: 1, glutes: .5, erectors: .5 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('band_good_morning', 'Band Good Morning', ['Band Good Mornings', 'Banded Good Morning'], { hamstrings: 1, glutes: .5, erectors: .5 }, { movement: 'hinge', equipment: ['bands'], compound: true }),
  G('band_pull_through', 'Band Pull-Through', ['Band Pull-Throughs', 'Banded Pull-Through', 'Resistance Band Pull-Through'], { glutes: 1, hamstrings: .5 }, { movement: 'hinge', equipment: ['bands'], compound: true }),
  G('hip_hinge', 'Hip Hinge', [], { hamstrings: 1, glutes: .5 }, { movement: 'hinge', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  G('barbell_hip_thrust', 'Barbell Hip Thrust', [], { glutes: 1, hamstrings: .25 }, { movement: 'hinge', equipment: ['barbell', 'bench'], compound: true }),
  G('dumbbell_hip_thrust', 'Dumbbell Hip Thrust', ['DB Hip Thrust'], { glutes: 1, hamstrings: .25 }, { movement: 'hinge', equipment: ['dumbbells', 'bench'], compound: true }),
  G('glute_bridge', 'Glute Bridge', [], { glutes: 1, hamstrings: .25 }, { movement: 'hinge', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  G('barbell_glute_bridge', 'Barbell Glute Bridge', ['Barbell Glute Bridges'], { glutes: 1, hamstrings: .25 }, { movement: 'hinge', equipment: ['barbell'], compound: true }),
  G('back_extension', 'Back Extension', ['Back Raises'], { erectors: 1, glutes: .5, hamstrings: .25 }, { movement: 'hinge', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  G('leg_curl', 'Leg Curl', ['Hamstring Curl'], { hamstrings: 1 }, { movement: 'knee_flexion', equipment: ['machine'] }),
  G('dumbbell_lying_leg_curl', 'Dumbbell Lying Leg Curl', ['Dumbbell Lying Hamstring Curl'], { hamstrings: 1 }, { movement: 'knee_flexion', equipment: ['dumbbells', 'bench'] }),
  G('band_leg_curl', 'Band Leg Curl', [], { hamstrings: 1 }, { movement: 'knee_flexion', equipment: ['bands'] }),
  G('nordic_curl', 'Nordic Curl', ['Nordic Curl Progression'], { hamstrings: 1 }, { movement: 'knee_flexion', equipment: ['bodyweight'], compound: true, bodyweight: true }),
  // The generic "Calf Raise"/"Calf Raises" legacy keys resolve here (the
  // dumbbell/loaded-standing variation) so historical workout data keeps a
  // single deterministic identity. The barbell variation below is a distinct
  // exercise (different equipment + loading), NOT an alias of this one.
  G('standing_calf_raise', 'Standing Calf Raise', ['Calf Raise', 'Calf Raises', 'Standing Calf Raises', 'Dumbbell Calf Raise', 'Dumbbell Calf Raises', 'Standing Dumbbell Calf Raise', 'Standing Dumbbell Calf Raises'], { calves: 1 }, { movement: 'calf_raise', equipment: ['dumbbells'] }),
  G('barbell_standing_calf_raise', 'Barbell Standing Calf Raise', ['Barbell Calf Raise', 'Barbell Calf Raises', 'Standing Barbell Calf Raise', 'Standing Barbell Calf Raises', 'Rack Barbell Calf Raise'], { calves: 1 }, { movement: 'calf_raise', equipment: ['barbell', 'rack'] }),
  G('single_leg_calf_raise', 'Single-Leg Calf Raise', [], { calves: 1 }, { movement: 'calf_raise', equipment: ['bodyweight'], unilateral: true, bodyweight: true }),
  G('single_leg_dumbbell_calf_raise', 'Single-Leg Dumbbell Calf Raise', ['Single Leg Dumbbell Calf Raise', 'Single-Leg Standing Calf Raise', 'Dumbbell Single-Leg Calf Raise'], { calves: 1 }, { movement: 'calf_raise', equipment: ['dumbbells'], unilateral: true }),
  G('seated_calf_raise', 'Seated Calf Raise', ['Seated Dumbbell Calf Raise', 'Seated Dumbbell Calf Raises', 'Dumbbell Seated Calf Raise', 'Dumbbell Seated Calf Raises'], { calves: 1 }, { movement: 'calf_raise', equipment: ['dumbbells', 'bench'] }),

  // Core and carries. A unilateral set is one set credit; the logger stores a
  // set row for the exercise, not one row per side.
  C('plank', 'Plank', ['Core/Plank', 'Plank Hold'], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], bodyweight: true }),
  C('hollow_body_hold', 'Hollow Body Hold', ['Hollow Body'], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], bodyweight: true }),
  C('side_plank', 'Side Plank', [], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], unilateral: true, bodyweight: true }),
  C('dead_bug', 'Dead Bug', [], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], bodyweight: true }),
  C('bird_dog', 'Bird Dog', [], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], unilateral: true, bodyweight: true }),
  C('ab_wheel_rollout', 'Ab Wheel Rollout', ['Ab Wheel Rollouts'], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], bodyweight: true }),
  C('hanging_leg_raise', 'Hanging Leg Raise', ['Hanging Leg Raises'], { core: 1 }, { movement: 'core', equipment: ['pullupBar'], bodyweight: true }),
  C('hanging_knee_raise', 'Hanging Knee Raise', [], { core: 1 }, { movement: 'core', equipment: ['pullupBar'], bodyweight: true }),
  C('lying_leg_raise', 'Lying Leg Raise', [], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], bodyweight: true }),
  C('weighted_crunch', 'Weighted Crunch', [], { core: 1 }, { movement: 'core', equipment: ['other'] }),
  C('cable_crunch', 'Cable Crunch', ['Cable Crunches'], { core: 1 }, { movement: 'core', equipment: ['cables'] }),
  C('weighted_sit_up', 'Weighted Sit-Up', [], { core: 1 }, { movement: 'core', equipment: ['other'] }),
  C('bicycle_crunch', 'Bicycle Crunch', ['Bicycle Crunches'], { core: 1 }, { movement: 'core', equipment: ['bodyweight'], bodyweight: true }),
  C('ab_work', 'Ab Work', [], { core: 1 }, { movement: 'core', equipment: ['other'] }),
  C('pallof_press', 'Pallof Press', [], { core: 1 }, { movement: 'core', equipment: ['bands'], unilateral: true }),
  C('farmer_carry', 'Farmer Carry', ['Farmers Carry', 'Dumbbell Farmer Carry', 'KB Farmer Carry', 'KB Farmers Carry'], { forearms: 1, traps: .5, core: .25 }, { movement: 'carry', equipment: ['dumbbells'], compound: true }),
  C('suitcase_carry', 'Suitcase Carry', ['KB Single-Arm Farmers Carry', 'Single-Arm Farmer Carry'], { core: 1, forearms: .5, traps: .25 }, { movement: 'carry', equipment: ['dumbbells'], compound: true, unilateral: true }),
  C('turkish_get_up', 'Turkish Get-Up', [], { core: 1, front_delts: .25, glutes: .25 }, { movement: 'carry', equipment: ['kettlebells'], compound: true, unilateral: true }),

  // Program station/conditioning items resolve for identity and search, but do
  // not masquerade as hypertrophy working sets.
  X('kettlebell_swing', 'Kettlebell Swing', ['KB Swing'], { equipment: ['kettlebells'] }),
  X('kettlebell_clean', 'Kettlebell Clean', ['KB Clean'], { equipment: ['kettlebells'] }),
  X('kettlebell_snatch', 'Kettlebell Snatch', ['KB Snatch'], { equipment: ['kettlebells'] }),
  X('kettlebell_windmill', 'Kettlebell Windmill', ['KB Windmill'], { equipment: ['kettlebells'] }),
  X('burpee_broad_jump', 'Burpee Broad Jump', [], { equipment: ['bodyweight'], bodyweight: true }),
  X('rowing', 'Rowing', [], { equipment: ['erg'] }),
  X('ski_erg', 'SkiErg', [], { equipment: ['erg'] }),
  X('sled_push', 'Sled Push', [], { equipment: ['sled'] }),
  X('sled_pull', 'Sled Pull', [], { equipment: ['sled'] }),
  X('sandbag_lunge', 'Sandbag Lunge', ['Sandbag Lunges'], { equipment: ['sandbag'], unilateral: true }),
  X('wall_ball', 'Wall Ball', ['Wall Balls'], { equipment: ['other'] }),
]);

/** Strip display-only prescription text while keeping the exercise identity. */
export function normaliseExerciseName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:×|x|m\b|km\b|s\b|reps?\b|kg\b).*$/i, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_ID = new Map(EXERCISES.map((item) => [item.id, item]));
const BY_NAME = new Map();
for (const item of EXERCISES) {
  for (const value of [item.name, ...item.aliases]) {
    BY_NAME.set(normaliseExerciseName(value), item);
  }
}

/** Resolve a canonical ID, current display name, historical alias or prescribed label. */
export function resolveExercise(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return BY_ID.get(value) || BY_NAME.get(normaliseExerciseName(value)) || null;
}

export function canonicalExerciseId(value) {
  return resolveExercise(value)?.id || null;
}

// Precomputed normalised name + alias haystacks for ranked search.
const SEARCH_INDEX = EXERCISES.map((item) => ({
  item,
  nameKey: normaliseExerciseName(item.name),
  aliasKeys: item.aliases.map((a) => normaliseExerciseName(a)),
}));

/**
 * Ranked exercise search over names + aliases. Every query token must appear
 * somewhere in an exercise's name or aliases; results rank exact matches, then
 * name-prefix, then all-tokens-in-name, then all-tokens-in-one-alias, then
 * scattered-alias matches, with an alphabetical tiebreak. Token matching means a
 * query like "ez bar skull crusher" ranks the EZ-bar variation first while
 * "lying skull crusher" can surface both variations. Pure — no DOM.
 * @returns {typeof EXERCISES[number][]}
 */
export function searchExercises(query, limit = 40) {
  const needle = normaliseExerciseName(query);
  if (!needle) return EXERCISES.slice(0, limit);
  const tokens = needle.split(' ').filter(Boolean);
  const scored = [];
  for (const entry of SEARCH_INDEX) {
    const haystacks = [entry.nameKey, ...entry.aliasKeys];
    const blob = haystacks.join(' ');
    if (!tokens.every((t) => blob.includes(t))) continue;
    let score;
    if (entry.nameKey === needle || entry.aliasKeys.includes(needle)) score = 100;
    else if (entry.nameKey.startsWith(needle) || entry.aliasKeys.some((a) => a.startsWith(needle))) score = 80;
    else if (tokens.every((t) => entry.nameKey.includes(t))) score = 60;
    else if (haystacks.some((h) => tokens.every((t) => h.includes(t)))) score = 40;
    else score = 20;
    scored.push({ item: entry.item, score });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((s) => s.item);
}

/** Read derived PR stats across canonical and pre-catalog display-name keys. */
export function exerciseStatForName(stats, value) {
  const id = canonicalExerciseId(value);
  const matches = Object.entries(stats || {}).filter(([key]) => id
    ? key === id || canonicalExerciseId(key) === id
    : key === value);
  if (!matches.length) return null;
  return matches.reduce((out, [, stat]) => ({
    allTimeMax: Math.max(out.allTimeMax || 0, Number(stat?.allTimeMax) || 0),
    currentEstimatedMax: Math.max(out.currentEstimatedMax || 0, Number(stat?.currentEstimatedMax) || 0),
  }), { allTimeMax: 0, currentEstimatedMax: 0 });
}

export function muscleCreditsForExercise(value) {
  const item = resolveExercise(value);
  return item?.volumeEligible ? item.muscles : null;
}

export function exerciseLibraryByCategory() {
  const labels = { push: 'Push', pull: 'Pull', legs: 'Legs', core: 'Core', conditioning: 'Conditioning' };
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const item of EXERCISES) {
    const label = labels[item.category] || 'Accessories';
    if (!out[label]) out[label] = [];
    out[label].push(item.name);
  }
  for (const names of Object.values(out)) names.sort((a, b) => a.localeCompare(b));
  return out;
}

/** Backward-compatible shape for recap/tests that still consume primary/secondary arrays. */
export function legacyMuscleMap() {
  return Object.fromEntries(EXERCISES.filter((item) => item.volumeEligible).map((item) => [item.name, {
    primary: Object.keys(item.muscles).filter((muscle) => item.muscles[muscle] === 1),
    secondary: Object.keys(item.muscles).filter((muscle) => item.muscles[muscle] > 0 && item.muscles[muscle] < 1),
  }]));
}
