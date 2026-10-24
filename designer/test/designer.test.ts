import { expect, test } from "bun:test";
import classicJson from "../src/seeds/classic.json";
import arcJson from "../src/seeds/thumb-arc.json";
import { check } from "../src/lib/checks";
import { parseDesign, type Design } from "../src/lib/design";
import { keymap, keymapHeader } from "../src/lib/exports";
import { planPins } from "../src/lib/matrix";

const classic = parseDesign(classicJson);
const arc = parseDesign(arcJson);
const withChip = (d: Design, chip: Design["chip"]): Design => ({ ...d, chip });

test("seeds validate and pass every error check", () => {
  for (const d of [classic, arc]) expect(check(d).filter((f) => f.level === "error")).toEqual([]);
});

test("columns are wake pins on every chip", () => {
  for (const chip of ["xiao-esp32c3", "xiao-esp32c6", "xiao-nrf52840"] as const) {
    const plan = planPins(withChip(classic, chip));
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.columns.every((p) => p.wake)).toBe(true);
    expect(plan.positions.size).toBe(classic.keys.length);
  }
});

test("C6 battery sensing takes a wake pin and still fits ten keys", () => {
  const plan = planPins(classic);
  if (!plan.ok) throw new Error(plan.reason);
  expect(plan.battery?.id).toBe("D0");
  expect(plan.columns.map((p) => p.id)).toEqual(["D1", "D2"]);
  expect(plan.rows.length).toBe(5);
  expect(plan.irTransmit).not.toBeNull();
});

test("C3 keeps strapping pins off the matrix and the IR driver when it can", () => {
  for (const d of [classic, arc]) {
    const plan = planPins(withChip(d, "xiao-esp32c3"));
    if (!plan.ok) throw new Error(plan.reason);
    expect([plan.irTransmit, plan.irReceive].some((p) => p?.strapping)).toBe(false);
  }
  /* Without IR, ten keys plus battery sensing fit on the eight plain pins. */
  const plan = planPins({ ...withChip(classic, "xiao-esp32c3"), options: { ...classic.options, irTransmit: false } });
  if (!plan.ok) throw new Error(plan.reason);
  expect([...plan.rows, ...plan.columns].some((p) => p.strapping)).toBe(false);
});

test("too many keys fails with the real limit", () => {
  const keys = Array.from({ length: 30 }, (_, i) => ({ id: `k${i}`, x: (i % 6) * 19, y: Math.floor(i / 6) * 19, r: 0, action: "none" as const, label: "" }));
  const plan = planPins({ ...classic, keys });
  expect(plan.ok).toBe(false);
  if (!plan.ok) expect(plan.reason).toContain("it fits 14");
});

test("overlapping keys are reported", () => {
  const keys = [...classic.keys, { id: "extra", x: 5, y: 0, r: 0, action: "mute" as const, label: "M" }];
  expect(check({ ...classic, keys }).some((f) => f.level === "error" && f.message.includes("extra"))).toBe(true);
});

test("rotated keys clear each other only when they really do", () => {
  const two = (r: number) => ({ ...classic, keys: [
    { id: "a", x: 0, y: 0, r: 0, action: "ok" as const, label: "" },
    { id: "b", x: 18.2, y: 0, r, action: "back" as const, label: "" },
  ] });
  expect(check(two(0)).some((f) => f.message.includes("overlap"))).toBe(false);
  expect(check(two(30)).some((f) => f.message.includes("overlap"))).toBe(true);
});

test("IR power without a transmitter is an error", () => {
  expect(check({ ...arc, options: { ...arc.options, irTransmit: false } }).some((f) => f.level === "error" && f.message.includes("IR"))).toBe(true);
});

test("keymap and header agree", () => {
  const km = keymap(classic);
  expect(km.map.flat().filter(Boolean).length).toBe(classic.keys.length);
  expect(km.map[0]![0]).toBe("home");
  const h = keymapHeader(classic);
  expect(h).toContain("#define OR_MATRIX_ROWS 5");
  expect(h).toContain("#define OR_BATTERY_GPIO 0");
  expect(() => keymapHeader(withChip(classic, "xiao-nrf52840"))).toThrow();
});
