# First-visit onboarding: implementation plan

Owner request, 2026-10-28. Source design: [`SPEC.md`](SPEC.md) and [`prototype.dc.html`](prototype.dc.html) from Claude Design.

The prototype becomes the first thing a visitor sees, with one change from the start:

- The remote is a **3D model shown straight from above**, so it looks 2D.
- **Build or Buy** swings the camera to an angle and explodes the remote into its real parts. Each part is labelled, priced and tappable, as the current designer does it.

That moment is the point of the page: the visitor sees that this is an open design and exactly how it is built.

## Status

2026-10-28: the opening asks "Design your own TV remote." with **Make it mine** (edit) and **It's perfect** (straight to Build or Buy); "Good remote?" confused first testers.

2026-10-28, owner decisions: keep to what one XIAO ESP32-C6 scans (21 keys, so battery-level reporting is off and The Boomer and The Brick are cut to fit, The Brick as a solid 3 × 6 grid); keep the bottom bay for the electronics; DIY gets the files, Kit and Complete collect an email. Steps 1–5 and the files/notify half of step 6 shipped the same day. The keypad-scanner chip is not used.

## 1. What we keep from the prototype

All of it, as written in SPEC.md:

- One object on screen.
- Two questions and one-word buttons.
- The idle timers.
- Jiggle, drag, drag-off-to-delete and the resize grabbers.
- The spare-key tray and the templates behind Start Over.
- The DIY / Kit / Complete list and the copy inventory.
- The new look: Geist, #f5f5f7 ground, black shell, grey, light-grey and red caps.

SPEC.md is the reference for rules. The prototype is the reference for feel.

## 2. What we change

### 2.1 A 3D remote that looks 2D

- One three.js scene with an **orthographic camera** looking straight down.
  - The shell, plate, caps and switches are the real part models from `src/lib/parts.ts`, restyled to the new palette.
  - Flat, even lighting means the caps read like the prototype's two-tone squares. The dish of a real Choc cap gives the lighter top face for free.
- **Pointer input** is a ray onto the plate plane, so screen pixels map straight to millimetres.
  - Snapping, cell occupancy and drag-off-to-delete run in millimetres on the real Choc grid.
- **Jiggle** rotates each key group a few degrees about the vertical axis. From above this is the prototype's 2D wobble, with the same per-key hash for duration, delay and pivot.
- **The grabbers and the tray** are HTML laid over the canvas. With an orthographic top-down camera the mm-to-px mapping is linear, so they line up exactly.
  - The tray drops keys into the scene with the same ray mapping.
- **Zoom** follows SPEC §7 (62 % / 54 % of the viewport height, 0.75–3×, frozen during a resize). In 3D this is the camera's frustum size; the model never scales.

### 2.2 Build or Buy is the 3D moment

1. **About 1.2 s:** the camera eases from straight above to the current three-quarter view. At the same time the remote explodes into purchasable parts only: shell, plate, PCB, controller, battery, switches, caps and IR parts.
2. **Callouts** name each part with its price for the chosen tier.
3. **Tapping a part** dims the rest and flies to it. Tapping again returns. This is the current `Preview3D` behaviour, moved into the new scene.
4. **The tier list** (DIY / Kit / Complete) appears below. Picking a tier updates the callout prices and the total.
5. **Back** reverses the animation: parts close up and the camera returns to straight above.
6. The prototype shrinks the remote on the buy screen. Here the exploded model takes that space instead, at about 45 % of the viewport height.

### 2.3 Way less configuration

The design file shrinks to what the visitor actually touches:

- the shell width and height, in grid cells;
- for each key, its cell and its colour: charcoal, light grey or red.

Everything else is fixed in this version and hidden:

- **Controller:** one, the XIAO ESP32-C6, which runs today's firmware.
- **Switch:** one, the Kailh Choc V1.
- **Keycap:** one, MBK (dimensions verified).
- **Radios:** IR and Bluetooth, always.
- **Battery:** one cell size.
- **Gone from view:** matrix and pin planning, checks, price assumptions, and the KiCad and keymap exports.

The editor makes an invalid remote impossible, so no error ever shows:

- keys only land on free cells;
- the shell only takes sizes that frame whole cells;
- the key count is capped at what the board supports.

**Keys carry no labels** (SPEC §3). A key's function is not part of the design: templates bring default functions, and the user assigns or changes them later on the phone after the remote arrives. The circuit board does not care what a key does, only where it is.

### 2.4 The current designer

It moves to `/studio`, unlinked, as the expert tool and the reference for the 3D parts. It is not deleted. We fold its features back into the new flow one by one, behind progressive disclosure, as options return.

## 3. Hardware this design needs (decisions)

The prototype's templates run into three real limits.

1. **Too many keys for the controller's pins.**
   - The problem: The Boomer has 36 keys and The Brick has 28. A XIAO ESP32-C6 with IR and battery sensing scans about 14 keys as a plain matrix.
   - **Recommendation: put a TCA8418 keypad-scanner chip on every board** (about $1).
     - It scans up to 80 keys over 3 pins and wakes the controller from sleep through its interrupt pin.
     - The pin budget then stops being a design constraint, and diodes per key become unnecessary for a remote.
   - Cost: a small firmware driver, and a 3 × 3 mm chip that the fab must place, so DIY boards ship with it fitted.
2. **Where the controller and battery go.**
   - The problem: the prototype's shells end one margin below the last row, so there is no chin. The controller, battery and USB-C port need about 24 × 21 mm.
   - **Recommendation:** keep a bottom bay of one row plus the margin, drawn in the top-down view as plain shell. It is where the hand grips and where the USB-C port sits. Resizing never removes it.
   - The alternative is to hide the electronics under the keys. That needs switches soldered (no hot-swap sockets) and a placement rule around the controller, which is more complex and less certain.
3. **What Order does.** There is no shop yet.
   - **Recommendation:**
     - DIY: **Order** becomes **Get the files**. It downloads the routed Gerbers from the router (live now) and the shell STL when it exists.
     - Kit and Complete: **Notify me**, an email field posted to the router service.
   - "Ordered." becomes "Files ready." or "You're on the list."

Smaller choices with defaults (say if you want different):

- **Key colours:** charcoal #232325/#39393c, light grey #c6c6cb/#ececf0, red #b8261d/#ff453a, as in SPEC §3. We will need MBK caps that match; samples to confirm.
- **Shell:** black PLA (#161618 look).
- **Switch feel:** Choc V1 Red (linear, quiet).
- **Grid:** one prototype cell is one Choc pitch, 18 × 17 mm. Caps are 17.5 × 16.5 mm, so cells look almost square. The 12 px margin is the 6 mm shell margin.

## 4. Build steps

Each step ships on its own at `openremote.sethgholson.com`; the old designer stays at `/studio` the whole time.

1. **Model and rules** (`src/onboarding/model.ts`):
   - the simplified design file;
   - layouts from SPEC §3.1 converted to cells;
   - snapping, occupancy and shell-size candidates (SPEC §4.3);
   - the key cap from decision 1;
   - pricing from `pricing.ts` for the fixed part set.
   - Unit tests for every rule in SPEC §4.
2. **Top-down scene:** an orthographic camera and flat lights, with the shell, plate and caps built from the model in the new palette. Static at first; checked against the prototype screenshot by screenshot.
3. **Flow and copy:** the intro → edit → buy → done state machine, the headlines and buttons, the rise animations and the idle timers (SPEC §2).
4. **Editing:** jiggle, drag, drag-off-to-delete, resize grabbers, the spare-key tray and the template panel with the morph (SPEC §4, §5.5).
5. **The 3D moment:** the camera swing, the explode, callouts, tap-to-focus, and the tier list with live prices.
6. **Get the files / Notify me:** the router gains the simplified design format and a `/notify` endpoint. The KiCad generator learns the TCA8418 and the bottom bay; all three templates are verified with KiCad and routed.
7. **Responsive and tests:**
   - the side panel and the bottom sheet;
   - the inline or sheet tray at 760 px;
   - the Playwright check at phone, tablet and desktop;
   - plus a scripted run of the whole flow: intro, edit, Build or Buy, explode, tap a part, pick a tier, get the files.

Steps 1–5 give the full experience on screen. Step 6 makes it real hardware; it depends on decisions 1 and 2.

## 5. Not in this version

- Key labels and functions.
- More controllers, switches, caps or colours.
- Checkout.
- Accounts.
- A keyboard-only path for dragging (SPEC §10).

Each one returns later, behind progressive disclosure.
