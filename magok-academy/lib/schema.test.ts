import { test } from "node:test";
import assert from "node:assert/strict";
import { ACADEMY_COLUMNS, CAREER_COLUMNS, parseAcademies, parseCareerItems, parsePeople, parseScheduleSlots } from "./schema.ts";

// 사용자가 준 CSV 템플릿 예시 행 그대로
const ACADEMY_HEADER = ACADEMY_COLUMNS.join(",");
const ACADEMY_ROW =
  "A001,(예시)샘플뮤지컬학원,보컬;연기;뮤지컬종합,초저;초고,서울 강서구 마곡동 000-0,37.5600,126.8300,02-000-0000,https://example.com,https://instagram.com/example,https://map.naver.com/p/entry/place/0000000,월 15만원(주1회·문의 확인),화·목 16:00-18:00,소그룹 6명 이내,연 2회 정기 발표회,2018,가상의 예시 데이터입니다,2026-10-25,미확인";
const CAREER_HEADER = CAREER_COLUMNS.join(",");

test("템플릿 학원 행: 선택 컬럼 없이도 읽힘", () => {
  const { records, issues } = parseAcademies(`${ACADEMY_HEADER}\n${ACADEMY_ROW}\n`);
  assert.deepEqual(issues, []);
  const a = records[0];
  assert.deepEqual(a.categories, ["보컬", "연기", "뮤지컬종합"]);
  assert.deepEqual(a.target_grades, ["초저", "초고"]);
  assert.equal(a.lat, 37.56);
  assert.equal(a.opened_year, 2018);
  assert.equal(a.tuition_monthly_min, null);
  assert.deepEqual(a.schedule_slots, []);
});

test("빈 verification_status는 미확인", () => {
  const row = ACADEMY_ROW.replace(/,미확인$/, ",");
  assert.equal(parseAcademies(`${ACADEMY_HEADER}\n${row}`).records[0].verification_status, "미확인");
});

test("잘못된 분야는 오류 → 행 제외", () => {
  const row = ACADEMY_ROW.replace("보컬;연기;뮤지컬종합", "보컬;피아노");
  const { records, issues } = parseAcademies(`${ACADEMY_HEADER}\n${row}`);
  assert.equal(records.length, 0);
  assert.match(issues[0].message, /피아노/);
  assert.equal(issues[0].field, "categories");
});

test("필수 컬럼이 빠진 헤더는 전체 거부", () => {
  const { records, issues } = parseAcademies("id,name\nA1,x\n");
  assert.equal(records.length, 0);
  assert.match(issues[0].message, /헤더에 컬럼이 없음/);
});

test("수업 시간 슬롯 파싱", () => {
  assert.deepEqual(parseScheduleSlots("화 16:00-18:00;토 10:00-12:00").slots, [
    { day: "화", start: "16:00", end: "18:00" },
    { day: "토", start: "10:00", end: "12:00" },
  ]);
  assert.deepEqual(parseScheduleSlots("화요일 4시;수 18:00-17:00").invalid, ["화요일 4시", "수 18:00-17:00"]);
});

test("인물: 공개 근거가 없으면 게재하지 않음", () => {
  const csv = "id,academy_id,role,name_public,subjects,profile_source_url,disclosure_basis,collected_at\nP1,A1,강사,김,보컬,,,2026-10-25\n";
  const { records, issues } = parsePeople(csv);
  assert.equal(records.length, 0);
  assert.equal(issues[0].field, "disclosure_basis");
});

test("경력: 출처 URL 필수", () => {
  const { records, issues } = parseCareerItems(`${CAREER_HEADER}\nC1,P1,teaching,강사,기관,2020,,,SNS,2026-10-25,FALSE\n`);
  assert.equal(records.length, 0);
  assert.equal(issues[0].field, "source_url");
});

test("경력: verified는 뮤지컬 경력에만", () => {
  const { records, issues } = parseCareerItems(`${CAREER_HEADER}\nC1,P1,teaching,강사,기관,2020,,https://x.com,SNS,2026-10-25,TRUE\n`);
  assert.equal(records.length, 0);
  assert.equal(issues[0].field, "verified");
});

test("경력: 템플릿 예시 KOPIS 행", () => {
  const { records, issues } = parseCareerItems(
    `${CAREER_HEADER}\nC002,P001,musical_performance,(예시)작품명 앙상블 출연,(예시)제작사,2015,2015,https://www.kopis.or.kr/,KOPIS,2026-10-25,TRUE\n`,
  );
  assert.deepEqual(issues, []);
  assert.equal(records[0].verified, true);
  assert.equal(records[0].year_to, 2015);
});
