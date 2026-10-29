import { expect, test } from "bun:test";
import columnJson from "../src/seeds/column.json";
import deckJson from "../src/seeds/deck.json";
import slabJson from "../src/seeds/slab.json";
import tileJson from "../src/seeds/tile.json";
import { capColour } from "../src/lib/actions";
import { bom, bomTotal } from "../src/lib/bom";
import { check, errorsIn } from "../src/lib/checks";
import { parseDesign, readingOrder, type Design } from "../src/lib/design";
import { kicadProject } from "../src/lib/kicad";
import { keyCapacity, netlist } from "../src/lib/netlist";
import { zip } from "../src/lib/zip";
import { keymap } from "../src/lib/exports";
import { boardBounds, collisions, keyField } from "../src/lib/geometry";
import { planPins } from "../src/lib/matrix";
import { DEFAULT_PRICING, tiers } from "../src/lib/pricing";

const tile = parseDesign(tileJson);
const slab = parseDesign(slabJson);
const deck = parseDesign(deckJson);
const column = parseDesign(columnJson);

test("every template validates and has no errors on its default controller", () => {
  for (const d of [tile, slab, deck, column]) expect(errorsIn(check(d)).map((f) => f.message)).toEqual([]);
});

test("cap colour follows the action: cluster oxblood, power orange, the rest ivory", () => {
  expect(capColour("ok")).toBe("oxblood");
  expect(capColour("left")).toBe("oxblood");
  expect(capColour("power")).toBe("orange");
  expect(capColour("home")).toBe("ivory");
});

test("the shell follows the key field: 6 mm margin, 20 mm chin", () => {
  const f = keyField(tile), b = boardBounds(tile);
  expect(f.minY - b.minY).toBeCloseTo(6);
  expect(b.maxY - f.maxY).toBeCloseTo(20);
});

test("keys on adjacent grid cells do not collide; a shared cell does", () => {
  expect(collisions(tile)).toEqual([]);
  const keys = [...tile.keys, { id: "extra", x: 18, y: 17, w: 1 as const, action: "mute" as const, label: "" }];
  expect(collisions({ ...tile, keys }).length).toBeGreaterThan(0);
});

test("the Deck's 2u play key spans two columns without touching its neighbours", () => {
  expect(collisions(deck)).toEqual([]);
  expect(deck.keys.find((k) => k.id === "play")?.w).toBe(2);
});

test("every pin wakes the module, and the IR transmitter gets a full-speed pin", () => {
  for (const d of [tile, slab, deck, column]) {
    const plan = planPins({ ...d, options: { ...d.options, irTransmit: true } });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.columns.every((p) => p.wake)).toBe(true);
    expect(plan.irTransmit?.slow).toBe(false);
  }
});

test("old XIAO files load as BMD-340 designs", () => {
  expect(parseDesign({ ...tile, chip: "xiao-esp32c6" }).chip).toBe("bmd-340");
});

test("a second power key and IR power without a transmitter are reported", () => {
  const twoPower = { ...tile, keys: [...tile.keys, { id: "p2", x: 0, y: 0, w: 1 as const, action: "power" as const, label: "" }] };
  expect(check(twoPower).some((f) => f.badge === "Two power keys")).toBe(true);
  expect(check(tile).some((f) => f.badge === "Power needs IR")).toBe(true);
});

test("the keymap places every key and names module pins", () => {
  const km = keymap(column);
  expect(km.map.flat().filter(Boolean).length).toBe(column.keys.length);
  expect(km.columns.every((p) => /^P[01]\.\d\d$/.test(p))).toBe(true);
});

test("the BOM has one line per purchasable or printed unit", () => {
  const lines = bom(tile);
  const ids = lines.map((l) => l.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(expect.arrayContaining(["shell", "lid", "screws"]));
  expect(ids).not.toContain("plate");
  expect(lines.find((l) => l.id === "switch")?.qty).toBe(tile.keys.length);
  expect(bomTotal(lines)).toBeGreaterThan(15);
});

test("fulfilment levels rise from Kit to Half-built to Fully assembled", () => {
  const [kit, half, full] = tiers(column);
  expect(kit!.id).toBe("kit");
  expect(kit!.priceUsd).toBeNull();
  expect(half!.priceUsd!).toBeGreaterThan(half!.costUsd);
  expect(full!.priceUsd!).toBeGreaterThan(half!.priceUsd!);
  expect(half!.lines.some((l) => l.label.includes("filament"))).toBe(false);
  expect(full!.lines.some((l) => l.label.includes("filament"))).toBe(true);
  expect(tiers(column, { ...DEFAULT_PRICING, batch: 500 })[1]!.costUsd).toBeLessThan(half!.costUsd);
});

test("schema 2 files upgrade on load", () => {
  const { schema: _s, id: _i, revision: _r, circuit: _c, ...rest } = tile;
  const old = parseDesign({ ...rest, schema: 2, template: "Tile" });
  expect(old.schema).toBe(3);
  expect(old.template).toBe("tile");
  expect(old.circuit.matrix).toBe("col2row");
});

test("two keys on one centre are rejected", () => {
  const k = tile.keys[0]!;
  expect(() => parseDesign({ ...tile, keys: [...tile.keys, { ...k, id: "twin" }] })).toThrow();
});

test("the netlist is deterministic and wires every key column to row through its diode", () => {
  const a = netlist(tile), b = netlist(structuredClone(tile));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  const switches = a.parts.filter((p) => p.ref.startsWith("SW"));
  const diodes = a.parts.filter((p) => p.ref.startsWith("D") && p.ref !== "D");
  expect(switches.length).toBe(tile.keys.length);
  expect(diodes.length).toBe(tile.keys.length);
  for (const sw of switches) {
    const d = diodes.find((x) => x.keyId === sw.keyId)!;
    expect(sw.pins["2"]).toBe(d.pins.A!);
    expect(sw.pins["1"]).toMatch(/^COL\d+$/);
    expect(d.pins.K).toMatch(/^ROW\d+$/);
  }
  expect(a.parts.find((p) => p.ref === "SW1")!.keyId).toBe(readingOrder(tile.keys)[0]!.id);
});

test("IR adds its parts and nets; the battery needs no divider", () => {
  const n = netlist({ ...tile, options: { irTransmit: true, irReceive: true, batterySense: true } });
  for (const ref of ["LED1", "Q1", "R1", "R2", "U2", "C1"]) expect(n.parts.some((p) => p.ref === ref)).toBe(true);
  for (const net of ["IR_TX", "IR_RX"]) expect(n.nets).toContain(net);
  expect(n.parts.some((p) => p.ref === "R3")).toBe(false);
});

test("power follows the BMD-340 data sheet: cell on VCCH, USB on VBUS and the charger", () => {
  const u1 = netlist(tile).parts.find((p) => p.ref === "U1")!;
  expect(u1.pins["65"]).toBe("VBAT");
  expect(u1.pins["17"]).toBe("VCC");
  expect(u1.pins["66"]).toBe("VBUS");
  expect([u1.pins["67"], u1.pins["68"]]).toEqual(["USB_DN", "USB_DP"]);
  for (const pad of ["1", "16", "29"]) expect(u1.pins[pad]).toBe("GND");
  const charger = netlist(tile).parts.find((p) => p.ref === "U3")!;
  expect([charger.pins.VDD, charger.pins.VBAT]).toEqual(["VBUS", "VBAT"]);
});

test("the module has pins for every key a design file can hold", () => {
  expect(keyCapacity(tile)).toBe(40);
});

test("the KiCad project is deterministic and the board spec uses published footprints", () => {
  const a = kicadProject(tile), b = kicadProject(structuredClone(tile));
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  const sch = Object.entries(a.files).find(([n]) => n.endsWith(".kicad_sch"))![1];
  const parts = netlist(tile).parts;
  expect(a.spec.parts.length).toBe(parts.length);
  expect(sch.match(/\(symbol \(lib_id /g)!.length).toBe(parts.length);
  for (const p of a.spec.parts) expect(p.footprint).toMatch(/^[A-Za-z0-9_.]+:[A-Za-z0-9_.-]+$/);
  /* The antenna keep-out reaches the board edge beside the module's antenna end. */
  const k = a.spec.keepouts[0]!, u1 = a.spec.parts.find((p) => p.ref === "U1")!;
  expect(k.maxX).toBe(a.spec.outline.maxX);
  expect(k.minX).toBeCloseTo(u1.x + 9.5 - 4.4, 6);
  const bytes = zip(a.files);
  expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
});
