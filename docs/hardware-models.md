# Part models

Accurate footprints and 3D models for fit checks and for showing the assembled remote on the website. Each entry says where the model came from and how it was checked.

## Summary

Status: ✅ checked against the maker's drawing, 🔎 plausible but not yet checked against a drawing or calipers, ❌ no usable model yet.

| Part | Exact part (JLCPCB) | Web model | Model size (mm) | Source | Status |
| --- | --- | --- | --- | --- | --- |
| u-blox BMD-340 | C5456944 | `bmd-340.glb` | 15.0 × 10.2 × 1.92 | EasyEDA, fixed (see below) | ✅ |
| Kailh Choc V1 switch | — | `kailh-choc-v1.glb` | 15.0 × 15.0 × 11.0 (incl. pins) | KiSwitch | 🔎 measure tonight |
| Kailh Choc V1 hot-swap socket | C5333465 | `kailh-choc-hotswap.glb` | 13.15 × 6.85 × 3.05 | KiSwitch | 🔎 height looks tall; measure |
| USB-C receptacle TYPE-C-31-M-12 | C165948 | `usb-c-type-c-31-m-12.glb` | 8.94 × 7.9 × 4.1 | EasyEDA | 🔎 width matches the USB-C standard (8.94) |
| JST PH 2-pin SMD, right angle | C54582899 | `jst-ph-2p-smd.glb` | 7.9 × 8.6 × 5.5 | EasyEDA | 🔎 |
| 1N4148W diode | C81598 (base part) | `diode-1n4148w-sod123.glb` | 3.8 × 1.6 × 1.1 | EasyEDA (drawn as SOD-123F) | 🔎 |
| IR LED 940 nm, 3 mm | C98863 | `ir-led-ir204.glb` | 3.59 × 3.89 × 9.0 (incl. leads) | EasyEDA | 🔎 lens drawn red; the real lens is clear |
| MMBT2222A | C8512 (base part) | `mmbt2222a-sot23.glb` | 2.51 × 2.9 × 1.05 | EasyEDA | 🔎 standard SOT-23 |
| 0805 resistor | C17408 (base part) | `resistor-0805.glb` | 2.0 × 1.3 × 0.61 | EasyEDA | 🔎 standard 0805 |
| MBK keycap 1u | — | — | — | — | ❌ the only public model is CC BY-NC; we build our own from caliper measurements |
| LiPo cell | not chosen | — | — | — | ❌ draw it from the chosen cell's datasheet |
| USB charger, regulator | not chosen | — | — | — | ❌ pick in the board redesign |

All web models are in `designer/public/models/`. They are Y-up, in millimetres, centred in plan, and rest on the board (y = 0). They were converted from each source's VRML with three.js (VRMLLoader to GLTFExporter).

**Licences.** KiSwitch models are MIT / CC-BY-SA-4.0 (github.com/kiswitch/kiswitch); credit KiSwitch when they are shown. The EasyEDA/LCSC models are offered for use with the parts they describe. The MBK keycap model on Thingiverse (darryldh, CC BY-NC 4.0) must **not** be used: we plan to sell Kits.

**Cosmetic leftovers.** The USB-C, JST and IR LED models show a small EasyEDA logo, and the IR LED is drawn red. Clean these up before the website shows them.

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
