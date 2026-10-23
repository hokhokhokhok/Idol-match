// Playwright E2E: 아이패드·아이폰 스크린샷 + 콘솔 에러 0건 + 핵심 동작(MBTI 변경, 내 입력 유지, 오프라인, 카드 저장, 언어).
import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { serve } from "./serve.mjs";

// Playwright는 기본으로 localhost까지 프록시에 보내므로 끈다(프록시 환경에서 실행할 때만 의미 있음).
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= "1";
const PORT = 4173, URL = `http://localhost:${PORT}/`;
const exe = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: exe, proxy });
await mkdir("screenshots", { recursive: true });

const VIEWS = [
  ["ipad", { ...devices["iPad Pro 11"], viewport: { width: 1024, height: 1366 } }],
  ["iphone", { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } }],
];
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✔" : "✘"} ${msg}`); if (!ok) failed++; };

for (const [name, opts] of VIEWS) {
  // WebKit UA를 그대로 쓰되 엔진은 Chromium(컨테이너에 WebKit 미설치).
  const ctx = await browser.newContext({ ...opts, defaultBrowserType: undefined, locale: "ko-KR", acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("#top .row");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `screenshots/${name}.png`, fullPage: false });
  await page.screenshot({ path: `screenshots/${name}-full.png`, fullPage: true });

  // MBTI 변경 → TOP 10·지도·그룹 순위 즉시 변경
  const snap = () => page.evaluate(() => [document.querySelector("#top").textContent, document.querySelector("#gtop").textContent, document.querySelector("#map").innerHTML]);
  const before = await snap();
  await page.click(".axis:nth-child(1) button:text-is('I')");
  await page.click(".axis:nth-child(3) button:text-is('T')");
  const after = await snap();
  check(await page.textContent("#mytype") === "INTP", `${name}: MBTI 토글 → INTP`);
  check(before.every((v, i) => v !== after[i]), `${name}: TOP 10·그룹 순위·지도 모두 갱신`);

  // 미공개 멤버 입력 → 지도에 추가 → 새로고침 후 유지
  const dotsBefore = await page.locator("#map circle.dot").count();
  await page.click("#dir .mem button.no >> nth=0");
  await page.click("#dlgTypes button:text-is('ENTJ')");
  const dotsAfter = await page.locator("#map circle.dot").count();
  check(dotsAfter === dotsBefore + 1, `${name}: 미공개 멤버 입력 후 지도 점 ${dotsBefore}→${dotsAfter}`);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#top .row");
  check(await page.locator("#map circle.dot").count() === dotsAfter, `${name}: 새로고침 후 내 입력 유지`);
  check(await page.textContent("#mytype") === "INTP", `${name}: 새로고침 후 내 MBTI 유지`);

  // 결과 카드 PNG
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#cardBtn")]);
  const path = `screenshots/${name}-card.png`;
  await dl.saveAs(path);
  check(dl.suggestedFilename() === "idol-match-INTP.png", `${name}: 결과 카드 다운로드 ${dl.suggestedFilename()}`);

  // 내보내기
  const [ex] = await Promise.all([page.waitForEvent("download"), page.click("#exportBtn")]);
  check(ex.suggestedFilename() === "idol-match-mbti.json", `${name}: 내 입력 JSON 내보내기`);

  // 언어 토글
  await page.click("#langBtn");
  check((await page.textContent("#h-top")).includes("Top 10"), `${name}: English 전환`);
  check(await page.locator("#gtop b", { hasText: /[A-Za-z]/ }).count() > 0, `${name}: 그룹 영문명 사용`);
  await page.screenshot({ path: `screenshots/${name}-en.png` });
  await page.click("#langBtn");

  // 오프라인(서비스 워커)
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" }); // SW가 제어권을 잡은 상태로
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("#top .row", { timeout: 5000 }).catch(() => {});
  check(await page.locator("#top .row").count() === 10, `${name}: 오프라인 새로고침 후에도 실행`);
  await ctx.setOffline(false);

  // 오프라인 중 폰트 요청 실패 같은 네트워크 로그는 제외하고 스크립트 에러만 집계
  const real = errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  check(real.length === 0, `${name}: 콘솔 에러 ${real.length}건${real.length ? " → " + real.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("all checks passed");
