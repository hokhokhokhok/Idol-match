// 5탭 이동·활성 표시·360px 가로 스크롤/글자 잘림 검사 + 스크린샷(screenshots/).
// 먼저 `npm run build`. 이 스크립트가 next start를 띄우고 끝나면 내린다.
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;
const TABS = [
  { label: "홈", path: "/" },
  { label: "공연", path: "/shows" },
  { label: "혜택", path: "/benefits" },
  { label: "배우", path: "/actors" },
  { label: "MY", path: "/me" },
];

const server = spawn("npx", ["next", "start", "-p", String(PORT)], { stdio: "ignore", detached: true });
const stop = () => { try { process.kill(-server.pid); } catch {} };
process.on("exit", stop);

for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch {}
  if (i > 60) throw new Error("서버가 뜨지 않음");
  await new Promise((r) => setTimeout(r, 500));
}

await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch();
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? "ok" : "FAIL"}: ${msg}`); if (!ok) failures.push(msg); };

for (const width of [360, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 740 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + "/");
  for (const t of TABS) {
    await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: t.label, exact: true }).click();
    await page.waitForURL(BASE + t.path);
    const current = await page.locator('nav a[aria-current="page"]').innerText();
    check(current.trim() === t.label, `${width}px ${t.path}: 활성 탭 '${t.label}'`);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const clipped = [...document.querySelectorAll("h1, nav a span, .placeholder *")].filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow !== "ellipsis",
      ).length;
      return { overflow: de.scrollWidth - de.clientWidth, clipped };
    });
    check(m.overflow <= 0, `${width}px ${t.path}: 가로 스크롤 없음 (${m.overflow}px)`);
    check(m.clipped === 0, `${width}px ${t.path}: 글자 잘림 없음`);
    await page.screenshot({ path: `screenshots/${width}${t.path === "/" ? "-home" : t.path.replace("/", "-")}.png` });
  }
  await page.locator('a[aria-label="검색"]').click();
  await page.waitForURL(BASE + "/search");
  check(true, `${width}px: 🔍 → /search`);
  check(errors.length === 0, `${width}px: 콘솔 에러 없음 ${errors.join(" | ")}`);
  await page.close();
}

await browser.close();
stop();
if (failures.length) { console.error(`\n${failures.length}개 실패`); process.exit(1); }
console.log("\nE2E 통과");
