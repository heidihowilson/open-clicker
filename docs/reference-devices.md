# Reference devices and first control experiments

Inventory supplied by the project owner on October 22, 2026. Device facts below are owner-reported. The [first TV test](tests/2026-10-22-first-tv-test.md) passed pairing and all control buttons according to the owner; the owner confirmed the target was the bedroom TCL BeyondTV4. Model and firmware identifiers define test coverage. Processor, memory, and rendering resolution do not by themselves establish remote compatibility.

## Planned test order and actual results

| Order | Device | Purpose | Status |
| --- | --- | --- | --- |
| 1 | Living-room TCL QM6K, 2025 | Establish first usable profile on Android 14 | Untested |
| 2 | Bedroom TCL BeyondTV4 | Establish Android 11 reference behavior | Pairing and all buttons passed, owner-reported October 22, 2026 |
| 3 | Apple TV A | Establish a second platform; Bluetooth and IR experiments | Model and software unknown |
| 4 | Apple TV B | Compare generations or confirm a second unit | Model and software unknown |

The Apple TVs are reportedly relatively modern and currently unused. Record model number and tvOS version before assigning any generation-specific capability. They may be the same generation.

## TCL QM6K inventory

- Product description: TCL QM6K Smart TV Pro, 2025.
- System: Google TV, Android 14, API 34; security patch December 5, 2025.
- Build: `UTT2.250416.001`, version `AU16`.
- Reported firmware identifier: `TCL/G08_4K_US/G08:14/UTT2.250416.001/AU16`.
- Processor: MediaTek MT5896, four cores; board `tcl9618`, platform `merak`.
- Memory: 2.4 GB. Storage: 21 GB total, 16 GB free at inventory time.
- Display: reported 3840 × 2160 panel, with UI rendering at 1920 × 1080.
- Wi-Fi hardware: MediaTek MT7663.

## TCL BeyondTV4 inventory

- Product: `G03_4K_US_NF`; device: `BeyondTV4`; marketed as TCL Smart TV.
- System: Google TV, Android 11, API 30; security patch October 5, 2023.
- Build: `RP1A.200622.001`, version `AR21`.
- Reported firmware identifier: `TCL/G03_4K_US_NF/BeyondTV4:11/RP1A.200622.001/AR21`.
- Product information: `V8-R51MT05-LF1V812.021144`.
- Processor: Realtek RTD2851M, four cores; platform `rtd288o`.
- Memory: 2.0 GB. Storage: 10 GB total, 5.9 GB free at inventory time.
- Display: apps report 1920 × 1080; this does not establish physical panel resolution despite the product's 4K name.
- Network: Wi-Fi with reportedly stable address and randomized hardware address.

Local address hints are kept in ignored `local/device-network.json`. They are suffixes only, not complete reachable addresses. They are irrelevant to the first Bluetooth experiment and must not be turned into guessed IP addresses.

## Recommended first experiment

Use a Bluetooth LE HID peripheral for navigation and consumer-control commands. First verify basic operation on a computer as a diagnostic control, then test the QM6K, followed by the older TCL. The computer result validates the peripheral only; it does not prove television support.

TCL documents Bluetooth accessory pairing at Settings → Remote & Accessories → Pair remote or accessory. Its general accessory guidance does not promise that our particular BLE HID implementation or every action is supported. [TCL pairing instructions](https://support.tcl.com/en_US/us-googletv-common-questions/can-i-connect-bluetooth-devices-to-google-tv)

An existing Bluetooth keyboard can provide a preliminary behavior check without new hardware. Record its exact model and whether it uses Bluetooth Classic or BLE if known. If that is unknown, do not treat successful pairing as proof of BLE support. USB keyboard behavior likewise does not establish Bluetooth compatibility.

Use arrow keys and Enter to check navigation/selection, and try Escape as a Back candidate. Test any available media key separately. Record results in the launcher, settings, and at least one playback app with its version. These are candidate mappings, not verified remote commands.

Android documents navigation, selection, Back, and media events, but the TV's input mapping determines how a HID report becomes an Android event. Do not send Android `KEYCODE_*` numbers as Bluetooth HID usages. The ordinary keyboard Home key is not equivalent to Android's system Home action. [Android controller guidance](https://developer.android.com/training/tv/get-started/controllers)

## First firmware experiment

Use the owner's Waveshare ESP32-C6-DEV-KIT-N8-M. Also available: a Waveshare S3 1.46-inch round touchscreen board and Teyleten Robot original ESP32 30-pin boards for optional Bluetooth Classic comparison. No Nordic board purchase is needed. See [ESP32 prototype approach](esp32-prototype.md).

Use Espressif's [BLE HID device example](https://raw.githubusercontent.com/espressif/esp-idf/v5.5.1/examples/bluetooth/esp_hid_device/README.md) as the initial transport reference; this tagged example lists both C6 and S3 support. Its BLE demonstration sends volume changes periodically. Remove that automatic transmission behavior before pairing to a TV and instead require deliberate serial-console or button input. Add keyboard navigation and consumer-control reports, releases, and a target profile. Pin and verify an SDK release before implementation. A dedicated prototype has now been built and flashed on the C6; the owner has now reported successful TV pairing and all control buttons, on the bedroom TCL BeyondTV4.

Pairing is a first-class test: a ten-key remote has no numeric keyboard or display. Record whether the host asks for passkey entry, numeric confirmation, or another flow. A serial console may help the bench experiment, but a shipping remote must have a usable pairing flow without a developer computer. Do not resolve pairing trouble by silently weakening security.

Use ESP-IDF for the prototype rather than assuming a generic ESP32 Arduino keyboard library supports both selected chips. Keep the hardware-specific input/display adapters separate from logical actions and BLE reports. The sample is a starting point, not finished remote firmware.

## Apple TV experiments

Apple documents wireless keyboard pairing on Apple TV 4K through Settings → Remotes and Devices → Bluetooth. Test our BLE reports on the actual boxes after identifying them; generic keyboard support is not a guarantee of full Siri Remote behavior. [Apple Bluetooth guidance](https://support.apple.com/guide/tv/connect-bluetooth-devices-atvbbf148994/tvos)

IR is a useful independent path: Apple TV 4K offers Settings → Remotes and Devices → Learn Remote. The box learns commands emitted by the remote. This may avoid reproducing an Apple-specific IR protocol for the basic learned actions, but supported actions, timing, and generation behavior still need testing. It is different from our remote learning codes from an existing TCL handset. [Apple IR learning guidance](https://support.apple.com/guide/tv/use-other-remotes-to-control-apple-tv-4k-atvb0410f604/tvos)

## Network control as a later experiment

Home Assistant's Android TV Remote integration provides a useful implementation reference for devices running Android TV Remote Service. Its documentation notes that some TCL devices become unavailable while off unless Screenless service is enabled. That is a reported integration limitation, not a verified fact about these exact two firmware versions. Measure baseline standby behavior first and record any settings changed in subsequent experiments. [Android TV Remote integration](https://www.home-assistant.io/integrations/androidtv_remote/)

Keep network integration separate from Bluetooth and IR testing. Neither enabling developer access nor reverse-engineering the TV is a prerequisite for the first Bluetooth prototype. No TV network connection or network discovery scan has been performed. The C6 has been flashed and the owner has reported a successful Bluetooth pairing/control test; the target was the bedroom TCL BeyondTV4. Exact pairing/settings interaction was not recorded.

## Action and power coverage

| Feature | Evidence required on every target |
| --- | --- |
| Four directions | Single presses and holds in launcher, settings, and playback app |
| OK | Selection and release; record context-specific playback behavior |
| Back | Returns one level; no accidental deletion or text-only behavior |
| Home | Actual system home behavior; not cursor movement or app-only navigation |
| Play/Pause | Correct media action without repeated toggles while held |
| A and B | Explicitly chosen mappings; physical A/B labels are not literal typing defaults |
| Reconnection | Bond persists after remote restart and target restart |
| Pairing | Can be completed with the final ten-key interface |
| Wake | Test remote idle while TV is awake separately from TV standby |
| Volume/power | Optional follow-up coverage; may require a separate device/transport |

For standby, record behavior after 1, 10, and 60 minutes and overnight. Distinguish a connected TV with its display off from deeper standby. No remote is expected to wake a television disconnected from mains. If testing Apple TV through a TCL television, separately record which device receives the command and whether HDMI-CEC causes another device to wake; do not attribute that to direct remote control.

## Design consequence

Proceed with Bluetooth-first bench testing and reserve an independently driven IR front module. Keep the controller interchangeable so an eventual Wi-Fi variant can reuse the key board and shells. The proposed module interface remains provisional until the ten-input pin budget, IR driver, power architecture, and mechanical stack are checked.
