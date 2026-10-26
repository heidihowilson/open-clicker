<script lang="ts" module>
  export type TabId = "keys" | "parts" | "build";
  export type Detent = "collapsed" | "half" | "full";
</script>

<script lang="ts">
  import type { Snippet } from "svelte";

  /* One component, two layouts: a side column at 760 px and up, a bottom sheet below. The tab
   * content never needs to know which one it is in. */
  let { tab = $bindable(), detent = $bindable(), compact, counts, children }: {
    tab: TabId; detent: Detent; compact: boolean; counts: Partial<Record<TabId, { n: number; alert: boolean }>>; children: Snippet;
  } = $props();

  const TABS: [TabId, string][] = [["keys", "Keys"], ["parts", "Parts"], ["build", "Build"]];
  const COLLAPSED = 84;
  let host: HTMLElement;
  let drag = $state<{ y: number; height: number; moved: boolean } | null>(null);
  let live = $state<number | null>(null);

  const heightFor = (d: Detent) => d === "collapsed" ? COLLAPSED : d === "half" ? Math.round(innerHeight * 0.5) : innerHeight - 48;

  function choose(t: TabId) {
    tab = t;
    if (compact && detent === "collapsed") detent = "half";
  }
  function handleDown(event: PointerEvent) {
    drag = { y: event.clientY, height: host.getBoundingClientRect().height, moved: false };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }
  function handleMove(event: PointerEvent) {
    if (!drag) return;
    const dy = drag.y - event.clientY;
    if (Math.abs(dy) > 6) drag.moved = true;
    if (drag.moved) live = Math.min(innerHeight - 48, Math.max(COLLAPSED, drag.height + dy));
  }
  function handleUp() {
    if (!drag) return;
    if (!drag.moved) detent = detent === "collapsed" ? "half" : detent === "half" ? "full" : "collapsed";
    else if (live !== null) {
      const all: Detent[] = ["collapsed", "half", "full"];
      const h = live;
      detent = all.reduce((best, d) => Math.abs(heightFor(d) - h) < Math.abs(heightFor(best) - h) ? d : best, "collapsed" as Detent);
    }
    drag = null; live = null;
  }
</script>

<aside class="panel" class:sheet={compact} bind:this={host} data-detent={detent}
  style={compact && live !== null ? `height:${live}px;transition:none` : ""}>
  {#if compact}
    <button class="handle" aria-label={detent === "collapsed" ? "Open the panel" : "Resize the panel"}
      onpointerdown={handleDown} onpointermove={handleMove} onpointerup={handleUp} onpointercancel={handleUp}><span></span></button>
  {/if}
  <div class="tabs oc-seg oc-seg-fill" role="tablist" aria-label="Panel">
    {#each TABS as [id, name]}
      {@const c = counts[id]}
      <button class="oc-seg-opt" role="tab" aria-selected={tab === id} onclick={() => choose(id)}>
        {name}{#if c && c.n}<span class="count" class:alert={c.alert}>{c.n}</span>{/if}
      </button>
    {/each}
  </div>
  <div class="body" hidden={compact && detent === "collapsed"}>
    {@render children()}
  </div>
</aside>

<style>
  .panel { display: flex; flex-direction: column; min-height: 0; background: var(--ground-raised); border-left: 1px solid var(--line); }
  .tabs { margin: var(--space-3) var(--space-3) 0; flex: none; }
  .count { display: inline-block; margin-left: 6px; min-width: 18px; padding: 0 4px; border-radius: 9px; background: var(--well); color: var(--ink-muted);
    font: 600 11px/18px var(--font-sans); text-align: center; }
  .count.alert { background: var(--alert-soft); color: var(--alert); }
  .body { --pad: var(--space-4); flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: var(--pad); display: flex; flex-direction: column; gap: var(--space-4); }
  .body[hidden] { display: none; }

  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; border-left: 0; border-top: 1px solid var(--line);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0; box-shadow: var(--shadow-float);
    height: 84px; transition: height 200ms ease-out; padding-bottom: env(safe-area-inset-bottom); }
  .sheet[data-detent="half"] { height: 50dvh; }
  .sheet[data-detent="full"] { height: calc(100dvh - 48px); }
  .sheet .tabs { margin-top: 0; }
  .sheet .body { --pad: var(--space-3); }
  .handle { flex: none; display: flex; justify-content: center; align-items: center; height: 28px; width: 100%; border: 0; background: transparent; cursor: grab; touch-action: none; padding: 0; }
  .handle span { width: 40px; height: 4px; border-radius: 2px; background: var(--line-strong); }
  @media (prefers-reduced-motion: reduce) { .sheet { transition: none; } }
</style>
