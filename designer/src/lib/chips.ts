/* Chip profiles are data. Every number names its source; "measured" values come only from our
 * bench, and a missing value is shown as unmeasured rather than guessed. */

export interface Pin {
  /** Chip pin name as the vendor prints it, for example P0.13. */
  id: string;
  /** Can wake the chip from its lowest-power sleep. */
  wake: boolean;
  /** Analog input usable for battery sensing. */
  adc: boolean;
  /** Read at reset; a matrix line here needs care. */
  strapping: boolean;
  /** Standard drive, under 10 kHz only: fine for keys, too slow for the 38 kHz IR carrier. */
  slow: boolean;
}

export interface Figure {
  value: number;
  source: "vendor" | "measured";
  note: string;
}

export interface Chip {
  id: ChipId;
  label: string;
  /** Plain-language reason to pick it. */
  category: string;
  blurb: string;
  priceUsd: number;
  /** Pins free for keys and IR, best first. */
  pins: Pin[];
  /** Every module pad: pad number -> pad name from the data sheet. */
  pads: Record<string, string>;
  deepSleepUa: Figure | null;
  connectedIdleUa: Figure | null;
  /** True when the chip measures its own battery voltage, with no divider on the board. */
  batteryDividerBuiltIn: boolean;
  firmware: "ported" | "not-ported";
  sources: string[];
}

export const CHIP_IDS = ["bmd-340"] as const;
export type ChipId = (typeof CHIP_IDS)[number];

/* BMD-340 pad table, u-blox data sheet UBX-19033353 R13, table 2 (pads 1–68). */
const BMD340_PADS: Record<string, string> = {
  "1": "GND", "2": "GND", "3": "GND", "4": "GND", "5": "GND", "6": "P0.25", "7": "P0.26", "8": "P0.27", "9": "P0.28", "10": "P0.29",
  "11": "P0.30", "12": "P0.31", "13": "P0.00", "14": "P0.01", "15": "P0.02", "16": "GND", "17": "VCC", "18": "GND", "19": "P0.03", "20": "P0.04",
  "21": "P0.05", "22": "P0.06", "23": "P0.07", "24": "P0.08", "25": "P0.09", "26": "P0.10", "27": "P0.11", "28": "P0.12", "29": "GND", "30": "GND",
  "31": "P0.13", "32": "P0.14", "33": "P0.15", "34": "P0.16", "35": "P0.17", "36": "P0.21", "37": "P0.19", "38": "P0.20", "39": "P0.18", "40": "P0.22",
  "41": "P0.23", "42": "P0.24", "43": "SWCLK", "44": "SWDIO", "45": "GND", "46": "GND", "47": "GND", "48": "P1.05", "49": "P1.06", "50": "P1.07",
  "51": "P1.08", "52": "P1.09", "53": "P1.10", "54": "P1.11", "55": "GND", "56": "P1.00", "57": "P1.01", "58": "P1.02", "59": "P1.03", "60": "P1.04",
  "61": "P1.12", "62": "P1.13", "63": "P1.14", "64": "P1.15", "65": "VCCH", "66": "VBUS", "67": "USB-D-", "68": "USB-D+",
};
/* Pads the data sheet marks "standard drive, low frequency I/O only (<10 kHz)". */
const SLOW = new Set(["P0.02", "P0.03", "P0.09", "P0.10", "P0.28", "P0.29", "P0.30", "P0.31", "P1.01", "P1.02", "P1.03", "P1.04", "P1.05", "P1.06", "P1.07", "P1.10", "P1.11", "P1.12", "P1.13", "P1.14", "P1.15"]);
const AIN = new Set(["P0.02", "P0.03", "P0.04", "P0.05", "P0.28", "P0.29", "P0.30", "P0.31"]);
/* Only pads on the two outer rings, so a 2-layer board can route out to every one: first the
 * side facing the keys, then the side facing the USB-C, then the bottom edge. Left out:
 * P0.00/P0.01 (32 kHz crystal pins), P0.09/P0.10 (NFC pins, GPIO only after a UICR change),
 * P0.18 (reset) and every inner-ring pad. */
const BUDGET = ["P0.13", "P0.15", "P0.17", "P0.19", "P0.23", "P0.14", "P0.16", "P0.21", "P0.20", "P0.22", "P0.24",
  "P1.12", "P1.13", "P1.14", "P1.15", "P0.03", "P0.05", "P0.07", "P0.11",
  "P0.26", "P0.28", "P0.30", "P0.02", "P0.25", "P0.27", "P0.29", "P0.31"];
export const CHIPS: Record<ChipId, Chip> = {
  "bmd-340": {
    id: "bmd-340",
    label: "u-blox BMD-340",
    category: "Long battery",
    blurb: "nRF52840 module: Bluetooth LE and Thread, months per charge, every pin wakes it. Certified radio; factory-placed.",
    priceUsd: 9.75,
    pins: BUDGET.map((id) => ({ id, wake: true, adc: AIN.has(id), strapping: false, slow: SLOW.has(id) })),
    pads: BMD340_PADS,
    deepSleepUa: null,
    connectedIdleUa: null,
    /* The nRF52840 measures VDDH (the module's VCCH, wired to the cell) through VDDHDIV5. */
    batteryDividerBuiltIn: true,
    firmware: "not-ported",
    sources: ["https://content.u-blox.com/sites/default/files/BMD-340_DataSheet_UBX-19033353.pdf"],
  },
};

/** Pad number of a named module pin; the first match for names that repeat (GND). */
export function padOf(chip: Chip, name: string): string {
  const pad = Object.keys(chip.pads).find((p) => chip.pads[p] === name);
  if (!pad) throw new Error(`${chip.label} has no pin ${name}`);
  return pad;
}
