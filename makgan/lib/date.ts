// KST 날짜·마감 표기 (SPEC-2 A-5). KST는 서머타임이 없어 UTC+9 고정으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type DateInput = Date | string | number;

const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));
const pad = (n: number) => String(n).padStart(2, "0");

/** UTC 시각을 KST 벽시계 값으로 옮긴 Date. getUTC*로만 읽는다. */
function kstWall(d: DateInput) {
  return new Date(toDate(d).getTime() + KST_OFFSET_MS);
}

/** KST 기준 그날 0시의 일련번호(일 단위). 날짜 차이 계산용. */
function kstDayNumber(d: DateInput) {
  return Math.floor(kstWall(d).getTime() / DAY_MS);
}

/** KST 날짜 'YYYY-MM-DD' (DB date 컬럼과 비교용) */
export function kstDateString(d: DateInput = new Date()) {
  const w = kstWall(d);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

/** KST 오늘 00:00 ~ 다음날 00:00 (UTC 시각). "오늘 마감" 조회: ends_at >= start and ends_at < end */
export function kstDayRange(now: DateInput = new Date()) {
  const start = new Date(kstDayNumber(now) * DAY_MS - KST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export type DeadlineLevel = "expired" | "today" | "soon" | "normal";

/** 마감 배지 단계: 오늘 / 3일 이내 / 일반 (SPEC-2 A-1 BenefitCard) */
export function deadlineLevel(endsAt: DateInput, now: DateInput = new Date()): DeadlineLevel {
  if (toDate(endsAt).getTime() < toDate(now).getTime()) return "expired";
  const days = kstDayNumber(endsAt) - kstDayNumber(now);
  if (days === 0) return "today";
  if (days <= 3) return "soon";
  return "normal";
}

/** "오늘 18:00 마감" / "내일 마감" / "11.05(수) 마감" */
export function formatDeadline(endsAt: DateInput, now: DateInput = new Date()) {
  if (toDate(endsAt).getTime() < toDate(now).getTime()) return "마감됨";
  const w = kstWall(endsAt);
  const days = kstDayNumber(endsAt) - kstDayNumber(now);
  if (days === 0) return `오늘 ${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())} 마감`;
  if (days === 1) return "내일 마감";
  return `${pad(w.getUTCMonth() + 1)}.${pad(w.getUTCDate())}(${WEEKDAYS[w.getUTCDay()]}) 마감`;
}
