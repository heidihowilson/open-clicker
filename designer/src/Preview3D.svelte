<script lang="ts">
  import * as THREE from "three";
  import { untrack } from "svelte";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import type { Design } from "./lib/design";
  import { boardBounds } from "./lib/geometry";
  import { buildAssembly, type PartInfo } from "./lib/parts";
  import { addEdges, applyStyle, BLUEPRINT, type ViewStyle } from "./lib/style";
  import { bom, usd, type BomId, type BomLine } from "./lib/bom";

  let { design }: { design: Design } = $props();
  let host: HTMLDivElement;
  let overlay: SVGSVGElement;
  let tags: HTMLDivElement;
  let explode = $state(0);
  let target = $state(0);
  let style = $state<ViewStyle>("solid");
  let focusCard = $state<{ line: BomLine; keyId: string | null } | null>(null);
  let labels = $state(true);
  let view = $state<"iso" | "top" | "front" | "side">("iso");

  const GAP_MM = 14;

  function setExplode(on: boolean) { target = on ? 1 : 0; }

  /* Set up once. Reactive reads live only in the effects under $effect.root below, so the
   * renderer (and its WebGL context) is never recreated by a state change. */
  $effect(() => untrack(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#3a4250", 1.4));
    const sun = new THREE.DirectionalLight("#ffffff", 2.4); sun.position.set(80, 160, 120); scene.add(sun);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.screenSpacePanning = true;

    const grids = new THREE.Group();
    const minor = new THREE.GridHelper(400, 80, BLUEPRINT.faint, BLUEPRINT.faint);
    const major = new THREE.GridHelper(400, 8, BLUEPRINT.line, BLUEPRINT.line);
    for (const g of [minor, major]) { (g.material as THREE.Material).transparent = true; (g.material as THREE.Material).opacity = g === minor ? 0.35 : 0.5; }
    grids.add(minor, major);
    scene.add(grids);

    let model: THREE.Group | null = null;
    let leaders: THREE.Group | null = null;
    let center = new THREE.Vector3();
    let radius = 80;
    let framedFor = "";
    let shifted = -1;

    /* Tap a part in the exploded view: ghost the rest and fly the camera to it. Tap again to
     * go back to exactly where you were. */
    let focused: THREE.Object3D | null = null;
    let saved: { position: THREE.Vector3; target: THREE.Vector3; zoom: number } | null = null;
    let flight: { from: { position: THREE.Vector3; target: THREE.Vector3; zoom: number }; to: { position: THREE.Vector3; target: THREE.Vector3; zoom: number }; t: number } | null = null;
    const raycaster = new THREE.Raycaster();
    const here = () => ({ position: camera.position.clone(), target: controls.target.clone(), zoom: camera.zoom });
    function fly(to: { position: THREE.Vector3; target: THREE.Vector3; zoom: number }) { flight = { from: here(), to, t: 0 }; }

    function itemOf(o: THREE.Object3D | null): THREE.Object3D | null {
      for (let p = o; p; p = p.parent) if (p.userData.item) return p;
      return null;
    }
    function focus(object: THREE.Object3D) {
      focused = object;
      saved = here();
      const bounds = new THREE.Box3().setFromObject(object);
      const c = bounds.getCenter(new THREE.Vector3());
      const r = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 4);
      const offset = camera.position.clone().sub(controls.target);
      fly({ position: c.clone().add(offset), target: c, zoom: Math.min(14, Math.max(1, camera.top / (r * 2.4))) });
      if (model) applyStyle(model, untrack(() => style), focused);
      const id = object.userData.item as BomId;
      const line = bom($state.snapshot(design) as Design).find((l) => l.id === id);
      focusCard = line ? { line, keyId: (object.userData.keyId as string | undefined) ?? null } : null;
    }
    function unfocus(restore = true) {
      if (!focused) return;
      focused = null;
      if (restore && saved) fly(saved);
      saved = null;
      focusCard = null;
      if (model) applyStyle(model, untrack(() => style), null);
    }
    let down: { x: number; y: number; t: number } | null = null;
    const canvas = renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener("pointerup", (e) => {
      const tap = down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 450;
      down = null;
      if (!tap) return;
      if (focused) { unfocus(); return; }
      if (untrack(() => explode) < 0.5 || !model) return;
      const rect = canvas.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = raycaster.intersectObject(model, true).map((h) => itemOf(h.object)).find((o) => o !== null);
      if (hit) focus(hit);
    });

    const resize = () => {
      const w = host.clientWidth, h = Math.max(host.clientHeight, 1);
      renderer.setSize(w, h);
      shifted = -1;
      /* Fit the model on wide and tall viewports alike. */
      const aspect = w / h, half = radius * 1.15 * Math.max(1, 0.8 / aspect);
      camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(host);

    function frame(which: typeof view) {
      const dirs = { iso: new THREE.Vector3(1, 1.1, 1.35), top: new THREE.Vector3(0, 1, 0.0001), front: new THREE.Vector3(0, 0.15, 1), side: new THREE.Vector3(1, 0.15, 0) };
      camera.up.set(0, 1, 0);
      if (which === "top") camera.up.set(0, 0, -1);
      camera.position.copy(center).addScaledVector(dirs[which].normalize(), 600);
      camera.zoom = 1;
      controls.target.copy(center);
      camera.updateProjectionMatrix();
      controls.update();
    }

    /* Callouts live in screen space: a label column on the right with leaders to each part,
     * so they never leave the viewport whatever the view or screen size. */
    let callouts: { part: THREE.Object3D; el: HTMLDivElement; line: SVGLineElement }[] = [];
    function clearCallouts() { for (const c of callouts) { c.el.remove(); c.line.remove(); } callouts = []; }
    function makeCallouts() {
      clearCallouts();
      if (!model) return;
      for (const child of model.children) {
        const info = child.userData.part as PartInfo | undefined;
        if (!info) continue;
        const el = document.createElement("div");
        el.className = "callout";
        const b = document.createElement("b"); b.textContent = info.label;
        const span = document.createElement("span"); span.textContent = info.detail;
        el.append(b, span);
        tags.appendChild(el);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        overlay.appendChild(line);
        callouts.push({ part: child, el, line });
      }
    }
    const box = new THREE.Box3(), point = new THREE.Vector3();
    function placeCallouts(show: boolean) {
      tags.style.display = overlay.style.display = show ? "" : "none";
      const w = host.clientWidth, h = host.clientHeight, column = Math.min(190, w * 0.42);
      /* Slide the drawing left so the label column never covers a part. */
      const shift = show ? Math.round(column / 2 + 6) : 0;
      if (shift !== shifted) {
        shifted = shift;
        if (shift) camera.setViewOffset(w, h, shift, 0, w, h); else camera.clearViewOffset();
      }
      if (!show) return;
      const items = callouts.map((c) => {
        box.setFromObject(c.part);
        point.set(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2).project(camera);
        return { c, x: (point.x + 1) / 2 * w, y: (1 - point.y) / 2 * h };
      }).sort((a, b) => a.y - b.y);
      const top = 64, bottom = h - 76, step = items.length > 1 ? Math.max(34, (bottom - top) / (items.length - 1)) : 0;
      const left = w - column - 10;
      items.forEach((it, i) => {
        const y = Math.min(top + i * step, bottom);
        it.c.el.style.transform = `translate(${left}px, ${y - 14}px)`;
        it.c.el.style.width = `${column}px`;
        it.c.line.setAttribute("x1", String(it.x)); it.c.line.setAttribute("y1", String(it.y));
        it.c.line.setAttribute("x2", String(left)); it.c.line.setAttribute("y2", String(y));
      });
    }
    function layout(t: number) {
      if (!model) return;
      for (const child of model.children) {
        const info = child.userData.part as PartInfo | undefined;
        child.position.y = info ? info.layer * GAP_MM * t : 0;
      }
    }

    const stop = $effect.root(() => {
      $effect(() => {
        const d = $state.snapshot(design) as Design;
        unfocus(false);
        if (model) { scene.remove(model); model.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose(); }); }
        model = buildAssembly(d);
        addEdges(model);
        applyStyle(model, style);
        scene.add(model);
        const b = boardBounds(d);
        center = new THREE.Vector3((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2);
        radius = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.85;
        grids.position.set(center.x, -24, center.z);
        resize();
        if (framedFor !== d.name) { framedFor = d.name; frame(view); }
        layout(untrack(() => explode));
        makeCallouts();
      });
      $effect(() => { const s = style; if (model) applyStyle(model, s, focused); scene.background = new THREE.Color(s === "blueprint" ? BLUEPRINT.paper : "#d9dde2"); grids.visible = s === "blueprint"; });
      $effect(() => { const v = view; unfocus(false); frame(v); });
      $effect(() => { layout(explode); if (explode < 0.5) unfocus(); });
    });

    let raf = 0;
    const loop = () => {
      if (Math.abs(explode - target) > 0.002) explode += (target - explode) * 0.12;
      else if (explode !== target) explode = target;
      if (flight) {
        flight.t = Math.min(1, flight.t + 0.07);
        const k = 1 - Math.pow(1 - flight.t, 3);
        camera.position.lerpVectors(flight.from.position, flight.to.position, k);
        controls.target.lerpVectors(flight.from.target, flight.to.target, k);
        camera.zoom = flight.from.zoom + (flight.to.zoom - flight.from.zoom) * k;
        camera.updateProjectionMatrix();
        if (flight.t >= 1) flight = null;
      }
      controls.update();
      renderer.render(scene, camera);
      placeCallouts(labels && explode > 0.35 && !focused);
      raf = requestAnimationFrame(loop);
    };
    resize(); frame(view); loop();
    return () => { cancelAnimationFrame(raf); stop(); observer.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); clearCallouts(); };
  }));
</script>

<div class="viewport">
  <div class="canvas" bind:this={host}></div>
  <svg class="leaders" bind:this={overlay} aria-hidden="true"></svg>
  <div class="tags" bind:this={tags}></div>
  <div class="toolbar top">
    {#each ["iso", "top", "front", "side"] as const as v}
      <button class:on={view === v} onclick={() => (view = v)}>{v.toUpperCase()}</button>
    {/each}
  </div>
  {#if focusCard}
    <div class="card" role="status">
      <small>{focusCard.line.kind === "buy" ? "PURCHASED PART" : focusCard.line.kind === "print" ? "PRINTED PART" : "FABRICATED PART"}</small>
      <b>{focusCard.line.label}{focusCard.keyId ? ` · key ${focusCard.keyId}` : ""}</b>
      <span>{focusCard.line.spec}</span>
      <span class="price">{focusCard.line.qty} × {usd(focusCard.line.unitUsd)} = {usd(focusCard.line.qty * focusCard.line.unitUsd)}</span>
      <span class="basis">{focusCard.line.basis}</span>
      <span class="hint">Tap anywhere to return</span>
    </div>
  {:else if explode > 0.5}
    <div class="hint-pill">Tap a part to focus it</div>
  {/if}
  <div class="toolbar bottom">
    <button class="primary" class:on={target === 1} onclick={() => setExplode(target === 0)}>{target === 1 ? "COLLAPSE" : "EXPLODE"}</button>
    <input type="range" min="0" max="1" step="0.01" value={target} oninput={(e) => (target = Number(e.currentTarget.value))} aria-label="Explode distance" />
    <button class:on={labels} onclick={() => (labels = !labels)}>LABELS</button>
    <button onclick={() => (style = style === "blueprint" ? "solid" : "blueprint")}>{style === "blueprint" ? "SOLID" : "BLUEPRINT"}</button>
  </div>
</div>

<style>
  .viewport { position: relative; width: 100%; height: 100%; min-height: 360px; border: 1px solid var(--rule); }
  .canvas { position: absolute; inset: 0; overflow: hidden; }
  .canvas :global(canvas) { display: block; touch-action: none; }
  .leaders, .tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .leaders { width: 100%; height: 100%; }
  .leaders :global(line) { stroke: var(--accent); stroke-width: 1; stroke-dasharray: 4 3; }
  .tags :global(.callout) { position: absolute; left: 0; top: 0; font: 10px/1.3 var(--mono); color: var(--ink);
    background: color-mix(in srgb, var(--paper) 88%, transparent); border: 1px solid var(--accent); padding: 3px 6px;
    display: flex; flex-direction: column; overflow: hidden; }
  .tags :global(.callout b) { letter-spacing: 1px; text-transform: uppercase; color: var(--accent); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tags :global(.callout span) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card { position: absolute; right: 10px; top: 52px; width: min(260px, calc(100% - 20px)); display: flex; flex-direction: column; gap: 3px;
    font: 11px/1.4 var(--mono); color: var(--ink); background: var(--paper); border: 1px solid var(--accent); padding: 10px 12px; pointer-events: none; }
  .card small { font-size: 9px; letter-spacing: 2px; color: var(--line); }
  .card b { color: var(--accent); letter-spacing: 1px; text-transform: uppercase; }
  .card .price { font-size: 13px; font-weight: 700; margin-top: 4px; }
  .card .basis, .card .hint { color: var(--line); font-size: 10px; }
  .card .hint { margin-top: 4px; letter-spacing: 1px; text-transform: uppercase; }
  .hint-pill { position: absolute; left: 10px; bottom: 56px; font: 10px var(--mono); letter-spacing: 1px;
    text-transform: uppercase; color: var(--paper); background: var(--accent); padding: 4px 10px; pointer-events: none; }
  .toolbar { position: absolute; left: 8px; right: 8px; display: flex; gap: 6px; flex-wrap: wrap; pointer-events: none; }
  .toolbar.top { top: 8px; } .toolbar.bottom { bottom: 8px; align-items: center; }
  .toolbar > * { pointer-events: auto; }
  .toolbar button { background: var(--paper); }
  .toolbar button.on { background: var(--accent); }
  .toolbar input[type="range"] { flex: 1; min-width: 90px; accent-color: var(--accent); }
</style>
