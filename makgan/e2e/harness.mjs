// E2E 실행기: 로컬 Supabase 대역 → 그 값으로 next build → next start → 각 *.e2e.mjs 실행.
//   npm run test:e2e            전체
//   npm run test:e2e -- auth    파일 이름에 'auth'가 들어간 것만
//   E2E_SKIP_BUILD=1            이미 같은 env로 빌드했으면 빌드 생략
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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

const supaOut = await start("node", ["scripts/local-supabase.mjs"], { LOCAL_SUPABASE_PORT: String(SUPA_PORT), SITE_URL: BASE }, /local-supabase ready[\s\S]*ANON_KEY=\S+/);
const env = {
  NEXT_PUBLIC_SUPABASE_URL: SUPA,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supaOut.match(/ANON_KEY=(\S+)/)[1],
  NEXT_PUBLIC_SITE_URL: BASE,
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
        return el.children.length === 0 && !el.closest(".sr-only") && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis" && cs.overflowX !== "auto" && cs.overflowX !== "scroll";
      }).map((el) => el.textContent?.slice(0, 20));
      return { overflow: de.scrollWidth - de.clientWidth, clipped };
    });
    ctx.check(m.overflow <= 0, `${label}: 가로 스크롤 없음 (${m.overflow}px)`);
    ctx.check(m.clipped.length === 0, `${label}: 글자 잘림 없음 ${m.clipped.join(", ")}`);
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
