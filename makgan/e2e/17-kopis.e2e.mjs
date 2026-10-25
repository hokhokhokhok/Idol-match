// KOPIS 가져오기(가짜 KOPIS 서버): 크론 보호·페이지 넘김·중복 없음·오래된 상세 갱신·관리자 데이터 보존·화면 반영·관리자 버튼
const SHOW = (title) => `select id from public.shows where title = '${title}'`;

export default async function ({ BASE, SUPA, check, newPage, login, visible, layout, shot, sql, runCron, count, settled }) {
  check((await runCron(null, "import-shows")).status === 401, "가져오기 크론: 비밀값 없으면 401");
  check((await runCron("wrong", "import-shows")).status === 401, "가져오기 크론: 틀린 비밀값 401");

  const r1 = await runCron(undefined, "import-shows");
  check(r1.status === 200 && r1.body.listed === 107 && r1.body.created === 107 && r1.body.detailed === 107 && r1.body.errors.length === 0, `첫 가져오기: 107편 (${JSON.stringify(r1.body)})`);
  check(r1.body.theaters === 2 && r1.body.actors === 4 && r1.body.castsAdded === 6, "극장 2·배우 4·출연 6");
  const log = await (await fetch(`${SUPA}/__mock/kopis-log`)).json();
  check(log.some((l) => l.path === "pblprfr" && l.shcate === "AAAA" && l.prfstate === "01" && l.cpage === "2"), "목록 2쪽까지 넘겨 가져옴(100개 초과)");
  check(JSON.stringify(log).includes("e2e-kopis-key") === false, "요청 기록에 키는 남지 않음");

  check((await sql(`select count(*) from public.shows where external_id like 'kopis:%'`)) === "107", "공연 107개 저장");
  check((await sql(`select count(*) from public.shows where poster_url like 'https://kopis.or.kr/%'`)) === "107", "포스터는 https 주소");
  check((await sql(`select synopsis from public.shows where external_id = 'kopis:PF900001'`)) === "[테스트] 뮤지컬 알파의 줄거리입니다.", "소개: [공연소개] 머리말 제거");
  check((await sql(`select ticket_name || ' ' || ticket_url from public.shows where external_id = 'kopis:PF900001'`)) === "테스트예매처 https://tickets.example/booking?a=1&b=2", "예매 링크");
  check((await sql(`select seat_count || ' ' || (map_url like 'https://map.kakao.com/link/map/%')::text || ' ' || address from public.theaters where external_id = 'kopis:FC9001'`)) === "1000 true 서울특별시 테스트구 아트로 1", "극장: 좌석 수·지도 링크·주소(좌석 배치는 만들지 않음)");
  check((await sql(`select count(*) from public.seat_zones z join public.theaters t on t.id = z.theater_id where t.external_id like 'kopis:%'`)) === "0", "가져온 극장에 구역을 임의로 만들지 않음");
  check((await sql(`select string_agg(a.name, ',' order by a.name) from public.casts c join public.actors a on a.id = c.actor_id join public.shows s on s.id = c.show_id where s.external_id = 'kopis:PF900001'`)) === "배우가,배우나", "출연진: 괄호(배역 표기)·'등' 제거");
  check((await sql(`select string_agg(distinct c.role_name, ',') from public.casts c join public.shows s on s.id = c.show_id where s.external_id like 'kopis:%'`)) === "출연", "배역 이름은 지어내지 않고 '출연'");

  // 다시 실행: 중복 없음, 상세는 다시 받지 않음
  const r2 = await runCron(undefined, "import-shows");
  check(r2.body.created === 0 && r2.body.detailed === 0 && r2.body.castsAdded === 0 && r2.body.errors.length === 0, `두 번째 실행은 변화 없음 (${JSON.stringify(r2.body)})`);
  const dup = [
    await sql(`select count(*) from public.shows where external_id like 'kopis:%'`),
    await sql(`select count(*) from public.casts c join public.shows s on s.id = c.show_id where s.external_id like 'kopis:%'`),
    await sql(`select count(*) from public.actors where name in ('배우가','배우나','배우다','배우라')`),
  ];
  check(JSON.stringify(dup) === '["107","6","4"]', `공연·출연·배우 중복 없음 (${dup})`);

  // 관리자가 넣은 데이터는 그대로
  await sql(`insert into public.shows (title, starts_on, ends_on) values ('[샘플] 직접 등록 공연', current_date, current_date + 5)`);
  await sql(`insert into public.casts (show_id, actor_id, role_name) select s.id, a.id, '[샘플] 주인공' from public.shows s, public.actors a where s.external_id = 'kopis:PF900001' and a.name = '배우나'`);

  // 오래된 상세 갱신: 제목·출연진이 바뀐 공연만 다시 받음
  await sql(`update public.shows set external_synced_at = now() - interval '5 days' where external_id = 'kopis:PF900001'`);
  await fetch(`${SUPA}/__mock/kopis-mutate`, { method: "POST", body: JSON.stringify({ id: "PF900001", name: "[테스트] 뮤지컬 알파 (앙코르)", cast: "배우나, 배우마 등" }) });
  const outboxBefore = await sql(`select count(*) from public.notification_outbox`);
  const r3 = await runCron(undefined, "import-shows");
  check(r3.body.detailed === 1 && r3.body.created === 0 && r3.body.castsAdded === 1 && r3.body.castsRemoved === 1 && r3.body.actors === 1, `바뀐 공연만 갱신 (${JSON.stringify(r3.body)})`);
  check((await sql(`select title from public.shows where external_id = 'kopis:PF900001'`)) === "[테스트] 뮤지컬 알파 (앙코르)", "제목 갱신");
  check((await sql(`select string_agg(a.name, ',' order by a.name) from public.casts c join public.actors a on a.id = c.actor_id join public.shows s on s.id = c.show_id where s.external_id = 'kopis:PF900001' and c.role_name = '출연'`)) === "배우나,배우마", "출연진 갱신(빠진 배우 제거·새 배우 추가)");
  check((await sql(`select count(*) from public.casts c join public.shows s on s.id = c.show_id where s.external_id = 'kopis:PF900001' and c.role_name = '[샘플] 주인공'`)) === "1" && (await sql(`select count(*) from public.shows where title = '[샘플] 직접 등록 공연'`)) === "1", "관리자가 직접 넣은 공연·캐스팅은 그대로");
  check((await sql(`select count(*) from public.notification_outbox`)) === outboxBefore, "팔로워 없는 출연진 변경은 알림을 쌓지 않음");

  // 화면
  const page = await newPage();
  await page.goto(`${BASE}/shows?status=running`);
  await page.locator(".show-card-title").first().waitFor();
  const titles = await page.locator(".show-card-title").allInnerTexts();
  check(titles.includes("[테스트] 뮤지컬 알파 (앙코르)") && titles.includes("[테스트] 연극 델타"), `공연 목록(공연 중)에 가져온 공연 (${titles.length}개)`);
  // 1~3일 단기 공연은 기본 목록에서 숨기고, 같이 보기·극장 필터에서는 보인다
  const shortTitle = "[테스트] 하루짜리 공연";
  await page.goto(`${BASE}/shows?status=upcoming`);
  await page.locator(".show-card-title").first().waitFor();
  check(!(await page.locator(".show-card-title").allInnerTexts()).includes(shortTitle), "기본 목록: 1~3일 단기 공연 숨김");
  check(await visible(page.getByText("3일 이하 단기 공연(지방 순회·단발 공연)은 숨겼어요")), "숨김 안내");
  await page.getByRole("link", { name: "같이 보기" }).click();
  await page.waitForURL(/short=1/);
  await page.locator(".show-card-title", { hasText: shortTitle }).first().waitFor({ timeout: 10000 }).catch(() => {});
  check((await page.locator(".show-card-title").allInnerTexts()).includes(shortTitle), "같이 보기: 단기 공연 표시");
  check(await visible(page.getByText("단기 공연도 같이 보고 있어요")), "되돌리기 안내");
  const theaterId = await sql(`select id from public.theaters where external_id = 'kopis:FC9001'`);
  await page.goto(`${BASE}/shows?theater=${theaterId}&status=upcoming`);
  await page.locator(".show-card-title").first().waitFor();
  check((await page.locator(".show-card-title").allInnerTexts()).includes(shortTitle), "극장으로 거르면 단기 공연도 보임");
  check(await page.getByText("단기 공연(지방 순회·단발 공연)은 숨겼어요").count() === 0, "극장 필터에선 숨김 안내 없음");
  const alphaId = await sql(SHOW("[테스트] 뮤지컬 알파 (앙코르)"));
  await page.goto(`${BASE}/shows/${alphaId}`);
  await page.locator(".show-title").waitFor();
  check(await visible(page.getByRole("link", { name: /예매하기 · 테스트예매처/ })), "상세: 예매하기 버튼");
  check((await page.getByRole("link", { name: /예매하기/ }).getAttribute("href")) === "https://tickets.example/booking?a=1&b=2", "예매 링크 주소");
  check(await visible(page.getByText("공연 정보 출처: 공연예술통합전산망(KOPIS)")), "상세: KOPIS 출처 표기");
  check(await visible(page.getByText("줄거리입니다")), "상세: 소개");
  check((await page.locator(".actor-chip-role", { hasText: "출연" }).count()) >= 2, "상세: 출연진(배역은 '출연')");
  await layout(page, "KOPIS 공연 상세");
  await shot(page, "360-kopis-show");
  const manualId = await sql(SHOW("[샘플] 직접 등록 공연"));
  await page.goto(`${BASE}/shows/${manualId}`);
  await page.locator(".show-title").waitFor();
  check(await page.getByText("공연 정보 출처: 공연예술통합전산망").count() === 0, "직접 등록한 공연엔 KOPIS 출처를 붙이지 않음");

  // 관리자 버튼
  const admin = await newPage();
  await login(admin, "kopis-admin@example.com", "코피스관리");
  await sql(`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'kopis-admin@example.com')`);
  await admin.goto(`${BASE}/admin`);
  await admin.getByRole("button", { name: "KOPIS에서 지금 가져오기" }).click();
  await admin.getByTestId("kopis-result").waitFor({ timeout: 60000 });
  const text = await admin.getByTestId("kopis-result").innerText();
  check(/목록 107편/.test(text) && /모두 최신이에요/.test(text), `관리자 버튼으로 가져오기 (${text.slice(0, 60)}…)`);
  await layout(admin, "관리자 홈(KOPIS)");

  const errors = [...page.errors, ...admin.errors].filter((e) => !/Failed to load resource|ytimg|kopis\.or\.kr/.test(e));
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await sql(`delete from public.shows where title = '[샘플] 직접 등록 공연'`);
  await page.close();
  await admin.close();
}
