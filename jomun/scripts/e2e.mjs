// 브라우저 자동 점검: 저장소 루트에서 node jomun/scripts/e2e.mjs  (루트 npm install로 playwright 필요)
// iPad 세로·가로, 아이폰 크기에서 복습·기록·오답 노트·연결 훈련·등급 점수·D-day·백업/복원·저장 실패 안내·오프라인을 확인한다.
// 엔진은 Chromium(WebKit UA). 실제 iPad Safari 동작은 README의 체크리스트로 따로 확인할 것.
import { chromium, devices } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { serve } from "../../scripts/serve.mjs";

process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK ??= "1";
const PORT = 4174, URL = `http://localhost:${PORT}/jomun/`;
const exe = ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find(existsSync);
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: exe });
const SHOTS = "jomun/screenshots";
await mkdir(SHOTS, { recursive: true });

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✔" : "✘"} ${msg}`); if (!ok) failed++; };
const ipad = devices["iPad Pro 11"];
const VIEWS = [
  ["ipad-portrait", { ...ipad, viewport: { width: 834, height: 1194 } }],
  ["ipad-landscape", { ...ipad, viewport: { width: 1194, height: 834 } }],
  ["iphone", { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } }],
];

// 화면에 보이는 버튼·입력의 높이와 글자 크기, 가로 스크롤
async function layout(page, name, where) {
  const r = await page.evaluate(() => {
    const vis = e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const els = [...document.querySelectorAll("button, select, input:not([type=checkbox]):not([type=file]), .btn")].filter(vis);
    const small = els.filter(e => e.getBoundingClientRect().height < (e.classList.contains("blank") ? 44 : 48) - 0.5)
      .map(e => `${e.tagName}.${e.className}:${e.textContent.trim().slice(0, 12)}=${Math.round(e.getBoundingClientRect().height)}`);
    const tiny = [...document.querySelectorAll("input, select, textarea")].filter(vis).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.tagName);
    return { small, tiny, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  check(!r.small.length, `${name} ${where}: 터치 영역 48px 이상 ${r.small.join(", ")}`);
  check(!r.tiny.length, `${name} ${where}: 입력 글자 16px 이상 ${r.tiny.join(",")}`);
  check(!r.hscroll, `${name} ${where}: 가로 스크롤 없음`);
}

for (const [name, opts] of VIEWS) {
  const ctx = await browser.newContext({ ...opts, locale: "ko-KR", acceptDownloads: true, serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("dialog", d => d.accept());

  await page.goto(URL, { waitUntil: "networkidle" });
  check((await page.textContent("h2")).includes("오늘 조문 0/10"), `${name}: 첫 실행 하루 목표 10개`);
  const PACK_N = await page.evaluate(() => JOMUN_PACK.items.length);
  check((await page.textContent(".card")).includes(`전체 ${PACK_N}`) && await page.locator("button:text('오늘 조문 시작 (10개)')").count() === 1, `${name}: 기본 조문 팩 ${PACK_N}개, 오늘 10개`);
  check(!(await page.textContent(".card")).includes("채우지 못합니다") && !await page.isVisible("#warn"), `${name}: 첫 실행엔 부족·추가 안내 없음`);
  await page.screenshot({ path: `${SHOTS}/${name}-home.png` });
  await layout(page, name, "홈");
  // 아래 복습 흐름은 샘플 3개만 쓰도록 하루 목표를 3으로 (A급 새 조문 중 샘플이 맨 앞)
  await page.click("nav button:text('관리')");
  await page.fill("input[data-chg=cap]", "3");
  await page.dispatchEvent("input[data-chg=cap]", "change");
  await page.click("nav button:text('오늘')");

  // 복습: 첫 카드 정답 입력 → 확인 → 알았다
  await page.click("button:text('오늘 조문 시작 (3개)')");
  check(await page.locator(".card .flag").count() === 0 && (await page.textContent(".card")).includes("시행 2026-09-08"), `${name}: 원문 조문 카드 — 시행일 표시, '원문 대조 필요' 없음`);
  const blanks = page.locator("input.blank");
  const first = await page.textContent(".card b");
  if (first.includes("제67조 제1항")) { await blanks.nth(0).fill("협의 성립 당시"); await blanks.nth(1).press("Enter"); }
  else await blanks.nth(0).press("Enter");
  await page.screenshot({ path: `${SHOTS}/${name}-review.png` });
  await layout(page, name, "복습");
  // Enter로 마지막 칸까지 넘기면 정답 확인
  for (let k = 0; k < 6 && await page.locator("input.blank").count(); k++) await page.locator("input.blank").last().press("Enter");
  check(await page.locator("button:text('알았다')").count() === 1, `${name}: Enter로 다음 칸 → 마지막 칸에서 정답 확인`);
  await page.click("button:text('알았다')");
  // 두 번째: 몰랐다 → 재출제 → 애매
  await page.click("button:text('포기·보기')");
  const missed = await page.textContent(".card b");
  await page.click("button:text('몰랐다')");
  await page.click("button:text('포기·보기')");
  await page.click("button:text('알았다')");
  await page.click("button:text('포기·보기')");
  check(await page.textContent(".card b") === missed, `${name}: '몰랐다' 조문 세션 내 재출제`);
  await page.click("button:text('애매')");
  check(await page.locator("h2:text('오늘 조문 끝!')").count() === 1, `${name}: 세션 완료 화면`);
  check((await page.textContent(".card")).includes("오늘 조문 3/3 · 누적 4회 평가 · 정답률 50%"), `${name}: 완료 화면 오늘 기록(4회, 50%)`);
  await page.click("button:text('홈으로')");
  const stats = await page.textContent(".stats");
  check(stats.includes("4") && stats.includes("50%") && stats.includes("1일"), `${name}: 홈 학습 기록 4회·50%·연속 1일 (${stats.replace(/\s+/g, " ")})`);

  // 오답 노트
  await page.click("nav button:text('오답')");
  check((await page.textContent("h2")).includes("1개") && (await page.textContent(".card b")) === missed, `${name}: 오답 노트에 '몰랐다' 조문`);
  await layout(page, name, "오답");
  await page.click("button:text('이 조문만 복습')");
  check((await page.textContent(".sub")).includes("오답 복습 1/1"), `${name}: 이 조문만 복습`);
  await page.click("button:text('포기·보기')");
  await page.click("button:text('알았다')");
  await page.click("button:text('돌아가기')");
  check(await page.locator("nav button.on:text('오답')").count() === 1, `${name}: 오답 복습 후 오답 노트로 복귀`);

  // 연결 훈련: 샘플 순서대로 고르기 → 3/3
  await page.click("nav button:text('연결')");
  await page.click("button:text('훈련')");
  await layout(page, name, "연결");
  for (const a of ["제67조 제1항", "제67조 제2항", "제70조 제1항"]) await page.click(`#cpool .chip:has-text('${a}')`);
  await page.fill("#cq", "개발이익");
  check(await page.locator("#cpool .chip").count() === 1, `${name}: 연결 훈련 검색으로 전체 조문 찾기`);
  await page.screenshot({ path: `${SHOTS}/${name}-chain.png` });
  await page.click("button:text('정답 순서 확인')");
  check((await page.textContent(".card p b")) === "3/3", `${name}: 연결 훈련 정답 3/3`);
  await page.click("button:text('다시 하기')");
  for (const a of ["제70조 제1항", "제67조 제1항", "제67조 제2항"]) await page.click(`#cpool .chip:has-text('${a}')`);
  await page.click("button:text('정답 순서 확인')");
  check((await page.textContent(".card p b")) === "0/3" && await page.locator(".res .mid").count() === 3, `${name}: 순서 틀리면 0/3, △ 표시`);
  // 새 쟁점 만들기
  await page.click("button:text('목록으로')");
  await page.click("button:text('+ 새 연결 쟁점 만들기')");
  await page.click("button:text('저장')");
  check((await page.textContent(".err")).includes("title"), `${name}: 쟁점명 없이 저장하면 오류`);
  await page.fill("#etitle", "테스트 쟁점");
  await page.click("#epool .chip:has-text('제70조 제1항')");
  await page.click("#epool .chip:has-text('제67조 제2항')");
  await page.click("button:text('저장')");
  check(await page.locator(".card b:text('테스트 쟁점')").count() === 1, `${name}: 새 연결 쟁점 저장`);

  // 등급 점수: 70조 제1항(A) → 점수 낮게 → D 제안 → 수락
  await page.click("nav button:text('관리')");
  await page.click("button:text('등급 점수 계산')");
  const card = page.locator("[data-sid='bosang-70-1']");
  for (const [k, v] of [["freq", 3], ["need", 4], ["link", 2], ["mention", 1], ["diff", 9]]) { await card.locator(`input[data-k=${k}]`).fill(String(v)); await card.locator(`input[data-k=${k}]`).press("Tab"); }
  check((await card.locator(".srow").textContent()).includes("점수 32.5"), `${name}: 점수 계산 32.5 (${await card.locator(".srow").textContent()})`);
  await layout(page, name, "등급 점수");
  await page.screenshot({ path: `${SHOTS}/${name}-score.png` });
  await card.locator("button:text('A → D 수락')").click();
  check(await page.locator("[data-sid='bosang-70-1'] .badge.D").count() >= 1, `${name}: 제안 수락 → D 등급`);

  // D-day: 60일 뒤 시험 → 제안 한도
  await page.click("nav button:text('관리')");
  const exam = await page.evaluate(() => Core.addDays(Core.todayKST(), 60));
  await page.fill("input[type=date]", exam);
  await page.dispatchEvent("input[type=date]", "change");
  const sug = await page.evaluate(() => Core.capSuggestion(JSON.parse(localStorage.getItem("jomun-v1")).items, 60).cap);
  check((await page.textContent(".card")).includes(`D-60`) && (await page.textContent(".card")).includes(`제안 ${sug}개`), `${name}: D-60 제안 한도 ${sug}개`);
  await page.click("button:text('적용')");
  check(await page.inputValue("input[data-chg=cap]") === String(sug), `${name}: 제안 한도 적용`);
  await page.click("nav button:text('오늘')");
  check((await page.textContent(".dday")).includes("D-60"), `${name}: 홈 D-day 표시`);

  // 가져오기 검증 오류
  await page.click("nav button:text('관리')");
  await layout(page, name, "관리");
  await page.screenshot({ path: `${SHOTS}/${name}-manage.png`, fullPage: true });
  const n0 = await page.evaluate(() => JSON.parse(localStorage.getItem("jomun-v1")).items.length);
  await page.fill("#io", '[{"id":"a","law":"토지보상법"');
  await page.click("button:text('가져오기·복원')");
  check((await page.textContent("#impres")).includes("JSON 문법 오류"), `${name}: JSON 문법 오류 안내`);
  await page.fill("#io", JSON.stringify([{ id: "t-1", law: "토지보상법", article: "제1조", grade: "E", text: "가 {{나" }]));
  await page.click("button:text('가져오기·복원')");
  const err = await page.textContent("#impres");
  check(err.includes("grade") && err.includes("괄호 짝") && err.includes("article") === false, `${name}: 스키마 오류 목록 (grade·빈칸 괄호)`);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("jomun-v1")).items.length);
  check(before === n0, `${name}: 오류가 있으면 아무것도 바꾸지 않음`);
  await page.fill("#io", JSON.stringify({ items: [{ id: "t-1", law: "감정평가법", article: "제1조", grade: "C", text: "테스트 {{빈칸}}" }], chains: [{ id: "c-x", title: "가져온 쟁점", ids: ["t-1", "bosang-67-1"] }] }));
  await page.click("button:text('가져오기·복원')");
  check((await page.textContent("#impres")).includes("조문 추가 1 · 갱신 0 · 연결 쟁점 추가 1"), `${name}: 정상 가져오기 결과`);

  // 백업 파일 → 초기화 → 복원
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button:text('백업 파일 저장')")]);
  const bpath = `${SHOTS}/${name}-backup.json`;
  await dl.saveAs(bpath);
  const bk = JSON.parse(await readFile(bpath, "utf8"));
  check(bk.app === "jomun-trainer" && bk.state.items.length === n0 + 1 && Object.keys(bk.state.days).length === 1, `${name}: 백업 파일 내용`);
  await page.click("button:text('초기화')");
  await page.setInputFiles("#file", bpath);
  await page.waitForSelector(".okmsg");
  check((await page.textContent(".okmsg")).includes(`복원 완료: 조문 ${n0 + 1}개`) && (await page.textContent(".okmsg")).includes("학습 기록 1일"), `${name}: 백업 파일로 복원 (${await page.textContent(".okmsg")})`);
  check(await page.inputValue("input[data-chg=cap]") === String(sug), `${name}: 복원 후 설정 유지`);

  // 원문 대조 완료 체크 → 표시 사라짐
  await page.check("input[data-chg=verified][data-id='bosang-67-1']");
  check(await page.evaluate(() => JSON.parse(localStorage.getItem("jomun-v1")).items.find(i => i.id === "bosang-67-1").verified) === true, `${name}: 원문 대조 완료 저장`);

  // 저장 실패 안내
  await page.evaluate(() => { Storage.prototype.setItem = function () { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; }; });
  await page.selectOption("select[data-id='bosang-67-2']", "B");
  check(await page.isVisible("#warn") && (await page.textContent("#warn")).includes("저장 공간이 부족"), `${name}: 저장 실패 안내 표시`);

  // 새로고침해도 유지 + 오프라인
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "networkidle" });
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });
  check((await page.textContent("h2")).includes("오늘 조문") && await page.evaluate(() => !!navigator.serviceWorker.controller), `${name}: 오프라인 새로고침에서도 동작`);
  await ctx.setOffline(false);

  check(!errors.length, `${name}: 콘솔 에러 0건 ${errors.join(" | ")}`);
  await ctx.close();
}

// 손상된 저장 데이터 → 원본 보관 + 안내
{
  const ctx = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.evaluate(() => localStorage.setItem("jomun-v1", "{broken"));
  await page.reload();
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check(await page.isVisible("#warn") && keys.some(k => k.startsWith("jomun-v1-broken-")), "손상된 저장 데이터: 안내 + 원본 보관");
  // v1 형식(기록 없음) 마이그레이션
  await page.evaluate(() => localStorage.setItem("jomun-v1", JSON.stringify({ items: [{ id: "x", law: "L", article: "제1조", grade: "B", text: "a {{b}}", box: 2, due: "2020-01-01", log: [] }], cap: 25 })));
  await page.reload();
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("jomun-v1")));
  const pn = await page.evaluate(() => JOMUN_PACK.items.length);
  check(s.schema === 3 && s.cap === 25 && s.items[0].box === 2 && s.items.length === 1 + pn && s.packVer === await page.evaluate(() => JOMUN_PACK.version), "v1 저장 데이터 마이그레이션 (학습 상태 유지 + 기본 조문 팩 추가)");
  check((await page.textContent("#warn")).includes(`조문 ${pn}개를 추가`), "기존 사용자에게 조문 팩 추가 안내");
  // 이미 팩을 받은 기기에서 팩 조문을 지워도 다시 생기지 않음
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("jomun-v1")); s.items = s.items.filter(i => i.id !== "bosang-61"); localStorage.setItem("jomun-v1", JSON.stringify(s)); });
  await page.reload();
  check(await page.evaluate(() => !JSON.parse(localStorage.getItem("jomun-v1")).items.some(i => i.id === "bosang-61")), "지운 팩 조문은 같은 팩 버전에서 다시 추가되지 않음");
  // 이전 팩 버전(1)을 받은 기기: 팩 버전이 오르면 없는 조문(새 조문)만 추가되고 기존 학습 상태는 유지
  await page.evaluate(OLD62 => { const s = JSON.parse(localStorage.getItem("jomun-v1")); s.packVer = 1; s.items = s.items.filter(i => i.id !== "adminappeal-27"); const o = s.items.find(i => i.id === "bosang-62"); o.box = 4; o.grade = "A"; o.verified = false; o.text = OLD62; localStorage.setItem("jomun-v1", JSON.stringify(s)); }, "사업시행자는 해당 공익사업을 위한 {{공사에 착수하기 이전}}에 토지소유자와 관계인에게 보상액 {{전액(全額)}}을 지급하여야 한다. 다만, 제38조에 따른 {{천재지변 시의 토지 사용}}과 제39조에 따른 {{시급한 토지 사용}}의 경우 또는 토지소유자 및 관계인의 {{승낙}}이 있는 경우에는 그러하지 아니하다.");
  await page.reload();
  const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem("jomun-v1")));
  check(s2.items.some(i => i.id === "adminappeal-27") && s2.items.find(i => i.id === "bosang-62").box === 4 && s2.packVer === await page.evaluate(() => JOMUN_PACK.version) && s2.items.some(i => i.id === "bosang-rule-45"), "이전 팩(v1) 기기 업데이트: 새 조문 추가, 기존 학습 상태 유지");
  const n62 = s2.items.find(i => i.id === "bosang-62"), p62 = await page.evaluate(() => JOMUN_PACK.items.find(i => i.id === "bosang-62").text);
  check(n62.text === p62 && n62.verified === true && n62.grade === "A" && n62.box === 4, "예전에 기억으로 쓴 문구 → 원문으로 교체(등급·학습 기록 유지)");
  check((await page.textContent("#warn")).includes("국가법령정보센터 원문으로 바꿨습니다"), "원문 교체 안내");
  await ctx.close();
}

await browser.close();
server.close();
console.log(failed ? `\n${failed}개 실패` : "\n모두 통과");
process.exit(failed ? 1 : 0);
