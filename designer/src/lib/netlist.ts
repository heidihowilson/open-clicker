import { CHIPS, padOf, type Pin } from "./chips";
import { readingOrder, type Design } from "./design";
import { planPins, type PinPlan } from "./matrix";

/* The schematic as data: every part with its designator, value and footprint, and every pin
 * on a named net. It follows from the design file alone, so the same file always yields the
 * same netlist. The KiCad generator reads this; nothing here is hand-edited. */

export interface Part {
  ref: string;
  value: string;
  footprint: string;
  /** Pin name -> net name. */
  pins: Record<string, string>;
  /** The key this part belongs to, for switches and diodes. */
  keyId?: string;
  /** JLCPCB/LCSC part number for factory assembly; absent for footprints that are only copper. */
  lcsc?: string;
}
export interface Netlist {
  design: { id: string; name: string; revision: number };
  parts: Part[];
  nets: string[];
}

/* Footprint library ids. All come from published libraries; router/footprints/README.md says
 * which. The board is built from them by KiCad itself on the router (router/board.py). */
export const FOOTPRINTS = {
  module: "OpenClicker:u-blox_BMD-340",
  usb: "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
  charger: "Package_TO_SOT_SMD:SOT-23-5",
  swd: "Connector:Tag-Connect_TC2030-IDC-NL_2x03_P1.27mm_Vertical",
  switch: "OpenClicker:SW_Hotswap_Kailh_Choc_V1",
  diode: "Diode_SMD:D_SOD-123",
  battery: "Connector_JST:JST_PH_S2B-PH-SM4-TB_1x02-1MP_P2.00mm_Horizontal",
  r0805: "Resistor_SMD:R_0805_2012Metric",
  c0805: "Capacitor_SMD:C_0805_2012Metric",
  led0805: "LED_SMD:LED_0805_2012Metric",
  irLed: "LED_THT:LED_D3.0mm",
  sot23: "Package_TO_SOT_SMD:SOT-23",
  irReceiver: "OptoDevice:Vishay_MOLD-3Pin",
} as const;

export interface Designators {
  /** keyId -> { switch, diode, row, column } */
  keys: Map<string, { sw: string; d: string; row: number; col: number }>;
}

export function designators(design: Design, plan: PinPlan): Designators {
  const keys = new Map<string, { sw: string; d: string; row: number; col: number }>();
  readingOrder(design.keys).forEach((k, i) => {
    const [row, col] = plan.positions.get(k.id) ?? [0, 0];
    keys.set(k.id, { sw: `SW${i + 1}`, d: `D${i + 1}`, row, col });
  });
  return { keys };
}

export function netlist(design: Design): Netlist {
  const plan = planPins(design);
  if (!plan.ok) throw new Error(plan.reason);
  const chip = CHIPS[design.chip];
  const refs = designators(design, plan);
  const parts: Part[] = [];

  /* The module runs in high-voltage mode (data sheet §3.3): the cell feeds VCCH directly and
   * VCC is the module's own 3.0 V output, the logic level for everything on its pins. USB 5 V
   * reaches only VBUS, the USB PHY's supply. Module pads are numbered, so pins go by pad. */
  const u1: Record<string, string> = {};
  for (const [pad, name] of Object.entries(chip.pads)) if (name === "GND") u1[pad] = "GND";
  u1[padOf(chip, "VCC")] = "VCC";
  u1[padOf(chip, "VCCH")] = "VBAT";
  u1[padOf(chip, "VBUS")] = "VBUS";
  u1[padOf(chip, "USB-D-")] = "USB_DN";
  u1[padOf(chip, "USB-D+")] = "USB_DP";
  u1[padOf(chip, "SWDIO")] = "SWDIO";
  u1[padOf(chip, "SWCLK")] = "SWCLK";
  u1[padOf(chip, "P0.18")] = "RESET";
  const on = (pin: Pin | null, net: string) => { if (pin) u1[padOf(chip, pin.id)] = net; };
  plan.columns.forEach((p, i) => on(p, `COL${i}`));
  plan.rows.forEach((p, i) => on(p, `ROW${i}`));
  on(plan.irTransmit, "IR_TX");
  on(plan.irReceive, "IR_RX");
  parts.push({ ref: "U1", value: "BMD-340-A-R-01", lcsc: "C5456944", footprint: FOOTPRINTS.module, pins: u1 });

  /* Column to row: the switch joins its column to a node, the diode's cathode goes to the row. */
  for (const k of readingOrder(design.keys)) {
    const r = refs.keys.get(k.id)!;
    const node = `K${r.sw.slice(2)}`;
    parts.push({ ref: r.sw, value: "Choc V1 hot-swap socket", lcsc: "C5333465", footprint: FOOTPRINTS.switch, pins: { "1": `COL${r.col}`, "2": node }, keyId: k.id });
    parts.push({ ref: r.d, value: "1N4148W", lcsc: "C81598", footprint: FOOTPRINTS.diode, pins: { A: node, K: `ROW${r.row}` }, keyId: k.id });
  }

  /* USB-C as a sink: 5.1k on each CC pin asks the host for 5 V. Pads go by the connector's
   * own names; both plug orientations are tied together, and the shield goes to ground. */
  parts.push(
    { ref: "J1", value: "USB-C, HRO TYPE-C-31-M-12", lcsc: "C165948", footprint: FOOTPRINTS.usb, pins: {
      A4: "VBUS", A9: "VBUS", B4: "VBUS", B9: "VBUS", A1: "GND", A12: "GND", B1: "GND", B12: "GND", A5: "CC1", B5: "CC2",
      A6: "USB_DP", B6: "USB_DP", A7: "USB_DN", B7: "USB_DN", S1: "GND" } },
    { ref: "R5", value: "5.1k", lcsc: "C27834", footprint: FOOTPRINTS.r0805, pins: { "1": "CC1", "2": "GND" } },
    { ref: "R6", value: "5.1k", lcsc: "C27834", footprint: FOOTPRINTS.r0805, pins: { "1": "CC2", "2": "GND" } },
  );

  /* Charging: MCP73831 from USB 5 V into the cell. PROG 10k sets 100 mA, gentle for a
   * 250 mAh cell. STAT pulls low while charging and lights LED2. */
  parts.push(
    { ref: "U3", value: "MCP73831T-2ACI/OT", lcsc: "C424093", footprint: FOOTPRINTS.charger, pins: { STAT: "CHG_STAT", VSS: "GND", VBAT: "VBAT", VDD: "VBUS", PROG: "CHG_PROG" } },
    { ref: "R7", value: "10k", lcsc: "C17414", footprint: FOOTPRINTS.r0805, pins: { "1": "CHG_PROG", "2": "GND" } },
    { ref: "C2", value: "4.7u", lcsc: "C1779", footprint: FOOTPRINTS.c0805, pins: { "1": "VBUS", "2": "GND" } },
    { ref: "C3", value: "4.7u", lcsc: "C1779", footprint: FOOTPRINTS.c0805, pins: { "1": "VBAT", "2": "GND" } },
    { ref: "R8", value: "1k", lcsc: "C17513", footprint: FOOTPRINTS.r0805, pins: { "1": "VBUS", "2": "CHG_LED" } },
    { ref: "LED2", value: "Charging, red", lcsc: "C84256", footprint: FOOTPRINTS.led0805, pins: { A: "CHG_LED", K: "CHG_STAT" } },
  );

  /* The cell plugs into J2. Check its lead polarity against pin 1 before plugging it in. */
  parts.push({ ref: "J2", value: "Battery, JST-PH 2-pin", lcsc: "C54582899", footprint: FOOTPRINTS.battery, pins: { "1": "VBAT", "2": "GND" } });

  /* SWD for the one-time bootloader flash: a Tag-Connect TC2030 pad, no connector to fit. */
  parts.push({ ref: "J3", value: "SWD, Tag-Connect TC2030", footprint: FOOTPRINTS.swd, pins: { "1": "VCC", "2": "SWDIO", "3": "RESET", "4": "SWCLK", "5": "GND" } });

  if (design.options.irTransmit) {
    /* A low-side NPN switches the LED straight from the cell, so its ~100 mA pulses never load
     * the module's 25 mA VCC output; R1 sets the current. */
    parts.push(
      { ref: "R1", value: "22R", lcsc: "C17561", footprint: FOOTPRINTS.r0805, pins: { "1": "VBAT", "2": "IR_A" } },
      { ref: "LED1", value: "IR LED 940 nm", lcsc: "C98863", footprint: FOOTPRINTS.irLed, pins: { A: "IR_A", K: "IR_K" } },
      { ref: "Q1", value: "MMBT2222A", lcsc: "C8512", footprint: FOOTPRINTS.sot23, pins: { B: "IR_B", C: "IR_K", E: "GND" } },
      { ref: "R2", value: "1k", lcsc: "C17513", footprint: FOOTPRINTS.r0805, pins: { "1": "IR_TX", "2": "IR_B" } },
    );
  }
  if (design.options.irReceive) {
    parts.push(
      { ref: "U2", value: "TSOP38238", lcsc: "C141632", footprint: FOOTPRINTS.irReceiver, pins: { OUT: "IR_RX", GND: "GND", VS: "VCC" } },
      { ref: "C1", value: "100n", lcsc: "C49678", footprint: FOOTPRINTS.c0805, pins: { "1": "VCC", "2": "GND" } },
    );
  }

  const nets = [...new Set(parts.flatMap((p) => Object.values(p.pins)))].sort();
  return { design: { id: design.id, name: design.name, revision: design.revision }, parts, nets };
}

/** Largest key count this chip and these options allow, found by asking the planner. */
export function keyCapacity(design: Design): number {
  let most = 0;
  for (let n = 1; n <= 40; n++) {
    const keys = Array.from({ length: n }, (_, i) => ({ id: `k${i}`, x: i * 18, y: 0, w: 1 as const, action: "none" as const, label: "" }));
    if (planPins({ ...design, keys }).ok) most = n; else if (most) break;
  }
  return most;
}
