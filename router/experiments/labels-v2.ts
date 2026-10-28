/* Run: TYPESAFE_API_KEY=… bun router/experiments/labels-v2.ts */
import { FUNCTION_NAMES, plan, request, resolve } from "../../designer/src/onboarding/labels";
import { fromLayout, LAYOUTS, live, type Remote } from "../../designer/src/onboarding/model";

const KEY = (process.env.TYPESAFE_API_KEY ?? "").trim();
async function show(name: string, r: Remote) {
  const p = plan(r), body = request(r, p);
  const t = performance.now();
  const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", ...body }) });
  const json = await res.json() as { answers?: Record<string, never> };
  if (!json.answers) { console.log(name, res.status, JSON.stringify(json).slice(0, 300)); return; }
  const labels = resolve(p, json.answers);
  console.log(`\n== ${name} (${Math.round(performance.now() - t)} ms)`);
  for (let row = 0; row < r.rows; row++) {
    const line: string[] = [];
    for (let col = 0; col < r.cols; col++) {
      const k = live(r).find((x) => x.col === col && x.row === row), l = k && labels.get(k.id);
      line.push(k ? `${l ? FUNCTION_NAMES[l.fn] : "?"}${l && l.confidence < 1 ? ` ${l.confidence.toFixed(2)}` : ""}`.padEnd(18) : "·".padEnd(18));
    }
    console.log("  " + line.join(""));
  }
}
for (const n of ["streamer", "boomer", "brick"] as const) await show(LAYOUTS[n].name, fromLayout(LAYOUTS[n]));
/* Two user-ish edits: a Streamer with the volume pair moved up, and a small 2-column remote. */
const s = fromLayout(LAYOUTS.streamer);
await show("Streamer, bottom row removed", { ...s, rows: 7 });
await show("Small 2-wide", { cols: 2, rows: 5, keys: [[0,0,"red"],[1,0,"charcoal"],[0,1,"charcoal"],[1,1,"charcoal"],[0,3,"charcoal"],[1,3,"charcoal"],[0,4,"charcoal"],[1,4,"charcoal"]].map(([c, w, color], i) => ({ id: `k${i}`, col: c as number, row: w as number, color: color as "red" })) });
