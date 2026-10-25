// 혜택 목록: 마감 지난 혜택 숨김/보기, 오늘 마감 주황 배지, 종류·오늘 마감 필터, 티켓오픈 표기
export default async function ({ BASE, check, newPage, layout, shot, visible }) {
  const page = await newPage();
  const titles = () => page.locator(".benefit-title").allInnerTexts();

  await page.goto(`${BASE}/benefits`);
  let t = await titles();
  check(t.length === 3 && !t.includes("[샘플] 지난 이벤트(마감 지남)"), `기본: 마감 지난 혜택 숨김 (${t.join(", ")})`);
  check(t[0] === "[샘플] 오늘 마감 로터리", "마감 임박순(오늘 마감이 맨 위)");
  const today = page.locator(".benefit-card", { hasText: "[샘플] 오늘 마감 로터리" }).locator(".deadline");
  check(/^오늘 \d{2}:\d{2} 마감$/.test(await today.innerText()), `오늘 마감 표기 (${await today.innerText()})`);
  const bg = await today.evaluate((el) => getComputedStyle(el).backgroundColor);
  check(bg === "rgb(232, 89, 12)", `오늘 마감 배지 주황 (${bg})`);
  const soon = page.locator(".benefit-card", { hasText: "[샘플] 막공 주간 할인" }).locator(".deadline");
  check((await soon.getAttribute("class")).includes("deadline-soon"), "3일 이내 배지");
  const open = await page.locator(".benefit-card", { hasText: "[샘플] 1차 티켓오픈" }).locator(".deadline").innerText();
  check(/^\d{2}\.\d{2}\(.\) \d{2}:\d{2} 오픈$/.test(open), `티켓오픈은 오픈 시각 표기 (${open})`);
  check(await visible(page.locator(".benefit-show", { hasText: "[샘플] 뮤지컬 첫공" })), "공연 링크");
  await layout(page, "혜택 목록");
  await shot(page, "360-benefits");

  await page.getByRole("link", { name: "같이 보기" }).click();
  await page.waitForURL(/expired=1/);
  t = await titles();
  check(t.length === 4 && t.includes("[샘플] 지난 이벤트(마감 지남)"), "마감 지난 혜택 같이 보기");
  check((await page.locator(".benefit-card", { hasText: "마감 지남" }).locator(".deadline").innerText()) === "마감됨", "지난 혜택은 '마감됨'");

  await page.getByRole("link", { name: "로터리" }).click();
  await page.waitForURL(/type=lottery/);
  t = await titles();
  check(t.length === 1 && t[0] === "[샘플] 오늘 마감 로터리", "종류 필터(로터리)");

  await page.getByRole("link", { name: "오늘 마감" }).click();
  await page.waitForURL(/when=today/);
  t = await titles();
  check(t.length === 1 && t[0] === "[샘플] 오늘 마감 로터리", "오늘 마감 필터");

  await page.goto(`${BASE}/benefits?type=event`);
  check(await visible(page.getByText("지금 받을 수 있는 혜택이 없어요")), "결과 없음 안내");
  await page.goto(`${BASE}/benefits?type=discount&when=today`);
  // 종류 칩을 누르면 when은 빠지지만, 직접 넣은 조합도 깨지지 않아야 한다
  check(await page.locator(".benefit-card, .empty").count() > 0, "조합 쿼리도 정상 표시");

  await page.goto(`${BASE}/shows/00000000-0000-4000-8000-000000000201`);
  t = await titles();
  check(t.length === 1 && t[0] === "[샘플] 오늘 마감 로터리", `공연 상세: 그 공연의 진행 중 혜택만 (${t.join(", ")})`);

  check(page.errors.length === 0, `콘솔 에러 없음 ${page.errors.join(" | ")}`);
  await page.close();
}
