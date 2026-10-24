import { KEYCAPS, type Design, type Key } from "./design";

export interface Point { x: number; y: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/* XIAO module outline, mounted on the back with USB-C at the bottom edge. */
export const XIAO = { widthMm: 17.8, lengthMm: 21, heightMm: 3.5 } as const;
export const CLEARANCE_MM = 0.5;

export function corners(key: Key, widthMm: number, depthMm: number): Point[] {
  const a = (key.r * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const dx = (sx! * widthMm) / 2, dy = (sy! * depthMm) / 2;
    return { x: key.x + dx * cos - dy * sin, y: key.y + dx * sin + dy * cos };
  });
}

function project(points: Point[], axis: Point): [number, number] {
  const values = points.map((p) => p.x * axis.x + p.y * axis.y);
  return [Math.min(...values), Math.max(...values)];
}

/* Separating-axis test for two rotated rectangles. */
function overlaps(a: Point[], b: Point[]): boolean {
  for (const shape of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const p = shape[i]!, q = shape[i + 1]!;
      const axis = { x: q.y - p.y, y: p.x - q.x };
      const [amin, amax] = project(a, axis), [bmin, bmax] = project(b, axis);
      if (amax <= bmin || bmax <= amin) return false;
    }
  }
  return true;
}

export function collisions(design: Design): [string, string][] {
  const cap = KEYCAPS[design.keycap];
  const shapes = design.keys.map((k) => ({ id: k.id, pts: corners(k, cap.widthMm + CLEARANCE_MM, cap.depthMm + CLEARANCE_MM) }));
  const hits: [string, string][] = [];
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++)
      if (overlaps(shapes[i]!.pts, shapes[j]!.pts)) hits.push([shapes[i]!.id, shapes[j]!.id]);
  return hits;
}

/* The board is the keycap footprint plus the shell margin, grown to hold the XIAO and battery. */
export function boardBounds(design: Design): Bounds {
  const cap = KEYCAPS[design.keycap];
  const pts = design.keys.flatMap((k) => corners(k, cap.widthMm, cap.depthMm));
  const m = design.shell.marginMm;
  let minX = Math.min(...pts.map((p) => p.x)) - m, maxX = Math.max(...pts.map((p) => p.x)) + m;
  const minY = Math.min(...pts.map((p) => p.y)) - m, maxY = Math.max(...pts.map((p) => p.y)) + m;
  const need = Math.max(XIAO.widthMm, design.battery.widthMm) + 2;
  if (maxX - minX < need) { const c = (minX + maxX) / 2; minX = c - need / 2; maxX = c + need / 2; }
  return { minX, minY, maxX, maxY };
}

export function xiaoPlacement(bounds: Bounds): Point {
  return { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY - XIAO.lengthMm / 2 - 1 };
}

/* Battery sits between the top edge and the XIAO. */
export function batteryFits(design: Design, bounds: Bounds): boolean {
  const room = bounds.maxY - bounds.minY - XIAO.lengthMm - 4;
  return design.battery.lengthMm <= room && design.battery.widthMm <= bounds.maxX - bounds.minX - 2;
}
