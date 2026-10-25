// 공통 컴포넌트: 바텀시트(바깥 누르기·Esc·끌어서 닫기), 토스트 3초, 404, 목록 로딩 스켈레톤
import { existsSync } from "node:fs";

export default async function ({ BASE, check, newPage, visible, layout, shot }) {
  const page = await newPage();
  await page.goto(`${BASE}/shows`);
  const open = () => page.getByRole("button", { name: /^필터/ }).click();
  const dialog = page.getByRole("dialog", { name: "정렬 · 필터" });

  await open();
  check(await visible(dialog), "필터 버튼 → 바텀시트 열림");
  await layout(page, "바텀시트(360px)");
  await shot(page, "360-bottom-sheet");
  await page.getByTestId("sheet-backdrop").click({ position: { x: 10, y: 10 } });
  check(await dialog.count() === 0, "바깥 누르면 닫힘");

  await open();
  await page.keyboard.press("Escape");
  check(await dialog.count() === 0, "Esc로 닫힘");

  await open();
  const box = await page.getByTestId("sheet-handle").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 40, { steps: 4 });
  await page.mouse.up();
  check(await dialog.count() === 1, "조금 끌면 다시 제자리");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 6 });
  await page.mouse.up();
  await dialog.waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
  check(await dialog.count() === 0, "아래로 끌면 닫힘");
  check(await page.evaluate(() => document.body.style.overflow) === "", "닫으면 스크롤 잠금 해제");

  // 토스트: ?toast=키 → 표시 → 3초 뒤 사라짐, 주소에서 키 제거
  await page.goto(`${BASE}/benefits?toast=saved`);
  check(await visible(page.locator(".toast", { hasText: "저장했어요" })), "토스트 표시");
  await page.waitForURL(`${BASE}/benefits`);
  check(true, "토스트 키는 주소에서 지움");
  const tabTop = await page.locator('nav[aria-label="주요 메뉴"]').boundingBox();
  const toastBox = await page.locator(".toast").boundingBox();
  check(toastBox && toastBox.y + toastBox.height <= tabTop.y, "토스트는 하단 탭 위");
  await page.waitForTimeout(3300);
  check(await page.locator(".toast").count() === 0, "3초 뒤 사라짐");
  await page.goto(`${BASE}/benefits?toast=unknown`);
  await page.waitForTimeout(300);
  check(await page.locator(".toast").count() === 0, "모르는 키는 무시");

  await page.goto(`${BASE}/no-such-page`);
  check(await visible(page.getByText("찾는 페이지가 없어요")), "없는 주소 → 안내");

  // 모든 목록 화면에 로딩 스켈레톤(SPEC-2 C-10)
  const dirs = ["", "shows", "shows/[id]", "benefits", "actors", "actors/[id]", "me", "search"];
  const missing = dirs.filter((d) => !existsSync(new URL(`../app/${d}/loading.tsx`, import.meta.url)));
  check(missing.length === 0, `목록·상세 화면에 loading.tsx (빠진 곳: ${missing.join(", ")})`);

  check(page.errors.filter((e) => !e.includes("404")).length === 0, `콘솔 에러 없음 ${page.errors.join(" | ")}`);
  await page.close();
}
