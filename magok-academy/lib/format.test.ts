import { test } from "node:test";
import assert from "node:assert/strict";
import { correctionLink } from "./constants.ts";
import { describeSummary, summarizeCareers } from "./compare.ts";
import { formatTuitionRange, formatWon, formatYears, isStale, sourceLabel } from "./format.ts";
import type { CareerItem, PersonWithCareer } from "./types.ts";

test("금액 표기", () => {
  assert.equal(formatWon(150000), "15만원");
  assert.equal(formatWon(125000), "12.5만원");
  assert.equal(formatWon(9000), "9,000원");
  assert.equal(formatTuitionRange({ tuition_monthly_min: 120000, tuition_monthly_max: 160000 }), "월 12만~16만원");
  assert.equal(formatTuitionRange({ tuition_monthly_min: 150000, tuition_monthly_max: 150000 }), "월 15만원");
  assert.equal(formatTuitionRange({ tuition_monthly_min: null, tuition_monthly_max: null }), null);
});

test("연도 표기는 추측하지 않음", () => {
  assert.equal(formatYears({ year_from: 2018, year_to: null }), "2018~");
  assert.equal(formatYears({ year_from: 2015, year_to: 2015 }), "2015");
  assert.equal(formatYears({ year_from: 2017, year_to: 2018 }), "2017~2018");
  assert.equal(formatYears({ year_from: null, year_to: null }), "연도 미상");
});

test("6개월 재확인", () => {
  const today = new Date("2026-10-24T00:00:00Z");
  assert.equal(isStale("2026-04-23", today), true);
  assert.equal(isStale("2026-04-25", today), false);
  assert.equal(isStale(null, today), true);
});

test("경력 요약", () => {
  const c = (type: CareerItem["type"], extra: Partial<CareerItem> = {}): CareerItem => ({
    id: "x", person_id: "P", type, title: "t", organization: null, year_from: null, year_to: null,
    source_url: "https://x", source_type: "홈페이지", collected_at: "2026-10-01", verified: false, ...extra,
  });
  const p = { careers: [c("musical_performance", { verified: true }), c("musical_performance"), c("academy_operation", { year_from: 2016 }), c("academy_operation", { year_from: 2014 }), c("teaching")] } as PersonWithCareer;
  assert.equal(describeSummary(summarizeCareers(p)), "뮤지컬 2건(공연 DB 확인 1) · 학원 운영 2014~ · 강의 1건");
  assert.equal(describeSummary(summarizeCareers({ careers: [] } as unknown as PersonWithCareer)), "공개 경력 없음");
});

test("정정 요청 링크에 학원 이름이 채워짐", () => {
  const url = new URL(correctionLink({ id: "A001", name: "(예시)샘플" }));
  assert.equal(url.searchParams.get("title"), "[마곡학원 정정요청] A001 (예시)샘플");
});

test("출처 이름", () => {
  assert.equal(sourceLabel("https://academy.prompie.com/academies/detail/x/"), "오늘학교 아카데미");
  assert.equal(sourceLabel("https://www.kopis.or.kr/"), "KOPIS");
  assert.equal(sourceLabel("https://blog.example.com/a"), "blog.example.com");
});
