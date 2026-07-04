# V2 Change Manifest

Reference map for the V2-1 (Subtract) slices, built by grep on 2026-07-03 against the
`pre-v2` tag (`15152ff`). Each slice must reconcile against its section here so no
dangling import, dead route, or orphaned CSS survives a cut. Numbers are line counts
at `pre-v2`; they will drift — re-grep before each slice, don't trust these blind.

**Guardrail tag:** `pre-v2` → `git checkout pre-v2` restores the whole pre-redesign
tree. Every V2 cut is one revert away.

---

## Fasting — RETAINED & REDESIGNED (not deleted; owner override)

Fasting is kept as "minimal feel but still powerful." Engine survives; presentation is
trimmed to one calm surface. This section is a *keep/trim* map, not a kill list.

### Keep intact (the "powerful" engine — 1,005 lines)
| File | Lines | Role |
|---|---:|---|
| `js/fasting/fasting-calcs.js` | 525 | fasting-stage math — the engine core |
| `js/fasting/fasting-insights.js` | 233 | derived insights |
| `js/fasting/fasting-achievements.js` | 131 | streaks / milestones |
| `js/fasting/fasting-actions.js` | 116 | start/stop/schedule actions |

### Trim to minimal (the "minimal feel" — presentation, 1,931 lines today)
| File | Lines | Target |
|---|---:|---|
| `js/analytics/views/view-fasting.js` | 836 | → one calm screen: hero fast state + ≤1 insight/chart |
| `js/fasting/fasting-education.js` | 505 | → prune wall to essential in-context copy |
| `js/analytics/charts/fasting-charts.js` | 357 | → keep at most one chart that earns its place |
| `js/home/fasting-card.js` | 233 | → compact card shown ONLY while a fast is active/scheduled |
| `js/fasting.js` | 217 | → controller; slim to the retained surface |

### Cross-references to preserve (do NOT break these — fasting stays wired in)
- `js/brain/hybrid-score/pillars.js` — **Lifestyle pillar = steps + fasting. UNCHANGED.**
  Fasting remains a live Hybrid Score signal (this is what "powerful" buys).
- `js/analytics/so-what.js` — fasting-countdown so-what line (keep until §V2-4 voice work).
- `js/home/dashboard-model.js`, `js/home.js` — fasting home surfacing (make quiet, keep).
- `js/dashboard.js` — `id: 'fasting'` tile (see Tiles below — fate TBD with S3).
- `js/app.js` — R16 fasting sub-router (keep; it routes the retained surface).
- `js/settings.js`, `js/state.js`, `js/athlete-profile.js` — fasting prefs/state. Keep;
  never strip stored `fastingHistory`.
- CSS: `css/styles.css` (83 `fast` refs), `css/analytics.css` (8). Sweep only the blocks
  belonging to trimmed surfaces; keep what the minimal surface uses.

---

## Analytics leaves — 24 router cases → 5 screens + Fasting

Current `case` labels in `js/analytics.js` (24, excluding `hub`):

    activity · avg-pace · bodyweight · fasting · goal-progress · hybrid-score
    load-focus · monthly-report · progress · projections · recovery · recovery-score
    run-crossref · running · streak · strength · strength_pr · stress-balance
    training-status · vdot · weekly-review · weekly-summary · weekly-volume

Collapse map (see PROGRESS_V2 S2):
| Target screen | Absorbs |
|---|---|
| **Score** | hybrid-score, projections |
| **Strength** | strength, strength_pr, weekly-volume |
| **Running** | running, avg-pace, vdot, run-crossref |
| **Recovery & Load** | recovery, recovery-score, training-status, load-focus, stress-balance |
| **Review** | weekly-review, weekly-summary, monthly-report, progress, activity, streak, bodyweight, goal-progress |
| **Fasting** *(kept)* | fasting |

Every retired `case` gets a **router redirect**, never a removed case (deep links +
notifications must still resolve). View files under `js/analytics/views/` die only
after their target screen absorbs their content. Calc modules
(`js/analytics/calculations/*`) mostly SURVIVE — they feed the Score engine; only the
view layer collapses.

## Tiles — 19 defs → 4 fixed (S3)

Tile ids in `js/dashboard.js`:

    program-hero · today · fasting · readiness · recovery-score · consistency
    weekly-volume · bodyweight · top-lifts · active-fuel · avg-pace · stress-balance
    streak · goal-progress · hrv · resting-hr · sleep · steps · connect-health

Keep exactly 4: **readiness · weekly-volume · top-lifts · avg-pace**. Customiser
(`js/dragdrop.js`) + `DEFAULT_HIDDEN_TILES` machinery removed. `dashboardTiles` state
field abandoned in place (never stripped).
**Open question for S3:** the `fasting` tile — since fasting is retained, decide
whether it earns a 5th tile slot or lives only inside its own screen + the active-fast
home card. Lean: no tile (the active-fast card covers the live moment); flag to owner.

## Settings — trim to ~10 (S5)

Keep: account/auth · units · notifications · health-connect · data export/delete ·
theme · (fasting prefs — retained). Kill power-user knobs: band weights, progression
step, remembered-rest reset, etc. Underlying state fields abandoned, defaults apply.
(Row count is not greppable by a single token — enumerate against `js/settings.js`
directly when S5 starts.)
