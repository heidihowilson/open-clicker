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
# Design rules inside JLCPCB's standard 2-layer process (0.127 mm track and space, 0.3 mm via
# drill), with margin: 0.2 mm tracks, 0.15 mm clearance, 0.5/0.3 mm vias. The module's
# 0.5 mm pads sit 0.55 mm apart on its inner rows; KiCad's defaults leave no way between them.
nc = board.GetDesignSettings().m_NetSettings.GetDefaultNetclass()
nc.SetTrackWidth(mm(0.2)); nc.SetClearance(mm(0.15)); nc.SetViaDiameter(mm(0.5)); nc.SetViaDrill(mm(0.3))
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

    if part["align"] == "pads":
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

# A 0.5 mm band inside the edge with no tracks or vias: KiCad's copper-to-edge clearance. The
# router keeps its own 0.15 mm clearance to the outline, which is not enough on its own.
EDGE = 0.5
band = pcbnew.ZONE(board)
band.SetIsRuleArea(True)
band.SetDoNotAllowTracks(True); band.SetDoNotAllowVias(True); band.SetDoNotAllowCopperPour(True)
band.SetDoNotAllowPads(False); band.SetDoNotAllowFootprints(False)
band.SetLayerSet(pcbnew.LSET.AllCuMask())
band.SetZoneName("Board edge")
ring = band.Outline()
ring.NewOutline()
for x, y in ((o["minX"] - 1, o["minY"] - 1), (o["maxX"] + 1, o["minY"] - 1), (o["maxX"] + 1, o["maxY"] + 1), (o["minX"] - 1, o["maxY"] + 1)):
    ring.Append(mm(x), mm(y))
ring.NewHole()
ri = r - EDGE
for cx, cy, a0 in ((o["maxX"] - r, o["minY"] + r, 270), (o["maxX"] - r, o["maxY"] - r, 0), (o["minX"] + r, o["maxY"] - r, 90), (o["minX"] + r, o["minY"] + r, 180)):
    for i in range(9):
        a = math.radians(a0 + i * 90 / 8)
        ring.Append(mm(cx + ri * math.cos(a)), mm(cy + ri * math.sin(a)), -1, 0)
board.Add(band)

# Rule areas: no tracks, vias or copper fill, on both copper layers (the module antenna).
for k in spec.get("keepouts", []):
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    z.SetDoNotAllowTracks(True); z.SetDoNotAllowVias(True); z.SetDoNotAllowCopperPour(True)
    z.SetDoNotAllowPads(False); z.SetDoNotAllowFootprints(False)
    z.SetLayerSet(pcbnew.LSET.AllCuMask())
    z.SetZoneName(k["why"])
    poly = z.Outline(); poly.NewOutline()
    for x, y in ((k["minX"], k["minY"]), (k["maxX"], k["minY"]), (k["maxX"], k["maxY"]), (k["minX"], k["maxY"])):
        poly.Append(mm(x), mm(y))
    board.Add(z)

board.Save(out)
print(json.dumps({"footprints": len(spec["parts"]), "nets": len(nets)}))
