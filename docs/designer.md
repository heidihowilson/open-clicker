# Open Remote Designer

Open Remote is a design system, not a single remote. The Designer is the web app that ties it together: choose a chip, place the keys where your thumb wants them, choose a battery and a shell, see the result in 3D, and get every file needed to build it. Ordering comes later.

Owner direction, 2026-10-24. This document keeps hardware, firmware and the app aligned on one model.

## One design file

Every remote is one **design file** (JSON, schema-validated). It is the single source of truth:

- **Controller:** a chip profile, for example XIAO ESP32-C3, XIAO ESP32-C6 or XIAO nRF52840.
- **Keys:** positions and rotations on a grid, each with an action (Home, OK, a profile slot, IR power and so on) and a keycap family (Choc V1 with MCC or MBK).
- **Options:** IR transmitter, IR receiver, battery cell.
- **Shell:** a shell family (for example EXO, FOLD, LOOP, FIN, OFFSET, KEEL) and its parameters.

The app edits this file. Nothing else is hand-maintained.

## Generators

The same file produces every output, in the browser and in CI:

| Output | From |
| --- | --- |
| 3D preview | keys, keycaps, plate, board outline, shell |
| PCB (KiCad) | key positions, matrix, controller footprint, IR and battery options |
| Switch plate and shell (STL/3MF) | key positions, board outline, battery size, shell parameters |
| Firmware keymap | key actions and their matrix positions |
| Bill of materials | everything above |

Ergogen is JavaScript and already turns a layout into a KiCad PCB, so the PCB generator can run in the browser. CSG for the plate and shell can run in the browser through a WASM geometry kernel such as Manifold.

## Constraints come from data

Each chip profile is data: usable pins, which pins can wake the chip from deep sleep, measured sleep and connected current, price, and board dimensions. The app checks a design against its profile while you edit:

- Key count fits the matrix the free pins allow, with IR options counted.
- Matrix columns sit on wake-capable pins, so any key wakes the remote.
- Keys keep minimum Choc spacing and do not collide with the controller, battery or USB access.
- The battery fits the shell, with an estimated life from the profile's measured currents.

A failed check explains itself and suggests a fix. Profiles hold measured numbers only, so a value is marked unmeasured until the bench has it.

## Community

Seed designs are design files in this repository. A contribution is a design file plus a build photo, reviewed like code. Shared changes stay open under CERN-OHL-S.

## First slice

1. The design-file schema and the three XIAO chip profiles.
2. A layout editor with a live 3D preview of keys, plate and board outline.
3. Constraint checks for pin budget, wake pins and spacing.
4. Export of the firmware keymap and the KiCad PCB for one seed design.

Shell generation, the bill of materials and ordering follow.
