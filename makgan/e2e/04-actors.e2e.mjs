// 배우 목록·상세(출연작), 팔로우(비로그인 → 로그인 후 복귀, 토글, 팔로잉 탭)
const NA = "00000000-0000-4000-8000-000000000302";

export default async function ({ BASE, check, newPage, layout, shot, visible, lastLink, settled }) {
  const page = await newPage();

  await page.goto(`${BASE}/actors`);
  const names = await page.locator(".actor-chip-name").allInnerTexts();
  check(names.length === 3 && names[0] === "[샘플] 배우 가", `배우 목록 가나다순 (${names.join(", ")})`);
  check(await page.locator(".avatar-fallback").count() === 3, "사진 없는 배우는 기본 이미지");
  await layout(page, "배우 목록");
  await shot(page, "360-actors");

  await page.getByRole("link", { name: "팔로잉" }).click();
  check(await visible(page.getByText("로그인하면 기록을 저장할 수 있어요")), "비로그인 팔로잉 탭: 로그인 안내");

  await page.goto(`${BASE}/actors`);
  await page.getByText("[샘플] 배우 나").click();
  await page.waitForURL(`${BASE}/actors/${NA}`);
  await page.locator(".actor-hero").waitFor();
  const shows = await page.locator(".show-card-title").allInnerTexts();
  check(shows.length === 2 && shows.includes("[샘플] 뮤지컬 첫공") && shows.includes("[샘플] 연극 막공"), `출연작 2개 (${shows.join(", ")})`);
  check(await visible(page.locator(".show-card-note", { hasText: "[샘플] 화자" })), "출연작에 배역 표시");
  await layout(page, "배우 상세");
  await shot(page, "360-actor-detail");

  // 비로그인 팔로우 → 로그인 → 닉네임 → 배우 상세로 복귀
  await page.getByRole("button", { name: "[샘플] 배우 나 팔로우" }).click();
  await page.waitForURL(/\/login\?next=/);
  check(page.url().includes(encodeURIComponent(`/actors/${NA}`)), "비로그인 팔로우 → 로그인 화면(돌아올 주소 포함)");
  await page.getByLabel("이메일").fill("follower@example.com");
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await page.getByText("로그인 링크를 보냈어요").waitFor();
  await page.goto(await lastLink("follower@example.com"));
  await page.getByLabel("닉네임").fill("팔로워");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.waitForURL(`${BASE}/actors/${NA}`);
  check(true, "로그인 후 배우 상세로 복귀");

  const btn = page.getByRole("button", { name: "[샘플] 배우 나 팔로우" });
  check((await btn.getAttribute("aria-pressed")) === "false", "처음엔 팔로우 안 함");
  await btn.click();
  await page.waitForFunction(() => document.querySelector(".follow-btn")?.textContent === "팔로잉");
  await settled(page);
  await page.reload();
  check((await btn.innerText()) === "팔로잉", "팔로우 저장(새로고침 후 유지)");

  await page.goto(`${BASE}/actors`);
  check(await page.locator(".actor-chip", { hasText: "[샘플] 배우 나" }).locator(".following-dot").count() === 1, "목록에 팔로우 표시");
  await page.getByRole("link", { name: "팔로잉" }).click();
  await page.waitForURL(/tab=following/);
  const followed = await page.locator(".actor-chip-name").allInnerTexts();
  check(followed.length === 1 && followed[0] === "[샘플] 배우 나", "팔로잉 탭: 1명");

  await page.goto(`${BASE}/actors/${NA}`);
  await btn.click();
  await page.waitForFunction(() => document.querySelector(".follow-btn")?.textContent === "팔로우");
  await settled(page);
  await page.goto(`${BASE}/actors?tab=following`);
  check(await visible(page.getByText("아직 팔로우한 배우가 없어요")), "언팔로우 후 팔로잉 탭 비어 있음");

  await page.goto(`${BASE}/actors/00000000-0000-4000-8000-000000000999`);
  check(await visible(page.getByText("찾는 배우가 없어요")), "없는 배우 → 안내");

  check(page.errors.filter((e) => !e.includes("404")).length === 0, `콘솔 에러 없음 ${page.errors.join(" | ")}`);
  await page.close();
}
