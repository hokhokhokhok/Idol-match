// 매직링크 로그인 → 닉네임 → MY → 로그아웃, 닉네임 중복, 잘못된 링크
export default async function ({ BASE, SUPA, check, newPage, login, lastLink, layout, shot, visible }) {
  const page = await newPage();

  await page.goto(`${BASE}/me`);
  check(await visible(page.getByText("로그인하면 기록을 저장할 수 있어요")), "비로그인 MY: 로그인 필요 안내");
  await page.getByRole("link", { name: "로그인", exact: true }).click();
  await page.waitForURL(`${BASE}/login?next=%2Fme`);
  check(true, "로그인 버튼 → /login?next=/me");
  await layout(page, "로그인 화면");
  await shot(page, "360-login");

  await page.getByLabel("이메일").fill("not-an-email");
  await page.getByLabel("이메일").evaluate((el) => el.setAttribute("type", "text"));
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  check(await visible(page.getByRole("alert").filter({ hasText: "이메일 주소를 확인해 주세요" })), "잘못된 이메일 안내");

  await page.getByLabel("이메일").fill("Fan1@Example.com");
  await page.getByRole("button", { name: "로그인 링크 받기" }).click();
  await page.getByText("로그인 링크를 보냈어요").waitFor();
  check(true, "로그인 링크 발송 안내");
  const link = await lastLink("fan1@example.com");
  await page.goto(link);
  await page.waitForURL(/\/onboarding\?next=%2Fme/);
  check(true, "첫 로그인 → 닉네임 화면");
  await shot(page, "360-onboarding");
  await page.getByLabel("닉네임").fill("관극러");
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.waitForURL(`${BASE}/me`);
  check((await page.getByTestId("nickname").innerText()) === "관극러", "닉네임 저장 후 원래 가려던 MY로");
  await shot(page, "360-me-loggedin");

  await page.goto(`${BASE}/login`);
  await page.waitForURL(`${BASE}/`);
  check(true, "로그인 상태에서 /login → 돌려보냄");
  await page.goto(`${BASE}/me`);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await page.waitForURL(`${BASE}/`);
  await page.goto(`${BASE}/me`);
  check(await visible(page.getByText("로그인하면 기록을 저장할 수 있어요")), "로그아웃 후 다시 비로그인");

  await page.goto(link);
  await page.waitForURL(`${BASE}/login?error=link`);
  check(await visible(page.getByText("만료됐거나 이미 사용됐어요")), "이미 쓴 링크 → 만료 안내");

  // 두 번째 사용자: 같은 닉네임 → 중복 안내, 재로그인 시 닉네임 화면 건너뜀
  const p2 = await newPage();
  await login(p2, "fan2@example.com");
  await p2.waitForURL(/\/onboarding/);
  await p2.getByLabel("닉네임").fill("관극러");
  await p2.getByRole("button", { name: "시작하기" }).click();
  check(await visible(p2.getByRole("alert").filter({ hasText: "이미 쓰는 닉네임이에요" })), "닉네임 중복 안내");
  await p2.getByLabel("닉네임").fill("두번째");
  await p2.getByRole("button", { name: "시작하기" }).click();
  await p2.waitForURL(`${BASE}/`);
  await login(page, "fan1@example.com");
  check(!page.url().includes("/onboarding"), "닉네임 있는 사용자는 재로그인 시 닉네임 화면 생략");

  // Supabase 기본 메일 템플릿(무료 플랜) 흐름: ?code= (PKCE), 같은 브라우저에서 열기
  const p3 = await newPage();
  await p3.goto(`${BASE}/login?next=%2Fme`);
  await p3.getByLabel("이메일").fill("pkce@example.com");
  await p3.getByRole("button", { name: "로그인 링크 받기" }).click();
  await p3.getByText("로그인 링크를 보냈어요").waitFor();
  const codeLink = (await (await fetch(`${SUPA}/__mock/last-code-link?email=pkce@example.com`)).json()).link;
  check(Boolean(codeLink?.includes("/auth/confirm?code=")), "기본 템플릿 링크(?code=)");
  await p3.goto(codeLink);
  await p3.waitForURL(/\/onboarding\?next=%2Fme/);
  check(true, "?code= 링크로 로그인(PKCE) → 닉네임 화면");
  // 다른 브라우저(코드 검증값 쿠키 없음)에서 열면 만료 안내
  await p3.getByLabel("닉네임").fill("피케이씨이");
  await p3.getByRole("button", { name: "시작하기" }).click();
  await p3.waitForURL(`${BASE}/me`);
  const p4 = await newPage();
  await p4.goto(`${BASE}/login`);
  await p4.getByLabel("이메일").fill("pkce@example.com");
  await p4.getByRole("button", { name: "로그인 링크 받기" }).click();
  await p4.getByText("로그인 링크를 보냈어요").waitFor();
  const otherLink = (await (await fetch(`${SUPA}/__mock/last-code-link?email=pkce@example.com`)).json()).link;
  const p5 = await newPage();
  await p5.goto(otherLink);
  await p5.waitForURL(/\/login\?error=link/);
  check(await visible(p5.getByText("요청한 브라우저에서 열어")), "다른 브라우저에서 ?code= 링크 → 안내");
  for (const p of [p3, p4, p5]) await p.close();
  check(page.errors.length + p2.errors.length === 0, `콘솔 에러 없음 ${[...page.errors, ...p2.errors].join(" | ")}`);
  await page.close();
  await p2.close();
}
