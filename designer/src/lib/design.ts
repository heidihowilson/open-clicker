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

export const DesignSchema = z.object({
  schema: z.literal(2),
  name: z.string().min(1).max(60),
  template: z.string().max(20),
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
  keys: z.array(KeySchema).min(1).max(40),
});
export type Design = z.infer<typeof DesignSchema>;

export function parseDesign(input: unknown): Design {
  return DesignSchema.parse(input);
}

/* Choc grid and keycap sizes. MBK caps are 17.5 × 16.5 mm at 1u, 26.5 at 1.5u and 35.5 at 2u
 * (SplitKB listings): one pitch less 0.5 mm. MCC is treated the same until a sample is measured. */
export const PITCH = { x: 18, y: 17 } as const;
export const KEYCAPS = {
  "choc-mbk": { depthMm: 16.5, heightMm: 3, verified: true },
  "choc-mcc": { depthMm: 16.5, heightMm: 3, verified: false },
} as const;
export const capWidth = (w: Key["w"]) => PITCH.x * w - 0.5;
