"""Autoroute a generated Open Clicker board and write the files a fab needs.

Usage: python3 route.py <board.kicad_pcb> <gerber-dir> <freerouting-binary> <timeout-seconds>

Exports Specctra DSN from KiCad, routes it with Freerouting, adds the routes back to the
board (ses_import.py, because KiCad 7 can only import a session in its GUI), runs DRC,
then plots Gerbers and the drill file. Prints one JSON report on stdout."""
import json, re, subprocess, sys, time
import pcbnew
from ses_import import import_ses

pcb, gerbers, router, limit = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
board = pcbnew.LoadBoard(pcb)
dsn, ses = pcb + ".dsn", pcb + ".ses"
if not pcbnew.ExportSpecctraDSN(board, dsn):
    sys.exit("Could not export the board for the router.")

started = time.time()
run = subprocess.run([router, "--gui.enabled=false", "-de", dsn, "-do", ses, "-mp", "20", "-mt", "2"],
                     capture_output=True, text=True, timeout=limit)
if run.returncode != 0:
    sys.exit("The router stopped with an error.")
seconds = round(time.time() - started, 1)
tracks = import_ses(board, ses)
board.Save(pcb)

report = pcb + ".drc"
pcbnew.WriteDRCReport(board, report, pcbnew.EDA_UNITS_MILLIMETRES, True)
kinds = {}
for kind in re.findall(r"^\[(\w+)\]", open(report).read(), re.M):
    kinds[kind] = kinds.get(kind, 0) + 1
kinds.pop("lib_footprint_issues", None)  # footprints are drawn inline, not from a library

layers = "F.Cu,B.Cu,F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts"
subprocess.run(["kicad-cli", "pcb", "export", "gerbers", "--layers", layers, "-o", gerbers + "/", pcb], check=True, capture_output=True)
subprocess.run(["kicad-cli", "pcb", "export", "drill", "--format", "excellon", "--excellon-separate-th", "-o", gerbers + "/", pcb], check=True, capture_output=True)

print(json.dumps({"seconds": seconds, "segments": tracks, "unrouted": kinds.pop("unconnected_items", 0), "problems": kinds}))
