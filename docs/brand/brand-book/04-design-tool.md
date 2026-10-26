# Design tool

The web-based 3D tool is where a user turns a template into their remote: move keys, choose switches and protocol, pick a fulfilment level, export a PCB and three STL files. Its interface is the same language as the hardware — keycap buttons in the three cap colours, butter wherever the remote is drawn, oxblood lettering on ivory — so a user learns it by looking at the remote in the viewport. It should feel like the control panel of a well-made appliance: few controls, big, each with one job. The reference layout is the `ToolShell` showcase card.

## Layout

Three regions on a `ground` page, every panel `ground-raised` with a `line` hairline where it meets the viewport, `space-4` padding inside.

- **Top bar** (56px): the two-colour mark, the layout's name in `heading`, the fulfilment `Segmented` (Kit · Half-built · Fully assembled), the protocol `Badge`, and the one primary `Button` — *Export* — at the far right, an oxblood cap with an ivory label. Nothing on the screen is orange except the power key in the model and the selection outline.
- **Tool rail** (left, 56px wide): mode keys as dense ivory `Key`s with glyph legends — Select, Add key, Move, Measure, Camera — in a `well` tray. The active mode is the pressed state, not a colour change.
- **Viewport** (centre, fills): the 3D scene on `viewport`, grid lines `grid-minor` every millimetre and `grid-major` every `pitch-mx`. The model is always the brand colourway — butter shell, ivory and oxblood caps, one orange key — in both themes. A **2D layout mode** flattens the camera to top-down at exactly 4 px/mm (one key = `space-u`), where keys are dragged; the 3D view is for checking and for exporting renders.
- **Properties** (right, 320px): the selected key's name in `title`, then `Field` rows. Values are always real units — mm, u, grams — in `spec`; labels in `caption`. Read-only values the generator fixes (PCB thickness, wall) are shown anyway, in `ink-muted`, so people learn the rules. A key's colour is not a property: it follows from what the key does.
- **Status strip** (bottom, 32px): printability and routing checks as `Badge`s — `ok` ("Prints without supports", "Routed") or `alert` ("Wall 1.4 mm at key 7 — under 1.6 mm"). Every alert names the key and the rule.

## Selection and hover

Selected keys and parts get a 2px `selection` outline (an alias of `accent-text`) and their properties open on the right. Hover is a 1px `ink` outline at 50% alpha. Selection never uses a fill change: a cap's colour says what it does, not whether it is selected. Multiple selection is the same outline on each key, with a dashed `selection` rectangle around the group.

## Motion

Keys press: 60ms ease-out down 2px with the cap's shadow removed, 120ms ease-out back. Panels slide 160ms; the camera tweens 240ms. No bounce, no spring, no fade-and-scale — the system is tactile, not bouncy. Reduced-motion users get the same states with no transition.

## Printability and routing feedback

The tool is honest about limits because the pillars promise it. A rule from the `hardware` family that a layout breaks is an `alert` the moment it happens, placed on the offending key in the viewport and listed in the status strip. A layout that passes every check shows one `ok` badge, "Ready to export". Export is disabled while any alert stands: the button drops to a `line-strong`-bordered ivory cap with an `ink-muted` label and a tooltip naming the first alert.

## Fulfilment levels in the interface

Kit, Half-built and Fully assembled change what the export produces and what the price shows; they never change the design. The `Segmented` control in the top bar is the only place the level is chosen. Each option's help text (`small`) says what the user does: "You solder." "We solder, you print." "You click."

## Accessibility

Every control is a keyboard target with `focus-ring`. The viewport is operable from the keyboard: arrows nudge the selected key one cell, Shift-arrows half a cell on Choc layouts, Tab cycles keys in reading order. Text and icon contrast follow the token notes; status is never colour alone.
