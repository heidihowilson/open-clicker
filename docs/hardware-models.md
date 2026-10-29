# Part models

Accurate footprints and 3D models for fit checks and for showing the assembled remote on the website. Each entry says where the model came from and how it was checked.

## u-blox BMD-340 (nRF52840 module)

- **Files:**
  - `designer/public/models/bmd-340.glb` (web);
  - `router/footprints/OpenClicker.pretty/u-blox_BMD-340.kicad_mod` (KiCad).
- **Source:** the LCSC/EasyEDA library entry for JLCPCB part C5456944, fetched with `easyeda2kicad` on 2026-10-29.
- **Checked against** the u-blox data sheet, UBX-19033353 R13, §5 "Mechanical specifications":
  - Size: the model is 15.0 × 10.2 × 1.92 mm. The data sheet gives 15.0 × 10.2 × 1.9 mm (±0.3, ±0.3, ±0.1). The module board is 0.5 mm thick, as in the drawing.
  - Shape: the shield can covers all but the antenna end. The antenna end is bare board, as in Figure 11.
  - Footprint: 68 pads of 0.50 × 0.50 mm. The pad rows sit at the drawing's offsets (1.10, 1.65, 3.30, 3.50, 3.85, 4.30, 4.40 and 4.85 mm).
- **Fixes made:** the EasyEDA entry is really the **BMD-341** model, which has a U.FL antenna connector at the antenna end. The GLB removes:
  - the connector;
  - everything above the board in the antenna area;
  - the EasyEDA logo on the can.

  The footprint is renamed and its 3D-model link is dropped. The original STEP file still contains the connector, so it is not committed.
- **Still open:**
  - The PCB colour is EasyEDA's blue, not the real module colour.
  - The RF keep-out (no copper under the antenna end, 4.40 mm from the board edge, Figure 12) must be added to our board rules when the board is redesigned.
  - An official u-blox STEP file is listed on SnapMagic (account required). If we get it, compare it with this model.
