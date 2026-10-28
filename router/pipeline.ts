/* The board pipeline: design file -> KiCad project -> KiCad-built board -> Freerouting ->
 * KiCad checks -> Gerbers -> an independent Gerber read-back. Used by server.ts and selftest.ts. */
import { cp, mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Design } from "../designer/src/lib/design";
import { kicadProject } from "../designer/src/lib/kicad";
import { zip } from "../designer/src/lib/zip";

const ROUTER = process.env.FREEROUTING ?? "/opt/freerouting/bin/freerouting";
const PYTHON = process.env.PYTHON ?? "python3";
const BOARD_SCRIPT = join(import.meta.dir, "board.py");
const ROUTE_SCRIPT = join(import.meta.dir, "route.py");
const VERIFY_SCRIPT = join(import.meta.dir, "verify.py");
const FOOTPRINTS = join(import.meta.dir, "footprints");
const TIMEOUT_S = 180;

export interface Report { seconds: number; segments: number; unrouted: number; stubs_removed: number; problems: Record<string, number>; silk: Record<string, number>; parity: Record<string, number>; gerbers: { outline_mm: number[]; holes: number; drilled: number; problems: string[] } }

async function run(cmd: string[], cwd: string): Promise<string> {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, HOME: cwd } });
  const timer = setTimeout(() => p.kill(), (TIMEOUT_S + 60) * 1000);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new Error(err.trim().split("\n").pop() || `exit ${code}`);
  return out;
}

export async function buildBoard(design: Design): Promise<{ zip: Uint8Array<ArrayBuffer>; report: Report; name: string }> {
  const dir = await mkdtemp(join(tmpdir(), "clicker-"));
  try {
    const project = kicadProject(design);
    const home = join(dir, project.name);
    for (const [name, text] of Object.entries(project.files)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), text);
    }
    await cp(join(FOOTPRINTS, "OpenClicker.pretty"), join(home, "OpenClicker.pretty"), { recursive: true });
    const spec = join(dir, "spec.json");
    await writeFile(spec, JSON.stringify(project.spec));
    const pcb = join(home, `${project.name}.kicad_pcb`);
    const gerberDir = join(dir, "gerbers"), previewDir = join(dir, "preview");
    await mkdir(gerberDir);

    await run([PYTHON, BOARD_SCRIPT, spec, pcb, FOOTPRINTS], dir);
    const routed = JSON.parse(lastLine(await run([PYTHON, ROUTE_SCRIPT, pcb, gerberDir, ROUTER, String(TIMEOUT_S)], dir)));
    const gerbers = JSON.parse(lastLine(await run([PYTHON, VERIFY_SCRIPT, pcb, gerberDir, previewDir], dir)));
    const report = { ...routed, gerbers } as Report;

    /* Correctness first: a board that fails a check is not handed out. */
    const failed = [
      ...Object.entries(report.problems).map(([k, n]) => `${n} × ${k.replace(/_/g, " ")}`),
      ...Object.entries(report.parity).map(([k, n]) => `schematic mismatch: ${n} × ${k.replace(/_/g, " ")}`),
      ...report.gerbers.problems,
    ];
    if (failed.length) throw Object.assign(new Error(`The board did not pass its checks: ${failed.join("; ")}.`), { detail: (routed as { parity_detail?: string[] }).parity_detail ?? [] });

    const gerberFiles: Record<string, string> = {};
    for (const f of await readdir(gerberDir)) gerberFiles[f] = await readFile(join(gerberDir, f), "utf8");
    const files: Record<string, string | Uint8Array> = {};
    for (const f of await readdir(home, { recursive: true, withFileTypes: true })) {
      if (!f.isFile() || /\.(dsn|ses|json)$/.test(f.name) || f.name.endsWith(".kicad_prl")) continue;
      const path = join(f.parentPath, f.name);
      files[`${project.name}/kicad/${path.slice(home.length + 1)}`] = await readFile(path, "utf8");
    }
    for (const side of ["top", "bottom"]) files[`${project.name}/preview-${side}.svg`] = await readFile(join(previewDir, `preview-${side}.svg`), "utf8");
    files[`${project.name}/${project.name}-gerbers.zip`] = zip(gerberFiles);
    files[`${project.name}/CHECKS.txt`] = checks(report);
    files[`${project.name}/ORDER.txt`] = order(design, project.name, report);
    return { zip: zip(files), report, name: `${project.name}-routed.zip` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const lastLine = (out: string) => out.trim().split("\n").pop()!;

function silkNote(r: Report): string {
  const n = Object.values(r.silk).reduce((a, b) => a + b, 0);
  return n ? `\n   It also listed ${n} silkscreen notes, where printed outlines touch pads or each other. They do not\n   change the copper; board makers trim printing off pads automatically.` : "";
}

function checks(r: Report): string {
  return `Checks this board passed before it was handed out:

1. KiCad 9 built the board from published footprints only (router/footprints/README.md).
2. Freerouting routed every connection${r.unrouted ? ` except ${r.unrouted}` : ""} in ${r.seconds} s${r.stubs_removed ? `; KiCad's cleanup then removed ${r.stubs_removed} dead-end track stubs` : ""}.
3. KiCad's design-rule check found no electrical errors or warnings.${silkNote(r)}
4. KiCad's schematic parity check found the board and the schematic identical.
5. gerbonara, an independent Gerber reader, read the files back: the outline is ${r.gerbers.outline_mm.join(" × ")} mm
   and all ${r.gerbers.holes} holes are in the drill files.

preview-top.svg and preview-bottom.svg show exactly what the board maker receives.
`;
}

function order(d: Design, slug: string, r: Report): string {
  return `${d.name}, revision ${d.revision}, routed by the Open Clicker router in ${r.seconds} s.
${r.unrouted ? `WARNING: ${r.unrouted} connections are not routed. Finish them in KiCad before you order.\n` : "Every connection is routed and every check passed (CHECKS.txt).\n"}
To order bare boards:
1. Go to jlcpcb.com (or any fab that takes Gerbers) and choose "Order now".
2. Upload ${slug}-gerbers.zip as it is. Do not unzip it.
3. Keep the defaults: 2 layers, 1.6 mm FR-4. Any solder-mask colour works.
4. Order 5 boards, the minimum.

The kicad/ folder holds the same board, routed, for anyone who wants to change it in KiCad 9 or later.
`;
}

