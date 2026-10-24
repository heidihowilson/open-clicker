<script lang="ts">
  import { KEYCAPS, type Design } from "./lib/design";
  import { batteryFits, boardBounds, collisions, XIAO, xiaoPlacement } from "./lib/geometry";

  let { design = $bindable(), selected = $bindable() }: { design: Design; selected: string | null } = $props();
  let svg: SVGSVGElement;
  let drag: { id: string; dx: number; dy: number } | null = null;

  const bounds = $derived(boardBounds(design));
  const view = $derived(`${bounds.minX - 12} ${bounds.minY - 12} ${bounds.maxX - bounds.minX + 24} ${bounds.maxY - bounds.minY + 24}`);
  const clashing = $derived(new Set(collisions(design).flat()));
  const cap = $derived(KEYCAPS[design.keycap]);
  const xiao = $derived(xiaoPlacement(bounds));
  const snap = (v: number) => Math.round(v * 2) / 2;

  function toDesign(event: PointerEvent): { x: number; y: number } {
    const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
    const m = svg.getScreenCTM();
    const q = m ? p.matrixTransform(m.inverse()) : p;
    return { x: q.x, y: q.y };
  }
  function start(event: PointerEvent, id: string) {
    const key = design.keys.find((k) => k.id === id);
    if (!key) return;
    selected = id;
    const at = toDesign(event);
    drag = { id, dx: key.x - at.x, dy: key.y - at.y };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    if (!drag) return;
    const at = toDesign(event);
    const key = design.keys.find((k) => k.id === drag!.id);
    if (key) { key.x = snap(at.x + drag.dx); key.y = snap(at.y + drag.dy); }
  }
  function keydown(event: KeyboardEvent) {
    const key = design.keys.find((k) => k.id === selected);
    if (!key || (event.target as HTMLElement).closest("input,select,textarea")) return;
    const step = event.shiftKey ? 5 : 0.5;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => (key.x -= step), ArrowRight: () => (key.x += step),
      ArrowUp: () => (key.y -= step), ArrowDown: () => (key.y += step),
      r: () => (key.r = Math.min(180, key.r + 5)), e: () => (key.r = Math.max(-180, key.r - 5)),
    };
    const action = moves[event.key];
    if (action) { action(); event.preventDefault(); }
  }
</script>

<svelte:window onkeydown={keydown} />

<svg bind:this={svg} viewBox={view} onpointermove={move} onpointerup={() => (drag = null)} role="application" aria-label="Key layout editor">
  <rect x={bounds.minX} y={bounds.minY} width={bounds.maxX - bounds.minX} height={bounds.maxY - bounds.minY} rx="6" class="board" />
  <rect x={xiao.x - XIAO.widthMm / 2} y={xiao.y - XIAO.lengthMm / 2} width={XIAO.widthMm} height={XIAO.lengthMm} class="back" />
  <text x={xiao.x} y={xiao.y} class="note">XIAO (back)</text>
  <rect x={(bounds.minX + bounds.maxX) / 2 - design.battery.widthMm / 2} y={xiao.y - XIAO.lengthMm / 2 - 2 - design.battery.lengthMm}
    width={design.battery.widthMm} height={design.battery.lengthMm} class="back" class:bad={!batteryFits(design, bounds)} />
  {#each design.keys as key (key.id)}
    <g transform={`translate(${key.x} ${key.y}) rotate(${key.r})`} class="key" class:selected={key.id === selected} class:clash={clashing.has(key.id)}
      onpointerdown={(e) => start(e, key.id)} role="button" tabindex="-1" aria-label={key.id}>
      <rect x={-cap.widthMm / 2} y={-cap.depthMm / 2} width={cap.widthMm} height={cap.depthMm} rx="2" />
      <text y="1.5">{key.label || key.action}</text>
    </g>
  {/each}
</svg>

<style>
  svg { width: 100%; height: 100%; min-height: 320px; background: #0e1411; border-radius: 12px; touch-action: none; user-select: none; }
  .board { fill: #1f5e3a; stroke: #3c8f5f; stroke-width: 0.4; }
  .back { fill: none; stroke: #9fb3a7; stroke-dasharray: 1.5 1.2; stroke-width: 0.35; }
  .back.bad { stroke: #ff6b5b; }
  .note { fill: #9fb3a7; font-size: 2.6px; text-anchor: middle; }
  .key { cursor: grab; outline: none; }
  .key rect { fill: #efe6d2; stroke: #1d2420; stroke-width: 0.4; }
  .key text { font-size: 4.2px; text-anchor: middle; fill: #1d2420; font-weight: 700; pointer-events: none; }
  .key.selected rect { stroke: #3a6cff; stroke-width: 0.9; }
  .key.clash rect { fill: #ffb3a8; stroke: #d9483b; }
</style>
