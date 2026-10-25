// 관리자 입력 개선: 1000개 넘는 선택지(이어 받기)·검색 입력칸·공연 화면에서 혜택 미리 채우기·관리자 목록 검색/더 보기
const S1 = "00000000-0000-4000-8000-000000000201";

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, pick, count }) {
  const admin = await newPage();
  await login(admin, "pick-admin@example.com", "선택관리");
  await sql(`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'pick-admin@example.com')`);

  // 일반 사용자에겐 관리자 바가 없다
  const plain = await newPage();
  await login(plain, "pick-plain@example.com", "일반");
  await plain.goto(`${BASE}/shows/${S1}`);
  await plain.locator(".show-title").waitFor();
  check((await plain.locator(".admin-bar").count()) === 0, "일반 사용자: 관리자 바 없음");

  // 공연 화면의 관리자 바 → 혜택 폼(공연·종류 미리 채움)
  await admin.goto(`${BASE}/shows/${S1}`);
  await admin.locator(".admin-bar").waitFor();
  await admin.getByRole("link", { name: "+ 로터리" }).click();
  await admin.waitForURL(/\/admin\/benefits\/new\?show=.*type=lottery/);
  check((await admin.locator('select[name="type"]').inputValue()) === "lottery", "종류가 로터리로 미리 선택됨");
  check((await admin.locator('input[data-combo="show_id"]').inputValue()).startsWith("[샘플] 뮤지컬 첫공"), "공연이 미리 채워짐");
  check((await admin.locator('input[type="hidden"][name="show_id"]').inputValue()) === S1, "공연 id가 폼에 담김");
  await layout(admin, "혜택 폼(미리 채움)");
  await shot(admin, "360-benefit-prefill");

  // 목록에 없는 글자는 제출 불가
  await admin.locator('input[name="title"]').fill("[샘플] 미리 채운 로터리");
  await admin.locator('input[data-combo="show_id"]').fill("없는 공연 이름");
  const invalid = await admin.locator('input[data-combo="show_id"]').evaluate((el) => ({ valid: el.checkValidity(), msg: el.validationMessage }));
  check(!invalid.valid && invalid.msg === "목록에서 골라 주세요", `목록에 없는 공연은 거부 (${invalid.msg})`);
  await pick(admin, "show_id", "[샘플] 뮤지컬 첫공");
  check(await admin.locator('input[data-combo="show_id"]').evaluate((el) => el.checkValidity()), "목록에서 고르면 통과");
  const tomorrow = new Date(Date.now() + 9 * 3600e3 + 86400e3).toISOString().slice(0, 10);
  await admin.locator('input[name="ends_at"]').fill(`${tomorrow}T18:00`);
  await admin.getByRole("button", { name: "추가" }).click();
  await admin.waitForURL(`${BASE}/admin/benefits`);
  check((await sql(`select type || ' ' || (show_id = '${S1}')::text from public.benefits where title = '[샘플] 미리 채운 로터리'`)) === "lottery true", "로터리 혜택이 그 공연에 연결되어 저장");
  await plain.goto(`${BASE}/benefits?type=lottery`);
  check(await visible(plain.locator(".benefit-card", { hasText: "[샘플] 미리 채운 로터리" }).getByText("내일 마감")), "혜택 탭 로터리에 노출");
  await sql(`delete from public.benefits where title = '[샘플] 미리 채운 로터리'`);

  // 1000개 넘는 배우: 끝까지 이어 받아 선택 가능
  await sql(`insert into public.actors (name) select '[테스트배우' || lpad(i::text, 4, '0') || ']' from generate_series(1, 1100) i`);
  await admin.goto(`${BASE}/admin/shows/${S1}`);
  await admin.locator('input[data-combo="actor_id"]').waitFor();
  const n = await admin.locator('datalist[data-combo-list="actor_id"] option').count();
  check(n >= 1100, `배우 선택지 ${n}개(1000개 상한을 넘어 모두 받음)`);
  await pick(admin, "actor_id", "[테스트배우1100]");
  await admin.locator('input[name="role_name"]').fill("[샘플] 마지막 배우");
  await admin.getByRole("button", { name: "캐스팅 추가" }).click();
  await admin.locator(".admin-row", { hasText: "[테스트배우1100] · [샘플] 마지막 배우" }).waitFor({ timeout: 8000 });
  check(true, "1000번째 이후 배우도 캐스팅 추가");

  // 후기 폼에서도 같은 선택지(공연 검색)
  await admin.goto(`${BASE}/me/reviews/new`);
  await admin.locator('input[data-combo="show_id"]').waitFor();
  check((await admin.locator('datalist[data-combo-list="show_id"] option').count()) >= 4, "후기 폼: 공연 검색 선택지");
  await pick(admin, "show_id", "[샘플] 연극 막공");
  check((await admin.locator('input[type="hidden"][name="show_id"]').inputValue()) === "00000000-0000-4000-8000-000000000202", "후기 폼: 이름으로 공연 고르기");
  await layout(admin, "후기 쓰기(공연 검색)");

  // 관리자 목록: 검색, 더 보기
  await admin.goto(`${BASE}/admin/shows?q=${encodeURIComponent("뮤지컬 첫공")}`);
  check((await count(admin.locator(".admin-row"), 1)) === 1, "관리자 공연 목록 검색");
  await admin.goto(`${BASE}/admin/actors`);
  await admin.locator(".admin-row").first().waitFor();
  check((await admin.locator(".admin-row").count()) === 100 && (await visible(admin.getByRole("link", { name: "더 보기" }))), "관리자 목록은 100개씩 + 더 보기");
  await admin.getByRole("link", { name: "더 보기" }).click();
  await admin.waitForURL(/limit=200/);
  check((await count(admin.locator(".admin-row"), 200)) === 200, "더 보기로 200개");

  await sql(`delete from public.actors where name like '[테스트배우%'`);
  // 앞선 KOPIS 테스트가 넣은 가짜 공연의 포스터 주소는 실제 서버에 없어 404(앱은 기본 이미지로 대체)
  const errors = [...admin.errors, ...plain.errors].filter((e) => !/Failed to load resource/.test(e));
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await admin.close();
  await plain.close();
}
