/* Open Clicker router: turns a design file into a routed board and the files a fab needs.
 * POST /jobs (design JSON) -> 202 { id }; GET /jobs/:id -> state; GET /jobs/:id/result -> zip.
 * One job routes at a time; a short queue absorbs bursts. Results live for an hour. */
import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { z } from "zod";
import { join } from "node:path";
import { check, errorsIn } from "../designer/src/lib/checks";
import { safeParseDesign, type Design } from "../designer/src/lib/design";
import { buildBoard, type Report } from "./pipeline";

const PORT = Number(process.env.PORT ?? 8790);
const MAX_QUEUE = 6;
const MAX_BODY = 64 * 1024;
const KEEP_MS = 60 * 60 * 1000;
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const NotifySchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), tier: z.enum(["diy", "kit", "complete"]).nullable() });
const lastNotify = new Map<string, number>();
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://openremote.sethgholson.com,http://localhost:5173,http://127.0.0.1:4317").split(",");

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

async function route(job: Job) {
  const { zip: result, report, name } = await buildBoard(job.design);
  job.report = report; job.result = result; job.name = name; job.state = "done";
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

    /* "Notify me" for Kit and Complete until there is a shop: one JSON line per request. */
    if (req.method === "POST" && url.pathname === "/notify") {
      let body: unknown;
      try { body = JSON.parse(await req.text()); } catch { return json(req, { error: "The body is not JSON." }, 400); }
      const parsed = NotifySchema.safeParse(body);
      if (!parsed.success) return json(req, { error: "That email address does not look right." }, 400);
      const ip = req.headers.get("cf-connecting-ip") ?? "local";
      if (Date.now() - (lastNotify.get(ip) ?? 0) < 10_000) return json(req, { error: "One moment, then try again." }, 429);
      lastNotify.set(ip, Date.now());
      const design = safeParseDesign((body as { design?: unknown }).design);
      await mkdir(DATA_DIR, { recursive: true });
      await appendFile(join(DATA_DIR, "notify.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...parsed.data, keys: design.success ? design.data.keys.length : null }) + "\n");
      return json(req, { ok: true });
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
