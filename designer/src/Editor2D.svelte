<script lang="ts">
  import { capColour, glyphUrl, legendOf } from "./lib/actions";
  import { capWidth, KEYCAPS, PITCH, readingOrder, type Design } from "./lib/design";
  import { boardBounds, collisions, keyField, SHELL_RULES } from "./lib/geometry";

  export type Tool = "select" | "add" | "measure";
  let { design = $bindable(), selected = $bindable(), tool = $bindable(), alertKeys, onPick }: {
    design: Design; selected: string | null; tool: Tool; alertKeys: Set<string>; onPick: (id: string) => void;
  } = $props();

  const PX_PER_MM = 4;
  const PAD = 12;
  /* A press that moves less than this is a tap. */
  const SLOP_PX = 8;
  let host: HTMLDivElement;
  let svg: SVGSVGElement;
  let availW = $state(0), availH = $state(0);
  let userZoom = $state(1);
  let hover = $state<string | null>(null);
  let dragging = $state<string | null>(null);
  let measure = $state<{ a: { x: number; y: number }; b: { x: number; y: number } | null } | null>(null);

  const bounds = $derived(boardBounds(design));
  const field = $derived(keyField(design));
  const grow = SHELL_RULES.wall;
  const outer = $derived({ x: bounds.minX - grow, y: bounds.minY - grow, w: bounds.maxX - bounds.minX + 2 * grow, h: bounds.maxY - bounds.minY + 2 * grow });
  const view = $derived({ x: outer.x - PAD, y: outer.y - PAD, w: outer.w + 2 * PAD, h: outer.h + 2 * PAD });
  const fit = $derived(availW && availH ? Math.min(1, (availW - 16) / (view.w * PX_PER_MM), (availH - 16) / (view.h * PX_PER_MM)) : 1);
  const zoom = $derived(fit * userZoom);
  const clashing = $derived(new Set(collisions(design).flat()));
  const depth = $derived(KEYCAPS[design.keycap].depthMm);
  const ir = $derived(design.options.irTransmit || design.options.irReceive);
  /* Grid lines on cell boundaries: keys centre on multiples of the pitch. */
  const gridOrigin = { x: -PITCH.x / 2, y: -PITCH.y / 2 };

  function toDesign(event: PointerEvent): { x: number; y: number } {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const m = svg.getScreenCTM();
    const q = m ? p.matrixTransform(m.inverse()) : p;
    return { x: q.x, y: q.y };
  }
  const snapX = (v: number) => Math.round(v / (PITCH.x / 2)) * (PITCH.x / 2);
  const snapY = (v: number) => Math.round(v / PITCH.y) * PITCH.y;

  /* Pointer gestures. On a key: tap selects, drag moves (snapped). On the empty sheet: tap
   * deselects, adds a key or places a measure point; one finger pans; two fingers pinch. */
  type Press = { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean; key: string | null; dx: number; dy: number };
  const presses = new Map<number, Press>();
  let pinch: { dist: number; zoom: number } | null = null;

  function down(event: PointerEvent, key: string | null) {
    event.stopPropagation();
    let dx = 0, dy = 0;
    const k = key ? design.keys.find((k) => k.id === key) : null;
    if (k && tool === "select") { const at = toDesign(event); dx = k.x - at.x; dy = k.y - at.y; }
    presses.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false, key: tool === "select" ? key : null, dx, dy });
    svg.setPointerCapture(event.pointerId);
    if (presses.size === 2) {
      const [a, b] = [...presses.values()];
      pinch = { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: userZoom };
      dragging = null;
    }
  }
  function move(event: PointerEvent) {
    const p = presses.get(event.pointerId);
    if (!p) return;
    if (!p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) > SLOP_PX) p.moved = true;
    if (pinch && presses.size === 2) {
      p.lastX = event.clientX; p.lastY = event.clientY;
      const [a, b] = [...presses.values()];
      userZoom = Math.min(2, Math.max(0.5, pinch.zoom * Math.hypot(a!.lastX - b!.lastX, a!.lastY - b!.lastY) / Math.max(pinch.dist, 1)));
      return;
    }
    if (!p.moved) return;
    if (p.key) {
      dragging = p.key;
      const at = toDesign(event);
      const k = design.keys.find((k) => k.id === p.key);
      if (k) { k.x = snapX(at.x + p.dx); k.y = snapY(at.y + p.dy); }
    } else {
      host.scrollLeft -= event.clientX - p.lastX;
      host.scrollTop -= event.clientY - p.lastY;
    }
    p.lastX = event.clientX; p.lastY = event.clientY;
  }
  function up(event: PointerEvent) {
    const p = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (presses.size < 2) pinch = null;
    if (!p) return;
    dragging = null;
    if (p.moved || presses.size) return;
    if (p.key) { onPick(p.key); return; }
    tap(event);
  }
  function tap(event: PointerEvent) {
    const at = toDesign(event);
    if (tool === "measure") {
      const pt = { x: Math.round(at.x * 2) / 2, y: Math.round(at.y * 2) / 2 };
      measure = !measure || measure.b ? { a: pt, b: null } : { a: measure.a, b: pt };
      return;
    }
    if (tool === "add") {
      let n = design.keys.length + 1;
      while (design.keys.some((k) => k.id === `key-${n}`)) n++;
      const x = snapX(at.x), y = snapY(at.y);
      if (design.keys.some((k) => k.x === x && k.y === y)) return;
      design.keys.push({ id: `key-${n}`, x, y, w: 1, action: "none", label: "" });
      tool = "select";
      onPick(`key-${n}`);
      return;
    }
    selected = null;
  }
  function wheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    userZoom = Math.min(2, Math.max(0.5, userZoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
  }
  /* Keyboard: arrows nudge one cell, Shift half a cell sideways; Tab cycles keys in reading order. */
  function keydown(event: KeyboardEvent) {
    const order = readingOrder(design.keys);
    if (event.key === "Tab") {
      const i = order.findIndex((k) => k.id === selected);
      const next = order[(i + (event.shiftKey ? order.length - 1 : 1)) % order.length];
      if (next) { onPick(next.id); event.preventDefault(); }
      return;
    }
    const k = design.keys.find((k) => k.id === selected);
    if (!k) return;
    const fx = event.shiftKey ? PITCH.x / 2 : PITCH.x;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => (k.x -= fx), ArrowRight: () => (k.x += fx), ArrowUp: () => (k.y -= PITCH.y), ArrowDown: () => (k.y += PITCH.y),
      Delete: () => remove(k.id), Backspace: () => remove(k.id), Escape: () => (selected = null),
    };
    const act = moves[event.key];
    if (act) { act(); event.preventDefault(); }
  }
  function remove(id: string) {
    if (design.keys.length <= 1) return;
    design.keys = design.keys.filter((k) => k.id !== id);
    selected = null;
  }
  const dist = (m: { a: { x: number; y: number }; b: { x: number; y: number } }) => Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
</script>

<!-- The sheet is a keyboard target (arrows nudge, Tab cycles keys), as the brand book asks. -->
<div class="wrap">
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="sheet" bind:this={host} bind:clientWidth={availW} bind:clientHeight={availH} tabindex="0" role="application"
  aria-label="Layout, top view at 4 pixels per millimetre" onkeydown={keydown} onwheel={wheel} data-tool={tool}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg bind:this={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
    width={view.w * PX_PER_MM * zoom} height={view.h * PX_PER_MM * zoom}
    onpointerdown={(e) => down(e, null)} onpointermove={move} onpointerup={up} onpointercancel={up}>
    <defs>
      <pattern id="mm" width="1" height="1" patternUnits="userSpaceOnUse" x={gridOrigin.x} y={gridOrigin.y}><path d="M1 0H0V1" class="minor" /></pattern>
      <pattern id="cell" width={PITCH.x} height={PITCH.y} patternUnits="userSpaceOnUse" x={gridOrigin.x} y={gridOrigin.y}>
        <rect width={PITCH.x} height={PITCH.y} fill="url(#mm)" /><path d={`M${PITCH.x} 0H0V${PITCH.y}`} class="major" />
      </pattern>
    </defs>
    <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="url(#cell)" />

    <rect x={outer.x} y={outer.y} width={outer.w} height={outer.h} rx={SHELL_RULES.fillet} class="rim" />
    <rect x={bounds.minX} y={bounds.minY} width={bounds.maxX - bounds.minX} height={bounds.maxY - bounds.minY} rx={SHELL_RULES.fillet - grow} class="face" />
    {#if ir}<rect x={(bounds.minX + bounds.maxX) / 2 - 3} y={outer.y - 0.6} width="6" height="2" rx="0.6" class="port" />{/if}
    <rect x={(bounds.minX + bounds.maxX) / 2 - 4.5} y={outer.y + outer.h - 1.4} width="9" height="2" rx="0.8" class="port" />
    <text x={field.minX} y={bounds.maxY - 11} class="wordmark">Open</text>
    <text x={field.minX} y={bounds.maxY - 4} class="wordmark">Clicker</text>

    {#each design.keys as k (k.id)}
      {@const colour = capColour(k.action)}
      {@const legend = legendOf(k.action, k.label)}
      {@const cw = capWidth(k.w)}
      <g transform={`translate(${k.x} ${k.y})`} class={`key ${colour}`} class:selected={k.id === selected} class:hover={k.id === hover && k.id !== selected}
        class:alert={clashing.has(k.id) || alertKeys.has(k.id)} class:dragging={k.id === dragging}
        onpointerdown={(e) => down(e, k.id)} onpointerenter={() => (hover = k.id)} onpointerleave={() => (hover = null)}
        role="button" tabindex="-1" aria-label={`${k.id} key`}>
        <rect x={-cw / 2} y={-depth / 2 + 0.5} width={cw} height={depth} rx="2" class="side" />
        <rect x={-cw / 2} y={-depth / 2} width={cw} height={depth} rx="2" class="cap" />
        <rect x={-cw / 2 + 1.5} y={-depth / 2 + 1.2} width={cw - 3} height={depth - 3.6} rx="1.4" class="dish" />
        {#if legend.glyph}
          <image href={glyphUrl(legend.glyph, colour === "ivory" ? "oxblood" : "ivory")} x="-3" y="-3.6" width="6" height="6" />
        {:else if legend.text}
          <text y="0.6" class="legend">{legend.text}</text>
        {/if}
        <rect x={-cw / 2 - 1} y={-depth / 2 - 1} width={cw + 2} height={depth + 2.5} rx="2.8" class="outline" />
      </g>
    {/each}

    {#if measure}
      <circle cx={measure.a.x} cy={measure.a.y} r="0.8" class="measure-pt" />
      {#if measure.b}
        <line x1={measure.a.x} y1={measure.a.y} x2={measure.b.x} y2={measure.b.y} class="measure" />
        <circle cx={measure.b.x} cy={measure.b.y} r="0.8" class="measure-pt" />
        <text x={(measure.a.x + measure.b.x) / 2} y={(measure.a.y + measure.b.y) / 2 - 2} class="measure-label">{dist({ a: measure.a, b: measure.b }).toFixed(1)} mm</text>
      {/if}
    {/if}
  </svg>
</div>
  <button class="scale" onclick={() => (userZoom = 1)} title="Fit">{Math.round(zoom * 100)}% · 4 px/mm</button>
</div>

<style>
  .sheet { position: relative; width: 100%; height: 100%; display: flex; overflow: auto; background: var(--viewport); outline: none; }
  .sheet:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
  .sheet[data-tool="add"] svg, .sheet[data-tool="measure"] svg { cursor: crosshair; }
  svg { display: block; touch-action: none; user-select: none; -webkit-user-select: none; flex: none; margin: auto; }
  .wrap { position: relative; width: 100%; height: 100%; }
  .minor { fill: none; stroke: var(--grid-minor); stroke-width: 0.12; }
  .major { fill: none; stroke: var(--grid-major); stroke-width: 0.25; }
  .rim { fill: var(--tray-deep); }
  .face { fill: var(--tray); }
  .port { fill: #2a1419; }
  .wordmark { font-family: var(--font-serif); font-weight: 900; font-size: 7px; fill: var(--on-butter); font-variation-settings: "SOFT" 100, "WONK" 1; }
  .key { cursor: pointer; outline: none; }
  .key.dragging { cursor: grabbing; opacity: 0.85; }
  .key .side { fill: var(--cap-ivory-side); }
  .key .cap { fill: var(--cap-ivory); }
  .key .dish { fill: #000; opacity: 0.035; }
  .key.oxblood .side { fill: var(--cap-oxblood-side); } .key.oxblood .cap { fill: #692b38; } .key.oxblood .dish { fill: #fff; opacity: 0.06; }
  .key.orange .side { fill: var(--cap-orange-side); } .key.orange .cap { fill: #c65d2e; } .key.orange .dish { fill: #fff; opacity: 0.08; }
  .legend { font-family: var(--font-sans); font-weight: 600; font-size: 4.2px; letter-spacing: 0.25px; text-anchor: middle; dominant-baseline: middle; fill: #692b38; pointer-events: none; }
  .key.oxblood .legend, .key.orange .legend { fill: #f7f1e5; }
  .key image { pointer-events: none; }
  .outline { fill: none; stroke: none; }
  .key.hover .outline { stroke: var(--ink); stroke-opacity: 0.5; stroke-width: 0.25; }
  .key.selected .outline { stroke: var(--selection); stroke-width: 0.5; }
  .key.alert .outline { stroke: var(--alert); stroke-width: 0.5; stroke-dasharray: 1.2 0.8; }
  .measure { stroke: var(--accent-text); stroke-width: 0.35; stroke-dasharray: 1 0.6; }
  .measure-pt { fill: var(--accent-text); }
  .measure-label { font-family: var(--font-sans); font-size: 3.6px; font-weight: 600; fill: var(--accent-text); text-anchor: middle; paint-order: stroke; stroke: var(--viewport); stroke-width: 1px; }
  .scale { position: absolute; left: var(--space-3); bottom: var(--space-3); border: 0; font: 500 13px/44px var(--font-sans); color: var(--ink-muted); background: var(--ground-raised); padding: 0 var(--space-2); border-radius: var(--radius-xs); cursor: pointer; }
</style>
