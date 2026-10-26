<script lang="ts">
  import { usd } from "../lib/bom";
  import { CHIPS, CHIP_IDS } from "../lib/chips";
  import type { Design } from "../lib/design";
  import { planPins } from "../lib/matrix";

  let { design = $bindable() }: { design: Design } = $props();

  /* Common LiPo sizes: the name is thickness, width and length (602040 is 6 × 20 × 40 mm). */
  const CELLS = [
    { name: "401230", capacityMah: 110, thicknessMm: 4, widthMm: 12, lengthMm: 30 },
    { name: "502030", capacityMah: 250, thicknessMm: 5, widthMm: 20, lengthMm: 30 },
    { name: "602040", capacityMah: 400, thicknessMm: 6, widthMm: 20, lengthMm: 40 },
    { name: "603450", capacityMah: 1000, thicknessMm: 6, widthMm: 34, lengthMm: 50 },
  ];
  const chip = $derived(CHIPS[design.chip]);
  const cell = $derived(CELLS.find((c) => c.capacityMah === design.battery.capacityMah && c.lengthMm === design.battery.lengthMm
    && c.widthMm === design.battery.widthMm && c.thicknessMm === design.battery.thicknessMm)?.name ?? "custom");
  let custom = $state(false);

  /* An option that would not fit the pin budget is disabled with the reason, never hidden. */
  const fits = (options: Partial<Design["options"]>) => planPins({ ...design, options: { ...design.options, ...options } });
  const irOut = $derived(design.options.irTransmit ? null : fits({ irTransmit: true }));
  const irIn = $derived(design.options.irReceive ? null : fits({ irReceive: true }));
  const why = (p: ReturnType<typeof fits> | null) => p && !p.ok ? "No pin left: remove a key or choose another controller." : "";

  function pickCell(name: string) {
    const c = CELLS.find((x) => x.name === name);
    if (!c) { custom = true; return; }
    custom = false;
    design.battery = { capacityMah: c.capacityMah, lengthMm: c.lengthMm, widthMm: c.widthMm, thicknessMm: c.thicknessMm };
  }
</script>

<div class="pane">
  <div>
    <h1>Parts</h1>
    <p class="meta">What the keys sit on. The tool works out the wiring.</p>
  </div>

  <section>
    <h2>Controller</h2>
    {#each CHIP_IDS as id}
      {@const c = CHIPS[id]}
      <button class="oc-choice" aria-pressed={design.chip === id} onclick={() => (design.chip = id)}>
        <b>{c.category}</b><span class="oc-choice-spec">{c.label} · {usd(c.priceUsd)}</span><span>{c.blurb}</span>
      </button>
    {/each}
  </section>

  <section>
    <h2>Talks to the TV over</h2>
    <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Protocol">
      <button class="oc-seg-opt" role="radio" aria-checked={!design.options.irTransmit} onclick={() => (design.options.irTransmit = false)}>Bluetooth</button>
      <button class="oc-seg-opt" role="radio" aria-checked={design.options.irTransmit} disabled={!!why(irOut)} onclick={() => (design.options.irTransmit = true)}>Bluetooth + IR</button>
    </div>
    <p class="small" class:alert={!!why(irOut)}>{why(irOut) || "IR turns most TVs on and needs line of sight. It adds a small window on the top edge."}</p>
  </section>

  <section>
    <h2>Learns from an old remote</h2>
    <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="IR receiver">
      <button class="oc-seg-opt" role="radio" aria-checked={!design.options.irReceive} onclick={() => (design.options.irReceive = false)}>No</button>
      <button class="oc-seg-opt" role="radio" aria-checked={design.options.irReceive} disabled={!!why(irIn)} onclick={() => (design.options.irReceive = true)}>Yes, IR receiver</button>
    </div>
    {#if why(irIn)}<p class="small alert">{why(irIn)}</p>{/if}
  </section>

  <section>
    <h2>Battery</h2>
    <label class="oc-field">
      <span class="oc-field-label">Cell</span>
      <span class="oc-field-well oc-field-sans">
        <select value={custom ? "custom" : cell} onchange={(e) => pickCell(e.currentTarget.value)}>
          {#each CELLS as c}<option value={c.name}>{c.capacityMah} mAh · {c.name} ({c.thicknessMm} × {c.widthMm} × {c.lengthMm} mm)</option>{/each}
          <option value="custom">Custom size</option>
        </select>
      </span>
    </label>
    {#if custom || cell === "custom"}
      <div class="grid">
        <label class="oc-field"><span class="oc-field-label">Capacity</span><span class="oc-field-well"><input type="number" inputmode="numeric" min="50" max="3000" bind:value={design.battery.capacityMah} /><span class="oc-field-unit">mAh</span></span></label>
        <label class="oc-field"><span class="oc-field-label">Thick</span><span class="oc-field-well"><input type="number" inputmode="decimal" min="2" max="15" step="0.5" bind:value={design.battery.thicknessMm} /><span class="oc-field-unit">mm</span></span></label>
        <label class="oc-field"><span class="oc-field-label">Long</span><span class="oc-field-well"><input type="number" inputmode="decimal" min="10" max="120" bind:value={design.battery.lengthMm} /><span class="oc-field-unit">mm</span></span></label>
        <label class="oc-field"><span class="oc-field-label">Wide</span><span class="oc-field-well"><input type="number" inputmode="decimal" min="5" max="60" bind:value={design.battery.widthMm} /><span class="oc-field-unit">mm</span></span></label>
      </div>
    {/if}
    {#if chip.batteryDividerBuiltIn}
      <p class="small">The {chip.label} reads its own battery level.</p>
    {:else}
      <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Battery level">
        <button class="oc-seg-opt" role="radio" aria-checked={design.options.batterySense} onclick={() => (design.options.batterySense = true)}>Reports level</button>
        <button class="oc-seg-opt" role="radio" aria-checked={!design.options.batterySense} onclick={() => (design.options.batterySense = false)}>Doesn't</button>
      </div>
      <p class="small">Reporting the level uses one pin and two resistors.</p>
    {/if}
  </section>

  <section>
    <h2>Keycaps</h2>
    <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Keycaps">
      <button class="oc-seg-opt" role="radio" aria-checked={design.keycap === "choc-mcc"} onclick={() => (design.keycap = "choc-mcc")}>MoErgo MCC</button>
      <button class="oc-seg-opt" role="radio" aria-checked={design.keycap === "choc-mbk"} onclick={() => (design.keycap = "choc-mbk")}>MBK</button>
    </div>
  </section>
</div>
