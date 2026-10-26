<script lang="ts">
  import Meter from "../ui/Meter.svelte";
  import { ACTION_INFO, ACTIONS, capColour, glyphUrl, legendOf } from "../lib/actions";
  import type { Finding } from "../lib/checks";
  import { PITCH, readingOrder, type Design, type Key, type TemplateId } from "../lib/design";
  import type { PinPlan, PinPlanFailure } from "../lib/matrix";

  let { design = $bindable(), selected = $bindable(), plan, findings, capacity, templates, onTemplate, onDone }: {
    design: Design; selected: string | null; plan: PinPlan | PinPlanFailure; findings: Finding[]; capacity: number;
    templates: [TemplateId, string][]; onTemplate: (t: TemplateId) => void; onDone: () => void;
  } = $props();

  let half = $state(false);
  const key = $derived(design.keys.find((k) => k.id === selected) ?? null);
  const ordered = $derived(readingOrder(design.keys));
  const keyFindings = $derived(key ? findings.filter((f) => f.keyId === key.id && f.level !== "info") : []);

  function nudge(dx: number, dy: number) {
    if (!key) return;
    const s = half ? 0.5 : 1;
    key.x += dx * PITCH.x * s;
    key.y += dy * PITCH.y;
  }
  function remove(k: Key) {
    if (design.keys.length <= 1) return;
    design.keys = design.keys.filter((x) => x.id !== k.id);
    selected = null;
    onDone();
  }
</script>

<div class="pane">
  {#if key}
    <div>
      <h1>{ACTION_INFO[key.action].name}</h1>
      <p class="meta">key {ordered.indexOf(key) + 1} of {design.keys.length}</p>
    </div>
    {#each keyFindings as f}<p class="small" class:alert={f.level === "error"}>{f.message}</p>{/each}
    <label class="oc-field">
      <span class="oc-field-label">Does</span>
      <span class="oc-field-well oc-field-sans"><select bind:value={key.action}>{#each ACTIONS as a}<option value={a}>{ACTION_INFO[a].name}</option>{/each}</select></span>
      <span class="oc-field-help">The cap is {capColour(key.action)}.{ACTION_INFO[key.action].firmware ? "" : " The firmware does not send this yet."}</span>
    </label>
    <label class="oc-field">
      <span class="oc-field-label">Legend</span>
      <span class="oc-field-well"><input bind:value={key.label} maxlength="4" placeholder={legendOf(key.action, "").glyph ? "glyph" : legendOf(key.action, "").text} /></span>
      <span class="oc-field-help">Empty uses the glyph. Or type four characters.</span>
    </label>
    <div class="oc-field">
      <span class="oc-field-label">Width</span>
      <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Key width">
        {#each [1, 1.5, 2] as const as w}
          <button class="oc-seg-opt" role="radio" aria-checked={key.w === w} onclick={() => (key.w = w)}>{w}u</button>
        {/each}
      </div>
    </div>
    <div class="oc-field">
      <span class="oc-field-label">Move</span>
      <div class="nudge">
        {#each [["left", -1, 0], ["up", 0, -1], ["down", 0, 1], ["right", 1, 0]] as const as [g, dx, dy]}
          <button class="oc-key oc-key-dense" aria-label={`Move ${g}`} onclick={() => nudge(dx, dy)}><img src={glyphUrl(g, "oxblood")} alt="" width="18" height="18" /></button>
        {/each}
        <button class="oc-seg-opt half" role="switch" aria-checked={half} onclick={() => (half = !half)}>½ step</button>
      </div>
      <span class="oc-field-help">Or drag the key. Half steps move sideways by half a key.</span>
    </div>
    <div class="row actions">
      <button class="oc-btn oc-btn-primary" onclick={() => { selected = null; onDone(); }}>Done</button>
      <button class="oc-btn oc-btn-danger" disabled={design.keys.length <= 1} onclick={() => remove(key)}>Remove key</button>
    </div>
  {:else}
    <div>
      <h1>Keys</h1>
      <p class="meta">Tap a key to change it. Drag to move it.</p>
    </div>
    <section>
      <h2>Start from</h2>
      <div class="oc-seg oc-seg-fill" role="radiogroup" aria-label="Template">
        {#each templates as [id, name]}
          <button class="oc-seg-opt" role="radio" aria-checked={design.template === id} onclick={() => onTemplate(id)}>{name}</button>
        {/each}
      </div>
      <p class="small">Starting over replaces the keys. Your parts choices stay.</p>
    </section>
    <section>
      <h2>Budget</h2>
      <Meter used={design.keys.length} of={capacity} label="keys fit this controller" />
      {#if !plan.ok}<p class="small alert">{plan.reason}</p>{/if}
    </section>
    <section>
      <h2>In reading order</h2>
      <ul class="list">
        {#each ordered as k (k.id)}
          {@const legend = legendOf(k.action, k.label)}
          <li><button class="item" onclick={() => (selected = k.id)}>
            <span class={`cap ${capColour(k.action)}`}>
              {#if legend.glyph}<img src={glyphUrl(legend.glyph, capColour(k.action) === "ivory" ? "oxblood" : "ivory")} alt="" width="14" height="14" />{:else}{legend.text}{/if}
            </span>
            <span class="name">{ACTION_INFO[k.action].name}{k.w > 1 ? ` · ${k.w}u` : ""}</span>
          </button></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  /* Done stays in reach while the inspector scrolls. */
  .actions { position: sticky; bottom: calc(-1 * var(--pad)); margin: 0 calc(-1 * var(--pad)); padding: var(--space-2) var(--pad) var(--space-3);
    background: var(--ground-raised); border-top: 1px solid var(--line); z-index: 1; }
  .nudge { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .nudge .oc-key { width: 44px; height: 44px; }
  .nudge img { display: block; pointer-events: none; }
  .half { margin-left: auto; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .item { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 44px; padding: 0 var(--space-1); border: 0; border-bottom: 1px solid var(--line);
    background: transparent; color: var(--ink); font: 400 16px/20px var(--font-serif); text-align: left; cursor: pointer; }
  .item:hover { background: var(--well); }
  .item:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cap { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 26px; border-radius: 5px;
    font: 600 9px/1 var(--font-sans); letter-spacing: 0.04em; background: var(--cap-ivory); color: var(--on-cap-ivory); box-shadow: var(--shadow-cap-ivory); }
  .cap.oxblood { background: var(--cap-oxblood); color: var(--on-cap-oxblood); box-shadow: var(--shadow-cap-oxblood); }
  .cap.orange { background: var(--cap-orange); color: var(--on-cap-orange); box-shadow: var(--shadow-cap-orange); }
</style>
