// Capacitor용: 웹 파일만 www/로 복사한다(node_modules·네이티브 폴더가 앱에 섞이지 않게).
import { cp, rm, mkdir } from "node:fs/promises";
const FILES = ["index.html", "manifest.webmanifest", "sw.js", "js", "data", "icons"];
await rm("www", { recursive: true, force: true });
await mkdir("www");
for (const f of FILES) await cp(f, `www/${f}`, { recursive: true });
console.log("www/ ready:", FILES.join(", "));
