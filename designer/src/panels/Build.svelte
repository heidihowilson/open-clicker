<script lang="ts" module>
  export type ExportKind = "layout" | "keymap";
</script>

<script lang="ts">
  import { usd } from "../lib/bom";
  import { CHIPS } from "../lib/chips";
  import type { Finding } from "../lib/checks";
  import type { Design } from "../lib/design";
  import type { PricingAssumptions, Tier } from "../lib/pricing";
  import { routeBoard } from "../lib/router";

  let { design, level = $bindable(), assumptions = $bindable(), options, findings, theme = $bindable(), notice, onExport, onImport, onShowKey }: {
    design: Design; level: Tier["id"]; assumptions: PricingAssumptions; options: Tier[]; findings: Finding[];
    theme: string; notice: string; onExport: (k: ExportKind) => void; onImport: (e: Event) => void; onShowKey: (id: string) => void;
  } = $props();

  const tier = $derived(options.find((t) => t.id === level) ?? options[0]!);
  const errors = $derived(findings.filter((f) => f.level === "error"));
  const sorted = $derived([...findings].sort((a, b) => rank(a) - rank(b)));
  const chip = $derived(CHIPS[design.chip]);
  let routing = $state(false);
  let routeStatus = $state("");
  let routeError = $state("");
  async function route() {
    routing = true; routeError = ""; routeStatus = "Sending the design…";
    try {
      const { zip, report } = await routeBoard($state.snapshot(design) as Design, (t) => (routeStatus = t));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zip);
      a.download = `${design.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "open-clicker"}-routed.zip`;
      a.click(); URL.revokeObjectURL(a.href);
      routeStatus = report.unrouted
        ? `Routed in ${report.seconds} s, but ${report.unrouted} connections need a hand in KiCad before ordering.`
        : `Routed in ${report.seconds} s and the board passed its checks. Upload the Gerber zip inside to JLCPCB.`;
    } catch (e) { routeError = e instanceof Error ? e.message : String(e); routeStatus = ""; }
    finally { routing = false; }
  }
  function rank(f: Finding) { return f.level === "error" ? 0 : f.level === "warning" ? 1 : 2; }
  const blocked = $derived(errors[0]?.message ?? "");
</script>

<div class="pane">
  <div>
    <h1>Build</h1>
    <p class="meta">{errors.length ? `${errors.length} ${errors.length === 1 ? "problem" : "problems"} to fix before export` : "Ready to export"}</p>
  </div>

  <section id="build-price">
    <h2>How it reaches you</h2>
    <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Fulfilment">
      {#each options as t (t.id)}
        <button class="oc-seg-opt" role="radio" aria-checked={t.id === level} onclick={() => (level = t.id)}>{t.title}</button>
      {/each}
    </div>
    <p class="total"><b>{usd(tier.priceUsd ?? tier.costUsd)}</b> <span>{tier.youDo}</span></p>
    <p class="small">{tier.summary}</p>
    <ul class="lines">
      {#each tier.lines as line}
        <li><span class="label">{line.label}<small>{line.qty > 1 ? `${line.qty} × ${usd(line.unitUsd)} · ` : ""}{line.basis}</small></span><span class="n">{usd(line.qty * line.unitUsd)}</span></li>
      {/each}
      {#if tier.priceUsd !== null}
        <li class="muted"><span class="label">Our cost</span><span class="n">{usd(tier.costUsd)}</span></li>
        <li class="sum"><span class="label">Price at {Math.round(assumptions.margin * 100)}% margin</span><span class="n">{usd(tier.priceUsd)}</span></li>
      {:else}
        <li class="sum"><span class="label">You pay, per remote</span><span class="n">{usd(tier.costUsd)}</span></li>
      {/if}
      {#if tier.extraUsd > 0}<li class="muted"><span class="label">{tier.extraNote}</span><span class="n">{usd(tier.extraUsd)}</span></li>{/if}
    </ul>
    <p class="small">Estimates before shipping and tax.</p>
    {#if tier.priceUsd !== null}
      <details>
        <summary>Assumptions</summary>
        <div class="grid three">
          <label class="oc-field"><span class="oc-field-label">Batch</span><span class="oc-field-well"><input type="number" inputmode="numeric" min="5" max="5000" step="5" bind:value={assumptions.batch} /></span></label>
          <label class="oc-field"><span class="oc-field-label">Margin</span><span class="oc-field-well"><input type="number" inputmode="numeric" min="0" max="90" step="5" value={Math.round(assumptions.margin * 100)}
            oninput={(e) => (assumptions.margin = Math.min(0.9, Math.max(0, Number(e.currentTarget.value) / 100)))} /><span class="oc-field-unit">%</span></span></label>
          <label class="oc-field"><span class="oc-field-label">Labour</span><span class="oc-field-well"><input type="number" inputmode="numeric" min="0" max="200" step="5" bind:value={assumptions.laborUsdPerHour} /><span class="oc-field-unit">$/h</span></span></label>
        </div>
      </details>
    {/if}
  </section>

  <section id="build-checks">
    <h2>Checks</h2>
    <ul class="checks">
      {#each sorted as f}
        <li>
          <span class="oc-badge" class:oc-badge-alert={f.level === "error"} class:oc-badge-ok={f.level === "info"} class:oc-badge-accent={f.level === "warning"}>{f.badge}</span>
          <span>{f.message}{#if f.keyId} <button class="oc-btn oc-btn-link" onclick={() => onShowKey(f.keyId!)}>Show key</button>{/if}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section id="build-board">
    <h2>Circuit board</h2>
    <button class="oc-btn oc-btn-primary" disabled={!!blocked || routing} onclick={route}>{routing ? "Routing…" : "Route and get Gerbers"}</button>
    <p class="small" class:alert={!!routeError}>{routeError || routeStatus || "Draws every copper trace and returns the files a board maker like JLCPCB asks for, with order steps. Usually under two minutes."}</p>
  </section>

  <section id="build-export">
    <h2>Export</h2>
    {#if blocked}<p class="small alert">{blocked}</p>{/if}
    <div class="exports">
      <button class="oc-btn" disabled={!!blocked} onclick={() => onExport("keymap")}>Keymap</button>
      <button class="oc-btn" onclick={() => onExport("layout")}>Layout file</button>
      <label class="oc-btn">Open a layout<input type="file" accept="application/json,.json" onchange={onImport} hidden /></label>
    </div>
    <p class="small">The routed board above includes the full KiCad project. The shell STL files come next.</p>
    {#if notice}<p class="small alert">{notice}</p>{/if}
  </section>

  <section class="theme">
    <h2>Theme</h2>
    <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Theme">
      <button class="oc-seg-opt" role="radio" aria-checked={theme === "ivory"} onclick={() => (theme = "ivory")}>Ivory</button>
      <button class="oc-seg-opt" role="radio" aria-checked={theme === "late-show"} onclick={() => (theme = "late-show")}>Late show</button>
    </div>
  </section>
</div>

<style>
  .total { margin: var(--space-2) 0 0; display: flex; align-items: baseline; gap: var(--space-3); }
  .total b { font: 700 32px/36px var(--font-serif); }
  .total span { font: 500 15px/20px var(--font-sans); color: var(--ink-muted); }
  .lines { list-style: none; margin: 0; padding: 0; }
  .lines li { display: flex; gap: var(--space-3); justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 15px; line-height: 20px; }
  .lines small { display: block; font: 500 12px/16px var(--font-sans); color: var(--ink-muted); }
  .label { min-width: 0; }
  .n { flex: none; font: 500 14px/20px var(--font-sans); }
  .lines .sum { font-weight: 700; border-bottom: 0; }
  .lines .muted { color: var(--ink-muted); }
  .grid.three { grid-template-columns: repeat(3, 1fr); }
  .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); font-size: 15px; line-height: 20px; }
  .checks li { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .checks .oc-btn-link { height: auto; font-size: 14px; }
  .exports { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  @media (min-width: 1100px) { .theme { display: none; } }
</style>
