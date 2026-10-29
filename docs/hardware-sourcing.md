# Hardware sourcing notes

Working notes for the factory-assembled board. Last updated 2026-10-29.

## Goal

One-click buying: the board arrives fully assembled, with no soldering for the buyer. Build steps for a Kit:

1. Print the shell.
2. Drop the board in.
3. Plug in the battery.
4. Fit the switches and the keycaps.
5. Flash the firmware.

## Controller

**u-blox BMD-340** (nRF52840 module), JLCPCB part C5456944, LGA-60.

| Option | JLCPCB part | Price (each) | Stock 2026-10-29 | Notes |
| --- | --- | --- | --- | --- |
| u-blox BMD-340-A-R | C5456944 | ~$9.75 | 405 | **Chosen.** Certified module. |
| Ebyte E73-2G4M08S1C | C356849 | ~$7.69 | 837 | Cheaper. Certification not yet checked. |
| Bare nRF52840-QIAA | C190794 | ~$5.97 | 45,049 | Needs our own antenna and RF design and loses module certification. Rejected. |
| ESP32-C6-MINI-1-H4 | C6553337 | ~$4.44 | 996 | Earlier candidate. Rejected for battery life (see decisions). |

Prices and stock come from the JLCPCB parts search on the date above and change daily. Check them again before any order.

## Switch sockets: open

The board uses Kailh Choc V1 hot-swap sockets (CPG135001S30) so that switches press in without solder. On 2026-10-29 JLCPCB had **no stock** (C5333465). Options:

- PCBWay turnkey assembly, which sources parts globally;
- a JLCPCB pre-order through global sourcing, which adds lead time;
- consigned parts: we buy the sockets and send them to the factory.

The owner is **not yet convinced** that hot-swap sockets are the right choice. Test the switches by hand before committing. Alternatives to compare:

- factory-soldered switches, through-hole or with the switch placed in assembly;
- other socket types.

## Everything else

Diodes (1N4148W), resistors, the IR LED driver, the USB-C connector and the battery connector are common stocked parts. Check each one when the board is redesigned.

## Open questions

- **Shopping experience:** what the buyer orders and from whom (our store, or a factory link with the files), and how the Kit, Half-built and Fully assembled tiers map onto that.
- **Switch mounting:** hot-swap sockets or factory-soldered switches (see above).
- **Power:** battery size, the charger chip and its stock, and the measured sleep current on a real board.
- **Firmware:** the current firmware is ESP-IDF on the ESP32-C6. The nRF52840 needs new firmware (Zephyr, possibly ZMK for keys) with our IR and profile features added.
- **Updates:** over Bluetooth through a companion app (later), or Web Bluetooth from the website (Chrome only, not Safari on iPhone).
- **Models:** the BMD-340 footprint and 3D model are in the repo, checked against the data sheet; see [`hardware-models.md`](hardware-models.md).
- **Designer:** the board generator, 3D parts and bill of materials still model the XIAO ESP32-C6, so they must move to the BMD-340.
