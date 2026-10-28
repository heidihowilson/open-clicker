import { readFileSync } from "node:fs";
import { LAYOUTS, fromLayout, live, type CellKey, type Remote } from "../../designer/src/onboarding/model";

const KEY = (process.env.TYPESAFE_API_KEY ?? "").trim();
const FUNCTIONS: Record<string, string> = {
  power: "Turns the TV on and off",
  up: "Arrow up in a navigation cross", down: "Arrow down in a navigation cross", left: "Arrow left in a navigation cross", right: "Arrow right in a navigation cross",
  ok: "Select / OK, the centre of a navigation cross",
  back: "Go back one screen", home: "Go to the home screen", menu: "Open the menu or settings",
  play_pause: "Play or pause media", rewind: "Rewind / skip back", fast_forward: "Fast forward / skip ahead", stop: "Stop playback",
  volume_up: "Volume up", volume_down: "Volume down", mute: "Mute sound",
  channel_up: "Next channel", channel_down: "Previous channel", input: "Switch the TV input or source", guide: "Programme guide", info: "Show information about what is playing",
  digit_1: "Number 1", digit_2: "Number 2", digit_3: "Number 3", digit_4: "Number 4", digit_5: "Number 5", digit_6: "Number 6", digit_7: "Number 7", digit_8: "Number 8", digit_9: "Number 9", digit_0: "Number 0",
  app: "A shortcut that opens a streaming app",
};
const COLORS = { charcoal: "dark grey (the ordinary key colour)", light: "light grey (a highlight colour)", red: "red (the warning colour)" };

/* Spatial facts are computed in code; Jev only judges what a key with these facts is for. */
function describe(r: Remote) {
  const ks = live(r);
  const at = (c: number, w: number) => ks.find((k) => k.col === c && k.row === w);
  const groups: CellKey[][] = []; const seen = new Set<string>();
  for (const k of ks) {
    if (seen.has(k.id)) continue;
    const g: CellKey[] = [], stack = [k]; seen.add(k.id);
    while (stack.length) { const x = stack.pop()!; g.push(x); for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) { const n = at(x.col + dc, x.row + dr); if (n && !seen.has(n.id)) { seen.add(n.id); stack.push(n); } } }
    groups.push(g);
  }
  groups.sort((a, b) => Math.min(...a.map((k) => k.row)) - Math.min(...b.map((k) => k.row)) || Math.min(...a.map((k) => k.col)) - Math.min(...b.map((k) => k.col)));
  const shapeOf = (g: CellKey[]) => {
    const cols = new Set(g.map((k) => k.col)).size, rows = new Set(g.map((k) => k.row)).size;
    const centre = g.find((k) => [[1,0],[-1,0],[0,1],[0,-1]].every(([dc, dr]) => g.some((x) => x.col === k.col + dc && x.row === k.row + dr)));
    if (g.length === 5 && centre) return { name: "a plus-shaped cross of 5 keys", centre };
    if (g.length === cols * rows) return { name: g.length === 1 ? "a key on its own" : `a solid block ${rows} rows by ${cols} columns`, centre: undefined };
    return { name: `an irregular group of ${g.length} keys`, centre: undefined };
  };
  const words = (i: number, n: number, a: string, b: string) => n === 1 ? "" : i === 0 ? a : i === n - 1 ? b : n === 3 ? "middle" : `${i + 1} of ${n}`;
  return ks.map((k) => {
    const gi = groups.findIndex((g) => g.includes(k)), g = groups[gi]!, shape = shapeOf(g);
    const gCols = [...new Set(g.map((x) => x.col))].sort((a, b) => a - b), gRows = [...new Set(g.map((x) => x.row))].sort((a, b) => a - b);
    const inPlus = shape.centre ? (k === shape.centre ? "the centre of the cross" : k.row < shape.centre.row ? "the top arm of the cross" : k.row > shape.centre.row ? "the bottom arm of the cross" : k.col < shape.centre.col ? "the left arm of the cross" : "the right arm of the cross") : null;
    const sameColor = ks.filter((x) => x.color === k.color).length;
    return {
      key: k.id,
      colour: COLORS[k.color] + (sameColor === 1 && k.color !== "charcoal" ? "; it is the only key of this colour" : ""),
      place_on_remote: `row ${k.row + 1} of ${r.rows} from the top, ${words(k.col, r.cols, "left", "right") || "only"} column of ${r.cols}`,
      group: `group ${gi + 1} of ${groups.length} from the top: ${shape.name}`,
      place_in_group: inPlus ?? ([words(gRows.indexOf(k.row), gRows.length, "top row", "bottom row"), words(gCols.indexOf(k.col), gCols.length, "left", "right")].filter(Boolean).join(", ") || "alone"),
    };
  });
}

const FAMILIES: Record<string, { about: string; fns: string[] }> = {
  navigation: { about: "Moving around menus: up, down, left, right arrows around an OK key", fns: ["up", "down", "left", "right", "ok"] },
  numbers: { about: "A number pad for typing channel numbers 0 to 9", fns: ["digit_1","digit_2","digit_3","digit_4","digit_5","digit_6","digit_7","digit_8","digit_9","digit_0"] },
  playback: { about: "Controlling video playback: play/pause, rewind, fast forward, stop", fns: ["play_pause", "rewind", "fast_forward", "stop"] },
  volume: { about: "Sound: volume up, volume down, mute", fns: ["volume_up", "volume_down", "mute"] },
  channels: { about: "Changing channels up and down, or a programme guide", fns: ["channel_up", "channel_down", "guide"] },
  system: { about: "Getting around the TV: power, home, back, menu, input source, info, app shortcuts", fns: ["power", "home", "back", "menu", "input", "info", "app"] },
};
type Answer = { choice: string; confidence: number; probabilities: Record<string, number> };
async function ask(state: unknown, questions: Record<string, unknown>) {
  const res = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }) });
  const body = await res.json() as { answers: Record<string, Answer & { probability?: number }> };
  if (!body.answers) throw new Error(JSON.stringify(body).slice(0, 300));
  return body.answers;
}
/* Unique functions (everything but app) go to one key each: greedy on probability, best first. */
function assign(probs: Record<string, Record<string, number>>) {
  const pairs = Object.entries(probs).flatMap(([k, ps]) => Object.entries(ps).map(([f, p]) => ({ k, f, p }))).sort((a, b) => b.p - a.p);
  const out: Record<string, { f: string; p: number }> = {}, used = new Set<string>();
  for (const { k, f, p } of pairs) { if (out[k] || (used.has(f) && f !== "app")) continue; out[k] = { f, p }; used.add(f); }
  return out;
}

async function label(name: keyof typeof LAYOUTS) {
  const r = fromLayout(LAYOUTS[name]);
  const keys = describe(r);
  const groupNames = [...new Set(keys.map((k) => k.group))];
  const groups = groupNames.map((g) => ({ group: g, keys: keys.filter((k) => k.group === g).map((k) => ({ colour: k.colour, place_in_group: k.place_in_group })) }));
  const t = performance.now();
  /* 1. What is each group for? One yes/no per family, since a group can mix families. */
  const q1: Record<string, unknown> = {};
  groupNames.forEach((_, gi) => { for (const [fam, d] of Object.entries(FAMILIES)) q1[`${gi}:${fam}`] = { type: "noul", instructions: `On this TV remote, is the group of keys described in \`groups[${gi}]\` used for this purpose: ${d.about}?` }; });
  const a1 = await ask({ remote: { rows: r.rows, columns: r.cols }, groups }, q1);
  const fams = groupNames.map((_, gi) => Object.keys(FAMILIES).filter((f) => (a1[`${gi}:${f}`]?.probability ?? 0) >= 0.3));
  /* 2. Each key picks a function from its group's families. */
  const q2 = Object.fromEntries(keys.map((k, i) => {
    const gi = groupNames.indexOf(k.group), fs = (fams[gi]!.length ? fams[gi]! : Object.keys(FAMILIES)).flatMap((f) => FAMILIES[f]!.fns);
    return [k.key, { type: "choice", instructions: `This is a TV remote with blank keys. The group the key in \`keys[${i}]\` belongs to is for: ${(fams[gi]!.length ? fams[gi]! : ["anything"]).join(" and ")}. Which function does the key in \`keys[${i}]\` most likely have, given its colour and where it sits in its group?`,
      criteria: Object.fromEntries(fs.map((f) => [f, FUNCTIONS[f]!])) }];
  }));
  const a2 = await ask({ keys }, q2);
  const ms = Math.round(performance.now() - t);
  const final = assign(Object.fromEntries(Object.entries(a2).map(([k, a]) => [k, a.probabilities])));
  console.log(`\n== ${LAYOUTS[name].name}  (${ms} ms)  groups: ${groupNames.map((g, gi) => `[${gi + 1}] ${fams[gi]!.join("+") || "?"}`).join("  ")}`);
  for (let row = 0; row < r.rows; row++) {
    const line: string[] = [];
    for (let col = 0; col < r.cols; col++) {
      const k = live(r).find((x) => x.col === col && x.row === row), a = k && final[k.id];
      line.push(a ? `${a.f}${k!.color === "red" ? "*" : k!.color === "light" ? "°" : ""}(${a.p.toFixed(2)})`.padEnd(22) : "·".padEnd(22));
    }
    console.log("  " + line.join(""));
  }
}
for (const n of ["streamer", "boomer", "brick"] as const) await label(n);
