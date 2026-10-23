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

## Pilot cost worksheet

Request quotes only from a specific revision and orderable component list. Track board fabrication, parts, assembly/setup, shipping/import costs, expected rejects/rework, programming/test labor, packaging, payment fees, fulfillment, support/replacements, and margin. Divide batch-level costs by saleable units rather than boards ordered.

Compare complete landed-and-tested kit cost across quantities. No price or battery-life promise should be published from the current architecture notes.

## Release boundaries

The project intends genuine open hardware, including editable sources and permission for others to manufacture and sell derivatives. The strongly reciprocal hardware licence keeps derivatives open, including ones sold as assembled boards. [OSHWA's definition](https://oshwa.org/definition/) describes these freedoms.

Before a commercial pilot, determine destination markets and review applicable radio/product requirements and battery handling/shipping obligations for the actual configuration. Track the chosen radio module's integration conditions in the design record.

No custom PCBs have been ordered. The source repository is public. Firmware is MIT, hardware and enclosures are CERN-OHL-S-2.0, and documentation is CC BY-SA 4.0. Existing C6 development hardware passed bench checks and an owner-reported TV control test. Choc V1 switches are ordered for the next physical prototype; production hardware validation remains outstanding.
