# Project decisions

## Established direction

- Open hardware streaming remote with mechanical keys and printable enclosure choices.
- Offer assembled boards for convenience while publishing reproducible design sources.
- Ten-key baseline with two configurable keys.
- Use existing chips; no custom silicon.
- Separate physical inputs, logical actions, device profiles, and transport drivers.
- Provide a working reference integration; community adapters extend supported devices.
- Custom boards get built through group buys: a shared design URL, members commit to one board each, payments held in an escrow contract on Base, and trust through Ethos identity and reviews. Proof of concept for Ethos; Seth handles no money and forms no business. See [group-buy.md](group-buy.md) (2026-10-30).

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

## Owner direction, 2026-10-24

- Open Clicker (named Open Remote until 2026-10-26) is a design system with a web Designer: choose a chip, lay out keys, choose battery and shell, preview in 3D, export build files. One design file drives every output. See [Designer](designer.md).
- The PCB targets the shared XIAO footprint so builders can choose the chip. Bare-chip choice is not fixed to the ESP32-C6.
- IR transmit and receive are optional parts on the main board, not plug-in modules.

## Owner decisions, 2026-10-26

- The project is named **Open Clicker**. The repository is `heidihowilson/open-clicker`. The domain `openremote.sethgholson.com`, the celld fleet `openremote` and the homelab deploy paths keep the old name.
- The designer exports a KiCad project: a schematic and a board with every part placed and every pad on its net. The netlist, pin plan and part designators are implementation details and stay out of the UI.

## Owner decisions, 2026-10-28 and 2026-10-29

- **Shell edges.** A printed mockup with square edges dug into the hand. The shell now has a 4 mm round on the top edge, and a 4 mm round on the bottom edge that becomes a 45° bevel near the bed, so it prints without support. The owner confirmed that the second mockup feels much better. This profile is the default (`EDGES` in `designer/src/lib/geometry.ts`).
- **Controller: nRF52840 on the u-blox BMD-340 module.** It replaces the XIAO ESP32-C6 for the product board. Reasons:
  - a remote is idle almost all the time, and the nRF52840 can stay connected over Bluetooth LE on very little power;
  - it has Bluetooth LE and Thread/Zigbee, so a Matter keypad stays possible;
  - the BMD-340 carries radio certifications, which a sold Kit needs.
  - Wi-Fi is given up. Firmware updates go over Bluetooth, and a companion app comes later, not now.
- **The Kit needs no soldering.** The board arrives fully assembled by the factory. The buyer prints the shell, drops the board in, plugs in the battery, fits switches and caps, and flashes it. Every part on the board is chosen so a factory can place it.
- **The owner's first board** will be this design, ordered after more design iterations. The ESP32 boards on hand stay for firmware experiments only.

See [`hardware-sourcing.md`](hardware-sourcing.md) for the stock check and the open questions.

### Board around the BMD-340, 2026-10-29

- The module runs in high-voltage mode: the LiPo cell feeds VCCH directly and VCC is the module's own 3.0 V output (data sheet §3.3). There is no regulator on the board. USB 5 V reaches the module's VBUS pin and the MCP73831 charger only.
- Charging is 100 mA (PROG 10 kΩ), gentle for a 250 mAh cell, with a red charge LED.
- USB-C is a sink: 5.1 kΩ on each CC pin.
- The IR LED is switched from the cell, not from VCC, because VCC may supply only 25 mA.
- The battery level is read inside the chip (VDDH ÷ 5), so the board has no divider and spends no pin on it.
- SWD comes out on a Tag-Connect TC2030 pad, for the one-time bootloader flash.
- No copper is allowed in the antenna area at the module's end (data sheet figure 12); the antenna sits at the board's right edge in the chin.
- The chin needs a board at least 58 mm wide, so 1- and 2-column remotes get a wider shell.
- Both copper layers get a ground fill after routing; the router wires ground as an ordinary net first, because a fill made before routing was cut into unconnected pieces.
- Routed bundles include JLCPCB assembly files (BOM and CPL).
