import { CHIPS } from "./chips";
import type { Design } from "./design";
import { planPins } from "./matrix";
import { designators } from "./netlist";

export interface Keymap {
  design: string;
  chip: string;
  rows: string[];
  columns: string[];
  /** [row][column] -> action, or null for an empty matrix position. */
  map: (string | null)[][];
  irTransmit: string | null;
  irReceive: string | null;
  battery: string | null;
}

export function keymap(design: Design): Keymap {
  const plan = planPins(design);
  if (!plan.ok) throw new Error(plan.reason);
  const map: (string | null)[][] = plan.rows.map(() => plan.columns.map(() => null));
  for (const key of design.keys) {
    const at = plan.positions.get(key.id);
    if (at) map[at[0]]![at[1]] = key.action;
  }
  return {
    design: design.name,
    chip: CHIPS[design.chip].label,
    rows: plan.rows.map((p) => p.id),
    columns: plan.columns.map((p) => p.id),
    map,
    irTransmit: plan.irTransmit?.id ?? null,
    irReceive: plan.irReceive?.id ?? null,
    battery: plan.battery?.id ?? null,
  };
}

/* The layout file. `derived` carries the pin plan and designators for readers that do not run
 * the planner; it is output only, and loading the file drops it. */
export function layoutFile(design: Design): string {
  const plan = planPins(design);
  const derived = plan.ok ? {
    rows: plan.rows.map((p) => p.id),
    columns: plan.columns.map((p) => p.id),
    irTransmit: plan.irTransmit?.id ?? null,
    irReceive: plan.irReceive?.id ?? null,
    battery: plan.battery?.id ?? null,
    keys: Object.fromEntries([...designators(design, plan).keys].map(([id, r]) => [id, r])),
  } : null;
  return JSON.stringify({ ...design, derived }, null, 2);
}
