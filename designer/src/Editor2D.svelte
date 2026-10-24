<script lang="ts">
  import { KEYCAPS, type Design } from "./lib/design";
  import { batteryFits, boardBounds, collisions, xiaoPlacement } from "./lib/geometry";
  import { CHOC, XIAO_BOARD } from "./lib/parts-data";

  let { design = $bindable(), selected = $bindable() }: { design: Design; selected: string | null } = $props();
  let svg: SVGSVGElement;
  let drag: { id: string; dx: number; dy: number } | null = null;

  const PAD = 16;
  const bounds = $derived(boardBounds(design));
  const w = $derived(bounds.maxX - bounds.minX);
  const h = $derived(bounds.maxY - bounds.minY);
  const view = $derived(`${bounds.minX - PAD} ${bounds.minY - PAD} ${w + PAD * 2} ${h + PAD * 2}`);
  const clashing = $derived(new Set(collisions(design).flat()));
  const cap = $derived(KEYCAPS[design.keycap]);
  const xiao = $derived(xiaoPlacement(bounds));
  const xiaoBox = $derived({ x: xiao.x - XIAO_BOARD.halfWidth, y: xiao.y + XIAO_BOARD.minX, w: XIAO_BOARD.halfWidth * 2, h: XIAO_BOARD.maxX - XIAO_BOARD.minX });
  const battery = $derived({ x: (bounds.minX + bounds.maxX) / 2 - design.battery.widthMm / 2, y: xiaoBox.y - 2 - design.battery.lengthMm, w: design.battery.widthMm, h: design.battery.lengthMm });
  const batteryOk = $derived(batteryFits(design, bounds));
  const key = $derived(design.keys.find((k) => k.id === selected) ?? null);
  const snap = (v: number) => Math.round(v * 2) / 2;
  const fmt = (v: number) => v.toFixed(1);

  function toDesign(event: PointerEvent): { x: number; y: number } {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const m = svg.getScreenCTM();
    const q = m ? p.matrixTransform(m.inverse()) : p;
    return { x: q.x, y: q.y };
  }
  function start(event: PointerEvent, id: string) {
    const k = design.keys.find((k) => k.id === id);
    if (!k) return;
    selected = id;
    const at = toDesign(event);
    drag = { id, dx: k.x - at.x, dy: k.y - at.y };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag) return;
    const at = toDesign(event);
    const k = design.keys.find((k) => k.id === drag!.id);
    if (k) { k.x = snap(at.x + drag.dx); k.y = snap(at.y + drag.dy); }
  }
  function keydown(event: KeyboardEvent) {
    const k = design.keys.find((k) => k.id === selected);
    if (!k || (event.target as HTMLElement).closest("input,select,textarea")) return;
    const step = event.shiftKey ? 5 : 0.5;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => (k.x -= step), ArrowRight: () => (k.x += step),
      ArrowUp: () => (k.y -= step), ArrowDown: () => (k.y += step),
      r: () => (k.r = Math.min(180, k.r + 5)), e: () => (k.r = Math.max(-180, k.r - 5)),
    };
    const action = moves[event.key];
    if (action) { action(); event.preventDefault(); }
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="sheet">
  <svg bind:this={svg} viewBox={view} onpointermove={move} onpointerup={() => (drag = null)} role="application" aria-label="Key layout editor">
    <defs>
      <pattern id="minor" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" class="grid-minor" /></pattern>
      <pattern id="major" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="url(#minor)" /><path d="M10 0H0V10" class="grid-major" /></pattern>
      <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L6 3L0 6z" class="arrowhead" /></marker>
      <pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V2" class="hatch" /></pattern>
    </defs>
    <rect x={bounds.minX - PAD} y={bounds.minY - PAD} width={w + PAD * 2} height={h + PAD * 2} fill="url(#major)" />

    <rect x={bounds.minX} y={bounds.minY} width={w} height={h} rx="6" class="board" />

    <g class="back">
      <rect x={battery.x} y={battery.y} width={battery.w} height={battery.h} rx="1" class:bad={!batteryOk} fill="url(#hatch)" />
      <text x={battery.x + battery.w / 2} y={battery.y + battery.h / 2} class="tag">LIPO {design.battery.capacityMah}</text>
      <rect x={xiaoBox.x} y={xiaoBox.y} width={xiaoBox.w} height={xiaoBox.h} rx="1" />
      {#each [-1, 1] as side}
        {#each [-3, -2, -1, 0, 1, 2, 3] as i}
          <circle cx={xiao.x + side * XIAO_BOARD.padRow} cy={xiao.y + i * XIAO_BOARD.padPitch} r={XIAO_BOARD.padDiameter / 2} class="pad" />
        {/each}
      {/each}
      <rect x={xiao.x - XIAO_BOARD.usb.width / 2} y={xiaoBox.y + xiaoBox.h - XIAO_BOARD.usb.depth + XIAO_BOARD.usb.overhang} width={XIAO_BOARD.usb.width} height={XIAO_BOARD.usb.depth} class="usb" />
      <text x={xiao.x} y={xiao.y - 2} class="tag">XIAO</text>
    </g>

    {#each design.keys as k (k.id)}
      <g transform={`translate(${k.x} ${k.y}) rotate(${k.r})`} class="key" class:selected={k.id === selected} class:clash={clashing.has(k.id)}
        onpointerdown={(e) => start(e, k.id)} role="button" tabindex="-1" aria-label={k.id}>
        <rect x={-cap.widthMm / 2} y={-cap.depthMm / 2} width={cap.widthMm} height={cap.depthMm} rx="1.6" class="cap" />
        <rect x={-CHOC.base.size / 2} y={-CHOC.base.size / 2} width={CHOC.base.size} height={CHOC.base.size} class="switch" />
        <path d="M-2.5 0H2.5M0 -2.5V2.5" class="centre" />
        {#each CHOC.pins as pin}<circle cx={pin.x} cy={pin.y} r={CHOC.pinDrill / 2} class="pin" />{/each}
        <text y="5.6" class="legend">{k.label || k.action}</text>
      </g>
    {/each}

    <g class="dim">
      <line x1={bounds.minX} y1={bounds.minY - 8} x2={bounds.maxX} y2={bounds.minY - 8} marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <line x1={bounds.minX} y1={bounds.minY - 10} x2={bounds.minX} y2={bounds.minY - 1} /><line x1={bounds.maxX} y1={bounds.minY - 10} x2={bounds.maxX} y2={bounds.minY - 1} />
      <text x={(bounds.minX + bounds.maxX) / 2} y={bounds.minY - 9.5}>{fmt(w)}</text>
      <line x1={bounds.maxX + 8} y1={bounds.minY} x2={bounds.maxX + 8} y2={bounds.maxY} marker-start="url(#arrow)" marker-end="url(#arrow)" />
      <line x1={bounds.maxX + 1} y1={bounds.minY} x2={bounds.maxX + 10} y2={bounds.minY} /><line x1={bounds.maxX + 1} y1={bounds.maxY} x2={bounds.maxX + 10} y2={bounds.maxY} />
      <text x={bounds.maxX + 9.5} y={(bounds.minY + bounds.maxY) / 2} transform={`rotate(90 ${bounds.maxX + 9.5} ${(bounds.minY + bounds.maxY) / 2})`}>{fmt(h)}</text>
    </g>
  </svg>
  <div class="readout">
    {#if key}<span>{key.id.toUpperCase()}</span><span>X {fmt(key.x)}</span><span>Y {fmt(key.y)}</span><span>R {key.r}°</span>
    {:else}<span>TOP VIEW · MM · BACK PARTS DASHED</span>{/if}
  </div>
</div>

<style>
  .sheet { position: relative; width: 100%; height: 100%; min-height: 320px; border: 1px solid var(--rule); background: var(--paper); }
  svg { width: 100%; height: 100%; display: block; touch-action: none; user-select: none; }
  .grid-minor { fill: none; stroke: var(--faint); stroke-width: 0.05; opacity: 0.6; }
  .grid-major { fill: none; stroke: var(--faint); stroke-width: 0.15; }
  .board { fill: color-mix(in srgb, var(--line) 6%, transparent); stroke: var(--ink); stroke-width: 0.35; }
  .back rect, .back circle { fill: none; stroke: var(--line); stroke-width: 0.25; stroke-dasharray: 1.2 0.8; }
  .back rect[fill] { fill: url(#hatch); }
  .back .bad { stroke: var(--error); }
  .back .pad { stroke: var(--copper); stroke-dasharray: none; }
  .back .usb { stroke-dasharray: none; }
  .hatch { stroke: var(--faint); stroke-width: 0.3; }
  .tag { fill: var(--line); font: 2.4px var(--mono); text-anchor: middle; letter-spacing: 0.2px; }
  .key { cursor: grab; outline: none; }
  .key .cap { fill: color-mix(in srgb, var(--paper) 70%, transparent); stroke: var(--ink); stroke-width: 0.35; }
  .key .switch { fill: none; stroke: var(--line); stroke-width: 0.18; stroke-dasharray: 0.8 0.6; }
  .key .centre { stroke: var(--line); stroke-width: 0.2; }
  .key .pin { fill: none; stroke: var(--copper); stroke-width: 0.2; }
  .key .legend { fill: var(--ink); font: 600 2.8px var(--mono); text-anchor: middle; pointer-events: none; text-transform: uppercase; }
  .key.selected .cap { stroke: var(--accent); stroke-width: 0.8; }
  .key.clash .cap { stroke: var(--error); stroke-width: 0.8; fill: color-mix(in srgb, var(--error) 18%, transparent); }
  .dim line { stroke: var(--accent); stroke-width: 0.2; }
  .dim text { fill: var(--accent); font: 3px var(--mono); text-anchor: middle; }
  .arrowhead { fill: var(--accent); }
  .readout { position: absolute; left: 8px; bottom: 8px; display: flex; gap: 10px; font: 11px var(--mono); color: var(--accent); pointer-events: none; }
</style>
