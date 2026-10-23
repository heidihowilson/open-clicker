# Prototype milestones

## 1 Select a reference target

The first owner-run test passed pairing and all control buttons on the bedroom TCL BeyondTV4 (Android 11/AR21 in the supplied inventory). Test the living-room TCL QM6K running Android 14/AU16 next. Test the two Apple TVs after recording their models and software. See [reference devices](reference-devices.md) for the supplied inventory and control experiments. Confirm a working original remote or other setup control is available; its presence has not yet been recorded.

Deliverable: one supported control path with evidence, plus explicit limits such as power-on or volume support. Neither is included in the initial ten-key promise unless separately mapped and tested.

## 2 Prove control using development hardware

Use one development board, a few momentary switches, and USB power. Start with navigation, OK, and Back. Select Bluetooth, IR, or a documented network interface based on the reference target. Add all ten actions only after this path works.

Record setup steps, firmware version, device version, pairing, and recovery. Avoid a custom PCB until the transport works on the actual target.

## 3 Measure the experience

The following are initial engineering targets, subject to revision from measurements rather than product claims:

| Check | Proposed acceptance |
| --- | --- |
| Normal navigation | 100 deliberate presses with no missing or duplicate device actions |
| Held direction | Predictable repeats; stops promptly on release |
| Single-action keys | Home and Play/Pause do not repeat when held |
| Idle recovery | First press after 1, 10, and 60 minutes reaches the target; record latency and failures |
| Connected latency | Aim below 100 ms from switch edge to transmission; separately measure visible target response |
| Reconnection | Restart target and remote; recover without stuck inputs or stale command replay |
| Pairing/reset | A new user can pair, clear settings, and restore a known-good image from written instructions |
| Power | Measure active, idle, sleeping, and transmit current at a stated voltage; record development-board overhead |

Use timing instrumentation where available, or synchronized video with stated measurement resolution. Record raw observations, not just pass/fail.

Estimate battery life only after measurement: usable capacity divided by average current, with active/idle duty cycle and regulator losses included. Account for peak IR/radio load and battery voltage range. Do not infer production life directly from a development board with indicator LEDs and USB circuitry.

## 4 Build the fit prototype

Select exact switch/keycap samples. Print a small key-spacing and enclosure-stack mockup before full shells. Test reach for all ten keys, accidental presses, button clearance, grip comfort, and battery volume. Compare a conventional shell and one expressive shell around the same proposed internals.

Deliverable: measured component envelopes and a provisional mounting interface.

## 5 Design and validate the custom boards

Create the schematic and board layout only after transport, pin budget, power path, switch footprint, and stack height are established. Review footprints against drawings, connector orientation, antenna clearance, IR driver ratings, and recovery access. Run electrical and layout checks, then obtain a small prototype assembly quote.

On arrival, inspect and perform current-limited power-up before installing a battery. Verify rails, programming, all keys, radio/IR behavior, and sleep current. Record rework and revise source files before making a new fabrication release.

## 6 Prepare a pilot kit

Publish a tested configuration and compatibility record. Create a programming and functional test procedure for each shipped board. Verify assembly instructions with someone who did not design the hardware. Resolve applicable product compliance and battery shipping requirements before selling into chosen markets.

## Immediate parts categories

Choc V1 switches have been ordered and are expected in about a week; exact order contents are unconfirmed. The owner has compatible Glove80 MCC keycaps and soldering equipment. The Waveshare C6 is identified, backed up, flashed, and passed its first owner-run TV control test using the phone interface. Next, verify the board pin assignments and wire one physical switch, then expand to the ten-key layout. The C6 listing is for an assembled board with headers. The original ESP32 boards are available for Bluetooth Classic comparison, and the S3 touch board for diagnostics. The final switch variant, IR components, and production module remain undecided. See [ESP32 prototype approach](esp32-prototype.md).

- One controller development board suitable for the selected transport.
- Ten low-profile switches and matching keycaps, plus samples/spares.
- Prototype wiring and switch breakout/adapters if required by the chosen footprint.
- Optional IR emitter, rated driver components, and receiver after protocol selection.
- USB cable and suitable power/current measurement equipment.
- Printed spacing and enclosure mockups.

A rechargeable cell and custom charger board are not required to prove the first control path.
