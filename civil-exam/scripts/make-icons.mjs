// public/icons/icon.svg → PWA·홈 화면 아이콘 PNG 생성
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

for (const [name, size] of Object.entries(sizes)) {
  await sharp(`${dir}icon.svg`).resize(size, size).flatten({ background: '#1f2a44' }).png().toFile(dir + name);
  console.log('wrote', name);
}
