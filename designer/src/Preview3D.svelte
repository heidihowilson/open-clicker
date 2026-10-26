<script lang="ts">
  import * as THREE from "three";
  import { untrack } from "svelte";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import type { Design } from "./lib/design";
  import { boardBounds } from "./lib/geometry";
  import { buildAssembly, type PartInfo } from "./lib/parts";
  import { addEdges, applyStyle } from "./lib/style";
  import { bom, usd, type BomId, type BomLine } from "./lib/bom";

  let { design, theme }: { design: Design; theme: string } = $props();
  let host: HTMLDivElement;
  let overlay: SVGSVGElement;
  let tags: HTMLDivElement;
  let explode = $state(0);
  let target = $state(0);
  let focusCard = $state<{ line: BomLine; keyId: string | null } | null>(null);
  /* Callouts crowd a phone screen; the focus card does their job there. */
  let labels = $state(!matchMedia("(max-width: 759px)").matches);
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

    /* Viewport grid: grid-minor every millimetre, grid-major every 18 mm Choc pitch. */
    const grids = new THREE.Group();
    scene.add(grids);
    let ghost = "#9c8673";
    function paint() {
      const css = getComputedStyle(host);
      const v = (name: string) => css.getPropertyValue(name).trim() || "#888";
      scene.background = new THREE.Color(v("--viewport"));
      ghost = v("--line-strong");
      grids.clear();
      grids.add(new THREE.GridHelper(360, 360, v("--grid-minor"), v("--grid-minor")), new THREE.GridHelper(360, 20, v("--grid-major"), v("--grid-major")));
      if (model) applyStyle(model, ghost, focused);
    }

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
      if (model) applyStyle(model, ghost, focused);
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
      if (model) applyStyle(model, ghost, null);
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
      const w = host.clientWidth, h = host.clientHeight, column = Math.min(220, w * 0.44);
      /* Slide the drawing left so the label column never covers a part. */
      const shift = show ? Math.round(column / 2 + 6) : 0;
      /* Lift a focused part above the card docked at the bottom. */
      const lift = focused ? Math.round(Math.min(150, h * 0.25)) : 0;
      if (shift * 10000 + lift !== shifted) {
        shifted = shift * 10000 + lift;
        if (shift || lift) camera.setViewOffset(w, h, shift, lift, w, h); else camera.clearViewOffset();
      }
      if (!show) return;
      const items = callouts.map((c) => {
        box.setFromObject(c.part);
        point.set(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2).project(camera);
        return { c, x: (point.x + 1) / 2 * w, y: (1 - point.y) / 2 * h };
      }).sort((a, b) => a.y - b.y);
      const top = 64, bottom = h - 80, step = items.length > 1 ? Math.max(46, (bottom - top) / (items.length - 1)) : 0;
      const left = w - column - 10;
      items.forEach((it, i) => {
        const y = Math.min(top + i * step, bottom);
        it.c.el.style.transform = `translate(${left}px, ${y - 20}px)`;
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
        applyStyle(model, ghost);
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
      $effect(() => { void theme; requestAnimationFrame(paint); });
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
  {#if focusCard}
    <div class="card" role="status">
      <span class="eyebrow">{focusCard.line.kind === "buy" ? "Bought" : focusCard.line.kind === "print" ? "Printed" : "Made to order"}</span>
      <b>{focusCard.line.label}{focusCard.keyId ? ` · the ${focusCard.keyId} key` : ""}</b>
      <span>{focusCard.line.spec}</span>
      <span class="price">{focusCard.line.qty} × {usd(focusCard.line.unitUsd)} = {usd(focusCard.line.qty * focusCard.line.unitUsd)}</span>
      <span class="basis">{focusCard.line.basis}</span>
      <span class="hint">Tap anywhere to go back.</span>
    </div>
  {:else if explode > 0.5}
    <span class="oc-badge oc-badge-accent hint-pill">Tap a part to see it</span>
  {/if}
  <div class="toolbar">
    <button class="oc-btn" class:oc-btn-primary={target === 0} onclick={() => setExplode(target === 0)}>{target === 1 ? "Assemble" : "Explode"}</button>
    <div class="oc-seg" role="radiogroup" aria-label="Camera">
      {#each [["iso", "Iso"], ["top", "Top"], ["front", "Front"], ["side", "Side"]] as const as [v, name]}
        <button class="oc-seg-opt" role="radio" aria-checked={view === v} onclick={() => (view = v)}>{name}</button>
      {/each}
    </div>
    <button class="oc-seg-opt labels" role="switch" aria-checked={labels} onclick={() => (labels = !labels)}>Labels</button>
  </div>
</div>

<style>
  .viewport { position: relative; width: 100%; height: 100%; min-height: 320px; background: var(--viewport); }
  .canvas { position: absolute; inset: 0; overflow: hidden; }
  .canvas :global(canvas) { display: block; touch-action: none; }
  .leaders, .tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .leaders { width: 100%; height: 100%; }
  .leaders :global(line) { stroke: var(--ink-muted); stroke-width: 1; stroke-dasharray: 4 3; }
  .tags :global(.callout) { position: absolute; left: 0; top: 0; display: flex; flex-direction: column; overflow: hidden;
    background: var(--ground-raised); border: 1px solid var(--line); border-radius: var(--radius-sm); box-shadow: var(--shadow-float); padding: 4px 8px; }
  .tags :global(.callout b) { font: 600 14px/18px var(--font-serif); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tags :global(.callout span) { font: 500 12px/16px var(--font-sans); color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card { position: absolute; left: var(--space-3); right: var(--space-3); bottom: 72px; max-width: 360px; display: flex; flex-direction: column; gap: 2px;
    background: var(--ground-raised); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-float); padding: var(--space-3) var(--space-4); pointer-events: none; }
  .card .eyebrow { font: 600 12px/16px var(--font-sans); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); }
  .card b { font: 700 18px/24px var(--font-serif); color: var(--ink); }
  .card span { font: 400 14px/20px var(--font-serif); color: var(--ink-muted); }
  .card .price { font: 600 16px/24px var(--font-sans); color: var(--ink); margin-top: var(--space-1); }
  .card .hint { font-size: 13px; margin-top: var(--space-1); }
  .hint-pill { position: absolute; right: var(--space-3); top: var(--space-3); pointer-events: none; }
  .toolbar { position: absolute; left: var(--space-3); right: var(--space-3); bottom: var(--space-3); display: flex; gap: var(--space-2); align-items: center; pointer-events: none; }
  .toolbar > * { pointer-events: auto; }
  .labels { margin-left: auto; }
  @media (max-width: 759px) { .labels { display: none; } .toolbar .oc-seg-opt { padding: 0 10px; } }
</style>
