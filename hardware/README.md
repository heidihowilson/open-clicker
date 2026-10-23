# Owned development boards

Identified on October 22, 2026 from the owner's Amazon links, with manufacturer documentation used for technical capabilities. Listings identify product families; physical board revision and chip/flash identity must still be checked when connected. No purchase is required for the first BLE prototype.

| Listing | Identification | ESP-IDF target | Project role |
| --- | --- | --- | --- |
| [B0CKR4R5VM](https://www.amazon.com/dp/B0CKR4R5VM) | Waveshare ESP32-C6-DEV-KIT-N8-M, ESP32-C6-WROOM-1-N8 module, soldered headers | `esp32c6` | Primary prototype |
| [B0DS83H2V6](https://www.amazon.com/dp/B0DS83H2V6) | Waveshare ESP32-S3 1.46-inch round capacitive touchscreen, protective cover glass, 412 × 412; ESP32-S3-Touch-LCD-1.46 family | `esp32s3` | Optional display/touch diagnostic remote |
| [B08246MCL5](https://www.amazon.com/dp/B08246MCL5) | Teyleten Robot ESP-WROOM-32 / ESP32S, original ESP32 30-pin development board, listing for a three-pack | `esp32` | BLE/Classic comparison and spare prototypes |

## Primary board

The C6 is an assembled development board, not a bare chip. Waveshare identifies the N8-M variant as having pre-soldered headers. Its CH334 USB hub and CH343 UART bridge allow native USB and UART development through one USB-C connector, so multiple USB interfaces may appear. Identify the port by device information rather than guessing from its name. [Waveshare board documentation](https://docs.waveshare.com/ESP32-C6-DEV-KIT-N8)

Start with a USB data cable and serial-triggered commands. No GPIO wiring is needed for the initial radio experiment. The later switch assignment must preserve programming connections and respect boot-strapping pins and onboard peripherals. Manufacturer [resource files](https://docs.waveshare.com/ESP32-C6-DEV-KIT-N8/Resources-And-Documents) include the board schematic for that review.

## Why keep the older ESP32 available

Original ESP32 supports Bluetooth Classic and BLE; C6 and S3 support BLE only. This permits controlled testing of whether a target behaves differently with Classic HID versus BLE HID. It does not establish that Classic will solve any particular TV issue. [Espressif Bluetooth capability table](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/bt-architecture/overview.html)

The original ESP32 board is not an S3 despite the listing's ESP32S wording. Do not reuse C6 or S3 pin maps, flash configuration, or firmware binaries on it. Its exact regulator, USB bridge, and flash capacity should be confirmed rather than inferred from generic clone-board documentation.

## Round touchscreen board

The listing confirms a touch display, so a virtual directional pad or pairing/status screen is possible without external switches. Keep display work separate from the first C6 test to avoid requiring a display driver for basic communication. Waveshare's [family documentation](https://docs.waveshare.com/ESP32-S3-Touch-LCD-1.46) covers several variants; match the actual board marking before using peripheral-specific pin assignments or factory firmware.

## First connection procedure

1. Connect the C6 with a known USB data cable.
2. Identify the new serial/USB interfaces and read the chip/flash identity without writing firmware.
3. Record the hardware marking and preserve existing firmware where needed.
4. Prepare a pinned ESP-IDF build targeting `esp32c6`, with Wi-Fi disabled initially and no automatic demo key transmissions.
5. Flash only the identified board, verify intentional HID press/release on a computer, then test the QM6K.

The connected unit was identified as ESP32-C6 revision 0.0 with 8 MB flash, secure boot disabled, and flash encryption disabled. Its UART bridge appears as `/dev/cu.usbmodem59580043921`; 230400 baud worked for the full backup and flash, while faster read attempts failed. The native USB port was not usable for ROM communication in this session. ESP-IDF v6.1 is installed within project-local tooling. Prototype firmware has been flashed and its startup, serial command handling, and advertising startup tested. The owner subsequently reported successful pairing and every button working on the bedroom TCL BeyondTV4; see the [test record](../docs/tests/2026-10-22-first-tv-test.md).

## Switches and keycaps

- Ordered: Kailh Choc V1 switches for the first prototype, expected in about a week. The suggested order was Brown switches with optional Red/White samples; the owner confirmed ordering but not exact quantities or variants.
- Available: spare MoErgo Glove80 MCC keycaps. MoErgo identifies these as compatible with Choc V1; see [Glove80 specifications](https://www.moergo.com/pages/glove80-technical-specification).
- Optional: MBK Choc V1 caps were recommended; whether they were included in the order is not confirmed.
- Other owned keyboards: Keychron K8C2 and Havit HV-KB389L. Do not assume their switches are removable without desoldering or use their caps for the Choc V1 build.
- Assembly: the owner is equipped for soldering. Hand wiring is the next prototype step; hot-swap sockets are not required.

Switch family selection is not a released footprint. Verify manufacturer drawings and sample dimensions before creating the key PCB and switch plate.
