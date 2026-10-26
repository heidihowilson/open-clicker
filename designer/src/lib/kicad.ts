import type { Design } from "./design";
import { boardBounds, partSpots, type Bounds } from "./geometry";
import { netlist, type Netlist, type Part } from "./netlist";
import { CHOC, DIODE, PCB, XIAO_BOARD } from "./parts-data";

/* KiCad 7 project from a design: a schematic with every part and net, and a board with every
 * footprint placed and every pad on its net. Traces are left to the builder (or an
 * autorouter). Everything is derived from the design file, so the same file always gives the
 * same project, uuids included. KiCad 8 and 9 open these files and upgrade them. */

export interface KicadProject { name: string; files: Record<string, string> }

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

interface Pad { num: string; kind: "smd" | "thru_hole" | "np_thru_hole"; shape: "rect" | "circle" | "oval" | "roundrect"; x: number; y: number; w: number; h: number; drill?: number; back?: boolean }

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

/* Pads in board orientation, relative to the footprint origin, so no footprint is rotated or
 * mirrored. Back-side SMD pads sit on B.Cu inside a front footprint, as Ergogen does. */
function padsFor(kind: Kind): Pad[] {
  switch (kind) {
    case "switch": return [
      /* Kailh Choc hot-swap socket on the back (Ergogen choc.js). */
      { num: "", kind: "np_thru_hole", shape: "circle", x: 0, y: 0, w: CHOC.centerPost.diameter, h: CHOC.centerPost.diameter, drill: CHOC.centerPost.diameter },
      { num: "", kind: "np_thru_hole", shape: "circle", x: -CHOC.sidePosts.x, y: 0, w: CHOC.sidePosts.diameter, h: CHOC.sidePosts.diameter, drill: CHOC.sidePosts.diameter },
      { num: "", kind: "np_thru_hole", shape: "circle", x: CHOC.sidePosts.x, y: 0, w: CHOC.sidePosts.diameter, h: CHOC.sidePosts.diameter, drill: CHOC.sidePosts.diameter },
      { num: "", kind: "np_thru_hole", shape: "circle", x: 0, y: -5.95, w: 3, h: 3, drill: 3 },
      { num: "", kind: "np_thru_hole", shape: "circle", x: 5, y: -3.75, w: 3, h: 3, drill: 3 },
      { num: "1", kind: "smd", shape: "rect", x: -3.275, y: -5.95, w: 2.6, h: 2.6, back: true },
      { num: "2", kind: "smd", shape: "rect", x: 8.275, y: -3.75, w: 2.6, h: 2.6, back: true },
    ];
    case "diode": return [
      { num: "1", kind: "smd", shape: "roundrect", x: -1.65, y: 0, w: 0.9, h: 1.2, back: true },
      { num: "2", kind: "smd", shape: "roundrect", x: 1.65, y: 0, w: 0.9, h: 1.2, back: true },
    ];
    case "r": case "c": return [
      { num: "1", kind: "smd", shape: "roundrect", x: -0.9125, y: 0, w: 1.025, h: 1.4, back: true },
      { num: "2", kind: "smd", shape: "roundrect", x: 0.9125, y: 0, w: 1.025, h: 1.4, back: true },
    ];
    case "npn": return [
      { num: "1", kind: "smd", shape: "roundrect", x: -0.9375, y: -0.95, w: 1.325, h: 0.6, back: true },
      { num: "2", kind: "smd", shape: "roundrect", x: -0.9375, y: 0.95, w: 1.325, h: 0.6, back: true },
      { num: "3", kind: "smd", shape: "roundrect", x: 0.9375, y: 0, w: 1.325, h: 0.6, back: true },
    ];
    case "conn": return [
      { num: "1", kind: "thru_hole", shape: "rect", x: -1, y: 0, w: 1.2, h: 1.75, drill: 0.75 },
      { num: "2", kind: "thru_hole", shape: "oval", x: 1, y: 0, w: 1.2, h: 1.75, drill: 0.75 },
    ];
    case "led": return [
      { num: "1", kind: "thru_hole", shape: "rect", x: -1.27, y: 0, w: 1.8, h: 1.8, drill: 0.9 },
      { num: "2", kind: "thru_hole", shape: "circle", x: 1.27, y: 0, w: 1.8, h: 1.8, drill: 0.9 },
    ];
    case "tsop": return [
      { num: "1", kind: "thru_hole", shape: "rect", x: -2.54, y: 0, w: 1.5, h: 1.5, drill: 0.8 },
      { num: "2", kind: "thru_hole", shape: "circle", x: 0, y: 0, w: 1.5, h: 1.5, drill: 0.8 },
      { num: "3", kind: "thru_hole", shape: "circle", x: 2.54, y: 0, w: 1.5, h: 1.5, drill: 0.8 },
    ];
    case "xiao": {
      /* Module local frame (OPL): USB-C at +x, pad 1 at (7.62, -7.62). It hangs pads-up under the
       * board with USB-C at the bottom edge, which maps local (fx, fy) to board (fy, fx). */
      const X = XIAO_BOARD;
      const pads: Pad[] = [];
      for (let i = 0; i < 14; i++) {
        const fx = i < 7 ? X.padRow - i * X.padPitch : -X.padRow + (i - 7) * X.padPitch;
        const fy = i < 7 ? -X.padRow : X.padRow;
        pads.push({ num: String(i + 1), kind: "thru_hole", shape: i === 0 ? "rect" : "circle", x: fy, y: fx, w: X.padDiameter + 0.2, h: X.padDiameter + 0.2, drill: X.padDrill + 0.1 });
      }
      return pads;
    }
  }
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

/* ---------- board ---------- */

const LAYERS = `(layers
    (0 "F.Cu" signal) (31 "B.Cu" signal) (32 "B.Adhes" user "B.Adhesive") (33 "F.Adhes" user "F.Adhesive")
    (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user "B.Silkscreen") (37 "F.SilkS" user "F.Silkscreen")
    (38 "B.Mask" user) (39 "F.Mask" user) (40 "Dwgs.User" user "User.Drawings") (41 "Cmts.User" user "User.Comments")
    (42 "Eco1.User" user "User.Eco1") (43 "Eco2.User" user "User.Eco2") (44 "Edge.Cuts" user) (45 "Margin" user)
    (46 "B.CrtYd" user "B.Courtyard") (47 "F.CrtYd" user "F.Courtyard") (48 "B.Fab" user) (49 "F.Fab" user)
  )`;

function outline(b: Bounds): string {
  const r = PCB.cornerRadius, s = Math.SQRT1_2;
  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    out.push(`  (gr_line (start ${n(x1)} ${n(y1)}) (end ${n(x2)} ${n(y2)}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts") (tstamp ${uuid(`edge${out.length}`)}))`);
  const arc = (cx: number, cy: number, a0: [number, number], mid: [number, number], a1: [number, number]) =>
    out.push(`  (gr_arc (start ${n(cx + a0[0] * r)} ${n(cy + a0[1] * r)}) (mid ${n(cx + mid[0] * r)} ${n(cy + mid[1] * r)}) (end ${n(cx + a1[0] * r)} ${n(cy + a1[1] * r)}) (stroke (width 0.1) (type default)) (layer "Edge.Cuts") (tstamp ${uuid(`edge${out.length}`)}))`);
  line(b.minX + r, b.minY, b.maxX - r, b.minY);
  arc(b.maxX - r, b.minY + r, [0, -1], [s, -s], [1, 0]);
  line(b.maxX, b.minY + r, b.maxX, b.maxY - r);
  arc(b.maxX - r, b.maxY - r, [1, 0], [s, s], [0, 1]);
  line(b.maxX - r, b.maxY, b.minX + r, b.maxY);
  arc(b.minX + r, b.maxY - r, [0, 1], [-s, s], [-1, 0]);
  line(b.minX, b.maxY - r, b.minX, b.minY + r);
  arc(b.minX + r, b.minY + r, [-1, 0], [-s, -s], [0, -1]);
  return out.join("\n");
}

function padLine(pad: Pad, net: { id: number; name: string } | null, seed: string): string {
  const copper = pad.kind === "smd"
    ? (pad.back ? `"B.Cu" "B.Paste" "B.Mask"` : `"F.Cu" "F.Paste" "F.Mask"`)
    : `"*.Cu" "*.Mask"`;
  const drill = pad.drill !== undefined ? ` (drill ${n(pad.drill)})` : "";
  const round = pad.shape === "roundrect" ? " (roundrect_rratio 0.25)" : "";
  const netPart = net ? ` (net ${net.id} ${q(net.name)})` : "";
  return `    (pad ${q(pad.num)} ${pad.kind} ${pad.shape} (at ${n(pad.x)} ${n(pad.y)}) (size ${n(pad.w)} ${n(pad.h)})${drill} (layers ${copper})${round}${netPart} (tstamp ${uuid(seed)}))`;
}

function courtyard(pads: Pad[], kind: Kind): { x0: number; y0: number; x1: number; y1: number; back: boolean } {
  if (kind === "switch") return { x0: -7.5, y0: -7.5, x1: 7.5, y1: 7.5, back: false };
  if (kind === "xiao") return { x0: -XIAO_BOARD.halfWidth, y0: XIAO_BOARD.minX, x1: XIAO_BOARD.halfWidth, y1: XIAO_BOARD.maxX + XIAO_BOARD.usb.overhang, back: true };
  const xs = pads.flatMap((p) => [p.x - p.w / 2, p.x + p.w / 2]), ys = pads.flatMap((p) => [p.y - p.h / 2, p.y + p.h / 2]);
  return { x0: Math.min(...xs) - 0.25, y0: Math.min(...ys) - 0.25, x1: Math.max(...xs) + 0.25, y1: Math.max(...ys) + 0.25, back: pads.every((p) => p.back) };
}

export function kicadPcb(design: Design, list: Netlist = netlist(design)): string {
  const bounds = boardBounds(design);
  const nets = list.nets.map((name, i) => ({ id: i + 1, name }));
  const netId = new Map(nets.map((x) => [x.name, x]));
  const at = placements(design, list, bounds);
  const footprints = list.parts.map((part) => {
    const kind = kindOf(part);
    const pads = padsFor(kind);
    const nets = padNets(part);
    const p = at.get(part.ref) ?? { x: 0, y: 0 };
    const cy = courtyard(pads, kind);
    const silk = cy.back ? "B.SilkS" : "F.SilkS";
    const mirror = cy.back ? " (justify mirror)" : "";
    const sym = uuid(`${design.id}/sym/${part.ref}`);
    return `  (footprint ${q(part.footprint)} (layer "F.Cu") (tstamp ${uuid(`${design.id}/fp/${part.ref}`)}) (at ${n(p.x)} ${n(p.y)})
    (path "/${sym}")
    (attr ${kind === "switch" || kind === "xiao" || kind === "conn" || kind === "led" || kind === "tsop" ? "through_hole" : "smd"})
    (fp_text reference ${q(part.ref)} (at 0 ${n(cy.y0 - 0.8)}) (layer ${q(silk)}) (tstamp ${uuid(`${design.id}/ref/${part.ref}`)}) (effects (font (size 0.8 0.8) (thickness 0.12))${mirror}))
    (fp_text value ${q(part.value)} (at 0 ${n(cy.y1 + 0.8)}) (layer "F.Fab") (tstamp ${uuid(`${design.id}/val/${part.ref}`)}) (effects (font (size 0.8 0.8) (thickness 0.12))))
    (fp_rect (start ${n(cy.x0)} ${n(cy.y0)}) (end ${n(cy.x1)} ${n(cy.y1)}) (stroke (width 0.05) (type default)) (fill none) (layer ${cy.back ? '"B.CrtYd"' : '"F.CrtYd"'}) (tstamp ${uuid(`${design.id}/cy/${part.ref}`)}))
${pads.map((pad, i) => padLine(pad, pad.num ? (netId.get(nets.get(pad.num) ?? "") ?? null) : null, `${design.id}/pad/${part.ref}/${i}`)).join("\n")}
  )`;
  }).join("\n");

  return `(kicad_pcb (version 20221018) (generator open_clicker)
  (general (thickness 1.6))
  (paper "A4")
  (title_block (title ${q(design.name)}) (rev ${q(String(design.revision))}) (company "Open Clicker") (comment 1 ${q(`Design ${design.id}`)}) (comment 2 "Generated by the Open Clicker designer. Placement only; route the traces."))
  ${LAYERS}
  (setup (pad_to_mask_clearance 0))
  (net 0 "")
${nets.map((x) => `  (net ${x.id} ${q(x.name)})`).join("\n")}
${footprints}
${outline(bounds)}
)
`;
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
    files: {
      [`${slug}/${slug}.kicad_pro`]: pro,
      [`${slug}/${slug}.kicad_sch`]: kicadSchematic(design, list, slug),
      [`${slug}/${slug}.kicad_pcb`]: kicadPcb(design, list),
      [`${slug}/README.txt`]: `${design.name}, revision ${design.revision}. Generated by the Open Clicker designer from design ${design.id}.\n\nThe schematic and the board are complete: every part is placed and every pad is on its net. Route the traces in KiCad (or with Freerouting), run DRC, then export Gerbers.\n\nSwitch sockets, diodes and the IR driver sit on the back. The XIAO hangs under the board with USB-C at the bottom edge; solder two short wires from J2 to its BAT pads.\n`,
    },
  };
}
