// 영상: 관리자 등록(주소 검증) → 공연·배우 상세에 썸네일, 누르면 그때 플레이어(lazy)
const S1 = "00000000-0000-4000-8000-000000000201";
const GA = "00000000-0000-4000-8000-000000000301";
const VID = "AAAAAAAAAAA"; // 가짜 id(실제 영상 아님)

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, pick }) {
  const admin = await newPage();
  await login(admin, "video-admin@example.com", "영상관리");
  await sql(`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'video-admin@example.com')`);

  await admin.goto(`${BASE}/admin/videos/new`);
  await admin.locator('input[name="youtube_id"]').fill("https://vimeo.com/123");
  await admin.locator('input[name="title"]').fill("[샘플] 프레스콜 영상");
  await admin.getByRole("button", { name: "추가" }).click();
  check(await visible(admin.getByRole("alert").filter({ hasText: "유튜브 주소" })), "유튜브 아닌 주소 거부");
  await admin.locator('input[name="youtube_id"]').fill(`https://www.youtube.com/watch?v=${VID}&t=5`);
  await admin.getByRole("button", { name: "추가" }).click();
  check(await visible(admin.getByRole("alert").filter({ hasText: "공연이나 배우 중 하나는" })), "공연·배우 없이 등록 거부");
  await pick(admin, "show_id", "[샘플] 뮤지컬 첫공");
  await pick(admin, "actor_id", "[샘플] 배우 가");
  await admin.getByRole("button", { name: "추가" }).click();
  await admin.waitForURL(`${BASE}/admin/videos`);
  check((await sql(`select youtube_id from public.videos where title = '[샘플] 프레스콜 영상'`)) === VID, "주소에서 id만 저장");

  const page = await newPage();
  await page.goto(`${BASE}/shows/${S1}`);
  const section = page.locator('section[aria-labelledby="videos-title"]');
  check(await visible(section.getByRole("button", { name: "[샘플] 프레스콜 영상 재생" })), "공연 상세: 영상 썸네일");
  check(await page.locator("iframe").count() === 0, "누르기 전엔 플레이어를 불러오지 않음");
  await layout(page, "공연 상세(영상)");
  await shot(page, "360-show-video");
  await section.getByRole("button", { name: /재생/ }).click();
  const src = await page.locator(".yt iframe").getAttribute("src");
  check(src?.startsWith(`https://www.youtube-nocookie.com/embed/${VID}`) && src.includes("autoplay=1"), `누르면 임베드 재생 (${src})`);

  await page.goto(`${BASE}/actors/${GA}`);
  check(await visible(page.locator('section[aria-labelledby="videos-title"]').getByText("[샘플] 프레스콜 영상")), "배우 상세: 영상");
  await page.goto(`${BASE}/actors/00000000-0000-4000-8000-000000000302`);
  check(await page.locator('section[aria-labelledby="videos-title"]').count() === 0, "영상 없는 배우는 섹션 숨김");

  await admin.goto(`${BASE}/admin/videos`);
  await admin.getByText("[샘플] 프레스콜 영상").click();
  await admin.waitForURL(/\/admin\/videos\/[0-9a-f-]{36}$/);
  check((await admin.locator('input[name="youtube_id"]').inputValue()) === `https://youtu.be/${VID}`, "수정 화면에 주소로 표시");
  await sql(`delete from public.videos`);

  const errors = [...admin.errors, ...page.errors].filter((e) => !/ytimg|youtube|Failed to load resource/.test(e));
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await admin.close();
  await page.close();
}
