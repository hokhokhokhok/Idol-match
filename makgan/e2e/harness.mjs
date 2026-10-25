// E2E 실행기: 로컬 Supabase 대역 → 그 값으로 next build → next start → 각 *.e2e.mjs 실행.
//   npm run test:e2e            전체
//   npm run test:e2e -- auth    파일 이름에 'auth'가 들어간 것만
//   E2E_SKIP_BUILD=1            이미 같은 env로 빌드했으면 빌드 생략
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createECDH, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PORT = 4321;
const SUPA_PORT = 54331;
const BASE = `http://localhost:${APP_PORT}`;
const SUPA = `http://localhost:${SUPA_PORT}`;

const children = [];
/** 자식들을 끄고 실제로 끝날 때까지 기다린다(로컬 Supabase 대역이 Postgres를 정리할 시간). */
async function stopAll() {
  await Promise.all(children.map((c) => new Promise((resolve) => {
    if (c.exitCode !== null || c.signalCode !== null) return resolve();
    c.once("exit", resolve);
    try { c.supabase ? c.kill("SIGTERM") : process.kill(-c.pid, "SIGTERM"); } catch { resolve(); }
    setTimeout(() => { try { process.kill(-c.pid, "SIGKILL"); } catch {} resolve(); }, 10000);
  })));
}
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => stopAll().then(() => process.exit(1)));
process.on("uncaughtException", (e) => { console.error(e); stopAll().then(() => process.exit(1)); });
process.on("unhandledRejection", (e) => { console.error(e); stopAll().then(() => process.exit(1)); });

function start(cmd, args, env, readyRe) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    children.push(c);
    c.supabase = args[0]?.includes("local-supabase");
    let out = "";
    const onData = (d) => { out += d; if (readyRe.test(out)) resolve(out); };
    c.stdout.on("data", onData);
    c.stderr.on("data", (d) => { out += d; });
    c.once("exit", (code) => reject(new Error(`${cmd} 종료(${code})\n${out}`)));
  });
}

const supaOut = await start("node", ["scripts/local-supabase.mjs"], { LOCAL_SUPABASE_PORT: String(SUPA_PORT), SITE_URL: BASE }, /local-supabase ready[\s\S]*SERVICE_ROLE_KEY=\S+/);
// VAPID 키는 고정(빌드 캐시가 바뀌지 않게) — 테스트 전용
const VAPID = { publicKey: "BE7unnCcbZVEZ8ytauBOMhTKHJbRlswUHT47iTNIihgQW3H47ANprzO7PDGRgKjOUg_By4KtmdjsDXZ9F06L7aY", privateKey: "MUl5JZeGxLpZMdvqmfCVAwSzHHIvYWavB_Dm8bxc0vU" };
const CRON_SECRET = "e2e-cron-secret";
const env = {
  NEXT_PUBLIC_SUPABASE_URL: SUPA,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supaOut.match(/ANON_KEY=(\S+)/)[1],
  SUPABASE_SERVICE_ROLE_KEY: supaOut.match(/SERVICE_ROLE_KEY=(\S+)/)[1],
  NEXT_PUBLIC_SITE_URL: BASE,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: "mailto:e2e@example.com",
  CRON_SECRET,
  // 테스트 전용: 링크 자동 채우기가 로컬 가짜 페이지(localhost)에 접속하도록 허용
  LINK_META_ALLOW_HOSTS: "localhost",
  // 가짜 KOPIS(로컬 Supabase 대역이 제공)
  KOPIS_SERVICE_KEY: "e2e-kopis-key",
  KOPIS_BASE_URL: `${SUPA}/__mock/kopis`,
};
if (!process.env.E2E_SKIP_BUILD) {
  console.log("next build (로컬 Supabase 값으로)…");
  execFileSync("npx", ["next", "build"], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "inherit"] });
}
await start("npx", ["next", "start", "-p", String(APP_PORT)], env, /Ready|started server/i);
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch {}
  if (i > 60) throw new Error("앱이 뜨지 않음");
  await new Promise((r) => setTimeout(r, 500));
}

await mkdir(join(ROOT, "screenshots"), { recursive: true });
const browser = await chromium.launch();
const failures = [];

/** 각 테스트 파일에 넘기는 도구 모음 */
const ctx = {
  BASE,
  check(ok, msg) { console.log(`  ${ok ? "ok" : "FAIL"}: ${msg}`); if (!ok) failures.push(msg); },
  async newPage(width = 360) {
    const page = await browser.newPage({ viewport: { width, height: 740 } });
    page.errors = [];
    page.on("pageerror", (e) => page.errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && page.errors.push(m.text()));
    // 이동 후 로딩 화면(Skeleton, aria-busy)이 사라질 때까지 기다리게 한다 — 로딩 중 화면을 읽는 일을 막는다
    const idle = () => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
    for (const name of ["goto", "waitForURL", "reload", "goBack"]) {
      const orig = page[name].bind(page);
      page[name] = async (...args) => { const r = await orig(...args); await idle(); return r; };
    }
    return page;
  },
  /** DB에 직접 SQL(관리자 지정 등 테스트 준비용) */
  async sql(query) {
    const r = await fetch(`${SUPA}/__mock/sql`, { method: "POST", body: JSON.stringify({ query }) });
    return (await r.json()).out;
  },
  /** 매직링크로 로그인(+닉네임). 반환: 같은 page */
  async login(page, email, nickname) {
    await page.goto(`${BASE}/login`);
    await page.getByLabel("이메일").fill(email);
    await page.getByRole("button", { name: "로그인 링크 받기" }).click();
    await page.getByText("로그인 링크를 보냈어요").waitFor();
    const { link } = await (await fetch(`${SUPA}/__mock/last-link?email=${encodeURIComponent(email)}`)).json();
    await page.goto(link);
    if (nickname && page.url().includes("/onboarding")) {
      await page.getByLabel("닉네임").fill(nickname);
      await page.getByRole("button", { name: "시작하기" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/onboarding"));
    }
    return page;
  },
  /** 진행 중인 토글(찜·팔로우) 저장이 모두 끝날 때까지 */
  settled: (page) => page.waitForFunction(() => !document.querySelector("[data-pending]"), null, { timeout: 10000 }),
  /** 개수가 n이 될 때까지 잠깐 기다린 뒤 실제 개수(로딩 화면을 거치는 이동 대비) */
  async count(locator, n, timeout = 5000) {
    const end = Date.now() + timeout;
    while (Date.now() < end && (await locator.count()) !== n) await new Promise((r) => setTimeout(r, 100));
    return locator.count();
  },
  /** 잠깐 기다려서 보이면 true (서버 액션 응답 대기용) */
  visible: (locator, timeout = 5000) => locator.first().waitFor({ timeout }).then(() => true, () => false),
  async lastLink(email) {
    return (await (await fetch(`${SUPA}/__mock/last-link?email=${encodeURIComponent(email)}`)).json()).link;
  },
  /** 360px 레이아웃: 가로 스크롤·말줄임 아닌 글자 잘림 */
  async layout(page, label) {
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const clipped = [...document.querySelectorAll("main *, nav a span, h1")].filter((el) => {
        const cs = getComputedStyle(el);
        return el.children.length === 0 && !el.closest(".sr-only") && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis" && cs.overflowX !== "auto" && cs.overflowX !== "scroll";
      }).map((el) => el.textContent?.trim().slice(0, 20) || `<${el.tagName.toLowerCase()}${el.getAttribute("name") ? ` name=${el.getAttribute("name")}` : ""}>`);
      return { overflow: de.scrollWidth - de.clientWidth, clipped };
    });
    ctx.check(m.overflow <= 0, `${label}: 가로 스크롤 없음 (${m.overflow}px)`);
    ctx.check(m.clipped.length === 0, `${label}: 글자 잘림 없음 ${m.clipped.join(", ")}`);
  },
  CRON_SECRET,
  SUPA,
  /** 크론 엔드포인트 호출 */
  runCron: async (secret = CRON_SECRET, path = "send-alerts") => {
    const r = await fetch(`${BASE}/api/cron/${path}`, { headers: secret ? { authorization: `Bearer ${secret}` } : {} });
    return { status: r.status, body: await r.json().catch(() => null) };
  },
  /** 가짜 푸시 구독(브라우저 PushManager 대신): endpoint는 로컬 Supabase 대역의 /__mock/push/:id */
  fakePushSubscription() {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const id = randomBytes(8).toString("hex");
    return {
      id, ecdh, authSecret: randomBytes(16),
      get json() { return { endpoint: `${SUPA}/__mock/push/${id}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: this.authSecret.toString("base64url") } }; },
    };
  },
  /** 가짜 구독으로 받은 푸시들을 RFC 8291(aes128gcm)로 풀어 JSON 배열로 */
  async receivedPushes(sub) {
    const list = await (await fetch(`${SUPA}/__mock/pushes?id=${sub.id}`)).json();
    return list.map((p) => {
      const buf = Buffer.from(p.body, "base64");
      const salt = buf.subarray(0, 16);
      const idlen = buf[20];
      const serverPub = buf.subarray(21, 21 + idlen);
      const ct = buf.subarray(21 + idlen);
      const shared = sub.ecdh.computeSecret(serverPub);
      const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), sub.ecdh.getPublicKey(), serverPub]);
      const ikm = Buffer.from(hkdfSync("sha256", shared, sub.authSecret, keyInfo, 32));
      const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
      const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
      const d = createDecipheriv("aes-128-gcm", cek, nonce);
      d.setAuthTag(ct.subarray(ct.length - 16));
      const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
      return JSON.parse(plain.subarray(0, plain.lastIndexOf(2)).toString());
    });
  },
  shot: (page, name) => page.screenshot({ path: join(ROOT, "screenshots", `${name}.png`), fullPage: true }),
};

const filter = process.argv[2];
const files = (await readdir(join(ROOT, "e2e"))).filter((f) => f.endsWith(".e2e.mjs") && (!filter || f.includes(filter))).sort();
for (const f of files) {
  console.log(`\n▶ ${f}`);
  try {
    await (await import(join(ROOT, "e2e", f))).default(ctx);
  } catch (e) {
    ctx.check(false, `${f} 예외: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
await stopAll();
if (failures.length) { console.error(`\n${failures.length}개 실패:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("\nE2E 통과");
process.exit(0);
