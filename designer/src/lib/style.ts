import * as THREE from "three";
import type { Role } from "./parts";

export type ViewStyle = "blueprint" | "solid";

export const BLUEPRINT = {
  paper: "#0b2545",
  ink: "#d6e8ff",
  line: "#9cc8ff",
  faint: "#2f5a8c",
  accent: "#7fd1ff",
  copper: "#ffd27a",
} as const;

const SOLID: Record<Role, { color: string; metal?: number; rough?: number; opacity?: number }> = {
  fr4: { color: "#1c5a3a", rough: 0.7 },
  copper: { color: "#c9a24a", metal: 0.9, rough: 0.35 },
  "plastic-dark": { color: "#2a2b2d", rough: 0.75 },
  "plastic-light": { color: "#d9d1bd", rough: 0.6 },
  metal: { color: "#c3c7cb", metal: 0.85, rough: 0.3 },
  chip: { color: "#151617", rough: 0.5 },
  cap: { color: "#ece6d6", rough: 0.55 },
  battery: { color: "#b7bcc2", metal: 0.6, rough: 0.35 },
  shell: { color: "#e4e0d6", rough: 0.6, opacity: 0.32 },
  led: { color: "#4b4f8f", rough: 0.2, opacity: 0.75 },
  wire: { color: "#c0392b", rough: 0.6 },
};

const EDGE_ANGLE = 28;

/* Every mesh gets an edge outline once; styles only swap materials. */
export function addEdges(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if (o instanceof THREE.Mesh && !o.userData.legend) meshes.push(o); });
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

export function applyStyle(root: THREE.Object3D, style: ViewStyle) {
  root.traverse((o) => {
    if (o instanceof THREE.LineSegments && o.userData.edge) {
      o.material = style === "blueprint"
        ? cached("edge-bp", () => new THREE.LineBasicMaterial({ color: BLUEPRINT.ink, transparent: true, opacity: 0.85 }))
        : cached("edge-solid", () => new THREE.LineBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22 }));
      return;
    }
    if (!(o instanceof THREE.Mesh)) return;
    if (o.userData.legend) {
      const m = o.material as THREE.MeshBasicMaterial;
      m.color.set(style === "blueprint" ? BLUEPRINT.ink : "#1b1f1d");
      return;
    }
    const role = o.userData.role as Role | undefined;
    if (!role) return;
    if (style === "blueprint") {
      const copper = role === "copper";
      o.material = cached(`bp-${copper}`, () => new THREE.MeshBasicMaterial({
        color: copper ? BLUEPRINT.copper : BLUEPRINT.line, transparent: true, opacity: copper ? 0.55 : 0.07,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      return;
    }
    const spec = SOLID[role];
    const color = (o.userData.tint as string | undefined) ?? spec.color;
    o.material = cached(`solid-${role}-${color}`, () => new THREE.MeshStandardMaterial({
      color, metalness: spec.metal ?? 0, roughness: spec.rough ?? 0.6, side: THREE.DoubleSide,
      transparent: spec.opacity !== undefined, opacity: spec.opacity ?? 1, depthWrite: spec.opacity === undefined,
    }));
  });
}
