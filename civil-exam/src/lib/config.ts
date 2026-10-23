import exam from '../../config/exam.json';

export const examConfig = {
  pointsPerQuestion: exam.pointsPerQuestion,
  questionCount: exam.questionCount,
  defaultTimeLimitMinutes: exam.defaultTimeLimitMinutes,
};

/**
 * 세트 문항 수에 비례한 제한시간(초). 40문항이면 설정값 그대로,
 * 시드처럼 문항이 적은 세트는 같은 페이스(문항당 1분 기준)로 줄인다.
 * 사용자 시험시간 설정은 5단계에서 연결한다.
 */
export function timeLimitSec(questionCount: number, minutes = examConfig.defaultTimeLimitMinutes): number {
  const perQuestion = (minutes * 60) / examConfig.questionCount;
  return Math.max(60, Math.round(perQuestion * questionCount));
}
