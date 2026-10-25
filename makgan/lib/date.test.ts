import { test } from "node:test";
import assert from "node:assert/strict";
import { deadlineLevel, formatDeadline, kstDateString, kstDayRange } from "./date.ts";

// 2026-11-03(화) 10:00 KST = 01:00 UTC
const now = new Date("2026-11-03T01:00:00Z");

test("KST 날짜: UTC 15시 이후는 다음날", () => {
  assert.equal(kstDateString("2026-11-03T14:59:59Z"), "2026-11-03");
  assert.equal(kstDateString("2026-11-03T15:00:00Z"), "2026-11-04");
});

test("오늘 범위는 KST 00:00~24:00", () => {
  const { start, end } = kstDayRange(now);
  assert.equal(start.toISOString(), "2026-11-02T15:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-03T15:00:00.000Z");
});

test("마감 표기", () => {
  assert.equal(formatDeadline("2026-11-03T09:00:00Z", now), "오늘 18:00 마감");
  assert.equal(formatDeadline("2026-11-03T14:59:00Z", now), "오늘 23:59 마감");
  assert.equal(formatDeadline("2026-11-04T03:00:00Z", now), "내일 마감");
  assert.equal(formatDeadline("2026-11-05T03:00:00Z", now), "11.05(목) 마감");
  assert.equal(formatDeadline("2026-11-03T00:59:00Z", now), "마감됨");
});

test("마감 배지 단계", () => {
  assert.equal(deadlineLevel("2026-11-03T00:00:00Z", now), "expired");
  assert.equal(deadlineLevel("2026-11-03T14:59:00Z", now), "today");
  assert.equal(deadlineLevel("2026-11-03T15:00:00Z", now), "soon"); // 내일 00:00 KST
  assert.equal(deadlineLevel("2026-11-06T14:59:00Z", now), "soon"); // 3일 뒤
  assert.equal(deadlineLevel("2026-11-06T15:00:00Z", now), "normal"); // 4일 뒤
});

test("공연 상태", async () => {
  const { showStatus } = await import("./date.ts");
  assert.equal(showStatus("2026-11-04", "2026-12-01", now), "upcoming");
  assert.equal(showStatus("2026-11-03", "2026-11-03", now), "running");
  assert.equal(showStatus("2026-10-01", "2026-11-02", now), "ended");
  // UTC로는 11-02지만 KST로는 11-03
  assert.equal(showStatus("2026-11-03", "2026-11-30", new Date("2026-11-02T15:30:00Z")), "running");
});

test("기간·날짜 표기", async () => {
  const { formatPeriod, formatDay } = await import("./date.ts");
  assert.equal(formatPeriod("2026-10-01", "2026-12-31"), "2026.10.01 ~ 12.31");
  assert.equal(formatPeriod("2026-11-01", "2027-02-28"), "2026.11.01 ~ 2027.02.28");
  assert.equal(formatDay("2026-11-05"), "11.05(목)");
});
