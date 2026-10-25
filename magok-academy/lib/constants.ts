// 브라우저·서버 공용 상수 (node:fs를 쓰는 dataset.ts와 분리)

/** last_verified_at이 이 개월 수를 넘으면 재확인 필요 */
export const REVERIFY_MONTHS = 6;

/** 비교 최대 학원 수 */
export const COMPARE_MAX = 3;

/** 정정·삭제 요청 창구. NEXT_PUBLIC_CORRECTION_URL로 바꿀 수 있고, 없으면 GitHub 이슈. */
export const CORRECTION_URL =
  process.env.NEXT_PUBLIC_CORRECTION_URL || "https://github.com/hokhokhokhok/Idol-match/issues/new";

/** 학원별 정정 요청 링크. GitHub 이슈면 제목을 미리 채운다. */
export function correctionLink(academy?: { id: string; name: string }): string {
  if (!academy || !CORRECTION_URL.includes("github.com") || !CORRECTION_URL.endsWith("/issues/new")) return CORRECTION_URL;
  const title = `[마곡학원 정정요청] ${academy.id} ${academy.name}`;
  const body = "정정·삭제를 원하는 항목과 내용을 적어 주세요.\n(학원 관계자라면 확인 가능한 연락처나 공식 채널을 함께 알려 주세요.)";
  return `${CORRECTION_URL}?${new URLSearchParams({ title, body, labels: "magok-academy" })}`;
}
