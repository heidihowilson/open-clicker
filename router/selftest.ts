/* Run every onboarding layout, plus the studio templates, through the full board pipeline and
 * fail on any check. Runs inside the router image: router/test.sh. */
import { writeFile, mkdir } from "node:fs/promises";
import column from "../designer/src/seeds/column.json";
import deck from "../designer/src/seeds/deck.json";
import slab from "../designer/src/seeds/slab.json";
import tile from "../designer/src/seeds/tile.json";
import { parseDesign, type Design } from "../designer/src/lib/design";
import { fromLayout, LAYOUTS, toDesign } from "../designer/src/onboarding/model";
import { buildBoard } from "./pipeline";

const out = process.argv[2] ?? "/tmp/selftest";
await mkdir(out, { recursive: true });
const cases: [string, Design][] = [
  ...(["streamer", "boomer", "brick"] as const).map((n): [string, Design] => [n, toDesign(fromLayout(LAYOUTS[n]), LAYOUTS[n].name)]),
  ...[tile, slab, deck, column].map((j): [string, Design] => { const d = parseDesign(j); return [d.template, d]; }),
];
let failed = 0;
for (const [name, design] of cases) {
  try {
    const r = await buildBoard(design);
    await writeFile(`${out}/${name}.zip`, r.zip);
    console.log(`ok   ${name}: ${r.report.seconds} s, ${r.report.unrouted} unrouted, ${r.report.gerbers.holes} holes`);
    if (r.report.unrouted) failed++;
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : String(e)}`);
    const detail = (e as { detail?: string[] }).detail;
    if (detail) for (const d of detail) console.log(`     ${d}`);
  }
}
process.exit(failed ? 1 : 0);
