"""Route a board and write the files a fab needs, using KiCad and Freerouting only.

Usage: python3 route.py <board.kicad_pcb> <gerber-dir> <freerouting-binary> <timeout-seconds>

1. KiCad exports the board as Specctra DSN.
2. Freerouting routes it.
3. KiCad imports the routes (ImportSpecctraSES) and saves the board.
4. kicad-cli runs the design-rule check, including parity with the schematic next to the board.
5. kicad-cli plots the Gerbers and the drill files.
Prints one JSON report on stdout."""
import json, os, subprocess, sys, time
import pcbnew

pcb, gerbers, router, limit = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
board = pcbnew.LoadBoard(pcb)
dsn, ses = pcb + ".dsn", pcb + ".ses"
if not pcbnew.ExportSpecctraDSN(board, dsn):
    sys.exit("KiCad could not export the board for the router.")

started = time.time()
# The optimizer only tidies finished routes; on grove's two cores it can take minutes, so it is off.
try:
    run = subprocess.run([router, "--gui.enabled=false", "--router.optimizer.enabled=false", "-de", dsn, "-do", ses, "-mp", "20"],
                         capture_output=True, text=True, timeout=limit)
except subprocess.TimeoutExpired:
    sys.exit("The router ran out of time on this board. Try fewer keys or a wider layout.")
if run.returncode != 0 or not os.path.exists(ses):
    sys.exit("The router stopped with an error.")
seconds = round(time.time() - started, 1)

if not pcbnew.ImportSpecctraSES(board, ses):
    sys.exit("KiCad could not import the routes.")

# Freerouting can leave a stub of track that leads nowhere. Remove dangling tracks, as KiCad's
# own "Clean up tracks" does, until none is left; the DRC below confirms the result.
removed = 0
while True:
    board.BuildConnectivity()
    conn = board.GetConnectivity()
    dangling = [t for t in board.GetTracks() if t.GetClass() == "PCB_TRACK" and conn.TestTrackEndpointDangling(t, False)]
    if not dangling:
        break
    for t in dangling:
        board.Remove(t)
    removed += len(dangling)
pcbnew.SaveBoard(pcb, board)

report = pcb + ".drc.json"
subprocess.run(["kicad-cli", "pcb", "drc", "--schematic-parity", "--severity-error", "--severity-warning", "--format", "json", "-o", report, pcb],
               check=True, capture_output=True)
drc = json.load(open(report))
def count(items):
    out = {}
    for v in items:
        out[v["type"]] = out.get(v["type"], 0) + 1
    return out
# Errors block the board. Silkscreen warnings do not change the copper (fabs clip silk off pads),
# so they are reported but do not block.
SILK = {"silk_over_copper", "silk_overlap", "silk_edge_clearance", "text_height", "text_thickness"}
violations = drc.get("violations", [])
problems = count(v for v in violations if v["type"] not in SILK)
silk = count(v for v in violations if v["type"] in SILK)
parity = count(drc.get("schematic_parity", []))
parity_detail = ["; ".join([v["description"]] + [i["description"] for i in v.get("items", [])]) for v in drc.get("schematic_parity", [])][:4]
unrouted = len(drc.get("unconnected_items", []))
# Footprints are loaded from libraries the board's own project does not list; that note is expected.
for noise in ("lib_footprint_issues", "lib_footprint_mismatch"):
    problems.pop(noise, None)

layers = "F.Cu,B.Cu,F.Paste,B.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts"
subprocess.run(["kicad-cli", "pcb", "export", "gerbers", "--layers", layers, "-o", gerbers + "/", pcb], check=True, capture_output=True)
subprocess.run(["kicad-cli", "pcb", "export", "drill", "--format", "excellon", "--excellon-separate-th", "-o", gerbers + "/", pcb], check=True, capture_output=True)

print(json.dumps({"seconds": seconds, "segments": len(board.GetTracks()), "stubs_removed": removed, "unrouted": unrouted, "problems": problems, "silk": silk, "parity": parity, "parity_detail": parity_detail}))
