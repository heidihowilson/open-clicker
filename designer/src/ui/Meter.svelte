<script lang="ts">
  /* "11 of 24 keys": a thin bar in the well colour, ok or alert. */
  let { used, of, label }: { used: number; of: number; label: string } = $props();
  const over = $derived(used > of);
</script>

<div class="meter" class:over>
  <span class="text"><b>{used}</b> of {of} {label}</span>
  <span class="bar" aria-hidden="true"><span style={`width:${Math.min(100, (used / Math.max(of, 1)) * 100)}%`}></span></span>
</div>

<style>
  .meter { display: flex; flex-direction: column; gap: 6px; }
  .text { font: 500 14px/20px var(--font-sans); color: var(--ink-muted); }
  .text b { color: var(--ink); }
  .bar { height: 6px; border-radius: 3px; background: var(--well); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--ok); border-radius: 3px; }
  .over .bar span { background: var(--alert); }
  .over .text b { color: var(--alert); }
</style>
