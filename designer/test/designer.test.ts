import { expect, test } from "bun:test";
import columnJson from "../src/seeds/column.json";
import deckJson from "../src/seeds/deck.json";
import slabJson from "../src/seeds/slab.json";
import tileJson from "../src/seeds/tile.json";
import { capColour } from "../src/lib/actions";
import { bom, bomTotal } from "../src/lib/bom";
import { check, errorsIn } from "../src/lib/checks";
import { parseDesign, readingOrder, type Design } from "../src/lib/design";
import { keyCapacity, netlist } from "../src/lib/netlist";
import { keymap, keymapHeader } from "../src/lib/exports";
import { boardBounds, collisions, keyField } from "../src/lib/geometry";
import { planPins } from "../src/lib/matrix";
import { DEFAULT_PRICING, tiers } from "../src/lib/pricing";

const tile = parseDesign(tileJson);
const slab = parseDesign(slabJson);
const deck = parseDesign(deckJson);
const column = parseDesign(columnJson);
const withChip = (d: Design, chip: Design["chip"]): Design => ({ ...d, chip });

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

test("columns are wake pins on every controller", () => {
  for (const chip of ["xiao-esp32c3", "xiao-esp32c6", "xiao-nrf52840"] as const) {
    const plan = planPins(withChip(tile, chip));
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.columns.every((p) => p.wake)).toBe(true);
  }
});

test("the 21-key Slab only fits the controller whose every pin can wake", () => {
  expect(planPins(slab).ok).toBe(true);
  expect(planPins(withChip(slab, "xiao-esp32c6")).ok).toBe(false);
});

test("C3 keeps strapping pins off the IR driver", () => {
  const plan = planPins(withChip(column, "xiao-esp32c3"));
  if (!plan.ok) throw new Error(plan.reason);
  expect(plan.irTransmit?.strapping).toBe(false);
});

test("a second power key and IR power without a transmitter are reported", () => {
  const twoPower = { ...tile, keys: [...tile.keys, { id: "p2", x: 0, y: 0, w: 1 as const, action: "power" as const, label: "" }] };
  expect(check(twoPower).some((f) => f.badge === "Two power keys")).toBe(true);
  expect(check(tile).some((f) => f.badge === "Power needs IR")).toBe(true);
});

test("keymap and header agree", () => {
  const km = keymap(column);
  expect(km.map.flat().filter(Boolean).length).toBe(column.keys.length);
  expect(keymapHeader(column)).toContain("#define OR_MATRIX_ROWS");
  expect(() => keymapHeader(slab)).toThrow();
});

test("the BOM has one line per purchasable or printed unit", () => {
  const lines = bom(tile);
  const ids = lines.map((l) => l.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(expect.arrayContaining(["shell", "plate", "lid"]));
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

test("IR and battery sensing add their parts and nets", () => {
  const n = netlist({ ...tile, options: { irTransmit: true, irReceive: true, batterySense: true } });
  for (const ref of ["LED1", "Q1", "R1", "R2", "U2", "C1", "R3", "R4"]) expect(n.parts.some((p) => p.ref === ref)).toBe(true);
  for (const net of ["IR_TX", "IR_RX", "VBAT_SENSE"]) expect(n.nets).toContain(net);
});

test("key capacity matches the planner", () => {
  const cap = keyCapacity(tile);
  expect(cap).toBeGreaterThanOrEqual(tile.keys.length);
  expect(planPins({ ...tile, keys: Array.from({ length: cap + 1 }, (_, i) => ({ id: `k${i}`, x: i * 18, y: 0, w: 1 as const, action: "none" as const, label: "" })) }).ok).toBe(false);
});
