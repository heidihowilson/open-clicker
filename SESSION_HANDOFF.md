# Temporary agent handoff — Open Remote

Written October 22, 2026. This file is a temporary context dump requested by the owner. Its commit deliberately follows the initial project commit so it can be removed independently once the next agent has absorbed it. Keep durable decisions and results in the linked project documents.

## Where we stopped

The owner asked to formalize the project as a local Git repository, then specifically requested that the newest commit be a temporary handoff for another agent. The initial project commit is `0c97637` on `main`. No remote exists and nothing has been pushed. **Do not add a remote, push, or publish until the owner requests it.**

Workspace: `/Users/sethgho/dev/open-remote` on the owner's Mac. The working project name is Open Remote; naming and licenses are still undecided. This handoff does not authorize a new fabrication order or public release.

## Read these instead of reconstructing the conversation

- [README](README.md): implemented prototype, current milestone, build/test entry points.
- [Contribution notes](CONTRIBUTING.md): local workflow, environment, boundaries and hardware-test limitations.
- [Decisions](docs/decisions.md) and [architecture](docs/architecture.md): modular remote intent, current choices, unresolved interfaces.
- [First TV test](docs/tests/2026-10-22-first-tv-test.md): evidence and exact coverage. This supersedes earlier statements that no TV had been tested.
- [Reference devices](docs/reference-devices.md): both TCL inventories and unidentified Apple TVs.
- [Hardware inventory](hardware/README.md): owned boards, ordered switches, existing keycaps.
- [Firmware instructions](firmware/README.md): pinned SDK, flashing, phone and serial control, HID mappings, limitations.
- [Prototype plan](docs/prototype-plan.md), [enclosures](enclosures/README.md), [release plan](docs/release-plan.md): next physical work and eventual manufacturing.

## Conversation facts that matter for continuation

The owner wants an approachable open hardware remote with low-profile mechanical keys, configurable extras and several printable enclosure shapes for different hands. They intend to sell assembled boards for convenience while allowing others to manufacture from source. We moved away from an expensive development board to their existing ESP32 inventory. No custom silicon is needed.

Early image explorations were rejected as ugly blobs, then steered toward recognizable TV remotes, then toward more imaginative enclosure variants. Treat those as visual direction only: no dimensioned CAD, switch plate, STL, PCB schematic or PCB layout exists. A conventional fit prototype should establish dimensions before expressive shells.

The owner is new to PCB design, but **already has soldering equipment and is comfortable with soldering**. Do not restart the soldering-versus-no-solder interview. They own Keychron K8C2 and Havit HV-KB389L keyboards, but we chose to order switches instead of dismantling those. Their main keyboard is a MoErgo Glove80 and they have spare compatible MCC keycaps.

They confirmed ordering after a recommendation for Kailh Choc V1 Browns plus compatible MBK caps and optional Red/White samples. Exact quantities, variants, and whether caps were included were not confirmed; do not turn the suggested cart into a factual order inventory. They expect delivery in about a week. Existing Glove80 caps can be used; MBK caps, if purchased, offer another shape to compare.

The TVs are across the property in another building from this office computer. We therefore added a password-protected Wi-Fi AP and phone-hosted control interface on the C6, while BLE controls the TV. The computer can stay in the office. The owner enthusiastically confirmed pairing and **every button working**, then identified the tested device as the **bedroom TCL BeyondTV4**. The living-room QM6K and both Apple TVs remain untested. App-by-app behavior, quantified reliability, reconnect, standby wake, battery life and held-key repeats were not established by that report.

## Live local environment at handoff

The host panel is still running at `http://127.0.0.1:8766/`; port 8765 was occupied by an unrelated process earlier. Do not disturb it. At the time of this handoff the panel's Python PID is 84537, launched by uv PID 84526. PIDs are transient: rediscover before stopping anything. Only one program should own the C6 UART at a time; stop the panel before flashing or opening a serial diagnostic session.

Both `/dev/cu.usbmodem59580043921` (working UART bridge) and `/dev/cu.usbmodem11401` (native USB) are presently visible. Recheck after unplugging/reconnecting. Use the known UART bridge and 230400 baud for flashing; higher baud rates caused corruption during earlier reads. Opening the UART can reset this board even when RTS/DTR are initially false. Preserve working firmware unless an actual next task calls for changes.

Installed tooling lives under ignored `local/`; wrappers in `tools/` already configure it. There is no need to reinstall the SDK. The ESP-IDF checkout is pinned by `tools/setup.sh`. The app has a 2 MiB factory partition; existing NVS/PHY offsets were preserved when adding Wi-Fi increased its size.

The phone interface is reached at `http://192.168.4.1/` after joining the C6 AP. Credential values are deliberately omitted here. Local-only artifacts:

- `local/portable-access.json`: actual AP credentials.
- `local/portable-wifi.png`: phone Wi-Fi join QR; contains credentials, do not publish.
- `local/portable-test-instructions.md`: owner's instructions, also contains credentials.
- `local/backups/c6-before-open-remote-2026-10-22.bin`: full original 8 MiB flash backup, not the current prototype.
- `local/backups/backup-record.json`: original backup verification.
- `local/portable-board-check.log`: portable startup and onboard HTTP checks.
- `local/device-session.log`: host panel serial log; may contain startup credentials.
- `local/hardware-session.json`: historical machine record; pairing/status fields and firmware hash predate subsequent work and can be stale. Prefer the committed TV test record for current compatibility evidence.

These files and the installed SDK are excluded from Git. A clone of the repo will not contain them. Do not move private diagnostics into tracked files just to preserve context.

## Verification already completed

Immediately before initial commit `0c97637`, the firmware build succeeded and all four host-panel tests passed. Staged whitespace checks and local documentation links passed; actual AP credentials and private backup/build paths were checked for accidental inclusion. No firmware changes or reflash were made during repository formalization.

Earlier, portable v0.2 was flashed and passed seven real onboard HTTP checks over local TCP plus Bluetooth advertising with Wi-Fi running. The phone/TV path was subsequently validated by the owner's report, not an automated TV test. Keep those kinds of evidence distinct.

Do not blindly rerun `tools/check_board.py`: despite its opening docstring, it sends Up and assumes an unpaired board. A previously paired live target could receive input. The `webcheck` serial diagnostic also queues Stop pairing and blocks the main command loop for roughly 20–25 seconds during its socket tests; it is a bench diagnostic, not a passive status query.

## Suggested next work, when requested

The agreed next physical sequence is one wired switch mapped to OK, then eight core controls, then the two configurable positions in a ten-key layout. Preserve the successfully tested HID mappings. Physical GPIO input, debouncing and configurable A/B actions are not implemented yet. Verify the C6 board schematic and available pins before giving wiring instructions.

While parts are shipping, useful work is a dimensioned switch plate and enclosure fit study for Choc V1 plus MCC/MBK caps and the existing C6. Obtain manufacturer mechanical drawings and check actual sample dimensions when parts arrive. Printer type, material, hand dimensions and exact switch order have not been collected. Do not invent those constraints. The first custom PCB is intended as a passive key board connecting to the existing C6; modular controller, IR and battery work follow measured requirements.

No special skill is required to resume firmware or Git work. Use manufacturer documentation and relevant CAD tools for mechanical/electrical design; the imagegen skill is appropriate for visual concepts but is not a substitute for manufacturing CAD. The handoff skill was used to create this temporary summary. No agents were delegated work.

## Working style

The owner prefers practical progress, concise plain-language updates and few approval interruptions. Explain PCB concepts when needed, but do not assume they lack general hands-on skills. Local implementation and reversible setup have been welcome. Publishing remains explicitly deferred. There is no currently active instruction to order hardware, send external messages, or start autonomous work beyond preparing this handoff.
