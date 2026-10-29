import { ACTION_INFO } from "./actions";
import { CHIPS } from "./chips";
import { KEYCAPS, type Design } from "./design";
import { batteryFits, boardBounds, collisions, SHELL_RULES } from "./geometry";
import { planPins } from "./matrix";

/* Every check names the key and the rule (brand book, Design tool → Printability). `badge` is
 * the short form for the status strip; `message` is the full sentence. */
export interface Finding {
  level: "error" | "warning" | "info";
  badge: string;
  message: string;
  keyId?: string;
}

const PROFILE_KEYS = ["home", "up", "right", "down", "left"] as const;

export function check(design: Design): Finding[] {
  const out: Finding[] = [];
  const chip = CHIPS[design.chip];
  const plan = planPins(design);

  if (!plan.ok) out.push({ level: "error", badge: "Too many keys", message: plan.reason });
  else {
    out.push({ level: "info", badge: "Routed", message: `Matrix ${plan.rows.length} × ${plan.columns.length} on ${plan.rows.length + plan.columns.length} pins. Every column can wake the controller, so any key wakes the remote.` });
    const strapped = [...plan.rows, ...plan.columns].filter((p) => p.strapping);
    if (strapped.length) out.push({ level: "warning", badge: "Boot pin in use", message: `The matrix uses ${strapped.map((p) => `${p.id} (${p.id})`).join(", ")}. Holding a key during reset could change the boot mode.` });
  }

  for (const [a, b] of collisions(design)) out.push({ level: "error", badge: `${a} hits ${b}`, keyId: a, message: `Keys ${a} and ${b} overlap. Keys sit on an 18 × 17 mm grid; move one a cell.` });

  const actions = design.keys.map((k) => k.action).filter((a) => a !== "none");
  const powers = design.keys.filter((k) => k.action === "power");
  if (powers.length > 1) out.push({ level: "error", badge: "Two power keys", keyId: powers[1]!.id, message: "One orange key per remote. Remove the second power key." });
  const dupes = [...new Set(actions.filter((a, i) => actions.indexOf(a) !== i && a !== "power"))];
  if (dupes.length) out.push({ level: "warning", badge: "Repeated key", message: `More than one key sends ${dupes.map((a) => ACTION_INFO[a].name.toLowerCase()).join(", ")}.` });
  const missing = PROFILE_KEYS.filter((a) => !actions.includes(a));
  if (missing.length) out.push({ level: "warning", badge: "No profile keys", message: `Switching between TVs (Home + an arrow) needs ${missing.join(", ")}.` });
  if (powers.length && !design.options.irTransmit) out.push({ level: "warning", badge: "Power needs IR", keyId: powers[0]!.id, message: "Bluetooth cannot wake most TVs. The power key works when the remote has an IR transmitter." });
  const unsent = [...new Set(actions.filter((a) => !ACTION_INFO[a].firmware))];
  if (unsent.length) out.push({ level: "warning", badge: "Firmware gap", message: `Today's firmware does not send ${unsent.map((a) => ACTION_INFO[a].name.toLowerCase()).join(", ")} yet.` });

  const bounds = boardBounds(design);
  const w = bounds.maxX - bounds.minX + 2 * SHELL_RULES.wall, h = bounds.maxY - bounds.minY + 2 * SHELL_RULES.wall;
  out.push({ level: "info", badge: "Prints without supports", message: `Shell ${w.toFixed(1)} × ${h.toFixed(1)} mm, ${SHELL_RULES.wall} mm walls, printed face-up with no overhang past 45°.` });
  if (!batteryFits(design, bounds)) out.push({ level: "error", badge: "Battery too big", message: `The ${design.battery.lengthMm} × ${design.battery.widthMm} mm cell does not fit beside the controller. Choose a smaller cell or add a row of keys.` });

  if (!KEYCAPS[design.keycap].verified) out.push({ level: "warning", badge: "Cap size unmeasured", message: "MCC keycaps are drawn at the MBK size until a sample is measured." });
  if (chip.firmware === "not-ported") out.push({ level: "warning", badge: "Firmware not ported", message: `The firmware does not run on the ${chip.label} yet.` });

  if (chip.deepSleepUa) {
    const days = design.battery.capacityMah / (chip.deepSleepUa.value / 1000) / 24;
    out.push({ level: "info", badge: "Battery estimate", message: `Asleep only, about ${Math.round(days)} days on ${design.battery.capacityMah} mAh (${chip.deepSleepUa.source} figure). Use with the TV is unmeasured and will dominate.` });
  } else out.push({ level: "info", badge: "Battery unmeasured", message: `The ${chip.label}'s sleep current is unmeasured, so there is no battery estimate yet.` });

  return out;
}

export const errorsIn = (findings: Finding[]) => findings.filter((f) => f.level === "error");
