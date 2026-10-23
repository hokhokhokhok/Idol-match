// icons/icon.svg(단색) → PNG 192·512·180(apple-touch-icon). 저장소 루트에서: node jomun/scripts/make-icons.mjs
import sharp from "sharp";
import { readFile } from "node:fs/promises";

const dir = new URL("../icons/", import.meta.url);
const svg = await readFile(new URL("icon.svg", dir));
for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await sharp(svg).resize(size, size).png().toFile(new URL(file, dir).pathname);
  console.log("jomun/icons/" + file, size);
}
