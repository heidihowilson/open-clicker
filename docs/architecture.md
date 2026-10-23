# Hardware and firmware architecture

## Mechanical foundation

The key board carries the switches and mounts to the enclosure. The controller sits beneath it in a reserved region, avoiding switch joints and sockets. A short cable allows the IR module to sit at the enclosure nose. Battery placement remains flexible in the lower grip.

Do not freeze enclosure dimensions from concept artwork. Select an exact low-profile switch and keycap family, obtain their mechanical drawings, and measure samples first. Hot-swap sockets are an option to evaluate, not a committed footprint.

## Proposed module boundaries

| Module | Owns | Does not own |
| --- | --- | --- |
| Controller | Processing, radio, input scanning, action routing, settings, diagnostics, update/recovery | Switch placement or battery chemistry |
| Key board | Switches, optional sockets, mounting holes, connection to controller | Per-layout processor |
| IR front board | Emitter, current-limited transistor driver, optional receiver, local decoupling | Device command database |
| Power assembly | Selected battery interface, protection, regulation, and charging when appropriate | Application behavior |
| Enclosure | Structural support, button clearance, grip, access to ports, antenna and optical clearance | Electrical interconnection through structural fasteners |

## Draft electrical interface requirements

These are design requirements, not a released pinout or wiring guide. Connector numbering, ratings, polarity, and exact voltages must be verified against the selected components before wiring or fabrication.

**Key board:** Begin by evaluating ten independent active-low switch inputs and a common ground. Firmware uses pull-ups and debouncing; a press connects an input to ground. This uses more controller pins than a matrix but avoids diodes and matrix scanning complexity for ten keys. First confirm the controller has enough accessible pins after IR, power control, and debugging reservations. If not, revise to a diode matrix before committing a connector. Reserve a way to identify the layout, initially through explicit firmware configuration. Do not add a processor to every key board.

**IR:** Define separate transmit control, receiver output, ground, and a specified supply. The emitter must use a rated driver and current limiting; do not drive it directly from a processor pin. Receiver output must match controller logic levels. Check carrier support, drive current, supply transients, optical opening, and eye-facing physical placement. A receive module may demodulate only a restricted carrier range; do not describe it as a universal IR capture instrument.

**Power:** Define the controller supply range and peak load before choosing regulation. A rechargeable assembly owns its charging and protection requirements; a primary-cell assembly must never accept charging current. Establish USB/battery source selection and prevent backfeeding. Similar-looking connectors must not make incompatible battery assemblies interchangeable. For the first bench build, use the development board's documented USB power path.

**Controller:** Use an existing microcontroller or radio module. Keep antenna placement and clearance requirements in both board and shell drawings. Expose a documented recovery mechanism and debug connection. A module reduces radio design work but does not, by itself, establish finished-product compliance.

**Connectors:** Prefer positive retention and mechanically keyed connections. Specify insertion orientation, pin 1, cable routing, and strain relief. Assume assembly while unpowered; hot-plug operation is outside the first version's scope. Compare connector height against the complete switch and enclosure stack before selecting parts.

## Firmware boundaries

```text
Switch event -> logical action -> device profile -> transport driver -> target
                        |
                  diagnostic log
```

Switch events include press and release. Repeat policy belongs to the action/profile layer: navigation may repeat, while Home and Play/Pause should not repeat by default. Release state must not become stuck across connection loss or sleep.

Device profiles map named actions to supported transport commands. They contain data, not arbitrary executable code. Credentials, where a target requires them, belong in local settings and must not be included in published profiles or diagnostic exports.

Transport drivers own connection state, transmission, and bounded errors. A driver must distinguish a command being transmitted from a target acknowledging it; IR generally offers no application acknowledgment. Do not queue stale navigation commands for replay after reconnecting.

Provide a reference profile, logs, example extensions, input validation, and a recovery path so AI-assisted contributors can change integrations without modifying battery management or switch scanning.

## Controller candidates

Start the Bluetooth LE experiment using the owner's Waveshare ESP32-C6-DEV-KIT-N8-M. The existing Waveshare S3 touch display is a diagnostic option, and the original ESP32 30-pin boards provide a Bluetooth Classic comparison if needed. ESP32 is the working controller family for the prototype and a candidate for the production module. Final selection depends on target-device support, pin budget, measured wake behavior, and current consumption. Do not assume generic Bluetooth keyboard support establishes BLE HID compatibility, or that BLE keyboard support implies full TV remote support.

Both C6 and S3 use Bluetooth LE, not Bluetooth Classic. The original ESP32 boards in the inventory support both and are a separate test target. The C6's built-in USB is fixed-function serial/JTAG and cannot serve as a native USB HID keyboard. The S3 can support USB HID if the board exposes its USB-OTG data connection. Serial programming and a Bluetooth remote remain possible on the C6; wired HID is not a first-version requirement. See [ESP32 prototype approach](esp32-prototype.md).

Existing foundations to investigate:

- [Espressif BLE HID device example](https://raw.githubusercontent.com/espressif/esp-idf/v5.5.1/examples/bluetooth/esp_hid_device/README.md)
- [Espressif ESP32-C6](https://www.espressif.com/en/products/socs/esp32-c6)
- [Espressif remote control timing peripheral](https://github.com/espressif/arduino-esp32/blob/master/docs/en/api/rmt.rst)

These are source references, not a selected parts list. Use a dedicated ESP-IDF prototype based on the supported HID example; the final application must add action mapping, deliberate inputs, pairing behavior, and recovery. The earlier Nordic/ZMK exploration is superseded for the first prototype.
