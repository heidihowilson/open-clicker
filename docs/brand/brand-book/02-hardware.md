# Hardware

The physical language is what makes a remote recognisably Open Clicker before the mark is visible: a butter-yellow slab with soft, appliance-rounded edges, sculpted keycaps in ivory and oxblood on a grid, one burnt-orange key, and the wordmark on the chin. Every value here is a token in the `hardware` family; the enclosure generator reads them and the printability check enforces them.

## The grid

- Keys sit on `pitch-mx` (19.05 mm). Choc builds use `pitch-choc-x` × `pitch-choc-y` (18 × 17 mm). A layout is one or the other; the tool will not mix them.
- A 1u keycap is `cap-1u` (18 mm) with a `cap-fillet` of 2 mm. Wider keys are 1.5u and 2u on the same pitch; nothing taller than 1u, and no rotated keys. A layout is a rectangle of cells with some cells empty — the Tile's cluster has empty corners on purpose.
- The shell outline is the bounding box of the key field plus `shell-margin` (6 mm) on the sides and top and `shell-chin` (20 mm) at the bottom, corners rounded at `shell-fillet` (8 mm). The outline follows the keys; it is never a freeform shape.

## The shell

- Three printed parts: **shell** (the body, open at the back), **plate** (the switch plate, `plate-thickness` 1.5 mm, cutouts `plate-cutout` 14 mm square), **lid** (the back, `floor` 1.2 mm, sliding battery door optional).
- Walls are `wall` (2 mm). The tool refuses anything under `wall-min` (1.6 mm) and marks it `alert`.
- Every edge is round. Corners in plan are `shell-fillet` (8 mm); the edge where the face meets the sides is `shell-edge-fillet` (3 mm). The shell prints face-up with its open back on the bed, so those face fillets are convex and print clean; the lid prints flat. No overhang steeper than `overhang-max` (45°) anywhere on the three parts, no supports, at `layer-height` 0.2 mm and `nozzle` 0.4 mm.
- Fasteners are M2 heat-set inserts (`insert-m2-bore` 3.2 mm, `insert-m2-depth` 4 mm, 6 mm bosses) in the four corners of the shell, inside the margin and the chin so no key cell is ever taken; the lid takes four `screw-m2` from the back with their heads showing, like the base of a kitchen appliance. Nothing is glued and nothing snaps closed permanently.
- Tolerances: `fit-press` (0.1 mm per side) for switches into a printed plate; `fit-slide` (0.25 mm per side) for the lid and the battery door.
- The IR window is a `ir-window-w` × `ir-window-h` (6 × 2 mm) slot centred on the top edge, present only on IR and BT + IR builds. It is the only external cue a configuration leaves. Bluetooth-only shells have an unbroken top edge.
- The USB-C port for charging and flashing sits on the bottom edge, centred. The ESP32 bay, the battery bay and the port are fixed by the generator; the user moves keys, not electronics.

## The face and the back

- **The chin.** The 20 mm bezel below the key field carries the wordmark — "Open" over "Clicker", `wordmark-h` 5 mm cap height, oxblood, debossed 0.4 mm and filled or printed in a second colour, left-aligned with the key field. Nothing else goes on the face.
- **The back badge.** An ivory label plate, `badge-w` × `badge-h` (40 × 20 mm), recessed 0.4 mm into the lid, carrying the two-colour mark on the left, a thin oxblood rule, and OPEN SOURCE / MIT LICENSE in `caption` on the right. It is a sticker on kits and a two-colour print on assembled units.

## Keycaps and legends

- Caps are sculpted, not flat: a cylindrical dish of `cap-dish` (0.8 mm) across the top, so a thumb finds the key without looking. Any MX-stem cap in a sculpted profile works; the generator emits printable 1u, 1.5u and 2u caps with the same dish and `cap-fillet`.
- **Cap colour says what a key does.** Ivory (`ivory`) for commands; oxblood (`oxblood`) for the cluster — the four arrows and OK; burnt orange (`orange`) for the power key, and nothing else. A remote with no power key has no orange key. Never a second orange key, never oxblood outside the cluster, never a butter cap.
- Legends are either a glyph from `assets/Legends` at `legend-glyph` (6 mm) or text in Fredoka uppercase at `legend-cap-height` (3 mm). Four characters at most on 1u. Legend colour is oxblood on ivory caps, ivory on oxblood and orange caps; on printed caps, a 0.4 mm deboss filled with the legend colour, or a two-colour print.

## Colourway

There is one colourway, and it is the brand:

| Part | Colour |
| --- | --- |
| Shell, plate, lid | `butter` |
| Command caps | `ivory` |
| Cluster caps (arrows, OK) | `oxblood` |
| Power cap | `orange` |
| Legends | `oxblood` on ivory, `ivory` on oxblood and orange |
| Wordmark on the chin | `oxblood` |
| Back badge | `ivory` plate, two-colour mark, `oxblood` lettering |

Matte PLA or PETG only; silk, glitter and transparent filaments are off-brand. Users print whatever they like — that is the point — but official photography shows this one.

## Electronics (fixed by the generator)

- Controller: an ESP32-C3 or ESP32-S3 module footprint; the user picks the module, the generator places it.
- Power: a single Li-Po with a USB-C charger, or 2×AAA on IR-only builds.
- Switches: MX-compatible or Kailh Choc v1, hot-swap sockets by default so a kit needs no switch soldering.
- The PCB is `pcb-thickness` 1.6 mm, outline 0.5 mm inside the shell wall, with the four corner bosses passing through it.
