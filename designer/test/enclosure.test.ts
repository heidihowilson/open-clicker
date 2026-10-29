import { expect, test } from "bun:test";
import Module from "manifold-3d";
import { enclosure } from "../src/lib/enclosure";
import { boardBounds, mountingHoles, stack } from "../src/lib/geometry";
import { fromLayout, LAYOUTS, toDesign } from "../src/onboarding/model";

const wasm = await Module();
wasm.setup();

test("both shell pieces are single watertight solids that meet at the board", () => {
  for (const name of ["streamer", "boomer", "brick"] as const) {
    const d = toDesign(fromLayout(LAYOUTS[name]));
    const { top, bottom } = enclosure(wasm, d), h = stack(d);
    for (const piece of [top, bottom]) {
      expect(piece.status()).toBe("NoError");
      expect(piece.volume()).toBeGreaterThan(0);
      expect(piece.decompose().length).toBe(1);
    }
    expect(top.boundingBox().min[2]).toBeCloseTo(h.split, 3);
    expect(bottom.boundingBox().max[2]).toBeCloseTo(h.split, 3);
    expect(bottom.boundingBox().min[2]).toBeCloseTo(h.base, 3);
    expect(top.intersect(bottom).volume()).toBeLessThan(1e-6);
  }
});

test("each mounting hole has a pilot in the top piece and a clear path through the bottom", () => {
  const d = toDesign(fromLayout(LAYOUTS.streamer)), { top, bottom } = enclosure(wasm, d), h = stack(d);
  for (const p of mountingHoles(boardBounds(d))) {
    const probe = wasm.Manifold.cylinder(0.1, 0.3, 0.3, 8);
    expect(top.intersect(probe.translate([p.x, p.y, 1])).volume()).toBeLessThan(1e-9);
    expect(bottom.intersect(probe.translate([p.x, p.y, h.base + 3])).volume()).toBeLessThan(1e-9);
    /* Solid post wall beside the screw. */
    expect(bottom.intersect(probe.translate([p.x + 2, p.y, h.pcbBottom - 2])).volume()).toBeGreaterThan(0);
  }
});
