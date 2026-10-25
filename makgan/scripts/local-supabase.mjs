// 로컬 Supabase 대역: Postgres + PostgREST + 매직링크만 흉내 내는 가짜 Auth.
// 실제 Supabase 계정 없이 앱 전체를 띄워 보거나 E2E를 돌릴 때 쓴다. 실제 서비스에는 쓰지 않는다.
//
//   npm run local:supabase        → 띄우고, .env.local에 넣을 값을 출력
//   http://localhost:54321/__mock/last-link?email=…  → 마지막 매직링크(메일 대신)
//
// 매번 빈 DB에 마이그레이션 + [샘플] 시드를 새로 넣는다.
import { spawn, execFileSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, chownSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.LOCAL_SUPABASE_PORT ?? 54321);
const PG_PORT = API_PORT + 1;
const REST_PORT = API_PORT + 2;
const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const JWT_SECRET = "local-only-jwt-secret-at-least-32-characters";
const POSTGREST_VERSION = "v12.2.3";

// ───────── JWT(HS256) ─────────
const b64url = (b) => Buffer.from(b).toString("base64url");
function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!sig) return null;
  const expect = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  if (expect !== sig) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  return p.exp && p.exp * 1000 < Date.now() ? null : p;
}
const now = () => Math.floor(Date.now() / 1000);
export const ANON_KEY = signJwt({ role: "anon", iss: "local-supabase", iat: 1700000000, exp: 4102444800 });
export const SERVICE_ROLE_KEY = signJwt({ role: "service_role", iss: "local-supabase", iat: 1700000000, exp: 4102444800 });

// ───────── Postgres ─────────
const pgBin = readdirSync("/usr/lib/postgresql").sort((a, b) => Number(a) - Number(b)).map((v) => `/usr/lib/postgresql/${v}/bin`).pop();
const isRoot = process.getuid?.() === 0;
const asPg = (cmd, args) => (isRoot ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args]);
const dir = mkdtempSync(join(tmpdir(), "makgan-pg-"));
if (isRoot) chownSync(dir, Number(execFileSync("id", ["-u", "postgres"]).toString()), 0);
const run = (cmd, args) => { const [c, a] = asPg(cmd, args); execFileSync(c, a, { stdio: ["ignore", "ignore", "inherit"] }); };
run(`${pgBin}/initdb`, ["-D", `${dir}/data`, "-U", "postgres", "-A", "trust"]);
run(`${pgBin}/pg_ctl`, ["-D", `${dir}/data`, "-o", `-p ${PG_PORT} -k ${dir} -c TimeZone=UTC`, "-l", `${dir}/log`, "-w", "start"]);
const DB_URL = `postgresql://postgres@localhost:${PG_PORT}/postgres`;
const psql = (file) => execFileSync("psql", [DB_URL, "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: ["ignore", "ignore", "inherit"] });
const sql = (q) => execFileSync("psql", [DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", q]).toString().trim();
psql(join(ROOT, "supabase/tests/auth_stub.sql"));
for (const f of readdirSync(join(ROOT, "supabase/migrations")).sort()) psql(join(ROOT, "supabase/migrations", f));
if (process.env.LOCAL_SUPABASE_SEED !== "0") psql(join(ROOT, "supabase/seed.sql"));

// ───────── PostgREST ─────────
const binDir = join(ROOT, ".local-supabase");
const pgrst = join(binDir, "postgrest");
if (!existsSync(pgrst)) {
  mkdirSync(binDir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
  console.log("PostgREST 내려받는 중…");
  execFileSync("bash", ["-c", `curl -sSfL "${url}" | tar xJ -C "${binDir}"`], { stdio: "inherit" });
}
const rest = spawn(pgrst, [], {
  stdio: ["ignore", "ignore", "inherit"],
  env: {
    ...process.env,
    PGRST_DB_URI: `postgresql://authenticator@localhost:${PG_PORT}/postgres`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_PORT: String(REST_PORT),
    PGRST_DB_POOL: "5",
    PGRST_LOG_LEVEL: "crit",
  },
});

let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  rest.kill("SIGKILL");
  // Postgres가 확실히 내려간 뒤에만 데이터 폴더를 지운다(지우고 나면 pg_ctl로 끌 수 없음)
  try { run(`${pgBin}/pg_ctl`, ["-D", `${dir}/data`, "-m", "immediate", "-w", "stop"]); } catch {}
  rmSync(dir, { recursive: true, force: true });
}
process.on("exit", stop);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => process.exit(0));

// ───────── 가짜 Auth (매직링크) ─────────
const otps = new Map();      // token_hash → email
const lastLink = new Map();  // email → link
const pkceCodes = new Map(); // auth_code → { email, challenge }  (Supabase 기본 메일 템플릿 흐름)
const lastCodeLink = new Map(); // email → ?code= 링크
const refresh = new Map();   // refresh_token → user id
const pushes = [];           // 가짜 푸시 서비스가 받은 요청(/__mock/push/:id)

// ───────── 가짜 KOPIS (E2E): /__mock/kopis/{pblprfr,pblprfr/:id,prfplc/:id}?service=e2e-kopis-key ─────────
const KOPIS_KEY = "e2e-kopis-key";
const kopisLog = [];  // 받은 요청(키 제외)
const fmtDay = (offset) => new Date(Date.now() + 9 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10).replaceAll("-", ".");
const kopisShows = [
  { id: "PF900001", name: "[테스트] 뮤지컬 알파", genre: "뮤지컬", state: "공연중", from: fmtDay(-10), to: fmtDay(60), fac: "FC9001", cast: "배우가(주인공), 배우나 등", ticket: true },
  { id: "PF900002", name: "[테스트] 뮤지컬 베타 & 감마", genre: "뮤지컬", state: "공연예정", from: fmtDay(20), to: fmtDay(80), fac: "FC9001", cast: "배우나, 배우다", ticket: false },
  { id: "PF900003", name: "[테스트] 연극 델타", genre: "연극", state: "공연중", from: fmtDay(-3), to: fmtDay(30), fac: "FC9002", cast: "배우다, 배우라", ticket: false },
  // 연극·공연예정 103편 → 100개씩 2쪽(페이지 넘김 확인)
  ...Array.from({ length: 103 }, (_, i) => ({ id: `PF9100${String(i + 1).padStart(2, "0")}`, name: `[테스트] 연극 ${i + 1}`, genre: "연극", state: "공연예정", from: fmtDay(5), to: fmtDay(40), fac: "FC9002", cast: "", ticket: false })),
];
const kopisFacilities = {
  FC9001: { name: "[테스트] 아트홀", seats: 1000, addr: "서울특별시 테스트구 아트로 1", la: "37.5", lo: "127.0" },
  FC9002: { name: "[테스트] 소극장", seats: 200, addr: "서울특별시 테스트구 소극장로 2", la: "37.58", lo: "127.002" },
};
const xmlEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const kopisListDb = (s) => `<db><mt20id>${s.id}</mt20id><prfnm>${xmlEsc(s.name)}</prfnm><prfpdfrom>${s.from}</prfpdfrom><prfpdto>${s.to}</prfpdto><fcltynm>${kopisFacilities[s.fac].name}</fcltynm><poster>http://www.kopis.or.kr/upload/pfmPoster/PF_${s.id}.png</poster><area>서울특별시</area><genrenm>${s.genre}</genrenm><openrun>N</openrun><prfstate>${s.state}</prfstate></db>`;
const kopisDetail = (s) => `<db><mt20id>${s.id}</mt20id><mt10id>${s.fac}</mt10id><prfnm>${xmlEsc(s.name)}</prfnm><prfpdfrom>${s.from}</prfpdfrom><prfpdto>${s.to}</prfpdto><fcltynm>${kopisFacilities[s.fac].name} (${kopisFacilities[s.fac].name})</fcltynm><prfcast>${xmlEsc(s.cast || " ")}</prfcast><poster>http://www.kopis.or.kr/upload/pfmPoster/PF_${s.id}.png</poster><sty>[공연소개]\n\n${xmlEsc(s.name)}의 줄거리입니다.</sty><genrenm>${s.genre}</genrenm><prfstate>${s.state}</prfstate>${s.ticket ? `<relates><relate><relatenm>테스트예매처</relatenm><relateurl>https://tickets.example/booking?a=1&amp;b=2</relateurl></relate></relates>` : ""}</db>`;
function kopisHandle(url, res) {
  const rest = url.pathname.slice("/__mock/kopis".length).replace(/^\//, "");
  const params = Object.fromEntries(url.searchParams);
  const key = params.service;
  delete params.service;
  kopisLog.push({ path: rest, ...params });
  const xml = (body) => { res.writeHead(200, { "content-type": "application/xml; charset=UTF-8" }); res.end(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><dbs>${body}</dbs>`); };
  if (key !== KOPIS_KEY) return xml(`<db><returncode>01</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR.</errmsg></db>`);
  if (rest === "pblprfr") {
    const genre = { GGGA: "뮤지컬", AAAA: "연극" }[params.shcate];
    const state = { "01": "공연예정", "02": "공연중" }[params.prfstate];
    const rows = Number(params.rows) || 10;
    const page = Number(params.cpage) || 1;
    const hits = kopisShows.filter((s) => s.genre === genre && s.state === state);
    return xml(hits.slice((page - 1) * rows, page * rows).map(kopisListDb).join(""));
  }
  const detail = /^pblprfr\/(PF\w+)$/.exec(rest);
  if (detail) { const s = kopisShows.find((x) => x.id === detail[1]); return xml(s ? kopisDetail(s) : ""); }
  const fac = /^prfplc\/(FC\w+)$/.exec(rest);
  if (fac && kopisFacilities[fac[1]]) {
    const f = kopisFacilities[fac[1]];
    return xml(`<db><fcltynm>${f.name}</fcltynm><mt10id>${fac[1]}</mt10id><seatscale>${f.seats}</seatscale><adres>${f.addr}</adres><la>${f.la}</la><lo>${f.lo}</lo><mt13s><mt13><seatscale>10</seatscale></mt13></mt13s></db>`);
  }
  return xml("");
}

function userById(id) {
  const row = sql(`select json_build_object('id', id, 'email', email) from auth.users where id = '${id}'`);
  if (!row) return null;
  const u = JSON.parse(row);
  return { ...u, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
}
function session(user) {
  const rt = randomBytes(16).toString("hex");
  refresh.set(rt, user.id);
  const exp = now() + 3600;
  return {
    access_token: signJwt({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now(), exp }),
    token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: rt, user,
  };
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", ...cors });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-supabase-api-version",
  "access-control-allow-methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "access-control-expose-headers": "content-range, content-location",
};
const readBody = (req) => new Promise((r) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => r(s ? JSON.parse(s) : {})); });
const authErr = (res, status, msg, code) => json(res, status, { code: status, error_code: code, msg });

async function auth(req, res, path, url) {
  if (path === "/otp" && req.method === "POST") {
    const { email, code_challenge } = await readBody(req);
    if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) return authErr(res, 400, "Invalid email", "validation_failed");
    const th = randomBytes(16).toString("hex");
    otps.set(th, email.toLowerCase());
    const link = `${SITE_URL}/auth/confirm?token_hash=${th}&type=email`;
    lastLink.set(email.toLowerCase(), link);
    if (code_challenge) {
      // 기본 템플릿: Supabase가 확인 후 redirect_to?code=… 로 보낸다
      const ac = randomUUID();
      pkceCodes.set(ac, { email: email.toLowerCase(), challenge: code_challenge });
      const redirectTo = url.searchParams.get("redirect_to") ?? `${SITE_URL}/auth/confirm`;
      lastCodeLink.set(email.toLowerCase(), `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}code=${ac}`);
    }
    console.log(`📧 매직링크 (${email}): ${link}`);
    return json(res, 200, {});
  }
  if (path === "/verify" && req.method === "POST") {
    const { token_hash } = await readBody(req);
    const email = otps.get(token_hash);
    if (!email) return authErr(res, 403, "Email link is invalid or has expired", "otp_expired");
    otps.delete(token_hash);
    let id = sql(`select id from auth.users where email = '${email.replace(/'/g, "''")}'`);
    if (!id) { id = randomUUID(); sql(`insert into auth.users (id, email) values ('${id}', '${email.replace(/'/g, "''")}')`); }
    return json(res, 200, session(userById(id)));
  }
  if (path === "/token" && url.searchParams.get("grant_type") === "pkce") {
    const { auth_code, code_verifier } = await readBody(req);
    const entry = pkceCodes.get(auth_code);
    const expect = code_verifier && createHash("sha256").update(code_verifier).digest("base64url");
    if (!entry || entry.challenge !== expect) return authErr(res, 400, "invalid flow state, no valid flow state found", "flow_state_not_found");
    pkceCodes.delete(auth_code);
    let id = sql(`select id from auth.users where email = '${entry.email.replace(/'/g, "''")}'`);
    if (!id) { id = randomUUID(); sql(`insert into auth.users (id, email) values ('${id}', '${entry.email.replace(/'/g, "''")}')`); }
    return json(res, 200, session(userById(id)));
  }
  if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const { refresh_token } = await readBody(req);
    const id = refresh.get(refresh_token);
    if (!id) return authErr(res, 400, "Invalid Refresh Token", "refresh_token_not_found");
    refresh.delete(refresh_token);
    return json(res, 200, session(userById(id)));
  }
  if (path === "/user" && req.method === "GET") {
    const p = verifyJwt((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    const user = p?.sub && userById(p.sub);
    return user ? json(res, 200, user) : authErr(res, 403, "invalid JWT", "bad_jwt");
  }
  if (path === "/logout") return json(res, 204);
  return authErr(res, 404, `local-supabase: ${req.method} ${path} 미지원`, "not_found");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url.pathname.slice(8), url);
    if (url.pathname === "/__mock/last-code-link") return json(res, 200, { link: lastCodeLink.get((url.searchParams.get("email") ?? "").toLowerCase()) ?? null });
    if (url.pathname === "/__mock/last-link") return json(res, 200, { link: lastLink.get((url.searchParams.get("email") ?? "").toLowerCase()) ?? null });
    if (url.pathname.startsWith("/__mock/push/") && req.method === "POST") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      pushes.push({ id: url.pathname.slice(13), headers: req.headers, body: Buffer.concat(chunks).toString("base64"), at: Date.now() });
      res.writeHead(201, cors);
      return res.end();
    }
    // 링크 자동 채우기 테스트용 페이지
    if (url.pathname === "/__mock/og-page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><html><head><title>기본 제목</title><meta property="og:title" content="[샘플] 11월 로터리 안내 &amp; 할인"><meta property="og:site_name" content="[샘플] 공식 SNS"><meta property="og:image" content="/poster.jpg"><meta name="date" content="2026-11-05"></head><body>본문</body></html>`);
    }
    if (url.pathname === "/__mock/big-page") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(`<title>너무 큼</title>${"x".repeat(2 * 1024 * 1024)}`);
    }
    if (url.pathname === "/__mock/slow-page") {
      setTimeout(() => { res.writeHead(200, { "content-type": "text/html" }); res.end("<title>느림</title>"); }, 7000);
      return;
    }
    if (url.pathname === "/__mock/redirect-internal") {
      res.writeHead(302, { location: `http://127.0.0.1:${API_PORT}/__mock/og-page` });
      return res.end();
    }
    if (url.pathname.startsWith("/__mock/kopis/")) return kopisHandle(url, res);
    if (url.pathname === "/__mock/kopis-log") return json(res, 200, kopisLog);
    if (url.pathname === "/__mock/kopis-mutate" && req.method === "POST") {
      const { id, ...patch } = await readBody(req);
      Object.assign(kopisShows.find((s) => s.id === id) ?? {}, patch);
      return json(res, 200, {});
    }
    if (url.pathname === "/__mock/pushes") return json(res, 200, pushes.filter((p) => !url.searchParams.get("id") || p.id === url.searchParams.get("id")));
    if (url.pathname === "/__mock/sql" && req.method === "POST") return json(res, 200, { out: sql((await readBody(req)).query) });
    if (url.pathname.startsWith("/rest/v1")) {
      const headers = { ...req.headers, host: `localhost:${REST_PORT}` };
      if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
      const up = httpRequest({ port: REST_PORT, path: url.pathname.slice(8) + url.search, method: req.method, headers }, (r) => {
        res.writeHead(r.statusCode, { ...r.headers, ...cors });
        r.pipe(res);
      });
      up.on("error", (e) => json(res, 502, { message: String(e) }));
      return req.pipe(up);
    }
    json(res, 404, { message: "not found" });
  } catch (e) {
    json(res, 500, { message: String(e) });
  }
});

// PostgREST가 뜰 때까지 기다린다.
for (let i = 0; ; i++) {
  try { await fetch(`http://localhost:${REST_PORT}/`); break; } catch {}
  if (i > 100) throw new Error("PostgREST가 뜨지 않음");
  await new Promise((r) => setTimeout(r, 100));
}
server.listen(API_PORT, "127.0.0.1", () => {
  console.log(`local-supabase ready
NEXT_PUBLIC_SUPABASE_URL=http://localhost:${API_PORT}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`);
});
