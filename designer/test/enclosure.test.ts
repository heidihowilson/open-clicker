import { expect, test } from "bun:test";
import Module from "manifold-3d";
import { clipPositions, enclosure, LIP, shellFiles } from "../src/lib/enclosure";
import { boardBounds, mountingHoles, partSpots, stack } from "../src/lib/geometry";
import { parseDesign } from "../src/lib/design";
import { IR } from "../src/lib/parts-data";
import tile from "../src/seeds/tile.json";
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
    expect(bottom.boundingBox().max[2]).toBeCloseTo(h.split + LIP.height, 3);
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

test("the lip seats in the groove and every clip snaps into a dimple", () => {
  for (const name of ["streamer", "boomer"] as const) {
    const d = toDesign(fromLayout(LAYOUTS[name]));
    const { top, bottom } = enclosure(wasm, d), b = boardBounds(d), h = stack(d);
    const probe = (x: number, y: number, z: number) => wasm.Manifold.cube([0.05, 0.05, 0.05], true).translate([x, y, z]);
    const cx = (b.minX + b.maxX) / 2, lipMid = (b.maxX - b.minX) / 2 + 0.6 + LIP.thickness / 2;
    const y = (b.minY + b.maxY) / 2;
    /* Lip material above the seam, inside the top piece's footprint, with no top-piece material there. */
    expect(bottom.intersect(probe(cx + lipMid, y, h.split + 1)).volume()).toBeGreaterThan(0);
    expect(top.intersect(probe(cx + lipMid, y, h.split + 1)).volume()).toBeLessThan(1e-12);
    /* Top-piece skin outside the groove. */
    expect(top.intersect(probe(cx + lipMid + LIP.thickness / 2 + 0.5, y, h.split + 1)).volume()).toBeGreaterThan(0);
    /* Each clip stands proud of the lip, into a dimple in the top piece. */
    for (const cy of clipPositions(b)) for (const side of [-1, 1]) {
      const at = probe(cx + side * (lipMid + LIP.thickness / 2 + 0.2), cy, h.split + 0.7);
      expect(bottom.intersect(at).volume()).toBeGreaterThan(0);
      expect(top.intersect(at).volume()).toBeLessThan(1e-12);
    }
  }
});

test("the IR LED shines out of the front wall, not the face", () => {
  const d = parseDesign({ ...tile, options: { ...tile.options, irTransmit: true } });
  const { top } = enclosure(wasm, d), b = boardBounds(d), h = stack(d), led = partSpots(d, b).LED1!;
  const probe = (y: number, z: number) => wasm.Manifold.cube([0.05, 0.05, 0.05], true).translate([led.x, y, z]);
  /* Clear from the lens out through the wall, at lens height. */
  for (let y = led.y - 2; y > b.minY - 3; y -= 0.5) expect(top.intersect(probe(y, h.split + IR.led.lensZ)).volume()).toBeLessThan(1e-12);
  /* A roof over the LED: the face above it is solid. */
  expect(top.intersect(probe(led.y, h.face - 0.2)).volume()).toBeGreaterThan(0);
});
