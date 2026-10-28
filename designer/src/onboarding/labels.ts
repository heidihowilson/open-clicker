import { live, type CellKey, type Remote } from "./model";

/* Key labels from layout (docs: router/experiments/LABELS.md). Code reads the shapes and
 * proposes complete label sets per section; Jev picks one set per section with the whole
 * remote as context; code keeps the rules (one of each function, the red key is power).
 * This module is pure: the router asks Jev, the page only renders. */

export const FUNCTION_NAMES = {
  power: "Power", up: "Up", down: "Down", left: "Left", right: "Right", ok: "OK",
  back: "Back", home: "Home", menu: "Menu", input: "Input", info: "Info", guide: "Guide",
  play_pause: "Play/pause", rewind: "Rewind", fast_forward: "Fast forward", stop: "Stop",
  volume_up: "Volume up", volume_down: "Volume down", mute: "Mute", channel_up: "Channel up", channel_down: "Channel down",
  digit_1: "1", digit_2: "2", digit_3: "3", digit_4: "4", digit_5: "5", digit_6: "6", digit_7: "7", digit_8: "8", digit_9: "9", digit_0: "0",
  app: "App", custom: "Custom",
} as const;
export type Fn = keyof typeof FUNCTION_NAMES;

interface Candidate { id: string; about: string; labels: Fn[] }
export interface Section { id: string; keys: CellKey[]; about: string; candidates: Candidate[] }

const ROWS: Record<number, Candidate[]> = {
  1: [
    { id: "home", about: "Home", labels: ["home"] }, { id: "back", about: "Back", labels: ["back"] },
    { id: "menu", about: "Menu", labels: ["menu"] }, { id: "input", about: "Input or source", labels: ["input"] },
    { id: "mute", about: "Mute", labels: ["mute"] }, { id: "play", about: "Play/pause", labels: ["play_pause"] },
    { id: "app", about: "A streaming app shortcut", labels: ["app"] },
  ],
  2: [
    { id: "volume", about: "Volume down, volume up", labels: ["volume_down", "volume_up"] },
    { id: "channel", about: "Channel down, channel up", labels: ["channel_down", "channel_up"] },
    { id: "back_home", about: "Back, home", labels: ["back", "home"] },
    { id: "rew_ff", about: "Rewind, fast forward", labels: ["rewind", "fast_forward"] },
    { id: "apps", about: "Two streaming app shortcuts", labels: ["app", "app"] },
  ],
  3: [
    { id: "transport", about: "Rewind, play/pause, fast forward", labels: ["rewind", "play_pause", "fast_forward"] },
    { id: "system", about: "Back, home, menu", labels: ["back", "home", "menu"] },
    { id: "sound", about: "Volume down, mute, volume up", labels: ["volume_down", "mute", "volume_up"] },
    { id: "channels", about: "Channel down, guide, channel up", labels: ["channel_down", "guide", "channel_up"] },
    { id: "extras", about: "Input, info, mute", labels: ["input", "info", "mute"] },
    { id: "apps", about: "Three streaming app shortcuts", labels: ["app", "app", "app"] },
  ],
  4: [
    { id: "transport", about: "Rewind, play/pause, stop, fast forward", labels: ["rewind", "play_pause", "stop", "fast_forward"] },
    { id: "system", about: "Back, home, menu, input", labels: ["back", "home", "menu", "input"] },
    { id: "apps", about: "Four streaming app shortcuts", labels: ["app", "app", "app", "app"] },
  ],
};
/* What a second red key usually is on a TV remote. */
const RED_EXTRA: Candidate[] = [
  { id: "app", about: "A streaming app shortcut, like the red Netflix or YouTube key", labels: ["app"] },
  { id: "stop", about: "Stop playback", labels: ["stop"] },
  { id: "mute", about: "Mute", labels: ["mute"] },
  { id: "input", about: "Input or source", labels: ["input"] },
];
const NUMPAD: Record<number, Fn[]> = {
  3: ["digit_1", "digit_2", "digit_3", "digit_4", "digit_5", "digit_6", "digit_7", "digit_8", "digit_9"],
  4: ["digit_1", "digit_2", "digit_3", "digit_4", "digit_5", "digit_6", "digit_7", "digit_8", "digit_9", "guide", "digit_0", "info"],
};
const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const order = (a: CellKey, b: CellKey) => a.row - b.row || a.col - b.col;

/** Fixed labels need no judgment: the red key and a cross of five. */
export interface Plan { fixed: Map<string, Fn>; sections: Section[]; blocks: { id: string; keys: CellKey[]; rows: string[]; about: string }[] }

/** `known` holds labels the keys already carry (chosen by the person or labelled earlier).
 * They are kept as they are; only the other keys are planned. */
export function plan(r: Remote, known: Partial<Record<string, Fn>> = {}, hints: Record<string, string> = {}): Plan {
  const ks = live(r), fixed = new Map<string, Fn>(), sections: Section[] = [], blocks: Plan["blocks"] = [];
  for (const k of ks) { const fn = known[k.id]; if (fn) fixed.set(k.id, fn); }
  const at = (c: number, w: number, pool: CellKey[]) => pool.find((k) => k.col === c && k.row === w);
  const where = (rows: number[]) => {
    const mid = (Math.min(...rows) + Math.max(...rows)) / 2 / Math.max(r.rows - 1, 1);
    return mid < 0.34 ? "near the top" : mid > 0.66 ? "near the bottom" : "in the middle";
  };

  /* The labelled keys touching a section, named, so Jev sees what it sits between. */
  const beside = (keys: CellKey[]) => {
    const names: string[] = [];
    const side = (k: CellKey | undefined, where: string) => {
      const fn = k && fixed.get(k.id);
      if (fn) names.push(`${fn === "custom" ? `a key the person described as "${hints[k.id] ?? "custom"}"` : FUNCTION_NAMES[fn]} ${where}`);
    };
    const first = keys[0]!, last = keys[keys.length - 1]!;
    side(at(first.col - 1, first.row, ks), "on its left"); side(at(last.col + 1, last.row, ks), "on its right");
    for (const k of keys) { side(at(k.col, k.row - 1, ks), "above"); side(at(k.col, k.row + 1, ks), "below"); }
    return names.length ? `; next to ${[...new Set(names)].join(", ")}` : "";
  };
  /* Where a row also holds labelled keys, the familiar rows that agree with those labels
   * name the rest: Volume down, _, Volume up is the sound row, so the gap is Mute. */
  const fitting = (keys: CellKey[]): Candidate[] => {
    const row = keys[0]!.row;
    let a = keys[0]!.col, b = a;
    while (at(a - 1, row, ks)) a--;
    while (at(b + 1, row, ks)) b++;
    const run = Array.from({ length: b - a + 1 }, (_, i) => at(a + i, row, ks)!);
    /* Only an unbroken run that holds every key of the section, plus labelled keys. */
    if (run.length === keys.length || !keys.every((k) => run.includes(k))) return [];
    return (ROWS[run.length] ?? []).filter((c) => run.every((k, i) => !fixed.has(k.id) || fixed.get(k.id) === c.labels[i]))
      .map((c) => ({ id: `fit_${c.id}`, about: `${c.about} (matching the labelled keys in this row)`, labels: keys.map((k) => c.labels[run.indexOf(k)]!) }));
  };

  /* The first red key (reading order) is power. Another red key is something else red keys
   * are used for, chosen by Jev like any single key. */
  const reds = ks.filter((k) => k.color === "red" && !fixed.has(k.id)).sort(order);
  const powerTaken = [...fixed.values()].includes("power");
  if (reds[0] && !powerTaken) fixed.set(reds[0].id, "power");
  for (const k of reds.slice(powerTaken ? 0 : 1)) {
    sections.push({ id: `red${k.row}c${k.col}`, keys: [k], about: `a single red key, row ${k.row + 1} of ${r.rows}, ${where([k.row])}; the remote's power key is a different red key`, candidates: RED_EXTRA });
  }
  const rest = ks.filter((k) => k.color !== "red" && !fixed.has(k.id));

  /* Connected groups of the remaining keys. */
  const seen = new Set<string>(), groups: CellKey[][] = [];
  for (const k of [...rest].sort(order)) {
    if (seen.has(k.id)) continue;
    const g: CellKey[] = [], stack = [k]; seen.add(k.id);
    while (stack.length) {
      const x = stack.pop()!; g.push(x);
      for (const [dc, dr] of NEAR) { const n = at(x.col + dc, x.row + dr, rest); if (n && !seen.has(n.id)) { seen.add(n.id); stack.push(n); } }
    }
    groups.push(g.sort(order));
  }

  for (const whole of groups) {
    /* A key with all four neighbours and at least two empty corners is the centre of a
     * navigation cross, even when other keys touch the cross. Inside a solid block only a
     * light key counts as a centre, so a plain 3 × 3 block stays a candidate number pad. */
    const open = (k: CellKey) => [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dc, dr]) => !at(k.col + dc!, k.row + dr!, whole)).length;
    const centres = whole.filter((k) => NEAR.every(([dc, dr]) => at(k.col + dc, k.row + dr, whole)) && (k.color === "light" || open(k) >= 2));
    const centre = centres.find((k) => k.color === "light") ?? (centres.length === 1 ? centres[0] : undefined);
    let g = whole;
    if (centre) {
      const arms = NEAR.map(([dc, dr]) => at(centre.col + dc, centre.row + dr, whole)!);
      for (const k of [centre, ...arms]) fixed.set(k.id, k === centre ? "ok" : k.row < centre.row ? "up" : k.row > centre.row ? "down" : k.col < centre.col ? "left" : "right");
      g = whole.filter((k) => !fixed.has(k.id));
      if (!g.length) continue;
    }
    const rows = [...new Set(g.map((k) => k.row))];
    const rowIds: string[] = [];
    for (const row of rows) {
      const keys = g.filter((k) => k.row === row).sort(order);
      const light = keys.filter((k) => k.color === "light").length;
      const id = `r${row}c${keys[0]!.col}`;
      rowIds.push(id);
      sections.push({
        id, keys,
        about: `${keys.length === 1 ? "a single key" : `a row of ${keys.length} keys`}${light ? ` (${light} light grey)` : ""}, row ${row + 1} of ${r.rows}, ${where([row])}${beside(keys)}`,
        candidates: [...fitting(keys), ...(ROWS[keys.length] ?? [{ id: "apps", about: `${keys.length} streaming app shortcuts`, labels: keys.map(() => "app") }])]
          .filter((c, i, all) => all.findIndex((x) => x.labels.join() === c.labels.join()) === i),
      });
    }
    /* A run of 3 or 4 consecutive full rows, 3 keys wide, may be a number pad instead of
     * separate rows. Take the first such run in the group, as long as it can be. */
    const full = rows.filter((row) => { const ks = g.filter((k) => k.row === row); return ks.length === 3 && Math.max(...ks.map((k) => k.col)) - Math.min(...ks.map((k) => k.col)) === 2; });
    for (let i = 0; i < full.length; i++) {
      let n = 1;
      while (i + n < full.length && full[i + n] === full[i]! + n && n < 4) n++;
      if (n < 3) continue;
      const span = full.slice(i, i + n);
      blocks.push({ id: `b${span[0]}`, keys: g.filter((k) => span.includes(k.row)).sort(order), rows: span.map((row) => rowIds[rows.indexOf(row)]!), about: `a solid block of ${n} rows by 3 columns, ${where(span)}` });
      break;
    }
  }
  return { fixed, sections, blocks };
}

/** The Jev request: one Choice per section and per block, all in one call. */
export function request(r: Remote, p: Plan) {
  const fixed = [...p.fixed.values()].filter((f) => f !== "custom");
  const state = {
    remote: `A TV remote with ${live(r).length} blank keys in ${r.rows} rows. A person laid it out to look like a familiar TV remote.`,
    already_known: fixed.length ? `These keys are already labelled: ${[...new Set(fixed)].map((f) => FUNCTION_NAMES[f]).join(", ")}.` : "No key is labelled yet.",
    sections: p.sections.map((s) => s.about),
    blocks: p.blocks.map((b) => b.about),
  };
  const questions: Record<string, unknown> = {};
  p.sections.forEach((s, i) => {
    questions[`s:${s.id}`] = {
      type: "choice",
      instructions: `Which functions most likely belong to the keys described in \`sections[${i}]\`, from left to right, on this remote? Keys that are already labelled will not repeat.`,
      criteria: Object.fromEntries(s.candidates.map((c) => [c.id, c.about])),
    };
  });
  /* A two-way Choice reads better than a yes/no here: Jev compares the two uses directly. */
  p.blocks.forEach((b, i) => {
    questions[`b:${b.id}`] = {
      type: "choice",
      instructions: `How is the block of keys described in \`blocks[${i}]\` most likely used on this TV remote?`,
      criteria: {
        number_pad: "A number pad: 1 2 3 / 4 5 6 / 7 8 9, and on a fourth row guide, 0, info, for typing channel numbers",
        separate_rows: "Separate rows of other controls, such as playback, volume, channels or navigation shortcuts",
      },
    };
  });
  return { state, questions };
}

/** A key's label, and up to three other likely functions for it (best first) for the picker. */
export interface Label { fn: Fn; confidence: number; alts: Fn[] }
type Answers = Record<string, { choice?: string; probabilities?: Record<string, number> }>;

/** Turn Jev's answers into one label per key: numbers first where a block is a number pad,
 * then each section's likeliest set whose functions are still free (apps may repeat). */
export function resolve(p: Plan, answers: Answers, threshold = 0.5): Map<string, Label> {
  const out = new Map<string, Label>();
  const used = new Set<Fn>();
  for (const [id, fn] of p.fixed) { out.set(id, { fn, confidence: 1, alts: [] }); used.add(fn); }
  /* Each key's likely functions, from its section's label sets in Jev's order. */
  const altsFor = new Map<string, Fn[]>();
  for (const s of p.sections) {
    const probs = answers[`s:${s.id}`]?.probabilities ?? {};
    const sets = [...s.candidates].sort((a, b) => (probs[b.id] ?? 0) - (probs[a.id] ?? 0));
    s.keys.forEach((k, i) => altsFor.set(k.id, [...new Set(sets.map((c) => c.labels[i]!))]));
  }
  const covered = new Set<string>();
  for (const b of p.blocks) {
    const yes = answers[`b:${b.id}`]?.probabilities?.number_pad ?? 0;
    if (yes < threshold) continue;
    const digits = NUMPAD[b.rows.length]!;
    b.keys.forEach((k, i) => { out.set(k.id, { fn: digits[i]!, confidence: yes, alts: altsFor.get(k.id) ?? [] }); used.add(digits[i]!); });
    b.rows.forEach((r) => covered.add(r));
  }
  const ranked = p.sections.filter((s) => !covered.has(s.id)).map((s) => {
    const probs = answers[`s:${s.id}`]?.probabilities ?? {};
    return { s, options: [...s.candidates].sort((a, b) => (probs[b.id] ?? 0) - (probs[a.id] ?? 0)).map((c) => ({ c, p: probs[c.id] ?? 0 })) };
  }).sort((a, b) => (b.options[0]?.p ?? 0) - (a.options[0]?.p ?? 0));
  for (const { s, options } of ranked) {
    const pick = options.find(({ c }) => c.labels.every((f) => f === "app" || f === "custom" || !used.has(f)));
    if (!pick) continue;
    s.keys.forEach((k, i) => out.set(k.id, { fn: pick.c.labels[i]!, confidence: pick.p, alts: (altsFor.get(k.id) ?? []).filter((f) => f !== pick.c.labels[i]).slice(0, 3) }));
    for (const f of pick.c.labels) used.add(f);
  }
  return out;
}

/* Hints: words a person typed for a key ("skip ads", "the Netflix button"). Jev reads each
 * one as a function, or as custom when no function fits; a custom key shows an emblem, and
 * the words stay with the key for the phone to set up later. */
const HINT_CRITERIA: Record<string, string> = {
  ...FUNCTION_NAMES,
  app: "Opens a streaming app, such as Netflix, YouTube or Jellyfin",
  custom: "None of these: something else the person will set up themselves",
};
export function hintRequest(hints: string[]) {
  return {
    state: { hints },
    questions: Object.fromEntries(hints.map((_, i) => [`h${i}`, {
      type: "choice",
      instructions: `A person wrote \`hints[${i}]\` to describe what one key on their TV remote does. Which of these functions is it? If it is none of them, choose custom.`,
      criteria: HINT_CRITERIA,
    }])),
  };
}
/** A hint's function: Jev's choice when it is fairly sure, otherwise custom. */
export function readHint(answer: { probabilities?: Record<string, number> } | undefined, threshold = 0.5): Label {
  const ranked = Object.entries(answer?.probabilities ?? {}).sort((a, b) => b[1] - a[1]) as [Fn, number][];
  const [fn, p] = ranked[0] ?? ["custom", 0];
  const alts = ranked.slice(0, 4).map(([f]) => f).filter((f) => f !== "custom" && f !== fn).slice(0, 3);
  return p >= threshold ? { fn, confidence: p, alts } : { fn: "custom", confidence: 1 - p, alts: ranked.slice(0, 3).map(([f]) => f).filter((f) => f !== "custom") };
}
