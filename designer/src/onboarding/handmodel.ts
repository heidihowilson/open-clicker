import type { ManifoldToplevel } from "manifold-3d";
import { boardBounds, EDGES, edgeInset, SHELL_RULES } from "../lib/geometry";
import { DIODE, MBK, PCB, SHELL } from "../lib/parts-data";
import { toDesign, type Remote } from "./model";

/* A one-piece hand model: the remote's real outline, thickness and key layout as a solid you
 * can print in an hour and hold. The heights follow the real stack (parts.ts buildShell):
 * the lid's floor up to the face, then each cap at its seat height, sunk into a groove as
 * wide as the face's key opening. Built with Manifold, so the mesh is always watertight. */

const SEGMENTS = 24;
/** Heights in mm, measured from the bottom of the lid. */
export function handHeights(r: Remote) {
  const d = toDesign(r);
  const depth = PCB.thickness + Math.max(1.2 + 4.5, DIODE.height + 0.4 + d.battery.thicknessMm) + 1;
  const bottom = -depth - SHELL.floor, face = 3.6 + SHELL.bezel, cap = MBK.seat + MBK.height;
  return { body: face - bottom, cap: cap - bottom, groove: 1.2 };
}

export interface HandModel { stl: Uint8Array<ArrayBuffer>; volume: number; size: [number, number, number]; positions: Float32Array; indices: Uint32Array }

export function handModel(m: ManifoldToplevel, r: Remote): HandModel {
  const { CrossSection, Manifold } = m;
  const d = toDesign(r), b = boardBounds(d), h = handHeights(r);
  const grow = SHELL_RULES.wall + SHELL.clearance;
  const rounded = (cx: number, cy: number, w: number, dp: number, radius: number) =>
    CrossSection.square([w - 2 * radius, dp - 2 * radius], true).offset(radius, "Round", 2, SEGMENTS).translate([cx, cy]);
  const prism = (s: ReturnType<typeof rounded>, z0: number, z1: number) => s.extrude(z1 - z0).translate([0, 0, z0]);

  const outer = rounded((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, b.maxX - b.minX + 2 * grow, b.maxY - b.minY + 2 * grow, SHELL_RULES.fillet);
  /* The plan outline is convex, so the hull of thin slices along the edge profile is the
   * exact rounded body. */
  const zs = [...new Set([...Array.from({ length: 13 }, (_, i) => (EDGES.bottom * i) / 12), ...Array.from({ length: 13 }, (_, i) => h.body - EDGES.top + (EDGES.top * i) / 12)])];
  let body = Manifold.hull(zs.map((z) => prism(outer.offset(-edgeInset(z, h.body), "Round", 2, SEGMENTS), Math.min(z, h.body - 0.01), Math.min(z, h.body - 0.01) + 0.01)));
  const live = d.keys.filter((k) => k.id !== "placeholder");
  if (live.length) {
    const grooves = Manifold.union(live.map((k) => prism(rounded(k.x, k.y, MBK.width + 1, MBK.depth + 1, 0.6 + 0.5), h.body - h.groove, h.body + 1)));
    const caps = Manifold.union(live.map((k) => prism(rounded(k.x, k.y, MBK.width, MBK.depth, MBK.radius), h.body - h.groove, h.cap)));
    body = body.subtract(grooves).add(caps);
  }
  /* Design y grows down the remote; mirror so the top of the remote is +Y in the file. */
  const solid = body.mirror([0, 1, 0]);
  const mesh = solid.getMesh(), box = solid.boundingBox();
  const stl = binaryStl(mesh.vertProperties, mesh.triVerts, mesh.numProp);
  const positions = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
  for (let i = 0; i < positions.length / 3; i++) for (let j = 0; j < 3; j++) positions[i * 3 + j] = mesh.vertProperties[i * mesh.numProp + j]!;
  return { stl, volume: solid.volume(), size: [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]], positions, indices: mesh.triVerts };
}

function binaryStl(verts: Float32Array, tris: Uint32Array, stride: number): Uint8Array<ArrayBuffer> {
  const n = tris.length / 3, out = new ArrayBuffer(84 + n * 50), v = new DataView(out);
  const header = "Open Clicker hand model, mm";
  for (let i = 0; i < header.length; i++) v.setUint8(i, header.charCodeAt(i));
  v.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50, p = [0, 1, 2].map((j) => tris[t * 3 + j]! * stride);
    const a = [0, 1, 2].map((i) => verts[p[0]! + i]!), bb = [0, 1, 2].map((i) => verts[p[1]! + i]!), c = [0, 1, 2].map((i) => verts[p[2]! + i]!);
    const u = [bb[0]! - a[0]!, bb[1]! - a[1]!, bb[2]! - a[2]!], w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const nx = u[1]! * w[2]! - u[2]! * w[1]!, ny = u[2]! * w[0]! - u[0]! * w[2]!, nz = u[0]! * w[1]! - u[1]! * w[0]!;
    const len = Math.hypot(nx, ny, nz) || 1;
    [nx / len, ny / len, nz / len, ...a, ...bb, ...c].forEach((x, i) => v.setFloat32(o + i * 4, x, true));
  }
  return new Uint8Array(out);
}
