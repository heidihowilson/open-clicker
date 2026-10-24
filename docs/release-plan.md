# Manufacturing and open release

## Reproducible release contents

- Editable KiCad schematic and PCB files with pinned library dependencies.
- Exact manufacturer part numbers and approved substitutions, if tested.
- Gerbers, drills, placement files, assembly drawings, and bill of materials.
- Firmware source, reproducible build instructions, tagged binaries, and recovery instructions.
- Editable enclosure CAD plus printable exports and documented print orientation/settings.
- Module pinouts, mechanical interface drawings, and assembly instructions.
- Functional test procedure and supported-device records.
- Explicit licenses covering hardware, firmware, and documentation.

[PCBWay's assembly requirements](https://www.pcbway.com/helpcenter/pcb_assembly_ordering/What_files_are_requested_for_assembly_production_.html) describe the manufacturing inputs. Fabrication acceptance does not replace electrical or functional verification.

## Kit options under consideration

A community request asked for a "PCB kit". The term has no fixed meaning; it usually means "sell me the electronics so I can build my own remote". Three tiers are being considered, and none is chosen yet:

- **Bare PCB:** an empty board. The buyer sources every part and solders it.
- **Kit with loose components:** the board plus the required parts, unassembled. The buyer solders and assembles.
- **Kit with assembled electronics:** tested controller and key boards with the chips and small parts already installed. The buyer adds switches, keycaps, an enclosure and power.

The assembled tier fits the project intent best: sell tested boards, publish printable enclosures, and let buyers choose switches, caps and shell. Anyone can still order boards from the published files.

Hot-swap switch sockets are a separate, related request. They let a builder change switches without desoldering, and could be fitted to an assembled key board. They add height and cost, so evaluate them against the switch and enclosure stack before committing the footprint.

## Pricing tiers (owner decision, 2026-10-24)

The Designer prices every design three ways (`designer/src/lib/pricing.ts`):

1. **Solder and print yourself:** the builder buys every part at retail, orders bare PCBs (in fives), solders everything including the diodes, and prints the shell.
2. **No-solder kit, print your own shell:** we supply the PCB assembled by the fab with diodes, resistors, hot-swap sockets and a battery connector, the XIAO fitted and flashed, plus switches, keycaps and battery. The builder pushes in switches and caps and prints the shell.
3. **Fully assembled:** a finished, tested remote in one of our printed shells.

Tiers 2 and 3 show our batch cost and a price at a chosen gross margin. Batch size, margin and labor rate are editable assumptions. For the Classic column on an ESP32-C6, with 50-unit batches, a 40% margin and $30/h labor, the estimates are about $27 DIY (plus about $18 once per PCB order), $53 for the kit and $67 assembled. Shipping and tax are excluded. These are planning numbers, not quotes.

## Pilot cost worksheet

Request quotes only from a specific revision and orderable component list. Track board fabrication, parts, assembly/setup, shipping/import costs, expected rejects/rework, programming/test labor, packaging, payment fees, fulfillment, support/replacements, and margin. Divide batch-level costs by saleable units rather than boards ordered.

Compare complete landed-and-tested kit cost across quantities. No price or battery-life promise should be published from the current architecture notes.

## Release boundaries

The project intends genuine open hardware, including editable sources and permission for others to manufacture and sell derivatives. The strongly reciprocal hardware licence keeps derivatives open, including ones sold as assembled boards. [OSHWA's definition](https://oshwa.org/definition/) describes these freedoms.

Before a commercial pilot, determine destination markets and review applicable radio/product requirements and battery handling/shipping obligations for the actual configuration. Track the chosen radio module's integration conditions in the design record.

No custom PCBs have been ordered. The source repository is public. Firmware is MIT, hardware and enclosures are CERN-OHL-S-2.0, and documentation is CC BY-SA 4.0. Existing C6 development hardware passed bench checks and an owner-reported TV control test. Choc V1 switches are ordered for the next physical prototype; production hardware validation remains outstanding.
