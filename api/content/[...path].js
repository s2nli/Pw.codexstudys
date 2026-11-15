/**
 * Vercel serverless proxy:  /api/content/<anything>?<query>  ->  content source /api/<anything>?<query>
 * Tries the open mirror first, then the token-based source. Also serves /api/content/__catalog.
 * (Cloudflare Pages uses functions/api/content/[[path]].js instead — same logic.)
 */
const ORIGIN = "https://vidcloud.eu.org";
const PRIMARY = "https://proxy.streamvideo.co.in/fetch/api.penpencil.co";
const CATALOG = "https://studystark.github.io/batches/batches.json";
const UA = "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36";
const HEADERS = { Accept: "application/json", "User-Agent": UA };

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

module.exports = async (req, res) => {
  const raw = req.query && req.query.path;
  const path = (Array.isArray(raw) ? raw.join("/") : raw || "").replace(/^\/+/, "");
  const url = new URL(req.url, "http://localhost");
  url.searchParams.delete("path");
  const search = url.search;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (!path) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ success: false, message: "Missing content path" }));
  }

  if (path === "__catalog") {
    try {
      const r = await fetch(CATALOG, { headers: HEADERS });
      res.statusCode = r.status;
      res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=600");
      return res.end(await r.text());
    } catch (e) {
      res.statusCode = 502;
      return res.end(JSON.stringify({ success: false, message: "Catalog unavailable" }));
    }
  }

  const out = await upstream(path, search);
  res.statusCode = out.status;
  res.setHeader("Cache-Control", "public, max-age=60");
  res.end(out.body);
};
