import { CHIPS } from "./chips";
import { KEYCAPS, type Design } from "./design";
import { batteryFits, boardBounds, collisions } from "./geometry";
import { planPins } from "./matrix";

export interface Finding {
  level: "error" | "warning" | "info";
  message: string;
}

const PROFILE_KEYS = ["home", "up", "right", "down", "left"] as const;

export function check(design: Design): Finding[] {
  const out: Finding[] = [];
  const chip = CHIPS[design.chip];
  const plan = planPins(design);

  if (!plan.ok) out.push({ level: "error", message: plan.reason });
  else {
    out.push({ level: "info", message: `Matrix ${plan.rows.length} × ${plan.columns.length} on ${plan.rows.length + plan.columns.length} pins; every column is a wake pin, so any key wakes the remote.` });
    const strapped = [...plan.rows, ...plan.columns].filter((p) => p.strapping);
    if (strapped.length) out.push({ level: "warning", message: `Matrix uses strapping pin ${strapped.map((p) => `${p.id} (${p.chipPin})`).join(", ")}. A key held during reset could change the boot mode.` });
    if (plan.spare.length) out.push({ level: "info", message: `Spare pins: ${plan.spare.map((p) => p.id).join(", ")}.` });
  }

  for (const [a, b] of collisions(design)) out.push({ level: "error", message: `Keys ${a} and ${b} overlap. Keep at least 0.5 mm between keycaps.` });

  const actions = design.keys.map((k) => k.action).filter((a) => a !== "none");
  const dupes = [...new Set(actions.filter((a, i) => actions.indexOf(a) !== i))];
  if (dupes.length) out.push({ level: "warning", message: `More than one key sends ${dupes.join(", ")}.` });
  const missing = PROFILE_KEYS.filter((a) => !actions.includes(a));
  if (missing.length) out.push({ level: "warning", message: `Profile switching (Home + arrow) needs ${missing.join(", ")}.` });
  if (actions.includes("ir_power") && !design.options.irTransmit) out.push({ level: "error", message: "A key sends IR power, but the IR transmitter is off." });

  const bounds = boardBounds(design);
  const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
  out.push({ level: "info", message: `Board ${w.toFixed(1)} × ${h.toFixed(1)} mm.` });
  if (!batteryFits(design, bounds)) out.push({ level: "error", message: `The ${design.battery.lengthMm} × ${design.battery.widthMm} mm battery does not fit beside the XIAO. Choose a smaller cell or add keys or margin.` });

  if (!KEYCAPS[design.keycap].verified) out.push({ level: "warning", message: "MCC keycap size is assumed equal to MBK until a sample is measured." });
  if (chip.firmware === "not-ported") out.push({ level: "warning", message: `${chip.label}: Open Remote firmware does not run on this chip yet.` });

  if (chip.deepSleepUa) {
    const days = design.battery.capacityMah / (chip.deepSleepUa.value / 1000) / 24;
    out.push({ level: "info", message: `Asleep only: about ${Math.round(days)} days on ${design.battery.capacityMah} mAh (${chip.deepSleepUa.source} figure, ${chip.deepSleepUa.note}). Connected use is unmeasured and will dominate.` });
  } else out.push({ level: "info", message: `${chip.label}: sleep current is unmeasured, so no battery estimate yet.` });

  return out;
}
