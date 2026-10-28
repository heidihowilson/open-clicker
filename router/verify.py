"""Read the Gerbers back with a second, independent tool (gerbonara) and compare them to the board.

Usage: python3 verify.py <board.kicad_pcb> <gerber-dir> <preview-dir>

KiCad wrote the Gerbers; gerbonara is a separate parser. If both agree on the board outline,
the hole count and the copper layers, the fab will see the board KiCad drew. Also renders
top and bottom previews of exactly what the fab receives. Prints one JSON report."""
import json, sys
from pathlib import Path
import pcbnew
from gerbonara import LayerStack

pcb, gdir, pdir = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
board = pcbnew.LoadBoard(pcb)
problems = []

box = board.GetBoardEdgesBoundingBox()
want_w, want_h = pcbnew.ToMM(box.GetWidth()), pcbnew.ToMM(box.GetHeight())
holes = sum(1 for fp in board.GetFootprints() for p in fp.Pads() if p.HasHole())
holes += sum(1 for t in board.GetTracks() if t.GetClass() == "PCB_VIA")

stack = LayerStack.open(gdir)
outline = stack.outline
if outline is None:
    problems.append("No board outline in the Gerbers.")
else:
    (x0, y0), (x1, y1) = outline.bounding_box(unit="mm") if hasattr(outline, "bounding_box") else outline.bounding_box()
    w, h = x1 - x0, y1 - y0
    if abs(w - want_w) > 0.2 or abs(h - want_h) > 0.2:
        problems.append(f"Outline is {w:.2f} × {h:.2f} mm in the Gerbers, {want_w:.2f} × {want_h:.2f} mm on the board.")

drilled = sum(len(list(layer.objects)) for layer in stack.drill_layers)
if drilled != holes:
    problems.append(f"The drill files have {drilled} holes; the board has {holes}.")

for side in ("top", "bottom"):
    copper = stack[(side, "copper")]
    if copper is None or not list(copper.objects):
        problems.append(f"The {side} copper layer is empty.")

pdir.mkdir(parents=True, exist_ok=True)
for side in ("top", "bottom"):
    (pdir / f"preview-{side}.svg").write_text(str(stack.to_pretty_svg(side=side)))

print(json.dumps({"outline_mm": [round(want_w, 2), round(want_h, 2)], "holes": holes, "drilled": drilled, "problems": problems}))
