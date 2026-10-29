# Open Clicker designer

A browser app that edits one Open Clicker **design file**: the chip, key positions and actions, IR and battery options, and the shell. It checks the design against the chip's pin data while you edit, shows it in 2D and 3D, and exports a KiCad project (schematic and placed board), the design file, a keymap JSON and the firmware `keymap.h`. See [docs/designer.md](../docs/designer.md) for the model.

```sh
bun install
bun run dev      # local editor
bun test test    # planner, geometry and export tests
bun run check    # svelte-check, strict TypeScript
bun run build    # static site in dist/
```

## Deploy

Live at <https://openremote.sethgholson.com>, served by the celld fleet `openremote` (celld 0.4.0, CT 113, port 8092) as static assets plus `celld/worker.js`, which adds `/health` and sends page paths to `index.html`.

Push `main` to the homelab remote to deploy: `git push homelab main`, where `homelab` is `deploy@192.168.0.19:/srv/git/open-remote.git`. The hook runs `scripts/build-celld.sh` (install, test, build, assemble `.celld/`) and then `celld-release deploy`. A failing test stops the deploy.

## What it knows

- **Chip** (`src/lib/chips.ts`): the u-blox BMD-340 pad table and pin budget from its data sheet, with wake, analog and full-speed flags. Current figures carry their source; vendor figures are marked, and our own measurements replace them.
- **Pin planner** (`src/lib/matrix.ts`): keys form a diode matrix whose columns are wake pins, so any key wakes the chip. Battery sensing takes an analog pin first, IR parts take plain pins next, and strapping pins are used last.
- **Checks** (`src/lib/checks.ts`): pin budget, keycap overlap (rotated rectangles), profile-switch keys, IR actions without a transmitter, battery fit, and unported firmware.

## Look and feel

The tool follows the **Open Clicker** design system in [`docs/brand/`](../docs/brand/README.md): butter shell, an oxblood cluster, one orange power key, ivory commands, Fraunces lettering and Fredoka labels, and the Ivory and Late show themes. `src/ds/` holds its tokens and component styles; `public/legends/` and `public/logo/` hold its glyphs and mark. The layout is the brand book's tool shell: top bar, mode rail (select, move, add key, measure, 3D), viewport, properties and a status strip. The 2D sheet draws at exactly 4 px/mm on the Choc grid.

## 3D model

`src/lib/parts.ts` builds the assembly from published footprints (`src/lib/parts-data.ts` names each source) in the brand colourway: the shell, plate and lid in butter, caps coloured by what the key does, legends from the glyph set and the wordmark on the chin. **Explode** separates it into the units you buy or print, never finer. Tap one to see it with its price; tap again to go back.

## Cost

`src/lib/bom.ts` lists every unit with a quantity and an estimated small-quantity retail price, and each line records its basis. Shell parts are priced by estimated printed mass. The title block shows the total; shipping, tax, solder and tools are excluded.

## Not yet

PCB (KiCad), switch plate, shell and bill-of-materials export. The BMD-340 board, diode placement and routing need checking against the parts in hand before any of it is offered as a manufacturing file.

## KiCad and Gerbers

`src/lib/kicad.ts` writes the schematic and a board spec; the router ([`router/`](../router/README.md))
has KiCad 9 build, route and check the board from published footprints and returns the Gerbers.
`router/test.sh` runs every layout through it.
