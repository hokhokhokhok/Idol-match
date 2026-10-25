// 관극 후기 CRUD: 작성(검증·입력 유지)·공개/비공개·수정·삭제, 타인 후기 보호(D 체크리스트)
const S2 = "00000000-0000-4000-8000-000000000202"; // [샘플] 연극 막공

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, count }) {
  const a = await newPage();
  await login(a, "reviewer-a@example.com", "후기왕");

  await a.goto(`${BASE}/shows/${S2}`);
  const reviewsSection = a.locator('section[aria-labelledby="reviews-title"]');
  check(await visible(reviewsSection.getByText("첫 후기를 남겨볼까요?")), "후기 없을 때: 첫 후기를 남겨볼까요?");
  await reviewsSection.getByRole("link", { name: "후기 쓰기" }).click();
  await a.waitForURL(`${BASE}/me/reviews/new?show=${S2}`);
  check((await a.locator('select[name="show_id"]').inputValue()) === S2, "공연 상세에서 오면 공연이 미리 선택됨");
  await layout(a, "후기 쓰기");
  await shot(a, "360-review-new");

  // 서버 검증: 미래 관람일(브라우저 max를 우회) → 안내 + 입력 유지
  await a.locator('input[name="watched_at"]').evaluate((el) => el.removeAttribute("max"));
  await a.locator('input[name="watched_at"]').fill("2099-01-01");
  await a.getByText("4점").click({ force: true });
  await a.locator('textarea[name="body"]').fill("공개 후기 본문");
  await a.getByRole("button", { name: "저장" }).click();
  check(await visible(a.getByRole("alert").filter({ hasText: "관람일은 오늘까지만" })), "미래 관람일 거부");
  check((await a.locator('textarea[name="body"]').inputValue()) === "공개 후기 본문", "검증 실패해도 입력 유지");

  const today = await a.locator('input[name="watched_at"]').evaluate((el) => el.getAttribute("max") ?? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  await a.locator('input[name="watched_at"]').fill(today.length === 10 ? today : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  await a.locator('input[name="cast_note"]').fill("[샘플] 배우 나");
  await a.locator('input[name="price"]').fill("66,000");
  await a.getByLabel("공연 페이지에 공개하기").check();
  await a.getByRole("button", { name: "저장" }).click();
  await a.waitForURL(/\/me\?toast=review-saved|\/me$/);
  check(await visible(a.locator(".toast", { hasText: "후기를 저장했어요" })), "저장 후 MY로 + 저장 토스트");
  await a.waitForURL(`${BASE}/me`);
  check(true, "토스트 키는 주소에서 지움");

  await a.goto(`${BASE}/me/reviews/new?show=${S2}`);
  await a.getByText("2점").click({ force: true });
  await a.locator('textarea[name="body"]').fill("나만 보는 후기");
  await a.getByRole("button", { name: "저장" }).click();
  await a.waitForURL(`${BASE}/me`);
  check((await count(a.locator(".review"), 2)) === 2, "MY 관극 기록 2개");
  check(await visible(a.locator(".review", { hasText: "나만 보는 후기" }).getByText("나만 보기")), "비공개 후기 표시");
  await layout(a, "MY 관극 기록");
  await shot(a, "360-me-records");

  await a.goto(`${BASE}/shows/${S2}`);
  check((await reviewsSection.locator(".review").count()) === 2, "작성자 본인은 공연 상세에서 비공개 후기도 보임");
  const rating = await a.getByTestId("rating").innerText();
  check(rating.includes("4.0") && rating.includes("후기 1개"), `평균 별점은 공개 후기만 (${rating})`);

  const privateId = await sql(`select id from public.reviews where body = '나만 보는 후기'`);
  const publicId = await sql(`select id from public.reviews where body = '공개 후기 본문'`);

  // 다른 사용자 B
  const b = await newPage();
  await login(b, "reviewer-b@example.com", "구경꾼");
  await b.goto(`${BASE}/shows/${S2}`);
  const bReviews = b.locator('section[aria-labelledby="reviews-title"] .review');
  check((await bReviews.count()) === 1 && (await bReviews.innerText()).includes("공개 후기 본문"), "타인의 비공개 후기는 안 보임");
  check(await visible(bReviews.getByText("후기왕")), "공개 후기에 작성자 닉네임");
  check((await bReviews.getByRole("link", { name: "수정" }).count()) === 0, "타인 후기에는 수정·삭제 버튼 없음");

  await b.goto(`${BASE}/me/reviews/${privateId}/edit`);
  check(await visible(b.getByText("수정할 수 있는 후기가 아니에요")), "타인 후기 수정 화면 접근 거부");

  // B가 자기 후기 수정 폼의 숨은 id를 A의 후기로 바꿔 제출 → 거부, A 후기 그대로
  await b.goto(`${BASE}/me/reviews/new?show=${S2}`);
  await b.getByText("3점").click({ force: true });
  await b.getByRole("button", { name: "저장" }).click();
  await b.waitForURL(`${BASE}/me`);
  await b.getByRole("link", { name: "수정" }).click();
  await b.waitForURL(/\/edit$/);
  await b.locator('input[name="id"]').evaluate((el, id) => (el.value = id), publicId);
  await b.locator('textarea[name="body"]').fill("B가 덮어씀");
  await b.getByRole("button", { name: "수정 저장" }).click();
  check(await visible(b.getByRole("alert").filter({ hasText: "수정할 수 없는 후기예요" })), "타인 후기 id로 수정 시도 → 거부");
  check((await sql(`select body from public.reviews where id = '${publicId}'`)) === "공개 후기 본문", "A의 후기는 바뀌지 않음");

  // A 수정·삭제
  await a.goto(`${BASE}/me`);
  await a.locator(".review", { hasText: "공개 후기 본문" }).getByRole("link", { name: "수정" }).click();
  await a.waitForURL(`${BASE}/me/reviews/${publicId}/edit`);
  check((await a.locator('input[name="price"]').inputValue()) === "66000", "수정 화면에 기존 값");
  await a.getByText("5점").click({ force: true });
  await a.getByRole("button", { name: "수정 저장" }).click();
  await a.waitForURL(`${BASE}/me`);
  check(await visible(a.locator(".review", { hasText: "공개 후기 본문" }).getByRole("img", { name: "별점 5점" })), "별점 수정 반영");

  a.once("dialog", (d) => d.accept());
  await a.locator(".review", { hasText: "나만 보는 후기" }).getByRole("button", { name: "삭제" }).click();
  await a.waitForFunction(() => document.querySelectorAll(".review").length === 1, null, { timeout: 5000 }).catch(() => {});
  check((await a.locator(".review").count()) === 1, "후기 삭제");
  check(await visible(a.locator(".toast", { hasText: "후기를 삭제했어요" })), "삭제 토스트");
  check((await sql(`select count(*) from public.reviews where id = '${privateId}'`)) === "0", "DB에서도 삭제됨");

  // 비로그인
  const anon = await newPage();
  await anon.goto(`${BASE}/shows/${S2}`);
  check((await anon.locator('section[aria-labelledby="reviews-title"] .review').count()) === 1, "비로그인: 공개 후기만(B의 비공개 후기 제외)");
  await anon.goto(`${BASE}/me/reviews/new`);
  await anon.waitForURL(/\/login\?next=/);
  check(true, "비로그인 후기 쓰기 → 로그인");

  const errors = [...a.errors, ...b.errors, ...anon.errors].filter((e) => !e.includes("404"));
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await sql(`delete from public.reviews where show_id = '${S2}'`);
  for (const p of [a, b, anon]) await p.close();
}
