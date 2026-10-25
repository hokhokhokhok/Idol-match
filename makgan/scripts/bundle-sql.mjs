// supabase/migrations/*.sql → supabase/setup.sql (Supabase SQL Editor에 한 번에 붙여 넣기용)
//   npm run db:bundle          만들기
//   npm run db:bundle -- --check   최신인지 검사(CI)
import { readdir, readFile, writeFile } from "node:fs/promises";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
let out = "-- 막간 전체 스키마: supabase/migrations를 순서대로 이어 붙인 파일(직접 고치지 말고 npm run db:bundle)\n-- 새 Supabase 프로젝트의 SQL Editor에 통째로 붙여 넣고 실행하세요. 화면 확인용 데이터는 seed.sql.\n";
for (const f of files) out += `\n-- ===== ${f} =====\n${(await readFile(new URL(f, dir), "utf8")).trim()}\n`;

const target = new URL("../supabase/setup.sql", import.meta.url);
if (process.argv.includes("--check")) {
  const cur = await readFile(target, "utf8").catch(() => "");
  if (cur !== out) { console.error("supabase/setup.sql이 마이그레이션과 다릅니다. npm run db:bundle 을 실행하세요."); process.exit(1); }
  console.log("setup.sql 최신");
} else {
  await writeFile(target, out);
  console.log(`supabase/setup.sql ← ${files.join(", ")}`);
}
