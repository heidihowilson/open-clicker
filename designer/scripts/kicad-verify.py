#!/usr/bin/env python3
# Usage: bun scripts/kicad-check.ts /tmp/kicad-out && python3 scripts/kicad-verify.py /tmp/kicad-out
# Needs KiCad 7 or later (kicad-cli and the pcbnew Python module).
"""Check a generated KiCad project: KiCad's netlist from the schematic must match the board's
pad nets, and DRC must show no shorts, clearance faults or overlaps."""
import re, subprocess, sys, glob, os
import pcbnew

def sexp_nets(path):
    text = open(path).read()
    nets = {}
    for m in re.finditer(r'\(net \(code "?\d+"?\) \(name "([^"]*)"\)(.*?)\)\s*(?=\(net |\)\s*\)\s*$)', text, re.S):
        name = m.group(1)
        for ref, pin in re.findall(r'\(node \(ref "([^"]+)"\) \(pin "([^"]+)"\)', m.group(2)):
            nets[(ref, pin)] = name.lstrip("/")
    return nets

bad = 0
for d in sorted(glob.glob(sys.argv[1] + "/*/")):
    name = os.path.basename(d.rstrip("/"))
    sch, pcbf = f"{d}{name}.kicad_sch", f"{d}{name}.kicad_pcb"
    subprocess.run(["kicad-cli", "sch", "export", "netlist", "-o", "/tmp/kicad-verify-n.net", sch], check=True, capture_output=True)
    sch_nets = {k: v for k, v in sexp_nets("/tmp/kicad-verify-n.net").items() if not v.startswith("unconnected-")}
    board = pcbnew.LoadBoard(pcbf)
    pcb_nets = {}
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNumber() and pad.GetNetname():
                pcb_nets[(fp.GetReference(), pad.GetNumber())] = pad.GetNetname()
    diff = set(sch_nets.items()) ^ set(pcb_nets.items())
    pcbnew.WriteDRCReport(board, "/tmp/kicad-verify-drc.rpt", pcbnew.EDA_UNITS_MILLIMETRES, True)
    rpt = open("/tmp/kicad-verify-drc.rpt").read()
    kinds = {}
    for k in re.findall(r"^\[(\w+)\]", rpt, re.M):
        kinds[k] = kinds.get(k, 0) + 1
    serious = {k: v for k, v in kinds.items() if k in ("shorting_items", "clearance", "hole_clearance", "courtyards_overlap", "copper_edge_clearance", "holes_co_located", "hole_to_hole", "malformed_courtyard", "invalid_outline")}
    print(f"{name}: {len(sch_nets)} pins in schematic, {len(pcb_nets)} pads on board, {len(diff)} mismatches; DRC {kinds}")
    if diff:
        for x in sorted(diff)[:10]: print("   ", x)
    if diff or serious: bad += 1
sys.exit(1 if bad else 0)
