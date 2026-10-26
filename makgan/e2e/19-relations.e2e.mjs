// 배우 관계도: 함께 출연한 배우가 원형으로, 확대/축소/이동, 노드 탭 → 함께한 공연, 중심 바꾸기
const NA = "00000000-0000-4000-8000-000000000302";
const NG = "00000000-0000-4000-8000-000000000301";

export default async function ({ BASE, check, newPage, layout, shot, visible }) {
  const page = await newPage();
  await page.goto(`${BASE}/actors/${NA}`);
  await page.getByRole("heading", { name: /함께한 배우 관계도/ }).waitFor();
  const nodes = await page.locator(".rel-node").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  check(nodes.length === 2 && nodes.every((n) => n.includes("1편")), `함께 출연한 배우 2명이 노드로 (${nodes.join(" / ")})`);
  check(await visible(page.locator(".rel-center")), "가운데에 중심 배우");
  await layout(page, "배우 관계도");
  await shot(page, "360-relations");

  const zoom = async () => Number(await page.getByTestId("rel-world").getAttribute("data-zoom"));
  await page.getByRole("button", { name: "확대" }).click();
  await page.getByRole("button", { name: "확대" }).click();
  check(Math.abs((await zoom()) - 1.56) < 0.02, `확대 버튼 (${await zoom()})`);
  await page.getByRole("button", { name: "축소" }).click();
  check((await zoom()) < 1.56 && (await zoom()) > 1, "축소 버튼");
  for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "확대" }).click({ force: true }).catch(() => {});
  check((await zoom()) <= 4 && await page.getByRole("button", { name: "확대" }).isDisabled(), "확대 한도(4배)에서 버튼 비활성");

  const before = await page.getByTestId("rel-world").getAttribute("transform");
  const box = await page.locator(".rel-svg").boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 5 });
  await page.mouse.up();
  check((await page.getByTestId("rel-world").getAttribute("transform")) !== before, "끌어서 이동");
  check(!(await visible(page.locator(".rel-panel"))), "끌기만 했을 땐 노드가 선택되지 않음");

  await page.getByRole("button", { name: "처음 보기로" }).click();
  check((await zoom()) === 1, "처음 보기로 되돌리기");

  await page.locator(".rel-node", { hasText: "[샘플] 배우 가" }).click();
  await page.locator(".rel-panel").waitFor();
  check(await visible(page.locator(".rel-panel").getByText("[샘플] 뮤지컬 첫공")), "노드 탭 → 함께한 공연 표시");
  await page.getByRole("link", { name: "[샘플] 배우 가 중심으로 보기" }).click();
  await page.waitForURL(`${BASE}/actors/${NG}`);
  await page.locator(".rel-center").waitFor();
  check(await page.locator(".rel-node").count() === 2, "다른 배우 중심으로 다시 그려짐");

  // 키보드: + 로 확대
  await page.locator(".rel-svg").focus();
  await page.keyboard.press("+");
  check((await zoom()) > 1, "키보드 + 확대");
}
