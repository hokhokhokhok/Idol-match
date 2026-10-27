// 배우 목록: 이름 첫소리(ㄱㄴㄷ…) 묶음, 열 때 불러오기, 더 보기, 바로가기 버튼
export default async function ({ BASE, check, newPage, layout, shot, visible, sql }) {
  const names = ["김철수", "까치", "김영희", "나나", "이순신", "John", ...Array.from({ length: 50 }, (_, i) => `하${String.fromCharCode(0xac00 + i)}`)];
  await sql(`insert into public.actors (name) values ${names.map((n) => `('${n}')`).join(",")}`);
  const page = await newPage();
  await page.goto(`${BASE}/actors`);
  await page.locator(".agroup").first().waitFor();

  const heads = await page.locator(".agroup-head").allInnerTexts();
  const flat = heads.map((h) => h.replace(/\s+/g, " ").trim());
  check(flat.includes("ㄱ 3명") && flat.includes("ㄴ 1명") && flat.includes("ㅇ 1명") && flat.includes("ㅎ 50명") && flat.includes("A–Z 1명"), `묶음과 인원 (${flat.join(" | ")})`);
  check(flat.some((h) => h.startsWith("기타")), "샘플(대괄호 이름)은 기타");
  check((await page.locator(".actor-chip").count()) === 0, "처음엔 모두 접혀 있고 배우를 불러오지 않음");
  await layout(page, "배우 묶음(접힘)");
  await shot(page, "360-actor-groups");

  await page.locator(".agroup-head", { hasText: "ㄱ" }).click();
  await page.locator(".actor-chip-name", { hasText: "김철수" }).waitFor();
  const g = await page.locator(".agroup[open] .actor-chip-name").allInnerTexts();
  check(g.length === 3 && g.includes("까치") && g.includes("김영희"), `ㄱ 묶음에 쌍자음(ㄲ)도 포함 (${g.join(", ")})`);
  check(g.indexOf("김영희") < g.indexOf("김철수"), "묶음 안은 가나다순");

  // 바로가기 버튼: 눌러서 ㅎ 묶음을 열고 48명씩, 더 보기로 나머지
  await page.getByRole("button", { name: "ㅎ 50명" }).click();
  await page.locator(".agroup", { hasText: "ㅎ" }).locator(".actor-chip").first().waitFor();
  check((await page.locator(".agroup", { hasText: "50명" }).locator(".actor-chip").count()) === 48, "한 번에 48명만");
  await page.locator(".agroup", { hasText: "50명" }).getByRole("button", { name: "더 보기" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".agroup[open] .actor-chip").length >= 50 + 3, null, { timeout: 8000 }).catch(() => {});
  check((await page.locator(".agroup", { hasText: "50명" }).locator(".actor-chip").count()) === 50, "더 보기로 나머지 2명");
  check(!(await visible(page.locator(".agroup", { hasText: "50명" }).getByRole("button", { name: "더 보기" }), 800)), "다 불러오면 더 보기 없음");

  // 다시 접었다 열어도 다시 불러오지 않고 그대로
  await page.locator(".agroup-head", { hasText: "ㅎ" }).click();
  await page.locator(".agroup-head", { hasText: "ㅎ" }).click();
  check((await page.locator(".agroup", { hasText: "50명" }).locator(".actor-chip").count()) === 50, "접었다 펴도 유지");

  // 배우를 누르면 상세로
  await page.locator(".actor-chip-name", { hasText: "나나" }).count();
  await page.getByRole("button", { name: "ㄴ 1명" }).click();
  await page.locator(".actor-chip-name", { hasText: "나나" }).click();
  await page.locator(".actor-hero").waitFor();
  check(await visible(page.getByRole("heading", { name: "나나" })), "이름을 누르면 배우 상세");

  await sql(`delete from public.actors where name in (${names.map((n) => `'${n}'`).join(",")})`);
}
