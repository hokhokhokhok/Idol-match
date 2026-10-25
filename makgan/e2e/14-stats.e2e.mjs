// 그날 캐스트(공연 캐스팅에서 고르기·자동완성 추가) + 통계 탭(횟수·지출·평균·월별·TOP3)
const S1 = "00000000-0000-4000-8000-000000000201"; // 시즌 캐스팅: 가·나(주인공), 다(조연)
const S2 = "00000000-0000-4000-8000-000000000202";

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, count }) {
  const page = await newPage();
  await login(page, "stats@example.com", "통계러");

  await page.goto(`${BASE}/me?tab=stats`);
  check(await visible(page.getByText("첫 후기를 남겨볼까요?")), "기록 없을 때 통계 빈 화면");

  // 후기 1: 공연 캐스팅에서 고르기 + 다른 배우 추가
  await page.goto(`${BASE}/me/reviews/new?show=${S1}`);
  const picker = page.locator("fieldset.cast-picker");
  await picker.getByRole("button", { name: "[샘플] 주인공 · [샘플] 배우 가" }).click();
  check((await picker.getByRole("button", { name: "[샘플] 주인공 · [샘플] 배우 가" }).getAttribute("aria-pressed")) === "true", "공연 캐스팅에서 고르기");
  await picker.getByLabel("배역").fill("[샘플] 특별출연");
  await picker.getByLabel("배우").fill("없는 배우");
  await picker.getByRole("button", { name: "추가" }).click();
  check(await visible(picker.getByRole("alert").filter({ hasText: "목록에 있는 배우만" })), "등록 안 된 배우 거부");
  await picker.getByLabel("배우").fill("[샘플] 배우 다");
  await picker.getByRole("button", { name: "추가" }).click();
  check(await visible(picker.locator(".cast-picked", { hasText: "[샘플] 특별출연 · [샘플] 배우 다" })), "자동완성 배우 + 배역 추가");
  await layout(page, "후기 쓰기(그날 캐스트)");
  await shot(page, "360-review-casts");
  const thisYear = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
  await page.locator('input[name="watched_at"]').fill(`${thisYear}-01-15`);
  await page.getByRole("radio", { name: "별점 5점" }).check({ force: true });
  await page.locator('input[name="price"]').fill("100000");
  await page.getByRole("button", { name: "저장" }).click();
  await page.waitForURL((u) => u.pathname === "/me");
  check((await sql(`select count(*) from public.review_casts rc join public.reviews r on r.id = rc.review_id join auth.users u on u.id = r.user_id where u.email = 'stats@example.com'`)) === "2", "그날 캐스트 2명 저장");

  // 후기 2, 3
  for (const [show, date, rating, price, actor] of [[S1, `${thisYear}-01-20`, 3, "", "[샘플] 주인공 · [샘플] 배우 가"], [S2, `${thisYear}-03-05`, 4, "50000", null]]) {
    await page.goto(`${BASE}/me/reviews/new?show=${show}`);
    if (actor) await page.locator("fieldset.cast-picker").getByRole("button", { name: actor }).click();
    await page.locator('input[name="watched_at"]').fill(date);
    await page.getByRole("radio", { name: `별점 ${rating}점` }).check({ force: true });
    if (price) await page.locator('input[name="price"]').fill(price);
    await page.getByRole("button", { name: "저장" }).click();
    await page.waitForURL((u) => u.pathname === "/me");
  }
  // 작년 기록(올해 통계에서 빠져야 함)
  await page.goto(`${BASE}/me/reviews/new?show=${S2}`);
  await page.locator('input[name="watched_at"]').fill(`${thisYear - 1}-12-31`);
  await page.getByRole("radio", { name: "별점 1점" }).check({ force: true });
  await page.getByRole("button", { name: "저장" }).click();
  await page.waitForURL((u) => u.pathname === "/me");

  await page.goto(`${BASE}/me?tab=stats`);
  check((await page.getByTestId("stat-count").innerText()) === "3회", "올해 관극 횟수 3회");
  check((await page.getByTestId("stat-spent").innerText()) === "150,000원", "총 지출");
  check(await visible(page.getByText("관람료를 적은 2회만 지출에 들어갔어요")), "관람료 일부만 적었을 때 안내");
  check((await page.getByTestId("stat-rating").innerText()) === "4.0", "평균 별점");
  check((await page.locator(".month-chart li").first().getAttribute("aria-label")) === "1월 2회", "월별 차트 1월 2회");
  check((await page.locator(".month-chart li").nth(2).getAttribute("aria-label")) === "3월 1회", "월별 차트 3월 1회");
  const shows = await page.getByTestId("top-shows").locator("li").allInnerTexts();
  check(shows[0].includes("[샘플] 뮤지컬 첫공") && shows[0].includes("2회") && shows.length === 2, `공연 TOP3 (${shows.join(" / ")})`);
  const actors = await page.getByTestId("top-actors").locator("li").allInnerTexts();
  check(actors[0].includes("[샘플] 배우 가") && actors[0].includes("2회") && actors.length === 2, `배우 TOP3는 구조화 캐스트로 (${actors.join(" / ")})`);
  await layout(page, "통계");
  await shot(page, "360-stats");

  await page.getByRole("link", { name: `${thisYear - 1}년` }).click();
  await page.waitForURL(/year=/);
  check((await page.getByTestId("stat-count").innerText()) === "1회", "연도 바꾸기");
  check(await visible(page.getByText("배우 TOP3가 보여요")), "캐스트 입력 없는 해: 배우 TOP3 안내");

  // 수정 화면: 기존 캐스트 유지 → 하나 빼고 저장
  const rid = await sql(`select r.id from public.reviews r join auth.users u on u.id = r.user_id where u.email = 'stats@example.com' and r.watched_at = '${thisYear}-01-15'`);
  await page.goto(`${BASE}/me/reviews/${rid}/edit`);
  const editPicker = page.locator("fieldset.cast-picker");
  check((await editPicker.getByRole("button", { name: "[샘플] 주인공 · [샘플] 배우 가" }).getAttribute("aria-pressed")) === "true", "수정 화면에 기존 캐스트");
  await editPicker.getByRole("button", { name: "[샘플] 배우 다 빼기" }).click();
  await page.getByRole("button", { name: "수정 저장" }).click();
  await page.waitForURL((u) => u.pathname === "/me");
  check((await sql(`select count(*) from public.review_casts where review_id = '${rid}'`)) === "1", "캐스트 수정 저장");

  // 조작된 캐스트 값 거부
  await page.goto(`${BASE}/me/reviews/${rid}/edit`);
  // React가 관리하는 숨은 칸 대신, 같은 이름의 칸을 새로 넣어 조작된 값을 보낸다
  await page.locator('input[name="casts"]').evaluate((el) => {
    const fake = document.createElement("input");
    fake.type = "hidden"; fake.name = "casts"; fake.value = '[{"actor_id":"x","role_name":"a"}]';
    el.form.prepend(fake);
    el.removeAttribute("name");
  });
  await page.getByRole("button", { name: "수정 저장" }).click();
  check(await visible(page.getByRole("alert").filter({ hasText: "그날 캐스트를 다시 골라" })), "조작된 캐스트 값 거부");

  await sql(`delete from public.reviews where user_id = (select id from auth.users where email = 'stats@example.com')`);
  check(page.errors.length === 0, `콘솔 에러 없음 ${page.errors.join(" | ")}`);
  await page.close();
}
