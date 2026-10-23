# ESP32 prototype using existing hardware

Use hardware already owned to prove TV communication before purchasing a specialized development kit. The supplied listings identify a Waveshare ESP32-C6-DEV-KIT-N8-M development board, a Waveshare ESP32-S3-Touch-LCD-1.46 family round touchscreen board with protective glass, and Teyleten Robot original ESP32 30-pin development boards. Start with the C6. See [owned boards](../hardware/README.md) for source links and remaining revision checks.

## Board roles

| Hardware | Proposed role | Condition |
| --- | --- | --- |
| Waveshare C6 N8-M | First BLE remote prototype | Assembled USB-C board with soldered headers |
| Teyleten Robot original ESP32 30-pin | Bluetooth Classic/BLE comparison | Verify actual board pin labels before wiring |
| Waveshare S3 1.46-inch touchscreen | Diagnostic interface and touch remote experiment | Confirm exact hardware revision before using display-specific firmware |

The screen can show connection state, pairing information, and the last command. The supplied S3 listing confirms capacitive touch; using it in the prototype remains optional. Begin without a display driver if it delays the first BLE test. Existing firmware should be backed up where practical before overwriting a board the owner wants to preserve.

## Software basis

Espressif's [ESP-IDF v5.5.1 HID device example](https://raw.githubusercontent.com/espressif/esp-idf/v5.5.1/examples/bluetooth/esp_hid_device/README.md) lists both ESP32-C6 and ESP32-S3. This is a concrete compatibility reference, not a decision to use that historical release for the product. Choose and pin a suitable maintained release when implementing.

The BLE demo automatically sends volume changes. Replace that behavior before using a real TV. The intended test firmware should advertise only on deliberate setup, handle pairing and stored bonds, and send navigation/media actions only on explicit serial-console or switch commands. Every pressed report must have a matching release. Test a computer first, then the QM6K.

The first version can accept action names over the USB/UART console, avoiding unknown GPIO assignments. A board's BOOT button may be used only after reviewing its schematic and boot-strapping behavior. Full ten-key wiring follows that review.

Use ESP-IDF's supported BLE path rather than assuming an older Arduino library for the original ESP32 supports C6/S3. Keep common actions and profiles shared between targets, with board-specific input, display, and power configuration.

## Hardware capabilities and limits

- C6 and S3 support BLE but not Bluetooth Classic. The third board uses the original ESP32, which supports both. It provides a useful protocol comparison if BLE behavior fails on a target. Exact TV compatibility still needs testing.
- C6 can use its RMT peripheral for timed IR transmission/reception with external optical components and an appropriate emitter driver. [Espressif RMT documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/peripherals/rmt.html)
- C6's built-in USB supports serial/JTAG rather than arbitrary USB device classes. It can carry development commands but cannot act as a native USB HID keyboard. [C6 serial connection documentation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c6/get-started/establish-serial-connection.html)
- S3 supports USB HID through USB-OTG when the board makes the relevant data connection available. A connector attached only to a USB-to-UART bridge is not that connection. [S3 USB device stack](https://docs.espressif.com/projects/esp-usb/en/latest/esp32s3/usb_device.html)

## First milestone

1. Connect the Waveshare C6 via a USB data cable; identify the programming port and preserve existing firmware if needed.
2. Build for the exact C6 or S3 target. The C6 portable test mode hosts a phone control page over its own Wi-Fi network.
3. Verify pairing and deliberate key press/release reports on a computer.
4. Pair to the QM6K and test directions, OK, Back, Home, and Play/Pause independently.
5. Repeat on the older TCL and identified Apple TVs.
6. Add mechanical switches and optional IR after transport behavior is known.

Serial-triggered actions prove communication but do not establish whole-remote button latency. Record that distinction in results.

## Power and eventual product

USB-powered testing comes first. Measure radio idle/connection behavior and wake latency before choosing a battery. A round display, backlight, development-board LEDs, and regulators can dominate current; separate their contributions from the controller load. Do not infer production battery life from these boards or advertise deep-sleep current as normal connected-remote current.

An ESP32 radio module remains a plausible production core. Select it after confirming usable GPIO, antenna clearance, standby behavior, and the desired USB capability. Supporting both chips in the prototype does not require two controller variants in the first kit.

## Current state

ESP-IDF v6.1 installed locally; prototype built and flashed to the identified C6 revision 0.0 with 8 MB flash. Full original flash backed up under ignored `local/backups/`, with size, checksum, and independent initial-block comparison recorded. The board passed startup/report-map validation, disconnected-input rejection, malformed-command rejection, and advertising startup checks. Four host panel tests passed. The desktop control panel can run at `http://127.0.0.1:8766`. Portable mode hosts its control page at `http://192.168.4.1/` while the phone is connected to the C6 access point.

See [firmware instructions](../firmware/README.md). The owner reports successful TV pairing and every control button working in the [first TV test](tests/2026-10-22-first-tv-test.md). The target was confirmed as the bedroom TCL BeyondTV4. Computer pairing, automatic reconnection and battery life remain unverified.

Portable v0.2 validation: seven onboard HTTP checks passed over local TCP, including real page delivery/token substitution, status, request rejection, and command queueing. USB restart retained the AP credentials. BLE advertising starts with Wi-Fi active. A 390-pixel-wide browser preview was inspected. The owner subsequently confirmed successful use of the portable interface for TV pairing and all buttons; see the test record above.
