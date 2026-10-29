import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { binaryStl } from "../onboarding/handmodel";
import { capWidth, KEYCAPS, type Design } from "./design";
import { boardBounds, EDGES, edgeInset, mountingHoles, partSpots, SCREW, SHELL_RULES, stack, USB_C } from "./geometry";
import { IR, SHELL } from "./parts-data";

/* The printable shell: two pieces that split at the top of the circuit board.
 *
 * Top piece, printed face up, flat on the bed: the face with a pocket for each keycap's travel,
 * the 1.2 mm switch plate the Choc switches clip into, clip room under the plate, and four pilot
 * holes the screws cut their thread into.
 *
 * Bottom piece, printed floor down: walls and floor, four posts the board rests on, screw holes
 * with recessed heads, the USB-C opening, a low fence that keeps the cell in place and a small
 * window under the charging light.
 *
 * The outer surface is one edge profile across both pieces (geometry.ts edgeInset), so the seam
 * disappears into the side. Built with Manifold, so both meshes are always watertight. Neither
 * piece needs supports. */

const SEGMENTS = 32;
const CLIP_ROOM = 15;   /* the switch's bottom housing (13.8 mm) and its clips, under the plate */
const CAP_GAP = 0.5;    /* keycap to pocket wall, each side */

export interface Enclosure { top: Manifold; bottom: Manifold }

export function enclosure(m: ManifoldToplevel, design: Design): Enclosure {
  const { CrossSection: CS, Manifold: M } = m;
  const b = boardBounds(design), h = stack(design), spots = partSpots(design, b);
  const grow = SHELL_RULES.wall + SHELL.clearance;
  const rounded = (cx: number, cy: number, w: number, d: number, r: number): CrossSection => {
    const rr = Math.max(0.01, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
    return CS.square([w - 2 * rr, d - 2 * rr], true).offset(rr, "Round", 2, SEGMENTS).translate([cx, cy]);
  };
  const prism = (s: CrossSection, z0: number, z1: number) => s.extrude(z1 - z0).translate([0, 0, z0]);
  const disc = (x: number, y: number, d: number, z0: number, z1: number) => M.cylinder(z1 - z0, d / 2, d / 2, SEGMENTS).translate([x, y, z0]);
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const outer = rounded(cx, cy, b.maxX - b.minX + 2 * grow, b.maxY - b.minY + 2 * grow, SHELL_RULES.fillet);

  /* The outer body between two heights: a hull of thin slices along the edge profile. */
  const body = (z0: number, z1: number) => {
    const zs = new Set([z0, z1]);
    for (let i = 0; i <= 24; i++) for (const z of [h.base + (EDGES.bottom * i) / 24, h.face - EDGES.top + (EDGES.top * i) / 24]) if (z > z0 && z < z1) zs.add(z);
    return M.hull([...zs].map((z) => {
      const at = Math.min(Math.max(z, z0), z1 - 0.01);
      return prism(outer.offset(-edgeInset(at - h.base, h.height), "Round", 2, SEGMENTS), at, at + 0.01);
    }));
  };

  const holes = mountingHoles(b);
  const keys = design.keys.filter((k) => k.id !== "placeholder");

  /* ---- top piece ---- */
  const topCuts: Manifold[] = [];
  for (const k of keys) {
    topCuts.push(prism(rounded(k.x, k.y, CLIP_ROOM, CLIP_ROOM, 0.5), h.split - 1, h.plateBottom));
    topCuts.push(prism(rounded(k.x, k.y, SHELL_RULES.plateCutout, SHELL_RULES.plateCutout, 0.3), h.plateBottom - 0.01, h.plateTop + 0.01));
    topCuts.push(prism(rounded(k.x, k.y, capWidth(k.w) + 2 * CAP_GAP, KEYCAPS[design.keycap].depthMm + 2 * CAP_GAP, 1.1), h.plateTop, h.face + 1));
  }
  for (const p of holes) topCuts.push(disc(p.x, p.y, SCREW.pilot, h.split - 1, h.face - 0.6));
  if (design.options.irTransmit && spots.LED1) topCuts.push(disc(spots.LED1.x, spots.LED1.y, IR.ledDiameter + 0.4, h.split - 1, h.face + 1));
  if (design.options.irReceive && spots.U2) topCuts.push(prism(rounded(spots.U2.x, spots.U2.y, IR.receiver.width + 0.6, IR.receiver.depth + 0.6, 0.3), h.split - 1, h.face + 1));
  const top = body(h.split, h.face).subtract(M.union(topCuts));

  /* ---- bottom piece ---- */
  const cavity = prism(rounded(cx, cy, b.maxX - b.minX + 2 * SHELL.clearance, b.maxY - b.minY + 2 * SHELL.clearance, SHELL_RULES.fillet - grow + SHELL.clearance), h.floorTop, h.split + 1);
  let bottom = body(h.base, h.split).subtract(cavity);
  bottom = bottom.add(M.union(holes.map((p) => disc(p.x, p.y, SCREW.post, h.floorTop - 0.01, h.pcbBottom))));
  /* The cell: a 1 mm fence, 1.5 mm tall, open at the end facing the chin for its lead. */
  const cell = design.battery, cellY = b.maxY - SHELL_RULES.chin - 4.5 - cell.lengthMm / 2;
  const fence = prism(rounded(cx, cellY, cell.widthMm + 3, cell.lengthMm + 3, 1.5), h.floorTop - 0.01, h.floorTop + 1.5)
    .subtract(prism(rounded(cx, cellY, cell.widthMm + 1, cell.lengthMm + 1, 1), h.floorTop - 1, h.floorTop + 2))
    .subtract(prism(rounded(cx, cellY + cell.lengthMm / 2, 8, 6, 0.5), h.floorTop - 1, h.floorTop + 2));
  bottom = bottom.add(fence);
  const bottomCuts: Manifold[] = [];
  for (const p of holes) {
    bottomCuts.push(disc(p.x, p.y, SCREW.clearance, h.base - 1, h.pcbBottom + 0.01));
    bottomCuts.push(disc(p.x, p.y, SCREW.head, h.base - 1, h.base + SCREW.headDepth));
  }
  /* USB-C opening: the receptacle hangs under the board at the bottom edge. */
  const usb = spots.J1!;
  bottomCuts.push(prism(rounded(usb.x, b.maxY + grow / 2 + 2, 2 * USB_C.halfWidth + 0.8, grow + 6, 0.4), h.pcbBottom - 3.26 - 0.4, h.pcbBottom + 0.01));
  /* Window under the charging light. */
  if (spots.LED2) bottomCuts.push(disc(spots.LED2.x, spots.LED2.y, 2, h.base - 1, h.floorTop + 0.01));
  bottom = bottom.subtract(M.union(bottomCuts));

  return { top, bottom };
}

/** Manifold outside the browser (the router). Imported from here so it resolves from designer/. */
export async function loadManifold(): Promise<ManifoldToplevel> {
  const { default: Module } = await import("manifold-3d");
  const m = await Module();
  m.setup();
  return m;
}

/** Both pieces as STL, placed for printing: each sits on its flat side at z = 0, top of the remote toward +Y. */
export function enclosureStl(e: Enclosure): { top: Uint8Array<ArrayBuffer>; bottom: Uint8Array<ArrayBuffer> } {
  const stl = (piece: Manifold) => {
    const solid = piece.mirror([0, 1, 0]), box = solid.boundingBox();
    const placed = solid.translate([0, 0, -box.min[2]]);
    const mesh = placed.getMesh();
    return binaryStl(mesh.vertProperties, mesh.triVerts, mesh.numProp);
  };
  return { top: stl(e.top), bottom: stl(e.bottom) };
}

export const PRINT_NOTES = `Open Clicker shell: two pieces, no supports.

shell-top.stl     Print flat side down (as exported). The face, the keycap pockets and the
                  1.2 mm switch plate are one piece.
shell-bottom.stl  Print floor down (as exported).

Suggested: PLA or PETG, 0.2 mm layers, 3 walls, 15 % infill. The plate is 1.2 mm thick;
print it at 0.2 mm layers so the Choc switches clip in firmly.

Assembly:
1. Clip the switches into the top piece from below, then press the board onto their pins.
2. Plug the battery into the board and lay the cell inside the fence in the bottom piece.
3. Close the pieces and drive four M2 x 12 mm pan-head screws up through the bottom piece and
   the board into the top piece. They cut their own thread: snug, not tight.
4. Press the keycaps onto the switches.
`;
