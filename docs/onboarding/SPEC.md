# Open Clicker — first-visit onboarding: interaction spec

Reference for the production refactor. The prototype (`prototype.dc.html`, live at
https://claude.ai/code/artifact/8265011f-f8ed-49e2-b2cb-e1436ca196c6) is the behavioral
ground truth; this document explains the intent and the rules behind it. Where the two
disagree, the prototype wins for *feel* and this doc wins for *rules*.

## 1. Principles

- **One object on screen.** The remote is always front and center. Everything else
  (questions, choices, templates, spare keys, purchase options) arrives around it and
  leaves again. The remote never moves to make room for anything.
- **Bare minimum copy.** Two questions, a handful of one-word buttons. Affordances are
  shown by motion (jiggle, grabbers, dashed outlines), not explained in text.
- **Things appear when the user pauses, not when they're told.** Idle timers gate
  progression; every edit resets them.
- **No off-grid state, ever.** Keys live in whole cells; the shell only takes sizes that
  frame whole rows/columns. There is no half-position a key can land on.
- **Nothing reflows the editor.** Overlays are fixed-position or grow in place; list
  items are never removed from the DOM mid-session (see §5.6).

## 2. Flow (state machine)

```
intro ──Yes──▶ edit(answer=yes)  "Would you change anything?"  ──▶ pick: Size | Buttons
      ──No───▶ edit(answer=no)   "What would you change?"      ──▶ pick: Size | Buttons
edit ──Build or Buy──▶ buy ──Order──▶ done ──Design another──▶ intro
buy ──Back──▶ edit
```

### 2.1 intro
- Remote fades/rises in alone (≈1.1s). After **900ms** the headline "Good remote?" and
  **Yes / No** rise in beneath it.
- Yes and No both go to edit; only the headline differs.

### 2.2 edit — picking a mode
- Headline per answer (above). Beneath the remote: **Size** | **Buttons** (ghost pills).
- **Size** → resize grabbers appear. The first completed resize also turns on key
  editing (jiggle) immediately.
- **Buttons** → keys jiggle immediately. The first key move or delete turns on the
  resize grabbers.
- Picking a mode starts the activity clock (`editStart`, `lastAct`, `acts = 0`).

### 2.3 edit — unlocks
| Unlock | Trigger |
|---|---|
| Key editing (jiggle, drag, drag-off-to-delete) | Buttons mode, or first resize in Size mode, or any template applied |
| Resize grabbers | Size mode, or first move/delete in Buttons mode, or any template applied |
| Spare-key tray | 3 changes (resize / move / delete / add), or any template applied |
| Second & third spare keys (light gray, red) | After the first spare key has been added |
| "Build or Buy" button | ≥1 change and **5s** with no change; hides on the next change, returns after another 5s idle |
| "Start Over" link | ≥1 change; hidden while the template panel is open |
| Template panel | Clicking **Start Over** (not timed) |

A "change" = resize release, key move release (if it moved ≥3px), key dropped off the
remote, or spare key added. Applying a template is **not** counted as a change.

### 2.4 buy
- Headline "How do you want it?". Remote shrinks (see §7) and stays put.
- One grouped list, max-width 420px: **DIY**, **Kit**, **Complete** — radio on the left,
  name + one-liner, live price on the right.
  - DIY: "Bare parts. You solder, you print."
  - Kit: "Assembled board. You print the shell."
  - Complete: "Ready out of the box."
- Selecting DIY or Kit unfolds a second panel with the itemized parts and a total.
  Complete shows no breakdown.
- **Order** appears once a tier is chosen. **Back** returns to edit (activity clock reset).

### 2.5 done
- Headline "Ordered." with "{Tier} · ${total}", a small check badge, **Design another**
  (full reset to intro, Streamer layout).

## 3. The remote

- Shell: #161618, radius 26px, soft drop shadow + 1px hairline. Key caps are 32×32,
  radius 5, two-tone (darker base with a 2px bottom lip, lighter 24×22 top face inset
  4/3px). Colors:
  - gray (default): base #232325, top #39393c
  - white (nav center): base #c6c6cb, top #ececf0
  - power (red): base #b8261d, top #ff453a
- **Color is a property of the key**, never inferred from position. No labels on any key.
- Grid: **40px cells** (32 cap + 8 air), **12px margin**. Cell origins at `12 + 40n`.
  One empty cell separates functional groups in the stock layouts.

### 3.1 Layouts (cell coordinates = top-left of cap)
Order of points matters: `power` and `white` are indices into `pts`.

- **The Streamer** (opening layout) 136×336, power idx 1, white idx 4 — 15 keys:
  back/power row; 5-key D-pad with white select; home/mute/menu; rew/play/ff; vol −/+.
- **The Boomer** 136×576, power idx 2, white idx 19 — 36 keys: input/mute/power;
  3×3 numpad + guide/0/info; 3×3 nav (white center); vol & ch rockers around exit/back;
  rew/play/ff; rec/stop/pause.
- **The Brick** 176×296, power idx 3, no white — solid 4×7 grid.
- **Blank** ("Empty Remote") 136×256, no keys.

Exact `pts` arrays are in `layouts()` in the prototype.

## 4. Editing interactions

### 4.1 Jiggle (iOS home-screen style)
Per key, derived from a stable hash of its index so it never changes between renders:
- duration 0.22–0.34s, negative start delay 0–1s, `transform-origin` at
  `30–70% / 5–15%` (off-center → positional wobble), odd keys use the mirrored keyframes
  with `animation-direction: alternate`.
- Keyframes: `-1.4° → +2° → -1.4°`, ease-in on the first half, ease-out on the second.
- The key being dragged stops jiggling and lifts (scale 1.1, deeper shadow).

### 4.2 Drag a key
- Drag starts after 3px of movement (a plain tap does nothing).
- While dragging the key follows the pointer freely, including outside the shell.
- Outside: key dims to 45% and scales to 0.9 as the "let go to remove" cue.
- Release **inside**: snap to nearest cell (`12 + round((v-12)/40)*40`), clamped to the
  shell. If that cell is occupied by a visible key, the key springs back to where it
  started. Movement eases over 0.3s.
- Release **outside** (center of key beyond the shell bounds): the key fades/shrinks in
  place and becomes an inert placeholder (§5.6). Counts as a change.

### 4.3 Resize
- Two grabbers on the shell, iOS-sheet style: a 4×28px bar centered on the bottom edge
  (height) and a 28×4px bar on the right edge (width). Charcoal #48484a, lighter on
  hover, light while dragging. Large invisible hit areas (±14px).
- While dragging, the shell follows the pointer continuously (no transition) and keys
  whose cell no longer fits fade out (opacity 0, scale .5, pointer-events none).
  Hidden keys keep their coordinates and reappear if the shell grows back.
- On release the dimension snaps to the nearest size that frames whole cells with the
  12px margin: candidates are `c + 44` for every occupied column/row `c`, plus
  `last + 40·i`. Never smaller than the first occupied column/row + 44 (at least one key
  always stays). With no keys at all, min is 56.
- The remote's on-screen zoom (§7) is frozen for the duration of a resize drag.

### 4.4 Spare-key tray ("Add")
- Row of spare keys with a "↑ Drag" caption. First only the gray key is offered; after
  the first successful add, the light-gray and red keys appear beside it. Caption fades
  while dragging and permanently after the first add.
- Each spare key sits on a dashed 32×32 outline that shows while that key is being
  dragged and until the replacement has popped in.
- Drag mechanics are in screen space: the drop point is mapped into the remote's cell
  grid using the remote's bounding rect.
  - Drop on the shell on a free cell: the new key appears at the drop point, then glides
    into its cell (0.55s). The spare key vanishes instantly; 30ms later a fresh one pops
    into the outline (scale .3→1, spring `cubic-bezier(.34,1.56,.64,1)`); outline fades
    ~700ms later.
  - Drop anywhere else, or on an occupied cell: springs back to the outline.

### 4.5 Templates
- Panel content: "Try one", three thumbnails (30% scale miniatures with the same shell /
  cap colors) labeled The Streamer / The Boomer / The Brick, and an **Empty Remote** link.
- Opened by **Start Over**. Closed by choosing anything. Never appears on a timer.
- Applying a template morphs the live remote (§5.5) and unlocks key editing, resize and
  the tray at once.

## 5. Animation details

- Easing default: `cubic-bezier(.2,.8,.2,1)`. Spring: `cubic-bezier(.34,1.56,.64,1)`.
- Text and buttons enter with a 0.75s rise (12px up + fade); siblings stagger by ~0.1s.
- 5.5 **Template morph**: shell eases to the new size (0.7s). Existing keys are matched
  to new slots by role first (red → power slot, white → center slot), remaining gray keys
  in reading order; they glide (0.55s) with a 14ms per-key stagger. Surplus keys fade and
  shrink; missing keys are created hidden and popped in on the next frame.
- 5.6 **Key identity rule**: the key list is index-matched by the renderer, so removed
  keys are never spliced out — they stay as `dead` placeholders (invisible, inert).
  Splicing caused neighbors to inherit each other's positions and "ghost" across the
  remote. In production use stable keys (React `key=id`) and this rule can go away.

## 6. Pricing stub (replace with real data)

`n` = number of visible, live keys.

- DIY: Bare PCB 9 · Controller module 6 · Mechanical switches n×0.45 · Keycaps n×0.30 ·
  IR emitter 1 · Battery holder 2 · Passives kit 3 · Shell files (STL) included
- Kit: Assembled board 29 · switches n×0.45 · keycaps n×0.30 · Battery holder 2 · STL included
- Complete: Kit parts + Printed shell 14 + Assembly and test 18

Prices update live with the design (Streamer ≈ $33.75 / $43.75 / $75.75).

## 7. Responsive rules

- The remote is zoomed uniformly (keys, grabbers and all) so its height ≈ **62%** of the
  viewport (54% on desktop viewports that also hold the inline tray), capped so it leaves
  ≥70px clear on each side; zoom range 0.75–3×. Recomputed on resize; frozen during a
  shell resize drag.
- In buy/done the remote scales to min(half its zoom, 20% of viewport height).
- Headline size: `clamp(26px, 7vw, 34px)`.
- **Templates:** desktop (≥760px wide) → card sliding in from the **left**, vertically
  centered. Phone → bottom sheet (pill, rounded top, safe-area padding).
- **Spare-key tray:** desktop with room (≥760 wide and ≥760 tall) → in-flow row between
  the remote and Build or Buy, opening by growing its height. Otherwise → bottom sheet;
  while it's up the page gets extra bottom padding so the buttons can scroll clear.
- Page is top-anchored (not vertically centered) so content appearing below never moves
  the remote.

## 8. Copy inventory (complete)

Good remote? · Yes · No · Would you change anything? · What would you change? · Size ·
Buttons · Drag · Try one · The Streamer · The Boomer · The Brick · Empty Remote ·
Start Over · Build or Buy · How do you want it? · DIY · Kit · Complete · (three one-liners
in §2.4) · Total · Included · Order · Back · Ordered. · Design another

## 9. Type and color

- Type: **Geist** (Google Fonts), fallback SF/system. Weights 400/500/600.
- Ground #f5f5f7 · text #1d1d1f · secondary #6e6e73 · hairlines rgba(0,0,0,.06–.07).
- Primary button: black pill, 46px tall. Ghost button: white pill with inset hairline.
- Focus ring #0071e3 is the only blue; no other accent outside the red power key.

## 10. Known gaps / non-goals in the prototype
- No persistence, no real pricing, no cart/checkout.
- Keys have no labels or inferred roles (deliberate); legends are a later concern.
- No keyboard-only path for drag interactions.
- Deleting every key then resizing uses a 56px floor; production should probably keep a
  minimum of one cell.
