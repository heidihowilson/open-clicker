"""Build the KiCad board from a board spec (designer/src/lib/kicad.ts, boardSpec) with KiCad's own API.

Usage: python3 board.py <spec.json> <out.kicad_pcb> <project-footprint-dir>

Every footprint is loaded from a published library: KiCad's official libraries, or the two
vendored ones in footprints/OpenClicker.pretty. Nothing is drawn here except the board outline.
"""
import json, math, os, sys
import pcbnew

spec = json.load(open(sys.argv[1]))
out, own = sys.argv[2], sys.argv[3]
SYSTEM = os.environ.get("KICAD9_FOOTPRINT_DIR", "/usr/share/kicad/footprints")
mm = pcbnew.FromMM

board = pcbnew.BOARD()
board.GetTitleBlock().SetTitle(spec["name"])
board.GetTitleBlock().SetRevision(str(spec["revision"]))
board.GetTitleBlock().SetComment(0, f"Design {spec['id']}")

nets = {}
def net(name):
    # Local labels on the schematic's root sheet name their nets "/NAME".
    if name not in nets:
        n = pcbnew.NETINFO_ITEM(board, name if name.startswith("unconnected-") else f"/{name}")
        board.Add(n)
        nets[name] = n
    return nets[name]

def load(lib_id):
    lib, name = lib_id.split(":", 1)
    path = os.path.join(own, f"{lib}.pretty") if lib == "OpenClicker" else os.path.join(SYSTEM, f"{lib}.pretty")
    fp = pcbnew.FootprintLoad(path, name)
    if fp is None:
        sys.exit(f"Footprint {lib_id} not found in {path}")
    fp.SetFPID(pcbnew.LIB_ID(lib, name))
    return fp

def pad_box(fp):
    pads = [p for p in fp.Pads() if p.GetNumber()]
    xs = [pcbnew.ToMM(p.GetPosition().x) for p in pads] or [pcbnew.ToMM(fp.GetPosition().x)]
    ys = [pcbnew.ToMM(p.GetPosition().y) for p in pads] or [pcbnew.ToMM(fp.GetPosition().y)]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2

def pad_at(fp, number):
    # A castellated module has a hole and an edge pad per pin; the hole is the pin.
    pads = sorted((p for p in fp.Pads() if p.GetNumber() == number), key=lambda p: not p.HasHole())
    if not pads:
        raise KeyError(number)
    return pcbnew.ToMM(pads[0].GetPosition().x), pcbnew.ToMM(pads[0].GetPosition().y)

for part in spec["parts"]:
    fp = load(part["footprint"])
    fp.SetReference(part["ref"])
    fp.SetValue(part["value"])
    # No printed designators: on a board this dense they only land on pads.
    fp.Reference().SetVisible(False)
    fp.Value().SetVisible(False)
    fp.SetPath(pcbnew.KIID_PATH(f"/{part['symbol']}"))
    board.Add(fp)
    fp.SetPosition(pcbnew.VECTOR2I(mm(part["x"]), mm(part["y"])))
    if part["back"]:
        fp.Flip(fp.GetPosition(), pcbnew.FLIP_DIRECTION_LEFT_RIGHT)

    expect = part.get("expect")
    if expect:
        # Search KiCad's own rotations until the named pads land where the module really sits.
        best = None
        for angle in (0, 90, 180, 270):
            fp.SetOrientationDegrees(angle)
            fp.SetPosition(pcbnew.VECTOR2I(mm(part["x"]), mm(part["y"])))
            first = next(iter(expect))
            px, py = pad_at(fp, first)
            fp.Move(pcbnew.VECTOR2I(mm(expect[first][0] - px), mm(expect[first][1] - py)))
            err = max(math.dist(pad_at(fp, n), xy) for n, xy in expect.items())
            if best is None or err < best[0]:
                best = (err, angle, fp.GetPosition())
        fp.SetOrientationDegrees(best[1])
        fp.SetPosition(best[2])
        if best[0] > 0.01:
            sys.exit(f"{part['ref']}: no orientation puts its pads where the module sits (off by {best[0]:.3f} mm)")
    elif part["align"] == "pads":
        cx, cy = pad_box(fp)
        fp.Move(pcbnew.VECTOR2I(mm(part["x"] - cx), mm(part["y"] - cy)))

    named = {p.GetNumber() for p in fp.Pads() if p.GetNumber()}
    missing = set(part["pads"]) - named
    if missing:
        sys.exit(f"{part['ref']}: footprint {part['footprint']} has no pad {sorted(missing)}")
    for p in fp.Pads():
        if p.GetNumber() in part["pads"]:
            p.SetNet(net(part["pads"][p.GetNumber()]))

# Board outline: a rounded rectangle on Edge.Cuts.
o = spec["outline"]
r = o["radius"]
def seg(x1, y1, x2, y2):
    s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
    s.SetStart(pcbnew.VECTOR2I(mm(x1), mm(y1))); s.SetEnd(pcbnew.VECTOR2I(mm(x2), mm(y2)))
    s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); board.Add(s)
def arc(cx, cy, a0):
    s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_ARC)
    pt = lambda a: pcbnew.VECTOR2I(mm(cx + r * math.cos(math.radians(a))), mm(cy + r * math.sin(math.radians(a))))
    s.SetArcGeometry(pt(a0), pt(a0 + 45), pt(a0 + 90))
    s.SetLayer(pcbnew.Edge_Cuts); s.SetWidth(mm(0.1)); board.Add(s)
seg(o["minX"] + r, o["minY"], o["maxX"] - r, o["minY"]); arc(o["maxX"] - r, o["minY"] + r, 270)
seg(o["maxX"], o["minY"] + r, o["maxX"], o["maxY"] - r); arc(o["maxX"] - r, o["maxY"] - r, 0)
seg(o["maxX"] - r, o["maxY"], o["minX"] + r, o["maxY"]); arc(o["minX"] + r, o["maxY"] - r, 90)
seg(o["minX"], o["maxY"] - r, o["minX"], o["minY"] + r); arc(o["minX"] + r, o["minY"] + r, 180)

board.Save(out)
print(json.dumps({"footprints": len(spec["parts"]), "nets": len(nets)}))
