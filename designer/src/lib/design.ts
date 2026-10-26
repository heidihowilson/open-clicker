import { z } from "zod";
import { ACTIONS } from "./actions";
import { CHIP_IDS } from "./chips";

export { ACTIONS, type Action } from "./actions";

/* Positions are millimetres from the design origin, top view: x to the right, y toward the
 * bottom of the remote. Keys sit on the Choc grid (18 × 17 mm); x may land on half a pitch so
 * 1.5u and 2u keys can centre between columns. Keys are never rotated. */
export const KeySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
  w: z.union([z.literal(1), z.literal(1.5), z.literal(2)]),
  action: z.enum(ACTIONS),
  /** Optional text legend that replaces the action's own, four characters at most. */
  label: z.string().max(4),
});
export type Key = z.infer<typeof KeySchema>;

export const TEMPLATE_IDS = ["tile", "slab", "deck", "column", "custom"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/* The circuit conventions the schematic generator follows. Written into every file, so an old
 * file still produces the same board after a default changes. One value each for now. */
export const CIRCUIT = {
  matrix: "col2row",
  switch: "choc-v1-hotswap",
  diode: "1n4148w-sod123",
  battery: "jst-ph-2",
  irLed: "ir-5mm-940",
  irReceiver: "tsop38238",
} as const;
export const CircuitSchema = z.object({
  matrix: z.literal(CIRCUIT.matrix),
  switch: z.literal(CIRCUIT.switch),
  diode: z.literal(CIRCUIT.diode),
  battery: z.literal(CIRCUIT.battery),
  irLed: z.literal(CIRCUIT.irLed),
  irReceiver: z.literal(CIRCUIT.irReceiver),
});

export const DesignSchema = z.object({
  schema: z.literal(3),
  /** Set once when the design is created; names the board in the KiCad title block. */
  id: z.string().regex(/^[a-z0-9-]{8,64}$/),
  /** Bumped on every export, so two boards from one design can be told apart. */
  revision: z.number().int().min(0),
  name: z.string().min(1).max(60),
  template: z.enum(TEMPLATE_IDS),
  chip: z.enum(CHIP_IDS),
  keycap: z.enum(["choc-mbk", "choc-mcc"]),
  options: z.object({
    irTransmit: z.boolean(),
    irReceive: z.boolean(),
    batterySense: z.boolean(),
  }),
  battery: z.object({
    capacityMah: z.number().int().min(50).max(3000),
    lengthMm: z.number().min(10).max(120),
    widthMm: z.number().min(5).max(60),
    thicknessMm: z.number().min(2).max(15),
  }),
  circuit: CircuitSchema,
  keys: z.array(KeySchema).min(1).max(40),
}).superRefine((d, ctx) => {
  /* Reading order (top to bottom, then left to right) numbers the switches and diodes, so it
   * must be total: no two keys share an id or a centre. */
  const ids = new Set<string>(), spots = new Set<string>();
  d.keys.forEach((k, i) => {
    if (ids.has(k.id)) ctx.addIssue({ code: "custom", path: ["keys", i, "id"], message: `Two keys are called ${k.id}.` });
    const spot = `${k.x},${k.y}`;
    if (spots.has(spot)) ctx.addIssue({ code: "custom", path: ["keys", i], message: `Two keys sit at ${k.x}, ${k.y} mm.` });
    ids.add(k.id); spots.add(spot);
  });
});
export type Design = z.infer<typeof DesignSchema>;

export const newDesignId = () => crypto.randomUUID();

/* Schema 2 files (before 2026-10-26) lack the id, revision and circuit block, and name the
 * template freely. Upgrade them on load; everything else is unchanged. */
function upgrade(input: unknown): unknown {
  if (typeof input !== "object" || input === null || (input as { schema?: unknown }).schema !== 2) return input;
  const old = input as Record<string, unknown>;
  const template = String(old.template ?? "").toLowerCase();
  return {
    ...old,
    schema: 3,
    id: newDesignId(),
    revision: 0,
    template: (TEMPLATE_IDS as readonly string[]).includes(template) ? template : "custom",
    circuit: { ...CIRCUIT },
  };
}

export function parseDesign(input: unknown): Design {
  return DesignSchema.parse(upgrade(input));
}
export function safeParseDesign(input: unknown) {
  return DesignSchema.safeParse(upgrade(input));
}

/* Choc grid and keycap sizes. MBK caps are 17.5 × 16.5 mm at 1u, 26.5 at 1.5u and 35.5 at 2u
 * (SplitKB listings): one pitch less 0.5 mm. MCC is treated the same until a sample is measured. */
export const PITCH = { x: 18, y: 17 } as const;
export const KEYCAPS = {
  "choc-mbk": { depthMm: 16.5, heightMm: 3, verified: true },
  "choc-mcc": { depthMm: 16.5, heightMm: 3, verified: false },
} as const;
export const capWidth = (w: Key["w"]) => PITCH.x * w - 0.5;

/** Keys in reading order: top to bottom, then left to right. Numbers SW1..SWn and D1..Dn. */
export const readingOrder = (keys: Key[]) => [...keys].sort((a, b) => a.y - b.y || a.x - b.x);
