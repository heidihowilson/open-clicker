/* Chip profiles are data. Every number names its source; "measured" values come only from our
 * bench, and a missing value is shown as unmeasured rather than guessed. */

export type PinId = "D0" | "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "D9" | "D10";

export interface Pin {
  id: PinId;
  /** Chip pin name as the vendor prints it, for example GPIO2 or P0.02. */
  chipPin: string;
  /** Firmware pin number where the chip family uses plain integers (ESP32), otherwise null. */
  gpio: number | null;
  /** Can wake the chip from its lowest-power sleep. */
  wake: boolean;
  /** Analog input usable for battery sensing. */
  adc: boolean;
  /** Read at reset; a matrix line here needs care. */
  strapping: boolean;
}

export interface Figure {
  value: number;
  source: "vendor" | "measured";
  note: string;
}

export interface Chip {
  id: ChipId;
  label: string;
  /** Plain-language reason to pick it (Cheapest, All-rounder, Long battery). */
  category: string;
  blurb: string;
  priceUsd: number;
  pins: Pin[];
  deepSleepUa: Figure | null;
  connectedIdleUa: Figure | null;
  /** True when the board already divides battery voltage into an analog input. */
  batteryDividerBuiltIn: boolean;
  firmware: "esp-idf" | "not-ported";
  sources: string[];
}

export const CHIP_IDS = ["xiao-esp32c3", "xiao-esp32c6", "xiao-nrf52840"] as const;
export type ChipId = (typeof CHIP_IDS)[number];

function pin(id: PinId, chipPin: string, flags: Partial<Pick<Pin, "wake" | "adc" | "strapping">> = {}): Pin {
  const match = /^GPIO(\d+)$/.exec(chipPin);
  return {
    id,
    chipPin,
    gpio: match?.[1] ? Number(match[1]) : null,
    wake: flags.wake ?? false,
    adc: flags.adc ?? false,
    strapping: flags.strapping ?? false,
  };
}

export const CHIPS: Record<ChipId, Chip> = {
  "xiao-esp32c3": {
    id: "xiao-esp32c3",
    label: "XIAO ESP32-C3",
    category: "Cheapest",
    blurb: "Lowest price and runs today's firmware. Shortest battery life of the three.",
    priceUsd: 5,
    pins: [
      pin("D0", "GPIO2", { wake: true, adc: true, strapping: true }),
      pin("D1", "GPIO3", { wake: true, adc: true }),
      pin("D2", "GPIO4", { wake: true, adc: true }),
      pin("D3", "GPIO5", { wake: true }),
      pin("D4", "GPIO6"),
      pin("D5", "GPIO7"),
      pin("D6", "GPIO21"),
      pin("D7", "GPIO20"),
      pin("D8", "GPIO8", { strapping: true }),
      pin("D9", "GPIO9", { strapping: true }),
      pin("D10", "GPIO10"),
    ],
    deepSleepUa: { value: 44, source: "vendor", note: "Seeed wiki, deep sleep mode" },
    connectedIdleUa: null,
    batteryDividerBuiltIn: false,
    firmware: "esp-idf",
    sources: ["https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/"],
  },
  "xiao-esp32c6": {
    id: "xiao-esp32c6",
    label: "XIAO ESP32-C6",
    category: "All-rounder",
    blurb: "About the same price, sleeps about three times better, and has a smart-home radio. Runs today's firmware.",
    priceUsd: 5.5,
    pins: [
      pin("D0", "GPIO0", { wake: true, adc: true }),
      pin("D1", "GPIO1", { wake: true, adc: true }),
      pin("D2", "GPIO2", { wake: true, adc: true }),
      pin("D3", "GPIO21"),
      pin("D4", "GPIO22"),
      pin("D5", "GPIO23"),
      pin("D6", "GPIO16"),
      pin("D7", "GPIO17"),
      pin("D8", "GPIO19"),
      pin("D9", "GPIO20"),
      pin("D10", "GPIO18"),
    ],
    deepSleepUa: { value: 15, source: "vendor", note: "Seeed wiki, deep sleep at 3.8 V" },
    connectedIdleUa: null,
    batteryDividerBuiltIn: false,
    firmware: "esp-idf",
    sources: ["https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/"],
  },
  "xiao-nrf52840": {
    id: "xiao-nrf52840",
    label: "XIAO nRF52840",
    category: "Long battery",
    blurb: "The keyboard chip: months per charge and every pin wakes it. Twice the price; firmware not ported yet.",
    priceUsd: 10,
    pins: [
      pin("D0", "P0.02", { wake: true, adc: true }),
      pin("D1", "P0.03", { wake: true, adc: true }),
      pin("D2", "P0.28", { wake: true, adc: true }),
      pin("D3", "P0.29", { wake: true, adc: true }),
      pin("D4", "P0.04", { wake: true, adc: true }),
      pin("D5", "P0.05", { wake: true, adc: true }),
      pin("D6", "P1.11", { wake: true }),
      pin("D7", "P1.12", { wake: true }),
      pin("D8", "P1.13", { wake: true }),
      pin("D9", "P1.14", { wake: true }),
      pin("D10", "P1.15", { wake: true }),
    ],
    deepSleepUa: null,
    connectedIdleUa: null,
    batteryDividerBuiltIn: true,
    firmware: "not-ported",
    sources: ["https://wiki.seeedstudio.com/XIAO_BLE/"],
  },
};
