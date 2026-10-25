// 공연 목록(상태·정렬·극장·배우 필터, 더 보기)·상세(날짜별/시즌 캐스팅, 평균 별점, 기본 이미지)
const S1 = "00000000-0000-4000-8000-000000000201"; // 공연 중, 오늘 날짜 캐스팅 있음
const ACTOR_NA = "00000000-0000-4000-8000-000000000302";
const THEATER2 = "00000000-0000-4000-8000-000000000102";

export default async function ({ BASE, check, newPage, layout, shot, visible, sql }) {
  const page = await newPage();
  const titles = () => page.locator(".show-card-title").allInnerTexts();

  await page.goto(`${BASE}/shows`);
  let t = await titles();
  check(t.length === 3 && !t.includes("[샘플] 연극 지난 시즌"), `기본: 공연 중+예정 3개, 지난 공연 제외 (${t.join(", ")})`);
  check(t[0] === "[샘플] 연극 막공", "기본 정렬: 마감 임박순");
  check(await page.locator(".poster-fallback").count() === 3, "포스터 없는 공연은 기본 이미지");
  await layout(page, "공연 목록");
  await shot(page, "360-shows");

  await page.getByRole("link", { name: "지난 공연" }).click();
  await page.waitForURL(`${BASE}/shows?status=ended`);
  t = await titles();
  check(t.length === 1 && t[0] === "[샘플] 연극 지난 시즌", "지난 공연 필터");
  await page.getByRole("link", { name: "공연 예정" }).click();
  await page.waitForURL(`${BASE}/shows?status=upcoming`);
  t = await titles();
  check(t.length === 1 && t[0] === "[샘플] 뮤지컬 회전문", "공연 예정 필터");
  await page.getByRole("link", { name: "공연 중", exact: true }).click();
  await page.waitForURL(/status=running/);
  check((await titles()).length === 2, "공연 중 필터");

  await page.goto(`${BASE}/shows`);
  await page.getByRole("button", { name: /^필터/ }).click();
  await page.getByRole("dialog").getByLabel("정렬").selectOption("title");
  await page.getByRole("button", { name: "적용" }).click();
  await page.waitForURL(/sort=title/);
  t = await titles();
  check(JSON.stringify(t) === JSON.stringify([...t].sort((a, b) => a.localeCompare(b, "ko"))), "가나다순 정렬");
  await page.getByRole("button", { name: /^필터/ }).click();
  await page.getByRole("dialog").getByLabel("극장").selectOption(THEATER2);
  await page.getByRole("button", { name: "적용" }).click();
  await page.waitForURL(/theater=/);
  t = await titles();
  check(t.length === 1 && t[0] === "[샘플] 연극 막공" && page.url().includes("sort=title"), "극장 필터(정렬 유지)");
  check(await visible(page.getByText("조건이 적용된 목록이에요")), "조건 적용 안내");

  await page.goto(`${BASE}/shows?actor=${ACTOR_NA}`);
  t = await titles();
  check(t.length === 2 && t.includes("[샘플] 뮤지컬 첫공") && t.includes("[샘플] 연극 막공"), `배우 필터(출연작, 중복 없음) (${t.join(", ")})`);

  await page.goto(`${BASE}/shows?status=bogus&sort=x&theater=not-uuid&from=2026-99-99`);
  check((await titles()).length === 3, "잘못된 쿼리는 무시");

  // 더 보기: 25개 추가 → 20 + 나머지
  await sql(`insert into public.shows (title, starts_on, ends_on) select '[샘플] 페이지 ' || lpad(i::text, 2, '0'), current_date, current_date + 200 + i from generate_series(1, 25) i`);
  await page.goto(`${BASE}/shows`);
  check((await titles()).length === 20, "첫 페이지 20개");
  await page.getByRole("button", { name: "더 보기" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".show-card-title").length > 20, null, { timeout: 10000 }).catch(() => {});
  check(await page.getByRole("button", { name: "더 보기" }).count() === 0, "마지막 페이지면 더 보기 버튼 사라짐");
  t = await titles();
  check(t.length === 28 && new Set(t).size === 28, `더 보기 후 28개, 중복 없음 (${t.length})`);
  await sql(`delete from public.shows where title like '[샘플] 페이지 %'`);

  await page.goto(`${BASE}/shows?theater=00000000-0000-4000-8000-000000000999`);
  check(await visible(page.getByText("조건에 맞는 공연이 없어요")), "결과 없음 안내");

  // 상세
  await page.goto(`${BASE}/shows`);
  await page.getByText("[샘플] 뮤지컬 첫공").click();
  await page.waitForURL(`${BASE}/shows/${S1}`);
  await page.locator(".show-title").waitFor();
  check((await page.locator("h1").innerText()) === "[샘플] 뮤지컬 첫공", "상세 제목");
  check(await visible(page.getByText("[샘플] 막간아트홀")), "상세 극장");
  check(await visible(page.getByText("실제 공연이 아닙니다.")), "상세 소개");
  check(/오늘|\d{2}\.\d{2}\(.\) 캐스팅/.test(await page.getByTestId("cast-title").innerText()), "오늘 날짜 캐스팅이 있으면 그날 캐스팅");
  check((await page.locator(".actor-chip").count()) === 1, "그날 캐스팅: 1명");
  check(await visible(page.getByTestId("rating").getByText("아직 후기가 없어요")), "후기 없을 때 안내");
  await layout(page, "공연 상세");
  await shot(page, "360-show-detail");

  const other = await page.locator("#cast-date").getAttribute("max");
  await page.locator("#cast-date").fill(other);
  await page.getByRole("button", { name: "보기" }).click();
  await page.waitForURL(/date=/);
  await page.getByTestId("cast-title").filter({ hasText: "시즌 캐스팅" }).waitFor({ timeout: 5000 }).catch(() => {});
  check((await page.getByTestId("cast-title").innerText()) === "시즌 캐스팅", "그날 캐스팅 없으면 시즌 캐스팅");
  check((await page.locator(".actor-chip").count()) === 3, "시즌 캐스팅 3명");
  check(await visible(page.getByText("캐스팅 정보가 없어 시즌 캐스팅을 보여드려요")), "시즌 캐스팅 대체 안내");
  check(await page.locator(".avatar-fallback").count() === 3, "사진 없는 배우는 기본 이미지");

  // 평균 별점: 공개 후기만
  await sql(`insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'rater@example.com')`);
  await sql(`insert into public.reviews (user_id, show_id, watched_at, rating, is_public) values
    ('cccccccc-0000-4000-8000-000000000003', '${S1}', current_date, 4, true),
    ('cccccccc-0000-4000-8000-000000000003', '${S1}', current_date, 5, true),
    ('cccccccc-0000-4000-8000-000000000003', '${S1}', current_date, 1, false)`);
  await page.goto(`${BASE}/shows/${S1}`);
  const rating = await page.getByTestId("rating").innerText();
  check(rating.includes("4.5") && rating.includes("후기 2개"), `평균 별점·후기 수는 공개 후기만 (${rating})`);
  await sql(`delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000003'`);

  await page.goto(`${BASE}/shows/00000000-0000-4000-8000-000000000999`);
  check(await visible(page.getByText("찾는 공연이 없어요")), "없는 공연 → 안내");
  await page.goto(`${BASE}/shows/not-a-uuid`);
  check(await visible(page.getByText("찾는 공연이 없어요")), "잘못된 id → 안내");

  check(page.errors.filter((e) => !e.includes("404")).length === 0, `콘솔 에러 없음 ${page.errors.join(" | ")}`);
  await page.close();
}
