// 용어 사전(초안은 관리자만, 공개 후 가나다 목록·검색·바텀시트) + 링크로 채우기(제목·출처만, SSRF 차단, 크기·시간 제한)
export default async function ({ BASE, SUPA, check, newPage, login, visible, layout, shot, sql, settled }) {
  const anon = await newPage();
  await anon.goto(`${BASE}/glossary`);
  check(await visible(anon.getByText("아직 등록된 용어가 없어요")), "초안만 있을 때 공개 사전은 비어 있음");

  const admin = await newPage();
  await login(admin, "gloss-admin@example.com", "사전관리");
  await sql(`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'gloss-admin@example.com')`);
  await admin.goto(`${BASE}/glossary`);
  check((await admin.locator(".glossary-term").count()) >= 10 && (await admin.locator(".glossary-term .badge", { hasText: "초안" }).count()) >= 10, "관리자: 초안 용어(Claude 초안 10개)가 초안 표시로 보임");

  // 커튼콜 공개
  await admin.goto(`${BASE}/admin/glossary`);
  await admin.getByText("커튼콜", { exact: true }).click();
  await admin.waitForURL(/\/admin\/glossary\/[0-9a-f-]{36}$/);
  await admin.locator('select[name="status"]').selectOption("published");
  await admin.getByRole("button", { name: "저장" }).click();
  await admin.waitForURL(`${BASE}/admin/glossary`);

  await anon.goto(`${BASE}/glossary`);
  const terms = await anon.locator(".glossary-term strong").allInnerTexts();
  check(terms.length === 1 && terms[0] === "커튼콜", `공개 후 사용자에게 보임(초안은 계속 숨김) (${terms.join(", ")})`);
  check((await anon.locator(".glossary-head").innerText()) === "ㅋ", "가나다 묶음(ㅋ)");
  await anon.locator(".glossary-term", { hasText: "커튼콜" }).click();
  const sheet = anon.getByRole("dialog", { name: "커튼콜" });
  check(await visible(sheet.getByText("관객에게 인사")), "용어 누르면 뜻 바텀시트");
  check(await visible(sheet.getByText("예)")), "예시 표시");
  await layout(anon, "용어 사전(바텀시트)");
  await shot(anon, "360-glossary");
  await anon.keyboard.press("Escape");
  await anon.goto(`${BASE}/glossary?q=${encodeURIComponent("인사")}`);
  check((await anon.locator(".glossary-term").count()) === 1, "뜻으로 검색");
  await anon.goto(`${BASE}/glossary?q=${encodeURIComponent("%")}`);
  check(await visible(anon.getByText("찾는 용어가 없어요")), "% 는 글자 그대로");

  // 링크로 채우기
  await admin.goto(`${BASE}/admin/benefits/new`);
  const fill = async (url) => {
    await admin.getByLabel("채울 링크").fill(url);
    await admin.getByRole("button", { name: "채우기" }).click();
    await settled(admin);
  };
  await fill(`${SUPA}/__mock/og-page`);
  check((await admin.locator('input[name="title"]').inputValue()) === "[샘플] 11월 로터리 안내 & 할인", "og:title로 제목 채움");
  check((await admin.locator('input[name="source_name"]').inputValue()) === "[샘플] 공식 SNS", "og:site_name으로 출처 이름");
  check((await admin.locator('input[name="source_url"]').inputValue()) === `${SUPA}/__mock/og-page`, "출처 링크");
  check((await admin.locator('input[name="ends_at"]').inputValue()) === "" && (await admin.locator('input[name="starts_at"]').inputValue()) === "", "날짜는 자동으로 채우지 않음");
  check(await visible(admin.getByText("날짜는 직접 입력해 주세요")), "안내 문구");
  await layout(admin, "관리자 혜택(링크로 채우기)");

  for (const [url, label] of [
    [`http://127.0.0.1:${new URL(SUPA).port}/__mock/og-page`, "사설 IP(127.0.0.1) 차단"],
    [`${SUPA}/__mock/redirect-internal`, "내부 주소로 리다이렉트 차단"],
    [`${SUPA}/__mock/big-page`, "1MB 넘는 응답 거부"],
    ["file:///etc/passwd", "http/https 외 거부"],
  ]) {
    await admin.goto(`${BASE}/admin/benefits/new`);
    await fill(url);
    check((await admin.locator('input[name="title"]').inputValue()) === "" && (await visible(admin.getByText("자동으로 채우지 못했어요"))), label);
  }
  await admin.goto(`${BASE}/admin/benefits/new`);
  const t0 = Date.now();
  await fill(`${SUPA}/__mock/slow-page`);
  const took = Date.now() - t0;
  check(took < 6500 && (await visible(admin.getByText("자동으로 채우지 못했어요"))), `5초 넘으면 포기 (${took}ms)`);

  const errors = [...anon.errors, ...admin.errors];
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await anon.close();
  await admin.close();
}
