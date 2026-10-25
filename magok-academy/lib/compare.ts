import type { PersonWithCareer } from "./types.ts";

export interface CareerSummary {
  musical: number;
  /** 공연 DB로 교차 확인된 뮤지컬 경력 수 */
  musicalVerified: number;
  /** 가장 이른 학원 운영 시작 연도 (공개된 것 중) */
  operationSince: number | null;
  /** 뮤지컬 외 무대·방송 활동 (발레단, 댄서, 방송 출연 등) */
  stage: number;
  teaching: number;
  education: number;
  award: number;
}

export function summarizeCareers(p: PersonWithCareer): CareerSummary {
  const of = (t: string) => p.careers.filter((c) => c.type === t);
  const musical = of("musical_performance");
  const ops = of("academy_operation")
    .map((c) => c.year_from)
    .filter((y): y is number => y !== null);
  return {
    musical: musical.length,
    musicalVerified: musical.filter((c) => c.verified).length,
    operationSince: ops.length ? Math.min(...ops) : null,
    stage: of("stage").length,
    teaching: of("teaching").length,
    education: of("education").length,
    award: of("award").length,
  };
}

/** "뮤지컬 3건(공연 DB 확인 2) · 학원 운영 2014~ · 강의 1건" — 공개된 게 없으면 "공개 경력 없음" */
export function describeSummary(s: CareerSummary): string {
  const parts: string[] = [];
  if (s.musical) parts.push(`뮤지컬 ${s.musical}건(공연 DB 확인 ${s.musicalVerified})`);
  if (s.stage) parts.push(`공연·방송 ${s.stage}건`);
  if (s.operationSince !== null) parts.push(`학원 운영 ${s.operationSince}~`);
  if (s.teaching) parts.push(`강의 ${s.teaching}건`);
  if (s.education) parts.push(`학력 ${s.education}건`);
  if (s.award) parts.push(`수상 ${s.award}건`);
  return parts.length ? parts.join(" · ") : "공개 경력 없음";
}
