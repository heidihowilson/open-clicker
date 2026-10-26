/* What each key can do. A key's cap colour and legend follow from its action (Open Clicker
 * brand book, Hardware → Keycaps): oxblood for the cluster, orange for power, ivory for
 * everything else. Glyphs for actions a symbol already owns; text, four characters at most,
 * for the rest. */

export const ACTIONS = [
  "power", "up", "down", "left", "right", "ok", "back", "home", "menu", "guide", "input", "info",
  "play", "stop", "rewind", "fast_forward", "volume_up", "volume_down", "mute", "channel_up", "channel_down", "none",
] as const;
export type Action = (typeof ACTIONS)[number];

export type Glyph =
  | "power" | "mute" | "up" | "down" | "left" | "right" | "ok" | "play-pause" | "stop" | "rewind" | "fast-forward"
  | "home" | "back" | "menu";

export type CapColour = "ivory" | "oxblood" | "orange";

export interface ActionInfo {
  name: string;
  glyph: Glyph | null;
  text: string;
  /** Sent by today's firmware (firmware/main/main.c). */
  firmware: boolean;
}

export const ACTION_INFO: Record<Action, ActionInfo> = {
  power: { name: "Power", glyph: "power", text: "PWR", firmware: false },
  up: { name: "Up", glyph: "up", text: "UP", firmware: true },
  down: { name: "Down", glyph: "down", text: "DN", firmware: true },
  left: { name: "Left", glyph: "left", text: "LT", firmware: true },
  right: { name: "Right", glyph: "right", text: "RT", firmware: true },
  ok: { name: "OK", glyph: null, text: "OK", firmware: true },
  back: { name: "Back", glyph: "back", text: "BACK", firmware: true },
  home: { name: "Home", glyph: "home", text: "HOME", firmware: true },
  menu: { name: "Menu", glyph: "menu", text: "MENU", firmware: false },
  guide: { name: "Guide", glyph: null, text: "GUID", firmware: false },
  input: { name: "Input", glyph: null, text: "IN", firmware: false },
  info: { name: "Info", glyph: null, text: "INFO", firmware: false },
  play: { name: "Play / pause", glyph: "play-pause", text: "PLAY", firmware: true },
  stop: { name: "Stop", glyph: "stop", text: "STOP", firmware: false },
  rewind: { name: "Rewind", glyph: "rewind", text: "REW", firmware: false },
  fast_forward: { name: "Fast-forward", glyph: "fast-forward", text: "FF", firmware: false },
  volume_up: { name: "Volume up", glyph: null, text: "VOL+", firmware: true },
  volume_down: { name: "Volume down", glyph: null, text: "VOL−", firmware: true },
  mute: { name: "Mute", glyph: "mute", text: "MUTE", firmware: true },
  channel_up: { name: "Channel up", glyph: null, text: "CH+", firmware: false },
  channel_down: { name: "Channel down", glyph: null, text: "CH−", firmware: false },
  none: { name: "Unassigned", glyph: null, text: "", firmware: true },
};

const CLUSTER: readonly Action[] = ["up", "down", "left", "right", "ok"];

export function capColour(action: Action): CapColour {
  if (action === "power") return "orange";
  return CLUSTER.includes(action) ? "oxblood" : "ivory";
}

/** Glyph file for a cap: oxblood ink on ivory caps, ivory ink on oxblood and orange caps. */
export function glyphUrl(glyph: Glyph | "select" | "add" | "move" | "measure" | "camera", ink: "oxblood" | "ivory"): string {
  return `legends/${glyph}-${ink}.svg`;
}

/** A key's legend: its own text when set, otherwise the action's glyph or text. */
export function legendOf(action: Action, label: string): { glyph: Glyph | null; text: string } {
  if (label) return { glyph: null, text: label.toUpperCase().slice(0, 4) };
  const info = ACTION_INFO[action];
  return { glyph: info.glyph, text: info.text };
}
