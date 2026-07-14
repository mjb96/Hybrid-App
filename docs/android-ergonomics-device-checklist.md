# Android Core-Ergonomics Device Check

Owner: `[You]`  
Build: debug or release candidate containing roadmap R11

Use one compact phone (roughly 320–360dp wide) and one typical phone (390–412dp).
Set Android **Font size** to its largest practical setting and **Display size** one step
above default, then repeat once at default sizing.

For each row, record device, Android version, font/display setting, pass/fail, and a
screenshot or short screen recording for any failure.

- Fresh install: complete every onboarding step; confirm goal/program cards, unit toggles,
  Back, Skip, and Continue respond without precision tapping or horizontal scrolling.
- Onboarding sign-in: open **Already have an account? Sign in**, type in both fields,
  switch **Sign In / Create Account**, then **Continue Offline**; confirm focus/input works
  and onboarding is still present afterward.
- Home: tap the profile avatar, primary workout action, Activity History, and every bottom
  navigation item, including the centre Start action.
- Programs: use search and filters, open a program, bookmark it, move between detail tabs,
  change preview week, and return.
- Workout: change day, expand an exercise, log a set from its labelled shortcut, edit load
  and reps, tick Done, open set options, and use Bodyweight/Weighted once R12 is present.
- Settings: exercise every segmented control near its edges, edit text/number inputs, step
  the program week, and close Settings.
- At maximum font/display size, confirm no primary label is clipped, no page gains
  horizontal scrolling, and the keyboard does not hide the active auth/workout field.
- With TalkBack enabled, confirm each tested control announces a useful name and the
  expected role/state. Record failures against the exact screen and label.

Acceptance: no missed/adjacent taps in two passes per device, no clipped core action, no
horizontal page scrolling, and no unlabeled primary control. This evidence is intentionally
human-owned; automated geometry/contrast checks do not substitute for physical touch.
