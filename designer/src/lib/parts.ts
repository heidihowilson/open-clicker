import * as THREE from "three";
import { capWidth, KEYCAPS, type Design, type Key } from "./design";
import { boardBounds, keyField, partSpots, SHELL_RULES, xiaoPlacement, type Bounds } from "./geometry";
import { CHOC, DIODE, IR, MBK, PCB, SHELL, XIAO_BOARD } from "./parts-data";
import { CHIPS } from "./chips";
import { capColour, glyphUrl, legendOf } from "./actions";
import { bom, usd, type BomId, type BomLine } from "./bom";

/* World axes: X = design x, Z = design y (toward the bottom of the remote), Y = up.
 * The PCB top surface is Y = 0. */

/* The one colourway (brand book, Hardware → Colourway): butter shell, plate and lid; ivory,
 * oxblood and orange caps by what the key does; oxblood lettering. */
export const BRAND = {
  butter: "#f3d77a", oxblood: "#692b38", orange: "#c65d2e", ivory: "#f7f1e5", capIvory: "#fdf8ee",
} as const;
const CAP_TINT = { ivory: BRAND.capIvory, oxblood: BRAND.oxblood, orange: BRAND.orange } as const;

export type Role = "fr4" | "copper" | "plastic-dark" | "plastic-light" | "metal" | "chip" | "cap" | "battery" | "shell" | "led" | "wire" | "slot";
export interface PartInfo { layer: number; label: string; detail: string }

/* Marks a purchasable unit: the explode and focus never split it further. */
function item<T extends THREE.Object3D>(object: T, id: BomId): T { object.userData.item = id; return object; }

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
  return { x: key.x + x, y: key.y + y };
}
function circleHole(x: number, y: number, d: number): THREE.Path {
  const p = new THREE.Path(); p.absarc(x, y, d / 2, 0, Math.PI * 2, true); return p;
}
function rectHole(key: Key, w: number, d: number, r = 0.6): THREE.Path {
  const p = new THREE.Path();
  p.setFromPoints(roundedRect(key.x - w / 2, key.y - d / 2, key.x + w / 2, key.y + d / 2, r).getPoints(4).reverse());
  return p;
}
function placeOnKey(object: THREE.Object3D, key: Key) {
  object.position.x = key.x; object.position.z = key.y;
}

/* XIAO footprint coordinates -> design coordinates. The module hangs under the board,
 * components down, long axis along design y with USB-C toward the bottom edge. */
function xiaoToDesign(at: { x: number; y: number }, fx: number, fy: number) {
  return { x: at.x + fy, y: at.y + fx };
}

export function buildPcb(design: Design, bounds: Bounds): THREE.Group {
  const g = new THREE.Group();
  const shape = outline(bounds, 0, PCB.cornerRadius);
  for (const key of design.keys) {
    const c = local(key, 0, 0);
    shape.holes.push(circleHole(c.x, c.y, CHOC.centerPost.diameter));
    for (const sx of [-1, 1]) { const p = local(key, sx * CHOC.sidePosts.x, 0); shape.holes.push(circleHole(p.x, p.y, CHOC.sidePosts.diameter)); }
    for (const pin of CHOC.pins) { const p = local(key, pin.x, pin.y); shape.holes.push(circleHole(p.x, p.y, CHOC.pinDrill)); }
  }
  item(g, "pcb");
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
  g.add(box(CHOC.bottom.size, CHOC.bottom.height, CHOC.bottom.size, "plastic-dark", 0, CHOC.bottom.height / 2, 0));
  const topY = CHOC.bottom.height + CHOC.top.height / 2;
  g.add(box(CHOC.top.size, CHOC.top.height, CHOC.top.size, "plastic-dark", 0, topY, 0));
  for (const sx of [-1, 1]) g.add(box(CHOC.stem.width, CHOC.stem.height, CHOC.stem.depth, "plastic-light", (sx * CHOC.stem.spacing) / 2, CHOC.bottom.height + CHOC.top.height + CHOC.stem.height / 2, 0));
  const post = cylinder(CHOC.centerPost.diameter - 0.2, CHOC.centerPost.length, "plastic-dark");
  post.position.y = -CHOC.centerPost.length / 2; g.add(post);
  for (const sx of [-1, 1]) { const s = cylinder(CHOC.sidePosts.diameter - 0.2, CHOC.sidePosts.length, "plastic-dark", 12); s.position.set(sx * CHOC.sidePosts.x, -CHOC.sidePosts.length / 2, 0); g.add(s); }
  for (const pin of CHOC.pins) { const m = box(0.6, CHOC.pinLength, 0.25, "metal", pin.x, -CHOC.pinLength / 2, pin.y); g.add(m); }
  placeOnKey(g, key);
  g.userData.keyId = key.id;
  return item(g, "switch");
}

/* Legend on the cap face: a glyph from the brand set, or Fredoka uppercase. Ink is oxblood on
 * ivory caps and ivory on oxblood and orange caps. */
function legendTexture(key: Key): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = 256 * key.w; c.height = 256;
  const g = c.getContext("2d")!;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const ink = capColour(key.action) === "ivory" ? "oxblood" : "ivory";
  const legend = legendOf(key.action, key.label);
  if (legend.glyph) {
    const img = new Image();
    img.onload = () => { g.drawImage(img, c.width / 2 - 52, 76, 104, 104); t.needsUpdate = true; };
    img.src = glyphUrl(legend.glyph, ink);
  } else if (legend.text) {
    g.fillStyle = ink === "oxblood" ? BRAND.oxblood : BRAND.ivory;
    g.font = `600 ${legend.text.length > 3 ? 54 : 70}px Fredoka, "Avenir Next Rounded", sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(legend.text, c.width / 2, 134);
  }
  return t;
}

export function buildKeycap(design: Design, key: Key): THREE.Group {
  const cap = KEYCAPS[design.keycap];
  const width = capWidth(key.w);
  const g = new THREE.Group();
  /* The bevel grows the outline, so draw the shape inset by the bevel size. */
  const b = 0.45;
  const shape = roundedRect(-width / 2 + b, -cap.depthMm / 2 + b, width / 2 - b, cap.depthMm / 2 - b, MBK.radius - b);
  const body = slab(shape, 0, cap.heightMm, "cap", b);
  body.userData.tint = CAP_TINT[capColour(key.action)];
  g.add(body);
  /* Two stem sockets under the cap. */
  for (const sx of [-1, 1]) g.add(box(CHOC.stem.width + 1.2, 1.2, CHOC.stem.depth + 1.2, "cap", (sx * CHOC.stem.spacing) / 2, -0.6, 0));
  const legend = new THREE.Mesh(new THREE.PlaneGeometry(cap.depthMm * 0.8 * key.w, cap.depthMm * 0.8),
    new THREE.MeshBasicMaterial({ map: legendTexture(key), transparent: true, depthWrite: false }));
  legend.rotation.x = -Math.PI / 2; legend.position.y = cap.heightMm + 0.02;
  legend.userData.legend = true;
  g.add(legend);
  g.position.y = MBK.seat;
  const holder = new THREE.Group(); holder.add(g);
  placeOnKey(holder, key);
  holder.userData.keyId = key.id;
  return item(holder, "keycap");
}

export function buildXiao(design: Design, bounds: Bounds): THREE.Group {
  const at = xiaoPlacement(bounds);
  const X = XIAO_BOARD;
  const g = new THREE.Group();
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
  return item(g, "controller");
}

export function buildDiodes(design: Design): THREE.Group {
  const g = new THREE.Group();
  for (const key of design.keys) {
    const d = new THREE.Group();
    d.add(box(DIODE.length, DIODE.height, DIODE.width, "chip", 0, -DIODE.height / 2, 0));
    d.add(box(0.4, 0.15, DIODE.width + 0.02, "plastic-light", -DIODE.length / 2 + 0.5, -DIODE.height - 0.01, 0));
    for (const sx of [-1, 1]) d.add(box(DIODE.lead, 0.2, 0.9, "metal", sx * (DIODE.length / 2 + DIODE.lead / 2), -0.1, 0));
    const p = local(key, DIODE.offset.x, DIODE.offset.y);
    d.position.set(p.x, -PCB.thickness, p.y);
    g.add(item(d, "diode"));
  }
  return g;
}

export function buildBattery(design: Design, bounds: Bounds): THREE.Group {
  const b = design.battery;
  const g = new THREE.Group();
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
  return item(g, "battery");
}

export function buildIr(design: Design, bounds: Bounds): THREE.Group | null {
  if (!design.options.irTransmit && !design.options.irReceive) return null;
  const g = new THREE.Group();
  const spots = partSpots(design, bounds);
  if (design.options.irTransmit) {
    const led = new THREE.Group();
    const body = cylinder(IR.ledDiameter, IR.ledLength - IR.ledDiameter / 2, "led");
    body.rotation.x = Math.PI / 2; body.position.z = -0.5; led.add(body);
    const dome = mesh(new THREE.SphereGeometry(IR.ledDiameter / 2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), "led");
    dome.rotation.x = -Math.PI / 2; dome.position.z = -(IR.ledLength - IR.ledDiameter / 2) / 2 - 0.5; led.add(dome);
    led.position.set(spots.LED1!.x, 2, spots.LED1!.y);
    g.add(item(led, "ir-led"));
    /* Driver transistor and its two resistors sit on the back, in the chin beside the XIAO. */
    const driver = box(1.3, 1.0, 2.9, "chip", spots.Q1!.x, -PCB.thickness - 0.5, spots.Q1!.y);
    g.add(item(driver, "ir-driver"));
    for (const ref of ["R1", "R2"]) g.add(item(smdResistor(spots[ref]!.x, spots[ref]!.y), "resistor"));
  }
  if (design.options.irReceive) {
    const r = IR.receiver;
    g.add(item(box(r.width, r.height, r.depth, "plastic-dark", spots.U2!.x, r.height / 2, spots.U2!.y), "ir-receiver"));
  }
  return g;
}

function smdResistor(x: number, z: number): THREE.Group {
  const r = new THREE.Group();
  r.add(box(1.4, 0.5, 1.25, "chip", 0, -0.25, 0));
  for (const sx of [-1, 1]) r.add(box(0.3, 0.52, 1.26, "metal", sx * 0.85, -0.25, 0));
  r.position.set(x, -PCB.thickness, z);
  return r;
}

/* Battery divider: two resistors beside the XIAO when the module has none built in. */
export function buildDivider(design: Design, bounds: Bounds): THREE.Group | null {
  if (!design.options.batterySense || CHIPS[design.chip].batteryDividerBuiltIn) return null;
  const spots = partSpots(design, bounds);
  const g = new THREE.Group();
  for (const ref of ["R3", "R4"]) g.add(item(smdResistor(spots[ref]!.x, spots[ref]!.y), "resistor"));
  return g;
}

/* The wordmark on the chin: "Open" over "Clicker", Fraunces 900, oxblood, left-aligned with
 * the key field (brand book, Hardware → The face). */
function wordmark(width: number): THREE.Mesh {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = BRAND.oxblood; g.font = '900 104px Fraunces, "Cooper Black", Georgia, serif'; g.textBaseline = "alphabetic";
  g.fillText("Open", 4, 100); g.fillText("Clicker", 4, 210);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.userData.legend = true;
  return m;
}

/* Three printed parts (brand book, Hardware → The shell): the shell (face and walls, open at
 * the back), the plate the switches clip into, and the lid. */
export function buildShell(design: Design, bounds: Bounds): { lid: THREE.Group; shell: THREE.Group; plate: THREE.Group } {
  const cap = KEYCAPS[design.keycap];
  const depth = PCB.thickness + Math.max(1.2 + 4.5, DIODE.height + 0.4 + design.battery.thicknessMm) + 1;
  const grow = SHELL_RULES.wall + SHELL.clearance, radius = SHELL_RULES.fillet;
  const cx = (bounds.minX + bounds.maxX) / 2;

  const lid = new THREE.Group();
  const walls = outline(bounds, grow, radius - grow);
  walls.holes.push(outline(bounds, SHELL.clearance, radius - grow));
  lid.add(slab(outline(bounds, grow, radius - grow), -depth - SHELL.floor, SHELL.floor, "shell"));
  lid.add(slab(walls, -depth, depth - PCB.thickness, "shell"));
  /* USB-C opening, centred on the bottom edge. */
  lid.add(box(XIAO_BOARD.usb.width + 0.6, XIAO_BOARD.usb.height + 0.6, grow + 0.2, "slot", cx, -PCB.thickness - 1.3 - XIAO_BOARD.usb.height / 2, bounds.maxY + grow / 2));
  item(lid, "lid");

  const plate = new THREE.Group();
  const plateShape = outline(bounds, 0, radius - grow);
  for (const key of design.keys) plateShape.holes.push(rectHole(key, SHELL_RULES.plateCutout, SHELL_RULES.plateCutout, 0.3));
  plate.add(slab(plateShape, CHOC.bottom.height - SHELL_RULES.plate, SHELL_RULES.plate, "shell"));
  item(plate, "plate");

  const shell = new THREE.Group();
  const face = outline(bounds, grow, radius - grow);
  for (const key of design.keys) face.holes.push(rectHole(key, capWidth(key.w) + 1, cap.depthMm + 1));
  const rim = outline(bounds, grow, radius - grow);
  rim.holes.push(outline(bounds, SHELL.clearance, radius - grow));
  shell.add(slab(rim, -PCB.thickness, PCB.thickness + 3.6, "shell"));
  const faceMesh = slab(face, 3.6, SHELL.bezel, "shell");
  faceMesh.userData.noEdges = true; /* triangulation edges around the key openings read as scratches */
  shell.add(faceMesh);
  const field = keyField(design);
  const mark = wordmark(30);
  mark.position.set(field.minX + 15, 3.6 + SHELL.bezel + 0.02, bounds.maxY - SHELL_RULES.chin / 2 + 1);
  shell.add(mark);
  /* The IR window: a 6 × 2 mm slot centred on the top edge, only on IR builds. */
  if (design.options.irTransmit || design.options.irReceive)
    shell.add(box(6, 2, grow + 0.2, "slot", cx, 2, bounds.minY - grow / 2));
  item(shell, "shell");
  return { lid, shell, plate };
}

/* Callout text for a layer: the BOM lines it holds, with quantity and unit price. */
function describe(lines: BomLine[], ids: BomId[]): string {
  return lines.filter((l) => ids.includes(l.id)).map((l) => `${l.qty > 1 ? `${l.qty} × ` : ""}${usd(l.unitUsd)}`).join(" + ");
}

export function buildAssembly(design: Design): THREE.Group {
  const bounds = boardBounds(design);
  const lines = bom(design);
  const label = (id: BomId) => lines.find((l) => l.id === id)?.label ?? id;
  const root = new THREE.Group();
  const shell = buildShell(design, bounds);
  const switches = part({ layer: 4, label: label("switch"), detail: describe(lines, ["switch"]) });
  const caps = part({ layer: 6, label: label("keycap"), detail: describe(lines, ["keycap"]) });
  for (const key of design.keys) { switches.add(buildSwitch(key)); caps.add(buildKeycap(design, key)); }
  const back = buildDiodes(design);
  const divider = buildDivider(design, bounds);
  if (divider) back.add(...divider.children);
  back.userData.part = { layer: 2, label: "Diodes · resistors", detail: describe(lines, ["diode", "resistor"]) };
  const wrap = (g: THREE.Group | null, layer: number, ids: BomId[]) => {
    if (!g) return null;
    const outer = part({ layer, label: ids.map(label).join(" · "), detail: describe(lines, ids) });
    outer.add(g);
    return outer;
  };
  const ir = buildIr(design, bounds);
  if (ir) ir.userData.part = { layer: 4, label: "IR", detail: describe(lines, ["ir-led", "ir-driver", "ir-receiver"]) };
  const parts = [
    wrap(shell.lid, 0, ["lid"]), wrap(buildBattery(design, bounds), 1, ["battery"]), wrap(buildXiao(design, bounds), 1.4, ["controller"]),
    back, wrap(buildPcb(design, bounds), 3, ["pcb"]), wrap(shell.plate, 3.6, ["plate"]), switches, ir, wrap(shell.shell, 5, ["shell"]), caps,
  ];
  for (const p of parts) if (p) root.add(p);
  return root;
}
