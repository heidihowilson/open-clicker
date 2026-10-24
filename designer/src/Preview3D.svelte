<script lang="ts">
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { KEYCAPS, type Action, type Design } from "./lib/design";
  import { boardBounds, XIAO, xiaoPlacement, type Bounds } from "./lib/geometry";

  let { design, selected }: { design: Design; selected: string | null } = $props();
  let host: HTMLDivElement;

  const PCB_MM = 1.6;
  const COLORS: Record<Action, string> = {
    up: "#efe6d2", down: "#efe6d2", left: "#efe6d2", right: "#efe6d2", ok: "#f4f1ea",
    back: "#9aa3a8", home: "#9aa3a8", play: "#e98a3c", escape: "#9aa3a8", space: "#e98a3c",
    volume_up: "#e98a3c", volume_down: "#e98a3c", mute: "#e98a3c", ir_power: "#d9483b", none: "#55605a",
  };

  function roundedRect(b: Bounds, radius: number, grow = 0): THREE.Shape {
    const x0 = b.minX - grow, x1 = b.maxX + grow, y0 = b.minY - grow, y1 = b.maxY + grow;
    const r = Math.min(radius + grow, (x1 - x0) / 2, (y1 - y0) / 2);
    const s = new THREE.Shape();
    s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
    s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1);
    s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    return s;
  }

  /* Shapes are drawn in the design's x/y plane, then laid flat: design y becomes world z. */
  function slab(shape: THREE.Shape, bottom: number, height: number, material: THREE.Material): THREE.Mesh {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = bottom + height;
    return mesh;
  }

  function legend(text: string, color: string): THREE.CanvasTexture {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#1d2420"; g.font = "bold 52px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 64, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function build(d: Design, sel: string | null): THREE.Group {
    const group = new THREE.Group();
    const b = boardBounds(d);
    const pcb = slab(roundedRect(b, 6), -PCB_MM, PCB_MM, new THREE.MeshStandardMaterial({ color: "#1f5e3a", roughness: 0.6 }));
    group.add(pcb);

    const cap = KEYCAPS[d.keycap];
    for (const key of d.keys) {
      const k = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(15, 3, 15), new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.8 }));
      body.position.y = 1.5;
      const stem = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), new THREE.MeshStandardMaterial({ color: "#8a5a2b" }));
      stem.position.y = 4;
      const color = COLORS[key.action];
      const side = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
      const top = new THREE.MeshStandardMaterial({ map: legend(key.label, color), roughness: 0.5 });
      const capMesh = new THREE.Mesh(new THREE.BoxGeometry(cap.widthMm, cap.heightMm, cap.depthMm), [side, side, top, side, side, side]);
      capMesh.position.y = 5 + cap.heightMm / 2;
      if (key.id === sel) side.emissive = new THREE.Color("#3a6cff");
      k.add(body, stem, capMesh);
      k.position.set(key.x, 0, key.y);
      k.rotation.y = (-key.r * Math.PI) / 180;
      group.add(k);
    }

    const at = xiaoPlacement(b);
    const xiao = new THREE.Mesh(new THREE.BoxGeometry(XIAO.widthMm, XIAO.heightMm, XIAO.lengthMm), new THREE.MeshStandardMaterial({ color: "#1d3f8f", roughness: 0.4 }));
    xiao.position.set(at.x, -PCB_MM - XIAO.heightMm / 2, at.y);
    const usb = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 7.5), new THREE.MeshStandardMaterial({ color: "#c9cdd1", metalness: 0.8, roughness: 0.3 }));
    usb.position.set(at.x, -PCB_MM - 1.6, at.y + XIAO.lengthMm / 2 - 3.5);
    group.add(xiao, usb);

    const bat = d.battery;
    const battery = new THREE.Mesh(new THREE.BoxGeometry(bat.widthMm, bat.thicknessMm, bat.lengthMm), new THREE.MeshStandardMaterial({ color: "#b8bcc2", metalness: 0.6, roughness: 0.35 }));
    battery.position.set((b.minX + b.maxX) / 2, -PCB_MM - bat.thicknessMm / 2, at.y - XIAO.lengthMm / 2 - 2 - bat.lengthMm / 2);
    group.add(battery);

    const depth = PCB_MM + Math.max(XIAO.heightMm, bat.thicknessMm) + 2;
    const shell = slab(roundedRect(b, 6, 2), -depth, depth + 3, new THREE.MeshPhysicalMaterial({ color: "#d8e6dc", transparent: true, opacity: 0.22, roughness: 0.4, depthWrite: false }));
    group.add(shell);
    return group;
  }

  $effect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#121a16");
    scene.add(new THREE.HemisphereLight("#ffffff", "#334", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 2.2); sun.position.set(60, 120, 80); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 2000);
    camera.position.set(90, 160, 190);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    let model: THREE.Group | null = null;
    let framedFor = "";

    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();

    const stopRebuild = $effect.root(() => {
      $effect(() => {
        const snapshot = $state.snapshot(design) as Design;
        if (model) { scene.remove(model); model.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
        model = build(snapshot, selected);
        scene.add(model);
        if (framedFor !== snapshot.name) {
          const b = boardBounds(snapshot);
          controls.target.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2);
          framedFor = snapshot.name;
        }
      });
    });

    let frame = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(loop); };
    loop();
    return () => { cancelAnimationFrame(frame); stopRebuild(); observer.disconnect(); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  });
</script>

<div class="preview" bind:this={host}></div>

<style>
  .preview { width: 100%; height: 100%; min-height: 320px; border-radius: 12px; overflow: hidden; }
</style>
