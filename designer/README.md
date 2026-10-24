# Open Remote Designer

A browser app, drawn as a blueprint, that edits one Open Remote **design file**: the chip, key positions and actions, IR and battery options, and the shell. It checks the design against the chip's pin data while you edit, shows it in 2D and 3D, and exports the design, a keymap JSON, and the firmware `keymap.h`. See [docs/designer.md](../docs/designer.md) for the model.

```sh
bun install
bun run dev      # local editor
bun test test    # planner, geometry and export tests
bun run check    # svelte-check, strict TypeScript
bun run build    # static site in dist/
```

## What it knows

- **Chips** (`src/lib/chips.ts`): XIAO ESP32-C3, ESP32-C6 and nRF52840 pin maps from the Seeed wiki, with wake, ADC and strapping flags. Current figures carry their source; vendor figures are marked, and our own measurements replace them.
- **Pin planner** (`src/lib/matrix.ts`): keys form a diode matrix whose columns are wake pins, so any key wakes the chip. Battery sensing takes an analog pin first, IR parts take plain pins next, and strapping pins are used last.
- **Checks** (`src/lib/checks.ts`): pin budget, keycap overlap (rotated rectangles), profile-switch keys, IR actions without a transmitter, battery fit, and unported firmware.

## 3D model

`src/lib/parts.ts` builds the assembly from published footprints (`src/lib/parts-data.ts` names each source): Kailh Choc V1 posts and pins from Ergogen's footprint, the XIAO outline and 14-pad grid from Seeed's OPL KiCad library, MBK keycap size, SOD-123 diodes, the LiPo, IR parts and a two-part shell. The PCB carries real switch holes. Heights marked approximate wait for calipers. **Explode** separates the layers with labelled callouts; **Solid** switches from blueprint line work to shaded materials. Phones get a tabbed layout.

## Not yet

PCB (KiCad), switch plate, shell and bill-of-materials export. The XIAO footprint, diode placement and routing need checking against the parts in hand before any of it is offered as a manufacturing file.
