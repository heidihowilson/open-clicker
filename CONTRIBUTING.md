# Working on Open Remote

This repository is currently local-only. Do not add a remote, push, publish packages, or upload manufacturing files until the owner requests it. Open-source publication is the intent; licenses have not yet been selected.

## Development

The current implementation targets only the Waveshare ESP32-C6-DEV-KIT-N8-M. The other owned boards are future targets, not supported build configurations.

1. Install Git and [uv](https://docs.astral.sh/uv/getting-started/installation/).
2. Run `./tools/setup.sh` to install the pinned ESP-IDF source and toolchain under ignored `local/`.
3. Run `./tools/build.sh build`.
4. Run `uv run --with pyserial==3.5 python -m unittest discover -s tests -v`.

The host panel and tests use pyserial; tests use a pseudo-terminal and do not require hardware. The setup and host tools have been exercised on macOS. The pseudo-terminal tests require a Unix-like system; Windows support has not been verified.

See [firmware instructions](firmware/README.md) for explicit flashing, phone access, and serial controls. Identify the board and preserve its firmware before flashing a new device. Stop programs holding its serial port before flashing. Never run `tools/check_board.py` on a paired device: it sends an Up command to verify rejection while disconnected. It is an unpaired bench check, not an unattended regression test.

## Project boundaries

- Keep working HID usages stable while introducing physical inputs.
- Record target-specific results in `docs/tests/`, using the device test template. Separate owner reports, automated bench checks, and untested behavior.
- Mechanical drawings, verified pin assignments, and physical samples must precede a fabrication-ready PCB or enclosure claim.
- Keep credentials, radio bonds, device backups, personal network details, logs, installed SDKs, and generated builds under ignored local paths. Backups under `local/` are not protected by Git; preserve them separately before deleting or moving that directory.
- Do not commit third-party SDK checkouts. `tools/setup.sh` records the exact ESP-IDF revision.
- Select licenses for software, hardware, and documentation before public release. Do not interpret the current absence of a license as a grant of reuse rights.
