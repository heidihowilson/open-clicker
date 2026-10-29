import { capWidth, KEYCAPS, type Design, type Key } from "./design";

export interface Point { x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/* Shell rules from the Open Clicker brand book (Hardware): the outline is the key field's
 * bounding box plus a 6 mm margin on the sides and top and a 20 mm chin at the bottom. */
export const SHELL_RULES = { margin: 6, chin: 20, fillet: 8, wall: 2, wallMin: 1.6, plate: 1.5, plateCutout: 14 } as const;

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

/* XIAO module envelope (Seeed OPL footprint), mounted on the back with USB-C at the bottom
 * edge. Height is the board plus the USB-C receptacle. */
export const XIAO = { widthMm: 17.8, lengthMm: 21, heightMm: 4.5, usbEndMm: 12.05 } as const;
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
 * if needed, to hold the XIAO and battery. */
export function boardBounds(design: Design): Bounds {
  const f = keyField(design);
  let minX = f.minX - SHELL_RULES.margin, maxX = f.maxX + SHELL_RULES.margin;
  const need = Math.max(XIAO.widthMm, design.battery.widthMm) + 2;
  if (maxX - minX < need) { const c = (minX + maxX) / 2; minX = c - need / 2; maxX = c + need / 2; }
  return { minX, minY: f.minY - SHELL_RULES.margin, maxX, maxY: f.maxY + SHELL_RULES.chin };
}

export function xiaoPlacement(bounds: Bounds): Point {
  /* Footprint origin, placed so the USB-C face sits flush with the board edge. */
  return { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY - XIAO.usbEndMm };
}

/* Battery sits between the top edge and the XIAO. */
export function batteryFits(design: Design, bounds: Bounds): boolean {
  const room = bounds.maxY - bounds.minY - XIAO.lengthMm - 4;
  return design.battery.lengthMm <= room && design.battery.widthMm <= bounds.maxX - bounds.minX - 2;
}

/* Grid cell of a key, counting from the top-left of the key field (for "column 2, row 5"). */
export function cellOf(design: Design, key: Key): { col: number; row: number } {
  const f = keyField(design);
  const depth = KEYCAPS[design.keycap].depthMm;
  return { col: Math.round((key.x - capWidth(key.w) / 2 - f.minX) / 18) + 1, row: Math.round((key.y - depth / 2 - f.minY) / 17) + 1 };
}

/* Where the small parts go, shared by the 3D model and the KiCad board. The IR LED and
 * receiver sit on the top edge; everything else sits in the chin beside the XIAO, clear of
 * the switch sockets. */
export function partSpots(design: Design, bounds: Bounds): Record<string, Point> {
  const xiao = xiaoPlacement(bounds);
  const cx = (bounds.minX + bounds.maxX) / 2, edge = bounds.minY;
  const side = XIAO.widthMm / 2 + 3.5;
  const ledX = cx - (design.options.irReceive ? 5 : 0), rxX = cx + (design.options.irTransmit ? 5 : 0);
  return {
    U1: xiao,
    J1: { x: xiao.x - side, y: xiao.y - 4 },
    J2: { x: xiao.x - side, y: xiao.y + 4 },
    R3: { x: xiao.x + side, y: xiao.y - 2 },
    R4: { x: xiao.x + side, y: xiao.y + 2 },
    LED1: { x: ledX, y: edge + 3 },
    R1: { x: xiao.x + side + 5, y: xiao.y - 5 },
    Q1: { x: xiao.x + side + 5, y: xiao.y - 1 },
    R2: { x: xiao.x + side + 5, y: xiao.y + 3 },
    U2: { x: rxX, y: edge + 4 },
    C1: { x: rxX + 5.5, y: edge + 3 },
  };
}
