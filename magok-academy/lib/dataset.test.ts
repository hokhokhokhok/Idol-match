import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildDataset, loadDatasetFromDir } from "./dataset.ts";
import { createCsvRepository } from "./repository.ts";
import { ACADEMY_COLUMNS, CAREER_COLUMNS, PERSON_COLUMNS } from "./schema.ts";

const DATA_DIR = path.join(import.meta.dirname, "..", "data");
const TODAY = new Date("2026-10-24T00:00:00Z");

test("샘플 시드: 학원 5곳, 오류 없음, 모두 (예시)", () => {
  const { dataset, issues } = loadDatasetFromDir(DATA_DIR, { today: TODAY });
  assert.deepEqual(issues.filter((i) => i.level === "error"), []);
  assert.equal(dataset.academies.length, 5);
  for (const a of dataset.academies) assert.ok(a.name.startsWith("(예시)"), a.name);
  for (const p of dataset.people) assert.ok(p.name_public.startsWith("(예시)"), p.name_public);
  for (const c of dataset.careerItems) assert.ok(c.title.startsWith("(예시)"), c.title);
});

test("샘플 시드: 6개월 넘은 확인일은 경고", () => {
  const { issues } = loadDatasetFromDir(DATA_DIR, { today: TODAY });
  const stale = issues.filter((i) => i.field === "last_verified_at");
  assert.deepEqual(stale.map((i) => i.id), ["A005"]);
});

const H = { a: ACADEMY_COLUMNS.join(","), p: PERSON_COLUMNS.join(","), c: CAREER_COLUMNS.join(",") };
const academyRow = (id: string, name: string) => `${id},${name},보컬,초저,주소,,,,,,,,,,,,,,`;

test("참조 무결성·중복 id·이름+주소 중복", () => {
  const { dataset, issues } = buildDataset({
    academies: `${H.a}\n${academyRow("A1", "학원")}\n${academyRow("A1", "다른")}\n${academyRow("A2", "학 원")}\n`,
    people: `${H.p}\nP1,A9,강사,김,보컬,,공개,2026-10-01\nP2,A1,원장,이,보컬,,공개,2026-10-01\n`,
    careerItems: `${H.c}\nC1,P1,teaching,t,,,,https://x.com,SNS,2026-10-01,FALSE\nC2,P2,teaching,t,,,,https://x.com,SNS,2026-10-01,FALSE\n`,
  });
  assert.deepEqual(dataset.academies.map((a) => a.id), ["A1", "A2"]);
  assert.deepEqual(dataset.people.map((p) => p.id), ["P2"]);
  assert.deepEqual(dataset.careerItems.map((c) => c.id), ["C2"]);
  const msgs = issues.map((i) => `${i.id}:${i.message}`);
  assert.ok(msgs.some((m) => m.startsWith("A1:중복 id")));
  assert.ok(msgs.some((m) => m.startsWith("A2:이름·주소가 A1")));
  assert.ok(msgs.some((m) => m.startsWith("P1:없는 학원")));
  assert.ok(msgs.some((m) => m.startsWith("C1:없는")));
});

test("저장소: 상세는 원장 먼저, 경력은 최신순", async () => {
  const repo = createCsvRepository(loadDatasetFromDir(DATA_DIR, { today: TODAY }).dataset);
  const d = await repo.getAcademy("A005");
  assert.ok(d);
  assert.deepEqual(d.people.map((p) => p.role), ["원장", "강사"]);
  const d4 = await repo.getAcademy("A004");
  assert.deepEqual(d4?.people[0].careers.map((c) => c.year_from), [2019, 2017, 2012]);
  assert.equal(await repo.getAcademy("없음"), null);
});
