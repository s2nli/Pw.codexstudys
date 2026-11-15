/**
 * Cloudflare Pages Function proxy:  /api/content/<anything>?<query>  ->  content source /api/<anything>?<query>
 * Same behaviour as api/content/[...path].js (Vercel).
 */
const ORIGIN = "https://vidcloud.eu.org";
const PRIMARY = "https://proxy.streamvideo.co.in/fetch/api.penpencil.co";
const CATALOG = "https://studystark.github.io/batches/batches.json";
const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";
const HEADERS = { Accept: "application/json", "User-Agent": UA };
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8" };

let token = null;
let tokenAt = 0;

async function getToken(force) {
  if (!force && token && Date.now() - tokenAt < 5 * 60 * 1000) return token;
  try {
    const r = await fetch(`${ORIGIN}/generate_token.php`, { headers: { ...HEADERS, Referer: `${ORIGIN}/` } });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.success && j.access_token) { token = j.access_token; tokenAt = Date.now(); return token; }
  } catch (e) { /* ignore */ }
  return null;
}

function healthy(status, body) {
  if (status < 200 || status >= 300) return false;
  try { return JSON.parse(body).success !== false; } catch (e) { return false; }
}

async function upstream(path, search) {
  try {
    const r = await fetch(`${PRIMARY}/${path}${search}`, { headers: HEADERS });
    const body = await r.text();
    if (healthy(r.status, body)) return { status: r.status, body };
  } catch (e) { /* fall through */ }

  const call = (t) => fetch(`${ORIGIN}/api/${path}${search}`, {
    headers: { ...HEADERS, Referer: `${ORIGIN}/`, ...(t ? { Authorization: `Bearer ${t}` } : {}) },
  });
  try {
    let r = await call(await getToken(false));
    if (r.status === 401 || r.status === 403) r = await call(await getToken(true));
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 502, body: JSON.stringify({ success: false, message: "Content source unreachable" }) };
  }
}

export async function onRequestGet({ request, params }) {
  const raw = params.path;
  const path = (Array.isArray(raw) ? raw.join("/") : raw || "").replace(/^\/+/, "");
  const search = new URL(request.url).search;

  if (!path) {
    return new Response(JSON.stringify({ success: false, message: "Missing content path" }), { status: 400, headers: CORS });
  }

  if (path === "__catalog") {
    try {
      const r = await fetch(CATALOG, { headers: HEADERS });
      return new Response(await r.text(), { status: r.status, headers: { ...CORS, "Cache-Control": "public, max-age=1800" } });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, message: "Catalog unavailable" }), { status: 502, headers: CORS });
    }
  }

  const out = await upstream(path, search);
  return new Response(out.body, { status: out.status, headers: { ...CORS, "Cache-Control": "public, max-age=60" } });
}
