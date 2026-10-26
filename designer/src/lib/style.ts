import * as THREE from "three";
import type { Role } from "./parts";

/* Materials for the 3D model. The model is always the brand colourway, in both themes; only
 * the viewport around it changes. */
const SOLID: Record<Role, { color: string; metal?: number; rough?: number }> = {
  fr4: { color: "#1c5a3a", rough: 0.7 },
  copper: { color: "#c9a24a", metal: 0.9, rough: 0.35 },
  "plastic-dark": { color: "#2a2b2d", rough: 0.75 },
  "plastic-light": { color: "#d9d1bd", rough: 0.6 },
  metal: { color: "#c3c7cb", metal: 0.85, rough: 0.3 },
  chip: { color: "#151617", rough: 0.5 },
  cap: { color: "#fdf8ee", rough: 0.55 },
  battery: { color: "#b7bcc2", metal: 0.6, rough: 0.35 },
  shell: { color: "#f3d77a", rough: 0.7 },
  led: { color: "#4b4f8f", rough: 0.2 },
  wire: { color: "#c0392b", rough: 0.6 },
  slot: { color: "#2a1419", rough: 0.9 },
};

const EDGE_ANGLE = 28;

/* Every mesh gets a faint edge outline once; styling only swaps materials. */
export function addEdges(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if (o instanceof THREE.Mesh && !o.userData.legend && !o.userData.noEdges) meshes.push(o); });
  for (const m of meshes) {
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, EDGE_ANGLE), new THREE.LineBasicMaterial());
    lines.userData.edge = true;
    lines.raycast = () => {};
    m.add(lines);
  }
}

const cache = new Map<string, THREE.Material>();
function cached(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key);
  if (!m) { m = make(); cache.set(key, m); }
  return m;
}

/* With a focused part, everything outside it turns to a faint ghost in the viewport colour. */
export function applyStyle(root: THREE.Object3D, ghostColor: string, focus: THREE.Object3D | null = null) {
  const lit = new Set<THREE.Object3D>();
  focus?.traverse((o) => lit.add(o));
  root.traverse((o) => {
    const ghost = focus !== null && !lit.has(o);
    if (o instanceof THREE.LineSegments && o.userData.edge) {
      o.material = ghost
        ? cached(`edge-ghost-${ghostColor}`, () => new THREE.LineBasicMaterial({ color: ghostColor, transparent: true, opacity: 0.35 }))
        : cached("edge", () => new THREE.LineBasicMaterial({ color: "#2a1419", transparent: true, opacity: 0.18 }));
      return;
    }
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.legend) {
      (o.material as THREE.MeshBasicMaterial).opacity = ghost ? 0.08 : 1;
      return;
    }
    const role = o.userData.role as Role | undefined;
    if (!role) return;
    if (ghost) {
      o.material = cached(`ghost-${ghostColor}`, () => new THREE.MeshBasicMaterial({
        color: ghostColor, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
      }));
      return;
    }
    const spec = SOLID[role];
    const color = (o.userData.tint as string | undefined) ?? spec.color;
    o.material = cached(`solid-${role}-${color}`, () => new THREE.MeshStandardMaterial({
      color, metalness: spec.metal ?? 0, roughness: spec.rough ?? 0.6, side: THREE.DoubleSide,
    }));
  });
}
