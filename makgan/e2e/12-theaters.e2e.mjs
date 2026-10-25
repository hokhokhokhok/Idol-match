// 극장 목록·상세(층 탭, 구역 카드 2열, 구역 없을 때 기본 층), 관리자 구역 관리
const T1 = "00000000-0000-4000-8000-000000000101"; // [샘플] 막간아트홀(구역 있음)
const T2 = "00000000-0000-4000-8000-000000000102"; // [샘플] 커튼콜극장(구역 없음)

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, count }) {
  const page = await newPage();
  await page.goto(`${BASE}/shows`);
  await page.getByRole("link", { name: "극장 보기" }).click();
  await page.waitForURL(`${BASE}/theaters`);
  await count(page.locator(".search-list strong"), 2);
  const names = await page.locator(".search-list strong").allInnerTexts();
  check(names.length === 2, `극장 목록 (${names.join(", ")})`);

  await page.goto(`${BASE}/shows/00000000-0000-4000-8000-000000000201`);
  await page.getByRole("link", { name: "[샘플] 막간아트홀" }).click();
  await page.waitForURL(`${BASE}/theaters/${T1}`);
  await page.locator(".floor-tabs").waitFor();
  const floors = await page.locator(".floor-tabs .chip").allInnerTexts();
  check(JSON.stringify(floors) === JSON.stringify(["1층", "2층"]), `구역이 있는 층만 탭 (${floors.join(", ")})`);
  check((await count(page.locator(".zone-card"), 2)) === 2, "1층 구역 카드 2개");
  const cols = await page.locator(".zone-grid").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  check(cols === 2, "구역 카드 2열");
  check(await visible(page.locator(".zone-card").first().getByText("후기 0")), "구역 카드에 후기 수");
  await layout(page, "극장 상세");
  await shot(page, "360-theater");
  await page.getByRole("link", { name: "2층" }).click();
  await page.waitForURL(/floor=/);
  check((await count(page.locator(".zone-card"), 1)) === 1 && (await page.locator(".zone-name").innerText()) === "[샘플] 앞쪽", "2층 탭");

  await page.goto(`${BASE}/theaters/${T2}`);
  const defaults = await page.locator(".floor-tabs .chip").allInnerTexts();
  check(JSON.stringify(defaults) === JSON.stringify(["1층", "2층", "3층"]), "구역 없는 극장: 기본 1·2·3층");
  check(await visible(page.getByText("구역 정보가 아직 없어요")), "구역 없을 때 안내(배치를 임의로 만들지 않음)");

  // 관리자 구역 관리
  const admin = await newPage();
  await login(admin, "zone-admin@example.com", "구역관리");
  await sql(`update public.profiles set is_admin = true where id = (select id from auth.users where email = 'zone-admin@example.com')`);
  await admin.goto(`${BASE}/admin/theaters/${T2}`);
  const zoneSection = admin.locator('section[aria-labelledby="zone-admin"]');
  await zoneSection.locator('input[name="floor"]').fill("2층");
  await zoneSection.locator('input[name="name"]').fill("[샘플] 발코니");
  await zoneSection.getByRole("button", { name: "구역 추가" }).click();
  await zoneSection.locator(".admin-row", { hasText: "2층 · [샘플] 발코니" }).waitFor({ timeout: 5000 });
  check(true, "구역 추가");
  await zoneSection.locator('input[name="floor"]').fill("2층");
  await zoneSection.locator('input[name="name"]').fill("[샘플] 발코니");
  await zoneSection.getByRole("button", { name: "구역 추가" }).click();
  check(await visible(zoneSection.getByRole("alert").filter({ hasText: "같은 층에 같은 이름" })), "같은 구역 중복 거부");
  await layout(admin, "관리자 극장 수정");

  await page.goto(`${BASE}/theaters/${T2}`);
  const after = await page.locator(".floor-tabs .chip").allInnerTexts();
  check(JSON.stringify(after) === JSON.stringify(["2층"]) && (await page.locator(".zone-name").innerText()) === "[샘플] 발코니", "구역 등록 후 극장 상세 반영");

  admin.once("dialog", (d) => d.accept());
  await zoneSection.locator(".admin-row", { hasText: "[샘플] 발코니" }).getByRole("button", { name: "삭제" }).click();
  await zoneSection.getByText("등록된 구역이 없어요").waitFor({ timeout: 5000 }).catch(() => {});
  check((await sql(`select count(*) from public.seat_zones where theater_id = '${T2}'`)) === "0", "구역 삭제");

  await page.goto(`${BASE}/theaters/00000000-0000-4000-8000-000000000999`);
  check(await visible(page.getByText("찾는 극장이 없어요")), "없는 극장 안내");

  const errors = [...page.errors, ...admin.errors].filter((e) => !e.includes("404"));
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await page.close();
  await admin.close();
}
