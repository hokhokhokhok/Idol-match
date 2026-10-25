// 세 CSV를 읽어 Dataset으로 만들고, 파일 사이의 관계(참조 무결성·중복·재확인 기한)를 검사한다.

import { readFileSync } from "node:fs";
import path from "node:path";
import { REVERIFY_MONTHS } from "./constants.ts";
import { isStale } from "./format.ts";
import { parseAcademies, parseCareerItems, parsePeople, type Issue } from "./schema.ts";
import type { Dataset } from "./types.ts";

export const DATA_FILES = {
  academies: "academies.csv",
  people: "people.csv",
  careerItems: "career_items.csv",
} as const;

export interface LoadResult {
  dataset: Dataset;
  issues: Issue[];
}

export function buildDataset(
  texts: { academies: string; people: string; careerItems: string },
  { today = new Date() }: { today?: Date } = {},
): LoadResult {
  const a = parseAcademies(texts.academies, DATA_FILES.academies);
  const p = parsePeople(texts.people, DATA_FILES.people);
  const c = parseCareerItems(texts.careerItems, DATA_FILES.careerItems);
  const issues: Issue[] = [...a.issues, ...p.issues, ...c.issues];

  const academies = dedupeById(a.records, DATA_FILES.academies, issues);
  const academyIds = new Set(academies.map((x) => x.id));

  // 같은 이름·주소 학원 중복
  const seen = new Map<string, string>();
  for (const ac of academies) {
    const key = `${normalize(ac.name)}|${normalize(ac.address ?? "")}`;
    const prev = seen.get(key);
    if (prev) {
      issues.push({ level: "warning", file: DATA_FILES.academies, line: 0, id: ac.id, message: `이름·주소가 ${prev}와 같음 — 중복 학원인지 확인` });
    } else seen.set(key, ac.id);
  }

  for (const ac of academies) {
    if (ac.last_verified_at && isStale(ac.last_verified_at, today)) {
      issues.push({ level: "warning", file: DATA_FILES.academies, line: 0, id: ac.id, field: "last_verified_at", message: `마지막 확인(${ac.last_verified_at})이 ${REVERIFY_MONTHS}개월을 넘음 — 재확인 필요` });
    }
  }

  const people = dedupeById(p.records, DATA_FILES.people, issues).filter((x) => {
    if (academyIds.has(x.academy_id)) return true;
    issues.push({ level: "error", file: DATA_FILES.people, line: 0, id: x.id, field: "academy_id", message: `없는 학원 id "${x.academy_id}"` });
    return false;
  });
  const personIds = new Set(people.map((x) => x.id));

  const careerItems = dedupeById(c.records, DATA_FILES.careerItems, issues).filter((x) => {
    if (personIds.has(x.person_id)) return true;
    issues.push({ level: "error", file: DATA_FILES.careerItems, line: 0, id: x.id, field: "person_id", message: `없는(또는 제외된) 인물 id "${x.person_id}"` });
    return false;
  });

  return { dataset: { academies, people, careerItems }, issues };
}

export function loadDatasetFromDir(dir: string, opts?: { today?: Date }): LoadResult {
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
  return buildDataset(
    {
      academies: read(DATA_FILES.academies),
      people: read(DATA_FILES.people),
      careerItems: read(DATA_FILES.careerItems),
    },
    opts,
  );
}

function dedupeById<T extends { id: string }>(records: T[], file: string, issues: Issue[]): T[] {
  const ids = new Set<string>();
  return records.filter((r) => {
    if (ids.has(r.id)) {
      issues.push({ level: "error", file, line: 0, id: r.id, field: "id", message: "중복 id — 뒤 행은 제외됨" });
      return false;
    }
    ids.add(r.id);
    return true;
  });
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export function formatIssue(i: Issue): string {
  const where = [i.file, i.line ? `${i.line}행` : null, i.id, i.field].filter(Boolean).join(" · ");
  return `${i.level === "error" ? "오류" : "경고"} [${where}] ${i.message}`;
}
