# Footprints

Every footprint on an Open Clicker board comes from a published library; none is drawn by hand.

- KiCad's official libraries (shipped in the `kicad/kicad:9.0-full` image): `Diode_SMD:D_SOD-123`,
  `Resistor_SMD:R_0805_2012Metric`, `Capacitor_SMD:C_0805_2012Metric`, `LED_SMD:LED_0805_2012Metric`,
  `Package_TO_SOT_SMD:SOT-23`, `Package_TO_SOT_SMD:SOT-23-5`,
  `Connector_JST:JST_PH_S2B-PH-SM4-TB_1x02-1MP_P2.00mm_Horizontal`,
  `Connector:Tag-Connect_TC2030-IDC-NL_2x03_P1.27mm_Vertical`, `Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12`, `LED_THT:LED_D3.0mm`,
  `OptoDevice:Vishay_MOLD-3Pin`.
- `OpenClicker.pretty/` holds the ones KiCad does not ship:
  - `SW_Hotswap_Kailh_Choc_V1.kicad_mod` from [kiswitch](https://github.com/kiswitch/kiswitch)
    (MIT or CC BY-SA 4.0), the library most keyboard projects use. Copied unchanged 2026-10-28.
  - `u-blox_BMD-340.kicad_mod` from the LCSC/EasyEDA library entry for JLCPCB part C5456944,
    fetched with `easyeda2kicad` on 2026-10-29. Only the name and the 3D-model link were
    changed. Its pads were checked against the u-blox data sheet; see `docs/hardware-models.md`.

To update one, copy the new file over the old and run `router/test.sh`.
