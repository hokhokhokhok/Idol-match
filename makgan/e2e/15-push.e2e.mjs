// 푸시 알림: 크론 보호, 알림 받기(첫 클릭에 권한 요청), 마감 1시간 전 발송, 중복 없음, 방해금지 시간 묶음, 캐스팅·찜 종료 알림, 설정, 테스트 알림, iOS 안내
const LOTTERY_TITLE = "[샘플] 오늘 마감 로터리";
const GA = "00000000-0000-4000-8000-000000000301";
const S2 = "00000000-0000-4000-8000-000000000202";

function stubPush(sub) {
  return ({ fake }) => {
    // 실제 브라우저처럼 권한·구독이 페이지 이동 뒤에도 남도록 localStorage에 둔다
    window.__permCalls = 0;
    const store = (k, v) => (v === undefined ? localStorage.getItem(k) : v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
    const make = () => ({ endpoint: fake.endpoint, toJSON: () => fake, unsubscribe: async () => { store("__sub", null); return true; } });
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => store("__perm") ?? "default" });
    Notification.requestPermission = async () => { window.__permCalls++; store("__perm", "granted"); return "granted"; };
    PushManager.prototype.getSubscription = async function () { return store("__sub") ? make() : null; };
    PushManager.prototype.subscribe = async function () { store("__sub", "1"); return make(); };
  };
}

export default async function ({ BASE, check, newPage, login, visible, layout, shot, sql, settled, runCron, fakePushSubscription, receivedPushes }) {
  // 크론 보호
  check((await runCron(null)).status === 401, "크론: 비밀값 없으면 401");
  check((await runCron("wrong")).status === 401, "크론: 틀린 비밀값 401");
  const ok = await runCron();
  check(ok.status === 200 && ok.body?.delivered === 0, `크론: 맞는 비밀값 200 (${JSON.stringify(ok.body)})`);

  const sub = fakePushSubscription();
  const page = await newPage();
  await page.addInitScript(stubPush(), { fake: sub.json });
  await login(page, "pusher@example.com", "알림러");
  const uid = await sql(`select id from auth.users where email = 'pusher@example.com'`);

  // 방해금지 끄기(테스트 시각과 무관하게)
  await page.goto(`${BASE}/me/settings`);
  await page.locator('input[name="quiet_start"]').fill("00:00");
  await page.locator('input[name="quiet_end"]').fill("00:00");
  await page.getByRole("button", { name: "설정 저장" }).click();
  check(await visible(page.locator(".toast", { hasText: "저장했어요" })), "설정 저장");
  await layout(page, "알림 설정");
  await shot(page, "360-settings");

  // 첫 접속엔 권한 요청 안 함 → 알림 받기 누를 때 요청
  await page.goto(`${BASE}/benefits`);
  check((await page.evaluate(() => window.__permCalls)) === 0, "첫 접속에 알림 권한 요청 안 함");
  const card = page.locator(".benefit-card", { hasText: LOTTERY_TITLE });
  await card.getByRole("button", { name: /알림 받기/ }).click();
  await settled(page);
  check((await page.evaluate(() => window.__permCalls)) === 1, "알림 받기 첫 클릭에 권한 요청");
  check((await card.locator(".alert-btn").getAttribute("aria-pressed")) === "true", "알림 켜짐 표시");
  check(await visible(page.locator(".toast", { hasText: "마감 1시간 전에 알려드릴게요" })), "안내 토스트");
  check((await sql(`select remind_minutes from public.benefit_alerts where user_id = '${uid}'`)) === "60", "마감 60분 전으로 등록");
  check((await sql(`select count(*) from public.push_subscriptions where user_id = '${uid}'`)) === "1", "이 기기 구독 저장");
  const open = page.locator(".benefit-card", { hasText: "[샘플] 1차 티켓오픈" });
  await open.getByRole("button", { name: /알림 받기/ }).click();
  await settled(page);
  check((await sql(`select remind_minutes from public.benefit_alerts a join public.benefits b on b.id = a.benefit_id where a.user_id = '${uid}' and b.type = 'ticket_open'`)) === "10", "티켓오픈은 오픈 10분 전");

  // 아직 1시간 넘게 남음 → 안 보냄, 30분 남게 바꾸면 보냄
  await sql(`update public.benefits set ends_at = now() + interval '3 hours' where title = '${LOTTERY_TITLE}'`);
  await runCron();
  check((await receivedPushes(sub)).length === 0, "마감 1시간 전 전에는 안 보냄");
  await sql(`update public.benefits set ends_at = now() + interval '30 minutes' where title = '${LOTTERY_TITLE}'`);
  const r1 = await runCron();
  let got = await receivedPushes(sub);
  check(got.length === 1 && /분 뒤 마감$/.test(got[0].title) && got[0].body === LOTTERY_TITLE, `마감 임박 알림 수신 (${JSON.stringify(got[0])}, ${JSON.stringify(r1.body)})`);
  await runCron();
  check((await receivedPushes(sub)).length === 1, "같은 알림을 두 번 보내지 않음");

  // 방해금지 시간: 지금을 포함하게 → 쌓아 두었다가, 끝나면 묶어서
  const kst = new Date(Date.now() + 9 * 3600e3);
  const hh = (d) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  await sql(`update public.notification_settings set quiet_start = '${hh(new Date(kst.getTime() - 3600e3))}', quiet_end = '${hh(new Date(kst.getTime() + 3600e3))}' where user_id = '${uid}'`);
  await page.goto(`${BASE}/actors/${GA}`);
  await page.getByRole("button", { name: "[샘플] 배우 가 팔로우" }).click();
  await settled(page);
  await sql(`insert into public.casts (show_id, actor_id, role_name, perf_date) values ('${S2}', '${GA}', '[샘플] 특별출연', current_date + 3)`);
  check((await sql(`select count(*) from public.notification_outbox where user_id = '${uid}' and kind = 'cast_added'`)) === "1", "팔로우 배우 캐스팅 추가 → 대기열");
  await page.goto(`${BASE}/shows?status=all`);
  const endingId = await sql(`insert into public.shows (title, starts_on, ends_on) values ('[샘플] 곧 끝나는 공연', current_date - 10, ((now() at time zone 'Asia/Seoul')::date + 7)) returning id`);
  await sql(`insert into public.wishlists (user_id, show_id) values ('${uid}', '${endingId.split("\n")[0]}')`);
  const r2 = await runCron();
  check((await receivedPushes(sub)).length === 1 && r2.body.deferred === 2, `방해금지 시간엔 보내지 않고 쌓아 둠 (${JSON.stringify(r2.body)})`);
  await sql(`update public.notification_settings set quiet_start = '00:00', quiet_end = '00:00' where user_id = '${uid}'`);
  await runCron();
  got = await receivedPushes(sub);
  check(got.length === 2 && got[1].title === "막간 알림 2개" && got[1].body.includes("캐스팅 소식") && got[1].body.includes("7일 뒤 끝나요"), `방해금지 끝나면 묶어서 한 번 (${JSON.stringify(got[1])})`);
  await runCron();
  check((await receivedPushes(sub)).length === 2, "찜 종료 알림도 한 번만");

  // 설정에서 캐스팅 알림 끄면 대기열에 안 쌓임
  await page.goto(`${BASE}/me/settings`);
  await page.getByLabel("팔로우한 배우 캐스팅 추가").uncheck();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.locator(".toast", { hasText: "저장했어요" }).waitFor();
  await sql(`insert into public.casts (show_id, actor_id, role_name) values ('${S2}', '${GA}', '[샘플] 또 다른 역')`);
  check((await sql(`select count(*) from public.notification_outbox where user_id = '${uid}' and kind = 'cast_added'`)) === "1", "캐스팅 알림 끄면 쌓이지 않음");

  // 테스트 알림
  check((await page.getByTestId("device-status").innerText()) === "알림 받는 중", "설정: 이 기기 알림 받는 중");
  await page.getByRole("button", { name: "테스트 알림 보내기" }).click();
  await settled(page);
  got = await receivedPushes(sub);
  check(got.length === 3 && got[2].title === "막간 테스트 알림", "테스트 알림 수신");
  await page.getByRole("button", { name: "이 기기 알림 끄기" }).click();
  await settled(page);
  check((await sql(`select count(*) from public.push_subscriptions where user_id = '${uid}'`)) === "0", "이 기기 알림 끄면 구독 삭제");

  // iOS(홈 화면 추가 전): PushManager 없음 → 안내
  const ios = await newPage();
  await ios.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
    delete window.PushManager;
  });
  await login(ios, "ios@example.com", "아이폰");
  await ios.goto(`${BASE}/me/settings`);
  check(await visible(ios.getByText("홈 화면에 추가하면 알림을 받을 수 있어요")), "iOS: 홈 화면에 추가 안내");

  await sql(`delete from public.shows where id = '${endingId.split("\n")[0]}'; delete from public.casts where role_name in ('[샘플] 특별출연', '[샘플] 또 다른 역')`);
  const errors = [...page.errors, ...ios.errors];
  check(errors.length === 0, `콘솔 에러 없음 ${errors.join(" | ")}`);
  await page.close();
  await ios.close();
}
