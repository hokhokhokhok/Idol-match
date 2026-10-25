// 5탭 이동·활성 표시·360/390px 레이아웃·콘솔 에러
const TABS = [
  { label: "홈", path: "/" },
  { label: "공연", path: "/shows" },
  { label: "혜택", path: "/benefits" },
  { label: "배우", path: "/actors" },
  { label: "MY", path: "/me" },
];

export default async function ({ BASE, check, newPage, layout, shot }) {
  // PWA 설치·iOS 홈 화면 추가에 필요한 아이콘
  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  for (const size of ["192x192", "512x512"]) {
    const icon = manifest.icons.find((i) => i.sizes === size && i.type === "image/png");
    const res = icon && (await fetch(BASE + icon.src));
    check(res?.ok && res.headers.get("content-type") === "image/png", `매니페스트 PNG 아이콘 ${size}`);
  }
  check(manifest.icons.some((i) => i.purpose === "maskable") && manifest.display === "standalone", "maskable 아이콘·standalone");

  for (const width of [360, 390]) {
    const page = await newPage(width);
    await page.goto(BASE + "/");
    if (width === 360) {
      const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
      check(apple && (await fetch(BASE + apple)).ok, "iOS 홈 화면 아이콘(apple-touch-icon)");
    }
    for (const t of TABS) {
      await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link", { name: t.label, exact: true }).click();
      await page.waitForURL(BASE + t.path);
      const current = await page.locator('nav a[aria-current="page"]').innerText();
      check(current.trim() === t.label, `${width}px ${t.path}: 활성 탭 '${t.label}'`);
      await layout(page, `${width}px ${t.path}`);
      if (width === 360) await shot(page, `360${t.path === "/" ? "-home" : t.path.replace("/", "-")}`);
    }
    await page.locator('a[aria-label="검색"]').click();
    await page.waitForURL(BASE + "/search");
    check(page.errors.length === 0, `${width}px: 콘솔 에러 없음 ${page.errors.join(" | ")}`);
    await page.close();
  }
}
