// 정적 빌드(out/)를 띄워 주요 흐름을 검사하고 screenshots/에 저장한다. 먼저 `npm run build`.
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const OUT = new URL("../out/", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (p.endsWith("/")) p += "index.html";
  try {
    const body = await readFile(join(OUT, p));
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(await readFile(join(OUT, "404.html")).catch(() => "not found"));
  }
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;

await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch();
const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok" : "FAIL"}: ${msg}`);
  if (!ok) failures.push(msg);
};
const noOverflow = async (page, label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(o <= 0, `${label}: 가로 스크롤 없음 (${o}px)`);
};
const cards = (page) => page.locator("main article");
/** 화면이 URL 변경을 반영할 때까지 최대 3초 기다리며 개수를 확인 */
const countIs = async (locator, n) => {
  for (let i = 0; i < 30; i++) {
    if ((await locator.count()) === n) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

for (const width of [360, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 지도 타일은 네트워크 사정(샌드박스 등)에 따라 막힐 수 있어 콘솔 에러 집계에서 뺀다
  page.on("console", (m) => m.type() === "error" && !/tile\.openstreetmap|ERR_TUNNEL|Failed to load resource/.test(m.text() + (m.location()?.url ?? "")) && errors.push(m.text()));
  const W = `${width}px`;

  // 홈·필터
  await page.goto(BASE + "/");
  await cards(page).first().waitFor();
  check(await countIs(cards(page), 6), `${W} 홈: 학원 6곳`);
  check(await page.getByText("가상의 예시 데이터").first().isVisible(), `${W} 홈: 예시 데이터 안내`);
  await page.screenshot({ path: `screenshots/${width}-home.png` });
  const filterBtn = await page.getByRole("button", { name: /필터/ }).boundingBox();
  check(!!filterBtn && filterBtn.x + filterBtn.width <= width, `${W} 홈: 필터 버튼이 화면 안에 보임`);
  const toggleH = await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "목록" }).boundingBox();
  check(!!toggleH && toggleH.height < 40, `${W} 홈: 목록/지도 토글 한 줄`);
  await noOverflow(page, `${W} 홈`);

  await page.getByRole("group", { name: "분야" }).getByRole("button", { name: "댄스" }).click();
  await page.waitForURL(/c=/);
  check(await countIs(cards(page), 2), `${W} 분야=댄스 → 2곳`);
  await page.getByRole("button", { name: /필터/ }).click();
  await page.getByRole("button", { name: "토", exact: true }).click();
  await page.getByRole("button", { name: /저녁/ }).click();
  check((await countIs(cards(page), 0)) && (await page.getByText("조건에 맞는 학원이 없습니다").isVisible()), `${W} 댄스+토+저녁 → 0곳, 빈 안내`);
  await page.screenshot({ path: `screenshots/${width}-filters.png` });
  await page.getByRole("button", { name: "필터 초기화" }).first().click();
  await page.getByRole("button", { name: "20만원 초과" }).click();
  check((await countIs(cards(page), 1)) && (await page.getByText("수강료 미확인 1곳 제외").isVisible()), `${W} 20만원 초과 → 1곳, 미확인 1곳 제외 표시`);
  // URL 공유: 새로고침해도 필터 유지
  await page.reload();
  await cards(page).first().waitFor();
  check(await countIs(cards(page), 1), `${W} 새로고침 후 필터 유지`);
  await page.goto(BASE + "/");

  // 발레 분야
  await page.getByRole("group", { name: "분야" }).getByRole("button", { name: "발레" }).click();
  check((await countIs(cards(page), 1)) && (await cards(page).first().innerText()).includes("토슈즈키즈발레"), `${W} 분야=발레 → 1곳`);
  await page.goto(BASE + "/");

  // 지도 (Leaflet + OSM. 테스트 환경에서 타일이 막혀도 마커는 그려진다)
  await page.getByRole("group", { name: "보기 방식" }).getByRole("button", { name: "지도" }).click();
  const mapRegion = page.getByRole("region", { name: "학원 지도" });
  await mapRegion.waitFor();
  check(await countIs(mapRegion.locator(".leaflet-marker-icon"), 6), `${W} 지도: 마커 6개`);
  check(await mapRegion.getByRole("link", { name: "OpenStreetMap" }).isVisible(), `${W} 지도: OSM 출처 표기`);
  await mapRegion.locator('.leaflet-marker-icon[title="(예시)무대연기아틀리에"]').click();
  check((await countIs(cards(page), 1)) && (await cards(page).first().innerText()).includes("무대연기아틀리에"), `${W} 지도: 표시 누르면 학원 카드`);
  await page.screenshot({ path: `screenshots/${width}-map.png` });
  await noOverflow(page, `${W} 지도`);

  // 즐겨찾기 (새로고침 후 유지)
  await page.goto(BASE + "/");
  await cards(page).first().waitFor();
  await page.getByRole("button", { name: "(예시)하모니보컬교습소 즐겨찾기", exact: true }).click();
  await page.goto(BASE + "/?fav=1");
  await cards(page).first().waitFor();
  check(await countIs(cards(page), 1), `${W} 즐겨찾기만 → 1곳 (새로고침 후 유지)`);

  // 비교 (최대 3)
  await page.goto(BASE + "/");
  await cards(page).first().waitFor();
  for (const n of ["(예시)샘플뮤지컬학원", "(예시)하모니보컬교습소", "(예시)스텝업키즈댄스학원", "(예시)무대연기아틀리에"]) {
    await page.getByRole("button", { name: `${n} 비교에 담기` }).click();
  }
  check(await page.getByRole("status").filter({ hasText: "최대 3곳" }).isVisible(), `${W} 비교 4번째 → 최대 3곳 안내`);
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: /비교/ }).click();
  await page.waitForURL(/\/compare\/$/);
  await page.getByRole("heading", { name: /학원 비교/ }).waitFor();
  check((await page.getByText("3/3").count()) === 1, `${W} 비교: 3곳`);
  check(await page.getByText(/뮤지컬 1건\(공연 DB 확인 1\)/).first().isVisible(), `${W} 비교: 경력 요약`);
  await page.screenshot({ path: `screenshots/${width}-compare.png`, fullPage: true });
  await noOverflow(page, `${W} 비교`);

  // 상세
  await page.goto(BASE + "/academy/A004/");
  await page.getByRole("heading", { name: /원장·강사/ }).waitFor();
  check((await page.getByText("공연 DB 확인", { exact: true }).count()) === 2, `${W} 상세 A004: 공연 DB 확인 2건`);
  const corr = await page.getByRole("link", { name: "정보 정정·삭제 요청" }).getAttribute("href");
  check(decodeURIComponent(corr ?? "").includes("A004"), `${W} 상세: 정정 요청 링크에 학원 id`);
  check(await page.getByText("수강료 미확인(직접 문의 필요)").isVisible(), `${W} 상세: 미확인 수강료 원문 표시`);
  await page.screenshot({ path: `screenshots/${width}-detail.png`, fullPage: true });
  await noOverflow(page, `${W} 상세`);
  await page.goto(BASE + "/academy/A005/");
  check(await page.getByText("재확인 필요").isVisible(), `${W} 상세 A005: 6개월 경과 표시`);
  await page.goto(BASE + "/academy/A003/");
  check(await page.getByText("공개된 경력 정보가 없습니다").isVisible(), `${W} 상세 A003: 경력 없는 강사 안내`);

  // 데이터 안내
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: "데이터 안내" }).click();
  await page.getByRole("heading", { name: "수집 기준" }).waitFor();
  check(true, `${W} 데이터 안내 열림`);
  await noOverflow(page, `${W} 안내`);

  check(errors.length === 0, `${W} 콘솔 에러 없음 ${errors.join(" | ")}`);
  await ctx.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\n${failures.length}개 실패`);
  process.exit(1);
}
console.log("\n모두 통과");
