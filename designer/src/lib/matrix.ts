import { CHIPS, type Pin } from "./chips";
import type { Design } from "./design";

export interface PinPlan {
  ok: true;
  columns: Pin[];
  rows: Pin[];
  battery: Pin | null;
  irTransmit: Pin | null;
  irReceive: Pin | null;
  spare: Pin[];
  /** keyId -> [row, column] */
  positions: Map<string, [number, number]>;
}
export interface PinPlanFailure {
  ok: false;
  reason: string;
}

/* Prefer plain pins: strapping pins last, and wake/ADC pins kept free for the jobs that need them. */
function byPreference(pins: Pin[], keep: (pin: Pin) => boolean): Pin[] {
  return [...pins].sort((a, b) => Number(a.strapping) - Number(b.strapping) || Number(keep(a)) - Number(keep(b)));
}

/**
 * Keys form a diode matrix. Columns are inputs with pull-ups and must all be wake pins, so in
 * sleep every row is driven low and any key press wakes the chip. Rows are outputs.
 */
export function planPins(design: Design): PinPlan | PinPlanFailure {
  const chip = CHIPS[design.chip];
  let free = [...chip.pins];
  const take = (pin: Pin) => { free = free.filter((p) => p !== pin); return pin; };

  let battery: Pin | null = null;
  if (design.options.batterySense && !chip.batteryDividerBuiltIn) {
    const choice = byPreference(free.filter((p) => p.adc), (p) => p.wake)[0];
    if (!choice) return { ok: false, reason: `${chip.label} has no analog pin left for battery sensing.` };
    battery = take(choice);
  }

  const reserved = Number(design.options.irTransmit) + Number(design.options.irReceive);
  const wakePins = byPreference(free.filter((p) => p.wake), () => false);
  const count = design.keys.length;
  /* Feasible first, then fewest strapping pins in the matrix, fewest pins, most columns. */
  let best: { cols: number; rows: number; strapped: number } | null = null;
  for (let cols = 1; cols <= Math.min(wakePins.length, count); cols++) {
    const rows = Math.ceil(count / cols);
    if (rows + cols + reserved > free.length) continue;
    const colPins = wakePins.slice(0, cols);
    const rest = byPreference(free.filter((p) => !colPins.includes(p)), (p) => p.wake || p.adc);
    const strapped = [...colPins, ...rest.slice(0, reserved + rows)].filter((p) => p.strapping).length;
    const better = !best || strapped < best.strapped
      || (strapped === best.strapped && (rows + cols < best.rows + best.cols || (rows + cols === best.rows + best.cols && cols > best.cols)));
    if (better) best = { cols, rows, strapped };
  }
  if (!best) {
    const lines = free.length - reserved;
    let most = 0;
    for (let c = 1; c <= Math.min(wakePins.length, lines - 1); c++) most = Math.max(most, c * (lines - c));
    return {
      ok: false,
      reason: `${count} keys do not fit on ${chip.label}: with these options it fits ${most}. Remove keys or an option, or choose another chip.`,
    };
  }

  const { cols, rows: rowCount } = best;
  const columns = wakePins.slice(0, cols).map(take);
  /* IR parts take plain pins before the rows: an IR driver's base resistor would hold a
   * strapping pin at the wrong level during reset, while a diode-isolated row does not. */
  const next = () => { const pin = byPreference(free, (p) => p.wake || p.adc)[0]; if (!pin) throw new Error("pin budget miscounted"); return take(pin); };
  /* The IR carrier is 38 kHz, so the transmitter needs a full-speed pin. */
  const fast = () => { const pin = free.find((p) => !p.slow); if (!pin) throw new Error("no full-speed pin left for IR"); return take(pin); };
  const irTransmit = design.options.irTransmit ? fast() : null;
  const irReceive = design.options.irReceive ? next() : null;
  const rows = byPreference(free, (p) => p.wake || p.adc).slice(0, rowCount).map(take);

  /* Fill row-major in reading order (top to bottom, then left to right). */
  const sorted = [...design.keys].sort((a, b) => a.y - b.y || a.x - b.x);
  const positions = new Map<string, [number, number]>();
  sorted.forEach((key, index) => positions.set(key.id, [Math.floor(index / cols), index % cols]));

  return { ok: true, columns, rows, battery, irTransmit, irReceive, spare: free, positions };
}
