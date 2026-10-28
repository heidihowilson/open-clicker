import { expect, test } from "bun:test";
import { bom } from "../src/lib/bom";
import { check, errorsIn } from "../src/lib/checks";
import { parseDesign } from "../src/lib/design";
import { netlist } from "../src/lib/netlist";
import { fromLayout, LAYOUTS, live, MAX_KEYS, minSize, occupied, quote, shellRect, toDesign, total } from "../src/onboarding/model";

test("every layout fits one controller and has no errors", () => {
  for (const [name, l] of Object.entries(LAYOUTS)) {
    const r = fromLayout(l);
    expect(live(r).length).toBeLessThanOrEqual(MAX_KEYS);
    const d = parseDesign(toDesign(r));
    if (name !== "blank") {
      expect(errorsIn(check(d)).map((f) => f.message)).toEqual([]);
      expect(netlist(d).parts.length).toBeGreaterThan(0);
    }
  }
});

test("a full key area of the most keys still routes on the controller", () => {
  const r = { cols: 3, rows: 7, keys: Array.from({ length: 21 }, (_, i) => ({ id: `k${i}`, col: i % 3, row: Math.floor(i / 3), color: "charcoal" as const })) };
  expect(errorsIn(check(parseDesign(toDesign(r))))).toEqual([]);
});

test("keys outside the key area do not count and do not block cells", () => {
  const r = fromLayout(LAYOUTS.streamer);
  const small = { ...r, rows: 3 };
  expect(live(small).length).toBe(6);
  expect(occupied(small, 0, 7)).toBe(false);
  expect(minSize(r)).toEqual({ cols: 1, rows: 2 });
});

test("prices rise from DIY to Complete and follow the key count", () => {
  const r = fromLayout(LAYOUTS.streamer);
  const diy = total(quote(r, "diy")), kit = total(quote(r, "kit")), done = total(quote(r, "complete"));
  expect(diy).toBeLessThan(done);
  expect(kit).toBeLessThan(done);
  expect(total(quote(fromLayout(LAYOUTS.brick), "complete"))).toBeGreaterThan(done);
});

test("the shell keeps a bottom bay below the last row", () => {
  const s = shellRect(fromLayout(LAYOUTS.streamer));
  expect(s.maxZ - (7 * 17 + 8.5)).toBeGreaterThan(20);
});

test("the onboarding's printed parts are black, not the studio's butter", () => {
  const specs = bom(parseDesign(toDesign(fromLayout(LAYOUTS.streamer)))).map((l) => l.spec).join(" ");
  expect(specs).toContain("Printed in black");
  expect(specs.toLowerCase()).not.toContain("butter");
  expect(specs).not.toContain("battery divider");
});
