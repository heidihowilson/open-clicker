import * as THREE from "three";
import { KEYCAPS, type Design, type Key } from "./design";
import { boardBounds, xiaoPlacement, type Bounds } from "./geometry";
import { CHOC, DIODE, IR, MBK, PCB, SHELL, XIAO_BOARD } from "./parts-data";
import { CHIPS } from "./chips";
import type { Action } from "./design";

/* World axes: X = design x, Z = design y (toward the bottom of the remote), Y = up.
 * The PCB top surface is Y = 0. */

/* Keycap colours for the solid view, grouped by job. */
const ACTION_TINT: Record<Action, string> = {
  up: "#ece6d6", down: "#ece6d6", left: "#ece6d6", right: "#ece6d6", ok: "#f6f3ec",
  back: "#a8b0b5", home: "#a8b0b5", escape: "#a8b0b5", play: "#e58a3c", space: "#e58a3c",
  volume_up: "#e58a3c", volume_down: "#e58a3c", mute: "#e58a3c", ir_power: "#d4483b", none: "#5d6560",
};

export type Role = "fr4" | "copper" | "plastic-dark" | "plastic-light" | "metal" | "chip" | "cap" | "battery" | "shell" | "led" | "wire";
export interface PartInfo { layer: number; label: string; detail: string }

function mesh(geometry: THREE.BufferGeometry, role: Role): THREE.Mesh {
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  m.userData.role = role;
  return m;
}
function box(w: number, h: number, d: number, role: Role, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = mesh(new THREE.BoxGeometry(w, h, d), role);
  m.position.set(x, y, z);
  return m;
}
function cylinder(diameter: number, length: number, role: Role, segments = 20): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, length, segments), role);
}
function part(info: PartInfo): THREE.Group {
  const g = new THREE.Group();
  g.userData.part = info;
  return g;
}

/* A shape drawn in design x/y, extruded and laid flat so it spans Y = bottom .. bottom + height. */
function slab(shape: THREE.Shape, bottom: number, height: number, role: Role, bevel = 0): THREE.Mesh {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10,
  });
  geometry.rotateX(Math.PI / 2);
  const m = mesh(geometry, role);
  m.position.y = bottom + height - bevel;
  return m;
}

export function roundedRect(x0: number, y0: number, x1: number, y1: number, radius: number): THREE.Shape {
  const r = Math.max(0.01, Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2));
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
const outline = (b: Bounds, grow: number, radius: number) => roundedRect(b.minX - grow, b.minY - grow, b.maxX + grow, b.maxY + grow, radius + grow);

function local(key: Key, x: number, y: number): { x: number; y: number } {
  const a = (key.r * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: key.x + x * c - y * s, y: key.y + x * s + y * c };
}
function circleHole(x: number, y: number, d: number): THREE.Path {
  const p = new THREE.Path(); p.absarc(x, y, d / 2, 0, Math.PI * 2, true); return p;
}
function rotatedRectHole(key: Key, w: number, d: number): THREE.Path {
  const pts = [[-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2]].map(([x, y]) => local(key, x!, y!));
  const p = new THREE.Path();
  p.moveTo(pts[0]!.x, pts[0]!.y);
  for (const q of pts.slice(1)) p.lineTo(q.x, q.y);
  p.closePath();
  return p;
}
function placeOnKey(object: THREE.Object3D, key: Key) {
  object.position.x = key.x; object.position.z = key.y;
  object.rotation.y = (-key.r * Math.PI) / 180;
}

/* XIAO footprint coordinates -> design coordinates. The module hangs under the board,
 * components down, long axis along design y with USB-C toward the bottom edge. */
function xiaoToDesign(at: { x: number; y: number }, fx: number, fy: number) {
  return { x: at.x + fy, y: at.y + fx };
}

export function buildPcb(design: Design, bounds: Bounds): THREE.Group {
  const g = part({ layer: 3, label: "PCB", detail: `FR-4 ${PCB.thickness} mm · ${(bounds.maxX - bounds.minX).toFixed(1)} × ${(bounds.maxY - bounds.minY).toFixed(1)}` });
  const shape = outline(bounds, 0, PCB.cornerRadius);
  for (const key of design.keys) {
    const c = local(key, 0, 0);
    shape.holes.push(circleHole(c.x, c.y, CHOC.centerPost.diameter));
    for (const sx of [-1, 1]) { const p = local(key, sx * CHOC.sidePosts.x, 0); shape.holes.push(circleHole(p.x, p.y, CHOC.sidePosts.diameter)); }
    for (const pin of CHOC.pins) { const p = local(key, pin.x, pin.y); shape.holes.push(circleHole(p.x, p.y, CHOC.pinDrill)); }
  }
  g.add(slab(shape, -PCB.thickness, PCB.thickness, "fr4"));
  /* Copper rings around the switch pins, both faces. */
  for (const key of design.keys) for (const pin of CHOC.pins) {
    const p = local(key, pin.x, pin.y);
    for (const y of [0.02, -PCB.thickness - 0.02]) {
      const ring = mesh(new THREE.RingGeometry(CHOC.pinDrill / 2, 1.016, 20), "copper");
      ring.rotation.x = y > 0 ? -Math.PI / 2 : Math.PI / 2;
      ring.position.set(p.x, y, p.y);
      g.add(ring);
    }
  }
  return g;
}

export function buildSwitch(key: Key): THREE.Group {
  const g = new THREE.Group();
  g.add(box(CHOC.base.size, CHOC.base.height, CHOC.base.size, "plastic-dark", 0, CHOC.base.height / 2, 0));
  const topY = CHOC.base.height + CHOC.top.height / 2;
  g.add(box(CHOC.top.size, CHOC.top.height, CHOC.top.size, "plastic-dark", 0, topY, 0));
  for (const sx of [-1, 1]) g.add(box(CHOC.stem.width, CHOC.stem.height, CHOC.stem.depth, "plastic-light", (sx * CHOC.stem.spacing) / 2, CHOC.base.height + CHOC.top.height + CHOC.stem.height / 2, 0));
  const post = cylinder(CHOC.centerPost.diameter - 0.2, CHOC.centerPost.length, "plastic-dark");
  post.position.y = -CHOC.centerPost.length / 2; g.add(post);
  for (const sx of [-1, 1]) { const s = cylinder(CHOC.sidePosts.diameter - 0.2, CHOC.sidePosts.length, "plastic-dark", 12); s.position.set(sx * CHOC.sidePosts.x, -CHOC.sidePosts.length / 2, 0); g.add(s); }
  for (const pin of CHOC.pins) { const m = box(0.6, CHOC.pinLength, 0.25, "metal", pin.x, -CHOC.pinLength / 2, pin.y); g.add(m); }
  placeOnKey(g, key);
  return g;
}

function legendTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = "#ffffff"; g.font = "600 92px ui-monospace, 'JetBrains Mono', Menlo, monospace";
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildKeycap(design: Design, key: Key): THREE.Group {
  const cap = KEYCAPS[design.keycap];
  const g = new THREE.Group();
  /* The bevel grows the outline, so draw the shape inset by the bevel size. */
  const b = 0.45;
  const shape = roundedRect(-cap.widthMm / 2 + b, -cap.depthMm / 2 + b, cap.widthMm / 2 - b, cap.depthMm / 2 - b, MBK.radius - b);
  const body = slab(shape, 0, cap.heightMm, "cap", b);
  body.userData.tint = ACTION_TINT[key.action];
  g.add(body);
  /* Two stem sockets under the cap. */
  for (const sx of [-1, 1]) g.add(box(CHOC.stem.width + 1.2, 1.2, CHOC.stem.depth + 1.2, "cap", (sx * CHOC.stem.spacing) / 2, -0.6, 0));
  const legend = new THREE.Mesh(new THREE.PlaneGeometry(cap.widthMm * 0.8, cap.widthMm * 0.8),
    new THREE.MeshBasicMaterial({ map: legendTexture(key.label || key.action.slice(0, 3).toUpperCase()), transparent: true, depthWrite: false }));
  legend.rotation.x = -Math.PI / 2; legend.position.y = cap.heightMm + 0.02;
  legend.userData.legend = true;
  g.add(legend);
  g.position.y = MBK.seat;
  const holder = new THREE.Group(); holder.add(g);
  placeOnKey(holder, key);
  return holder;
}

export function buildXiao(design: Design, bounds: Bounds): THREE.Group {
  const chip = CHIPS[design.chip];
  const at = xiaoPlacement(bounds);
  const X = XIAO_BOARD;
  const g = part({ layer: 1.4, label: chip.label, detail: "21 × 17.8 mm · castellated, under the PCB" });
  const top = -PCB.thickness - 0.05; /* XIAO pad side against the main board */
  const c0 = xiaoToDesign(at, X.minX, -X.halfWidth), c1 = xiaoToDesign(at, X.maxX, X.halfWidth);
  const shape = roundedRect(Math.min(c0.x, c1.x), Math.min(c0.y, c1.y), Math.max(c0.x, c1.x), Math.max(c0.y, c1.y), 1);
  for (const fy of [-X.padRow, X.padRow]) for (let i = -3; i <= 3; i++) {
    const p = xiaoToDesign(at, i * X.padPitch, fy);
    shape.holes.push(circleHole(p.x, p.y, X.padDrill));
  }
  g.add(slab(shape, top - X.thickness, X.thickness, "fr4"));
  for (const fy of [-X.padRow, X.padRow]) for (let i = -3; i <= 3; i++) {
    const p = xiaoToDesign(at, i * X.padPitch, fy);
    const ring = mesh(new THREE.RingGeometry(X.padDrill / 2, X.padDiameter / 2, 20), "copper");
    ring.rotation.x = Math.PI / 2; ring.position.set(p.x, top - X.thickness - 0.02, p.y);
    g.add(ring);
  }
  const under = top - X.thickness;
  const usbAt = xiaoToDesign(at, X.maxX - X.usb.depth / 2 + X.usb.overhang, 0);
  g.add(box(X.usb.width, X.usb.height, X.usb.depth, "metal", usbAt.x, under - X.usb.height / 2, usbAt.y));
  const chipAt = xiaoToDesign(at, X.chip.x, X.chip.y);
  g.add(box(X.chip.size, X.chip.height, X.chip.size, "chip", chipAt.x, under - X.chip.height / 2, chipAt.y));
  const antAt = xiaoToDesign(at, X.antenna.x, X.antenna.y);
  g.add(box(X.antenna.depth, X.antenna.height, X.antenna.width, "plastic-light", antAt.x, under - X.antenna.height / 2, antAt.y));
  for (const b of X.buttons) { const p = xiaoToDesign(at, b.x, b.y); g.add(box(2.6, 1.0, 3.2, "metal", p.x, under - 0.5, p.y)); }
  return g;
}

export function buildDiodes(design: Design): THREE.Group {
  const g = part({ layer: 2, label: "Diodes", detail: `1N4148W SOD-123 × ${design.keys.length} · one per key` });
  for (const key of design.keys) {
    const d = new THREE.Group();
    d.add(box(DIODE.length, DIODE.height, DIODE.width, "chip", 0, -DIODE.height / 2, 0));
    d.add(box(0.4, 0.15, DIODE.width + 0.02, "plastic-light", -DIODE.length / 2 + 0.5, -DIODE.height - 0.01, 0));
    for (const sx of [-1, 1]) d.add(box(DIODE.lead, 0.2, 0.9, "metal", sx * (DIODE.length / 2 + DIODE.lead / 2), -0.1, 0));
    const p = local(key, DIODE.offset.x, DIODE.offset.y);
    d.position.set(p.x, -PCB.thickness, p.y); d.rotation.y = (-key.r * Math.PI) / 180;
    g.add(d);
  }
  return g;
}

export function buildBattery(design: Design, bounds: Bounds): THREE.Group {
  const b = design.battery;
  const g = part({ layer: 1, label: "LiPo cell", detail: `${b.capacityMah} mAh · ${b.lengthMm} × ${b.widthMm} × ${b.thicknessMm} mm` });
  const at = xiaoPlacement(bounds);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = at.y - 10.5 - 2 - b.lengthMm / 2;
  const top = -PCB.thickness - DIODE.height - 0.4;
  const body = roundedRect(cx - b.widthMm / 2 + 0.6, cy - b.lengthMm / 2 + 3.6, cx + b.widthMm / 2 - 0.6, cy + b.lengthMm / 2 - 0.6, 0.8);
  g.add(slab(body, top - b.thicknessMm, b.thicknessMm, "battery", 0.6));
  /* Sealed pouch edge with its protection board at the lead end. */
  g.add(box(b.widthMm - 2, 1.0, 3, "fr4", cx, top - b.thicknessMm / 2, cy - b.lengthMm / 2 + 1.5));
  for (const [i, role] of [[-1, "wire"], [1, "metal"]] as const) {
    const wire = cylinder(0.9, 8, role, 8);
    wire.rotation.x = Math.PI / 2; wire.position.set(cx + i * 2, top - b.thicknessMm / 2, cy - b.lengthMm / 2 - 4);
    g.add(wire);
  }
  return g;
}

export function buildIr(design: Design, bounds: Bounds): THREE.Group | null {
  if (!design.options.irTransmit && !design.options.irReceive) return null;
  const g = part({ layer: 4, label: "IR", detail: [design.options.irTransmit && "940 nm LED", design.options.irReceive && "38 kHz receiver"].filter(Boolean).join(" · ") });
  const cx = (bounds.minX + bounds.maxX) / 2, edge = bounds.minY;
  if (design.options.irTransmit) {
    const led = new THREE.Group();
    const body = cylinder(IR.ledDiameter, IR.ledLength - IR.ledDiameter / 2, "led");
    body.rotation.x = Math.PI / 2; body.position.z = -0.5; led.add(body);
    const dome = mesh(new THREE.SphereGeometry(IR.ledDiameter / 2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), "led");
    dome.rotation.x = -Math.PI / 2; dome.position.z = -(IR.ledLength - IR.ledDiameter / 2) / 2 - 0.5; led.add(dome);
    led.position.set(cx - (design.options.irReceive ? 5 : 0), 2, edge + 3);
    g.add(led);
  }
  if (design.options.irReceive) {
    const r = IR.receiver;
    g.add(box(r.width, r.height, r.depth, "plastic-dark", cx + (design.options.irTransmit ? 5 : 0), r.height / 2, edge + 2 + r.depth / 2));
  }
  return g;
}

export function buildShell(design: Design, bounds: Bounds): { bottom: THREE.Group; top: THREE.Group } {
  const cap = KEYCAPS[design.keycap];
  const depth = PCB.thickness + Math.max(1.2 + 4.5, DIODE.height + 0.4 + design.battery.thicknessMm) + 1;
  const bottom = part({ layer: 0, label: `Shell · ${design.shell.family}`, detail: `tray ${SHELL.wall} mm wall · ${(depth + SHELL.floor).toFixed(1)} mm deep` });
  const outer = outline(bounds, SHELL.wall + SHELL.clearance, PCB.cornerRadius);
  const wall = outline(bounds, SHELL.wall + SHELL.clearance, PCB.cornerRadius);
  wall.holes.push(outline(bounds, SHELL.clearance, PCB.cornerRadius));
  bottom.add(slab(outer, -depth - SHELL.floor, SHELL.floor, "shell"));
  bottom.add(slab(wall, -depth, depth - PCB.thickness, "shell"));

  const top = part({ layer: 5, label: "Top bezel", detail: `${SHELL.bezel} mm · ${design.keys.length} key openings` });
  const bezel = outline(bounds, SHELL.wall + SHELL.clearance, PCB.cornerRadius);
  for (const key of design.keys) bezel.holes.push(rotatedRectHole(key, cap.widthMm + 1, cap.depthMm + 1));
  const rim = outline(bounds, SHELL.wall + SHELL.clearance, PCB.cornerRadius);
  rim.holes.push(outline(bounds, SHELL.clearance, PCB.cornerRadius));
  top.add(slab(rim, -PCB.thickness, PCB.thickness + 3.6, "shell"));
  top.add(slab(bezel, 3.6, SHELL.bezel, "shell"));
  return { bottom, top };
}

export function buildAssembly(design: Design): THREE.Group {
  const bounds = boardBounds(design);
  const root = new THREE.Group();
  const shell = buildShell(design, bounds);
  const switches = part({ layer: 4, label: "Kailh Choc V1", detail: `× ${design.keys.length} · 15 × 15 mm` });
  const caps = part({ layer: 6, label: `Keycaps · ${design.keycap === "choc-mbk" ? "MBK" : "MCC"}`, detail: `${KEYCAPS[design.keycap].widthMm} × ${KEYCAPS[design.keycap].depthMm} mm × ${design.keys.length}` });
  for (const key of design.keys) { switches.add(buildSwitch(key)); caps.add(buildKeycap(design, key)); }
  const parts = [shell.bottom, buildBattery(design, bounds), buildXiao(design, bounds), buildDiodes(design), buildPcb(design, bounds), switches, buildIr(design, bounds), shell.top, caps];
  for (const p of parts) if (p) root.add(p);
  return root;
}
