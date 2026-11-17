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
const PUBLIC_FILES = new Set(["/logo.png", "/logo-d24.png", "/favicon.png"]);
// Công tắc tạm dừng: all = cả hệ thống; còn lại theo kênh.
const PAUSE_KEYS = ["all", "facebook", "tiktok", "youtube", "timviecso"];
const TASK_NAMES = {"bantin": "Bản tin video 7:00", "website-video": "Video bản tin lên timviecso.vn", "timviecso-dang": "Đăng tin timviecso.vn",
  "go-het-han": "Gỡ tin hết hạn", "bao-cao-tuan": "Báo cáo hiệu quả tuần", "bang-dieu-khien": "Cập nhật bảng điều khiển"};

// Lịch các tác vụ Claude (giờ Việt Nam). Website không đổi được lịch này; đổi trên bảng điều khiển Claude.
// key: tên tác vụ khi báo kết quả về website (autopost.control); grace: số phút chờ báo trước khi coi là lỡ lượt.
const SCHEDULE = [
  {key: "bantin", grace: 210, name: "Bản tin video 7:00 (FB, TikTok, YouTube, timviecso.vn)", times: ["5:17"], days: "Hằng ngày", note: "Dựng video từ 5:17, đăng 7:00"},
  {key: "timviecso-dang", grace: 75, name: "Đăng timviecso.vn đợt 7:00 (5 tin)", times: ["6:52"], days: "Hằng ngày"},
  {key: "timviecso-dang", grace: 75, name: "Đăng timviecso.vn (2 giờ 1 tin)", times: ["9:07", "11:07", "13:07", "15:07", "17:07", "19:07", "21:07"], days: "Hằng ngày"},
  {key: "go-het-han", grace: 75, name: "Gỡ tin hết hạn timviecso.vn", times: ["0:23"], days: "Hằng ngày"},
  {name: "Báo cáo hiệu quả tuần", times: ["8:41"], days: "Thứ Hai"},
  {name: "Bảng điều khiển Claude (cập nhật số liệu)", times: ["12:47", "21:47"], days: "Hằng ngày"},
];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(watchdog(env));
  },
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/agent/")) return await agentApi(req, env, url);
      if (url.pathname === "/login") return login(req, env);
      if (url.pathname === "/logout") return logout(env);
      if (PUBLIC_FILES.has(url.pathname)) return env.ASSETS.fetch(req);
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
// Chữ ký phiên gồm tên đăng nhập, mật khẩu và "muối" trong KV: đổi muối là đăng xuất mọi thiết bị.
async function sessionSig(env, exp) {
  const salt = await env.KV.get("session_salt") || "";
  return hmac(env.PASSWORD, `aq:${String(env.USERNAME || "admin").toLowerCase()}:${salt}:${exp}`);
}
async function checkSession(value, env) {
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return timingSafeEqual(sig, await sessionSig(env, exp));
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
    if (fails >= 10) error = "Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.";
    else {
      const form = await req.formData();
      const user = String(form.get("username") || "").trim().toLowerCase();
      const given = String(form.get("password") || "");
      const wantUser = String(env.USERNAME || "admin").trim().toLowerCase();
      const okUser = timingSafeEqual(await hmac("cmp", user), await hmac("cmp", wantUser));
      const okPass = timingSafeEqual(await hmac("cmp", given), await hmac("cmp", env.PASSWORD));
      if (okUser && okPass) {
        const exp = Date.now() + SESSION_DAYS * 864e5;
        const value = `${exp}.${await sessionSig(env, exp)}`;
        return new Response(null, {status: 302, headers: {
          Location: "/",
          "Set-Cookie": `aq_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`,
        }});
      }
      await env.KV.put(key, String(fails + 1), {expirationTtl: 900});
      error = "Sai tên đăng nhập hoặc mật khẩu.";
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
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Đăng nhập · Auto Post Tìm Việc Số</title><link rel="icon" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap">
<style>
:root{--ink:#0f1b3d;--muted:#5a6785;--line:#dfe5f0;--bg:#f5f7fb;--panel:#fff;--brand:#0813df;--brand-2:#0b86e8;--deep:#061450;--navy:#0a2a8c;--grad:linear-gradient(90deg,#0813df,#0b86e8);--orange:#ff7f14;--bad:#c62828;--bad-bg:#fdecea;--field:#f8fafd}
@media (prefers-color-scheme:dark){:root{--ink:#e8edf8;--muted:#9aa6c2;--line:#25304d;--bg:#0b1020;--panel:#111830;--field:#0e1529;--bad:#ff8a80;--bad-bg:#3a1714;color-scheme:dark}}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg);display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)}
.brand{position:relative;overflow:hidden;color:#fff;padding:48px 56px;display:flex;flex-direction:column;justify-content:space-between;
background:radial-gradient(800px 520px at 100% 0%,rgba(11,134,232,.85),transparent 62%),linear-gradient(150deg,#0813df 0%,#0a1ec4 55%,#0b3fd6 100%)}
.sq{position:absolute;background:#ff7f14;z-index:0}.sq.a{width:96px;height:96px;right:-24px;top:150px}.sq.b{width:28px;height:28px;right:96px;top:120px;opacity:.9}.sq.c{width:260px;height:260px;right:-120px;bottom:-130px;background:rgba(255,255,255,.07)}
.brand::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(180deg,#000,transparent 85%);pointer-events:none}
.logo{display:flex;align-items:center;gap:14px;position:relative;z-index:1}
.logo .tile{width:76px;height:58px;border-radius:16px;background:#fff;display:grid;place-items:center;box-shadow:0 10px 28px rgba(0,0,0,.22)}.logo .tile img{width:60px;height:auto}
.logo b{display:block;font-size:19px;letter-spacing:-.01em}.logo span{font-size:13px;opacity:.75}
.hero{position:relative;z-index:1;max-width:520px}
.hero h1{font-size:clamp(28px,3.2vw,40px);line-height:1.15;letter-spacing:-.02em;margin:0 0 14px;font-weight:800;text-wrap:balance}
.hero h1 em{font-style:normal;color:#ffb36b}
.hero .kicker{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:16px;opacity:.9}.hero .kicker::before{content:"";width:10px;height:10px;background:#ff7f14}
.hero p{margin:0;font-size:15.5px;line-height:1.6;opacity:.82;max-width:44ch}
.feats{position:relative;z-index:1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:560px}
.feat{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px;backdrop-filter:blur(6px)}
.feat b{display:block;font-size:14px;margin-bottom:2px}.feat span{font-size:12.5px;opacity:.75;line-height:1.45}
.side{display:grid;place-items:center;padding:40px max(24px,env(safe-area-inset-right))}
form{width:min(400px,100%);display:grid;gap:18px}
.mlogo{display:none;align-items:center;gap:12px}.mlogo img{width:64px;height:auto}
h2{margin:0;font-size:26px;letter-spacing:-.02em;display:flex;align-items:center;gap:10px}h2::after{content:"";width:10px;height:10px;background:#ff7f14}.sub{margin:-10px 0 4px;color:var(--muted);font-size:14.5px}
label{font-size:13.5px;font-weight:600}
.field{position:relative;margin-top:6px}
.field svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:var(--muted)}
input{width:100%;font:inherit;font-size:15px;padding:13px 46px 13px 42px;border:1.5px solid var(--line);border-radius:12px;background:var(--field);color:var(--ink);transition:border-color .15s,box-shadow .15s}
input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px rgba(8,19,223,.12)}
.eye{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--muted);cursor:pointer;padding:8px;border-radius:8px}
.eye:hover{color:var(--ink)}.eye svg{position:static;transform:none}
.err{display:flex;gap:10px;align-items:flex-start;background:var(--bad-bg);color:var(--bad);border-radius:12px;padding:12px 14px;font-size:14px}
.err svg{flex:none;width:18px;height:18px;margin-top:1px}
button.go{font:inherit;font-weight:700;font-size:15px;padding:13px;border:0;border-radius:12px;color:#fff;cursor:pointer;background:var(--grad);box-shadow:0 10px 24px rgba(8,19,223,.28);transition:transform .1s,box-shadow .15s}
button.go:hover{box-shadow:0 12px 28px rgba(11,111,216,.38)}button.go:active{transform:translateY(1px)}
button:focus-visible{outline:3px solid rgba(11,134,232,.45);outline-offset:2px}
.note{font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:center}.note svg{width:16px;height:16px;flex:none}
.foot{font-size:12.5px;color:var(--muted);text-align:center;margin-top:8px}
@media (max-width:900px){body{grid-template-columns:1fr}.brand{display:none}.mlogo{display:flex}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style></head><body>
<aside class="brand">
  <span class="sq a"></span><span class="sq b"></span>
  <div class="logo"><span class="tile"><img src="/logo-d24.png" alt="Design24"></span><div><b>Học viện Design24</b><span>Auto Post · Tìm Việc Số</span></div></div>
  <div class="hero"><div class="kicker">Bảng điều khiển</div><h1>Toàn bộ kênh đăng tin, <em>trong một màn hình.</em></h1>
  <p>Theo dõi bản tin 7:00 trên Facebook, TikTok, YouTube, tin tuyển dụng trên timviecso.vn và lịch chạy tự động mỗi ngày.</p></div>
  <div class="feats">
    <div class="feat"><b>Bản tin 7:00</b><span>Trạng thái từng kênh, link và lượt xem</span></div>
    <div class="feat"><b>Tin tuyển dụng</b><span>Duyệt và gỡ tin ngay trên trang</span></div>
    <div class="feat"><b>Số liệu 30 ngày</b><span>Lượt xem, tương tác, bài lỗi</span></div>
  </div>
</aside>
<main class="side">
  <form method="post" autocomplete="on">
    <div class="mlogo"><img src="/logo-d24.png" alt="Design24"><div><b>Học viện Design24</b><div class="sub" style="margin:0">Auto Post · Tìm Việc Số</div></div></div>
    <h2>Đăng nhập</h2>
    <p class="sub">Bảng điều khiển riêng của chủ dự án.</p>
    ${error ? `<div class="err" role="alert"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg><span>${esc(error)}</span></div>` : ""}
    <div><label for="un">Tên đăng nhập</label>
      <div class="field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
      <input id="un" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Nhập tên đăng nhập" required autofocus></div></div>
    <div><label for="pw">Mật khẩu</label>
      <div class="field"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      <input id="pw" name="password" type="password" autocomplete="current-password" placeholder="Nhập mật khẩu" required>
      <button class="eye" type="button" id="eye" aria-label="Hiện mật khẩu"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>

    <button class="go" type="submit">Đăng nhập</button>
    <div class="note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Ghi nhớ đăng nhập 14 ngày trên thiết bị này.</div>
    <div class="foot">© Học viện Design24 · timviecso.vn</div>
  </form>
</main>
<script>var e=document.getElementById("eye");if(e)e.onclick=function(){var i=document.getElementById("pw");var s=i.type==="password";i.type=s?"text":"password";this.setAttribute("aria-label",s?"Ẩn mật khẩu":"Hiện mật khẩu");i.focus()}</script>
</body></html>`;
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
  if (path === "/api/pause" && req.method === "POST") {
    const {key, paused, hours} = await req.json();
    if (!PAUSE_KEYS.includes(key)) return json({error: "Sai công tắc"}, 400);
    const ctl = await control(env);
    ctl.pause[key] = paused ? {on: true, at: vnNow(), until: hours > 0 ? new Date(Date.now() + hours * 3600e3).toISOString() : null} : {on: false, at: vnNow()};
    await env.KV.put("control", JSON.stringify(ctl));
    return json({ok: true, control: ctl});
  }
  if (path === "/api/block" && req.method === "POST") {
    const body = await req.json();
    const clean = (list) => [...new Set((list || []).map((x) => String(x).trim().replace(/\s+/g, " ").slice(0, 120)).filter(Boolean))].slice(0, 500);
    const ctl = await control(env);
    if (body.add_employers) ctl.block.employers = clean([...ctl.block.employers, ...body.add_employers]);
    if (body.employers) ctl.block.employers = clean(body.employers);
    if (body.keywords) ctl.block.keywords = clean(body.keywords);
    await env.KV.put("control", JSON.stringify(ctl));
    return json({ok: true, control: ctl});
  }
  if (path === "/api/alerts/ack" && req.method === "POST") {
    const {id} = await req.json();
    const alerts = await kvJson(env, "alerts", []);
    for (const a of alerts) if (!a.ack && (id === "all" || a.id === id)) a.ack = vnNow();
    await env.KV.put("alerts", JSON.stringify(alerts));
    return json({ok: true});
  }
  if (path === "/api/watchdog" && req.method === "POST") return json({ok: true, new_alerts: await watchdog(env)});
  return json({error: "Không có đường dẫn này"}, 404);
}

/* ---------------- tác vụ báo về (autopost.control) ---------------- */

async function agentApi(req, env, url) {
  const auth = req.headers.get("Authorization") || "";
  if (!env.AGENT_TOKEN || !timingSafeEqual(await hmac("cmp", auth), await hmac("cmp", `Bearer ${env.AGENT_TOKEN}`))) return json({error: "Sai khóa"}, 401);
  if (url.pathname === "/api/agent/config" && req.method === "GET") return json(await control(env));
  if (url.pathname === "/api/agent/run" && req.method === "POST") {
    const b = await req.json();
    const task = String(b.task || "").slice(0, 40);
    if (!/^[a-z0-9-]+$/.test(task)) return json({error: "Sai tên tác vụ"}, 400);
    const run = {id: crypto.randomUUID().slice(0, 8), task, ok: !!b.ok, skipped: !!b.skipped, time_vn: vnNow(),
      summary: String(b.summary || "").slice(0, 400), details: String(b.details || "").slice(0, 2000)};
    const runs = await kvJson(env, "runs", []);
    runs.push(run);
    await env.KV.put("runs", JSON.stringify(runs.slice(-400)));
    if (!run.ok && !run.skipped) await addAlerts(env, [{id: `run:${run.id}`, level: "bad", title: `${TASK_NAMES[task] || task} báo lỗi`, detail: run.summary || run.details}]);
    return json({ok: true, id: run.id});
  }
  return json({error: "Không có đường dẫn này"}, 404);
}

async function control(env) {
  const c = await kvJson(env, "control", {});
  return {pause: c.pause || {}, block: {employers: (c.block || {}).employers || [], keywords: (c.block || {}).keywords || []}};
}

async function addAlerts(env, items) {
  if (!items.length) return [];
  const alerts = await kvJson(env, "alerts", []);
  const seen = new Set(alerts.map((a) => a.id));
  const fresh = items.filter((a) => !seen.has(a.id)).map((a) => ({...a, time_vn: vnNow()}));
  if (!fresh.length) return [];
  await env.KV.put("alerts", JSON.stringify([...alerts, ...fresh].slice(-200)));
  await notify(env, fresh);
  return fresh;
}

// Gửi cảnh báo qua Telegram nếu đã đặt TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_ID.
async function notify(env, alerts) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const textMsg = "⚠️ Auto Post cần chú ý\n" + alerts.map((a) => `• ${a.title}${a.detail ? ": " + a.detail : ""}`).join("\n").slice(0, 3500);
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({chat_id: env.TELEGRAM_CHAT_ID, text: textMsg, disable_web_page_preview: true})}).catch(() => {});
}

// Chạy mỗi 30 phút: tìm lượt chạy bị lỡ (tác vụ không báo về đúng hạn) và bài Buffer lỗi mới.
async function watchdog(env) {
  const items = [];
  const runs = await kvJson(env, "runs", []);
  const reported = new Set(runs.map((r) => r.task));
  const now = vnNow(), today = now.slice(0, 10), nowMin = toMin(now.slice(11, 16));
  for (const t of SCHEDULE) {
    if (!t.key || t.days !== "Hằng ngày" || !reported.has(t.key)) continue; // tác vụ chưa từng báo về thì chưa theo dõi
    for (const time of t.times) {
      const at = toMin(time);
      if (nowMin < at + t.grace || nowMin > at + t.grace + 180) continue;
      const from = `${today} ${minToHHMM(Math.max(0, at - 10))}`;
      if (!runs.some((r) => r.task === t.key && r.time_vn >= from)) {
        items.push({id: `missed:${t.key}:${today}:${time}`, level: "warn", title: `Lượt ${time} của "${t.name}" chưa báo kết quả`, detail: `Đã quá ${t.grace} phút. Tác vụ có thể chưa chạy hoặc bị dừng giữa chừng.`});
      }
    }
  }
  if (env.BUFFER_API_KEY) {
    try {
      for (const p of await bufferPosts(env, 2)) if (p.status === "error") {
        items.push({id: `buffer:${p.id}`, level: "bad", title: `Bài ${p.service} lỗi trên Buffer`, detail: `${p.time_vn} · ${p.error || p.title}`});
      }
    } catch (e) {
      if (/401|403|unauthor/i.test(String(e.message))) items.push({id: `buffer-key:${today}`, level: "bad", title: "Khóa API Buffer không dùng được", detail: String(e.message).slice(0, 200)});
    }
  }
  return addAlerts(env, items);
}
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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
    control: await control(env),
    runs: (await kvJson(env, "runs", [])).slice(-150),
    alerts: (await kvJson(env, "alerts", [])).slice(-60),
    task_names: TASK_NAMES,
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
      id: j._id, title: j.title, employer: (j.employer || {}).name, logo: (j.employer || {}).logo || "", location: j.location, workType: j.workType || "",
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
