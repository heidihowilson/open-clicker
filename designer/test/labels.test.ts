import { expect, test } from "bun:test";
import { plan, resolve } from "../src/onboarding/labels";
import { fromLayout, LAYOUTS, type Remote } from "../src/onboarding/model";

const fnAt = (r: Remote, labels: ReturnType<typeof resolve>, col: number, row: number) =>
  labels.get(r.keys.find((k) => k.col === col && k.row === row)!.id)?.fn;

test("the red key is power and a cross is navigation, with no model call", () => {
  const r = fromLayout(LAYOUTS.streamer), labels = resolve(plan(r), {});
  expect(fnAt(r, labels, 2, 0)).toBe("power");
  expect([fnAt(r, labels, 1, 1), fnAt(r, labels, 0, 2), fnAt(r, labels, 1, 2), fnAt(r, labels, 2, 2), fnAt(r, labels, 1, 3)]).toEqual(["up", "left", "ok", "right", "down"]);
});

test("a cross touched by another key is still found", () => {
  const r = fromLayout(LAYOUTS.boomer), labels = resolve(plan(r), {});
  expect(fnAt(r, labels, 1, 7)).toBe("ok");
  expect(fnAt(r, labels, 1, 6)).toBe("up");
});

test("a plain 3 × 3 block is a candidate number pad, not a cross", () => {
  const keys = Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, col: i % 3, row: Math.floor(i / 3), color: "charcoal" as const }));
  const p = plan({ cols: 3, rows: 4, keys });
  expect(p.fixed.size).toBe(0);
  expect(p.blocks.length).toBe(1);
  const labels = resolve(p, { [`b:${p.blocks[0]!.id}`]: { probabilities: { number_pad: 0.9, separate_rows: 0.1 } } });
  expect(fnAt({ cols: 3, rows: 4, keys }, labels, 0, 0)).toBe("digit_1");
  expect(fnAt({ cols: 3, rows: 4, keys }, labels, 2, 2)).toBe("digit_9");
});

test("no function is used twice; a later section falls back to its next choice", () => {
  const keys = [0, 1].flatMap((row) => [0, 1].map((col) => ({ id: `k${row}${col}`, col, row: row * 2, color: "charcoal" as const })));
  const r = { cols: 2, rows: 3, keys }, p = plan(r);
  const both = { probabilities: { volume: 0.8, channel: 0.15 } };
  const labels = resolve(p, Object.fromEntries(p.sections.map((s, i) => [`s:${s.id}`, i ? { probabilities: { volume: 0.7, channel: 0.25 } } : both])));
  const fns = [...labels.values()].map((l) => l.fn);
  expect(new Set(fns).size).toBe(fns.length);
  expect(fns).toContain("channel_up");
});

test("a second red key is not a second power key", () => {
  const r = fromLayout(LAYOUTS.streamer);
  const extra = { ...r, keys: [...r.keys, { id: "red2", col: 1, row: 7, color: "red" as const }] };
  const p = plan(extra);
  const labels = resolve(p, { [`s:red7c1`]: { probabilities: { app: 0.7, stop: 0.1, mute: 0.1, input: 0.1 } } });
  expect([...labels.values()].filter((l) => l.fn === "power").length).toBe(1);
  expect(labels.get("red2")?.fn).toBe("app");
});
