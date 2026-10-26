// 관람 회차 기록(시간·그날 캐스트) + 배우 인기 등급(색만, 점수 비공개) + 필모그래피(연도별)
const S1 = "00000000-0000-4000-8000-000000000201"; // [샘플] 뮤지컬 첫공
const NA = "00000000-0000-4000-8000-000000000302"; // 배우 나(출연 2편 → 최상위)
const ND = "00000000-0000-4000-8000-000000000303";

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, count }) {
  const a = await newPage();
  await login(a, "recorder@example.com", "기록왕");

  // 특정 날짜 회차에만 나오는 출연진
  await sql(`insert into public.casts (show_id, actor_id, role_name, perf_date) values ('${S1}', '${ND}', '[샘플] 특별출연', '2026-01-02')`);
  await a.goto(`${BASE}/me/reviews/new?show=${S1}`);
  check(await visible(a.locator('input[name="watch_time"]')), "회차 시간 입력칸");
  await layout(a, "후기 쓰기(회차)");
  await a.locator('input[name="watched_at"]').fill("2026-01-02");
  check(await visible(a.getByRole("button", { name: /특별출연/ })), "관람일에 맞는 그날 캐스팅이 추천에 나옴");
  const today = await a.locator('input[name="watched_at"]').getAttribute("max");
  await a.locator('input[name="watched_at"]').fill(today);
  await a.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => b.textContent?.includes("특별출연")), null, { timeout: 5000 }).catch(() => {});
  check((await a.getByRole("button", { name: /특별출연/ }).count()) === 0, "다른 날짜 캐스팅은 숨김");

  await a.locator('input[name="watch_time"]').fill("19:30");
  await a.getByText("5점").click({ force: true });
  await a.locator('textarea[name="body"]').fill("회차 기록 테스트");
  await a.getByRole("button", { name: /주인공 · \[샘플\] 배우 가/ }).click();
  await a.getByRole("button", { name: "저장" }).click();
  await a.waitForURL(`${BASE}/me`);
  check(await visible(a.locator(".review", { hasText: "19:30 관람" })), "MY 기록에 회차 시간 표시");
  check((await sql(`select watch_time from public.reviews where body = '회차 기록 테스트'`)) === "19:30", "DB에 회차 시간 저장");
  check((await sql(`select count(*) from public.review_casts rc join public.reviews r on r.id = rc.review_id where r.body = '회차 기록 테스트'`)) === "1", "그날 캐스트 저장");

  // 서버 검증: 잘못된 시간(브라우저 입력을 우회)
  await a.getByRole("link", { name: "수정" }).first().click();
  await a.waitForURL(/\/edit$/);
  await a.getByRole("button", { name: "수정 저장" }).waitFor();
  check((await a.locator('input[name="watch_time"]').inputValue()) === "19:30", "수정 화면에 저장된 회차 시간이 채워짐");
  await a.locator('input[name="watch_time"]').evaluate((el) => { el.type = "text"; el.value = "25:99"; });
  check((await a.locator('input[name="watch_time"]').inputValue()) === "25:99", "잘못된 시간 입력 준비");
  await a.getByRole("button", { name: "수정 저장" }).click();
  const bad = await visible(a.getByRole("alert").filter({ hasText: "회차 시간" }));
  check(bad, `잘못된 회차 시간 거부 (${bad ? "" : (await a.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300)} / ${a.url()})`);
  await sql(`delete from public.reviews where body = '회차 기록 테스트'`);
  await sql(`delete from public.casts where role_name = '[샘플] 특별출연'`);

  // 인기 탭: 등급은 색으로만
  await a.goto(`${BASE}/actors?tab=popular`);
  check(await visible(a.locator(".actor-chip-name", { hasText: "[샘플] 배우 나" })), "인기 탭 S등급에 출연작 많은 배우");
  check((await a.locator(".tier-S").count()) >= 1, "S 등급은 무지개 링");
  const text = await a.locator("main").innerText();
  check(!/점수|\d+점|순위|1위/.test(text), "점수·순위는 화면에 없음");
  await layout(a, "인기 탭");
  await shot(a, "360-actors-popular");
  await a.getByRole("link", { name: /^C ·/ }).click();
  check(await visible(a.locator(".actor-chip-name", { hasText: "[샘플] 배우 가" })), "C 등급 탭");
  check((await a.locator(".tier-C").count()) >= 1, "C 등급은 브론즈 링");

  // 배우 상세에도 등급 링, 지난 공연은 연도별 필모그래피
  await a.goto(`${BASE}/actors/${NA}`);
  check(await visible(a.locator('.actor-hero .tier-ring[data-tier="S"]')), "배우 상세에 등급 링");
  await sql(`insert into public.shows (title, starts_on, ends_on) values ('[샘플] 옛 공연', '2024-03-01', '2024-04-01')`);
  const old = await sql(`select id from public.shows where title = '[샘플] 옛 공연'`);
  await sql(`insert into public.casts (show_id, actor_id, role_name) values ('${old}', '${NA}', '출연')`);
  await a.goto(`${BASE}/actors/${NA}`);
  check(await visible(a.getByRole("heading", { name: /필모그래피/ })), "필모그래피 섹션");
  check(await visible(a.locator(".film-year-title", { hasText: "2024년" })), "연도별로 묶음");
  await sql(`delete from public.shows where id = '${old}'`);
}
