import { CIRCUIT, PITCH, type Design } from "../lib/design";
import { boardBounds, SHELL_RULES } from "../lib/geometry";
import { tiers, type Tier } from "../lib/pricing";
import { SHELL } from "../lib/parts-data";

/* The first-visit editor's model (docs/onboarding/SPEC.md). A remote is a key area of whole
 * grid cells and keys that each sit in one cell with one of three colours. Every other choice
 * is fixed for now (docs/onboarding/PLAN.md §2.3). */

export type CapColor = "charcoal" | "light" | "red";
export interface CellKey { id: string; col: number; row: number; color: CapColor }
export interface Remote { cols: number; rows: number; keys: CellKey[] }

/** Cap colours, base and top face (SPEC §3). */
export const CAPS: Record<CapColor, { base: string; top: string }> = {
  charcoal: { base: "#232325", top: "#39393c" },
  light: { base: "#c6c6cb", top: "#ececf0" },
  red: { base: "#b8261d", top: "#ff453a" },
};
export const SHELL_COLOR = "#161618";

/* The XIAO ESP32-C6 with IR scans a 7 × 3 matrix: 21 keys. Battery-level reporting would
 * take a pin and drop that to 14, so it is off in this version. */
export const MAX_KEYS = 21;
export const MAX_COLS = 5;
export const MAX_ROWS = 12;
/** Two rows is the least that leaves room for the battery above the controller. */
export const MIN_ROWS = 2;
export const MIN_COLS = 1;

export interface Layout { name: string; cols: number; rows: number; keys: [number, number, CapColor][] }

const grid = (cols: number[], rows: number[]): [number, number][] => rows.flatMap((r) => cols.map((c) => [c, r] as [number, number]));
const paint = (pts: [number, number][], red: number, light: number): [number, number, CapColor][] =>
  pts.map(([c, r], i) => [c, r, i === red ? "red" : i === light ? "light" : "charcoal"]);

/* Layouts from SPEC §3.1, in cells, cut to what one controller scans. */
export const LAYOUTS: Record<"streamer" | "boomer" | "brick" | "blank", Layout> = {
  /* back/power; D-pad with select; home/mute/menu; rew/play/ff; vol −/+ */
  streamer: { name: "The Streamer", cols: 3, rows: 8, keys: paint([[0, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2], [1, 3], [0, 5], [1, 5], [2, 5], [0, 6], [1, 6], [2, 6], [0, 7], [2, 7]], 1, 4) },
  /* input/mute/power; numpad with guide/0/info; nav cross with back */
  boomer: { name: "The Boomer", cols: 3, rows: 9, keys: paint([[0, 0], [1, 0], [2, 0], ...grid([0, 1, 2], [1, 2, 3, 4]), [0, 6], [1, 6], [0, 7], [1, 7], [2, 7], [1, 8]], 2, 18) },
  /* a solid grid in the original Brick's proportions */
  brick: { name: "The Brick", cols: 3, rows: 6, keys: paint(grid([0, 1, 2], [0, 1, 2, 3, 4, 5]), 2, -1) },
  blank: { name: "Blank", cols: 3, rows: 6, keys: [] },
};

let serial = 0;
export const newId = () => `k${++serial}-${Math.random().toString(36).slice(2, 6)}`;
export function fromLayout(l: Layout): Remote {
  return { cols: l.cols, rows: l.rows, keys: l.keys.map(([col, row, color]) => ({ id: newId(), col, row, color })) };
}

export const inside = (r: Remote, k: { col: number; row: number }) => k.col >= 0 && k.row >= 0 && k.col < r.cols && k.row < r.rows;
export const live = (r: Remote) => r.keys.filter((k) => inside(r, k));
export const occupied = (r: Remote, col: number, row: number, except?: string) =>
  r.keys.some((k) => k.id !== except && k.col === col && k.row === row && inside(r, k));

/** Smallest key area that keeps every live key: never smaller than the first occupied column/row. */
export function minSize(r: Remote): { cols: number; rows: number } {
  const ks = live(r);
  const firstCol = ks.length ? Math.min(...ks.map((k) => k.col)) : 0;
  const firstRow = ks.length ? Math.min(...ks.map((k) => k.row)) : 0;
  return { cols: Math.max(MIN_COLS, firstCol + 1), rows: Math.max(MIN_ROWS, firstRow + 1) };
}

/* ---- millimetres: key centres on the Choc pitch, the key area from cell edges ---- */
export const cellX = (col: number) => col * PITCH.x;
export const cellZ = (row: number) => row * PITCH.y;
export const colAt = (x: number) => Math.round(x / PITCH.x);
export const rowAt = (z: number) => Math.round(z / PITCH.y);

/** The design file the rest of the toolchain (3D parts, pricing, KiCad, router) reads. */
export function toDesign(r: Remote, name = "My Open Clicker"): Design {
  const keys = live(r);
  return {
    schema: 3, id: "onboarding-remote", revision: 0, name, template: "custom",
    chip: "xiao-esp32c6", keycap: "choc-mbk",
    options: { irTransmit: true, irReceive: false, batterySense: false },
    battery: { capacityMah: 250, lengthMm: 30, widthMm: 20, thicknessMm: 5 },
    circuit: { ...CIRCUIT },
    outline: { cols: r.cols, rows: r.rows },
    keys: (keys.length ? keys : [{ id: "placeholder", col: 0, row: 0, color: "charcoal" as const }])
      .map((k) => ({ id: k.id, x: cellX(k.col), y: cellZ(k.row), w: 1 as const, action: "none" as const, label: "" })),
  };
}

/** Outer shell rectangle in mm (key area, margins, the bottom bay for the electronics, walls). */
export function shellRect(r: Remote) {
  const b = boardBounds(toDesign(r));
  const grow = SHELL_RULES.wall + SHELL.clearance;
  return { minX: b.minX - grow, minZ: b.minY - grow, maxX: b.maxX + grow, maxZ: b.maxY + grow };
}

/* ---- buying ---- */
export type TierId = "diy" | "kit" | "complete";
export const TIERS: { id: TierId; name: string; line: string; from: Tier["id"] }[] = [
  { id: "diy", name: "DIY", line: "Bare parts. You solder, you print.", from: "kit" },
  { id: "kit", name: "Kit", line: "Assembled board. You print the shell.", from: "half-built" },
  { id: "complete", name: "Complete", line: "Ready out of the box.", from: "assembled" },
];
export function quote(r: Remote, id: TierId): Tier {
  const all = tiers(toDesign(r));
  return all.find((t) => t.id === TIERS.find((x) => x.id === id)!.from)!;
}
export const total = (t: Tier) => t.priceUsd ?? t.costUsd;
