// app/icon.svg → PWA·iOS 홈 화면용 PNG 아이콘(public/icons). 로고를 바꾸면 다시 실행: npm run icons
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const svg = await readFile(new URL("../app/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
// [파일, 크기, 안쪽 여백 비율(maskable·iOS는 가장자리가 잘리므로 여백), 둥근 모서리 제거]
const targets = [
  ["icon-192.png", 192, 0, false],
  ["icon-512.png", 512, 0, false],
  ["maskable-512.png", 512, 0.1, true],
  ["apple-touch-icon.png", 180, 0.06, true],
];
for (const [name, size, pad, square] of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  const body = square ? svg.replace(/rx="\d+"/, 'rx="0"') : svg;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${square ? "#8b1e3f" : "transparent"}">
    <div style="width:${inner}px;height:${inner}px">${body.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: !square });
  console.log("✓", name);
}
await browser.close();
