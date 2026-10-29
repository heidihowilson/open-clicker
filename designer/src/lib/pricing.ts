import { bom, shellGrams, type BomLine } from "./bom";
import { CHIPS } from "./chips";
import type { Design } from "./design";
import { boardBounds } from "./geometry";

/* Three ways to get a remote. Every figure is an estimate with its basis written beside it.
 * Shipping and tax are excluded everywhere. */

export interface PriceLine { label: string; qty: number; unitUsd: number; basis: string }
export interface Tier {
  /** Fulfilment levels, in brand order: Kit, Half-built, Fully assembled. */
  id: "kit" | "half-built" | "assembled";
  title: string;
  summary: string;
  youDo: string;
  lines: PriceLine[];
  /** What the parts cost: retail for DIY, our batch cost for kits and builds. */
  costUsd: number;
  /** Our selling price, or null when the builder buys everything. */
  priceUsd: number | null;
  extraUsd: number;
  extraNote: string;
}

export interface PricingAssumptions {
  batch: number;
  /** Gross margin on our price, 0..0.9. */
  margin: number;
  laborUsdPerHour: number;
}
export const DEFAULT_PRICING: PricingAssumptions = { batch: 50, margin: 0.4, laborUsdPerHour: 30 };

const FILAMENT_USD_PER_G = 0.025;
const PRINT_G_PER_HOUR = 10;
const PRINTER_USD_PER_HOUR = 0.4;

const round = (v: number) => Math.round(v * 100) / 100;
const sum = (lines: PriceLine[]) => round(lines.reduce((s, l) => s + l.qty * l.unitUsd, 0));
const fromBom = (l: BomLine): PriceLine => ({ label: l.label, qty: l.qty, unitUsd: l.unitUsd, basis: l.basis });

/* Our batch cost for the parts we buy in bulk, with the PCB assembled by the fab. */
function kitParts(design: Design, a: PricingAssumptions): PriceLine[] {
  const chip = CHIPS[design.chip];
  const keys = design.keys.length;
  const b = boardBounds(design);
  const areaMm2 = (b.maxX - b.minX) * (b.maxY - b.minY);
  const resistors = 4 + (design.options.irTransmit ? 2 : 0);
  /* JLCPCB-style assembly: per-order setup and stencil, plus a fee for each unique extended part
   * (module, USB-C, charger, hot-swap socket, battery connector), spread over the batch. */
  const setup = (8 + 1.5 + 5 * 3) / a.batch;
  const joints = 68 + 16 + 5 + keys * 2 * 2 + resistors * 2 + 2 * 2 + 2 + (design.options.irTransmit ? 3 : 0) + 4;
  const lines: PriceLine[] = [
    { label: `${chip.label}`, qty: 1, unitUsd: round(chip.priceUsd * 0.9), basis: "JLCPCB, about 10% off at batch quantity" },
    { label: "USB-C receptacle", qty: 1, unitUsd: 0.19, basis: "JLCPCB C165948" },
    { label: "Charger IC MCP73831", qty: 1, unitUsd: 0.6, basis: "JLCPCB C424093, batch" },
    { label: "Capacitor 4.7 µF, LED", qty: 3, unitUsd: 0.01, basis: "LCSC basic parts" },
    { label: "PCB, bare", qty: 1, unitUsd: round(0.2 + areaMm2 * 0.0001), basis: `JLCPCB-style board at ${a.batch} pieces, by area` },
    { label: "Assembly setup, share", qty: 1, unitUsd: round(setup), basis: `$8 setup + $1.50 stencil + 5 extended-part fees, over ${a.batch}` },
    { label: "Assembly joints", qty: joints, unitUsd: 0.0017, basis: "Per solder joint" },
    { label: "Hot-swap socket, Choc", qty: keys, unitUsd: 0.2, basis: "Kailh CPG135001S30, LCSC; lets switches push in without solder" },
    { label: "1N4148W diode", qty: keys, unitUsd: 0.01, basis: "LCSC basic part, reel price" },
    { label: "Battery connector, JST-PH", qty: 1, unitUsd: 0.08, basis: "SMD 2-pin; battery plugs in" },
    { label: "Kailh Choc V1", qty: keys, unitUsd: 0.35, basis: "Bulk, about $35 per 100" },
    { label: design.keycap === "choc-mbk" ? "MBK keycap 1u" : "MoErgo MCC keycap", qty: keys, unitUsd: design.keycap === "choc-mbk" ? 0.7 : 0.65, basis: "Bulk estimate" },
    { label: "LiPo cell with JST-PH lead", qty: 1, unitUsd: round(2 + design.battery.capacityMah * 0.004), basis: "Bulk estimate by capacity" },
  ];
  lines.push({ label: "Resistor 0805", qty: resistors, unitUsd: 0.005, basis: "LCSC basic part" });
  if (design.options.irTransmit) lines.push(
    { label: "IR LED 940 nm", qty: 1, unitUsd: 0.06, basis: "Bulk" },
    { label: "MMBT2222A transistor", qty: 1, unitUsd: 0.02, basis: "LCSC basic part" },
  );
  if (design.options.irReceive) lines.push({ label: "IR receiver 38 kHz", qty: 1, unitUsd: 0.6, basis: "Bulk" });
  return lines;
}

function labor(minutes: number, label: string, a: PricingAssumptions): PriceLine {
  return { label, qty: 1, unitUsd: round((minutes / 60) * a.laborUsdPerHour), basis: `${minutes} min at $${a.laborUsdPerHour}/h` };
}

export function shellPrint(design: Design): PriceLine[] {
  const g = shellGrams(design);
  const grams = g.shell + g.plate + g.lid;
  return [
    { label: "Shell, plate and lid filament", qty: 1, unitUsd: round(grams * FILAMENT_USD_PER_G), basis: `About ${grams.toFixed(0)} g at $25/kg` },
    { label: "Printer time", qty: 1, unitUsd: round((grams / PRINT_G_PER_HOUR) * PRINTER_USD_PER_HOUR), basis: `About ${(grams / PRINT_G_PER_HOUR).toFixed(1)} h at $${PRINTER_USD_PER_HOUR}/h` },
  ];
}

export function tiers(design: Design, a: PricingAssumptions = DEFAULT_PRICING): Tier[] {
  const price = (cost: number) => round(cost / (1 - a.margin));
  const retail = bom(design);
  const diyLines = retail.map(fromBom);
  const shellFilament = sum(retail.filter((l) => l.kind === "print").map(fromBom));

  const kit = [...kitParts(design, a), labor(6, "Flash bootloader and test", a), labor(5, "Kitting", a), { label: "Packaging", qty: 1, unitUsd: 1, basis: "Bag and card" }];
  const kitCost = sum(kit);

  const built = [...kitParts(design, a), ...shellPrint(design), labor(6, "Flash bootloader and test", a),
    labor(15, "Assembly and final test", a), { label: "Packaging", qty: 1, unitUsd: 2, basis: "Box and insert" }];
  const builtCost = sum(built);

  return [
    {
      id: "kit", title: "Kit",
      summary: "Order the assembled board from a PCB factory with our files, buy the rest at retail, print the shell.",
      youDo: "You order, you print.",
      lines: diyLines, costUsd: sum(diyLines), priceUsd: null,
      extraUsd: round(2 * 4 + 10), extraNote: "Plus once per order: factory boards come in fives (about $8 for the spares) and about $10 shipping. Flashing the bootloader needs a $10 SWD probe once.",
    },
    {
      id: "half-built", title: "Half-built",
      summary: "Factory-assembled PCB, flashed and tested, with switches, keycaps and battery.",
      youDo: "We solder, you print.",
      lines: kit, costUsd: kitCost, priceUsd: price(kitCost),
      extraUsd: shellFilament, extraNote: "Plus your own filament for the shell.",
    },
    {
      id: "assembled", title: "Fully assembled",
      summary: "A finished, tested remote in one of our printed shells.",
      youDo: "You click.",
      lines: built, costUsd: builtCost, priceUsd: price(builtCost),
      extraUsd: 0, extraNote: "",
    },
  ];
}
