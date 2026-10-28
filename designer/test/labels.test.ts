import { expect, test } from "bun:test";
import { plan, readHint, request, resolve } from "../src/onboarding/labels";
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

test("a compact remote is never offered a number pad", () => {
  const keys = Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, col: i % 3, row: Math.floor(i / 3), color: "charcoal" as const }));
  expect(plan({ cols: 3, rows: 4, keys }).blocks.length).toBe(0);
});

test("on a full-size remote a plain block is a candidate number pad, not a cross", () => {
  const keys = Array.from({ length: 18 }, (_, i) => ({ id: `k${i}`, col: i % 3, row: Math.floor(i / 3), color: "charcoal" as const }));
  const p = plan({ cols: 3, rows: 6, keys });
  expect(p.fixed.size).toBe(0);
  expect(p.blocks.length).toBe(1);
  const labels = resolve(p, { [`b:${p.blocks[0]!.id}`]: { probabilities: { number_pad: 0.9, separate_rows: 0.1 } } });
  expect(fnAt({ cols: 3, rows: 6, keys }, labels, 0, 0)).toBe("digit_1");
  expect(fnAt({ cols: 3, rows: 6, keys }, labels, 2, 2)).toBe("digit_9");
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
  const extra = { ...r, keys: [...r.keys, { id: "red2", col: 1, row: 4, color: "red" as const }] };
  const p = plan(extra);
  const labels = resolve(p, { [`s:red4c1`]: { probabilities: { netflix: 0.7, stop: 0.1, mute: 0.1, input: 0.1 } } });
  expect([...labels.values()].filter((l) => l.fn === "power").length).toBe(1);
  expect(labels.get("red2")?.fn).toBe("netflix");
});

test("known labels are kept and the rest avoid their functions", () => {
  const r = fromLayout(LAYOUTS.streamer);
  const top = r.keys.find((k) => k.col === 0 && k.row === 0)!;
  const crossTop = r.keys.find((k) => k.col === 1 && k.row === 1)!;
  const p = plan(r, { [top.id]: "volume_up", [crossTop.id]: "home" });
  const labels = resolve(p, Object.fromEntries(p.sections.map((s) => [`s:${s.id}`, { probabilities: { sound: 0.9 } }])));
  expect(labels.get(top.id)?.fn).toBe("volume_up");
  expect(labels.get(crossTop.id)?.fn).toBe("home");
  expect([...labels.values()].filter((l) => l.fn === "volume_up").length).toBe(1);
  expect(fnAt(r, labels, 2, 0)).toBe("power");
});

test("a second red key gets power when the person moved power elsewhere", () => {
  const r = fromLayout(LAYOUTS.streamer);
  const red = r.keys.find((k) => k.color === "red")!, other = r.keys.find((k) => k.col === 0 && k.row === 0)!;
  const labels = resolve(plan(r, { [other.id]: "power" }), {});
  expect(labels.get(red.id)?.fn).not.toBe("power");
});

test("a key between locked Vol− and Vol+ is offered Mute first", () => {
  const keys = [0, 1, 2].map((col) => ({ id: `k${col}`, col, row: 0, color: "charcoal" as const }));
  const p = plan({ cols: 3, rows: 3, keys }, { k0: "volume_down", k2: "volume_up" });
  const s = p.sections.find((x) => x.keys.some((k) => k.id === "k1"))!;
  expect(s.candidates[0]!.labels).toEqual(["mute"]);
  expect(s.about).toContain("Volume down on its left");
  const labels = resolve(p, { [`s:${s.id}`]: { probabilities: { [s.candidates[0]!.id]: 0.6 } } });
  expect(labels.get("k1")?.fn).toBe("mute");
});

test("a hint Jev is sure of becomes that function; an unsure one becomes custom", () => {
  expect(readHint({ probabilities: { mute: 0.78, volume_down: 0.18, custom: 0.04 } }).fn).toBe("mute");
  const unsure = readHint({ probabilities: { app: 0.45, custom: 0.42, home: 0.05 } });
  expect(unsure.fn).toBe("custom");
  expect(unsure.alts).not.toContain("custom");
  expect(readHint(undefined).fn).toBe("custom");
});

test("a custom key is named to its neighbours by the person's words", () => {
  const r: Remote = { cols: 2, rows: 1, keys: [{ id: "a", col: 0, row: 0, color: "charcoal" }, { id: "b", col: 1, row: 0, color: "charcoal" }] };
  const p = plan(r, { a: "custom" }, { a: "Grandma's channel" });
  expect(p.sections[0]!.about).toContain(`described as "Grandma's channel"`);
  expect(request(r, p).state.already_known).toBe("No key is labelled yet.");
});
