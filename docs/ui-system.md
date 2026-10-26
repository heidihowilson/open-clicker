# Designer UI system

Owner request, 2026-10-25: a simpler UI system and hierarchy that scales from a phone to a desktop. The editor must constrain a design enough that the design file alone yields the PCB schematic.

This document is the spec. The Open Clicker look (`docs/brand/`) stays. The 3D view with explode and tap-to-focus stays. The three fulfilment tiers, the four templates and both themes stay.

Audited: <https://openremote.sethgholson.com> on 2026-10-25 at 390 × 844, 820 × 1180 and 1440 × 900 with Playwright (Chromium, touch emulation on the two small sizes).

## 1. Problems found

### Phone, 390 × 844

- The top bar does not fit. Its minimum width is 444 px (name at 50 %, protocol badge, Export). Chromium widens the layout viewport to 444 px, so the whole page renders at 88 % and the right 54 px are cut off: "Export" reads "Exp", "Fully assembled" reads "Fully assembl", the 2D scale pill is cut.
- In 3D the camera segmented control (Iso, Top, Front, Side) sits at `left: 112px` next to the 2D/3D control. Together they are wider than the screen, so the page scrolls sideways and the left column is lost ("C", "xplode", "D").
- The page is 3 428 px tall. Everything that is not the viewport is one long scroll: templates, controller, protocol, battery, keycaps, the price table, checks, pins, then the status strip at 3 363 px. The status strip is never visible while editing. The price heading is at 1 815 px.
- Selecting a key puts the inspector below the viewport. Only its heading is in view. "Done" and "Remove key" are at 1 283 px. The user scrolls away from the key to edit the key.
- The 2D sheet has `touch-action: none` and fills 523 px of the first screen. A swipe on it does not scroll the page. The user has to find the margin to scroll.
- 175 px of the first screen are gone before the viewport starts: a 109 px top bar and a 58 px tool rail row.
- In the exploded view nine callout cards stack on the right and cover about 60 % of the model. The focus card (280 px) covers the part it describes.
- 31 controls are under 44 px tall (every segmented option is 32 px, badges 20 px). The theme toggle is hidden.
- "Move" is a separate tool. A drag on a key in Select mode does nothing. "Hover a line for where its number comes from" has no hover on touch.

### Tablet portrait, 820 × 1180

- Same stacked phone layout. The page is 3 337 px tall; the properties area alone is 2 393 px.
- The fulfilment control stretches to 796 px wide with three 260 px options. The tool rail is a full-width row with five 40 px keys in the middle.
- The viewport is 732 px tall; the key inspector still lands below it, "Done" at 1 492 px.
- There is room for a side panel at this width, and none is used.

### Desktop, 1440 × 900

- The properties panel scrolls 2 855 px inside 812 px. The price is at 1 213 px, below the fold; checks and pins are below that. The status strip then repeats the same facts in a second place.
- Eight unrelated sections share one panel: template, controller, protocol, battery, keycaps, price, checks, pins. There is no hierarchy between "what I decide" and "what the tool worked out".
- The focus card in 3D covers part of the exploded model. Callouts and the card compete for the same corner.
- The fulfilment control, the protocol badge, the theme button and Export sit in one row. The theme button is a text button, the only control in the bar with no job in the design.
- The top-left 2D/3D control and the camera control are two separate pills with the same visual weight.

## 2. The constraint model

The schematic must follow from the design file with no human step. So the editor collects few decisions and derives the rest. The rule: a thing the user cannot change is shown, but never editable.

### The user decides

- Template to start from (sets the first key field).
- Keys: where each key sits on the Choc grid (x, y), its width (1u, 1.5u, 2u), its action, an optional legend.
- Controller: one of `xiao-esp32c3`, `xiao-esp32c6`, `xiao-nrf52840`.
- IR transmit: yes or no. IR receive: yes or no.
- Battery level reporting: yes or no (hidden and forced on when the chip has a built-in divider).
- Battery cell: capacity and size.
- Keycap family: MBK or MCC.
- Fulfilment tier (Kit, Half-built, Fully assembled). This is a view and export setting. It is not in the design file and never changes the circuit.

Seven decisions. Everything below is derived from them.

### Derived, shown, never editable

- Matrix size: `planPins()` picks columns and rows. Columns are inputs with pull-ups on wake pins. Rows are outputs. Any key press wakes the chip.
- Each key's matrix position: reading order (top to bottom, then left to right) fills row-major. This is what `plan.positions` does today.
- Pin assignment: column pins, row pins, IR_TX, IR_RX, VBAT_SENSE, spare pins. `planPins()` is the single source. The firmware header and the schematic read the same plan.
- Reference designators, by reading order of keys: `SW1..SWn` switches, `D1..Dn` diodes, one per key. `U1` controller. `J1` battery connector. `LED1` IR LED, `Q1` IR driver, `R1` LED series resistor, `R2` base resistor. `U2` IR receiver, `C1` its decoupling cap. `R3`, `R4` battery divider. Numbering is stable because it comes from sorted keys, not from `key.id`.
- Net names: `ROW0..ROWr`, `COL0..COLc`, `IR_TX`, `IR_RX`, `VBAT`, `VBAT_SENSE`, `3V3`, `GND`. One net per pin. The matrix is column-to-row through the diode (diode cathode to the row, anode to the switch). This matches `firmware/` and is a constant, not an option.
- Footprints: Kailh Choc V1 hot-swap socket with through-hole pads (one footprint serves soldered and socketed builds), SOD-123 diode, XIAO 14-pin module, JST-PH 2-pin, 0805 passives, 5 mm IR LED, SOT-23 transistor, 3-pin IR receiver.
- Placement: key centres from the design; the XIAO at `xiaoPlacement()` with USB-C on the bottom edge; the battery between the top edge and the XIAO; IR LED and receiver centred on the top edge; four M2 bosses in the corners, outside the key field. The board outline is `boardBounds()`.
- Shell, plate, lid, keymap, BOM and price. All from the same file.

### Schema gaps in `design.ts`

These block a deterministic schematic and must be fixed first.

- No design identity. Add `id` (uuid, set on creation) and `revision` (integer, bumped on export). The KiCad title block, the BOM and the firmware header need them, and two exports from the same file must produce the same text.
- `batterySense` is a user flag even when the chip has a built-in divider. Make it `batterySense: boolean` but validated: `true` is forced for `xiao-nrf52840` and the UI hides the choice. Better, in `schema: 3` make it derived (drop it) and treat "reports battery level" as an always-on feature when the pin budget allows.
- Reading-order ties. Two keys can share `y` and `x` only when they overlap, which is already an error. Add a schema refinement that rejects duplicate `(x, y)` so the sort is total.
- The switch and diode conventions (Choc V1, hot-swap, COL2ROW, 1N4148W) are nowhere in the file. Add a `circuit` block the generator writes, so an old file still produces the same board after a convention changes: `circuit: { matrix: "col2row", switch: "choc-v1-hotswap", diode: "1n4148w-sod123" }`.
- The battery connector is implied. Put it in the same `circuit` block: `battery: "jst-ph-2"`.
- The IR LED current and the receiver part are implied. Add `ir: { led: "ir-5mm-940", receiver: "tsop38238" }` in `circuit`.
- `template` is free text up to 20 characters and only the UI reads it. Make it an enum of `"tile" | "slab" | "deck" | "column" | "custom"`.
- The pin plan is not saved. Keep deriving it (it is pure), but export it in the layout file under `derived` for readers that do not run the planner. Mark it as output-only; `parseDesign` strips it.

What is not a gap: key `label` and `keycap` do not touch the circuit. Fulfilment does not touch the file. Keys with action `none` still get a switch and a diode.

### What the UI must constrain

- Keys snap to the grid: x on half pitches, y on whole pitches. No rotation. No overlap. Already true.
- The key count must fit the chip. The UI shows the budget as a meter: "11 of 24 keys on this chip", recomputed on every change. When the planner fails, adding a key is still allowed but the key is marked and Export is blocked.
- The number of columns is limited by wake pins: 4 on the C3, 3 on the C6, 11 on the nRF52840. The planner picks it; the UI shows it in the Pins list.
- IR on, battery level on and the key count share one pin budget. The UI shows the trade: when IR cannot fit, the option is disabled with the reason, not hidden.
- The battery must fit beside the XIAO. The UI offers cell presets (401230 110 mAh, 502030 250 mAh, 602040 400 mAh, 603450 1 000 mAh) and a custom size; the check marks a cell that does not fit.

## 3. Hierarchy

One editor, three panels, one viewport. Not a wizard.

Why: the constraint model has seven decisions, and every one of them changes checks that the user must see on the model. A stepped flow hides the viewport and forces an order that the decisions do not have. A single editor with tabs keeps the model visible and lets a user change the chip after placing keys. Progressive disclosure comes from the tabs and from the key inspector, not from steps.

The three panels, in the order a new user needs them:

- **Keys.** Start from a template (Tile, Slab, Deck, Column). Key count and budget meter. The list of keys in reading order (compact, one line each, the selected key highlighted). Tap a key in the viewport or in the list to open the key inspector in this panel.
- **Parts.** The user decisions that are not keys: controller (three cards), talks to the TV over (Bluetooth, BT + IR), learns IR (off, on), battery (cell preset or custom size, battery level reporting when the chip needs the choice), keycaps (MCC, MBK). Nothing else.
- **Build.** The outcome. Fulfilment tier (Kit, Half-built, Fully assembled), the price for that tier with its lines, the pricing assumptions behind a disclosure, the checks list, the pins and matrix summary, and the exports. Export buttons live here and in the top bar.

The key inspector replaces the Keys panel body while a key is selected: action (select), legend, width, position as column and row with four nudge keys, matrix position and refdes as read-only text (`SW5 · D5 · row 1, col 2`), then "Done" and "Remove key". Switch, pitch and wall are not key properties and leave the inspector; they live in Build under Pins and matrix.

The viewport has one mode control: 2D, 3D. In 3D the camera presets, Explode and Labels are in a single bottom toolbar. The focus card in 3D is the only overlay that appears on top of the model.

The top bar at every size: the mark, the name, one status chip, Export. The status chip shows "Ready" (ok) or "2 problems" (alert). Tapping it opens Build at the checks list. The fulfilment control leaves the top bar and lives in Build. The top bar shows the chosen tier and price as a text chip ("Fully assembled · $71") that also opens Build. This amends the brand book's "top bar" layout; the rule "the level is chosen in one place" still holds. The theme toggle becomes a small icon key at the far right of the bar on wide screens and sits at the bottom of Build on small screens.

## 4. Responsive system

Three breakpoints by viewport width. Phone portrait first.

- **Compact**, under 760 px: phone portrait and small tablets. Viewport on top, bottom sheet below.
- **Medium**, 760 to 1 099 px: tablet portrait and small laptops. Viewport left, side panel 320 px right, no rail.
- **Wide**, 1 100 px and up: rail 56 px, viewport, side panel 360 px.

Landscape phones (height under 480 px) use the Medium layout with the panel at 280 px.

### Compact layout

- Top bar 48 px: mark 28 px, name (truncates with an ellipsis, taps to edit), status chip, Export (icon key, 44 px). Nothing wraps. Minimum width 320 px.
- Viewport fills from the top bar to the sheet's collapsed edge. No tool rail. In 2D the only overlay is the 2D/3D control (top left) and an "Add key" key (bottom right, 44 px). In 3D the bottom toolbar holds Explode and the camera control; Labels is in the overflow of that toolbar.
- Bottom sheet with three detents: collapsed 56 px (the tab bar only: Keys, Parts, Build), half 50 % of the height, full (the sheet top at 48 px under the top bar, the viewport behind it keeps rendering). Drag the handle or tap a tab to change the detent. Selecting a key opens the sheet to half with the key inspector. "Done" returns the sheet to the detent it had before.
- Tab bar is a three-option `oc-seg` stretched to full width, 44 px options, with a badge count on Build when there are errors.
- Checks and price live in Build. The status chip in the top bar is the only permanent status element. No bottom strip.
- Hidden on compact: Measure tool, the pricing assumptions (behind "Assumptions" disclosure), part callouts in 3D (off by default; the focus card does the job), the pins list detail (collapsed under "Pins and matrix"), the theme toggle (moved to Build).

### Medium layout

- Top bar 56 px, same contents, the name at full size.
- Viewport left. Side panel 320 px on the right with the same three tabs at its top. The key inspector replaces the Keys tab body. No tool rail: add is a key in the viewport corner, move is drag.
- Checks and price live in Build. The status chip stays in the top bar.

### Wide layout

- Top bar 56 px: mark, name, tier chip, status chip, theme icon key, Export (primary cap).
- Rail 56 px at the left with Select, Add, Measure, Camera, as the brand book asks. Move is not a tool: a drag in Select moves. The rail is the only place that changes between Medium and Wide.
- Viewport centre. Side panel 360 px with the three tabs.
- Checks and price live in Build, the same as elsewhere. The status strip is removed at every size. The brand book's "status strip" becomes the status chip plus the Build checks list.

### Touch editing

- Tap a key: select it and open the inspector.
- Drag a key: move it, snapped to the grid, with a 4 mm live offset so the finger does not hide the key. A drag starts after 8 px of movement; a tap under that is a select.
- Drag empty sheet: pan. Pinch: zoom between 50 % and 200 %. The sheet keeps `touch-action: none` only on the SVG; the sheet host allows vertical scroll so the page never traps a swipe. On compact the viewport is a fixed-height box, not a page region, so there is nothing to trap.
- Add key: tap the "Add key" key, then tap a cell. The new key is selected and the sheet opens. A second tap on "Add key" cancels.
- Nudge: four keys in the inspector move the selected key one cell. Shift is not available on touch, so a "half" toggle beside the nudge keys switches to half-pitch steps.
- Remove: the "Remove key" button in the inspector. No gesture.
- 3D: one finger orbits, two fingers pan and zoom (OrbitControls defaults). Tap a part in the exploded view focuses it; the focus card docks to the bottom of the viewport above the toolbar, never over the part.
- No hover anywhere. The price line basis is always printed under its label.

### Targets and type

- Every tappable control is at least 44 × 44 px on compact and medium. `oc-seg-opt` gets a `--seg-h` custom property: 32 px on wide, 44 px elsewhere. `oc-key-dense` stays 40 px only in the wide rail.
- Body text 16 px on compact; the serif heading in the panel drops from 36 px to 28 px.
- Panel padding `space-3` on compact, `space-4` elsewhere.

### Wireframe, compact (390 wide)

```
+----------------------------------------+
| OC  Living room Tile      [Ready] [⇩]  |  48 top bar
+----------------------------------------+
| [2D][3D]                               |
|                                        |
|            +--------------+            |
|            |   ( power )  |            |
|            |     [^]      |            |
|            |  [<][OK][>]  |            |
|            |     [v]      |            |
|            | [<-][⌂][≡]   |            |
|            | [V-]    [V+] |            |
|            |  Open        |            |
|            |  Clicker     |            |
|            +--------------+            |
|                                 [ + ]  |
+----------------------------------------+  sheet, collapsed
|  ———                                   |
| [ Keys ]  [ Parts ]  [ Build · 2 ]     |  56 tab bar
+----------------------------------------+

Sheet at half, a key selected:
+----------------------------------------+
| OC  Living room Tile      [Ready] [⇩]  |
+----------------------------------------+
|            +--------------+            |
|            |   ( power )  |            |
|            |     [^]      |            |
|            |  [<][OK][>]  |   viewport |
+----------------------------------------+
|  ———                                   |
| [ Keys ]  [ Parts ]  [ Build ]         |
| Right                       SW5 · D5   |
| key 5 of 11 · column 3, row 3          |
| DOES      [ Right              v ]     |
| LEGEND    [ right (glyph)        ]     |
| WIDTH     [ 1u ][1.5u][ 2u ]           |
| NUDGE     [<][^][v][>]   (half: off)   |
| [ Done ]              [ Remove key ]   |
+----------------------------------------+
```

### Wireframe, wide (1440)

```
+------------------------------------------------------------------------------------+
| OC  Living room Tile         [Fully assembled · $71] [Ready]  (☾)  [  Export  ]    | 56
+----+-------------------------------------------------------+-----------------------+
| ▸  | [2D][3D]                                              | [Keys][Parts][Build]  |
| +  |                                                       |                       |
| ⟷  |                 +--------------+                      | Parts                 |
| ◎  |                 |   ( power )  |                      | CONTROLLER            |
|    |                 |     [^]      |                      | [Cheapest    C3 $5 ]  |
|    |                 |  [<][OK][>]  |                      | [All-rounder C6 $5.5]*|
|    |                 |     [v]      |                      | [Long batt. nRF $10]  |
|    |                 | [<-][⌂][≡]   |                      | TALKS TO THE TV OVER  |
|    |                 | [V-]    [V+] |                      | [Bluetooth][BT + IR]  |
|    |                 |  Open        |                      | LEARNS IR  [Off][On]  |
|    |                 |  Clicker     |                      | BATTERY               |
|    |                 +--------------+                      | [400 mAh 602040  v ]  |
|    |                                                       | KEYCAPS   [MCC][MBK]  |
|    |                                  2D · 4 px/mm · 100%  |                       |
+----+-------------------------------------------------------+-----------------------+
  56                     viewport                                     360
```

## 5. Component inventory

Existing classes in `designer/src/ds/components.css`, used as they are:

- `oc-btn`, `oc-btn-primary`, `oc-btn-danger`, `oc-btn-link`: every button. Export is the one primary.
- `oc-seg`, `oc-seg-opt`: 2D/3D, camera, tabs, width, protocol, learns IR, keycaps, fulfilment, template. New modifier `oc-seg-fill` (options share the width) and the `--seg-h` height variable.
- `oc-badge` with `-ok`, `-alert`, `-accent`, `-mono`: status chip body, check levels, refdes text.
- `oc-field`, `oc-field-well`, `oc-field-help`, `oc-field-readonly`, `oc-field-unit`: inspector and battery fields. Drop `min-width: 180px` on compact.
- `oc-key`, `oc-key-dense`: rail keys, nudge keys, the viewport "Add key".
- `oc-row-well`: rail tray and the sheet's tab bar.

New components, each one Svelte file under `designer/src/ui/`:

- `Panel.svelte`: the side panel or bottom sheet. Props: `detent` (`collapsed | half | full`), `tab`. Renders as a bottom sheet under 760 px and a column otherwise. Owns the drag handle, the detents and the tab bar. One component, two layouts, so the tab content does not know which it is in.
- `Tabs.svelte`: a three-option `oc-seg` with an optional count badge per option.
- `StatusChip.svelte`: an `oc-badge` inside a button. "Ready" or "N problems". Opens Build.
- `ChoiceCard.svelte`: the controller card, from today's `.choice` style, promoted to `oc-choice` in `components.css` so the brand repo can take it back.
- `Meter.svelte`: "11 of 24 keys" as a thin bar in the well colour with an `ok` or `alert` fill. Used for the key budget and the pin budget.
- `PriceList.svelte`: price lines as a list (label, basis under it, amount right-aligned). Replaces the `<table class="bom">`. Totals as the last two rows.
- `Checks.svelte`: the findings list, errors first, each as badge plus sentence, with a "Show key" link that selects the key.
- `PinMap.svelte`: read-only. Columns, rows, IR, battery as badge rows, plus a matrix grid of refdes.
- `NudgePad.svelte`: four `oc-key-dense` keys plus the half-step toggle.
- `FocusCard.svelte`: the 3D part card, docked at the bottom of the viewport; moved out of `Preview3D.svelte`.

Removed: the `.status` footer, the `.menu` export dropdown (Export becomes a Build section; the top bar Export button opens Build at Exports on compact and medium, and shows the same dropdown on wide), the `.theme` text button.

## 6. Status, checks and price

- `check()` stays the single source. Findings keep three levels. Errors block every export except the layout file.
- The status chip in the top bar is the only permanent status element. It shows "Ready" with the `ok` badge or "N problems" with the `alert` badge. Warnings do not change the chip; they show a count on the Build tab.
- Errors mark the key in the viewport with the dashed alert outline, as today, and the key inspector shows the finding's sentence under the heading.
- Export, in the top bar and in Build, is disabled while an error stands. Its help text is the first error's sentence. On compact the disabled Export opens Build at the checks list instead of doing nothing, so the user sees why.
- Price lives in Build: tier control, then the price heading for that tier, then the lines. The top bar's tier chip shows the tier and price as text at every size, so the number is always one tap away without a strip.
- Assumptions (batch, margin, labour) are behind a disclosure in Build on every size.
- The 3D focus card keeps the part's price line and basis. It is the only place price appears in the viewport.

## 7. Implementation plan

Each step ships on its own and leaves the app working.

1. **Schema gaps.** `designer/src/lib/design.ts`: add `id`, `revision`, `circuit`, the `template` enum, the duplicate-position refinement; migrate `schema: 2` files on load in `App.svelte` `restore()`. `designer/src/lib/exports.ts`: write `derived.pins` and refdes into the layout export. Add `designer/src/lib/refdes.ts` with `designators(design, plan)` returning `SWn`, `Dn` per key and the fixed designators. Update the four seeds.
2. **Tokens for size.** `designer/src/ds/components.css`: `--seg-h`, `oc-seg-fill`, `oc-choice`, the compact `oc-field` width rule. `docs/brand/` gets the same lines so the mirror stays exact.
3. **Top bar.** `App.svelte`: new bar with mark, name, tier chip, `StatusChip.svelte`, theme icon key, Export. Remove the footer. Fulfilment control moves into a Build section. Verify at 320 px: no wrap, no overflow.
4. **Panel and tabs.** New `designer/src/ui/Panel.svelte` and `Tabs.svelte`. Move the props content into three tab components: `designer/src/panels/Keys.svelte`, `Parts.svelte`, `Build.svelte`. `App.svelte` becomes the shell only. Wide and medium get the side panel. The brand look is unchanged.
5. **Bottom sheet.** `Panel.svelte` compact mode: detents, drag handle, the viewport as a fixed box above it. Key selection opens to half. `Done` restores the detent. Test at 390 × 844 and 360 × 640.
6. **Touch editing in 2D.** `Editor2D.svelte`: drag-to-move in Select, pan and pinch, the viewport "Add key" key, 8 px drag threshold, the finger offset. Remove the Move tool. `NudgePad.svelte` in the inspector.
7. **Build tab.** `PriceList.svelte`, `Checks.svelte`, `PinMap.svelte`, `Meter.svelte`, assumptions disclosure, exports section. Export disabled state opens Build on compact.
8. **3D overlays.** `Preview3D.svelte`: single bottom toolbar (camera, Explode, Labels), `FocusCard.svelte` docked at the bottom, callouts off by default on compact, the card never over the model.
9. **Rail on wide only.** `App.svelte`: rail with Select, Add, Measure, Camera at 1 100 px and up; nothing elsewhere.
10. **Playwright check.** `designer/e2e/responsive.spec.ts`: the three viewports, the flows from section 1, assertions that `scrollWidth` equals `innerWidth`, that no control is under 44 px on compact, and that the inspector's "Done" is in view after a key tap. Runs in CI with the existing build.

Steps 1 and 2 are each a morning. Steps 3 to 5 are the layout fix the owner asked for and should land together as one draft PR after step 2. Steps 6 to 9 follow, one PR each. Step 10 lands with step 5 and grows with each later step.
