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
  let tab = $state<"layout" | "model" | "build" | "checks">("model");
  const today = new Date().toISOString().slice(0, 10);

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

<div class="app" data-tab={tab}>
  <header class="titleblock">
    <div class="cell brand"><small>PROJECT</small><b>OPEN REMOTE DESIGNER</b></div>
    <div class="cell"><small>DRAWING</small><input class="title" bind:value={design.name} maxlength="60" aria-label="Design name" /></div>
    <div class="cell meta"><small>CONTROLLER</small><b>{chip.label}</b></div>
    <div class="cell meta"><small>UNITS · DATE</small><b>MM · {today}</b></div>
    <div class="cell state" class:bad={errors > 0}><small>STATUS</small><b>{errors ? `${errors} ISSUE${errors > 1 ? "S" : ""}` : "BUILDABLE"}</b></div>
  </header>

  <nav class="tabs" aria-label="Sections">
    {#each [["layout", "LAYOUT"], ["model", "3D"], ["build", "BUILD"], ["checks", `CHECKS${errors ? ` · ${errors}` : ""}`]] as [id, label]}
      <button class:on={tab === id} onclick={() => (tab = id as typeof tab)}>{label}</button>
    {/each}
  </nav>

  <main>
    <aside class="pane p-build">
      <section>
        <h2>01 · Start</h2>
        <label>Seed design <select onchange={(e) => load(e.currentTarget.value)}>
          <option value="" selected disabled>Choose…</option>
          <option value="classic">Classic column</option>
          <option value="thumb-arc">Thumb arc</option>
        </select></label>
      </section>
      <section>
        <h2>02 · Controller</h2>
        <select bind:value={design.chip} aria-label="Controller">
          {#each CHIP_IDS as id}<option value={id}>{CHIPS[id].label} · ${CHIPS[id].priceUsd}</option>{/each}
        </select>
        <p class="note">{chip.firmware === "esp-idf" ? "Firmware: ready." : "Firmware: not ported."} Wake pins {chip.pins.filter((p) => p.wake).map((p) => p.id).join(" ")}</p>
        <label class="check"><input type="checkbox" bind:checked={design.options.irTransmit} /> IR transmitter</label>
        <label class="check"><input type="checkbox" bind:checked={design.options.irReceive} /> IR receiver</label>
        <label class="check"><input type="checkbox" bind:checked={design.options.batterySense} /> Battery level</label>
      </section>
      <section>
        <h2>03 · Battery · shell</h2>
        <div class="grid">
          <label>mAh <input type="number" min="50" max="3000" bind:value={design.battery.capacityMah} /></label>
          <label>T mm <input type="number" min="2" max="15" step="0.5" bind:value={design.battery.thicknessMm} /></label>
          <label>L mm <input type="number" min="10" max="120" bind:value={design.battery.lengthMm} /></label>
          <label>W mm <input type="number" min="5" max="60" bind:value={design.battery.widthMm} /></label>
          <label>Shell <select bind:value={design.shell.family}>{#each SHELLS as s}<option>{s}</option>{/each}</select></label>
          <label>Margin <input type="number" min="2" max="20" step="0.5" bind:value={design.shell.marginMm} /></label>
        </div>
        <label>Keycaps <select bind:value={design.keycap}><option value="choc-mcc">Choc · MoErgo MCC</option><option value="choc-mbk">Choc · MBK</option></select></label>
      </section>
      <section>
        <h2>04 · Keys [{design.keys.length}]</h2>
        <div class="row"><button onclick={addKey}>+ Add</button><button onclick={removeKey} disabled={!key}>− Remove</button></div>
        {#if key}
          <div class="grid">
            <label>Action <select bind:value={key.action}>{#each ACTIONS as a}<option>{a}</option>{/each}</select></label>
            <label>Legend <input bind:value={key.label} maxlength="12" /></label>
            <label>X <input type="number" step="0.5" bind:value={key.x} /></label>
            <label>Y <input type="number" step="0.5" bind:value={key.y} /></label>
            <label>R° <input type="number" step="1" min="-180" max="180" bind:value={key.r} /></label>
          </div>
        {:else}
          <p class="note">Drag keys on the layout sheet. Select one to edit; arrows nudge (Shift = 5 mm), R / E rotate.</p>
        {/if}
      </section>
    </aside>

    <div class="pane p-layout"><Editor2D bind:design bind:selected /></div>
    <div class="pane p-model"><Preview3D {design} /></div>

    <aside class="pane p-checks">
      <section>
        <h2>05 · Checks</h2>
        <ul class="findings">{#each findings as f}<li class={f.level}><i>{f.level === "error" ? "ERR" : f.level === "warning" ? "WARN" : "OK"}</i>{f.message}</li>{/each}</ul>
      </section>
      <section>
        <h2>06 · Pin plan</h2>
        {#if plan.ok}
          <table>
            <tbody>
              <tr><th>COL</th><td>{plan.columns.map((p) => `${p.id}/${p.chipPin}`).join("  ")}</td></tr>
              <tr><th>ROW</th><td>{plan.rows.map((p) => `${p.id}/${p.chipPin}`).join("  ")}</td></tr>
              {#if plan.battery}<tr><th>BAT</th><td>{plan.battery.id}/{plan.battery.chipPin}</td></tr>{/if}
              {#if plan.irTransmit}<tr><th>IR TX</th><td>{plan.irTransmit.id}/{plan.irTransmit.chipPin}</td></tr>{/if}
              {#if plan.irReceive}<tr><th>IR RX</th><td>{plan.irReceive.id}/{plan.irReceive.chipPin}</td></tr>{/if}
            </tbody>
          </table>
        {:else}<p class="note">No plan — see checks.</p>{/if}
      </section>
      <section>
        <h2>07 · Export</h2>
        <div class="col">
          <button onclick={() => exportFile("design")}>Design file · JSON</button>
          <button onclick={() => exportFile("keymap")} disabled={!plan.ok}>Keymap · JSON</button>
          <button onclick={() => exportFile("header")} disabled={!plan.ok || chip.firmware !== "esp-idf"}>Firmware · keymap.h</button>
          <label class="button">Import design<input type="file" accept="application/json,.json" onchange={importFile} hidden /></label>
        </div>
        {#if notice}<p class="note bad">{notice}</p>{/if}
        <p class="note">PCB, plate and shell files come next. Models use published footprints; heights are approximate until measured.</p>
      </section>
    </aside>
  </main>
</div>

<style>
  :global(:root) {
    --paper: #0b2545; --ink: #d6e8ff; --line: #9cc8ff; --faint: #2f5a8c; --rule: #3d6ea8; --accent: #7fd1ff;
    --copper: #ffd27a; --warn: #ffcf6b; --error: #ff7a7a;
    --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  }
  :global(body) { margin: 0; background: var(--paper); color: var(--ink); font: 12px/1.45 var(--mono); }
  :global(*) { box-sizing: border-box; }
  :global(button), :global(.button), :global(input), :global(select) {
    font: inherit; color: var(--ink); background: transparent; border: 1px solid var(--rule); border-radius: 0; padding: 6px 8px;
  }
  :global(button), :global(.button) { cursor: pointer; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; }
  :global(button:hover), :global(.button:hover) { border-color: var(--accent); color: var(--accent); }
  :global(button.on), :global(button.primary.on) { background: var(--accent); color: var(--paper); border-color: var(--accent); }
  :global(button:disabled) { opacity: .4; cursor: default; }
  :global(select option) { background: var(--paper); }

  .app { display: flex; flex-direction: column; height: 100dvh; }
  .titleblock { display: grid; grid-template-columns: 1.2fr 2fr 1fr 1fr auto; border-bottom: 1px solid var(--rule); }
  .cell { padding: 6px 12px; border-right: 1px solid var(--rule); display: flex; flex-direction: column; min-width: 0; }
  .cell small { font-size: 9px; letter-spacing: 2px; color: var(--line); }
  .cell b { font-weight: 600; letter-spacing: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cell .title { border: none; padding: 0; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; }
  .state b { color: var(--accent); } .state.bad b { color: var(--error); }
  .tabs { display: none; }

  main { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px 1fr 1.25fr 310px; gap: 0; }
  .pane { min-height: 0; min-width: 0; }
  .p-layout, .p-model { padding: 10px; }
  aside { overflow: auto; border-right: 1px solid var(--rule); }
  aside.p-checks { border-right: none; border-left: 1px solid var(--rule); }
  section { padding: 12px; border-bottom: 1px solid var(--rule); }
  h2 { margin: 0 0 10px; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); font-weight: 600; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 10px; letter-spacing: 1px; color: var(--line); text-transform: uppercase; margin-bottom: 8px; }
  label.check { flex-direction: row; align-items: center; gap: 8px; margin-bottom: 4px; }
  label.check input { width: auto; accent-color: var(--accent); }
  input, select { width: 100%; text-transform: none; letter-spacing: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 8px; }
  .row { display: flex; gap: 8px; margin-bottom: 8px; } .row > button { flex: 1; }
  .col { display: flex; flex-direction: column; gap: 6px; } .button { text-align: center; }
  .note { font-size: 11px; color: var(--line); margin: 6px 0; } .note.bad { color: var(--error); }
  .findings { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .findings li { display: grid; grid-template-columns: 38px 1fr; gap: 6px; font-size: 11px; padding: 5px 0; border-top: 1px dashed var(--faint); }
  .findings i { font-style: normal; font-weight: 700; letter-spacing: 1px; }
  .findings .error i { color: var(--error); } .findings .warning i { color: var(--warn); } .findings .info i { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; color: var(--accent); font-weight: 600; padding: 4px 8px 4px 0; vertical-align: top; width: 48px; }
  td { padding: 4px 0; border-bottom: 1px dashed var(--faint); word-break: break-word; }

  @media (max-width: 1280px) {
    main { grid-template-columns: 280px 1fr 300px; grid-template-rows: 1fr 1fr; }
    .p-build { grid-row: 1 / 3; } .p-layout { grid-column: 2; grid-row: 1; } .p-model { grid-column: 2; grid-row: 2; }
    .p-checks { grid-column: 3; grid-row: 1 / 3; }
  }
  @media (max-width: 900px) {
    .titleblock { grid-template-columns: 1fr auto; }
    .titleblock .meta, .titleblock .brand { display: none; }
    .tabs { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid var(--rule); }
    .tabs button { border: none; border-right: 1px solid var(--rule); padding: 10px 4px; }
    main { display: block; overflow: auto; }
    .pane { display: none; height: 100%; }
    .app[data-tab="layout"] .p-layout, .app[data-tab="model"] .p-model { display: block; }
    .app[data-tab="build"] .p-build, .app[data-tab="checks"] .p-checks { display: block; border: none; }
    .p-layout, .p-model { padding: 6px; }
  }
</style>
