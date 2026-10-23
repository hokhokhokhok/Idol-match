// 빌드 결과(dist/)를 아이패드 화면 크기로 띄워 주요 흐름을 자동 점검한다.
//   npm run build && npm run test:e2e
//   BROWSER=webkit npm run test:e2e   (사파리와 같은 엔진: 먼저 npx playwright install webkit)
//   SHOTS=1 이면 스크린샷을 e2e-shots/ 에 남긴다
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const shotsDir = `${root}e2e-shots`;
if (process.env.SHOTS) mkdirSync(shotsDir, { recursive: true });

const IPADS = {
  'iPad mini 세로': { width: 744, height: 1133 },
  'iPad 세로': { width: 820, height: 1180 },
  'iPad 가로': { width: 1180, height: 820 },
  'iPad Pro 12.9 가로': { width: 1366, height: 1024 },
  'Split View 1/3': { width: 375, height: 1024 },
};

const server = await preview({ root, preview: { port: 4317, strictPort: true }, logLevel: 'silent' });
const URL_ = 'http://localhost:4317/';
const browser = await engine.launch();
let failures = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  ✗ ${name}\n      ${String(e.message).split('\n').slice(0, 4).join('\n      ')}`);
  }
}

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, acceptDownloads: true, locale: 'ko-KR' });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { ctx, page, errors };
}

async function shot(page, name) {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(350); // 패널 슬라이드·화면 전환 애니메이션이 끝난 뒤
  await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true });
}

/** 가로 스크롤이 생기지 않는지 */
async function noHorizontalOverflow(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `가로 넘침: 문서 폭 ${sw}px > 화면 ${iw}px`);
}

/** 보이는 버튼이 모두 44px 이상 터치 영역인지 */
async function touchTargets(page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, [role=radio], [role=switch], input[type=file]')]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && Math.min(r.width, r.height) < 43.5)
      .map(({ el, r }) => `${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 20)} ${Math.round(r.width)}×${Math.round(r.height)}`),
  );
  assert.deepEqual(small, [], `44px 미만 터치 영역: ${small.join(', ')}`);
}

/** 시드 세트(5문항) 카드의 시작 버튼: 흐름 점검은 짧은 세트로 한다 */
const seedStart = (page, label = /실전 시작|연습 시작/) =>
  page.locator('.set-card', { hasText: 'seed-001' }).getByRole('button', { name: label });

async function submitAll(page) {
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '제출', exact: true }).click();
  await page.getByText('채점 결과').waitFor();
}

console.log(`엔진: ${engine.name()}`);

// 1) 화면 크기별 레이아웃·흐름
for (const [label, viewport] of Object.entries(IPADS)) {
  console.log(`\n[${label} ${viewport.width}×${viewport.height}]`);
  const { ctx, page, errors } = await newPage(viewport);
  const tag = label.replace(/[\s/]/g, '_');

  await step('홈 로드, 시험지 글꼴(나눔명조·Pretendard) 로드', async () => {
    await page.goto(URL_);
    await seedStart(page, '실전 시작').waitFor();
    await seedStart(page, '실전 시작').click();
    await page.evaluate(() => document.fonts.ready);
    const fams = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')));
    assert.ok(fams.includes('Nanum Myeongjo'), `로드된 글꼴: ${[...new Set(fams)]}`);
    await page.getByRole('button', { name: /^나가기/ }).click();
  });
  await step('홈: 가로 넘침 없음, 터치 영역 44px', async () => {
    await noHorizontalOverflow(page);
    await touchTargets(page);
  });

  await step('시험: 마킹·스와이프·별표·답안지·제출 모달', async () => {
    await page.getByRole('button', { name: '이어 풀기' }).click();
    await page.getByRole('radio').nth(3).click();
    await page.getByRole('button', { name: /별표/ }).first().click();
    const area = page.locator('.swipe-area');
    const box = await area.boundingBox();
    const o = { pointerType: 'touch', pointerId: 3, isPrimary: true, bubbles: true };
    await area.dispatchEvent('pointerdown', { ...o, clientX: box.x + box.width / 2, clientY: box.y + 150 });
    await area.dispatchEvent('pointerup', { ...o, clientX: box.x + box.width / 2 - 120, clientY: box.y + 155 });
    assert.equal(await page.locator('.qbar-pos strong').innerText(), '2');
    const omrHidden = !(await page.locator('#omr-panel').isVisible());
    if (omrHidden) await page.getByRole('button', { name: /^답안지/ }).click();
    await page.getByRole('button', { name: /^4번 문항/ }).click();
    assert.equal(await page.locator('.qbar-pos strong').innerText(), '4');
    await noHorizontalOverflow(page);
    await touchTargets(page);
    await shot(page, `${tag}-exam`);
    await page.getByRole('button', { name: '제출', exact: true }).click();
    assert.match(await page.getByRole('dialog').innerText(), /미응답 3문항/);
    await touchTargets(page);
    await page.getByRole('dialog').getByRole('button', { name: '제출', exact: true }).click();
    await page.getByText('채점 결과').waitFor();
  });

  await step('결과 → 틀린 문항 해설', async () => {
    await noHorizontalOverflow(page);
    await page.getByRole('button', { name: /틀린 문항 해설 \(3\)/ }).click();
    await page.locator('.exp').waitFor();
    assert.match(await page.locator('.verdict').innerText(), /오답/);
    await noHorizontalOverflow(page);
    await touchTargets(page);
    await shot(page, `${tag}-review`);
  });

  await step('오답노트 · 통계 · 설정 화면', async () => {
    await page.getByRole('button', { name: '‹ 결과' }).click();
    await page.getByRole('button', { name: '홈으로' }).click();
    for (const [open, ready] of [
      [/오답노트 · 오늘 복습/, '오늘 복습할 문항'],
      [/약점 단원/, '단원별 누적 정답률'],
      ['설정', '시험지 글자 크기'],
    ]) {
      await page.getByRole('button', { name: open }).click();
      await page.getByText(ready).first().waitFor();
      await noHorizontalOverflow(page);
      await touchTargets(page);
      await shot(page, `${tag}-${ready}`);
      await page.getByRole('button', { name: '홈으로' }).click();
    }
  });

  await step('콘솔 오류 없음', async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// 2) 오프라인, 연습 모드, 백업/복원
console.log('\n[기능]');
{
  const { ctx, page, errors } = await newPage(IPADS['iPad 세로']);
  await page.goto(URL_);

  await step('오프라인: 서비스워커 캐시로 새로고침해도 열림', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(1500);
    await ctx.setOffline(true);
    await page.reload();
    await seedStart(page, '실전 시작').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    await ctx.setOffline(false);
  });

  await step('연습 모드: 고르는 즉시 정답·해설, 답 잠금', async () => {
    await page.getByRole('button', { name: '설정' }).click();
    await page.getByRole('switch', { name: /해설 즉시 보기/ }).click();
    await page.getByRole('button', { name: '홈으로' }).click();
    await seedStart(page, '연습 시작').click();
    await page.getByRole('radio').nth(3).click();
    await page.getByText('정답입니다').waitFor();
    await page.locator('.exp').waitFor();
    assert.equal(await page.getByRole('radio').count(), 0);
    await submitAll(page);
    await page.getByRole('button', { name: '홈으로' }).click();
  });

  let backupPath;
  await step('백업 파일 만들기', async () => {
    await page.getByRole('button', { name: '설정' }).click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '백업 파일 만들기' }).click()]);
    assert.match(dl.suggestedFilename(), /^civil-exam-backup-\d{8}-\d{4}\.json$/);
    backupPath = `${root}e2e-shots-backup.json`;
    await dl.saveAs(backupPath);
    const data = JSON.parse(readFileSync(backupPath, 'utf8')).data;
    assert.equal(data.attempts.length, 1);
    assert.equal(data.settings[0].instantExplanation, true);
  });

  await step('복원: 다른 기록을 백업 시점으로 되돌림', async () => {
    await page.getByRole('switch', { name: /해설 즉시 보기/ }).click();
    await page.getByRole('button', { name: '홈으로' }).click();
    await seedStart(page, '실전 시작').click();
    await submitAll(page);
    await page.getByRole('button', { name: '홈으로' }).click();
    await page.locator('.recent-item').nth(1).waitFor();
    await page.getByRole('button', { name: '설정' }).click();
    await page.locator('input[type=file]').setInputFiles(backupPath);
    await Promise.all([page.waitForEvent('load'), page.getByRole('dialog').getByRole('button', { name: '복원' }).click()]);
    await page.locator('.recent-item').first().waitFor();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.recent-item').count(), 1);
    await seedStart(page, '연습 시작').waitFor();
  });

  await step('콘솔 오류 없음', async () => assert.deepEqual(errors, []));
  await ctx.close();
}

// 3) 실전 세트(총칙·물권 28문항)와 맞춤 모의고사(40문항)
console.log('\n[실전 세트 · 맞춤 모의고사]');
{
  const { ctx, page, errors } = await newPage(IPADS['iPad 가로']);
  await page.goto(URL_);
  await step('2026-001(총칙·물권 28문항): 답안지 28칸, 28분 타이머, 마지막 문항까지 이동', async () => {
    const card = page.locator('.set-card').filter({ hasText: '2026-001' });
    await card.getByRole('button', { name: '실전 시작' }).click();
    assert.equal(await page.locator('.omr-cell').count(), 28);
    assert.match(await page.locator('.timer').innerText(), /^(28:00|27:5\d)$/);
    await page.getByRole('button', { name: /^28번 문항/ }).click();
    assert.equal(await page.locator('.qbar-pos strong').innerText(), '28');
    await noHorizontalOverflow(page);
    await shot(page, '실전세트-마지막');
    await submitAll(page);
    assert.match(await page.locator('.score-card').innerText(), /0 \/ 28문항 정답/);
  });
  await step('오늘의 세트: 푼 세트 다음 세트 또는 다시 풀기 표시', async () => {
    await page.getByRole('button', { name: '홈으로' }).click();
    await page.locator('.card-today').waitFor();
    assert.match(await page.locator('.card-today').innerText(), /오늘의 세트/);
  });
  await step('맞춤 모의고사: 40문항을 단원 순서대로 구성, 기록에 이름 표시', async () => {
    await page.getByRole('button', { name: '맞춤 세트 만들기' }).click();
    await page.locator('.omr-cell').first().waitFor(); // 맞춤 세트는 기록을 읽은 뒤 만들어진다
    assert.equal(await page.locator('.omr-cell').count(), 40);
    await submitAll(page);
    assert.match(await page.locator('.topbar-sub').first().innerText(), /맞춤 모의고사/);
    await page.getByRole('button', { name: '홈으로' }).click();
    await page.locator('.recent-item', { hasText: '맞춤 모의고사' }).first().waitFor();
  });
  await step('콘솔 오류 없음', async () => assert.deepEqual(errors, []));
  await ctx.close();
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));
try {
  (await import('node:fs')).rmSync(`${root}e2e-shots-backup.json`, { force: true });
} catch {
  /* 무시 */
}
console.log(failures ? `\n${failures}개 실패` : '\n모두 통과');
process.exit(failures ? 1 : 0);
