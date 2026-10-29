<script lang="ts">
  import { onMount } from "svelte";
  import type { Bounds } from "../lib/geometry";
  import { boardBounds, SHELL_RULES } from "../lib/geometry";
  import { usd, type BomLine } from "../lib/bom";
  import { ROUTER_URL, routeBoard } from "../lib/router";
  import {
    CAPS, cellX, cellZ, colAt, fromLayout, inside, LAYOUTS, layoutLabels, live, MAX_COLS, MAX_KEYS, MAX_ROWS, minSize, newId, occupied,
    quote, rowAt, shellRect, TIERS, toDesign, total, type CapColor, type Layout, type Remote, type TierId,
  } from "./model";
  import { RemoteScene } from "./scene";
  import HandPreview from "./HandPreview.svelte";
  import type { HandModel } from "./handmodel";
  import { FUNCTION_NAMES, type Fn, type Label } from "./labels";

  type Screen = "intro" | "edit" | "buy" | "done";
  type TemplateName = "streamer" | "boomer" | "brick";

  let canvasHost: HTMLDivElement;
  let labelHost: HTMLDivElement;
  let stageEl: HTMLDivElement;
  let scene = $state.raw<RemoteScene | null>(null);

  let vw = $state(innerWidth), vh = $state(innerHeight);
  let screen = $state<Screen>("intro");
  let ready = $state(false);
  /* One quiet hint per gesture; each fades for good once the person has done it. */
  let moved = $state(false), resized = $state(false);
  let keysLive = $state(false), sizeLive = $state(false);
  let remote = $state.raw<Remote>(fromLayout(LAYOUTS.streamer));
  let liveBounds = $state.raw<Bounds | null>(null);
  let resizing = $state<"x" | "y" | null>(null);
  let frozenPpm = 0;
  let dragId = $state<string | null>(null), dragOut = $state(false);
  let template = $state<TemplateName | "blank" | null>(null);
  let templatesShown = $state(false);
  let trayReady = $state(false), added = $state(false);
  let makeShown = $state(false);
  let acts = $state(0), lastAct = $state(0);
  let tier = $state<TierId | null>(null);
  let focus = $state<BomLine | null>(null);
  let busy = $state(""), failure = $state("");
  let email = $state(""), asking = $state(false);
  let doneKind = $state<"files" | "list">("files");

  const isEdit = $derived(screen === "edit");
  const keysOn = $derived(isEdit && keysLive);
  const sizeOn = $derived(isEdit && sizeLive);
  const count = $derived(live(remote).length);
  const trayInline = $derived(vw >= 760 && vh >= 760);
  const trayOn = $derived(isEdit && (acts >= 3 || trayReady));
  const full = $derived(count >= MAX_KEYS);

  /* ---- size of the remote on screen (SPEC §7) ---- */
  const bounds = $derived(liveBounds ?? boardBounds(toDesign(remote)));
  const outer = $derived(RemoteScene.outer(bounds));
  const committedOuter = $derived(RemoteScene.outer(boardBounds(toDesign(remote))));
  const editPpm = $derived.by(() => {
    if (resizing) return frozenPpm;
    const f = trayInline ? 0.54 : 0.62;
    return Math.min(6.67, Math.max(1.67, Math.min((vh * f) / committedOuter.h, (vw - 140) / committedOuter.w)));
  });
  const stage = $derived.by(() => {
    if (screen === "buy" || screen === "done") {
      const w = Math.min(vw - 32, 680), h = Math.max(240, Math.min(vh * (screen === "done" ? 0.3 : 0.46), 520));
      return { w, h };
    }
    return { w: Math.round(outer.w * editPpm), h: Math.round(outer.h * editPpm) };
  });
  $effect(() => {
    if (!scene) return;
    if (screen === "buy" || screen === "done") scene.ppmTarget = scene.explodedFit(stage.w, stage.h);
    else if (resizing) scene.setPpm(frozenPpm);
    /* Tilted, the remote spans its diagonal, so the first screen shows it a little smaller. */
    else scene.ppmTarget = screen === "intro" ? editPpm * (vw < 760 ? 0.6 : 0.85) : editPpm;
  });
  $effect(() => { if (scene) scene.jiggle = keysOn; });
  $effect(() => { if (scene) scene.tiltTarget = screen === "intro" ? 1 : 0; });

  onMount(() => {
    scene = new RemoteScene(canvasHost, labelHost);
    scene.setStage(stageEl);
    scene.setRemote(remote);
    scene.setPpm(editPpm);
    seed(LAYOUTS.streamer);
    scene.onFocus = (f) => (focus = f?.line ?? null);
    const t0 = setTimeout(() => (ready = true), 900);
    const iv = setInterval(check, 300);
    const onResize = () => { vw = innerWidth; vh = innerHeight; };
    addEventListener("resize", onResize);
    return () => { clearTimeout(t0); clearInterval(iv); removeEventListener("resize", onResize); scene?.dispose(); };
  });

  /* Labels follow the layout: every change asks Jev again. A key the person locked keeps its
   * label and goes to Jev as a fixed fact. `fresh` drops the locks too (a template, Design
   * another). The old labels stay on screen until the new answer arrives. */
  /* `preset`: the template named this key. It stays put like a lock, without the lock's dot. */
  type KeyLabel = Label & { locked?: boolean; hint?: string; preset?: boolean };
  let labels = $state.raw<Record<string, KeyLabel>>({});
  function apply(r: Remote, stagger = false, fresh = false) {
    remote = r;
    scene?.setRemote(r, stagger);
    const ids = new Set(r.keys.map((k) => k.id));
    setLabels(fresh ? {} : Object.fromEntries(Object.entries(labels).filter(([id]) => ids.has(id))));
    askLabels();
  }
  /* A named template brings its keys' functions; the other keys are labelled from the layout. */
  function seed(L: Layout) {
    const by = layoutLabels(L);
    setLabels(Object.fromEntries(live(remote).filter((k) => by[`${k.col},${k.row}`]).map((k) => [k.id, { fn: by[`${k.col},${k.row}`]!, confidence: 1, alts: [], locked: true, preset: true }])));
    askLabels();
  }
  function setLabels(next: Record<string, KeyLabel>) {
    labels = next;
    scene?.setLabels(Object.fromEntries(Object.entries(next).map(([id, l]) => [id, { fn: l.fn, locked: !!l.locked && !l.preset }])));
  }

  let labelTimer = 0, labelTurn = 0;
  function askLabels() {
    clearTimeout(labelTimer);
    labelTimer = setTimeout(async () => {
      const turn = ++labelTurn, sent = remote;
      const known = Object.fromEntries(live(sent).filter((k) => labels[k.id]?.locked && !labels[k.id]!.hint).map((k) => [k.id, labels[k.id]!.fn]));
      const hints = Object.fromEntries(live(sent).filter((k) => labels[k.id]?.hint).map((k) => [k.id, labels[k.id]!.hint!]));
      try {
        const res = await fetch(`${ROUTER_URL}/labels`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sent, known, hints }) });
        const body = await res.json() as { labels?: Record<string, Label> };
        if (turn !== labelTurn || !body.labels) return;
        const next: Record<string, KeyLabel> = Object.fromEntries(Object.entries(labels).filter(([, l]) => l.locked));
        /* A hinted key takes the function Jev read from its words; its hint and lock stay. */
        for (const [id, l] of Object.entries(body.labels)) {
          const was = next[id];
          if (was?.hint) next[id] = { ...l, locked: true, hint: was.hint };
          else if (!was && l.confidence >= 0.15) next[id] = l;
        }
        setLabels(next);
      } catch { /* blank caps are fine */ }
    }, 250) as unknown as number;
  }

  /* ---- tap a key: lock its label, or choose another (which locks it) ---- */
  let picker = $state<{ id: string; x: number; y: number; more: boolean; hint: string } | null>(null);
  function openPicker(id: string) {
    const k = remote.keys.find((x) => x.id === id);
    if (!k || !scene) return;
    const at = scene.toScreen(cellX(k.col), cellZ(k.row) - 9);
    picker = { id, x: at.x, y: at.y, more: false, hint: labels[id]?.hint ?? "" };
  }
  function toggleLock() {
    if (!picker) return;
    const l = labels[picker.id];
    if (!l) return;
    /* Unlocking hands the key back to Jev, so its words go too. */
    setLabels({ ...labels, [picker.id]: l.locked ? { ...l, locked: false, hint: undefined, preset: false } : { ...l, locked: true } });
    picker = null;
    askLabels();
  }
  /* Words typed for a key lock it; Jev reads them as a function, or the key becomes custom. */
  function describe(e?: SubmitEvent) {
    e?.preventDefault();
    if (!picker) return;
    const id = picker.id, hint = picker.hint.trim().slice(0, 60), l = labels[id];
    if (hint === (l?.hint ?? "")) { picker = null; return; }
    setLabels({ ...labels, [id]: hint ? { fn: l?.fn ?? "custom", confidence: 1, alts: l?.alts ?? [], locked: true, hint } : { ...l!, locked: false, hint: undefined } });
    picker = null;
    askLabels();
  }
  function choose(fn: Fn) {
    if (!picker) return;
    const id = picker.id, next = { ...labels };
    /* One key per function (apps excepted): a key that had it loses it and is relabelled. */
    if (fn !== "app") for (const [other, l] of Object.entries(next)) if (other !== id && l.fn === fn) delete next[other];
    next[id] = { fn, confidence: 1, alts: labels[id]?.alts ?? [], locked: true };
    setLabels(next);
    picker = null;
    askLabels();
  }
  const pickerTop = $derived.by((): Fn[] => {
    if (!picker) return [];
    const l = labels[picker.id];
    return [...new Set(l?.alts ?? [])].filter((f) => f !== "custom" && f !== l?.fn).slice(0, 3);
  });
  /* Custom comes only from typed words. */
  const ALL_FNS = (Object.keys(FUNCTION_NAMES) as Fn[]).filter((f) => f !== "custom");

  /* A change: resize release, key moved, key removed or key added (SPEC §2.3). */
  function commit() { acts += 1; lastAct = Date.now(); makeShown = false; templatesShown = false; }
  function check() {
    if (screen !== "edit" || acts === 0 || makeShown) return;
    if (Date.now() - lastAct > 5000 && count > 0) makeShown = true;
  }

  /* ---- flow ---- */
  /* Editing starts at once: keys move and the shell resizes, no question first. */
  function edit() { screen = "edit"; keysLive = true; sizeLive = true; lastAct = Date.now(); acts = 0; }
  function makeOrBuy() {
    screen = "buy"; makeShown = false; templatesShown = false; tier = null; failure = ""; asking = false;
    scene?.showParts(true);
  }
  function back() { screen = "edit"; lastAct = Date.now(); focus = null; scene?.showParts(false); }
  function again() {
    scene?.showParts(false);
    apply(fromLayout(LAYOUTS.streamer), false, true);
    seed(LAYOUTS.streamer);
    screen = "intro"; moved = false; resized = false; keysLive = false; sizeLive = false; added = false; trayReady = false;
    template = null; templatesShown = false; makeShown = false; tier = null; acts = 0; email = ""; asking = false; focus = null;
  }

  /* ---- templates (SPEC §4.5, §5.5): keys keep their role colour as they move ---- */
  function applyTemplate(name: TemplateName | "blank") {
    const L = LAYOUTS[name];
    const pool: Record<CapColor, string[]> = { charcoal: [], light: [], red: [] };
    for (const k of [...live(remote)].sort((a, b) => a.row - b.row || a.col - b.col)) pool[k.color].push(k.id);
    const keys = L.keys.map(([col, row, color]) => ({ id: pool[color].shift() ?? (color !== "charcoal" ? pool.charcoal.shift() : undefined) ?? newId(), col, row, color }));
    apply({ cols: L.cols, rows: L.rows, keys }, true, true);
    seed(L);
    template = name; templatesShown = false; trayReady = true; keysLive = true; sizeLive = true; lastAct = Date.now();
  }

  /* ---- dragging keys (SPEC §4.2) ---- */
  let drag: { id: string; sx: number; sy: number; ox: number; oz: number; moved: boolean } | null = null;
  const isOut = (x: number, z: number) => { const s = shellRect(remote); return x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ; };
  function stageDown(e: PointerEvent) {
    if (!isEdit || !scene) return;
    const p = scene.toMm(e.clientX, e.clientY);
    const col = colAt(p.x), row = rowAt(p.z);
    const k = live(remote).find((k) => k.col === col && k.row === row);
    if (!k || Math.abs(p.x - cellX(col)) > 8.75 || Math.abs(p.z - cellZ(row)) > 8.25) return;
    e.preventDefault();
    stageEl.setPointerCapture(e.pointerId);
    drag = { id: k.id, sx: e.clientX, sy: e.clientY, ox: cellX(col), oz: cellZ(row), moved: false };
  }
  function stageMove(e: PointerEvent) {
    if (!drag || !scene || !keysOn) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
    drag.moved = true; dragId = drag.id;
    const x = drag.ox + (e.clientX - drag.sx) / scene.ppm, z = drag.oz + (e.clientY - drag.sy) / scene.ppm;
    dragOut = isOut(x, z);
    scene.dragKey(drag.id, x, z, dragOut);
  }
  function stageUp(e: PointerEvent) {
    const d = drag; drag = null;
    if (d && !d.moved) { openPicker(d.id); return; }
    if (!d || !scene) return;
    const x = d.ox + (e.clientX - d.sx) / scene.ppm, z = d.oz + (e.clientY - d.sy) / scene.ppm;
    scene.endDrag(d.id);
    dragId = null; dragOut = false;
    if (isOut(x, z)) {
      apply({ ...remote, keys: remote.keys.filter((k) => k.id !== d.id) });
    } else {
      const col = Math.min(remote.cols - 1, Math.max(0, colAt(x))), row = Math.min(remote.rows - 1, Math.max(0, rowAt(z)));
      if (occupied(remote, col, row, d.id)) { apply(remote); return; }
      apply({ ...remote, keys: remote.keys.map((k) => (k.id === d.id ? { ...k, col, row } : k)) });
    }
    template = null; moved = true;
    commit();
  }

  /* ---- resizing the shell (SPEC §4.3) ---- */
  let rs: { axis: "x" | "y"; sx: number; sy: number; base: Bounds } | null = null;
  let pending = 0;
  function rsDown(axis: "x" | "y", e: PointerEvent) {
    if (!sizeOn || !scene) return;
    e.preventDefault(); e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    frozenPpm = scene.ppm;
    rs = { axis, sx: e.clientX, sy: e.clientY, base: boardBounds(toDesign(remote)) };
    resizing = axis;
  }
  function rsMove(e: PointerEvent) {
    if (!rs || !scene) return;
    const min = minSize(remote), b = { ...rs.base };
    const m = SHELL_RULES.margin, chin = SHELL_RULES.chin;
    if (rs.axis === "x") b.maxX = Math.min(MAX_COLS * 18 - 9 + m, Math.max(min.cols * 18 - 9 + m, rs.base.maxX + (e.clientX - rs.sx) / frozenPpm));
    else b.maxY = Math.min(MAX_ROWS * 17 - 8.5 + chin, Math.max(min.rows * 17 - 8.5 + chin, rs.base.maxY + (e.clientY - rs.sy) / frozenPpm));
    b.minX = rs.base.minX; b.minY = rs.base.minY;
    liveBounds = b;
    if (!pending) pending = requestAnimationFrame(() => { pending = 0; if (liveBounds) scene?.setLive(liveBounds); });
  }
  function rsUp() {
    if (!rs) return;
    const b = liveBounds ?? rs.base, min = minSize(remote);
    rs = null;
    const cols = Math.min(MAX_COLS, Math.max(min.cols, Math.round((b.maxX - SHELL_RULES.margin + 9) / 18)));
    const rows = Math.min(MAX_ROWS, Math.max(min.rows, Math.round((b.maxY - SHELL_RULES.chin + 8.5) / 17)));
    cancelAnimationFrame(pending); pending = 0;
    liveBounds = null; resizing = null;
    apply({ ...remote, cols, rows });
    template = null; resized = true;
    commit();
  }

  /* ---- spare-key tray (SPEC §4.4) ---- */
  const trayKinds = $derived<CapColor[]>(added ? ["charcoal", "light", "red"] : ["charcoal"]);
  let tray = $state<{ i: number; tx: number; ty: number; drag: boolean; phase: "idle" | "hidden" | "pop" }>({ i: 0, tx: 0, ty: 0, drag: false, phase: "idle" });
  let tr: { i: number; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
  function trayDown(i: number, e: PointerEvent) {
    if (!isEdit || tr || full) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect();
    el.setPointerCapture(e.pointerId);
    tr = { i, sx: e.clientX, sy: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false };
    tray = { i, tx: 0, ty: 0, drag: true, phase: "idle" };
  }
  function trayMove(e: PointerEvent) {
    if (!tr) return;
    tr.moved = true;
    tray = { i: tr.i, tx: e.clientX - tr.sx, ty: e.clientY - tr.sy, drag: true, phase: "idle" };
  }
  function trayUp() {
    const t = tr; tr = null;
    if (!t || !scene) return;
    const back = () => (tray = { i: t.i, tx: 0, ty: 0, drag: false, phase: "idle" });
    if (!t.moved) return back();
    const p = scene.toMm(t.cx + tray.tx, t.cy + tray.ty);
    const col = colAt(p.x), row = rowAt(p.z);
    if (isOut(p.x, p.z) || !inside(remote, { col, row }) || occupied(remote, col, row) || full) return back();
    const id = newId();
    apply({ ...remote, keys: [...remote.keys, { id, col, row, color: trayKinds[t.i] ?? "charcoal" }] });
    scene.spawnAt(id, p.x, p.z);
    tray = { i: t.i, tx: 0, ty: 0, drag: false, phase: "hidden" };
    setTimeout(() => { added = true; tray = { i: t.i, tx: 0, ty: 0, drag: false, phase: "pop" }; }, 30);
    setTimeout(() => (tray = { i: t.i, tx: 0, ty: 0, drag: false, phase: "idle" }), 700);
    template = null;
    commit();
  }

  /* ---- buying ---- */
  const quotes = $derived(Object.fromEntries(TIERS.map((t) => [t.id, quote(remote, t.id)])) as Record<TierId, ReturnType<typeof quote>>);
  const chosen = $derived(tier ? quotes[tier] : null);
  /* A solid you can print and hold before buying anything: built in the page with Manifold,
   * loaded only when asked for. */
  let modelling = $state(false);
  let hand = $state.raw<HandModel | null>(null);
  async function printModel() {
    failure = ""; modelling = true;
    try {
      const [{ default: Module }, { default: wasmUrl }, { handModel }] = await Promise.all([
        import("manifold-3d"), import("manifold-3d/manifold.wasm?url"), import("./handmodel"),
      ]);
      const wasm = await Module({ locateFile: () => wasmUrl });
      wasm.setup();
      hand = handModel(wasm, remote);
    } catch { failure = "The model did not build. Try again."; }
    finally { modelling = false; }
  }
  async function getFiles() {
    failure = ""; busy = "Sending your design…";
    try {
      const { zip } = await routeBoard(toDesign(remote), (t) => (busy = t));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zip); a.download = "open-clicker-files.zip"; a.click(); URL.revokeObjectURL(a.href);
      doneKind = "files"; screen = "done";
    } catch (e) { failure = e instanceof Error ? e.message : String(e); }
    finally { busy = ""; }
  }
  async function notify(e: SubmitEvent) {
    e.preventDefault();
    failure = ""; busy = "Saving…";
    try {
      const res = await fetch(`${ROUTER_URL}/notify`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, tier, design: toDesign(remote) }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `The server answered ${res.status}.`);
      doneKind = "list"; screen = "done";
    } catch (err) { failure = err instanceof Error ? err.message : String(err); }
    finally { busy = ""; }
  }
  const tierName = $derived(TIERS.find((t) => t.id === tier)?.name ?? "");

  /* grabber and template thumbnail geometry */
  /* Template thumbnails share one scale so their sizes compare. */
  const T = 0.9;
</script>

<div class="canvas" bind:this={canvasHost} aria-hidden="true"></div>
<div class="labels" bind:this={labelHost}></div>

{#if hand}
  <HandPreview model={hand} onclose={() => (hand = null)} />
{/if}

{#if picker}
  {@const now = labels[picker.id]?.fn}
  {@const locked = !!labels[picker.id]?.locked}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="picker-shade" onclick={() => describe()}></div>
  <div class="picker" role="dialog" aria-label="Choose this key's label" style={`left:${Math.min(Math.max(picker.x, 140), vw - 140)}px;top:${Math.max(picker.y, 280)}px`}>
    <div class="title">
      <span class="name">{now === "custom" ? "✦ Custom" : now ? FUNCTION_NAMES[now] : "No label yet"}</span>
      <button type="button" class="lock" class:on={locked} disabled={!now} onclick={toggleLock}
        aria-label={locked ? "Unlock this key" : "Lock this key's label"} aria-pressed={locked} title={locked ? "Locked" : "Lock"}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="4.5" y="9" width="11" height="8.5" rx="2.2" />
          <path d={locked ? "M7 9V6.8a3 3 0 0 1 6 0V9" : "M7 9V6.8a3 3 0 0 1 5.9-.8"} />
        </svg>
      </button>
    </div>
    <form onsubmit={describe}>
      <input type="text" bind:value={picker.hint} maxlength="60" enterkeyhint="done" autocomplete="off" placeholder="Describe it in your own words" aria-label="What this key does" />
    </form>
    <div class="chips">
      {#each picker.more ? ALL_FNS : pickerTop as fn (fn)}
        <button type="button" class="chip" class:on={fn === now} onclick={() => choose(fn)}>{FUNCTION_NAMES[fn]}</button>
      {/each}
      {#if !picker.more}
        <button type="button" class="chip ghost" onclick={() => picker && (picker.more = true)}>More</button>
      {/if}
    </div>
  </div>
{/if}

<div class="root" class:editing={isEdit} style={`padding-bottom:${!trayInline && trayOn ? 150 : 40}px`}>
  <div class="head">
    {#if screen === "intro" && ready}
      <h1 class="rise h1">Design your own TV remote.</h1>
      <p class="rise d1 sub">Low-profile Choc switches, hot-swap, your layout. Open source.</p>
    {:else if isEdit}
      <h1 class="rise h1">What would you change?</h1>
    {:else if screen === "buy"}
      <h1 class="rise h1">How do you want it?</h1>
      <p class="rise d1 sub">Every part, open source. Tap one to see it.</p>
    {:else if screen === "done"}
      <h1 class="rise h1">{doneKind === "files" ? "Files ready." : "You're on the list."}</h1>
      <p class="rise d1 sub">{tierName} · {usd(chosen ? total(chosen) : 0)}</p>
    {/if}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="stage" class:live={isEdit} class:movable={keysOn} bind:this={stageEl} style={`width:${stage.w}px;height:${stage.h}px;transition:${resizing ? "none" : "width .6s cubic-bezier(.2,.8,.2,1), height .6s cubic-bezier(.2,.8,.2,1)"}`}
    onpointerdown={stageDown} onpointermove={stageMove} onpointerup={stageUp} onpointercancel={stageUp}>
    {#if isEdit}
      <button type="button" class="grab y" class:on={resizing === "y"} class:shown={sizeOn} aria-label="Resize height" style={`left:${stage.w / 2 - 14}px;top:${stage.h - 9}px`}
        onpointerdown={(e) => rsDown("y", e)} onpointermove={rsMove} onpointerup={rsUp} onpointercancel={rsUp}></button>
      <button type="button" class="grab x" class:on={resizing === "x"} class:shown={sizeOn} aria-label="Resize width" style={`left:${stage.w - 9}px;top:${stage.h / 2 - 14}px`}
        onpointerdown={(e) => rsDown("x", e)} onpointermove={rsMove} onpointerup={rsUp} onpointercancel={rsUp}></button>
      <div class="cue move" class:gone={moved || !!dragId} aria-hidden="true" style={`left:${stage.w / 2}px`}>
        <svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>Drag a key to move it
      </div>
      <div class="cue size" class:gone={resized || !!resizing} aria-hidden="true" style={`left:${stage.w + 14}px;top:${stage.h / 2}px`}>
        <svg viewBox="0 0 24 24"><path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" /></svg>Resize
      </div>
    {/if}
    {#if focus}
      <div class="card" role="status">
        <b>{focus.label}</b>
        <span>{focus.spec}</span>
        <span class="price">{focus.qty > 1 ? `${focus.qty} × ${usd(focus.unitUsd)} = ` : ""}{usd(focus.qty * focus.unitUsd)}</span>
        <span class="hint">Tap anywhere to go back.</span>
      </div>
    {/if}
  </div>

  <div class="foot">
    {#if isEdit}
      <div class="tray" class:open={trayOn} class:inline={trayInline} class:sheet={!trayInline} aria-hidden={!trayOn}>
        {#if !trayInline}<div class="pill" aria-hidden="true"></div>{/if}
        <div class="slots">
          {#each trayKinds as kind, i (kind)}
            {@const mine = tray.i === i}
            {@const size = Math.round(17.5 * editPpm)}
            <div class="slot" style={`width:${size}px;height:${size}px`}>
              <div class="outline" style={`opacity:${mine && (tray.drag || tray.phase !== "idle") ? 1 : 0}`}></div>
              <button type="button" class="spare" aria-label={`${kind} key, drag onto the remote`} tabindex={trayOn ? 0 : -1} disabled={full}
                style={`background:${CAPS[kind].base};opacity:${mine && tray.phase === "hidden" ? 0 : 1};transform:translate(${mine ? tray.tx : 0}px, ${mine ? tray.ty : 0}px) scale(${mine && tray.phase === "hidden" ? 0.3 : mine && tray.drag ? 1.1 : 1});transition:${mine && (tray.drag || tray.phase === "hidden") ? "none" : "transform .45s cubic-bezier(.34,1.56,.64,1), opacity .3s"}`}
                onpointerdown={(e) => trayDown(i, e)} onpointermove={trayMove} onpointerup={trayUp} onpointercancel={trayUp}>
                <span style={`background:${CAPS[kind].top}`}></span>
              </button>
            </div>
          {/each}
        </div>
        <div class="cta" style={`opacity:${tray.drag || added ? (full ? 1 : 0) : 1}`}>
          {#if full}Full: {MAX_KEYS} keys is the most one controller can read{:else}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="M6 11l6-6 6 6"></path></svg> Drag{/if}
        </div>
      </div>
    {/if}

    {#if screen === "intro" && ready}
      <div class="rise d1 row">
        <button type="button" class="btn primary" onclick={edit}>Make it mine</button>
        <button type="button" class="btn ghost" onclick={makeOrBuy}>It's perfect</button>
      </div>
    {/if}
    {#if isEdit && makeShown}
      <button type="button" class="btn primary rise" onclick={makeOrBuy}>Build or Buy</button>
    {:else if isEdit && count > 0}
      <button type="button" class="link rise" onclick={makeOrBuy}>Build or Buy</button>
    {/if}
    {#if isEdit && acts > 0 && !templatesShown}
      <button type="button" class="link rise" onclick={() => (templatesShown = true)}>Start Over</button>
    {/if}

    {#if screen === "buy"}
      <div class="rise list">
        {#each TIERS as t (t.id)}
          <button type="button" class="opt" class:on={tier === t.id} aria-pressed={tier === t.id} onclick={() => { tier = t.id; failure = ""; asking = false; }}>
            <span class="radio" aria-hidden="true">{#if tier === t.id}<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>{/if}</span>
            <span class="what"><b>{t.name}</b><span>{t.line}</span></span>
            <span class="money">{usd(total(quotes[t.id]))}</span>
          </button>
        {/each}
      </div>
      {#if chosen && tier !== "complete"}
        <div class="rise parts">
          {#each chosen.lines as p}
            <div class="line"><div>{p.label}{#if p.qty > 1}<span class="qty"> × {p.qty}</span>{/if}</div><div class="cost">{p.unitUsd === 0 ? "Included" : usd(p.qty * p.unitUsd)}</div></div>
          {/each}
          <div class="line sum"><div>Total</div><div>{usd(total(chosen))}</div></div>
        </div>
      {/if}
      {#if tier === "diy"}
        <button type="button" class="btn primary rise" disabled={!!busy} onclick={getFiles}>{busy || "Get the files"}</button>
        <p class="note rise">Gerbers for any board maker, plus the full KiCad project.</p>
      {:else if tier && !asking}
        <button type="button" class="btn primary rise" onclick={() => (asking = true)}>Notify me</button>
        <p class="note rise">We are not selling these yet. Leave an email and we will write once.</p>
      {:else if tier}
        <form class="rise ask" onsubmit={notify}>
          <input type="email" required placeholder="you@example.com" bind:value={email} aria-label="Email" autocomplete="email" />
          <button type="submit" class="btn primary" disabled={!!busy}>{busy || "Send"}</button>
        </form>
      {/if}
      {#if failure}<p class="note err">{failure}</p>{/if}
      <button type="button" class="link rise d2" disabled={modelling} onclick={printModel}>{modelling ? "Building the model…" : "Print a hand model"}</button>
      <button type="button" class="link rise d2" onclick={back}>Back</button>
    {/if}

    {#if screen === "done"}
      <div class="rise tick" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg></div>
      <button type="button" class="link rise d2" onclick={again}>Design another</button>
    {/if}
  </div>

  <div class="panel" class:sheet={vw < 760} class:side={vw >= 760} class:open={isEdit && templatesShown} aria-hidden={!(isEdit && templatesShown)}>
    {#if vw < 760}<div class="pill" aria-hidden="true"></div>{/if}
    <p class="try">Try one</p>
    <div class="tpls">
      {#each ["streamer", "boomer", "brick"] as const as name}
        {@const L = LAYOUTS[name]}
        <button type="button" class="tpl" class:on={template === name} aria-label={`${L.name} layout`} tabindex={templatesShown ? 0 : -1} onclick={() => applyTemplate(name)}>
          <div class="frame">
            <div class="mini" style={`width:${L.cols * 18 * T + 8}px;height:${(L.rows * 17 + 26) * T}px`}>
              {#each L.keys as [c, r, color]}
                <div style={`left:${4 + c * 18 * T}px;top:${4 + r * 17 * T}px;width:${16 * T}px;height:${15 * T}px;background:${CAPS[color].top}`}></div>
              {/each}
            </div>
          </div>
          <span>{L.name}</span>
        </button>
      {/each}
    </div>
    <button type="button" class="link" tabindex={templatesShown ? 0 : -1} onclick={() => applyTemplate("blank")}>Empty Remote</button>
  </div>
</div>

<style>
  .canvas { position: fixed; inset: 0; z-index: 0; }
  .labels { position: fixed; inset: 0; z-index: 4; pointer-events: none; }
  .labels :global(.part-pill) { pointer-events: auto; }
  .root { position: relative; z-index: 1; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; padding: 40px 16px; pointer-events: none; }
  .root :is(button, input, form, .panel, .tray, .list, .parts) { pointer-events: auto; }
  .root.editing { user-select: none; -webkit-user-select: none; }
  .head { min-height: 88px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 10px; text-align: center; max-width: 560px; }
  .sub { margin: 0; font-size: 15px; color: #6e6e73; }
  .stage { position: relative; margin: 28px 0; flex: none; touch-action: none; animation: enter 1.1s cubic-bezier(.2,.8,.2,1) both; }
  .stage.live { pointer-events: auto; cursor: pointer; }
  .stage.movable { cursor: grab; }
  .picker-shade { position: fixed; inset: 0; z-index: 30; pointer-events: auto; }
  .picker { position: fixed; z-index: 31; width: 252px; transform: translate(-50%, calc(-100% - 12px)); background: rgba(255,255,255,.96); backdrop-filter: blur(20px);
    border-radius: 20px; padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 10px;
    box-shadow: 0 0 0 .5px rgba(0,0,0,.08), 0 24px 48px -20px rgba(0,0,0,.35); pointer-events: auto; animation: rise .25s cubic-bezier(.2,.8,.2,1) both; }
  .picker .title { display: flex; align-items: center; justify-content: space-between; min-height: 28px; }
  .picker .name { font: 600 15px/1.2 Geist, sans-serif; color: #1d1d1f; letter-spacing: -.01em; }
  .picker .lock { width: 28px; height: 28px; margin-right: -6px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
    background: none; color: #aeaeb2; cursor: pointer; transition: color .2s, background .2s; }
  .picker .lock:hover:not(:disabled) { background: #f2f2f4; color: #6e6e73; }
  .picker .lock.on { color: #1d1d1f; }
  .picker .lock:disabled { opacity: .35; cursor: default; }
  .picker .lock svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
  .picker .lock svg rect { fill: currentColor; stroke: none; }
  .picker input { width: 100%; box-sizing: border-box; height: 36px; padding: 0 12px; border: 0; border-radius: 10px; background: #f2f2f4; color: #1d1d1f;
    font: 400 16px Geist, sans-serif; outline: none; transition: box-shadow .2s, background .2s; }
  .picker input::placeholder { color: #8e8e93; font-size: 14px; }
  .picker input:focus { background: #fff; box-shadow: 0 0 0 1.5px #1d1d1f inset; }
  .picker .chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 196px; overflow: auto; }
  .picker .chip { border: 0; border-radius: 15px; padding: 0 11px; height: 30px; font: 500 13px/30px Geist, sans-serif; background: #f2f2f4; color: #1d1d1f; cursor: pointer; transition: background .15s; }
  .picker .chip:hover { background: #e8e8ed; }
  .picker .chip.on { box-shadow: 0 0 0 1.5px #1d1d1f inset; background: #fff; }
  .picker .chip.ghost { background: none; color: #6e6e73; padding: 0 6px; }
  .picker .chip.ghost:hover { color: #1d1d1f; }
  .foot { min-height: 120px; display: flex; flex-direction: column; align-items: center; gap: 14px; width: 100%; max-width: 860px; }
  .row { display: flex; gap: 12px; }

  .grab { position: absolute; border: 0; padding: 0; background: #48484a; border-radius: 2px; opacity: 0; pointer-events: none; touch-action: none; z-index: 5;
    transition: opacity .6s, background .2s; }
  .grab::after { content: ""; position: absolute; inset: -14px; }
  .grab.y { width: 28px; height: 4px; cursor: ns-resize; }
  .grab.x { width: 4px; height: 28px; cursor: ew-resize; }
  .grab.shown { opacity: 1; pointer-events: auto; }
  .grab:hover { background: #8e8e93; }
  .grab.on { background: #d1d1d6; }

  .tray { display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none !important; opacity: 0; }
  .tray.open { pointer-events: auto !important; opacity: 1; }
  .tray.inline { transition: opacity .4s; width: 100%; }
  .tray.sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 19; background: #fff; border-radius: 24px 24px 0 0; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 -16px 48px -24px rgba(0,0,0,.3);
    padding: 10px 16px calc(16px + env(safe-area-inset-bottom)); transform: translateY(110%); transition: transform .6s cubic-bezier(.2,.8,.2,1), opacity .4s; }
  .tray.sheet.open { transform: translateY(0); }
  .slots { display: flex; gap: 16px; justify-content: center; align-items: center; }
  .slot { position: relative; }
  .outline { position: absolute; inset: 0; border-radius: 5px; border: 1.5px dashed #aeaeb2; transition: opacity .3s; }
  .spare { position: absolute; inset: 0; border-radius: 5px; border: 0; padding: 0; cursor: grab; touch-action: none; z-index: 21;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.1), inset 0 -2px 0 rgba(0,0,0,.45), 0 1px 0 rgba(0,0,0,.6); }
  .spare span { position: absolute; left: 12%; top: 9%; width: 76%; height: 70%; border-radius: 3px; pointer-events: none; }
  .spare:disabled { cursor: default; opacity: .35 !important; }
  .cue { position: absolute; display: flex; align-items: center; gap: 5px; white-space: nowrap; pointer-events: none; font-size: 12px; font-weight: 500; color: #6e6e73;
    animation: cue .6s .9s cubic-bezier(.2,.8,.2,1) both; transition: opacity .5s, transform .5s; }
  .cue svg { width: 12px; height: 12px; fill: none; stroke: #8e8e93; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .cue.move { top: -24px; transform: translateX(-50%); }
  .cue.size { transform: translateY(-50%); }
  .cue.gone { opacity: 0 !important; animation: none; }
  @keyframes cue { from { opacity: 0; } to { opacity: 1; } }
  .cta { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; color: #6e6e73; transition: opacity .4s; }
  .pill { width: 36px; height: 5px; border-radius: 3px; background: #d1d1d6; }

  .panel { position: fixed; z-index: 20; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 24px 60px -24px rgba(0,0,0,.35); display: flex; flex-direction: column;
    align-items: center; gap: 8px; transition: transform .6s cubic-bezier(.2,.8,.2,1), opacity .4s; pointer-events: none !important; }
  .panel.open { pointer-events: auto !important; }
  .panel.side { left: 24px; top: 50%; border-radius: 24px; padding: 18px 16px 10px; transform: translate(calc(-100% - 40px), -50%); opacity: 0; }
  .panel.side.open { transform: translate(0, -50%); opacity: 1; }
  .panel.sheet { left: 0; right: 0; bottom: 0; border-radius: 24px 24px 0 0; padding: 10px 16px calc(14px + env(safe-area-inset-bottom)); transform: translateY(110%); }
  .panel.sheet.open { transform: translateY(0); }
  .try { margin: 4px 0 0; font-size: 15px; color: #6e6e73; }
  .tpls { display: flex; gap: 4px; justify-content: center; }
  .tpl { background: none; border: 0; padding: 12px 10px 10px; font: inherit; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 12px; border-radius: 18px;
    transition: background .25s, transform .3s cubic-bezier(.2,.8,.2,1); color: #1d1d1f; font-size: 13px; font-weight: 500; }
  .tpl:hover { background: rgba(0,0,0,.05); transform: translateY(-2px); }
  .tpl.on { background: rgba(0,0,0,.07); }
  .frame { width: 76px; height: 176px; display: flex; align-items: center; justify-content: center; }
  .mini { position: relative; border-radius: 8px; background: #161618; box-shadow: 0 6px 14px -6px rgba(0,0,0,.5); }
  .mini div { position: absolute; border-radius: 2px; }

  .list { width: 100%; max-width: 420px; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 14px 32px -22px rgba(0,0,0,.25); }
  .opt { display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 18px; border: 0; background: none; font: inherit; text-align: left; cursor: pointer; color: #1d1d1f;
    border-top: 1px solid rgba(0,0,0,.07); transition: background .2s; }
  .opt:first-child { border-top: 0; }
  .opt:hover { background: rgba(0,0,0,.025); }
  .radio { flex: none; width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 0 0 1.5px #c7c7cc inset; display: flex; align-items: center; justify-content: center; color: #fff; transition: background .2s, box-shadow .2s; }
  .opt.on .radio { background: #1d1d1f; box-shadow: 0 0 0 1.5px #1d1d1f inset; }
  .what { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .what b { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
  .what span { font-size: 13px; line-height: 1.35; color: #6e6e73; }
  .money { font-size: 16px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .parts { width: 100%; max-width: 420px; background: #fff; border-radius: 20px; padding: 8px 18px; box-shadow: 0 0 0 1px rgba(0,0,0,.06); }
  .line { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-top: 1px solid rgba(0,0,0,.07); font-size: 14px; }
  .line:first-child { border-top: 0; }
  .line .qty { color: #8e8e93; }
  .line .cost { font-variant-numeric: tabular-nums; color: #6e6e73; white-space: nowrap; }
  .line.sum { font-weight: 600; } .line.sum div:last-child { font-variant-numeric: tabular-nums; }
  .note { margin: -4px 0 0; font-size: 13px; color: #6e6e73; text-align: center; max-width: 360px; }
  .note.err { color: #b8261d; }
  .ask { display: flex; gap: 8px; width: 100%; max-width: 420px; }
  .ask input { flex: 1; min-width: 0; height: 46px; border-radius: 23px; border: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.14) inset; padding: 0 18px; font: inherit; font-size: 16px; background: #fff; }
  .tick { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #1d1d1f; color: #fff; }

  .card { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); width: min(320px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 2px;
    background: #fff; border-radius: 18px; padding: 12px 16px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 20px 40px -22px rgba(0,0,0,.35); pointer-events: none; z-index: 6; }
  .card b { font-size: 15px; font-weight: 600; }
  .card span { font-size: 13px; color: #6e6e73; }
  .card .price { color: #1d1d1f; font-weight: 600; font-variant-numeric: tabular-nums; }
  .card .hint { font-size: 12px; }
</style>
