// 홈: 오늘 마감 최대 3 + 곧 열리는 티켓 3 + 내 찜 공연(비로그인 안내 / 빈 화면 / 가로 스크롤)
export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, settled }) {
  const page = await newPage();
  const section = (id) => page.locator(`section[aria-labelledby="${id}"]`);

  await page.goto(`${BASE}/`);
  let today = await section("today-title").locator(".benefit-title").allInnerTexts();
  check(today.length === 1 && today[0] === "[샘플] 오늘 마감 로터리", `오늘 마감 (${today.join(", ")})`);
  const open = await section("open-title").locator(".benefit-title").allInnerTexts();
  check(open.length === 1 && open[0] === "[샘플] 1차 티켓오픈", "곧 열리는 티켓");
  check(await visible(section("wish-title").getByText("로그인하면 기록을 저장할 수 있어요")), "비로그인: 찜 자리에 로그인 안내");
  await layout(page, "홈(비로그인)");

  // 오늘 마감이 많아도 3개, 마감 임박순
  await sql(`insert into public.benefits (type, title, ends_at)
    select 'event', '[샘플] 오늘 마감 추가 ' || i, least(now() + (i || ' minutes')::interval,
      date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' + interval '23 hours 59 minutes')
    from generate_series(1, 4) i`);
  await page.reload();
  today = await section("today-title").locator(".benefit-title").allInnerTexts();
  check(today.length === 3 && today[0] === "[샘플] 오늘 마감 추가 1", `오늘 마감은 3개까지, 임박순 (${today.join(", ")})`);
  await sql(`delete from public.benefits where title like '[샘플] 오늘 마감 추가%'`);

  // 오늘 마감 없음
  await sql(`update public.benefits set ends_at = ends_at + interval '2 days' where title = '[샘플] 오늘 마감 로터리'`);
  await page.reload();
  check(await visible(section("today-title").getByText("오늘 마감되는 혜택은 없어요")), "오늘 마감 없을 때 안내");
  check(await visible(section("today-title").getByRole("link", { name: "전체 혜택 보기" })), "빈 화면 버튼: 전체 혜택 보기");
  await sql(`update public.benefits set ends_at = ends_at - interval '2 days' where title = '[샘플] 오늘 마감 로터리'`);

  await login(page, "home@example.com", "홈사용자");
  await page.goto(`${BASE}/`);
  check(await visible(section("wish-title").getByText("아직 찜한 공연이 없어요")), "로그인, 찜 없음: 빈 화면");
  await page.goto(`${BASE}/shows`);
  for (const t of ["[샘플] 뮤지컬 첫공", "[샘플] 연극 막공"]) {
    await page.getByRole("button", { name: `${t} 찜` }).click();
    await settled(page);
  }
  await page.goto(`${BASE}/`);
  const wished = await section("wish-title").locator(".vcard-title").allInnerTexts();
  check(wished.length === 2, `내 찜 공연 가로 스크롤 2개 (${wished.join(", ")})`);
  await layout(page, "홈(로그인)");
  await shot(page, "360-home");

  check(page.errors.length === 0, `콘솔 에러 없음 ${page.errors.join(" | ")}`);
  await page.close();
}
