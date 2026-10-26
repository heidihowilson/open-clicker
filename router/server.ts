/* Open Clicker router: turns a design file into a routed board and the files a fab needs.
 * POST /jobs (design JSON) -> 202 { id }; GET /jobs/:id -> state; GET /jobs/:id/result -> zip.
 * One job routes at a time; a short queue absorbs bursts. Results live for an hour. */
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { check, errorsIn } from "../designer/src/lib/checks";
import { safeParseDesign, type Design } from "../designer/src/lib/design";
import { kicadProject } from "../designer/src/lib/kicad";
import { zip } from "../designer/src/lib/zip";

const PORT = Number(process.env.PORT ?? 8790);
const ROUTER = process.env.FREEROUTING ?? "/opt/freerouting/bin/freerouting";
const ROUTE_SCRIPT = join(import.meta.dir, "route.py");
const PYTHON = process.env.PYTHON ?? "python3";
const TIMEOUT_S = 180;
const MAX_QUEUE = 6;
const MAX_BODY = 64 * 1024;
const KEEP_MS = 60 * 60 * 1000;
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://openremote.sethgholson.com,http://localhost:5173,http://127.0.0.1:4317").split(",");

interface Report { seconds: number; segments: number; unrouted: number; problems: Record<string, number> }
interface Job { id: string; key: string; design: Design; state: "queued" | "routing" | "done" | "failed"; error?: string; report?: Report; result?: Uint8Array; name?: string; at: number }

const jobs = new Map<string, Job>();
const queue: Job[] = [];
let busy = false;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return ORIGINS.includes(origin) ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type", vary: "origin" } : {};
}
const json = (req: Request, body: unknown, status = 200) => Response.json(body, { status, headers: cors(req) });

function view(job: Job) {
  return { id: job.id, state: job.state, position: job.state === "queued" ? queue.indexOf(job) + 1 : 0, error: job.error, report: job.report };
}

async function run(cmd: string[], cwd: string): Promise<string> {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, HOME: cwd } });
  const timer = setTimeout(() => p.kill(), (TIMEOUT_S + 60) * 1000);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new Error(err.trim().split("\n").pop() || `exit ${code}`);
  return out;
}

async function route(job: Job) {
  const dir = await mkdtemp(join(tmpdir(), "clicker-"));
  try {
    const project = kicadProject(job.design);
    for (const [name, text] of Object.entries(project.files)) {
      await mkdir(dirname(join(dir, name)), { recursive: true });
      await writeFile(join(dir, name), text);
    }
    const pcb = join(dir, project.name, `${project.name}.kicad_pcb`);
    const gerberDir = join(dir, "gerbers");
    await mkdir(gerberDir);
    const out = await run([PYTHON, ROUTE_SCRIPT, pcb, gerberDir, ROUTER, String(TIMEOUT_S)], dir);
    job.report = JSON.parse(out.trim().split("\n").pop()!) as Report;

    const gerbers: Record<string, string> = {};
    for (const f of await readdir(gerberDir)) gerbers[f] = await readFile(join(gerberDir, f), "utf8");
    const files: Record<string, string | Uint8Array> = {};
    for (const name of Object.keys(project.files)) {
      const text = await readFile(join(dir, name), "utf8");
      files[name.replace(`${project.name}/`, `${project.name}/kicad/`)] = text;
    }
    files[`${project.name}/${project.name}-gerbers.zip`] = zip(gerbers);
    files[`${project.name}/ORDER.txt`] = order(job.design, project.name, job.report);
    job.result = zip(files);
    job.name = `${project.name}-routed.zip`;
    job.state = "done";
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function order(d: Design, slug: string, r: Report): string {
  return `${d.name}, revision ${d.revision}, routed by the Open Clicker router in ${r.seconds} s.
${r.unrouted ? `WARNING: ${r.unrouted} connections are not routed. Finish them in KiCad before you order.\n` : "Every connection is routed and the design-rule check passed.\n"}
To order bare boards:
1. Go to jlcpcb.com (or any fab that takes Gerbers) and choose "Order now".
2. Upload ${slug}-gerbers.zip as it is. Do not unzip it.
3. Keep the defaults: 2 layers, 1.6 mm FR-4. Any solder-mask colour works.
4. Order 5 boards, the minimum.

The kicad/ folder holds the same board, routed, for anyone who wants to change it.
`;
}

async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  job.state = "routing";
  try { await route(job); }
  catch (e) { job.state = "failed"; job.error = e instanceof Error ? e.message : String(e); console.error(job.id, job.error); }
  finally { busy = false; void pump(); }
}

setInterval(() => {
  const old = Date.now() - KEEP_MS;
  for (const [id, job] of jobs) if (job.at < old && job.state !== "routing" && job.state !== "queued") jobs.delete(id);
}, 60_000);

Bun.serve({
  port: PORT,
  maxRequestBodySize: MAX_BODY,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    if (url.pathname === "/health") return json(req, { ok: true, queued: queue.length, busy });

    if (req.method === "POST" && url.pathname === "/jobs") {
      let body: unknown;
      try { body = JSON.parse(await req.text()); } catch { return json(req, { error: "The body is not JSON." }, 400); }
      const parsed = safeParseDesign(body);
      if (!parsed.success) return json(req, { error: `Not a design file: ${parsed.error.issues[0]?.message ?? "invalid"}.` }, 400);
      const design = parsed.data;
      const errors = errorsIn(check(design));
      if (errors.length) return json(req, { error: errors[0]!.message }, 422);
      const key = createHash("sha256").update(JSON.stringify(design)).digest("hex");
      const same = [...jobs.values()].find((j) => j.key === key && j.state !== "failed");
      if (same) return json(req, view(same), 202);
      if (queue.length >= MAX_QUEUE) return json(req, { error: "The router is busy. Try again in a few minutes." }, 429);
      const job: Job = { id: crypto.randomUUID(), key, design, state: "queued", at: Date.now() };
      jobs.set(job.id, job); queue.push(job); void pump();
      return json(req, view(job), 202);
    }

    const m = url.pathname.match(/^\/jobs\/([0-9a-f-]{36})(\/result)?$/);
    if (req.method === "GET" && m) {
      const job = jobs.get(m[1]!);
      if (!job) return json(req, { error: "No such job. Results are kept for an hour." }, 404);
      if (!m[2]) return json(req, view(job));
      if (job.state !== "done" || !job.result) return json(req, { error: "Not ready yet." }, 409);
      return new Response(job.result, { headers: { ...cors(req), "content-type": "application/zip", "content-disposition": `attachment; filename="${job.name}"` } });
    }
    return json(req, { error: "Not found." }, 404);
  },
});
console.log(`router on :${PORT}`);
