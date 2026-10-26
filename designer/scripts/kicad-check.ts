/* Write the KiCad project for every template to a folder, for checking with kicad-cli.
 * Usage: bun scripts/kicad-check.ts <out-dir> */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import column from "../src/seeds/column.json";
import deck from "../src/seeds/deck.json";
import slab from "../src/seeds/slab.json";
import tile from "../src/seeds/tile.json";
import { parseDesign } from "../src/lib/design";
import { kicadProject } from "../src/lib/kicad";
import { zip } from "../src/lib/zip";

const out = process.argv[2] ?? "/tmp/kicad-out";
const ir = (d: ReturnType<typeof parseDesign>) => ({ ...d, name: `${d.name} IR`, options: { irTransmit: true, irReceive: true, batterySense: true } });
for (const d of [tile, slab, deck, column].map((x) => parseDesign(x)).flatMap((d) => d.template === "tile" ? [d, ir(d)] : [d])) {
  const p = kicadProject(d);
  for (const [name, text] of Object.entries(p.files)) { mkdirSync(dirname(join(out, name)), { recursive: true }); writeFileSync(join(out, name), text); }
  writeFileSync(join(out, `${p.name}.zip`), zip(p.files));
  console.log(p.name);
}
