import type { CrossSection, Manifold, ManifoldToplevel } from "manifold-3d";
import { binaryStl } from "../onboarding/handmodel";
import { bambuProject } from "./bambu";
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
/* The seam: a lip on the bottom piece's inner wall that seats in a groove under the top piece,
 * so the halves only close one way and line up exactly. */
export const LIP = { thickness: 0.9, height: 1.4, gap: 0.15 } as const;
/* Clips: a rounded bump on the outside of the lip, mid-height, that snaps into a dimple in the
 * groove. The bump stands 0.3 mm proud and the groove leaves 0.15 mm, so the lip flexes 0.15 mm
 * going in and the halves hold by friction. Two per long side, where the lip flexes most. */
/* The IR window in the front wall: the lens is Ø1.5 with a ±25° beam. */
const IR_WINDOW = 3;
export const CLIP = { length: 8, radius: 0.6, proud: 0.3, z: 0.7 } as const;

export interface Enclosure { top: Manifold; bottom: Manifold; /** y of each clip pair */ clips: number[] }

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
  /* The cavity outline (board plus clearance), the lip ring and the clip bumps along its long sides. */
  const inner = rounded(cx, cy, b.maxX - b.minX + 2 * SHELL.clearance, b.maxY - b.minY + 2 * SHELL.clearance, SHELL_RULES.fillet - grow + SHELL.clearance);
  const ring = (from: number, to: number) => inner.offset(to, "Round", 2, SEGMENTS).subtract(inner.offset(from, "Round", 2, SEGMENTS));
  const halfW = (b.maxX - b.minX) / 2 + SHELL.clearance + LIP.thickness;
  const clipYs = clipPositions(b);
  const bump = (grow: number) => M.union(clipYs.flatMap((y) => [-1, 1].map((side) =>
    M.cylinder(CLIP.length, CLIP.radius + grow, CLIP.radius + grow, SEGMENTS, true).rotate([90, 0, 0])
      .translate([cx + side * (halfW + CLIP.proud - CLIP.radius), y, h.split + CLIP.z]))));
  const keys = design.keys.filter((k) => k.id !== "placeholder");

  /* ---- top piece ---- */
  const topCuts: Manifold[] = [];
  for (const k of keys) {
    topCuts.push(prism(rounded(k.x, k.y, CLIP_ROOM, CLIP_ROOM, 0.5), h.split - 1, h.plateBottom));
    topCuts.push(prism(rounded(k.x, k.y, SHELL_RULES.plateCutout, SHELL_RULES.plateCutout, 0.3), h.plateBottom - 0.01, h.plateTop + 0.01));
    topCuts.push(prism(rounded(k.x, k.y, capWidth(k.w) + 2 * CAP_GAP, KEYCAPS[design.keycap].depthMm + 2 * CAP_GAP, 1.1), h.plateTop, h.face + 1));
  }
  for (const p of holes) topCuts.push(disc(p.x, p.y, SCREW.pilot, h.split - 1, h.face - 0.6));
  if (design.options.irTransmit && spots.LED1) {
    /* The side-looker stands in a pocket under the face and shines out through a window in the
     * front wall, at lens height. */
    const led = IR.led, back = spots.LED1.y + led.leadsFromBack, front = back - led.depth - led.lensProud;
    topCuts.push(prism(rounded(spots.LED1.x, (back + front) / 2, led.width + 0.6, back - front + 0.6, 0.3), h.split - 1, h.split + led.height + 0.15));
    topCuts.push(M.cylinder(back - b.minY + grow + 2, IR_WINDOW / 2, IR_WINDOW / 2, SEGMENTS).rotate([90, 0, 0]).translate([spots.LED1.x, back, h.split + led.lensZ]));
  }
  if (design.options.irReceive && spots.U2) topCuts.push(prism(rounded(spots.U2.x, spots.U2.y, IR.receiver.width + 0.6, IR.receiver.depth + 0.6, 0.3), h.split - 1, h.face + 1));
  topCuts.push(prism(ring(-LIP.gap, LIP.thickness + LIP.gap), h.split - 1, h.split + LIP.height + 0.2), bump(0.05));
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
  /* The lip with its clips, and a fingernail notch at the top end for prying the halves apart. */
  bottom = bottom.add(prism(ring(0, LIP.thickness), h.split - 0.01, h.split + LIP.height)).add(bump(0).intersect(prism(ring(-0.5, LIP.thickness + 1), h.split, h.split + LIP.height)));
  const bottomCuts: Manifold[] = [];
  for (const p of holes) {
    bottomCuts.push(disc(p.x, p.y, SCREW.clearance, h.base - 1, h.pcbBottom + 0.01));
    bottomCuts.push(disc(p.x, p.y, SCREW.head, h.base - 1, h.base + SCREW.headDepth));
  }
  bottomCuts.push(prism(rounded(cx, b.minY - grow, 10, 1.6, 0.5), h.split - 0.8, h.split + 0.01));
  /* USB-C opening: the receptacle hangs under the board at the bottom edge. */
  const usb = spots.J1!;
  bottomCuts.push(prism(rounded(usb.x, b.maxY + grow / 2 + 2, 2 * USB_C.halfWidth + 0.8, grow + 6, 0.4), h.pcbBottom - 3.26 - 0.4, h.pcbBottom + 0.01));
  /* Window under the charging light. */
  if (spots.LED2) bottomCuts.push(disc(spots.LED2.x, spots.LED2.y, 2, h.base - 1, h.floorTop + 0.01));
  bottom = bottom.subtract(M.union(bottomCuts));

  return { top, bottom, clips: clipYs };
}

/** Where the clips sit along each long side: a third of the way in from each end. */
export function clipPositions(b: { minY: number; maxY: number }): number[] {
  const len = b.maxY - b.minY;
  return [b.minY + len / 3, b.maxY - len / 3];
}

/** Manifold outside the browser (the router). Imported from here so it resolves from designer/. */
export async function loadManifold(): Promise<ManifoldToplevel> {
  const { default: Module } = await import("manifold-3d");
  const m = await Module();
  m.setup();
  return m;
}

/** Both pieces placed for printing: each sits on its flat side at z = 0, top of the remote toward +Y. */
export function printable(e: Enclosure): Enclosure {
  const place = (piece: Manifold) => {
    const solid = piece.mirror([0, 1, 0]);
    return solid.translate([0, 0, -solid.boundingBox().min[2]]);
  };
  return { top: place(e.top), bottom: place(e.bottom), clips: e.clips.map((y) => -y) };
}

/* A 20 mm slice of both pieces across the first pair of clips: about 15 minutes of printing to
 * check the lip, the groove and the click before printing the whole shell. */
const FIT_BAND = 10;
export function fitTest(e: Enclosure): Enclosure {
  const y = e.clips[0]!;
  const slice = (piece: Manifold) => piece.trimByPlane([0, 1, 0], y - FIT_BAND).trimByPlane([0, -1, 0], -(y + FIT_BAND));
  return { top: slice(e.top), bottom: slice(e.bottom), clips: [y] };
}

/** Everything the shell download holds: both STLs, a Bambu Studio project and the print notes. */
export function shellFiles(e: Enclosure, title: string): Record<string, Uint8Array<ArrayBuffer> | string> {
  const p = printable(e), fit = fitTest(p);
  const stl = (piece: Manifold) => {
    const mesh = piece.getMesh();
    return binaryStl(mesh.vertProperties, mesh.triVerts, mesh.numProp);
  };
  return {
    "shell-top.stl": stl(p.top),
    "shell-bottom.stl": stl(p.bottom),
    "shell-bambu-a1.3mf": bambuProject([{ name: "shell-top", solid: p.top }, { name: "shell-bottom", solid: p.bottom }], title),
    "fit-test-bambu-a1.3mf": bambuProject([{ name: "fit-test-top", solid: fit.top }, { name: "fit-test-bottom", solid: fit.bottom }], `${title}: fit test`),
    "PRINT.txt": PRINT_NOTES,
  };
}

export const PRINT_NOTES = `Open Clicker shell: two pieces, no supports.

shell-bambu-a1.3mf  Bambu Studio project: both pieces on one plate of a Bambu Lab A1 with
                    Bambu PLA Basic and the settings below. Open it, check the printer and
                    filament, slice and print. For another printer, use the two STLs.

shell-top.stl     Print flat side down (as exported). The face, the keycap pockets and the
                  1.2 mm switch plate are one piece.
shell-bottom.stl  Print floor down (as exported).

Settings: PLA or PETG, 0.2 mm layers, 3 walls, 15 % infill. The plate is 1.2 mm thick;
print it at 0.2 mm layers so the Choc switches clip in firmly.

fit-test-bambu-a1.3mf  Print this first (about 15 minutes): a 20 mm slice of both pieces
                       across two clips. Press them together. They should click and hold,
                       and come apart with a fingernail. Too tight or too loose? Say so and
                       the clip gets adjusted before you print the whole shell.

The halves: a lip on the bottom piece seats in a groove under the top piece, and four
clips click them together. Screws are optional.

Assembly:
1. Clip the switches into the top piece from below, then press the board onto their pins.
2. Plug the battery into the board and lay the cell inside the fence in the bottom piece.
3. Press the pieces together until all four clips click. To open, put a fingernail in the
   notch at the top end and lift. Optional: four M2 x 12 mm pan-head screws up through the
   bottom piece and the board into the top piece clamp the board tighter.
4. Press the keycaps onto the switches.
`;
