# Footprints

Every footprint on an Open Clicker board comes from a published library; none is drawn by hand.

- KiCad's official libraries (shipped in the `kicad/kicad:9.0-full` image): `Diode_SMD:D_SOD-123`,
  `Resistor_SMD:R_0805_2012Metric`, `Capacitor_SMD:C_0805_2012Metric`, `Package_TO_SOT_SMD:SOT-23`,
  `Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical`, `LED_THT:LED_D3.0mm`,
  `OptoDevice:Vishay_MOLD-3Pin`, `Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical`.
- `OpenClicker.pretty/` holds the two that KiCad does not ship, copied unchanged:
  - `XIAO-ESP32-C6-DIP.kicad_mod` from Seeed Studio's
    [OPL KiCad library](https://github.com/Seeed-Studio/OPL_Kicad_Library) (CC BY-SA 4.0). All XIAO
    boards share this 14-pin footprint.
  - `SW_Hotswap_Kailh_Choc_V1.kicad_mod` from [kiswitch](https://github.com/kiswitch/kiswitch)
    (MIT or CC BY-SA 4.0), the library most keyboard projects use.

Copied 2026-10-28. To update one, copy the new file over the old and run `router/test.sh`.
