import type { Netlist } from "../designer/src/lib/netlist";

/* JLCPCB assembly files. BOM: one row per part number, with every designator that uses it.
 * CPL (placement): KiCad's own position export of the routed board, under JLCPCB's column
 * names. Footprints that are only copper (the SWD pad) carry no part number and are left out
 * of both. Rotations are KiCad's; JLCPCB shows each part on its preview before the order. */

const csv = (rows: string[][]) => rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";

export function jlcBom(list: Netlist): string {
  const groups = new Map<string, { value: string; footprint: string; refs: string[] }>();
  for (const p of list.parts) {
    if (!p.lcsc) continue;
    const g = groups.get(p.lcsc) ?? { value: p.value, footprint: p.footprint.split(":")[1]!, refs: [] };
    g.refs.push(p.ref);
    groups.set(p.lcsc, g);
  }
  return csv([["Comment", "Designator", "Footprint", "LCSC Part #"], ...[...groups].map(([code, g]) => [g.value, g.refs.join(","), g.footprint, code])]);
}

/* Rotation corrections between KiCad's footprints and JLCPCB's library, from the community
 * table in matthewlai/JLCKicadTools (cpl_rotations_db.csv). Only the packages we use. */
const CORRECTIONS: [RegExp, number][] = [
  [/^SOT-23/, -90],
  [/^USB_C_Receptacle_HRO_TYPE-C-31-M-12/, 180],
  [/^JST_PH_S/, 180],
];
/* The Choc hot-swap footprint (KiSwitch) sits on the front with its socket pads on the back,
 * so KiCad reports it as a top part. JLCPCB's footprint for C5333465, mirrored for the bottom
 * and turned 180°, matches its pads and pin holes, centred 2.5 mm right of and 4.9 mm above
 * the key centre. */
const SOCKET = { pattern: /^SW_Hotswap_Kailh_Choc_V1/, dx: 2.5, dy: 4.9, kicadRotation: 180 };

const mod = (v: number) => ((v % 360) + 360) % 360;
/* JLCPCB's rule for bottom parts since 2022: rotation = 180 - KiCad's rotation. KiCad also
 * turns the other way on the bottom, so a correction is subtracted there. */
function jlcRotation(kicad: number, bottom: boolean, correction: number): number {
  return bottom ? mod(180 - mod(kicad - correction)) : mod(kicad + correction);
}

/** `pos` is `kicad-cli pcb export pos --format csv --units mm --side both`. */
export function jlcCpl(list: Netlist, pos: string): string {
  const placed = new Set(list.parts.filter((p) => p.lcsc).map((p) => p.ref));
  const [head, ...lines] = pos.trim().split("\n").map((l) => l.split(",").map((c) => c.replace(/^"|"$/g, "")));
  const col = (name: string) => head!.indexOf(name);
  const [ref, pkg, x, y, rot, side] = ["Ref", "Package", "PosX", "PosY", "Rot", "Side"].map(col);
  if ([ref, pkg, x, y, rot, side].some((i) => i! < 0)) throw new Error(`Unexpected position file header: ${head!.join(",")}`);
  const fix = (n: number) => n.toFixed(4);
  const rows = lines.filter((l) => placed.has(l[ref!]!)).map((l) => {
    const name = l[pkg!]!, r = Number(l[rot!]);
    if (SOCKET.pattern.test(name)) {
      const a = (r * Math.PI) / 180, cx = SOCKET.dx * Math.cos(a) - SOCKET.dy * Math.sin(a), cy = SOCKET.dx * Math.sin(a) + SOCKET.dy * Math.cos(a);
      return [l[ref!]!, `${fix(Number(l[x!]) + cx)}mm`, `${fix(Number(l[y!]) + cy)}mm`, "Bottom", String(jlcRotation(r + SOCKET.kicadRotation, true, 0))];
    }
    const bottom = l[side!] === "bottom";
    const correction = CORRECTIONS.find(([re]) => re.test(name))?.[1] ?? 0;
    return [l[ref!]!, `${l[x!]}mm`, `${l[y!]}mm`, bottom ? "Bottom" : "Top", String(jlcRotation(r, bottom, correction))];
  });
  const missing = [...placed].filter((r) => !rows.some((row) => row[0] === r));
  if (missing.length) throw new Error(`Parts missing from the placement file: ${missing.join(", ")}`);
  return csv([["Designator", "Mid X", "Mid Y", "Layer", "Rotation"], ...rows]);
}
