<script lang="ts">
  import classicSeed from "./seeds/classic.json";
  import arcSeed from "./seeds/thumb-arc.json";
  import Editor2D from "./Editor2D.svelte";
  import Preview3D from "./Preview3D.svelte";
  import { CHIPS, CHIP_IDS } from "./lib/chips";
  import { check } from "./lib/checks";
  import { ACTIONS, DesignSchema, SHELLS, parseDesign, type Design } from "./lib/design";
  import { keymap, keymapHeader } from "./lib/exports";
  import { planPins } from "./lib/matrix";

  const SEEDS: Record<string, Design> = { classic: parseDesign(classicSeed), "thumb-arc": parseDesign(arcSeed) };
  const STORE = "open-remote-designer:v1";

  function restore(): Design {
    try {
      const saved = localStorage.getItem(STORE);
      if (saved) return DesignSchema.parse(JSON.parse(saved));
    } catch { localStorage.removeItem(STORE); }
    return structuredClone(SEEDS.classic!);
  }

  let design = $state<Design>(restore());
  let selected = $state<string | null>(null);
  let notice = $state("");

  const findings = $derived(check(design));
  const plan = $derived(planPins(design));
  const chip = $derived(CHIPS[design.chip]);
  const key = $derived(design.keys.find((k) => k.id === selected) ?? null);
  const errors = $derived(findings.filter((f) => f.level === "error").length);

  $effect(() => { localStorage.setItem(STORE, JSON.stringify($state.snapshot(design))); });

  function load(name: string) { design = structuredClone(SEEDS[name]!); selected = null; }
  function addKey() {
    let n = design.keys.length + 1;
    while (design.keys.some((k) => k.id === `key-${n}`)) n++;
    const lowest = Math.max(...design.keys.map((k) => k.y));
    design.keys.push({ id: `key-${n}`, x: 0, y: lowest + 19, r: 0, action: "none", label: "" });
    selected = `key-${n}`;
  }
  function removeKey() {
    if (!selected || design.keys.length <= 1) return;
    design.keys = design.keys.filter((k) => k.id !== selected);
    selected = null;
  }
  function download(name: string, text: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function exportFile(kind: "design" | "keymap" | "header") {
    const slug = design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    try {
      if (kind === "design") download(`${slug}.design.json`, JSON.stringify($state.snapshot(design), null, 2), "application/json");
      if (kind === "keymap") download(`${slug}.keymap.json`, JSON.stringify(keymap(design), null, 2), "application/json");
      if (kind === "header") download("keymap.h", keymapHeader(design), "text/x-c");
      notice = "";
    } catch (e) { notice = e instanceof Error ? e.message : String(e); }
  }
  async function importFile(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const parsed = DesignSchema.safeParse(JSON.parse(await file.text()));
    if (parsed.success) { design = parsed.data; selected = null; notice = ""; }
    else notice = `Not a valid design file: ${parsed.error.issues[0]?.message ?? "unknown error"}`;
  }
</script>

<header>
  <div><span class="eyebrow">OPEN REMOTE</span><h1>Designer</h1></div>
  <div class="status" class:bad={errors > 0}>{errors ? `${errors} problem${errors > 1 ? "s" : ""} to fix` : "Buildable"}</div>
</header>

<main>
  <aside>
    <section>
      <label>Start from <select onchange={(e) => load(e.currentTarget.value)}>
        <option value="" selected disabled>a seed design…</option>
        <option value="classic">Classic column</option>
        <option value="thumb-arc">Thumb arc</option>
      </select></label>
      <label>Name <input bind:value={design.name} maxlength="60" /></label>
    </section>

    <section>
      <h2>Controller</h2>
      <select bind:value={design.chip}>
        {#each CHIP_IDS as id}<option value={id}>{CHIPS[id].label} · ${CHIPS[id].priceUsd}</option>{/each}
      </select>
      <p class="small">{chip.firmware === "esp-idf" ? "Open Remote firmware runs on this chip." : "Firmware not ported yet."}
        Wake pins: {chip.pins.filter((p) => p.wake).map((p) => p.id).join(", ")}.</p>
      <label class="row"><input type="checkbox" bind:checked={design.options.irTransmit} /> IR transmitter</label>
      <label class="row"><input type="checkbox" bind:checked={design.options.irReceive} /> IR receiver (learning)</label>
      <label class="row"><input type="checkbox" bind:checked={design.options.batterySense} /> Battery level</label>
    </section>

    <section>
      <h2>Battery and shell</h2>
      <div class="grid">
        <label>mAh <input type="number" min="50" max="3000" bind:value={design.battery.capacityMah} /></label>
        <label>Thick <input type="number" min="2" max="15" step="0.5" bind:value={design.battery.thicknessMm} /></label>
        <label>Length <input type="number" min="10" max="120" bind:value={design.battery.lengthMm} /></label>
        <label>Width <input type="number" min="5" max="60" bind:value={design.battery.widthMm} /></label>
      </div>
      <div class="grid">
        <label>Shell <select bind:value={design.shell.family}>{#each SHELLS as s}<option>{s}</option>{/each}</select></label>
        <label>Margin <input type="number" min="2" max="20" step="0.5" bind:value={design.shell.marginMm} /></label>
      </div>
      <label>Keycaps <select bind:value={design.keycap}><option value="choc-mcc">Choc · MoErgo MCC</option><option value="choc-mbk">Choc · MBK</option></select></label>
    </section>

    <section>
      <h2>Keys ({design.keys.length})</h2>
      <div class="row"><button onclick={addKey}>Add key</button><button onclick={removeKey} disabled={!key}>Remove</button></div>
      {#if key}
        <div class="grid">
          <label>Action <select bind:value={key.action}>{#each ACTIONS as a}<option>{a}</option>{/each}</select></label>
          <label>Legend <input bind:value={key.label} maxlength="12" /></label>
          <label>X mm <input type="number" step="0.5" bind:value={key.x} /></label>
          <label>Y mm <input type="number" step="0.5" bind:value={key.y} /></label>
          <label>Rotate ° <input type="number" step="1" min="-180" max="180" bind:value={key.r} /></label>
        </div>
      {:else}
        <p class="small">Drag keys in the layout. Select one to edit it; arrow keys nudge (Shift for 5 mm), R and E rotate.</p>
      {/if}
    </section>
  </aside>

  <div class="views">
    <div class="view"><Editor2D bind:design bind:selected /></div>
    <div class="view"><Preview3D {design} {selected} /></div>
  </div>

  <aside>
    <section>
      <h2>Checks</h2>
      <ul class="findings">
        {#each findings as f}<li class={f.level}>{f.message}</li>{/each}
      </ul>
    </section>
    <section>
      <h2>Pin plan</h2>
      {#if plan.ok}
        <ul class="pins">
          <li><b>Columns (wake)</b> {plan.columns.map((p) => `${p.id}·${p.chipPin}`).join(", ")}</li>
          <li><b>Rows</b> {plan.rows.map((p) => `${p.id}·${p.chipPin}`).join(", ")}</li>
          {#if plan.battery}<li><b>Battery</b> {plan.battery.id}·{plan.battery.chipPin}</li>{/if}
          {#if plan.irTransmit}<li><b>IR send</b> {plan.irTransmit.id}·{plan.irTransmit.chipPin}</li>{/if}
          {#if plan.irReceive}<li><b>IR receive</b> {plan.irReceive.id}·{plan.irReceive.chipPin}</li>{/if}
        </ul>
      {:else}<p class="small">No plan: see checks.</p>{/if}
    </section>
    <section>
      <h2>Export</h2>
      <div class="col">
        <button onclick={() => exportFile("design")}>Design file (JSON)</button>
        <button onclick={() => exportFile("keymap")} disabled={!plan.ok}>Keymap (JSON)</button>
        <button onclick={() => exportFile("header")} disabled={!plan.ok || chip.firmware !== "esp-idf"}>Firmware keymap.h</button>
        <label class="button">Import design<input type="file" accept="application/json,.json" onchange={importFile} hidden /></label>
      </div>
      {#if notice}<p class="small bad">{notice}</p>{/if}
      <p class="small">PCB, plate and shell export come next. Nothing here is a verified manufacturing file yet.</p>
    </section>
  </aside>
</main>

<style>
  :global(body) { margin: 0; background: #0b100d; color: #e8f1eb; font: 14px/1.45 system-ui, sans-serif; }
  :global(*) { box-sizing: border-box; }
  header { display: flex; justify-content: space-between; align-items: end; padding: 14px 20px 6px; }
  h1 { margin: 0; font-size: 22px; } h2 { font-size: 13px; letter-spacing: 1px; text-transform: uppercase; color: #a9d7bd; margin: 0 0 8px; }
  .eyebrow { font-size: 11px; letter-spacing: 3px; color: #a9d7bd; }
  .status { padding: 6px 12px; border-radius: 999px; background: #1f5e3a; font-weight: 600; }
  .status.bad { background: #6b2a22; }
  main { display: grid; grid-template-columns: 280px 1fr 300px; gap: 14px; padding: 8px 20px 20px; height: calc(100vh - 70px); }
  aside { overflow: auto; display: flex; flex-direction: column; gap: 12px; }
  section { background: #141d18; border-radius: 12px; padding: 12px; }
  .views { display: grid; grid-template-rows: 1fr 1fr; gap: 14px; min-height: 0; }
  .view { min-height: 0; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: #bdd0c4; margin-bottom: 8px; }
  label.row { flex-direction: row; align-items: center; gap: 8px; margin-bottom: 4px; }
  input, select, button, .button { font: inherit; color: #eef7f1; background: #0e1411; border: 1px solid #36493d; border-radius: 8px; padding: 6px 8px; }
  button, .button { cursor: pointer; background: #233b2c; text-align: center; } button:disabled { opacity: .45; cursor: default; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; }
  .row { display: flex; gap: 8px; margin-bottom: 8px; } .row > button { flex: 1; }
  .col { display: flex; flex-direction: column; gap: 6px; }
  .small { font-size: 12px; color: #9fb3a7; margin: 6px 0; } .bad { color: #ff8b7b; }
  .findings, .pins { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
  .findings li { padding: 6px 8px; border-radius: 8px; border-left: 3px solid; background: #0e1411; }
  .findings .error { border-color: #ff6b5b; } .findings .warning { border-color: #f2b544; } .findings .info { border-color: #4fae7a; color: #bdd0c4; }
  @media (max-width: 1000px) { main { grid-template-columns: 1fr; height: auto; } .views { grid-template-rows: 380px 380px; } }
</style>
