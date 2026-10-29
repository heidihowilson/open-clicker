<script lang="ts">
  import columnSeed from "./seeds/column.json";
  import deckSeed from "./seeds/deck.json";
  import slabSeed from "./seeds/slab.json";
  import tileSeed from "./seeds/tile.json";
  import Editor2D, { type Tool } from "./Editor2D.svelte";
  import Preview3D from "./Preview3D.svelte";
  import Panel, { type Detent, type TabId } from "./ui/Panel.svelte";
  import Keys from "./panels/Keys.svelte";
  import Parts from "./panels/Parts.svelte";
  import Build, { type ExportKind } from "./panels/Build.svelte";
  import { glyphUrl } from "./lib/actions";
  import { usd } from "./lib/bom";
  import { CHIPS } from "./lib/chips";
  import { check, errorsIn } from "./lib/checks";
  import { newDesignId, parseDesign, safeParseDesign, type Design, type TemplateId } from "./lib/design";
  import { keymap, layoutFile } from "./lib/exports";
  import { planPins } from "./lib/matrix";
  import { keyCapacity } from "./lib/netlist";
  import { DEFAULT_PRICING, tiers, type Tier } from "./lib/pricing";

  const SEEDS: Record<Exclude<TemplateId, "custom">, Design> = {
    tile: parseDesign(tileSeed), slab: parseDesign(slabSeed), deck: parseDesign(deckSeed), column: parseDesign(columnSeed),
  };
  const TEMPLATE_NAMES: [TemplateId, string][] = [["tile", "Tile"], ["slab", "Slab"], ["deck", "Deck"], ["column", "Column"]];
  const STORE = "open-clicker:layout:v3";
  const OLD_STORE = "open-clicker:layout:v2";
  const THEME = "open-clicker:theme";

  const fresh = (t: Exclude<TemplateId, "custom">): Design => ({ ...structuredClone(SEEDS[t]), id: newDesignId() });
  function restore(): Design {
    for (const name of [STORE, OLD_STORE]) {
      try {
        const saved = localStorage.getItem(name);
        if (saved) { localStorage.removeItem(OLD_STORE); return parseDesign(JSON.parse(saved)); }
      } catch { localStorage.removeItem(name); }
    }
    return fresh("tile");
  }

  /* Breakpoints from docs/ui-system.md: compact under 760 px, wide from 1 100 px. */
  const compactQuery = matchMedia("(max-width: 759px)");
  const wideQuery = matchMedia("(min-width: 1100px)");
  let compact = $state(compactQuery.matches);
  let wide = $state(wideQuery.matches);
  compactQuery.addEventListener("change", (e) => (compact = e.matches));
  wideQuery.addEventListener("change", (e) => (wide = e.matches));

  let design = $state<Design>(restore());
  let selected = $state<string | null>(null);
  let tool = $state<Tool>("select");
  let mode = $state<"2d" | "3d">("2d");
  let tab = $state<TabId>("keys");
  let detent = $state<Detent>("collapsed");
  let before: Detent | null = null;
  let level = $state<Tier["id"]>("assembled");
  let assumptions = $state({ ...DEFAULT_PRICING });
  let theme = $state(localStorage.getItem(THEME) === "late-show" ? "late-show" : "ivory");
  let notice = $state("");

  const findings = $derived(check(design));
  const errors = $derived(errorsIn(findings));
  const warnings = $derived(findings.filter((f) => f.level === "warning").length);
  const alertKeys = $derived(new Set(findings.filter((f) => f.level === "error" && f.keyId).map((f) => f.keyId!)));
  const plan = $derived(planPins(design));
  const capacity = $derived(keyCapacity(design));
  const options = $derived(tiers(design, assumptions));
  const tier = $derived(options.find((t) => t.id === level) ?? options[0]!);

  $effect(() => { localStorage.setItem(STORE, JSON.stringify($state.snapshot(design))); });
  $effect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME, theme); });

  function open(t: TabId, anchor?: string) {
    tab = t;
    if (compact && detent === "collapsed") detent = "half";
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  /* Selecting a key opens its inspector; on a phone the sheet rises to half and Done puts it back. */
  function pick(id: string) {
    selected = id;
    tab = "keys";
    if (compact) {
      if (before === null) before = detent;
      if (detent === "collapsed") detent = "half";
    }
  }
  function done() {
    if (compact && before !== null) detent = before;
    before = null;
  }
  function useTemplate(t: TemplateId) {
    if (t === "custom") return;
    const seed = fresh(t), now = $state.snapshot(design) as Design;
    const kept = { ...seed, id: now.id, revision: now.revision, chip: now.chip, keycap: now.keycap, options: now.options, battery: now.battery };
    design = planPins(kept).ok ? kept : { ...seed, id: now.id, revision: now.revision };
    selected = null;
  }
  function download(name: string, text: string | Uint8Array<ArrayBuffer>, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function exportFile(kind: ExportKind) {
    const slug = design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    try {
      const d = $state.snapshot(design) as Design;
      if (kind === "layout") download(`${slug}.layout.json`, layoutFile(d), "application/json");
      if (kind === "keymap") download(`${slug}.keymap.json`, JSON.stringify(keymap(d), null, 2), "application/json");
      design.revision += 1;
      notice = "";
    } catch (e) { notice = e instanceof Error ? e.message : String(e); }
  }
  async function importFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    let json: unknown;
    try { json = JSON.parse(await file.text()); } catch { notice = "That file is not JSON."; return; }
    const parsed = safeParseDesign(json);
    if (parsed.success) { design = parsed.data; selected = null; notice = ""; }
    else notice = `That file is not a layout: ${parsed.error.issues[0]?.message ?? "unknown error"}.`;
  }
  function showKey(id: string) { mode = "2d"; pick(id); }
</script>

<div class="tool" class:compact class:wide style={compact ? `--sheet:${detent === "collapsed" ? "84px" : "50dvh"}` : ""}>
  <header class="topbar">
    <img class="mark" src="logo/oc-monogram.svg" alt="Open Clicker" width="42" height="28" />
    <input class="name" bind:value={design.name} maxlength="60" aria-label="Layout name" />
    {#if !compact}
      <button class="chip" onclick={() => open("build", "build-price")}>{tier.title} · {usd(tier.priceUsd ?? tier.costUsd)}</button>
    {/if}
    <button class="chip status" onclick={() => open("build", "build-checks")}>
      <span class="oc-badge" class:oc-badge-ok={!errors.length} class:oc-badge-alert={!!errors.length}>{errors.length ? `${errors.length} ${errors.length === 1 ? "problem" : "problems"}` : "Ready"}</span>
    </button>
    {#if wide}
      <button class="oc-key oc-key-dense icon" aria-label={theme === "ivory" ? "Late show theme" : "Ivory theme"} title="Theme" onclick={() => (theme = theme === "ivory" ? "late-show" : "ivory")}>{theme === "ivory" ? "☾" : "☀"}</button>
    {/if}
    <button class="oc-btn oc-btn-primary export" aria-label="Export" onclick={() => open("build", errors.length ? "build-checks" : "build-export")}>
      {#if compact}⇩{:else}Export{/if}
    </button>
  </header>

  {#if wide}
    <nav class="rail oc-row-well" aria-label="Tools">
      {#each [["select", "Select"], ["add", "Add key"], ["measure", "Measure"]] as const as [t, name]}
        <button class="oc-key oc-key-dense" aria-pressed={mode === "2d" && tool === t} aria-label={name} title={name} onclick={() => { tool = t; mode = "2d"; }}>
          <img src={glyphUrl(t, "oxblood")} alt="" width="20" height="20" />
        </button>
      {/each}
      <button class="oc-key oc-key-dense" aria-pressed={mode === "3d"} aria-label="3D view" title="3D view" onclick={() => (mode = "3d")}>
        <img src={glyphUrl("camera", "oxblood")} alt="" width="20" height="20" />
      </button>
    </nav>
  {/if}

  <main class="viewport">
    <div class="modes oc-seg" role="radiogroup" aria-label="View">
      <button class="oc-seg-opt" role="radio" aria-checked={mode === "2d"} onclick={() => (mode = "2d")}>2D</button>
      <button class="oc-seg-opt" role="radio" aria-checked={mode === "3d"} onclick={() => (mode = "3d")}>3D</button>
    </div>
    {#if mode === "2d"}
      <Editor2D bind:design bind:selected bind:tool {alertKeys} onPick={pick} />
      {#if !wide}
        <button class="oc-key add" class:oc-key-oxblood={tool !== "add"} aria-pressed={tool === "add"} aria-label={tool === "add" ? "Cancel adding a key" : "Add key"}
          onclick={() => (tool = tool === "add" ? "select" : "add")}>
          <img src={glyphUrl("add", tool === "add" ? "oxblood" : "ivory")} alt="" width="22" height="22" />
        </button>
        {#if tool === "add"}<span class="oc-badge oc-badge-accent add-hint">Tap a cell for the new key</span>{/if}
      {/if}
    {:else}
      <Preview3D {design} {theme} />
    {/if}
  </main>

  <Panel bind:tab bind:detent {compact} counts={{ build: { n: errors.length || warnings, alert: !!errors.length } }}>
    {#if tab === "keys"}
      <Keys bind:design bind:selected {plan} {findings} {capacity} templates={TEMPLATE_NAMES} onTemplate={useTemplate} onDone={done} />
    {:else if tab === "parts"}
      <Parts bind:design />
    {:else}
      <Build {design} bind:level bind:assumptions {options} {findings} bind:theme {notice} onExport={exportFile} onImport={importFile} onShowKey={showKey} />
    {/if}
  </Panel>
</div>

<style>
  :global(html), :global(body) { height: 100%; }
  :global(body) { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--font-serif); font-variation-settings: "SOFT" 100, "WONK" 1; overflow: hidden; }
  :global(*) { box-sizing: border-box; }

  /* Medium is the base: viewport and a 320 px panel. Wide adds the rail; compact turns the panel into a sheet. */
  .tool { display: grid; height: 100dvh; grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: 56px minmax(0, 1fr);
    grid-template-areas: "top top" "view panel"; }
  .tool.wide { grid-template-columns: 64px minmax(0, 1fr) 360px; grid-template-areas: "top top top" "rail view panel"; }
  .tool.compact { grid-template-columns: minmax(0, 1fr); grid-template-rows: 48px minmax(0, 1fr) var(--sheet, 84px); grid-template-areas: "top" "view" "."; }
  .tool > :global(.panel) { grid-area: panel; }

  .topbar { grid-area: top; display: flex; align-items: center; gap: var(--space-2); min-width: 0; padding: 0 var(--space-3); background: var(--ground-raised); border-bottom: 1px solid var(--line); }
  .mark { height: 28px; width: auto; flex: none; }
  .name { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink); font: 700 22px/32px var(--font-serif); font-variation-settings: "SOFT" 100, "WONK" 1;
    padding: 0; height: 44px; outline: none; text-overflow: ellipsis; }
  .compact .name { font-size: 18px; }
  .name:focus-visible { box-shadow: var(--focus-ring); border-radius: var(--radius-xs); }
  .chip { flex: none; display: inline-flex; align-items: center; min-height: 44px; padding: 0 var(--space-2); border: 0; background: transparent; color: var(--ink);
    font: 500 14px/20px var(--font-sans); cursor: pointer; border-radius: var(--radius-sm); }
  .chip:hover { background: var(--well); }
  .chip:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .status { padding: 0 var(--space-1); }
  .icon { flex: none; font-size: 18px; }
  .export { flex: none; }
  .compact .export { width: 44px; justify-content: center; padding: 0; font-size: 20px; }

  .rail { grid-area: rail; display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-2); padding: var(--space-2); align-items: center; align-self: start; border-radius: var(--radius-md); }
  .rail img { display: block; pointer-events: none; }
  .viewport { grid-area: view; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
  .modes { position: absolute; left: var(--space-3); top: var(--space-3); z-index: 5; }
  .add { position: absolute; right: var(--space-3); bottom: var(--space-3); z-index: 5; width: 52px; height: 52px; }
  .add img { display: block; pointer-events: none; }
  .add-hint { position: absolute; right: var(--space-3); bottom: 76px; z-index: 5; pointer-events: none; }
</style>
