import { REVERIFY_MONTHS } from "./constants.ts";
import type { Academy, CareerItem } from "./types.ts";

/** 150000 → "15만원", 125000 → "12.5만원", 9000 → "9,000원" */
export function formatWon(won: number): string {
  if (won >= 10_000) {
    const man = won / 10_000;
    return `${Number.isInteger(man) ? man : Number(man.toFixed(1))}만원`;
  }
  return `${won.toLocaleString("ko-KR")}원`;
}

/** 필터용 숫자 범위 표기. 정보가 없으면 null (화면에서 tuition_note 또는 "미확인") */
export function formatTuitionRange(a: Pick<Academy, "tuition_monthly_min" | "tuition_monthly_max">): string | null {
  const { tuition_monthly_min: min, tuition_monthly_max: max } = a;
  if (min === null) return null;
  if (max === null || max === min) return `월 ${formatWon(min)}`;
  return `월 ${formatWon(min).replace("원", "")}~${formatWon(max)}`;
}

/** 종료 연도가 비어 있으면 "진행 중/미상"을 추측하지 않고 "2018~"로만 쓴다. */
export function formatYears(c: Pick<CareerItem, "year_from" | "year_to">): string {
  const { year_from: from, year_to: to } = c;
  if (from === null && to === null) return "연도 미상";
  if (from === null) return `~${to}`;
  if (to === null) return `${from}~`;
  return from === to ? `${from}` : `${from}~${to}`;
}

/** 마지막 확인일이 REVERIFY_MONTHS개월을 넘었는지 */
export function isStale(lastVerified: string | null, today: Date = new Date()): boolean {
  if (!lastVerified) return true;
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - REVERIFY_MONTHS);
  return lastVerified < cutoff.toISOString().slice(0, 10);
}

/** 학원 이름이 "(예시)"로 시작하면 가상 샘플 */
export function isSample(name: string): boolean {
  return name.startsWith("(예시)");
}

/** 출처 URL을 사람이 읽는 이름으로: 알려진 사이트는 이름, 나머지는 도메인 */
export function sourceLabel(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
  const known: Record<string, string> = {
    "academy.prompie.com": "오늘학교 아카데미",
    "learns.academy": "런즈",
    "hakwonalimi.go.kr": "학원알리미",
    "map.naver.com": "네이버 플레이스",
    "kopis.or.kr": "KOPIS",
    "instagram.com": "인스타그램",
  };
  return known[host] ?? host;
}
