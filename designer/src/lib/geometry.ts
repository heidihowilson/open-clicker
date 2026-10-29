import { capWidth, KEYCAPS, type Design, type Key } from "./design";
import { DIODE, IR, PCB, SHELL } from "./parts-data";

export interface Point { x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/* Shell rules from the Open Clicker brand book (Hardware): the outline is the key field's
 * bounding box plus a 6 mm margin on the sides and top and a 20 mm chin at the bottom. */
/* The plate is part of the top shell. Choc V1 switches clip into a 1.2 mm plate (Kailh
 * CPG1350 drawing) through a 14 mm square hole. */
export const SHELL_RULES = { margin: 6, chin: 20, fillet: 8, wall: 2, wallMin: 1.6, plate: 1.2, plateCutout: 14 } as const;

/** Heights in mm, with 0 at the top of the circuit board. The shell splits there: the top piece
 * holds the plate and face, the bottom piece holds the board, the battery and the screws. */
export function stack(design: Design) {
  const depth = PCB.thickness + Math.max(1.2 + 4.5, DIODE.height + 0.4 + design.battery.thicknessMm) + 1;
  const base = -depth - SHELL.floor, plateTop = 2.2, face = 3.6 + SHELL.bezel;
  return { base, floorTop: base + SHELL.floor, pcbBottom: -PCB.thickness, split: 0, plateBottom: plateTop - SHELL_RULES.plate, plateTop, face, height: face - base };
}

/* M2 screws, 12 mm, pan head: up through the bottom piece and the board into the top piece,
 * where they cut their own thread (no inserts, no soldering iron). */
export const SCREW = { length: 12, boardHole: 2.2, clearance: 2.4, pilot: 1.6, head: 4.2, headDepth: 2.0, post: 5.5 } as const;

/** Board mounting holes: the two top corners in the margin, and two in the chin, clear of the
 * battery plug, the chin parts, the last row's diodes and the module's antenna keep-out. */
export function mountingHoles(bounds: Bounds): Point[] {
  const { minX, minY, maxX, maxY } = bounds;
  return [
    { x: minX + 4, y: minY + 4 }, { x: maxX - 4, y: minY + 4 },
    { x: minX + 4, y: maxY - 19.5 }, { x: maxX - 4, y: maxY - 23 },
  ];
}

/* The shell's long edges are rounded so it sits softly in the hand (first hand-model print,
 * 2026-10-28). The bottom edge rests in the palm, so it is rounded too; below 45° that round
 * turns into a 45° bevel, which prints flat on the bed with no support. */
export const EDGES = { top: 4, bottom: 4 } as const;

/** How far the shell's side sits inside its plan outline at height z above its lowest
 * point, for a shell `height` tall. Convex, so a hull of slices is the exact body. */
export function edgeInset(z: number, height: number): number {
  const { top, bottom } = EDGES, k = 1 - Math.SQRT1_2;
  if (z < bottom * k) return 2 * bottom * k - z;
  if (z < bottom) return bottom - Math.sqrt(bottom ** 2 - (bottom - z) ** 2);
  const t = z - (height - top);
  return t > 0 ? top - Math.sqrt(Math.max(0, top ** 2 - t ** 2)) : 0;
}

/* The BMD-340 module, from its footprint (origin at the pad-field centre): the body runs
 * x -9.5..5.5 and y ±5.1, the antenna end is the -x end and its RF keep-out is the last
 * 4.4 mm (data sheet figure 12). On the back of the board x mirrors, so the antenna faces +x. */
export const MODULE = { bodyMin: -9.5, bodyMax: 5.5, halfDepth: 5.1, antenna: 4.4 } as const;
/* USB-C receptacle (KiCad's HRO TYPE-C-31-M-12 footprint): the body is ±4.47 × ±3.65 mm
 * about the origin, plug face at +y. */
export const USB_C = { faceMm: 3.65, halfWidth: 4.47 } as const;
/** Narrowest board that fits the chin parts: battery plug, USB-C, two rows of small parts
 * and the module. */
export const CHIN_MIN_WIDTH = 58;
export const CLEARANCE_MM = 0.5;

export function corners(key: Key, widthMm: number, depthMm: number): Point[] {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: key.x + (sx! * widthMm) / 2, y: key.y + (sy! * depthMm) / 2 }));
}

export function keyField(design: Design): Bounds {
  if (design.outline) {
    /* Whole cells: key centres sit on multiples of the pitch, so cell edges are half a pitch out. */
    return { minX: -9, minY: -8.5, maxX: design.outline.cols * 18 - 9, maxY: design.outline.rows * 17 - 8.5 };
  }
  const depth = KEYCAPS[design.keycap].depthMm;
  const pts = design.keys.flatMap((k) => corners(k, capWidth(k.w), depth));
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/* Keys sit on the grid, so two caps collide exactly when their rectangles overlap. */
export function collisions(design: Design): [string, string][] {
  const depth = KEYCAPS[design.keycap].depthMm + CLEARANCE_MM;
  const hits: [string, string][] = [];
  const ks = design.keys;
  for (let i = 0; i < ks.length; i++)
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i]!, b = ks[j]!;
      const dx = Math.abs(a.x - b.x) - (capWidth(a.w) + capWidth(b.w)) / 2 - CLEARANCE_MM;
      const dy = Math.abs(a.y - b.y) - depth;
      if (dx < -1e-6 && dy < -1e-6) hits.push([a.id, b.id]);
    }
  return hits;
}

/* The board is the shell outline less the wall; the PCB sits 0.5 mm inside the wall. Grown,
 * if needed, to hold the chin parts and the battery. */
export function boardBounds(design: Design): Bounds {
  const f = keyField(design);
  let minX = f.minX - SHELL_RULES.margin, maxX = f.maxX + SHELL_RULES.margin;
  const need = Math.max(CHIN_MIN_WIDTH, design.battery.widthMm + 2);
  if (maxX - minX < need) { const c = (minX + maxX) / 2; minX = c - need / 2; maxX = c + need / 2; }
  return { minX, minY: f.minY - SHELL_RULES.margin, maxX, maxY: f.maxY + SHELL_RULES.chin };
}

/** Module footprint origin on the board: bottom-right of the chin, antenna end 0.5 mm in
 * from the right edge, clear of the rounded corner. */
export function modulePlacement(bounds: Bounds): Point {
  return { x: bounds.maxX - 0.5 + MODULE.bodyMin, y: bounds.maxY - 11 };
}

/* Battery sits under the keys, above the chin. */
export function batteryFits(design: Design, bounds: Bounds): boolean {
  const room = bounds.maxY - bounds.minY - SHELL_RULES.chin - 4;
  return design.battery.lengthMm <= room && design.battery.widthMm <= bounds.maxX - bounds.minX - 2;
}

/** No copper under or beside the module's antenna (data sheet §5.2): the antenna end of the
 * module to the board edge, and 5 mm beyond its sides. */
export function keepouts(_design: Design, bounds: Bounds): { minX: number; minY: number; maxX: number; maxY: number; why: string }[] {
  const m = modulePlacement(bounds);
  return [{ minX: m.x - MODULE.bodyMin - MODULE.antenna, maxX: bounds.maxX, minY: m.y - MODULE.halfDepth - 5, maxY: bounds.maxY, why: "BMD-340 antenna" }];
}

/* Grid cell of a key, counting from the top-left of the key field (for "column 2, row 5"). */
export function cellOf(design: Design, key: Key): { col: number; row: number } {
  const f = keyField(design);
  const depth = KEYCAPS[design.keycap].depthMm;
  return { col: Math.round((key.x - capWidth(key.w) / 2 - f.minX) / 18) + 1, row: Math.round((key.y - depth / 2 - f.minY) / 17) + 1 };
}

/* Where the small parts go, shared by the 3D model and the KiCad board. The IR LED and
 * receiver sit on the top edge. The chin holds, left to right along the bottom edge, the
 * battery plug, USB-C and the module, with two rows of small parts above the USB-C. */
export function partSpots(design: Design, bounds: Bounds): Record<string, Point> {
  const cx = (bounds.minX + bounds.maxX) / 2, edge = bounds.minY, bottom = bounds.maxY;
  const ledX = cx - (design.options.irReceive ? 5 : 0), rxX = cx + (design.options.irTransmit ? 5 : 0);
  const module = modulePlacement(bounds);
  const usbX = Math.min(cx, module.x + MODULE.bodyMin - 1 - USB_C.halfWidth);
  /* Rows start clear of the battery plug's courtyard (9.2 mm wide, 2.4 mm in from the edge). */
  const x0 = bounds.minX + 13.6, step = 3.8;
  const row = (y: number, refs: string[]) => Object.fromEntries(refs.map((ref, i) => [ref, { x: x0 + i * step, y }]));
  return {
    U1: module,
    J1: { x: usbX, y: bottom - USB_C.faceMm },
    J2: { x: bounds.minX + 7, y: bottom - 11 },
    ...row(bottom - 16.5, ["U3", "C2", "C3", "R7", "R8", "LED2"]),
    ...row(bottom - 12.5, ["R5", "R6", "R1", "Q1", "R2"]),
    J3: { x: x0 + 5 * step + 4, y: bottom - 12.5 },
    ...Object.fromEntries(mountingHoles(bounds).map((p, i) => [`H${i + 1}`, p])),
    /* Pad line of the side-looker: its lens tip ends 1.25 mm inside the board edge. */
    LED1: { x: ledX, y: edge + 1.25 + IR.led.lensProud + IR.led.depth - IR.led.leadsFromBack },
    U2: { x: rxX, y: edge + 4 },
    C1: { x: rxX + 5.5, y: edge + 3 },
  };
}
