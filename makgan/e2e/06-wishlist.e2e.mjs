// 찜: 비로그인 → 로그인 안내(돌아오기), 목록·상세에서 토글, MY 찜 목록, 빈 화면
const S1 = "00000000-0000-4000-8000-000000000201";

export default async function ({ BASE, check, newPage, login, visible, layout, shot }) {
  const page = await newPage();

  await page.goto(`${BASE}/shows`);
  const heart = (title) => page.getByRole("button", { name: `${title} 찜` });
  check(await heart("[샘플] 뮤지컬 첫공").isVisible(), "목록 카드에 ♡");
  await heart("[샘플] 뮤지컬 첫공").click();
  await page.waitForURL(/\/login\?next=%2Fshows/);
  check(true, "비로그인 찜 → 로그인 화면");

  await login(page, "wisher@example.com", "찜러");
  await page.goto(`${BASE}/me`);
  check(await visible(page.getByText("아직 찜한 공연이 없어요")), "찜 없을 때 MY 빈 화면");
  check(await visible(page.getByRole("link", { name: "공연 둘러보기" })), "빈 화면 버튼: 공연 둘러보기");

  await page.goto(`${BASE}/shows`);
  await heart("[샘플] 뮤지컬 첫공").click();
  await page.waitForFunction((n) => document.querySelector(`[aria-label="${n}"]`)?.getAttribute("aria-pressed") === "true", "[샘플] 뮤지컬 첫공 찜");
  await page.waitForTimeout(500);
  await page.reload();
  check((await heart("[샘플] 뮤지컬 첫공").innerText()) === "♥", "목록에서 찜(새로고침 후 유지)");

  await page.goto(`${BASE}/shows/${S1}`);
  await page.locator(".show-title").waitFor();
  check((await heart("[샘플] 뮤지컬 첫공").getAttribute("aria-pressed")) === "true", "상세에도 찜 상태 반영");
  await layout(page, "공연 상세(찜)");

  await page.goto(`${BASE}/shows?status=upcoming`);
  await heart("[샘플] 뮤지컬 회전문").click();
  await page.waitForTimeout(800);

  await page.goto(`${BASE}/me`);
  const wished = await page.locator(".show-card-title").allInnerTexts();
  check(wished.length === 2 && wished[0] === "[샘플] 뮤지컬 첫공", `MY 찜 목록 2개, 곧 끝나는 순 (${wished.join(", ")})`);
  await shot(page, "360-me-wishlist");

  await heart("[샘플] 뮤지컬 첫공").click();
  await page.waitForFunction(() => document.querySelectorAll(".show-card-title").length === 1, null, { timeout: 5000 }).catch(() => {});
  check((await page.locator(".show-card-title").allInnerTexts()).join() === "[샘플] 뮤지컬 회전문", "MY에서 찜 해제하면 목록에서 빠짐");

  // 다른 사용자에게는 내 찜이 안 보임
  const other = await newPage();
  await login(other, "other@example.com", "다른사람");
  await other.goto(`${BASE}/me`);
  check(await visible(other.getByText("아직 찜한 공연이 없어요")), "다른 사용자 MY에는 내 찜이 없음");

  check(page.errors.length + other.errors.length === 0, `콘솔 에러 없음 ${[...page.errors, ...other.errors].join(" | ")}`);
  await page.close();
  await other.close();
}
