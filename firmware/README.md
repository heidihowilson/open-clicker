# Phone and USB controlled BLE remote prototype

This application targets the Waveshare ESP32-C6-DEV-KIT-N8-M. It exposes a Bluetooth LE keyboard report and a consumer-control report, with deliberate commands from the UART console, a phone page hosted on the C6, or wired switches. Portable test mode creates a password-protected Wi-Fi access point; it does not join your home network. No infrared driver or battery management is implemented yet.

## Build

ESP-IDF is pinned to v6.1, commit `fff9895c82d744c7237be8847347bdd1b07c6643`. The setup script installs tools under the ignored project `local/` directory and uses uv to obtain a Python 3.12 environment. It does not change shell startup files.

From the project root:

```sh
./tools/setup.sh
./tools/build.sh build
```

Before writing firmware, identify the connected board and back up its flash. The connected test unit has 8 MB of flash. Its UART bridge worked at 230400 baud; faster rates failed during reads. Do not assume the native USB interface and UART bridge are interchangeable on this unit.

```sh
./tools/build.sh -p /dev/cu.usbmodem59580043921 -b 230400 flash
uv run --with pyserial python tools/control_panel.py /dev/cu.usbmodem59580043921 --port 8766
```

The partition table reserves a 2 MiB factory application at `0x10000`, with the original prototype NVS and PHY offsets preserved. The portable build requires more space than the first 1500 KiB application partition.

The device path is specific to this Mac and must be rechecked after reconnecting. Only one program should own that serial port at a time. Stop the control panel before flashing again.

Open the local panel at `http://127.0.0.1:8766`. It is bound to loopback and requires a session token and matching origin for commands. Device logs are kept in ignored `local/device-session.log`.

## Portable testing beside a TV

Power the C6 from a USB power bank or USB wall charger. On your phone, join the `OpenRemote-XXXX` network. Its device-specific password is generated once and stored in NVS; the serial startup line `PORTABLE_READY` prints it for setup. Keep credentials in ignored local notes, not in published source.

Open **http://192.168.4.1/** in the phone browser. This Wi-Fi network intentionally has no internet; choose to stay connected if the phone asks. The page runs entirely on the C6. The computer and property Wi-Fi are not needed beside the TV.

This is a temporary testing interface. Wi-Fi and BLE run together with ESP-IDF software coexistence enabled. It does not represent the final remote's power use or physical-button latency. Disconnect USB power to turn it off. After powering back on, reconnect the phone and reload the page before pairing again.

## Pair and test

1. Click Start pairing. The board advertises as **Open Remote C6** for two minutes.
2. On the TCL, select Settings → Remote & Accessories → Pair remote or accessory.
3. Select Open Remote C6. If a six-digit code appears, submit it in the panel. If numeric comparison is requested instead, confirm only matching codes.
4. Wait for authenticated status, then test individual directions and OK.
5. Test Back, Home, and Play/Pause separately in the launcher and a playback app. Escape and Space are alternative test commands, not automatic fallbacks.

Input is discarded when disconnected or unauthenticated. Each click sends a 60 ms press and a release. A release is retried once on transport failure, and stale input is not replayed into a new connection. A successful transmission is not a TV acknowledgment. The phone page and serial console send single taps; held-key repeats exist only for wired direction keys.

The initial pairing interaction uses the phone or computer for passkey entry; it does not yet solve the final screenless remote's pairing interaction. Bonds are stored by the Bluetooth stack. After a restart or disconnect, explicitly open pairing again to advertise/reconnect; unattended reconnection is not implemented.

The USB-powered bench fixture reports 100 percent through the HID battery service as a fixed placeholder. It is not a battery measurement. The board is not configured for a battery-life test.

## Command mapping candidates

| Command | HID usage | Intended action |
| --- | --- | --- |
| up/down/left/right | Keyboard 0x52/0x51/0x50/0x4F | Navigation |
| ok | Keyboard 0x28 | Enter/select |
| escape | Keyboard 0x29 | Alternative Back candidate |
| space | Keyboard 0x2C | Alternative playback candidate |
| back | Consumer 0x224 | AC Back |
| home | Consumer 0x223 | AC Home |
| play | Consumer 0xCD | Play/Pause |
| volume_up/down | Consumer 0xE9/0xEA | Volume candidates |
| mute | Consumer 0xE2 | Mute candidate |

Home and Back passed in the owner-reported [first TV test](../docs/tests/2026-10-22-first-tv-test.md); the target was the bedroom TCL BeyondTV4, and other targets remain unverified. A and B are unassigned by default and never send literal letters; see [physical keys](#physical-keys).

## Physical keys

Firmware v0.3 reads ten independent switches. Wire one leg of each switch to the listed pin and the other leg to any GND pin. Internal pull-ups make a press read low; no resistors or diodes are needed. Pins come from the Waveshare ESP32-C6-DEV-KIT-N8 schematic. Strapping pins (4, 5, 8, 9, 15), native USB (12, 13) and the console UART (16, 17) are deliberately unused. GPIO 0, 1, 6 and 7 remain spare.

Header positions count from pin 1 at the USB end; `P1` is the 3V3/5V side and `P2` is the TX/RX side.

| Key | GPIO | Header | Action | Repeats when held |
| --- | --- | --- | --- | --- |
| OK | 18 | P2-10 | ok | No |
| Up | 19 | P2-9 | up | Yes |
| Down | 20 | P2-8 | down | Yes |
| Left | 21 | P2-7 | left | Yes |
| Right | 22 | P2-6 | right | Yes |
| Back | 23 | P2-5 | back | No |
| Home | 10 | P1-10 | home | No |
| Play/Pause | 11 | P1-11 | play | No |
| A | 2 | P1-12 | unassigned | No |
| B | 3 | P1-13 | unassigned | No |

GND is available at P1-15, P2-1, P2-12 and P2-15. The cluster of directions, OK and Back sits on P2 next to ground.

Inputs are sampled every 5 ms and must be stable for 20 ms. A press sends the same 60 ms tap as the phone page, so no key can stick down across a disconnect. Direction keys repeat after 400 ms, then every 150 ms. A press is dropped, not queued, while an earlier tap is still sending. A key that is held or shorted at startup does nothing until it is released.

Every debounced edge prints `KEY <name> pressed` or `released` on the serial console, even when no TV is connected. That makes the first switch testable on the bench without pairing. `keys` prints the map and live state of each input.

Assign A or B to any action in the command table with `map a mute` or `map b volume_up`; `map a none` clears it. Assignments persist in NVS. Long-press OK (Android context menus) is not supported, because OK sends a tap on press.

## Verification

The panel tests use a pseudo-terminal, not the real board:

```sh
uv run --with pyserial python -m unittest discover -s tests -v
```

They verify command delivery, invalid-command rejection, origin/token enforcement, and status display. Compilation and device startup checks are distinct from actual TV compatibility. Record real-device results using the project test template.

The serial command `webcheck` tests the actual onboard HTTP server through local TCP: page/token substitution, status, missing-token rejection, malformed commands, origin rejection, and queueing a harmless Stop pairing command. It does not test phone Wi-Fi reception or TV Bluetooth behavior. It closes the pairing window and blocks the command loop for about 20–25 seconds, so it is a bench diagnostic, not a passive status query.

## Restore

The pre-flash backup belongs in `local/backups/`. Verify its size and checksum against the local hardware session record before restoring. For this 8 MB unencrypted unit, restoration writes that full image at address zero using esptool; stop the panel and target the identified UART port. Do not burn eFuses or change secure-boot settings.
