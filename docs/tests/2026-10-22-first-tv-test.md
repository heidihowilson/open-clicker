# First successful TV test — October 22, 2026

Status: owner-reported success for pairing and all control buttons in the portable prototype. The owner confirmed the target was the bedroom TCL BeyondTV4.

## Configuration and evidence

- Tester: project owner, reporting in the project conversation.
- Controller: Waveshare ESP32-C6-DEV-KIT-N8-M, portable firmware v0.2, ESP-IDF v6.1.
- Control path: phone browser → C6 Wi-Fi access point → BLE HID target.
- Target: bedroom TCL, product `G03_4K_US_NF`, device `BeyondTV4`.
- Previously supplied inventory: Google TV on Android 11 (API 30), build `RP1A.200622.001`, version `AR21`, product information `V8-R51MT05-LF1V812.021144`. These version details were not re-read during the test.
- App context, power source and pairing-code interaction: not specified in the report.
- Owner first reported: “That. Worked. Perfectly!!!!”
- Asked whether this included TV pairing/control and whether Back, Home and Play/Pause worked, owner confirmed: “yes. every button worked perfectly.”

## Coverage

Pairing and the exposed control buttons passed according to the owner. These include directions, OK, Back, Home and Play/Pause, with Escape, Space, volume up/down and Mute available in the alternatives section. The report is an overall confirmation, not a separately logged trial for each usage or application.

No failed button was reported. Attempt counts, measured latency and per-app behavior were not recorded. A/B physical keys, held-key repeat, reconnect after power cycles, standby wake, long idle, battery life and other targets remain untested or unreported.

## Next steps

Preserve the working HID mappings while adding physical buttons. Test reconnect and standby separately before making reliability or battery-life claims.
