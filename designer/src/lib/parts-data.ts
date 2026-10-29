/* Physical dimensions for the 3D models, in millimetres. Each block names its source. Values
 * marked approx are envelopes to check with calipers when parts arrive. */

/** Kailh Choc V1 (PG1350). Footprint from Ergogen's choc.js; heights approx (15 × 15 × 8 mm overall per retailer listings). */
export const CHOC = {
  /* The bottom housing passes through the plate cutout; the wider top housing sits on it. */
  bottom: { size: 13.8, height: 2.2 },
  top: { size: 15, height: 2.8 },
  stem: { width: 1.2, depth: 3.0, height: 1.0, spacing: 5.7 },
  centerPost: { diameter: 3.429, length: 2.65 },
  sidePosts: { diameter: 1.7018, x: 5.5, length: 2.0 },
  pins: [{ x: 5, y: -3.8 }, { x: 0, y: -5.9 }],
  pinDrill: 1.27,
  pinLength: 3.0,
  keycapSpacing: { x: 18, y: 17 },
  approx: true,
} as const;

/** MBK Choc keycap, 1u: 17.5 × 16.5 mm (SplitKB listings). Height approx. */
export const MBK = { width: 17.5, depth: 16.5, height: 3.0, radius: 1.6, seat: 5.2, approx: true } as const;

/**
 * XIAO outline and pads from Seeed's OPL KiCad library (XIAO-ESP32-C6-DIP.kicad_mod): body
 * x -10.425..10.55 by y ±8.9, two rows of seven pads at y ±7.62 on a 2.54 mm pitch, pad 1 at
 * (7.62, -7.62) beside USB-C at +x. Board thickness measured by makers at 1.17–1.27 mm.
 */
export const XIAO_BOARD = {
  minX: -10.425, maxX: 10.55, halfWidth: 8.9, thickness: 1.2,
  padRow: 7.62, padPitch: 2.54, padDiameter: 1.524, padDrill: 0.889,
  usb: { width: 8.94, height: 3.26, depth: 7.35, overhang: 1.5 },
  chip: { size: 5, height: 0.9, x: -1.5, y: 0 },
  antenna: { width: 3.2, depth: 1.6, height: 1.1, x: -8.2, y: 4.8 },
  buttons: [{ x: 6.4, y: 4.5 }, { x: 6.4, y: -4.5 }],
  approxComponents: true,
} as const;

/** SOD-123 diode, one per key, on the back. */
export const DIODE = { length: 2.7, width: 1.6, height: 1.1, lead: 0.5, offset: { x: 0, y: 4.2 } } as const;

/** IR LED: Everlight IR928-6C-F, a through-hole side-looker standing at the top edge with its
 * lens facing forward (datasheet DIR-0001543). Body 4.6 wide, 4.5 tall, 1.7 deep; the Ø1.5 lens
 * stands 0.8 proud of the front face, 2.9 above the board. The leads sit 0.75 in from the back
 * face. Receiver: TSOP-style, approx envelope. */
export const IR = {
  led: { width: 4.6, height: 4.5, depth: 1.7, leadsFromBack: 0.75, lens: 1.5, lensProud: 0.8, lensZ: 2.9 },
  receiver: { width: 5.6, height: 6.5, depth: 4.4 },
} as const;

export const PCB = { thickness: 1.6, cornerRadius: 6 } as const;
export const SHELL = { wall: 1.8, floor: 1.5, clearance: 0.6, bezel: 1.5 } as const;
