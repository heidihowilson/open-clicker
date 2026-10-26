"""Add the wires and vias from a Specctra session (.ses) to a KiCad board, without the GUI."""
import re
import pcbnew


def parse(text):
    tokens = re.findall(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()]+', text)
    stack, cur = [], []
    for t in tokens:
        if t == "(":
            stack.append(cur); cur = []
        elif t == ")":
            done, cur = cur, stack.pop(); cur.append(done)
        else:
            cur.append(t[1:-1] if t.startswith('"') else t)
    return cur[0]


def find(node, name):
    return [c for c in node if isinstance(c, list) and c and c[0] == name]


def import_ses(board, path):
    root = parse(open(path).read())
    routes = find(root, "routes")[0]
    unit, per = find(routes, "resolution")[0][1:3]
    scale = {"um": 1000, "mm": 1_000_000, "mil": 25400}[unit] / int(per)  # nm per session unit
    pos = lambda x, y: pcbnew.VECTOR2I(int(round(float(x) * scale)), int(round(-float(y) * scale)))
    layers = {board.GetLayerName(l): l for l in range(pcbnew.PCB_LAYER_ID_COUNT)}
    stacks = {}
    for ps in find(find(routes, "library_out")[0], "padstack") if find(routes, "library_out") else []:
        m = re.search(r"_(\d+):(\d+)_um", ps[1])
        if m: stacks[ps[1]] = (int(m.group(1)) * 1000, int(m.group(2)) * 1000)
    added = 0
    for net in find(find(routes, "network_out")[0], "net"):
        code = board.FindNet(net[1])
        for wire in find(net, "wire"):
            p = find(wire, "path")[0]
            layer, width, pts = layers[p[1]], int(round(float(p[2]) * scale)), p[3:]
            pts = [pos(pts[i], pts[i + 1]) for i in range(0, len(pts) - 1, 2)]
            for a, b in zip(pts, pts[1:]):
                t = pcbnew.PCB_TRACK(board); t.SetStart(a); t.SetEnd(b); t.SetWidth(width); t.SetLayer(layer); t.SetNet(code)
                board.Add(t); added += 1
        for via in find(net, "via"):
            size, drill = stacks.get(via[1], (600_000, 300_000))
            v = pcbnew.PCB_VIA(board); v.SetPosition(pos(via[2], via[3])); v.SetWidth(size); v.SetDrill(drill)
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu); v.SetNet(code)
            board.Add(v); added += 1
    return added
