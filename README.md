# Open Remote

**Design your own remote: <https://openremote.sethgholson.com>** (source in [`designer/`](designer/README.md)).

An open hardware streaming remote with low-profile mechanical keys, interchangeable key layouts, and printable enclosures. Open Remote is a working project name.

The intended product is a tested electronics kit that people can buy assembled or manufacture from the published designs. It should work with a documented reference device and remain straightforward to extend to others.

## Current stage

The Waveshare C6 runs a USB-powered BLE remote, controlled from a phone over its own Wi-Fi access point or from a computer over serial. The owner reports successful pairing and every control button working on the **bedroom TCL BeyondTV4** (Android 11 in the supplied inventory). See the [test record](docs/tests/2026-10-22-first-tv-test.md) for scope and evidence.

The board passed report-map, command rejection, advertising and seven onboard HTTP checks; four host panel tests also passed. Reconnection, standby, battery life, the living-room QM6K and Apple TVs remain unverified. There is no custom PCB or printable enclosure yet.

Firmware v0.3 adds debounced input from ten wired switches; see [physical keys](firmware/README.md#physical-keys). It compiles but has not yet run on the board.

**Next milestone:** wire the first switch to OK, then a handheld fit prototype. Choc V1 switches have been ordered and are expected in about a week; compatible Glove80 MCC keycaps are already available. Exact order quantities and variants are not recorded.

## Local development

Requires Git and [uv](https://docs.astral.sh/uv/getting-started/installation/). Run from this repository:

```sh
./tools/setup.sh
./tools/build.sh build
uv run --with pyserial==3.5 python -m unittest discover -s tests -v
```

Setup installs the pinned ESP-IDF v6.1 checkout and C6 toolchain under ignored `local/`. Build and tests do not flash the board. See [firmware setup and controls](firmware/README.md) for flashing and pairing, and [contribution notes](CONTRIBUTING.md) for workflow and test limitations.

Device credentials, backups, logs and installed tools are excluded from Git.

## First build

- Ten keys: Home, Up, Down, Left, Right, OK, Back, Play/Pause, A, B.
- One passive key board, a replaceable controller, and an optional IR front board.
- USB-powered bench prototype first; one battery configuration after power measurements.
- A known-good device profile, remapping, diagnostics, and firmware recovery.
- Printable enclosures with shared mounting geometry; more adventurous shells follow the physical fit prototype.

## Project documents

- [Architecture and module boundaries](docs/architecture.md)
- [Reference devices and first control experiments](docs/reference-devices.md)
- [Device test record template](docs/device-test-template.md)
- [ESP32 prototype approach using existing hardware](docs/esp32-prototype.md)
- [Owned boards, switches and keycaps](hardware/README.md)
- [Enclosure prototype requirements](enclosures/README.md)
- [Firmware build and local control panel](firmware/README.md)
- [Prototype milestones and acceptance checks](docs/prototype-plan.md)
- [Open Remote Designer: the web app and its design file](docs/designer.md)
- [Software plan: profiles, reconnect, sleep and pairing](docs/software-plan.md)
- [Decisions and unresolved questions](docs/decisions.md)
- [Manufacturing and open release](docs/release-plan.md)

Hardware source belongs in `hardware/`, firmware in `firmware/`, and editable enclosure models in `enclosures/`. Firmware is implemented; electrical CAD and mechanical CAD will follow the relevant component and interface decisions. The first successful reference test is the bedroom TCL BeyondTV4, running Android 11 in the supplied inventory. The living-room TCL QM6K and two Apple TVs whose generations remain to be identified are still untested.

## Open release intent

Publish editable electrical and mechanical designs, firmware, build instructions, manufacturing exports, and test procedures. - Firmware (`firmware/`): [MIT](firmware/LICENSE).
- Hardware and enclosures (`hardware/`, `enclosures/`): [CERN-OHL-S-2.0](hardware/LICENSE). Modified designs you distribute or manufacture must publish their source under the same licence.
- Documentation (`docs/` and the Markdown files in this repository): [CC BY-SA 4.0](docs/LICENSE).

Host tools in `tools/` and `tests/` are not licensed yet.
