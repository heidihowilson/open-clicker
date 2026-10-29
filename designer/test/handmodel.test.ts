import { expect, test } from "bun:test";
import Module from "manifold-3d";
import { handHeights, handModel, inset } from "../src/onboarding/handmodel";
import { fromLayout, LAYOUTS, shellRect } from "../src/onboarding/model";

const wasm = await Module();
wasm.setup();

test("every template gives one watertight solid at the real size", () => {
  for (const name of ["streamer", "boomer", "brick", "blank"] as const) {
    const r = fromLayout(LAYOUTS[name]), out = handModel(wasm, r), s = shellRect(r);
    expect(out.volume).toBeGreaterThan(0);
    expect(out.size[0]).toBeCloseTo(s.maxX - s.minX, 1);
    expect(out.size[1]).toBeCloseTo(s.maxZ - s.minZ, 1);
    expect(out.size[2]).toBeCloseTo(name === "blank" ? handHeights(r).body : handHeights(r).cap, 1);
    /* Binary STL: header, count, 50 bytes a triangle. */
    expect(out.stl.length).toBe(84 + new DataView(out.stl.buffer).getUint32(80, true) * 50);
  }
});

test("the long edges are rounded, and the bottom never overhangs more than 45°", () => {
  const H = 15.7;
  expect(inset(H, H)).toBeCloseTo(4, 3);
  expect(inset(H / 2, H)).toBe(0);
  for (let z = 0; z < 4; z += 0.1) expect(inset(z, H) - inset(z + 0.1, H)).toBeLessThanOrEqual(0.1 + 1e-9);
});
