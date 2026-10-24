import { z } from "zod";
import { CHIP_IDS } from "./chips";

/* Actions match the firmware command names, so a design's keymap is valid firmware input. */
export const ACTIONS = [
  "up", "down", "left", "right", "ok", "back", "home", "play",
  "escape", "space", "volume_up", "volume_down", "mute", "ir_power", "none",
] as const;
export type Action = (typeof ACTIONS)[number];

export const SHELLS = ["EXO", "FOLD", "LOOP", "FIN", "OFFSET", "KEEL"] as const;

/* Positions are millimetres from the design origin, top view: x to the right, y toward the
 * bottom of the remote. Rotation is in degrees, clockwise. */
export const KeySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
  r: z.number().min(-180).max(180),
  action: z.enum(ACTIONS),
  label: z.string().max(12),
});
export type Key = z.infer<typeof KeySchema>;

export const DesignSchema = z.object({
  schema: z.literal(1),
  name: z.string().min(1).max(60),
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
  shell: z.object({
    family: z.enum(SHELLS),
    marginMm: z.number().min(2).max(20),
  }),
  keys: z.array(KeySchema).min(1).max(40),
});
export type Design = z.infer<typeof DesignSchema>;

export function parseDesign(input: unknown): Design {
  return DesignSchema.parse(input);
}

/* Keycap footprints. MBK is the published Choc keycap size; MCC is treated the same until a
 * sample is measured. */
export const KEYCAPS = {
  "choc-mbk": { widthMm: 17.5, depthMm: 16.5, heightMm: 3, verified: true },
  "choc-mcc": { widthMm: 17.5, depthMm: 16.5, heightMm: 3, verified: false },
} as const;
