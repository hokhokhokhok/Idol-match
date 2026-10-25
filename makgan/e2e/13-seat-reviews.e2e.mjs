// 좌석 후기: 작성(층→구역→점수), 구역 평균·참고용 안내, 열·시야 방해 필터, 도움돼요(내 후기 불가), 자유 입력 구역, 관극 후기 연동
const T1 = "00000000-0000-4000-8000-000000000101"; // 구역 있음
const T2 = "00000000-0000-4000-8000-000000000102"; // 구역 없음
const S1 = "00000000-0000-4000-8000-000000000201"; // T1 공연
const S2 = "00000000-0000-4000-8000-000000000202"; // T2 공연

async function writeSeat(page, BASE, { theater, floor, zone, zoneText, row, scores, obstructed, comment }) {
  await page.goto(`${BASE}/theaters/${theater}/seat-reviews/new`);
  await page.locator('select[name="floor"]').selectOption(floor);
  if (zone) await page.locator('select[name="zone_id"]').selectOption({ label: zone });
  if (zoneText) await page.locator('input[name="zone_text"]').fill(zoneText);
  if (row) await page.locator('input[name="seat_row"]').fill(row);
  for (const [label, n] of Object.entries(scores)) await page.getByRole("radio", { name: `${label} ${n}점` }).check({ force: true });
  if (obstructed) {
    await page.getByLabel(/시야 방해가 있었어요/).check();
    await page.locator('input[name="obstruction_note"]').fill(obstructed);
  }
  if (comment) await page.locator('textarea[name="comment"]').fill(comment);
  await page.getByRole("button", { name: "좌석 후기 올리기" }).click();
}

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, count, settled }) {
  const a = await newPage();
  await login(a, "seat-a@example.com", "좌석러A");

  // 구역 상세가 비었을 때
  const zoneId = await sql(`select id from public.seat_zones where name = '[샘플] 가운데'`);
  await a.goto(`${BASE}/theaters/${T1}`);
  await a.locator(".zone-card", { hasText: "[샘플] 가운데" }).click();
  await a.waitForURL(`${BASE}/theaters/${T1}/zones/${zoneId}`);
  check(await visible(a.getByText("이 구역의 첫 좌석 후기를 남겨볼까요?")), "후기 없는 구역 빈 화면");

  // 작성: 검증 실패(점수 누락) → 입력 유지
  await a.goto(`${BASE}/theaters/${T1}/seat-reviews/new`);
  await a.locator('select[name="floor"]').selectOption("2층");
  check((await a.locator('select[name="zone_id"] option').allInnerTexts()).includes("[샘플] 앞쪽"), "층을 바꾸면 그 층 구역만");
  await a.locator('select[name="floor"]').selectOption("1층");
  await a.locator('select[name="zone_id"]').selectOption({ label: "[샘플] 가운데" });
  await a.locator('input[name="seat_row"]').fill("3");
  await a.locator('textarea[name="comment"]').fill("앞열 좋아요");
  await a.locator("form").evaluate((f) => f.querySelectorAll('input[type="radio"]').forEach((i) => i.removeAttribute("required")));
  await a.getByRole("button", { name: "좌석 후기 올리기" }).click();
  check(await visible(a.getByRole("alert").filter({ hasText: "모두 골라" })), "점수 누락 거부");
  check((await a.locator('textarea[name="comment"]').inputValue()) === "앞열 좋아요", "실패해도 입력 유지");
  await layout(a, "좌석 후기 쓰기");
  await shot(a, "360-seat-new");

  await writeSeat(a, BASE, { theater: T1, floor: "1층", zone: "[샘플] 가운데", row: "3", scores: { 시야: 5, 거리: 4, 음향: 4 }, comment: "앞열 좋아요" });
  await a.waitForURL(new RegExp(`/zones/${zoneId}`));
  check(await visible(a.locator(".toast", { hasText: "저장했어요" })), "저장 후 구역 상세로 + 토스트");
  check(await visible(a.getByText("후기가 적어 참고용이에요")), "후기 3개 미만: 참고용 안내");

  await writeSeat(a, BASE, { theater: T1, floor: "1층", zone: "[샘플] 가운데", row: "15", scores: { 시야: 2, 거리: 2, 음향: 3 }, obstructed: "[샘플] 기둥" });
  await a.waitForURL(new RegExp(`/zones/${zoneId}`));

  const b = await newPage();
  await login(b, "seat-b@example.com", "좌석러B");
  await writeSeat(b, BASE, { theater: T1, floor: "1층", zone: "[샘플] 가운데", row: "E", scores: { 시야: 5, 거리: 3, 음향: 5 } });
  await b.waitForURL(new RegExp(`/zones/${zoneId}`));
  check((await count(b.locator(".seat-review"), 3)) === 3, "구역 후기 3개");
  check(await b.getByText("후기가 적어 참고용이에요").count() === 0, "3개 이상이면 참고용 안내 없음");
  const bars = await b.locator(".score-num").allInnerTexts();
  check(JSON.stringify(bars) === JSON.stringify(["4.0", "3.0", "4.0"]), `시야·거리·음향 평균 막대 (${bars.join(", ")})`);
  await layout(b, "구역 상세");
  await shot(b, "360-zone");

  // 필터
  await b.getByRole("link", { name: "앞열" }).click();
  await b.waitForURL(/row=front/);
  check((await count(b.locator(".seat-review"), 2)) === 2, "앞열 필터(3열, E열)");
  await b.getByRole("link", { name: "방해 있음" }).click();
  await b.waitForURL(/obstructed=yes/);
  check((await count(b.locator(".seat-review"), 0)) === 0 && (await visible(b.getByText("조건에 맞는 후기가 없어요"))), "앞열+방해 있음: 없음");
  await b.getByRole("link", { name: "전체 열" }).click();
  await b.waitForURL((u) => !u.search.includes("row="));
  check((await count(b.locator(".seat-review"), 1)) === 1 && (await visible(b.getByText("[샘플] 기둥"))), "시야 방해 필터 + 메모");

  // 도움돼요: B가 A 후기에 → 수 증가, 내 후기엔 버튼 없음
  await b.goto(`${BASE}/theaters/${T1}/zones/${zoneId}`);
  const aReview = b.locator(".seat-review", { hasText: "앞열 좋아요" });
  await aReview.getByRole("button", { name: "도움돼요" }).click();
  await settled(b);
  await b.reload();
  check((await aReview.getByRole("button", { name: "도움돼요" }).innerText()).includes("1"), "도움돼요 1");
  check((await b.locator(".seat-review", { hasText: "E열" }).getByRole("button", { name: "도움돼요" }).count()) === 0, "내 후기에는 도움돼요 버튼 없음");
  check((await b.locator(".seat-review").first().innerText()).includes("앞열 좋아요"), "도움돼요 많은 후기가 위로");

  await b.goto(`${BASE}/theaters/${T1}`);
  const card = b.locator(".zone-card", { hasText: "[샘플] 가운데" });
  check((await card.innerText()).includes("4.0") && (await card.innerText()).includes("후기 3"), "극장 상세 구역 카드: 평균 시야·후기 수");

  // 구역 없는 극장: 자유 입력 구역
  await writeSeat(a, BASE, { theater: T2, floor: "1층", zoneText: "[샘플] 오른쪽 끝", row: "7", scores: { 시야: 3, 거리: 3, 음향: 3 } });
  await a.waitForURL(new RegExp(`/theaters/${T2}\\?floor=`));
  check(await visible(a.locator('section[aria-labelledby="unzoned-title"]').getByText("[샘플] 오른쪽 끝")), "구역 없는 극장: 자유 입력 구역 후기");

  // 관극 후기 연동
  await a.goto(`${BASE}/me/reviews/new?show=${S2}`);
  await a.getByRole("radio", { name: "별점 4점" }).check({ force: true });
  check(await a.getByLabel(/이 좌석 후기도 극장 정보에 올릴까요/).count() === 0, "좌석을 안 적으면 연동 체크박스 없음");
  await a.locator('input[name="seat_text"]').fill("1층 7열");
  await a.getByLabel(/이 좌석 후기도 극장 정보에 올릴까요/).check();
  await a.getByRole("button", { name: "저장" }).click();
  await a.waitForURL(new RegExp(`/theaters/${T2}/seat-reviews/new\\?review=`));
  check(await visible(a.getByText("관극 후기에 적은 좌석")), "관극 후기 저장 → 좌석 후기 쓰기로 이어짐");
  check((await a.locator('select[name="show_id"]').inputValue()) === S2, "관람 공연 미리 선택");
  await a.locator('input[name="zone_text"]').fill("[샘플] 연동");
  for (const label of ["시야", "거리", "음향"]) await a.getByRole("radio", { name: `${label} 4점` }).check({ force: true });
  await a.getByRole("button", { name: "좌석 후기 올리기" }).click();
  await a.waitForURL(new RegExp(`/theaters/${T2}\\?floor=`));
  check((await sql(`select count(*) from public.seat_reviews s join public.reviews r on r.id = s.review_id where s.zone_text = '[샘플] 연동' and r.seat_text = '1층 7열'`)) === "1", "좌석 후기가 관극 후기와 연결되어 저장");

  // 삭제(본인)
  await a.goto(`${BASE}/theaters/${T1}/zones/${zoneId}`);
  a.once("dialog", (d) => d.accept());
  await a.locator(".seat-review", { hasText: "[샘플] 기둥" }).getByRole("button", { name: "삭제" }).click();
  check((await count(a.locator(".seat-review"), 2)) === 2, "내 좌석 후기 삭제");

  await sql(`delete from public.seat_reviews where theater_id in ('${T1}', '${T2}'); delete from public.reviews where show_id = '${S2}'`);
  const errors = [...a.errors, ...b.errors];
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await a.close();
  await b.close();
}
