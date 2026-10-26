import { CHIPS, type Pin } from "./chips";
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
}
export interface Netlist {
  design: { id: string; name: string; revision: number };
  parts: Part[];
  nets: string[];
}

/* Footprint names. Every pad is drawn by kicad.ts, so the board needs no library. */
export const FOOTPRINTS = {
  xiao: "OpenClicker:XIAO_Back",
  switch: "OpenClicker:Choc_V1_Hotswap",
  diode: "OpenClicker:D_SOD-123",
  battery: "OpenClicker:JST_PH_B2B-PH-K_Vertical",
  batteryLink: "OpenClicker:Wire_Pads_2",
  r0805: "OpenClicker:R_0805",
  c0805: "OpenClicker:C_0805",
  irLed: "OpenClicker:LED_D3.0mm",
  sot23: "OpenClicker:SOT-23",
  irReceiver: "OpenClicker:IR_Receiver_3Pin",
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

  /* The controller: every used pin on its net, the rest unconnected. */
  const xiao: Record<string, string> = { "3V3": "3V3", GND: "GND" };
  const on = (pin: Pin | null, net: string) => { if (pin) xiao[pin.id] = net; };
  plan.columns.forEach((p, i) => on(p, `COL${i}`));
  plan.rows.forEach((p, i) => on(p, `ROW${i}`));
  on(plan.irTransmit, "IR_TX");
  on(plan.irReceive, "IR_RX");
  on(plan.battery, "VBAT_SENSE");
  parts.push({ ref: "U1", value: chip.label, footprint: FOOTPRINTS.xiao, pins: xiao });

  /* Column to row: the switch joins its column to a node, the diode's cathode goes to the row. */
  for (const k of readingOrder(design.keys)) {
    const r = refs.keys.get(k.id)!;
    const node = `K${r.sw.slice(2)}`;
    parts.push({ ref: r.sw, value: "Kailh Choc V1", footprint: FOOTPRINTS.switch, pins: { "1": `COL${r.col}`, "2": node }, keyId: k.id });
    parts.push({ ref: r.d, value: "1N4148W", footprint: FOOTPRINTS.diode, pins: { A: node, K: `ROW${r.row}` }, keyId: k.id });
  }

  /* The cell plugs into J1; two short wires from J2 reach the BAT pads under the XIAO. */
  parts.push({ ref: "J1", value: "Battery, JST-PH 2-pin", footprint: FOOTPRINTS.battery, pins: { "1": "VBAT", "2": "GND" } });
  parts.push({ ref: "J2", value: "Wire to XIAO BAT pads", footprint: FOOTPRINTS.batteryLink, pins: { "1": "VBAT", "2": "GND" } });

  if (design.options.irTransmit) {
    /* A low-side NPN switch drives the LED from 3V3; R1 sets about 100 mA pulses. */
    parts.push(
      { ref: "R1", value: "22R", footprint: FOOTPRINTS.r0805, pins: { "1": "3V3", "2": "IR_A" } },
      { ref: "LED1", value: "IR LED 940 nm", footprint: FOOTPRINTS.irLed, pins: { A: "IR_A", K: "IR_K" } },
      { ref: "Q1", value: "MMBT2222A", footprint: FOOTPRINTS.sot23, pins: { B: "IR_B", C: "IR_K", E: "GND" } },
      { ref: "R2", value: "1k", footprint: FOOTPRINTS.r0805, pins: { "1": "IR_TX", "2": "IR_B" } },
    );
  }
  if (design.options.irReceive) {
    parts.push(
      { ref: "U2", value: "TSOP38238", footprint: FOOTPRINTS.irReceiver, pins: { OUT: "IR_RX", GND: "GND", VS: "3V3" } },
      { ref: "C1", value: "100n", footprint: FOOTPRINTS.c0805, pins: { "1": "3V3", "2": "GND" } },
    );
  }
  if (plan.battery) {
    /* Halve the cell voltage into an analog pin: 4.2 V reads as 2.1 V. */
    parts.push(
      { ref: "R3", value: "220k", footprint: FOOTPRINTS.r0805, pins: { "1": "VBAT", "2": "VBAT_SENSE" } },
      { ref: "R4", value: "220k", footprint: FOOTPRINTS.r0805, pins: { "1": "VBAT_SENSE", "2": "GND" } },
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
