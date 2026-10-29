import { CHIPS } from "./chips";
import type { Design } from "./design";
import { boardBounds, SHELL_RULES } from "./geometry";
import { PCB, SHELL } from "./parts-data";

/* Bill of materials: one line per thing you buy or print. These are the units the exploded
 * view separates, and nothing finer. Prices are small-quantity retail estimates in USD, before
 * shipping and tax; each line says what its figure is based on. */

export type BomId =
  | "controller" | "switch" | "keycap" | "diode" | "battery" | "pcb"
  | "usb" | "charger" | "battery-connector" | "capacitor" | "status-led"
  | "ir-led" | "ir-receiver" | "ir-driver" | "resistor" | "shell" | "plate" | "lid";

export interface BomLine {
  id: BomId;
  label: string;
  spec: string;
  qty: number;
  unitUsd: number;
  basis: string;
  kind: "buy" | "fabricate" | "print";
}

const FILAMENT_USD_PER_G = 0.025; /* PLA/PETG at about $25 per kg */
const PLA_G_PER_CM3 = 1.24;

function roundedArea(w: number, h: number, r: number) { return w * h - (4 - Math.PI) * r * r; }
function perimeter(w: number, h: number, r: number) { return 2 * (w + h) - (8 - 2 * Math.PI) * r; }

/* Printed mass of the three shell parts, from their outlines. */
export function shellGrams(design: Design): { shell: number; plate: number; lid: number } {
  const b = boardBounds(design);
  const grow = SHELL_RULES.wall + SHELL.clearance, r = SHELL_RULES.fillet;
  const w = b.maxX - b.minX + 2 * grow, h = b.maxY - b.minY + 2 * grow;
  const depth = PCB.thickness + Math.max(5.7, 1.5 + design.battery.thicknessMm) + 1;
  const capHoles = design.keys.reduce((sum, k) => sum + (18 * k.w + 0.5) * 17.5, 0);
  const plateHoles = design.keys.length * SHELL_RULES.plateCutout ** 2;
  const g = (mm3: number) => (mm3 / 1000) * PLA_G_PER_CM3;
  return {
    shell: g((roundedArea(w, h, r) - capHoles) * SHELL.bezel + perimeter(w, h, r) * SHELL_RULES.wall * (PCB.thickness + 3.6)),
    plate: g((roundedArea(w - 2 * grow, h - 2 * grow, r - grow) - plateHoles) * SHELL_RULES.plate),
    lid: g(roundedArea(w, h, r) * SHELL.floor + perimeter(w, h, r) * SHELL_RULES.wall * depth),
  };
}

export function bom(design: Design): BomLine[] {
  const chip = CHIPS[design.chip];
  const keys = design.keys.length;
  const b = boardBounds(design);
  const lines: BomLine[] = [
    { id: "controller", label: chip.label, spec: "nRF52840 module, -01 revision or newer; factory-placed", qty: 1, unitUsd: chip.priceUsd, basis: "JLCPCB C5456944, one unit", kind: "buy" },
    { id: "usb", label: "USB-C receptacle", spec: "HRO TYPE-C-31-M-12, 16-pin", qty: 1, unitUsd: 0.19, basis: "JLCPCB C165948", kind: "buy" },
    { id: "charger", label: "Charger IC", spec: "MCP73831, SOT-23-5, 100 mA", qty: 1, unitUsd: 0.7, basis: "JLCPCB C424093", kind: "buy" },
    { id: "battery-connector", label: "Battery connector", spec: "JST-PH 2-pin, SMD right angle", qty: 1, unitUsd: 0.05, basis: "JLCPCB C54582899", kind: "buy" },
    { id: "capacitor", label: "Capacitor", spec: "4.7 µF 0805; charger in and out", qty: 2, unitUsd: 0.01, basis: "LCSC basic part", kind: "buy" },
    { id: "status-led", label: "Charging LED", spec: "Red 0805", qty: 1, unitUsd: 0.01, basis: "LCSC basic part", kind: "buy" },
    { id: "switch", label: "Kailh Choc V1", spec: "Low-profile switch, PG1350", qty: keys, unitUsd: 0.55, basis: "About $5.50 per 10", kind: "buy" },
    design.keycap === "choc-mbk"
      ? { id: "keycap", label: "MBK keycap 1u", spec: "17.5 × 16.5 mm, Choc stem", qty: keys, unitUsd: 0.9, basis: "About $9 per 10 (SplitKB)", kind: "buy" }
      : { id: "keycap", label: "MoErgo MCC keycap", spec: "Choc stem; size not yet measured", qty: keys, unitUsd: 0.8, basis: "Estimate; owner has spares", kind: "buy" },
    { id: "diode", label: "1N4148W diode", spec: "SOD-123, one per key", qty: keys, unitUsd: 0.03, basis: "LCSC, qty 100", kind: "buy" },
    { id: "battery", label: "LiPo cell", spec: `${design.battery.capacityMah} mAh · ${design.battery.lengthMm} × ${design.battery.widthMm} × ${design.battery.thicknessMm} mm, leads`, qty: 1,
      unitUsd: Math.round((3 + design.battery.capacityMah * 0.005) * 100) / 100, basis: "Estimate by capacity", kind: "buy" },
    { id: "pcb", label: "Main PCB", spec: `FR-4 ${PCB.thickness} mm · ${(b.maxX - b.minX).toFixed(1)} × ${(b.maxY - b.minY).toFixed(1)} mm`, qty: 1, unitUsd: 2,
      basis: "JLCPCB 5-board prototype run, per board, before shipping", kind: "fabricate" },
  ];
  /* USB CC pull-downs, charge-current set and LED resistor. */
  let resistors = 4;
  if (design.options.irTransmit) {
    lines.push({ id: "ir-led", label: "IR LED", spec: "940 nm, 3 mm", qty: 1, unitUsd: 0.15, basis: "Distributor, single unit", kind: "buy" });
    lines.push({ id: "ir-driver", label: "IR driver transistor", spec: "MMBT2222A, SOT-23", qty: 1, unitUsd: 0.05, basis: "Distributor, qty 10", kind: "buy" });
    resistors += 2;
  }
  if (design.options.irReceive) lines.push({ id: "ir-receiver", label: "IR receiver", spec: "38 kHz, TSOP38238 class", qty: 1, unitUsd: 1.2, basis: "Distributor, single unit", kind: "buy" });
  const jobs = ["USB, charger", design.options.irTransmit && "IR current limit"].filter(Boolean).join(" and ");
  lines.push({ id: "resistor", label: "Resistor", spec: `0805; ${jobs}`, qty: resistors, unitUsd: 0.01, basis: "Distributor, qty 100", kind: "buy" });
  const grams = shellGrams(design);
  const printed = (id: "shell" | "plate" | "lid", label: string, grams: number): BomLine =>
    ({ id, label, spec: `Printed in ${design.finish ?? "butter"} PLA or PETG, about ${grams.toFixed(0)} g`, qty: 1, unitUsd: Math.round(grams * FILAMENT_USD_PER_G * 100) / 100, basis: "Filament at $25/kg", kind: "print" });
  lines.push(printed("shell", "The shell", grams.shell), printed("plate", "The plate", grams.plate), printed("lid", "The lid", grams.lid));
  return lines;
}

export function bomTotal(lines: BomLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitUsd, 0) * 100) / 100;
}

/* Sub-cent unit prices (solder joints, resistors) keep enough digits to stay visible. */
export const usd = (v: number) => `$${v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
