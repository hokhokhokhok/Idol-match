// data/*.csv 검사: npm run check:data  (오류가 있으면 종료 코드 1)
import path from "node:path";
import { formatIssue, loadDatasetFromDir } from "../lib/dataset.ts";

const dir = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "..", "data"));
const { dataset, issues } = loadDatasetFromDir(dir);
for (const i of issues) console.log(formatIssue(i));
const errors = issues.filter((i) => i.level === "error").length;
console.log(
  `\n학원 ${dataset.academies.length} · 인물 ${dataset.people.length} · 경력 ${dataset.careerItems.length}건 로드` +
    ` / 오류 ${errors} · 경고 ${issues.length - errors}`,
);
process.exit(errors ? 1 : 0);
