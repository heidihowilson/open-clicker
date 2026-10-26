<script lang="ts">
  import columnSeed from "./seeds/column.json";
  import deckSeed from "./seeds/deck.json";
  import slabSeed from "./seeds/slab.json";
  import tileSeed from "./seeds/tile.json";
  import Editor2D, { type Tool } from "./Editor2D.svelte";
  import Preview3D from "./Preview3D.svelte";
  import { ACTION_INFO, ACTIONS, capColour, glyphUrl, legendOf } from "./lib/actions";
  import { shellGrams, usd } from "./lib/bom";
  import { CHIPS, CHIP_IDS } from "./lib/chips";
  import { check, errorsIn } from "./lib/checks";
  import { DesignSchema, parseDesign, type Design, type Key } from "./lib/design";
  import { keymap, keymapHeader } from "./lib/exports";
  import { cellOf } from "./lib/geometry";
  import { planPins } from "./lib/matrix";
  import { DEFAULT_PRICING, tiers, type Tier } from "./lib/pricing";

  const TEMPLATES: Record<string, Design> = {
    Tile: parseDesign(tileSeed), Slab: parseDesign(slabSeed), Deck: parseDesign(deckSeed), Column: parseDesign(columnSeed),
  };
  const STORE = "open-clicker:layout:v2";
  const THEME = "open-clicker:theme";

  function restore(): Design {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) return DesignSchema.parse(JSON.parse(saved));
    } catch { localStorage.removeItem(STORE); }
    return structuredClone(TEMPLATES.Tile!);
  }

  let design = $state<Design>(restore());
  let selected = $state<string | null>(null);
  let tool = $state<Tool>("select");
  let mode = $state<"2d" | "3d">("2d");
  let level = $state<Tier["id"]>("assembled");
  let assumptions = $state({ ...DEFAULT_PRICING });
  let theme = $state(localStorage.getItem(THEME) === "late-show" ? "late-show" : "ivory");
  let exportOpen = $state(false);
  let notice = $state("");

  const findings = $derived(check(design));
  const errors = $derived(errorsIn(findings));
  const alertKeys = $derived(new Set(findings.filter((f) => f.level === "error" && f.keyId).map((f) => f.keyId!)));
  const plan = $derived(planPins(design));
  const chip = $derived(CHIPS[design.chip]);
  const key = $derived(design.keys.find((k) => k.id === selected) ?? null);
  const options = $derived(tiers(design, assumptions));
  const tier = $derived(options.find((t) => t.id === level) ?? options[0]!);
  const grams = $derived.by(() => { const g = shellGrams(design); return g.shell + g.plate + g.lid; });
  const price = (t: Tier) => t.priceUsd ?? t.costUsd;
  const protocol = $derived(design.options.irTransmit ? "BT + IR" : "BT");
  const ordered = $derived([...design.keys].sort((a, b) => a.y - b.y || a.x - b.x));

  $effect(() => { localStorage.setItem(STORE, JSON.stringify($state.snapshot(design))); });
  $effect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME, theme); });

  const HELP: Record<Tier["id"], string> = { kit: "You solder.", "half-built": "We solder, you print.", assembled: "You click." };

  function useTemplate(name: string) { design = structuredClone(TEMPLATES[name]!); selected = null; }
  function setTool(t: Tool) { tool = t; mode = "2d"; }
  function removeKey(k: Key) {
    if (design.keys.length <= 1) return;
    design.keys = design.keys.filter((x) => x.id !== k.id);
    selected = null;
  }
  function download(name: string, text: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function exportFile(kind: "layout" | "keymap" | "header") {
    const slug = design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    try {
      if (kind === "layout") download(`${slug}.layout.json`, JSON.stringify($state.snapshot(design), null, 2), "application/json");
      if (kind === "keymap") download(`${slug}.keymap.json`, JSON.stringify(keymap(design), null, 2), "application/json");
      if (kind === "header") download("keymap.h", keymapHeader(design), "text/x-c");
      notice = "";
      exportOpen = false;
    } catch (e) { notice = e instanceof Error ? e.message : String(e); }
  }
  async function importFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const parsed = DesignSchema.safeParse(JSON.parse(await file.text()));
    if (parsed.success) { design = parsed.data; selected = null; notice = ""; exportOpen = false; }
    else notice = `That file is not a layout: ${parsed.error.issues[0]?.message ?? "unknown error"}.`;
  }
</script>

<div class="tool">
  <header class="topbar">
    <img class="mark" src="logo/oc-monogram.svg" alt="Open Clicker" width="54" height="36" />
    <input class="name" bind:value={design.name} maxlength="60" aria-label="Layout name" />
    <div class="oc-seg level" role="radiogroup" aria-label="Fulfilment">
      {#each options as t (t.id)}
        <button class="oc-seg-opt" role="radio" aria-checked={t.id === level} title={HELP[t.id]} onclick={() => (level = t.id)}>{t.title}</button>
      {/each}
    </div>
    <span class="oc-badge oc-badge-mono">{protocol}</span>
    <button class="oc-btn theme" onclick={() => (theme = theme === "ivory" ? "late-show" : "ivory")}>{theme === "ivory" ? "Late show" : "Ivory"}</button>
    <div class="export">
      <button class="oc-btn oc-btn-primary" aria-expanded={exportOpen} onclick={() => (exportOpen = !exportOpen)}>Export</button>
      {#if exportOpen}
        <div class="menu" role="menu">
          <button class="oc-btn" role="menuitem" onclick={() => exportFile("layout")}>Layout file</button>
          <button class="oc-btn" role="menuitem" disabled={!!errors.length} title={errors[0]?.message} onclick={() => exportFile("keymap")}>Keymap</button>
          <button class="oc-btn" role="menuitem" disabled={!!errors.length || chip.firmware !== "esp-idf"} title={errors[0]?.message ?? (chip.firmware !== "esp-idf" ? "No firmware for this controller yet." : "")} onclick={() => exportFile("header")}>Firmware keymap.h</button>
          <label class="oc-btn">Open a layout<input type="file" accept="application/json,.json" onchange={importFile} hidden /></label>
          <p class="small">The PCB and the three STL files come next.</p>
          {#if notice}<p class="small alert">{notice}</p>{/if}
        </div>
      {/if}
    </div>
  </header>

  <nav class="rail oc-row-well" aria-label="Tools">
    {#each [["select", "Select"], ["move", "Move"], ["add", "Add key"], ["measure", "Measure"]] as const as [t, name]}
      <button class="oc-key oc-key-dense" aria-pressed={mode === "2d" && tool === t} aria-label={name} title={name} onclick={() => setTool(t)}>
        <img src={glyphUrl(t === "move" ? "move" : t === "add" ? "add" : t, "oxblood")} alt="" width="20" height="20" />
      </button>
    {/each}
    <button class="oc-key oc-key-dense" aria-pressed={mode === "3d"} aria-label="3D view" title="3D view" onclick={() => (mode = "3d")}>
      <img src={glyphUrl("camera", "oxblood")} alt="" width="20" height="20" />
    </button>
  </nav>

  <main class="viewport">
    <div class="modes oc-seg" role="radiogroup" aria-label="View">
      <button class="oc-seg-opt" role="radio" aria-checked={mode === "2d"} onclick={() => (mode = "2d")}>2D</button>
      <button class="oc-seg-opt" role="radio" aria-checked={mode === "3d"} onclick={() => (mode = "3d")}>3D</button>
    </div>
    {#if mode === "2d"}
      <Editor2D bind:design bind:selected {tool} {alertKeys} />
    {:else}
      <Preview3D {design} {theme} />
    {/if}
  </main>

  <aside class="props">
    {#if key}
      {@const cell = cellOf(design, key)}
      <h1>{ACTION_INFO[key.action].name}</h1>
      <p class="meta">key {ordered.indexOf(key) + 1} of {design.keys.length} · column {cell.col}, row {cell.row} · {capColour(key.action)}</p>
      <label class="oc-field">
        <span class="oc-field-label">Does</span>
        <span class="oc-field-well oc-field-sans"><select bind:value={key.action}>{#each ACTIONS as a}<option value={a}>{ACTION_INFO[a].name}</option>{/each}</select></span>
        <span class="oc-field-help">The cap colour follows from this.{ACTION_INFO[key.action].firmware ? "" : " The firmware does not send it yet."}</span>
      </label>
      <label class="oc-field">
        <span class="oc-field-label">Legend</span>
        <span class="oc-field-well"><input bind:value={key.label} maxlength="4" placeholder={legendOf(key.action, "").glyph ? `${legendOf(key.action, "").glyph} (glyph)` : legendOf(key.action, "").text} /></span>
        <span class="oc-field-help">A glyph from the set, or four characters.</span>
      </label>
      <div class="oc-seg size" role="radiogroup" aria-label="Key size">
        {#each [1, 1.5, 2] as const as w}
          <button class="oc-seg-opt" role="radio" aria-checked={key.w === w} onclick={() => (key.w = w)}>{w}u</button>
        {/each}
      </div>
      <div class="oc-field oc-field-readonly"><span class="oc-field-label">Switch</span><span class="oc-field-well oc-field-sans">Kailh Choc V1</span><span class="oc-field-help">Set for the whole layout.</span></div>
      <div class="oc-field oc-field-readonly"><span class="oc-field-label">Pitch</span><span class="oc-field-well">18 × 17<span class="oc-field-unit">mm</span></span></div>
      <div class="oc-field oc-field-readonly"><span class="oc-field-label">Wall here</span><span class="oc-field-well">2.0<span class="oc-field-unit">mm</span></span></div>
      <div class="row">
        <button class="oc-btn" onclick={() => (selected = null)}>Done</button>
        <button class="oc-btn oc-btn-danger" onclick={() => removeKey(key)}>Remove key</button>
      </div>
    {:else}
      <h1>{design.template || "Layout"}</h1>
      <p class="meta">{design.keys.length} keys · {chip.category.toLowerCase()} controller · {protocol}</p>

      <section>
        <h2>Start from</h2>
        <div class="oc-seg" role="radiogroup" aria-label="Template">
          {#each Object.keys(TEMPLATES) as name}
            <button class="oc-seg-opt" role="radio" aria-checked={design.template === name} onclick={() => useTemplate(name)}>{name}</button>
          {/each}
        </div>
      </section>

      <section>
        <h2>Controller</h2>
        <div class="choices">
          {#each CHIP_IDS as id}
            {@const c = CHIPS[id]}
            <button class="choice" aria-pressed={design.chip === id} onclick={() => (design.chip = id)}>
              <b>{c.category}</b><span class="spec">{c.label} · {usd(c.priceUsd)}</span><span>{c.blurb}</span>
            </button>
          {/each}
        </div>
      </section>

      <section>
        <h2>Talks to the TV over</h2>
        <div class="oc-seg" role="radiogroup" aria-label="Protocol">
          <button class="oc-seg-opt" role="radio" aria-checked={!design.options.irTransmit} onclick={() => (design.options.irTransmit = false)}>Bluetooth</button>
          <button class="oc-seg-opt" role="radio" aria-checked={design.options.irTransmit} onclick={() => (design.options.irTransmit = true)}>BT + IR</button>
        </div>
        <p class="small">IR needs line of sight. It adds a 6 × 2 mm window on the top edge.</p>
        <div class="oc-seg" role="radiogroup" aria-label="Learn from an old remote">
          <button class="oc-seg-opt" role="radio" aria-checked={!design.options.irReceive} onclick={() => (design.options.irReceive = false)}>No IR receiver</button>
          <button class="oc-seg-opt" role="radio" aria-checked={design.options.irReceive} onclick={() => (design.options.irReceive = true)}>Learns IR</button>
        </div>
      </section>

      <section>
        <h2>Battery</h2>
        <div class="grid">
          <label class="oc-field"><span class="oc-field-label">Capacity</span><span class="oc-field-well"><input type="number" min="50" max="3000" bind:value={design.battery.capacityMah} /><span class="oc-field-unit">mAh</span></span></label>
          <label class="oc-field"><span class="oc-field-label">Thick</span><span class="oc-field-well"><input type="number" min="2" max="15" step="0.5" bind:value={design.battery.thicknessMm} /><span class="oc-field-unit">mm</span></span></label>
          <label class="oc-field"><span class="oc-field-label">Long</span><span class="oc-field-well"><input type="number" min="10" max="120" bind:value={design.battery.lengthMm} /><span class="oc-field-unit">mm</span></span></label>
          <label class="oc-field"><span class="oc-field-label">Wide</span><span class="oc-field-well"><input type="number" min="5" max="60" bind:value={design.battery.widthMm} /><span class="oc-field-unit">mm</span></span></label>
        </div>
        <div class="oc-seg" role="radiogroup" aria-label="Battery level">
          <button class="oc-seg-opt" role="radio" aria-checked={design.options.batterySense} onclick={() => (design.options.batterySense = true)}>Reports battery level</button>
          <button class="oc-seg-opt" role="radio" aria-checked={!design.options.batterySense} onclick={() => (design.options.batterySense = false)}>Doesn't</button>
        </div>
      </section>

      <section>
        <h2>Keycaps</h2>
        <div class="oc-seg" role="radiogroup" aria-label="Keycaps">
          <button class="oc-seg-opt" role="radio" aria-checked={design.keycap === "choc-mcc"} onclick={() => (design.keycap = "choc-mcc")}>MoErgo MCC</button>
          <button class="oc-seg-opt" role="radio" aria-checked={design.keycap === "choc-mbk"} onclick={() => (design.keycap = "choc-mbk")}>MBK</button>
        </div>
      </section>

      <section>
        <h2>{tier.title} · {usd(price(tier))}</h2>
        <p class="small">{tier.summary} {HELP[tier.id]}</p>
        <table class="bom">
          <tbody>
            {#each tier.lines as line}
              <tr title={line.basis}><td>{line.label}<small>{line.basis}</small></td><td class="n">{line.qty} × {usd(line.unitUsd)}</td><td class="n">{usd(line.qty * line.unitUsd)}</td></tr>
            {/each}
          </tbody>
          <tfoot>
            {#if tier.priceUsd === null}
              <tr><td colspan="2">You pay, per remote</td><td class="n">{usd(tier.costUsd)}</td></tr>
            {:else}
              <tr class="muted"><td colspan="2">Our cost</td><td class="n">{usd(tier.costUsd)}</td></tr>
              <tr><td colspan="2">Price at {Math.round(assumptions.margin * 100)}% margin</td><td class="n">{usd(tier.priceUsd)}</td></tr>
            {/if}
            {#if tier.extraUsd > 0}<tr class="muted"><td colspan="2">{tier.extraNote}</td><td class="n">{usd(tier.extraUsd)}</td></tr>{/if}
          </tfoot>
        </table>
        {#if tier.priceUsd !== null}
          <div class="grid three">
            <label class="oc-field"><span class="oc-field-label">Batch</span><span class="oc-field-well"><input type="number" min="5" max="5000" step="5" bind:value={assumptions.batch} /></span></label>
            <label class="oc-field"><span class="oc-field-label">Margin</span><span class="oc-field-well"><input type="number" min="0" max="90" step="5" value={Math.round(assumptions.margin * 100)}
              oninput={(e) => (assumptions.margin = Math.min(0.9, Math.max(0, Number(e.currentTarget.value) / 100)))} /><span class="oc-field-unit">%</span></span></label>
            <label class="oc-field"><span class="oc-field-label">Labour</span><span class="oc-field-well"><input type="number" min="0" max="200" step="5" bind:value={assumptions.laborUsdPerHour} /><span class="oc-field-unit">$/h</span></span></label>
          </div>
        {/if}
        <p class="small">Estimates before shipping and tax. Hover a line for where its number comes from.</p>
      </section>

      <section>
        <h2>Checks</h2>
        <ul class="checks">
          {#each findings as f}<li><span class="oc-badge" class:oc-badge-alert={f.level === "error"} class:oc-badge-ok={f.level === "info"} class:oc-badge-accent={f.level === "warning"}>{f.badge}</span> {f.message}</li>{/each}
        </ul>
      </section>

      {#if plan.ok}
        <section>
          <h2>Pins</h2>
          <dl class="pins">
            <dt>Columns</dt><dd>{plan.columns.map((p) => `${p.id} (${p.chipPin})`).join(", ")}</dd>
            <dt>Rows</dt><dd>{plan.rows.map((p) => `${p.id} (${p.chipPin})`).join(", ")}</dd>
            {#if plan.battery}<dt>Battery</dt><dd>{plan.battery.id} ({plan.battery.chipPin})</dd>{/if}
            {#if plan.irTransmit}<dt>IR out</dt><dd>{plan.irTransmit.id} ({plan.irTransmit.chipPin})</dd>{/if}
            {#if plan.irReceive}<dt>IR in</dt><dd>{plan.irReceive.id} ({plan.irReceive.chipPin})</dd>{/if}
          </dl>
        </section>
      {/if}
    {/if}
  </aside>

  <footer class="status">
    <div class="badges">
      {#each errors as f}<span class="oc-badge oc-badge-alert" title={f.message}>{f.badge}</span>{/each}
      {#if !errors.length}
        {#each findings.filter((f) => f.badge === "Prints without supports" || f.badge === "Routed") as f}<span class="oc-badge oc-badge-ok" title={f.message}>{f.badge}</span>{/each}
        <span class="oc-badge oc-badge-ok">Ready to export</span>
      {/if}
    </div>
    <span class="summary">{design.template || "Layout"} · {design.keys.length} keys · {Math.round(grams)} g est. · {tier.title} {usd(price(tier))}</span>
  </footer>
</div>

<style>
  :global(html), :global(body) { height: 100%; }
  :global(body) { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--font-serif); font-variation-settings: "SOFT" 100, "WONK" 1; }
  :global(*) { box-sizing: border-box; }
  .tool { display: grid; height: 100dvh; grid-template-columns: 72px 1fr 340px; grid-template-rows: 56px 1fr 32px;
    grid-template-areas: "top top top" "rail view props" "status status status"; }
  .topbar { grid-area: top; display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-4); background: var(--ground-raised); border-bottom: 1px solid var(--line); }
  .mark { height: 32px; width: auto; }
  .name { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--ink); font: 700 24px/32px var(--font-serif); font-variation-settings: "SOFT" 100, "WONK" 1; padding: 0; outline: none; }
  .name:focus-visible { box-shadow: var(--focus-ring); border-radius: var(--radius-xs); }
  .export { position: relative; }
  .menu { position: absolute; right: 0; top: 48px; z-index: 10; width: 240px; display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
    background: var(--ground-raised); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-float); }
  .menu .oc-btn { justify-content: flex-start; }
  .rail { grid-area: rail; display: flex; flex-direction: column; gap: var(--space-2); margin: var(--space-2); padding: var(--space-2); align-items: center; align-self: start; border-radius: var(--radius-md); }
  .rail img { display: block; pointer-events: none; }
  .viewport { grid-area: view; position: relative; min-width: 0; min-height: 0; border-left: 1px solid var(--line); }
  .modes { position: absolute; left: var(--space-3); top: var(--space-3); z-index: 5; }
  .props { grid-area: props; overflow: auto; background: var(--ground-raised); border-left: 1px solid var(--line); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4); }
  h1 { margin: 0; font: 700 36px/40px var(--font-serif); font-variation-settings: "SOFT" 100, "WONK" 1; }
  h2 { margin: 0 0 var(--space-2); font: 600 12px/16px var(--font-sans); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted); }
  .meta { margin: calc(-1 * var(--space-3)) 0 0; font-size: 15px; color: var(--ink-muted); }
  section { display: flex; flex-direction: column; gap: var(--space-2); border-top: 1px solid var(--line); padding-top: var(--space-3); }
  .oc-field { min-width: 0; }
  .oc-field-well select { flex: 1; border: 0; background: transparent; font: inherit; color: inherit; outline: none; }
  .oc-seg { flex-wrap: wrap; }
  .size { align-self: flex-start; }
  .row { display: flex; gap: var(--space-2); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
  .grid.three { grid-template-columns: repeat(3, 1fr); }
  .small { margin: 0; font-size: 14px; line-height: 20px; color: var(--ink-muted); }
  .small.alert { color: var(--alert); }
  .choices { display: flex; flex-direction: column; gap: var(--space-2); }
  .choice { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: var(--space-2) var(--space-3); border: 0; border-radius: var(--radius-key);
    background: var(--cap-ivory); color: var(--on-cap-ivory); box-shadow: var(--shadow-cap-ivory); font: 400 14px/20px var(--font-serif); cursor: pointer;
    transition: transform 120ms ease-out, box-shadow 120ms ease-out; }
  .choice b { font: 700 17px/22px var(--font-serif); }
  .choice .spec { font: 600 12px/16px var(--font-sans); letter-spacing: 0.04em; opacity: 0.75; }
  /* Pressed like a key, with the selection outline; the cap keeps its colour so text stays legible in both themes. */
  .choice[aria-pressed="true"] { transform: translateY(2px); box-shadow: inset 0 0 0 2px var(--selection); }
  .choice:focus-visible { outline: none; box-shadow: var(--shadow-cap-ivory), var(--focus-ring); }
  .bom { width: 100%; border-collapse: collapse; font-size: 14px; }
  .bom td { padding: 6px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
  .bom td small { display: block; font: 500 12px/16px var(--font-sans); color: var(--ink-muted); }
  .bom .n { text-align: right; white-space: nowrap; padding-left: var(--space-2); font: 500 14px/20px var(--font-sans); }
  .bom tfoot td { font-weight: 700; border-bottom: none; }
  .bom tfoot .muted td { font-weight: 400; color: var(--ink-muted); }
  .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); font-size: 14px; line-height: 20px; }
  .pins { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px var(--space-3); font: 500 13px/20px var(--font-sans); }
  .pins dt { color: var(--ink-muted); }
  .pins dd { margin: 0; }
  .status { grid-area: status; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: 0 var(--space-4); background: var(--ground-raised); border-top: 1px solid var(--line); }
  .badges { display: flex; gap: var(--space-2); overflow-x: auto; min-width: 0; }
  .summary { font-size: 14px; white-space: nowrap; color: var(--ink); }

  @media (max-width: 900px) {
    .tool { height: auto; min-height: 100dvh; grid-template-columns: 1fr; grid-template-rows: auto auto 62vh auto auto;
      grid-template-areas: "top" "rail" "view" "props" "status"; }
    .topbar { flex-wrap: wrap; padding: var(--space-2) var(--space-3); gap: var(--space-2); }
    .name { font-size: 20px; flex-basis: 50%; }
    .level { order: 5; width: 100%; justify-content: stretch; }
    .level .oc-seg-opt { flex: 1; padding: 0 var(--space-2); }
    .theme { display: none; }
    .rail { flex-direction: row; margin: var(--space-2) var(--space-3) 0; justify-content: center; align-self: stretch; }
    .viewport { border-left: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
    .props { border-left: 0; }
    .status { flex-wrap: wrap; padding: var(--space-2) var(--space-3); }
    .summary { white-space: normal; font-size: 13px; }
  }
</style>
