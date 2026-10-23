# Project decisions

## Established direction

- Open hardware streaming remote with mechanical keys and printable enclosure choices.
- Offer assembled boards for convenience while publishing reproducible design sources.
- Ten-key baseline with two configurable keys.
- Use existing chips; no custom silicon.
- Separate physical inputs, logical actions, device profiles, and transport drivers.
- Provide a working reference integration; community adapters extend supported devices.

## Initial engineering choices

These are reversible working choices for the first prototype:

- Key board forms the mechanical backbone; replaceable controller mounts underneath.
- Optional wired IR front board, with power architecture treated as its own design boundary.
- One layout and USB-powered development hardware first.
- Evaluate direct switch inputs before adding a matrix or input expander.
- Require measured sleep/wake behavior before selecting production power hardware.
- No screen, microphone, voice assistant, or cloud service in the first build.
- First successful test: bedroom TCL BeyondTV4 (Android 11/AR21 in the supplied inventory), owner-reported pairing and all buttons working. Living-room TCL QM6K and two Apple TVs remain additional targets.
- First transport experiment: Bluetooth LE HID keyboard plus consumer-control reports. The first owner-reported control test passed on the bedroom TCL; reliability and other targets remain unverified. IR remains a separate fallback/supplement.
- Prototype controller family: ESP32. First board: Waveshare ESP32-C6-DEV-KIT-N8-M from the owner's inventory. Keep the original ESP32 30-pin boards for Bluetooth Classic/BLE comparison and the Waveshare S3 1.46-inch touch display for diagnostics. No development-board purchase is needed.
- Use pinned ESP-IDF v6.1 with USB power and deliberate command input. Portable v0.2 hosts a phone control page on a password-protected Wi-Fi access point alongside BLE; the serial interface remains available. Physical switches use ten independent active-low GPIOs, chosen from the board schematic to avoid strapping, USB and UART pins. Use the S3 display optionally for diagnostics, not as a product requirement.

- Prototype switches: Kailh Choc V1 ordered; exact order quantities/variants unconfirmed. Existing Glove80 MCC keycaps are compatible; MBK is an optional comparison. Owner is equipped for soldering.
- Start physical assembly with hand wiring and a printed plate, then a passive key PCB connected to the existing C6.
- Repository remains local-only; do not push or publish until requested.

## Decisions still open

| Decision | Evidence needed |
| --- | --- |
| First supported profile | Extend the successful bedroom TCL control test with reconnect, standby and per-app evidence |
| Controller and transport | Real-device control demonstration and current/latency measurements |
| Apple TV identity | Model number and tvOS version for each box |
| Final switch variant and keycap profile | Choc V1 family selected for prototype; compare ordered samples and available MCC caps, verify drawings and stack height |
| Connector and pinout | Controller pin budget, assembly constraints, power ratings |
| Battery type and charging | Measured loads, capacity envelope, user replacement preference |
| First expressive enclosure | Fit prototype and shared mounting envelope |
| Licenses and project name | Public release decision; editable source and commercial reuse requirements |
| Pilot quantity and price | Assembly quotes, yield, test/fulfillment effort, support allowance |

## Compatibility policy

Only label a device supported after recording its exact model/software and testing the promised actions. Keep untested or community-reported profiles visibly distinct. A successful connection is not a complete compatibility test.

## Owner decisions, 2026-10-22

- The remote runs on a battery. The handheld form factor is the point, so sleep, wake-on-key and reconnect latency are core requirements, not polish.
- It must support all three reference targets: the bedroom TCL BeyondTV4, the living-room TCL QM6K, and the Apple TVs. Per-target device profiles are required.
- Four device profiles, selected by holding Home and pressing an arrow. Details in the [software plan](software-plan.md).
