# Android Program-Editor & Exercise-Picker Device Check

Owner: `[You]`
Build: debug or release candidate containing the program-editor preview-consistency +
mobile-picker slice (`claude/program-editor-mobile-picker-wr1kn6`).

Playwright proves the layout maths and the data flow, but a real on-screen keyboard, IME
behaviour and Android Back can only be confirmed on a device. Use one compact phone
(~320–360dp wide) and one typical phone (390–412dp). Record device, Android version,
keyboard app, pass/fail, and a screenshot or short recording for any failure.

## Preview consistency (the reported bug)

- Make the built-in **5-Day Home Gym Strength + Size Rebuild** (`home_gym_rebuild_5day`)
  active, then open its detail and tap **Edit** (it becomes an editable personal program
  with no Week 1 reset and no lost history).
- Open **Lower Strength**. Replace **Weighted Sit-Up** with **Seated Calf Raise**.
- Close the editor and open the **Lower Strength** day-preview (any week). Confirm the list
  is exactly: Back Squat · Romanian Deadlift · Dumbbell Bulgarian Split Squat ·
  Dumbbell Calf Raise · Seated Calf Raise.
- Confirm **Weighted Sit-Up** is gone and the words **“Squat + hinge foundation.”** never
  appear as, or inside, an exercise name.
- Confirm **Seated Calf Raise** shows the inherited **3 × 15** prescription.
- Open the workout cockpit for that day and confirm the same list. Force-quit and relaunch;
  confirm the correction survives. Confirm the built-in program (browsed fresh) still lists
  Weighted Sit-Up — the source template is unchanged.

## Mobile exercise picker + keyboard

- In the editor, scroll down to a lower exercise row and tap it (**Replace exercise**).
- Confirm the picker opens at the **top** of the visible screen with the close button and
  search field visible, and the keyboard opens with the search field focused.
- Type `Barbell Standing Calf Raise`. Confirm results appear **immediately below** the
  search field, the list scrolls independently, and the first/last results are reachable
  **without dismissing the keyboard**. Confirm the result list never hides behind the
  keyboard and the editor behind it does not scroll.
- Tap a result once; confirm it is selected and the picker closes in a single tap, the
  keyboard dismisses, and the editor is back at its previous scroll position.
- Rotate to landscape with the keyboard open and confirm the results still end above the
  keyboard. Repeat at largest system font/display size.
- Press Android **Back** with the picker open: confirm it closes the picker only (not the
  whole editor), and Back again leaves the editor normally.
- With TalkBack on, confirm the picker announces a dialog, the search field has a label,
  results are announced as buttons, and focus is trapped inside the picker while open.

## New exercises

- In the picker, search each and confirm it resolves to a single canonical entry with the
  right equipment tags: Barbell Standing Calf Raise, Barbell Shrug, Band Row, Rack Pull,
  Zercher Squat, Landmine Row, Barbell Bulgarian Split Squat, Dumbbell Front Squat.
- Confirm generic **Calf Raise** / **Dumbbell Calf Raise** still map to the dumbbell
  standing entry (not the new barbell one), and existing logged history is unaffected.
