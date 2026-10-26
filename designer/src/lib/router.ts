import type { Design } from "./design";

/* Client for the Open Clicker router (router/ in this repository). */
export const ROUTER_URL = (import.meta.env.VITE_ROUTER_URL as string | undefined) ?? "https://clicker-router.sethgholson.com";

export interface RouteReport { seconds: number; segments: number; unrouted: number; problems: Record<string, number> }
interface JobView { id: string; state: "queued" | "routing" | "done" | "failed"; position: number; error?: string; report?: RouteReport }

async function call(path: string, init?: RequestInit): Promise<JobView> {
  const res = await fetch(`${ROUTER_URL}${path}`, init);
  const body = await res.json().catch(() => ({ error: `The router answered ${res.status}.` }));
  if (!res.ok && res.status !== 202) throw new Error((body as { error?: string }).error ?? `The router answered ${res.status}.`);
  return body as JobView;
}

/** Route a design and return the zip. `progress` gets a short sentence while it works. */
export async function routeBoard(design: Design, progress: (text: string) => void): Promise<{ zip: Blob; report: RouteReport }> {
  let job = await call("/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(design) });
  const started = Date.now();
  while (job.state === "queued" || job.state === "routing") {
    const secs = Math.round((Date.now() - started) / 1000);
    progress(job.state === "queued" ? `Waiting for the router, ${job.position} in line.` : `Routing the traces… ${secs} s`);
    await new Promise((r) => setTimeout(r, 2000));
    job = await call(`/jobs/${job.id}`);
  }
  if (job.state === "failed" || !job.report) throw new Error(job.error ?? "The router could not finish this board.");
  const res = await fetch(`${ROUTER_URL}/jobs/${job.id}/result`);
  if (!res.ok) throw new Error(`Could not download the routed board (${res.status}).`);
  return { zip: await res.blob(), report: job.report };
}
