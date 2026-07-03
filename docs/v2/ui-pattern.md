# The Helyx Surface Pattern

> The owner's V2 brief in one line: **simple UI, powerful behind the scenes.**
> The fasting redesign (PROGRESS_V2 S1) is the reference implementation. Every
> screen in the app is being rebuilt to this same pattern. When you build or touch
> a surface, it must follow this doc.

## The pattern (what "clean like fasting" means)

Every major surface has the same three-part shape:

1. **One signature hero.** A single circular gauge/ring in the shared gauge-card
   visual language (`gaugeSVG` in `js/brain/hybrid-score/ui.js`; the fasting ring
   in `js/fasting/fasting-ring.js` is the template). One number, huge. Nothing
   competes with it. No second hero on the same screen.

2. **A lean default surface.** Below the hero: the few glanceable numbers that
   matter and **one synthesized insight line** — a single sentence the engine
   derived, not a wall of stats. (Fasting's is the `Fasting × Recovery` line.)
   The default view is calm and short. A newcomer understands it in two seconds.

3. **Power one tap deeper — never deleted.** The rich analytics live behind a
   **Stats** tab / expansion, not on the default surface. The engine underneath
   stays as deep as it is today; we change *presentation*, not capability. The
   8-pillar breakdown, the correlation charts, the trends — all reachable, none
   in your face.

## The laws (from PRODUCT_V2 §§2,3,8, made operational)

- **One hero per screen.** If two things compete for the eye, one is wrong.
- **Curated, not configurable.** Named presets (fasting protocols; the 4 fixed
  tiles; 3 dials) beat raw knobs and customisers. Choosing defaults is the work.
- **Collapse complexity into a hero, keep it underneath.** 8 pillars → 3 dials.
  25 leaves → 5 screens. The math is untouchable (PRODUCT_V2 §2); only the
  grouping changes. The detail is an expansion, not a deletion.
- **One synthesized sentence, not a spreadsheet.** Each surface earns the right
  to one derived insight line in plain language. No mechanism-quoting.
- **Gauge-card language everywhere.** Restrained icon set, tabular-nums, the ring,
  calm dark premium. Density is the enemy of premium. Zero-flag states feel serene.
- **Data safety first.** Presentation changes never strip or rewrite stored user
  data; state fields are abandoned in place, never deleted.

## The reusable pieces (build once, reuse)

| Piece | Where | Reuse for |
|---|---|---|
| Circular gauge/ring | `gaugeSVG` (hybrid-score/ui.js), `fastingRingSVG` (fasting/fasting-ring.js) | Every screen hero |
| Overview \| Stats tab bar | `.fa-tab-bar` / `.fa-tab` (styles.css), tab split in `view-fasting.js` | Every analytics screen |
| One-insight line card | `.fa-recovery-line` (styles.css), `_fastingRecoveryLine` | Each screen's synthesized sentence |
| 3-dial collapse | `js/brain/hybrid-score/dials.js` (`computeDials`) | The Score hero |
| Preset chips | `.fasting-chip` (styles.css) | Any curated-choice picker |

## Applying it to each remaining surface (V2-1)

- **Score screen** — hero = the number + 3 dials (`computeDials`); Overview =
  dials + one coaching sentence + delta/momentum; Stats = the 8 pillars "under the
  hood" + drivers + trend + projections.
- **Strength / Running / Recovery&Load / Review** — each: a hero gauge or headline
  number, a lean Overview with the key numbers + one synthesized line, and a Stats
  tab absorbing the leaves the IA collapses into it (PROGRESS_V2 S2 map).
- **Home** — one hero (the Score card) then silence: session card → 4 fixed tiles →
  one flag slot. Everything else moves off Home (PROGRESS_V2 S4).
- **Settings** — curated to ~10; power-user knobs retired (PROGRESS_V2 S5).

## The test for any surface

> A new user opens it and, in two seconds, knows the one number, whether today is
> a push or a pull-back, and the one thing to do. Nothing on the default screen
> competes with those. The depth is there when they want it — one tap away.
