# Software plan

The firmware sends keys today. This plan covers what makes it a battery remote that you pick up and use with several devices. Owner decisions are recorded in [decisions](decisions.md): battery power is required, and all three reference targets must work.

## Profiles

The remote holds **four profiles**. Each profile is one paired device. It connects to one profile at a time.

- **Select:** hold Home and press an arrow. Up is profile 1, Right is 2, Down is 3, Left is 4.
- **Pair or re-pair:** hold Home and an arrow for 3 seconds. That profile forgets its old device and advertises for a new one.
- **Contents:** the bond, a device type (TCL/Android TV or Apple TV), the key-code map for that type, and the A/B assignments.
- **Identity:** each profile uses its own static random Bluetooth address. When it reconnects, it advertises only to its own bonded device. A nearby TV on another profile must not take the connection.

The firmware already allows 15 bonds (`CONFIG_BT_SMP_MAX_BONDS`, up to 32). Four is a limit of the key controls, not of storage.

Home is also a normal key, so it must send nothing until it is released without an arrow. Measure whether that delay on Home is acceptable.

## Reconnect

On a key press with no connection, advertise to the current profile's device and send the key after it reconnects. Discard the key if no reconnect occurs within a set time, so the TV never receives an old command late. Measure the reconnect time for each target; it decides how the first press feels.

## Sleep and wake

Sleep after a period without key presses, with the switch GPIOs set to wake the chip. On wake, read the key that caused it, reconnect, and send it. Measure current in each state before any battery-life claim. The development board's USB parts and LEDs draw current that a production board will not.

## Pairing without a screen

The passkey path through the phone page does not exist on a finished remote. Profile pairing (above) uses "Just Works" or a confirmation the TV shows. Test which method each target accepts. Record the security trade-off; do not weaken it silently.

## Settings and updates

The phone Wi-Fi page is a bench tool, and Wi-Fi costs too much power for normal use. Candidates for remapping and firmware updates: a Bluetooth settings service used from a browser, or USB serial. Decide after profiles and sleep work.

## Order of work

1. Profiles with separate identities, and pairing by key combination.
2. Reconnect on key press, with the stale-key guard.
3. Sleep and wake on key, with current measurements.
4. Per-target key maps, tested on the bedroom TCL, the living-room QM6K and both Apple TVs.
5. Settings and update path.
