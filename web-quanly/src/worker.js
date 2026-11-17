// Website bảng điều khiển Auto Post (Cloudflare Workers).
// Đăng nhập: Cloudflare Access (kiểm JWT tại đây, ngoài lớp Access), hoặc mật khẩu dự phòng PASSWORD.
// Dữ liệu: Buffer GraphQL (bài đã đăng, lượt xem), API timviecso.vn (tin, video), KV (duyệt, nhật ký gỡ).

const TZ = "Asia/Ho_Chi_Minh";
const BUFFER = "https://api.buffer.com";
const TVS = "https://api.timviecso.vn/api/v1";
const JOB_URL = (id) => `https://timviecso.vn/design24/jobs/${id}`;
const ENGAGE = ["reactions", "comments", "shares", "clicks"];
const ID_RE = /^[0-9a-f]{24}$/;
const SESSION_DAYS = 14;

// Lịch các tác vụ Claude (giờ Việt Nam). Website không đổi được lịch này; đổi trên bảng điều khiển Claude.
const SCHEDULE = [
  {name: "Bản tin video 7:00 (FB, TikTok, YouTube, timviecso.vn)", times: ["5:17"], days: "Hằng ngày", note: "Dựng video từ 5:17, đăng 7:00"},
  {name: "Đăng timviecso.vn đợt 7:00 (5 tin)", times: ["6:52"], days: "Hằng ngày"},
  {name: "Đăng timviecso.vn (2 giờ 1 tin)", times: ["9:07", "11:07", "13:07", "15:07", "17:07", "19:07", "21:07"], days: "Hằng ngày"},
  {name: "Gỡ tin hết hạn timviecso.vn", times: ["0:23"], days: "Hằng ngày"},
  {name: "Báo cáo hiệu quả tuần", times: ["8:41"], days: "Thứ Hai"},
  {name: "Bảng điều khiển Claude (cập nhật số liệu)", times: ["12:47", "21:47"], days: "Hằng ngày"},
];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === "/login") return login(req, env);
      if (url.pathname === "/logout") return logout(env);
      const user = await authenticate(req, env);
      if (!user) {
        if (url.pathname.startsWith("/api/")) return json({error: "Chưa đăng nhập"}, 401);
        return env.ACCESS_AUD ? text("Không có quyền vào trang này.", 403) : Response.redirect(`${url.origin}/login`, 302);
      }
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "GET" && req.headers.get("Origin") !== url.origin) return json({error: "Sai nguồn yêu cầu"}, 403);
        return await api(req, env, url, user);
      }
      return env.ASSETS.fetch(req);
    } catch (err) {
      return json({error: String(err && err.message || err).slice(0, 500)}, 500);
    }
  },
};

/* ---------------- đăng nhập ---------------- */

async function authenticate(req, env) {
  if (env.ACCESS_TEAM && env.ACCESS_AUD) {
    const token = req.headers.get("Cf-Access-Jwt-Assertion") || cookie(req, "CF_Authorization");
    if (!token) return null;
    const claims = await verifyAccessJwt(token, env);
    if (!claims) return null;
    const allowed = (env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.includes(String(claims.email || "").toLowerCase())) return null;
    return {email: claims.email, via: "access"};
  }
  if (env.PASSWORD) {
    const s = cookie(req, "aq_session");
    if (s && await checkSession(s, env)) return {email: "", via: "password"};
  }
  return null;
}

let jwksCache = null;
async function verifyAccessJwt(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = JSON.parse(b64urlText(parts[0]));
  const claims = JSON.parse(b64urlText(parts[1]));
  if (header.alg !== "RS256") return null;
  if (!jwksCache || jwksCache.at < Date.now() - 3600e3) {
    const r = await fetch(`https://${env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
    jwksCache = {at: Date.now(), keys: (await r.json()).keys || []};
  }
  const jwk = jwksCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"}, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const now = Date.now() / 1000;
  if (!ok || !aud.includes(env.ACCESS_AUD) || claims.exp < now || claims.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com`) return null;
  return claims;
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function checkSession(value, env) {
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return timingSafeEqual(sig, await hmac(env.PASSWORD, `aq:${exp}`));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function login(req, env) {
  if (env.ACCESS_AUD) return Response.redirect(new URL("/", req.url).toString(), 302);
  if (!env.PASSWORD) return text("Website chưa bật đăng nhập. Làm theo web-quanly/README.md để bật Cloudflare Access hoặc đặt PASSWORD.", 503);
  let error = "";
  if (req.method === "POST") {
    const ip = req.headers.get("CF-Connecting-IP") || "?";
    const key = `login-fail:${ip}`;
    const fails = Number(await env.KV.get(key) || 0);
    if (fails >= 10) error = "Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút.";
    else {
      const form = await req.formData();
      const given = String(form.get("password") || "");
      if (timingSafeEqual(await hmac("cmp", given), await hmac("cmp", env.PASSWORD))) {
        const exp = Date.now() + SESSION_DAYS * 864e5;
        const value = `${exp}.${await hmac(env.PASSWORD, `aq:${exp}`)}`;
        return new Response(null, {status: 302, headers: {
          Location: "/",
          "Set-Cookie": `aq_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
        }});
      }
      await env.KV.put(key, String(fails + 1), {expirationTtl: 900});
      error = "Sai mật khẩu.";
    }
  }
  return new Response(loginPage(error), {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"}});
}
function logout(env) {
  return new Response(null, {status: 302, headers: {
    Location: env.ACCESS_AUD ? "/cdn-cgi/access/logout" : "/login",
    "Set-Cookie": "aq_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
  }});
}
function loginPage(error) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Đăng nhập Auto Post</title><style>
:root{--bg:#f3f5f4;--panel:#fff;--ink:#14201d;--muted:#5b6b67;--line:#d9e1de;--accent:#0b6e63;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#0f1513;--panel:#161e1b;--ink:#e4ece9;--muted:#93a39e;--line:#2a3632;--accent:#4fc3b1;--bad:#f2877c;color-scheme:dark}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:16px}
form{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:24px;display:grid;gap:12px;width:min(360px,100%)}
h1{font-size:18px;margin:0}input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink)}
button{font:inherit;padding:8px;border:0;border-radius:8px;background:var(--accent);color:var(--panel);font-weight:600;cursor:pointer}.e{color:var(--bad)}</style></head>
<body><form method="post"><h1>Auto Post</h1><label for="pw">Mật khẩu</label><input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
${error ? `<div class="e">${error}</div>` : ""}<button>Đăng nhập</button></form></body></html>`;
}

/* ---------------- API ---------------- */

async function api(req, env, url, user) {
  const path = url.pathname;
  if (path === "/api/data" && req.method === "GET") return json(await data(env, url.searchParams.get("fresh") === "1", user));
  if (path === "/api/approve" && req.method === "POST") {
    const {ids, approved = true} = await req.json();
    const list = (ids || []).filter((id) => ID_RE.test(id)).slice(0, 300);
    const approvals = await kvJson(env, "approvals", {});
    for (const id of list) approved ? approvals[id] = vnNow() : delete approvals[id];
    await env.KV.put("approvals", JSON.stringify(approvals));
    return json({ok: true, count: list.length});
  }
  if (path === "/api/remove" && req.method === "POST") {
    const body = await req.json();
    const reason = String(body.reason || "").trim().slice(0, 200);
    const list = (body.ids || []).filter((id) => ID_RE.test(id)).slice(0, 100);
    if (!reason) return json({error: "Thiếu lý do gỡ"}, 400);
    if (!list.length) return json({error: "Chưa chọn tin"}, 400);
    const jobs = new Map((await tvs(env, "GET", "/job-postings") || []).map((j) => [j._id, j]));
    const log = await kvJson(env, "removed", []);
    const results = [];
    for (const id of list) {
      const j = jobs.get(id);
      const entry = {id, time_vn: vnNow(), reason, by: user.email || "", title: j && j.title, employer: j && (j.employer || {}).name};
      if (!j) entry.status = "khong_con_tren_trang";
      else {
        try { await tvs(env, "DELETE", `/job-postings/${id}`); entry.status = "da_go"; }
        catch (e) { entry.status = "loi"; entry.error = String(e.message || e).slice(0, 300); }
      }
      log.push(entry); results.push(entry);
    }
    await env.KV.put("removed", JSON.stringify(log.slice(-500)));
    await env.KV.delete("cache:data");
    return json({ok: results.every((r) => r.status !== "loi"), results});
  }
  return json({error: "Không có đường dẫn này"}, 404);
}

async function data(env, fresh, user) {
  let base = fresh ? null : await kvJson(env, "cache:data", null);
  if (!base) {
    const errors = {};
    const [posts, jobs, videos] = await Promise.all([
      bufferPosts(env, 30).catch((e) => (errors.buffer = String(e.message || e).slice(0, 300), [])),
      tvs(env, "GET", "/job-postings").then(mapJobs).catch((e) => (errors.timviecso = String(e.message || e).slice(0, 300), [])),
      tvs(env, "GET", "/videos").catch((e) => (errors.videos = String(e.message || e).slice(0, 300), [])),
    ]);
    base = {
      generated_vn: vnNow(), errors, posts, jobs,
      videos: (videos || []).map((v) => ({id: v._id, title: v.title, url: v.url, created_vn: vn(v.createdAt)})),
    };
    base.stats = stats(base.posts, base.jobs);
    await env.KV.put("cache:data", JSON.stringify(base), {expirationTtl: 300});
  }
  return {
    ...base,
    user: {email: user.email, via: user.via},
    approvals: await kvJson(env, "approvals", {}),
    removed: (await kvJson(env, "removed", [])).slice(-100),
    schedule: SCHEDULE,
    claude_panel: env.CLAUDE_PANEL || "",
  };
}

const POSTS_Q = `query($input: PostsInput!, $after: String) {
  posts(first: 50, after: $after, input: $input) {
    edges { node { id status channelService dueAt sentAt externalLink text error { message } metrics { type value } } }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function bufferPosts(env, days) {
  if (!env.BUFFER_API_KEY) throw new Error("Chưa đặt khóa BUFFER_API_KEY");
  const since = Date.now() - days * 864e5;
  const out = [];
  let after = null;
  for (let page = 0; page < 10; page++) {
    const r = await fetch(BUFFER, {method: "POST", headers: {"Content-Type": "application/json", Authorization: `Bearer ${env.BUFFER_API_KEY}`},
      body: JSON.stringify({query: POSTS_Q, variables: {after, input: {organizationId: env.BUFFER_ORG, filter: {status: ["sent", "scheduled", "sending", "error"]}}}})});
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.errors) throw new Error(`Buffer ${r.status}: ${JSON.stringify(body.errors || body).slice(0, 200)}`);
    const d = body.data.posts;
    for (const {node: n} of d.edges) {
      const when = n.sentAt || n.dueAt;
      if (when && Date.parse(when) < since) continue;
      const m = Object.fromEntries((n.metrics || []).map((x) => [x.type, x.value]));
      out.push({
        id: n.id, service: n.channelService, status: n.status, time_vn: vn(when), link: n.externalLink || "",
        title: (n.text || "").split("\n")[0].slice(0, 120),
        views: Number(m.views ?? m.impressions ?? 0) || 0,
        engagement: ENGAGE.reduce((a, k) => a + (Number(m[k]) || 0), 0),
        error: n.error && n.error.message,
      });
    }
    if (!d.pageInfo.hasNextPage) break;
    after = d.pageInfo.endCursor;
  }
  return out.sort((a, b) => (b.time_vn || "").localeCompare(a.time_vn || ""));
}

async function tvs(env, method, path) {
  const headers = {"Content-Type": "application/json", Accept: "application/json"};
  if (env.TIMVIECSO_TOKEN) headers.Authorization = `Bearer ${env.TIMVIECSO_TOKEN}`;
  const r = await fetch(TVS + path, {method, headers});
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.success === false) throw new Error(`timviecso.vn ${r.status}: ${body.message || body.messagge || ""}`.trim());
  return body.data;
}

function mapJobs(list) {
  return (list || []).map((j) => {
    const src = [...(j.description || [])].reverse().map((l) => String(l).match(/^\s*Nguồn:\s*(\S+)/)).find(Boolean);
    return {
      id: j._id, title: j.title, employer: (j.employer || {}).name, location: j.location, workType: j.workType || "",
      salary: j.salary, deadline: (j.deadline || "").slice(0, 10), created_vn: vn(j.createdAt), url: JOB_URL(j._id), source: src ? src[1] : "",
    };
  }).sort((a, b) => (b.created_vn || "").localeCompare(a.created_vn || ""));
}

function stats(posts, jobs) {
  const by = {};
  for (const p of posts) {
    const s = by[p.service] ||= {posts: 0, views: 0, engagement: 0, errors: 0};
    if (p.status === "sent") { s.posts++; s.views += p.views; s.engagement += p.engagement; }
    else if (p.status === "error") s.errors++;
  }
  const count = (f) => jobs.reduce((o, j) => (o[f(j)] = (o[f(j)] || 0) + 1, o), {});
  const perDay = count((j) => (j.created_vn || "").slice(0, 10));
  const today = vnNow().slice(0, 10);
  const days = [];
  for (let i = 13; i >= 0; i--) days.push(vnDate(Date.now() - i * 864e5));
  const in3 = vnDate(Date.now() + 3 * 864e5);
  return {
    by_service: by, jobs_total: jobs.length,
    jobs_by_type: count((j) => j.workType || "Khác"),
    jobs_by_location: count((j) => j.location || "Khác"),
    jobs_per_day: days.map((d) => ({date: d, count: perDay[d] || 0})),
    jobs_today: perDay[today] || 0,
    jobs_expiring_3d: jobs.filter((j) => j.deadline && j.deadline >= today && j.deadline <= in3).length,
  };
}

/* ---------------- tiện ích ---------------- */

function vn(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("sv-SE", {timeZone: TZ}).slice(0, 16);
}
const vnNow = () => vn(new Date().toISOString());
const vnDate = (ms) => new Date(ms).toLocaleString("sv-SE", {timeZone: TZ}).slice(0, 10);
async function kvJson(env, key, fallback) {
  const v = await env.KV.get(key);
  if (!v) return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}
function cookie(req, name) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
const b64urlText = (s) => new TextDecoder().decode(b64urlBytes(s));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}});
const text = (t, status) => new Response(t, {status, headers: {"Content-Type": "text/plain; charset=utf-8"}});
