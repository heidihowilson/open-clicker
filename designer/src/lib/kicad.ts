import type { Design } from "./design";
import { boardBounds, partSpots, type Bounds } from "./geometry";
import { netlist, type Netlist, type Part } from "./netlist";
import { DIODE, PCB, XIAO_BOARD } from "./parts-data";

/* KiCad project from a design: the schematic with every part and net, and a board spec that
 * KiCad itself turns into the board (router/board.py), using published footprints only.
 * Everything is derived from the design file, so the same file always gives the same project,
 * uuids included. */

export interface KicadProject { name: string; spec: BoardSpec; files: Record<string, string> }

/* ---------- shared ---------- */

/** Stable uuid from a seed string (FNV-1a, four rounds). */
function uuid(seed: string): string {
  let out = "";
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    out += h.toString(16).padStart(8, "0");
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-8${out.slice(17, 20)}-${out.slice(20, 32)}`;
}
const n = (v: number) => (Math.round(v * 10000) / 10000).toString();
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const font = (size = 1.27) => `(effects (font (size ${n(size)} ${n(size)})))`;

/* ---------- pins and pads, one table per footprint ---------- */


/** XIAO pad numbers: 1–7 are D0–D6, 8–11 D7–D10, then 3V3, GND and 5V (Seeed OPL footprint). */
const XIAO_PAD: Record<string, string> = { D0: "1", D1: "2", D2: "3", D3: "4", D4: "5", D5: "6", D6: "7", D7: "8", D8: "9", D9: "10", D10: "11", "3V3": "12", GND: "13", "5V": "14" };
const XIAO_NAME = Object.fromEntries(Object.entries(XIAO_PAD).map(([name, pad]) => [pad, name]));
const PIN_TO_PAD: Record<string, Record<string, string>> = {
  diode: { K: "1", A: "2" },
  led: { K: "1", A: "2" },
  npn: { B: "1", E: "2", C: "3" },
  tsop: { OUT: "1", GND: "2", VS: "3" },
};

type Kind = "xiao" | "switch" | "diode" | "conn" | "r" | "c" | "led" | "npn" | "tsop";
function kindOf(p: Part): Kind {
  if (p.ref === "U1") return "xiao";
  if (p.ref.startsWith("SW")) return "switch";
  if (/^D\d/.test(p.ref)) return "diode";
  if (p.ref.startsWith("J")) return "conn";
  if (p.ref.startsWith("LED")) return "led";
  if (p.ref.startsWith("Q")) return "npn";
  if (p.ref === "U2") return "tsop";
  if (p.ref.startsWith("C")) return "c";
  return "r";
}
/** Pad number -> net for a part. */
function padNets(p: Part): Map<string, string> {
  const kind = kindOf(p);
  const map = new Map<string, string>();
  for (const [pin, net] of Object.entries(p.pins)) {
    const pad = kind === "xiao" ? XIAO_PAD[pin] : (PIN_TO_PAD[kind]?.[pin] ?? pin);
    if (pad) map.set(pad, net);
  }
  return map;
}

/* ---------- placement on the board ---------- */

function placements(design: Design, list: Netlist, bounds: Bounds): Map<string, { x: number; y: number }> {
  const at = new Map<string, { x: number; y: number }>();
  const keys = new Map(design.keys.map((k) => [k.id, k]));
  for (const p of list.parts) {
    const key = p.keyId ? keys.get(p.keyId) : undefined;
    if (key && p.ref.startsWith("SW")) at.set(p.ref, { x: key.x, y: key.y });
    else if (key) at.set(p.ref, { x: key.x + DIODE.offset.x, y: key.y + DIODE.offset.y });
  }
  for (const [ref, p] of Object.entries(partSpots(design, bounds))) at.set(ref, p);
  return at;
}

/* ---------- board spec: what KiCad builds the board from (router/board.py) ---------- */

export interface SpecPart {
  ref: string; value: string; footprint: string;
  /** Where the part goes, in mm on the board (y down), and which side. */
  x: number; y: number; back: boolean;
  /** "origin" puts the footprint origin there (switches sit on their key centre);
   * "pads" centres the footprint's pads there. */
  align: "origin" | "pads";
  /** Pad number -> net. */
  pads: Record<string, string>;
  /** The schematic symbol's uuid, so KiCad can check the board against the schematic. */
  symbol: string;
  /** Pads that must land at these board positions; KiCad's own flip and rotation are searched
   * until they do, rather than assumed. Used for the XIAO, which hangs under the board. */
  expect?: Record<string, [number, number]>;
}
export interface BoardSpec {
  name: string; revision: number; id: string;
  outline: { minX: number; minY: number; maxX: number; maxY: number; radius: number };
  parts: SpecPart[];
}

const BACK: Kind[] = ["diode", "r", "c", "npn", "conn", "xiao"];

export function boardSpec(design: Design, list: Netlist = netlist(design)): BoardSpec {
  const bounds = boardBounds(design);
  const at = placements(design, list, bounds);
  const parts = list.parts.map((part): SpecPart => {
    const kind = kindOf(part);
    const p = at.get(part.ref) ?? { x: 0, y: 0 };
    const spec: SpecPart = {
      ref: part.ref, value: part.value, footprint: part.footprint, x: p.x, y: p.y,
      back: BACK.includes(kind), align: kind === "switch" ? "origin" : "pads",
      pads: Object.fromEntries(padNets(part)), symbol: uuid(`${design.id}/sym/${part.ref}`),
    };
    /* KiCad gives each unused symbol pin its own net, "unconnected-(U1-D9-Pad10)"; the board
     * carries the same names so the schematic parity check compares like with like. */
    for (const pin of SYMBOLS[kind].pins) {
      if (spec.pads[pin.num] === undefined) spec.pads[pin.num] = `unconnected-(${part.ref}-${pin.name === "~" ? "" : `${pin.name}-`}Pad${pin.num})`;
    }
    if (kind === "xiao") {
      /* The module hangs pads-up under the board with USB-C at the bottom edge: its local
       * (fx, fy) lands at board (x + fy, y + fx). Pad 1 is at local (7.62, -7.62). */
      const X = XIAO_BOARD, to = (fx: number, fy: number): [number, number] => [p.x + fy, p.y + fx];
      spec.expect = { "1": to(X.padRow, -X.padRow), "7": to(-X.padRow, -X.padRow), "14": to(X.padRow, X.padRow) };
    }
    return spec;
  });
  return { name: design.name, revision: design.revision, id: design.id, outline: { ...bounds, radius: PCB.cornerRadius }, parts };
}

/* ---------- schematic ---------- */

interface SymPin { num: string; name: string; x: number; y: number; angle: number }
interface SymDef { id: string; prefix: string; body: string; pins: SymPin[] }

const stroke = (w = 0.254) => `(stroke (width ${w}) (type default))`;
const SYMBOLS: Record<Kind, SymDef> = {
  switch: { id: "SW", prefix: "SW", pins: [{ num: "1", name: "1", x: -5.08, y: 0, angle: 0 }, { num: "2", name: "2", x: 5.08, y: 0, angle: 180 }],
    body: `(polyline (pts (xy -2.54 0) (xy 2.032 1.27)) ${stroke()} (fill (type none))) (circle (center -2.286 0) (radius 0.254) ${stroke()} (fill (type none))) (circle (center 2.286 0) (radius 0.254) ${stroke()} (fill (type none)))` },
  diode: { id: "D", prefix: "D", pins: [{ num: "2", name: "A", x: -5.08, y: 0, angle: 0 }, { num: "1", name: "K", x: 5.08, y: 0, angle: 180 }],
    body: `(polyline (pts (xy -1.27 1.27) (xy -1.27 -1.27) (xy 1.27 0) (xy -1.27 1.27)) ${stroke()} (fill (type none))) (polyline (pts (xy 1.27 1.27) (xy 1.27 -1.27)) ${stroke()} (fill (type none)))` },
  led: { id: "LED", prefix: "LED", pins: [{ num: "2", name: "A", x: -5.08, y: 0, angle: 0 }, { num: "1", name: "K", x: 5.08, y: 0, angle: 180 }],
    body: `(polyline (pts (xy -1.27 1.27) (xy -1.27 -1.27) (xy 1.27 0) (xy -1.27 1.27)) ${stroke()} (fill (type none))) (polyline (pts (xy 1.27 1.27) (xy 1.27 -1.27)) ${stroke()} (fill (type none))) (polyline (pts (xy 0 1.778) (xy 1.27 3.048)) ${stroke()} (fill (type none)))` },
  r: { id: "R", prefix: "R", pins: [{ num: "1", name: "~", x: 0, y: 3.81, angle: 270 }, { num: "2", name: "~", x: 0, y: -3.81, angle: 90 }],
    body: `(rectangle (start -1.016 -2.54) (end 1.016 2.54) ${stroke()} (fill (type none)))` },
  c: { id: "C", prefix: "C", pins: [{ num: "1", name: "~", x: 0, y: 3.81, angle: 270 }, { num: "2", name: "~", x: 0, y: -3.81, angle: 90 }],
    body: `(polyline (pts (xy -2.032 0.762) (xy 2.032 0.762)) ${stroke(0.508)} (fill (type none))) (polyline (pts (xy -2.032 -0.762) (xy 2.032 -0.762)) ${stroke(0.508)} (fill (type none)))` },
  npn: { id: "Q_NPN", prefix: "Q", pins: [{ num: "1", name: "B", x: -5.08, y: 0, angle: 0 }, { num: "3", name: "C", x: 2.54, y: 5.08, angle: 270 }, { num: "2", name: "E", x: 2.54, y: -5.08, angle: 90 }],
    body: `(circle (center 1.27 0) (radius 2.8194) ${stroke()} (fill (type none))) (polyline (pts (xy 0.635 1.905) (xy 0.635 -1.905)) ${stroke(0.508)} (fill (type none))) (polyline (pts (xy 0.635 0.635) (xy 2.54 2.54)) ${stroke()} (fill (type none))) (polyline (pts (xy 0.635 -0.635) (xy 2.54 -2.54)) ${stroke()} (fill (type none))) (polyline (pts (xy -2.54 0) (xy 0.635 0)) ${stroke()} (fill (type none)))` },
  tsop: { id: "IR_Receiver", prefix: "U", pins: [{ num: "1", name: "OUT", x: -7.62, y: 2.54, angle: 0 }, { num: "2", name: "GND", x: -7.62, y: 0, angle: 0 }, { num: "3", name: "VS", x: -7.62, y: -2.54, angle: 0 }],
    body: `(rectangle (start -5.08 5.08) (end 5.08 -5.08) ${stroke()} (fill (type background)))` },
  conn: { id: "Conn_2", prefix: "J", pins: [{ num: "1", name: "1", x: -5.08, y: 1.27, angle: 0 }, { num: "2", name: "2", x: -5.08, y: -1.27, angle: 0 }],
    body: `(rectangle (start -2.54 2.54) (end 1.27 -2.54) ${stroke()} (fill (type background)))` },
  xiao: { id: "XIAO", prefix: "U", body: `(rectangle (start -7.62 10.16) (end 7.62 -10.16) ${stroke()} (fill (type background)))`,
    pins: Array.from({ length: 14 }, (_, i) => i < 7
      ? { num: String(i + 1), name: XIAO_NAME[String(i + 1)]!, x: -10.16, y: 7.62 - i * 2.54, angle: 0 }
      : { num: String(i + 1), name: XIAO_NAME[String(i + 1)]!, x: 10.16, y: -7.62 + (i - 7) * 2.54, angle: 180 }) },
};

function libSymbol(s: SymDef): string {
  const pins = s.pins.map((p) => `      (pin passive line (at ${n(p.x)} ${n(p.y)} ${p.angle}) (length 2.54) (name ${q(p.name)} ${font()}) (number ${q(p.num)} ${font()}))`).join("\n");
  return `    (symbol "OpenClicker:${s.id}" (pin_names (offset 0.762)) (in_bom yes) (on_board yes)
      (property "Reference" ${q(s.prefix)} (at 0 3.81 0) ${font()})
      (property "Value" ${q(s.id)} (at 0 -3.81 0) ${font()})
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))
      (symbol "${s.id}_0_1" ${s.body})
      (symbol "${s.id}_1_1"
${pins}
      )
    )`;
}

/* Parts sit on a 2.54 mm grid; every pin carries a net label, so there are no wires to draw. */
export function kicadSchematic(design: Design, list: Netlist = netlist(design), project = "open-clicker"): string {
  const root = uuid(`${design.id}/root`);
  const used = new Set<Kind>(list.parts.map(kindOf));
  const out: string[] = [];
  const g = (v: number) => Math.round(v / 2.54) * 2.54;
  let col = 0, row = 0;
  const keyStart = { x: 76.2, y: 38.1 };
  const others: Record<string, { x: number; y: number }> = {
    U1: { x: 38.1, y: 50.8 }, J1: { x: 38.1, y: 88.9 }, J2: { x: 38.1, y: 101.6 }, R3: { x: 25.4, y: 127 }, R4: { x: 38.1, y: 127 },
    LED1: { x: 76.2, y: 228.6 }, Q1: { x: 101.6, y: 228.6 }, R1: { x: 63.5, y: 228.6 }, R2: { x: 88.9, y: 241.3 }, U2: { x: 139.7, y: 228.6 }, C1: { x: 165.1, y: 228.6 },
  };
  for (const part of list.parts) {
    const kind = kindOf(part), sym = SYMBOLS[kind];
    let at: { x: number; y: number };
    if (kind === "switch" || kind === "diode") {
      if (kind === "switch") at = { x: keyStart.x + col * 38.1, y: keyStart.y + row * 15.24 };
      else { at = { x: keyStart.x + col * 38.1 + 15.24, y: keyStart.y + row * 15.24 }; if (++col === 8) { col = 0; row++; } }
    } else at = others[part.ref] ?? { x: 25.4, y: 25.4 };
    at = { x: g(at.x), y: g(at.y) };
    const id = uuid(`${design.id}/sym/${part.ref}`);
    const nets = padNets(part);
    out.push(`  (symbol (lib_id "OpenClicker:${sym.id}") (at ${n(at.x)} ${n(at.y)} 0) (unit 1) (in_bom yes) (on_board yes) (dnp no) (uuid ${id})
    (property "Reference" ${q(part.ref)} (at ${n(at.x)} ${n(at.y - 3.81)} 0) ${font()})
    (property "Value" ${q(part.value)} (at ${n(at.x)} ${n(at.y + 3.81)} 0) ${font()})
    (property "Footprint" ${q(part.footprint)} (at ${n(at.x)} ${n(at.y)} 0) (effects (font (size 1.27 1.27)) hide))
    (property "Datasheet" "" (at ${n(at.x)} ${n(at.y)} 0) (effects (font (size 1.27 1.27)) hide))
${sym.pins.map((p) => `    (pin ${q(p.num)} (uuid ${uuid(`${id}/pin/${p.num}`)}))`).join("\n")}
    (instances (project ${q(project)} (path "/${root}" (reference ${q(part.ref)}) (unit 1))))
  )`);
    for (const p of sym.pins) {
      const x = at.x + p.x, y = at.y - p.y;
      const net = nets.get(p.num);
      if (net) out.push(`  (label ${q(net)} (at ${n(x)} ${n(y)} 0) (fields_autoplaced) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid ${uuid(`${id}/label/${p.num}`)}))`);
      else out.push(`  (no_connect (at ${n(x)} ${n(y)}) (uuid ${uuid(`${id}/nc/${p.num}`)}))`);
    }
  }
  return `(kicad_sch (version 20230121) (generator eeschema)
  (uuid ${root})
  (paper "A3")
  (title_block (title ${q(design.name)}) (rev ${q(String(design.revision))}) (company "Open Clicker") (comment 1 ${q(`Design ${design.id}`)}) (comment 2 "Generated by the Open Clicker designer. Do not edit; change the design instead."))
  (lib_symbols
${[...used].map((k) => libSymbol(SYMBOLS[k])).join("\n")}
  )
${out.join("\n")}
  (sheet_instances (path "/" (page "1")))
)
`;
}

/* ---------- project ---------- */

export function kicadProject(design: Design): KicadProject {
  const slug = design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "open-clicker";
  const list = netlist(design);
  const pro = JSON.stringify({ meta: { filename: `${slug}.kicad_pro`, version: 1 }, board: { design_settings: { defaults: {} } }, sheets: [[uuid(`${design.id}/root`), ""]] }, null, 2);
  return {
    name: slug,
    spec: boardSpec(design, list),
    files: {
      [`${slug}/${slug}.kicad_pro`]: pro,
      [`${slug}/${slug}.kicad_sch`]: kicadSchematic(design, list, slug),
      /* The two footprints KiCad does not ship travel with the project. */
      [`${slug}/fp-lib-table`]: `(fp_lib_table\n  (version 7)\n  (lib (name "OpenClicker")(type "KiCad")(uri "\${KIPRJMOD}/OpenClicker.pretty")(options "")(descr "Open Clicker: XIAO and Choc hot-swap footprints"))\n)\n`,
    },
  };
}
