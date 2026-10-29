import { expect, test } from "bun:test";
import Module from "manifold-3d";
import { enclosure, shellFiles } from "../src/lib/enclosure";
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

test("the Bambu project holds both pieces on the A1 plate, named, with the shell settings", () => {
  const files = shellFiles(enclosure(wasm, toDesign(fromLayout(LAYOUTS.boomer))), "R&D <shell>");
  const pkg = files["shell-bambu-a1.3mf"] as Uint8Array;
  const text = new TextDecoder("latin1").decode(pkg);
  for (const path of ["3D/3dmodel.model", "3D/Objects/object_1.model", "3D/Objects/object_2.model", "Metadata/model_settings.config", "Metadata/project_settings.config"]) expect(text).toContain(path);
  expect(text).toContain('value="shell-top"');
  expect(text).toContain('value="shell-bottom"');
  expect(text.match(/key="wall_loops" value="3"/g)?.length).toBe(2);
  expect(text).toContain("R&amp;D &lt;shell&gt;");
  const xs = [...text.matchAll(/<item objectid="\d+"[^>]*transform="(?:\S+ ){9}(\S+) (\S+) 0"/g)].map((m) => [+m[1]!, +m[2]!]);
  expect(xs.length).toBe(2);
  for (const [x, y] of xs) { expect(x).toBeGreaterThan(30); expect(x).toBeLessThan(226); expect(y).toBe(128); }
});
