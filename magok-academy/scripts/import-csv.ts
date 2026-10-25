// CSV 임포트: 구글시트·엑셀에서 내보낸 세 파일을 검사하고, 오류가 없을 때만 data/에 정규화해 씁니다.
//
//   npm run import -- <폴더>              검사만 (dry run)
//   npm run import -- <폴더> --write      오류 0건이면 data/*.csv를 교체
//   npm run import -- <폴더> --json out.json   검사 통과 데이터를 JSON으로도 저장 (Supabase 적재용)
//
// <폴더>에는 academies.csv, people.csv, career_items.csv가 있어야 합니다. 시트가 정본이므로 data/는 통째로 교체됩니다.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_FILES, formatIssue, loadDatasetFromDir } from "../lib/dataset.ts";
import { datasetToCsv } from "../lib/serialize.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const jsonOut = option("--json");
const from = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--json");

if (!from) {
  console.error("사용법: npm run import -- <CSV 폴더> [--write] [--json out.json]");
  process.exit(2);
}
const srcDir = path.resolve(from);
const missing = Object.values(DATA_FILES).filter((f) => !existsSync(path.join(srcDir, f)));
if (missing.length) {
  console.error(`${srcDir}에 파일이 없음: ${missing.join(", ")}`);
  process.exit(2);
}

const { dataset, issues } = loadDatasetFromDir(srcDir);
for (const i of issues) console.log(formatIssue(i));
const errors = issues.filter((i) => i.level === "error").length;
console.log(
  `\n학원 ${dataset.academies.length} · 인물 ${dataset.people.length} · 경력 ${dataset.careerItems.length}건` +
    ` / 오류 ${errors} · 경고 ${issues.length - errors}`,
);

if (errors) {
  console.log("오류가 있어 아무것도 쓰지 않았습니다. 원본을 고친 뒤 다시 실행하세요.");
  process.exit(1);
}

if (jsonOut) {
  writeFileSync(path.resolve(jsonOut), JSON.stringify({ exported_at: new Date().toISOString(), ...dataset }, null, 2) + "\n");
  console.log(`JSON 저장: ${path.resolve(jsonOut)}`);
}

if (flag("--write")) {
  const dataDir = path.join(import.meta.dirname, "..", "data");
  mkdirSync(dataDir, { recursive: true });
  const out = datasetToCsv(dataset);
  writeFileSync(path.join(dataDir, DATA_FILES.academies), out.academies);
  writeFileSync(path.join(dataDir, DATA_FILES.people), out.people);
  writeFileSync(path.join(dataDir, DATA_FILES.careerItems), out.careerItems);
  console.log(`data/ 교체 완료 → git diff로 바뀐 내용을 확인하세요.`);
} else {
  console.log("검사만 했습니다 (dry run). 반영하려면 --write");
}
