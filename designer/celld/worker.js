// openremote.sethgholson.com: the Open Clicker designer, served as static assets by celld.
// The Designer is one page. The Worker adds a health route and sends extensionless paths,
// including "/", to index.html (with html_handling "none", celld would 404 them).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    }
    const last = url.pathname.split("/").pop() ?? "";
    if (last.includes(".")) return env.ASSETS.fetch(request);
    const index = new URL(url);
    index.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(index, request));
  },
};
