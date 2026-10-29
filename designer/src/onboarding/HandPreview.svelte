<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import type { HandModel } from "./handmodel";

  /* The mockup, to turn and pinch before printing it. One colour, soft light, the
   * same proportions as the print. */
  let { model, onclose }: { model: HandModel; onclose: () => void } = $props();
  let host: HTMLDivElement;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([model.stl], { type: "model/stl" })); a.download = "open-clicker-mockup.stl"; a.click(); URL.revokeObjectURL(a.href);
  }

  onMount(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa0aa, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(80, -120, 160); scene.add(key);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(model.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(model.indices, 1));
    geometry.computeVertexNormals();
    geometry.center();
    const body = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.55, flatShading: true }));
    scene.add(body);
    const size = Math.max(...model.size);
    const camera = new THREE.PerspectiveCamera(30, 1, 1, size * 20);
    camera.up.set(0, 0, 1);
    camera.position.set(size * 1.3, -size * 2.2, size * 1.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false;
    controls.minDistance = size * 0.6; controls.maxDistance = size * 6;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.2;
    controls.addEventListener("start", () => (controls.autoRotate = false));
    const fit = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(host);
    let raf = 0;
    const tick = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); geometry.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="shade" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-label="Mockup">
  <div class="view" bind:this={host}></div>
  <p class="size">{model.size.map((n) => Math.round(n)).join(" × ")} mm · drag to turn, pinch to zoom</p>
  <div class="row">
    <button type="button" class="btn ghost" onclick={onclose}>Close</button>
    <button type="button" class="btn primary" onclick={download}>Download STL</button>
  </div>
</div>

<style>
  .shade { position: fixed; inset: 0; z-index: 40; background: rgba(245,245,247,.72); backdrop-filter: blur(8px); animation: fade .3s both; }
  .sheet { position: fixed; z-index: 41; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92vw, 520px); background: #fff; border-radius: 24px; padding: 14px 14px 18px;
    box-shadow: 0 0 0 .5px rgba(0,0,0,.08), 0 30px 60px -24px rgba(0,0,0,.35); display: flex; flex-direction: column; align-items: center; gap: 12px; animation: pop .35s cubic-bezier(.2,.8,.2,1) both; }
  .view { width: 100%; height: min(60vh, 420px); border-radius: 16px; background: #f5f5f7; touch-action: none; overflow: hidden; }
  .size { margin: 0; font-size: 12px; color: #6e6e73; }
  .row { display: flex; gap: 10px; }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: translate(-50%, -46%); } }
</style>
