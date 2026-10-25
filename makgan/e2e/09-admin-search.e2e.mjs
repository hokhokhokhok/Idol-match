// 관리자(접근 제한·서버 액션 재검증·혜택/공연/캐스팅 CRUD) + 전체 검색(최근 검색어)
export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql }) {
  // ── 관리자 아님 ──
  const user = await newPage();
  await login(user, "plain@example.com", "일반인");
  for (const path of ["/admin", "/admin/benefits", "/admin/benefits/new"]) {
    await user.goto(`${BASE}${path}`);
    await user.waitForURL(`${BASE}/`);
    check(true, `관리자 아님: ${path} → 홈으로`);
  }
  const anon = await newPage();
  await anon.goto(`${BASE}/admin`);
  await anon.waitForURL(`${BASE}/`);
  check(true, "비로그인: /admin → 홈으로");

  // ── 관리자 ──
  const admin = await newPage();
  await login(admin, "admin@example.com", "운영자");
  await sql(`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'admin@example.com')`);
  await admin.goto(`${BASE}/me`);
  await admin.getByRole("link", { name: "관리자" }).click();
  await admin.waitForURL(`${BASE}/admin`);
  await layout(admin, "관리자 홈");

  // 서버 액션 재검증: 관리자 화면에 열린 폼을 일반 사용자 쿠키로 제출 → 거부
  await admin.goto(`${BASE}/admin/benefits/new`);
  const adminCookies = await admin.context().cookies();
  await admin.context().clearCookies();
  await admin.context().addCookies(await user.context().cookies());
  await admin.locator('select[name="type"]').selectOption("event");
  await admin.locator('input[name="title"]').fill("[샘플] 해킹 혜택");
  await admin.getByRole("button", { name: "추가" }).click();
  check(await visible(admin.getByRole("alert").filter({ hasText: "관리자만 할 수 있어요" })), "관리자 아님: 서버 액션 거부");
  check((await sql(`select count(*) from public.benefits where title = '[샘플] 해킹 혜택'`)) === "0", "거부된 요청은 저장 안 됨");
  await admin.context().clearCookies();
  await admin.context().addCookies(adminCookies);

  // 혜택 추가(검증 실패 → 입력 유지 → 수정 후 저장)
  const tomorrow = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  await admin.goto(`${BASE}/admin/benefits/new`);
  await admin.locator('select[name="type"]').selectOption("lottery");
  await admin.locator('input[name="title"]').fill("[샘플] 관리자 로터리");
  await admin.locator('select[name="show_id"]').selectOption({ label: "[샘플] 뮤지컬 첫공" });
  await admin.locator('input[name="starts_at"]').fill(`${tomorrow}T20:00`);
  await admin.locator('input[name="ends_at"]').fill(`${tomorrow}T18:00`);
  await admin.getByRole("button", { name: "추가" }).click();
  check(await visible(admin.getByRole("alert").filter({ hasText: "마감이 시작보다 빨라요" })), "혜택 검증: 마감 < 시작 거부");
  check((await admin.locator('input[name="title"]').inputValue()) === "[샘플] 관리자 로터리", "검증 실패해도 입력 유지");
  await admin.locator('input[name="starts_at"]').fill("");
  await admin.getByRole("button", { name: "추가" }).click();
  await admin.waitForURL(`${BASE}/admin/benefits?saved=1`);
  check(await visible(admin.getByText("[샘플] 관리자 로터리")), "혜택 추가 → 목록");
  check((await sql(`select to_char(ends_at at time zone 'Asia/Seoul', 'HH24:MI') from public.benefits where title = '[샘플] 관리자 로터리'`)) === "18:00", "입력 시각은 한국 시간으로 저장");
  await shot(admin, "360-admin-benefits");

  await anon.goto(`${BASE}/benefits?type=lottery`);
  check(await visible(anon.locator(".benefit-card", { hasText: "[샘플] 관리자 로터리" }).getByText("내일 마감")), "사용자 혜택 목록에 바로 반영(내일 마감)");

  await admin.getByText("[샘플] 관리자 로터리").click();
  await admin.waitForURL(/\/admin\/benefits\/[0-9a-f-]{36}$/);
  check((await admin.locator('input[name="ends_at"]').inputValue()) === `${tomorrow}T18:00`, "수정 화면: 시각을 한국 시간으로 표시");
  await admin.locator('input[name="title"]').fill("[샘플] 관리자 로터리(수정)");
  await admin.getByRole("button", { name: "저장" }).click();
  await admin.waitForURL(`${BASE}/admin/benefits?saved=1`);
  check(await visible(admin.getByText("[샘플] 관리자 로터리(수정)")), "혜택 수정");

  admin.once("dialog", (d) => d.accept());
  await admin.locator(".admin-row", { hasText: "[샘플] 관리자 로터리(수정)" }).getByRole("button", { name: "삭제" }).click();
  await admin.locator(".admin-row", { hasText: "[샘플] 관리자 로터리(수정)" }).waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  check((await sql(`select count(*) from public.benefits where title like '[샘플] 관리자 로터리%'`)) === "0", "혜택 삭제");

  // 공연 추가 + 캐스팅
  await admin.goto(`${BASE}/admin/shows/new`);
  await admin.locator('input[name="title"]').fill("[샘플] 관리자 공연");
  await admin.locator('select[name="theater_id"]').selectOption({ label: "[샘플] 커튼콜극장" });
  await admin.locator('input[name="starts_on"]').fill("2026-01-01");
  await admin.locator('input[name="ends_on"]').fill("2030-12-31");
  await admin.getByRole("button", { name: "추가" }).click();
  await admin.waitForURL(`${BASE}/admin/shows?saved=1`);
  await admin.getByText("[샘플] 관리자 공연").click();
  await admin.waitForURL(/\/admin\/shows\/[0-9a-f-]{36}$/);
  const showId = admin.url().split("/").pop();
  await admin.locator('select[name="actor_id"]').selectOption({ label: "[샘플] 배우 다" });
  await admin.locator('input[name="role_name"]').fill("[샘플] 역할");
  await admin.getByRole("button", { name: "캐스팅 추가" }).click();
  await admin.locator(".admin-row", { hasText: "[샘플] 배우 다 · [샘플] 역할" }).waitFor({ timeout: 5000 });
  check(true, "캐스팅 추가");
  await admin.locator('select[name="actor_id"]').selectOption({ label: "[샘플] 배우 다" });
  await admin.locator('input[name="role_name"]').fill("[샘플] 역할");
  await admin.getByRole("button", { name: "캐스팅 추가" }).click();
  check(await visible(admin.getByRole("alert").filter({ hasText: "이미 등록된 캐스팅이에요" })), "같은 캐스팅 중복 거부");
  await layout(admin, "관리자 공연 수정");

  await anon.goto(`${BASE}/shows/${showId}?date=2027-01-01`);
  check(await visible(anon.locator(".actor-chip", { hasText: "[샘플] 배우 다" })), "공연 상세에 캐스팅 반영");

  admin.once("dialog", (d) => d.accept());
  await admin.locator(".admin-row", { hasText: "[샘플] 역할" }).getByRole("button", { name: "삭제" }).click();
  await admin.getByText("등록된 캐스팅이 없어요").waitFor({ timeout: 5000 }).catch(() => {});
  check((await sql(`select count(*) from public.casts where show_id = '${showId}'`)) === "0", "캐스팅 삭제");
  await sql(`delete from public.shows where id = '${showId}'`);

  // ── 검색 ──
  const s = await newPage();
  await s.goto(`${BASE}/search`);
  const box = s.getByRole("searchbox", { name: "검색어" });
  await box.fill("막공");
  await s.getByRole("button", { name: "검색" }).click();
  await s.waitForURL(/q=%EB%A7%89%EA%B3%B5/);
  check((await s.locator('section[aria-labelledby="sr-shows"] li').allInnerTexts()).some((t) => t.includes("[샘플] 연극 막공")), "공연 검색");
  await layout(s, "검색 결과");
  await shot(s, "360-search");

  await s.goto(`${BASE}/search?q=${encodeURIComponent("배우")}`);
  check((await s.locator('section[aria-labelledby="sr-actors"] li').count()) === 3, "배우 섹션 최대 3개");
  await s.goto(`${BASE}/search?q=${encodeURIComponent("아트홀")}`);
  check(await visible(s.locator('section[aria-labelledby="sr-theaters"]').getByText("[샘플] 막간아트홀")), "극장 검색");
  await s.goto(`${BASE}/search?q=${encodeURIComponent("없는단어zz")}`);
  check(await visible(s.getByText("찾는 공연이 없어요. 다른 단어로 검색해 보세요")), "검색 결과 없음 문구");
  await s.goto(`${BASE}/search?q=${encodeURIComponent("%")}`);
  check(await visible(s.getByText("찾는 공연이 없어요")), "% 는 글자 그대로 검색(전체가 나오지 않음)");

  for (const t of ["가", "나", "다", "샘플"]) await s.goto(`${BASE}/search?q=${encodeURIComponent(t)}`);
  await s.goto(`${BASE}/search`);
  const recent = await s.locator(".recent-list .chip").allInnerTexts();
  check(recent.length === 5 && recent[0] === "샘플", `최근 검색어 5개, 최신순 (${recent.join(", ")})`);
  await s.getByRole("button", { name: "샘플 지우기" }).click();
  check((await s.locator(".recent-list .chip").count()) === 4, "최근 검색어 지우기");
  await s.locator(".recent-list .chip", { hasText: "다" }).click();
  await s.waitForURL(/q=/);
  check(true, "최근 검색어 누르면 다시 검색");

  const errors = [...user.errors, ...anon.errors, ...admin.errors, ...s.errors];
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  for (const p of [user, anon, admin, s]) await p.close();
}
