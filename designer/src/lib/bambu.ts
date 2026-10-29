import type { Manifold } from "manifold-3d";
import A1 from "./bambu-a1.json";
import { zip } from "./zip";

/* A Bambu Studio project (.3mf): both shell pieces on one plate of a Bambu Lab A1, PLA, 0.2 mm
 * layers, with the shell's print settings stored on each piece. Laid out the way Bambu Studio
 * writes its own projects (one object file per piece, a model_settings.config and the project
 * settings it loads as presets); a plain 3MF opens as geometry only and drops all of that. */

const BED = 256;
const GAP = 10;
const VERSION = "02.08.02.61";
/* Per-piece overrides on top of "0.20mm Standard @BBL A1": the plate needs firm walls. */
const PIECE_SETTINGS: Record<string, string> = { wall_loops: "3", sparse_infill_density: "15%" };

export interface Piece { name: string; solid: Manifold }

const NS = `xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"`;
const uuid = (kind: number, n: number) => `${kind.toString(16).padStart(8, "0")}-${n.toString(16).padStart(4, "0")}-4c03-9d28-80fed5dfa1dc`;
const num = (x: number) => +x.toFixed(5);
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function bambuProject(pieces: Piece[], title: string): Uint8Array<ArrayBuffer> {
  /* Each piece sits on the bed at z = 0, centred on its own origin; the pieces go side by side. */
  const placed = pieces.map((p) => {
    const box = p.solid.boundingBox();
    const solid = p.solid.translate([-(box.min[0] + box.max[0]) / 2, -(box.min[1] + box.max[1]) / 2, -box.min[2]]);
    return { ...p, solid, w: box.max[0] - box.min[0], h: box.max[2] - box.min[2] };
  });
  const total = placed.reduce((s, p) => s + p.w, 0) + GAP * (placed.length - 1);
  let x = (BED - total) / 2;
  const files: Record<string, string> = {};
  const objects: string[] = [], items: string[] = [], settings: string[] = [], instances: string[] = [];
  placed.forEach((p, i) => {
    const mesh = p.solid.getMesh(), n = mesh.numProp, verts: string[] = [], tris: string[] = [];
    for (let v = 0; v < mesh.vertProperties.length / n; v++) {
      verts.push(`<vertex x="${num(mesh.vertProperties[v * n]!)}" y="${num(mesh.vertProperties[v * n + 1]!)}" z="${num(mesh.vertProperties[v * n + 2]!)}"/>`);
    }
    for (let t = 0; t < mesh.triVerts.length; t += 3) tris.push(`<triangle v1="${mesh.triVerts[t]}" v2="${mesh.triVerts[t + 1]}" v3="${mesh.triVerts[t + 2]}"/>`);
    const part = i + 1, object = 100 + part, path = `/3D/Objects/object_${part}.model`;
    files[path.slice(1)] = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" ${NS}>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <resources>
  <object id="${part}" p:UUID="${uuid(0x10000, part)}" type="model">
   <mesh>
    <vertices>
${verts.join("\n")}
    </vertices>
    <triangles>
${tris.join("\n")}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build/>
</model>
`;
    objects.push(`  <object id="${object}" p:UUID="${uuid(1, part)}" type="model">
   <components>
    <component p:path="${path}" objectid="${part}" p:UUID="${uuid(0x10000, 0x100 + part)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
   </components>
  </object>`);
    items.push(`  <item objectid="${object}" p:UUID="${uuid(2, part)}" transform="1 0 0 0 1 0 0 0 1 ${num(x + p.w / 2)} ${BED / 2} 0" printable="1"/>`);
    x += p.w + GAP;
    const faces = mesh.triVerts.length / 3;
    settings.push(`  <object id="${object}">
    <metadata key="name" value="${xml(p.name)}"/>
    <metadata key="extruder" value="1"/>
${Object.entries(PIECE_SETTINGS).map(([k, v]) => `    <metadata key="${k}" value="${v}"/>`).join("\n")}
    <metadata face_count="${faces}"/>
    <part id="${part}" subtype="normal_part">
      <metadata key="name" value="${xml(p.name)}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <mesh_stat face_count="${faces}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>`);
    instances.push(`    <model_instance>
      <metadata key="object_id" value="${object}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="${part}"/>
    </model_instance>`);
  });

  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`,
    "3D/3dmodel.model": `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" ${NS}>
 <metadata name="Application">BambuStudio-${VERSION}</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">${xml(title)}</metadata>
 <resources>
${objects.join("\n")}
 </resources>
 <build p:UUID="${uuid(3, 0)}">
${items.join("\n")}
 </build>
</model>
`,
    "3D/_rels/3dmodel.model.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${placed.map((_, i) => ` <Relationship Target="/3D/Objects/object_${i + 1}.model" Id="rel-${i + 1}" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>`).join("\n")}
</Relationships>
`,
    ...files,
    "Metadata/model_settings.config": `<?xml version="1.0" encoding="UTF-8"?>
<config>
${settings.join("\n")}
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
${instances.join("\n")}
  </plate>
  <assemble>
  </assemble>
</config>
`,
    "Metadata/project_settings.config": JSON.stringify(A1, null, 1),
  });
}
