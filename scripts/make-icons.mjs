// 노란 원(#ffd23f) 위에 남색 별을 그린 아이콘을 SVG로 만들고 sharp로 PNG 3종을 뽑는다.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

function starPath(cx, cy, outer, inner, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

// 배경은 앱 무대색: iOS 홈 화면 아이콘은 투명을 검게 칠하므로 꽉 채운다.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0d0f1c"/>
  <circle cx="256" cy="256" r="212" fill="#ffd23f"/>
  <path d="${starPath(256, 266, 150, 62)}" fill="#1b2160" stroke="#1b2160" stroke-width="14" stroke-linejoin="round"/>
</svg>`;

await mkdir("icons", { recursive: true });
for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`icons/${file}`);
  console.log("icons/" + file, size);
}
