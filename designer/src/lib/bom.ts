import { CHIPS } from "./chips";
import type { Design } from "./design";
import { boardBounds } from "./geometry";
import { PCB, SHELL } from "./parts-data";

/* Bill of materials: one line per thing you buy or print. These are the units the exploded
 * view separates, and nothing finer. Prices are small-quantity retail estimates in USD, before
 * shipping and tax; each line says what its figure is based on. */

export type BomId =
  | "controller" | "switch" | "keycap" | "diode" | "battery" | "pcb"
  | "ir-led" | "ir-receiver" | "ir-driver" | "resistor" | "shell-bottom" | "shell-top";

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

export function shellGrams(design: Design): { bottom: number; top: number } {
  const b = boardBounds(design);
  const grow = SHELL.wall + SHELL.clearance, r = PCB.cornerRadius + grow;
  const w = b.maxX - b.minX + 2 * grow, h = b.maxY - b.minY + 2 * grow;
  const depth = PCB.thickness + Math.max(5.7, 1.5 + design.battery.thicknessMm) + 1;
  const holes = design.keys.length * 18.5 * 17.5;
  const bottomMm3 = roundedArea(w, h, r) * SHELL.floor + perimeter(w, h, r) * SHELL.wall * depth;
  const topMm3 = (roundedArea(w, h, r) - holes) * SHELL.bezel + perimeter(w, h, r) * SHELL.wall * (PCB.thickness + 3.6);
  const g = (mm3: number) => (mm3 / 1000) * PLA_G_PER_CM3;
  return { bottom: g(bottomMm3), top: g(topMm3) };
}

export function bom(design: Design): BomLine[] {
  const chip = CHIPS[design.chip];
  const keys = design.keys.length;
  const b = boardBounds(design);
  const lines: BomLine[] = [
    { id: "controller", label: chip.label, spec: "Controller module, castellated", qty: 1, unitUsd: chip.priceUsd, basis: "Seeed list price, one unit", kind: "buy" },
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
  let resistors = 0;
  if (design.options.irTransmit) {
    lines.push({ id: "ir-led", label: "IR LED", spec: "940 nm, 3 mm", qty: 1, unitUsd: 0.15, basis: "Distributor, single unit", kind: "buy" });
    lines.push({ id: "ir-driver", label: "IR driver transistor", spec: "MMBT2222A, SOT-23", qty: 1, unitUsd: 0.05, basis: "Distributor, qty 10", kind: "buy" });
    resistors += 2;
  }
  if (design.options.irReceive) lines.push({ id: "ir-receiver", label: "IR receiver", spec: "38 kHz, TSOP38238 class", qty: 1, unitUsd: 1.2, basis: "Distributor, single unit", kind: "buy" });
  if (design.options.batterySense && !chip.batteryDividerBuiltIn) resistors += 2;
  if (resistors) lines.push({ id: "resistor", label: "Resistor", spec: "0805; IR current limit and battery divider", qty: resistors, unitUsd: 0.01, basis: "Distributor, qty 100", kind: "buy" });
  const grams = shellGrams(design);
  lines.push(
    { id: "shell-top", label: `Top bezel · ${design.shell.family}`, spec: `Printed, about ${grams.top.toFixed(0)} g`, qty: 1, unitUsd: Math.round(grams.top * FILAMENT_USD_PER_G * 100) / 100, basis: "Filament at $25/kg", kind: "print" },
    { id: "shell-bottom", label: `Bottom tray · ${design.shell.family}`, spec: `Printed, about ${grams.bottom.toFixed(0)} g`, qty: 1, unitUsd: Math.round(grams.bottom * FILAMENT_USD_PER_G * 100) / 100, basis: "Filament at $25/kg", kind: "print" },
  );
  return lines;
}

export function bomTotal(lines: BomLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.qty * l.unitUsd, 0) * 100) / 100;
}

/* Sub-cent unit prices (solder joints, resistors) keep enough digits to stay visible. */
export const usd = (v: number) => `$${v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
