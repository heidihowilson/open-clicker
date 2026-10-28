import * as THREE from "three";
import { boardBounds, SHELL_RULES, type Bounds } from "../lib/geometry";
import { bom, usd, type BomId, type BomLine } from "../lib/bom";
import { buildAssembly, buildKeycap, buildShell, type Look, type PartInfo } from "../lib/parts";
import { SHELL } from "../lib/parts-data";
import { addEdges, applyStyle } from "../lib/style";
import { CAPS, cellX, cellZ, inside, SHELL_COLOR, toDesign, type Remote } from "./model";

/* The remote as a real 3D model, seen straight from above so it reads as 2D. A fixed,
 * full-window canvas sits behind the page; the camera places the remote exactly inside the
 * page's stage element, so the page lays out as if the remote were a flat element.
 * World axes: x = design x, z = design y (down the remote), y = up. */

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);
const ISO = new THREE.Vector3(0.9, 1.25, 1.35).normalize();
const TOP = new THREE.Vector3(0, 1, 0);
const GAP_MM = 13;

interface KeyObj { root: THREE.Group; pivot: THREE.Group; cap: THREE.Group; color: string; x: number; z: number; tx: number; tz: number; s: number; ts: number; lift: number; dead: boolean; delay: number; phase: number; dur: number; alt: boolean }
export interface FocusInfo { line: BomLine }

function rnd(i: number, c: number) { const x = Math.sin((i + 1) * 12.9898 + c * 78.233) * 43758.5453; return x - Math.floor(x); }

export class RemoteScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
  private edit = new THREE.Group();
  private body: THREE.Group | null = null;
  private keys = new Map<string, KeyObj>();
  private assembly: THREE.Group | null = null;
  private explode = 0;
  private explodeTarget = 0;
  private dir = TOP.clone();
  private up = new THREE.Vector3(0, 0, -1);
  private center = new THREE.Vector3();
  private stage: HTMLElement | null = null;
  private labels: HTMLElement;
  private pills: { part: THREE.Object3D; el: HTMLElement }[] = [];
  private focused: THREE.Object3D | null = null;
  private zoom = 1;
  private zoomTarget = 1;
  private raf = 0;
  private remote: Remote | null = null;
  private live: Bounds | null = null;
  private serial = 0;
  ppm = 3;
  private radius = 80;
  /** The page sets this; the camera eases toward it. */
  ppmTarget = 3;
  jiggle = false;
  onFocus: (info: FocusInfo | null) => void = () => {};

  constructor(private host: HTMLElement, labels: HTMLElement) {
    this.labels = labels;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#8a8a90", 1.7));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6); sun.position.set(-40, 300, -120); this.scene.add(sun);
    this.scene.add(this.edit);
    this.renderer.domElement.addEventListener("pointerup", (e) => this.tap(e));
    this.renderer.domElement.addEventListener("pointerdown", (e) => { this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    loop();
  }
  private downAt: { x: number; y: number; t: number } | null = null;

  dispose() { cancelAnimationFrame(this.raf); this.renderer.dispose(); this.renderer.domElement.remove(); }
  setStage(el: HTMLElement) { this.stage = el; }

  /* ---------- the editable remote ---------- */

  private look(r: Remote): Look {
    return { shell: SHELL_COLOR, caps: Object.fromEntries(r.keys.map((k) => [k.id, CAPS[k.color].top])) };
  }
  /** Sync keys to the remote; `stagger` spreads a template morph over the keys. */
  setRemote(r: Remote, stagger = false) {
    this.remote = r;
    const seen = new Set<string>();
    r.keys.forEach((k, i) => {
      seen.add(k.id);
      let o = this.keys.get(k.id);
      const color = CAPS[k.color].top;
      if (!o || o.color !== color) {
        const fresh = this.makeKey(k.id, color, this.serial++);
        if (o) { fresh.x = o.x; fresh.z = o.z; fresh.s = o.s; this.edit.remove(o.root); }
        else { fresh.x = cellX(k.col); fresh.z = cellZ(k.row); fresh.s = 0; }
        o = fresh; this.keys.set(k.id, o);
      }
      o.tx = cellX(k.col); o.tz = cellZ(k.row); o.dead = false;
      o.delay = stagger ? performance.now() + i * 14 : 0;
    });
    for (const [id, o] of this.keys) if (!seen.has(id)) { o.dead = true; o.ts = 0; }
    this.setLive(null);
  }
  private makeKey(id: string, color: string, i: number): KeyObj {
    const at = { id, x: 0, y: 0, w: 1 as const, action: "none" as const, label: "" };
    const cap = buildKeycap(toDesign({ cols: 1, rows: 2, keys: [] }), at, color);
    applyStyle(cap, "#000");
    const pivot = new THREE.Group(), root = new THREE.Group();
    /* An off-centre pivot near the top of the cap, as SPEC §4.1 asks. */
    const px = (rnd(i, 3) * 0.4 - 0.2) * 17.5, pz = (-0.5 + 0.05 + rnd(i, 4) * 0.1) * 16.5;
    pivot.position.set(px, 0, pz); cap.position.set(-px, 0, -pz);
    pivot.add(cap); root.add(pivot); this.edit.add(root);
    return { root, pivot, cap, color, x: 0, z: 0, tx: 0, tz: 0, s: 0, ts: 1, lift: 0, dead: false, delay: 0,
      phase: -rnd(i, 2), dur: 0.22 + rnd(i, 1) * 0.12, alt: i % 2 === 1 };
  }
  /** Live key area while the shell is being resized, in mm; null means the remote's own. */
  setLive(live: Bounds | null) {
    if (!this.remote) return;
    const d = toDesign(this.remote);
    const b = live ?? boardBounds(d);
    this.live = live;
    const keys = this.remote.keys.filter((k) => live ? cellX(k.col) + 9 <= live.maxX - SHELL_RULES.margin + 0.01 && cellZ(k.row) + 8.5 <= live.maxY - SHELL_RULES.chin + 0.01 : inside(this.remote!, k));
    const shown = new Set(keys.map((k) => k.id));
    for (const [id, o] of this.keys) if (!o.dead) o.ts = shown.has(id) ? 1 : 0;
    /* The face has a hole per key; the plate and lid under it keep the holes dark from above. */
    const parts = buildShell({ ...d, keys: d.keys.filter((k) => shown.has(k.id)) }, b, this.look(this.remote));
    const shell = new THREE.Group();
    shell.add(parts.lid, parts.plate, parts.shell);
    applyStyle(shell, "#000");
    if (this.body) { this.edit.remove(this.body); this.dispose3d(this.body); }
    this.body = shell; this.edit.add(shell);
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2);
  }
  /** Shell outer size in mm for a key area (for the page to size the stage). */
  static outer(b: Bounds) { const g = SHELL_RULES.wall + SHELL.clearance; return { w: b.maxX - b.minX + 2 * g, h: b.maxY - b.minY + 2 * g }; }

  dragKey(id: string, x: number, z: number, out: boolean) {
    const o = this.keys.get(id); if (!o) return;
    o.x = o.tx = x; o.z = o.tz = z; o.lift = out ? -1 : 1;
  }
  endDrag(id: string) { const o = this.keys.get(id); if (o) o.lift = 0; }
  /** A key added from the tray starts where it was dropped and glides into its cell. */
  spawnAt(id: string, x: number, z: number) { const o = this.keys.get(id); if (o) { o.x = x; o.z = z; o.s = 1; } }
  /** Snap the zoom (used while the page freezes or jumps it). */
  setPpm(v: number) { this.ppm = this.ppmTarget = v; }

  /* ---------- screen <-> mm (top-down only) ---------- */

  private stageRect() { return this.stage?.getBoundingClientRect() ?? new DOMRect(innerWidth / 2, innerHeight / 2, 0, 0); }
  toScreen(x: number, z: number) {
    const r = this.stageRect();
    return { x: r.left + r.width / 2 + (x - this.center.x) * this.ppm, y: r.top + r.height / 2 + (z - this.center.z) * this.ppm };
  }
  toMm(cx: number, cy: number) {
    const r = this.stageRect();
    return { x: this.center.x + (cx - r.left - r.width / 2) / this.ppm, z: this.center.z + (cy - r.top - r.height / 2) / this.ppm };
  }

  /* ---------- Build or Buy: swing and explode ---------- */

  showParts(on: boolean) {
    if (on && this.remote) {
      const d = toDesign(this.remote);
      if (this.assembly) { this.scene.remove(this.assembly); this.dispose3d(this.assembly); }
      this.assembly = buildAssembly(d, this.look(this.remote));
      addEdges(this.assembly);
      applyStyle(this.assembly, "#d1d1d6");
      this.scene.add(this.assembly);
      this.makePills(d);
      /* Size of the fully exploded model, for fitting it into the stage. */
      this.layout(1);
      this.radius = new THREE.Box3().setFromObject(this.assembly).getBoundingSphere(new THREE.Sphere()).radius;
      this.layout(0);
      this.edit.visible = false;
      this.assembly.visible = true;
    }
    this.unfocus();
    this.explodeTarget = on ? 1 : 0;
  }
  private makePills(d: ReturnType<typeof toDesign>) {
    for (const p of this.pills) p.el.remove();
    this.pills = [];
    if (!this.assembly) return;
    const lines = bom(d);
    for (const child of this.assembly.children) {
      const info = child.userData.part as PartInfo | undefined;
      if (!info) continue;
      const el = document.createElement("button");
      el.type = "button"; el.className = "part-pill";
      el.textContent = info.label;
      el.addEventListener("click", () => {
        const target = child.children[0] ?? child;
        const id = (this.itemOf(target) ?? child).userData.item as BomId | undefined;
        if (this.focused) this.unfocus(); else this.focus(child, lines.find((l) => l.id === id) ?? null);
      });
      this.labels.appendChild(el);
      this.pills.push({ part: child, el });
    }
  }
  private layout(t: number) {
    if (!this.assembly) return;
    for (const child of this.assembly.children) {
      const info = child.userData.part as PartInfo | undefined;
      child.position.y = info ? info.layer * GAP_MM * t : 0;
    }
  }
  private itemOf(o: THREE.Object3D | null): THREE.Object3D | null { for (let p = o; p; p = p.parent) if (p.userData.item) return p; return null; }
  private focus(o: THREE.Object3D, line: BomLine | null) {
    if (!this.assembly) return;
    this.focused = o;
    applyStyle(this.assembly, "#d1d1d6", o);
    const b = new THREE.Box3().setFromObject(o);
    this.focusCenter = b.getCenter(new THREE.Vector3());
    this.zoomTarget = Math.min(4, Math.max(1.4, 60 / Math.max(b.getSize(new THREE.Vector3()).length(), 1)));
    this.onFocus(line ? { line } : null);
  }
  private focusCenter: THREE.Vector3 | null = null;
  private unfocus() {
    if (!this.focused) return;
    this.focused = null; this.focusCenter = null; this.zoomTarget = 1;
    if (this.assembly) applyStyle(this.assembly, "#d1d1d6", null);
    this.onFocus(null);
  }
  private tap(e: PointerEvent) {
    const d = this.downAt; this.downAt = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || this.explode < 0.6 || !this.assembly) return;
    if (this.focused) { this.unfocus(); return; }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const hit = ray.intersectObject(this.assembly, true).map((h) => this.itemOf(h.object)).find((o) => o !== null);
    if (!hit) return;
    const lines = bom(toDesign(this.remote!));
    this.focus(hit, lines.find((l) => l.id === hit.userData.item) ?? null);
  }

  /* ---------- frame ---------- */

  private frame() {
    const w = innerWidth, h = innerHeight;
    const canvas = this.renderer.domElement;
    if (canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || canvas.height !== Math.round(h * this.renderer.getPixelRatio())) this.renderer.setSize(w, h);
    const now = performance.now();

    /* keys: glide, pop, fade, lift and jiggle */
    for (const [id, o] of this.keys) {
      if (o.delay && now < o.delay) continue;
      o.x += (o.tx - o.x) * 0.2; o.z += (o.tz - o.z) * 0.2;
      o.s += (o.ts - o.s) * 0.25;
      const lift = o.lift === 1 ? 1.1 : o.lift === -1 ? 0.9 : 1;
      const scale = o.s * lift;
      o.root.position.set(o.x, o.lift === 1 ? 3 : 0, o.z);
      o.root.scale.setScalar(Math.max(scale, 0.0001));
      o.root.visible = scale > 0.02;
      let angle = 0;
      if (this.jiggle && o.lift === 0 && !o.dead) {
        const p = ((now / 1000 - o.phase) / o.dur) % 1;
        const a = p < 0.5 ? -1.4 + 3.4 * (p * 2) ** 2 : 2 - 3.4 * EASE((p - 0.5) * 2);
        angle = (o.alt ? -a : a) * Math.PI / 180;
      }
      o.pivot.rotation.y = angle;
      if (o.dead && o.s < 0.02) { this.edit.remove(o.root); this.dispose3d(o.root); this.keys.delete(id); }
    }

    /* explode and camera swing */
    if (Math.abs(this.explode - this.explodeTarget) > 0.001) this.explode += (this.explodeTarget - this.explode) * 0.06;
    else this.explode = this.explodeTarget;
    const t = EASE(this.explode);
    if (this.assembly) {
      this.layout(t);
      if (this.explode < 0.002 && this.explodeTarget === 0 && this.assembly.visible) { this.assembly.visible = false; this.edit.visible = true; for (const p of this.pills) p.el.remove(); this.pills = []; }
    }
    this.dir.copy(TOP).lerp(ISO, t).normalize();
    if (t < 0.001) this.dir.set(0, 1, 0.0001).normalize();
    this.up.set(0, 0, -1).lerp(new THREE.Vector3(0, 1, 0), t).normalize();
    this.zoom += (this.zoomTarget - this.zoom) * 0.12;
    this.ppm = Math.abs(this.ppmTarget - this.ppm) < 0.002 ? this.ppmTarget : this.ppm + (this.ppmTarget - this.ppm) * 0.12;

    const r = this.stageRect();
    const target = this.center.clone();
    if (this.assembly && t > 0) target.y = (GAP_MM * 6 * t) / 2;
    if (this.focusCenter) target.lerp(this.focusCenter, Math.min(1, (this.zoom - 1) / Math.max(this.zoomTarget - 1, 0.001)));
    const half = { w: w / 2 / this.ppm, h: h / 2 / this.ppm };
    this.camera.left = -half.w; this.camera.right = half.w; this.camera.top = half.h; this.camera.bottom = -half.h;
    this.camera.zoom = this.zoom;
    this.camera.position.copy(target).addScaledVector(this.dir, 800);
    this.camera.up.copy(this.up);
    this.camera.lookAt(target);
    /* put the target at the stage's centre */
    this.camera.setViewOffset(w, h, w / 2 - (r.left + r.width / 2), h / 2 - (r.top + r.height / 2), w, h);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.placePills(t);
  }

  private placePills(t: number) {
    const show = t > 0.6 && !this.focused;
    const box = new THREE.Box3(), v = new THREE.Vector3();
    const w = innerWidth, h = innerHeight;
    /* Labels stay inside the stage, so they never cover the page below it. */
    const r = this.stageRect(), top = r.top + 14, bottom = r.bottom - 14;
    const items = this.pills.map((p) => {
      box.setFromObject(p.part);
      v.set(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2).project(this.camera);
      return { p, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
    }).sort((a, b) => a.y - b.y);
    const step = items.length > 1 ? Math.min(30, (bottom - top) / (items.length - 1)) : 0;
    const ys = items.map((it) => it.y);
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i]!, top, i ? ys[i - 1]! + step : top);
    for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i]!, bottom - (ys.length - 1 - i) * step);
    items.forEach((it, i) => {
      it.p.el.style.opacity = show ? "1" : "0";
      it.p.el.style.pointerEvents = show ? "auto" : "none";
      const x = Math.min(it.x + 12, w - it.p.el.offsetWidth - 8);
      it.p.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(ys[i]! - 14)}px)`;
    });
  }

  private dispose3d(o: THREE.Object3D) {
    o.traverse((m) => { if (m instanceof THREE.Mesh || m instanceof THREE.LineSegments) m.geometry.dispose(); });
  }

  /** Fit the exploded remote into the stage; returns px per mm. */
  explodedFit(stageW: number, stageH: number): number {
    /* Pills sit to the right of the model, so leave a column for them on wide stages. */
    const room = stageW > 520 ? stageW - 150 : stageW - 24;
    return Math.max(0.8, Math.min(room, stageH) / (2 * this.radius * 0.92));
  }
  priceOf(line: BomLine) { return `${line.qty} × ${usd(line.unitUsd)} = ${usd(line.qty * line.unitUsd)}`; }
}
