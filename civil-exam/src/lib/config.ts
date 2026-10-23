import civilExam from '../../config/exam.json';
import civilBlueprint from '../../config/blueprint.json';
import lawExam from '../../config/law/exam.json';
import lawBlueprint from '../../config/law/blueprint.json';
import type { Category, Law, Subject, Unit } from '../types';

/** 문항 수·배점·시간은 두 과목이 같다 (40문항, 2.5점, 40분) */
export const examConfig = {
  pointsPerQuestion: civilExam.pointsPerQuestion,
  questionCount: civilExam.questionCount,
  defaultTimeLimitMinutes: civilExam.defaultTimeLimitMinutes,
};

/** 과락(과목별 40점 미만)·평균 합격 기준 */
export const passCut = lawExam.passCut;
export const passAverage = lawExam.passAverage;

/** 감관법 문항의 기준 법령일 기본값 */
export const lawAsOfDefault = lawExam.lawAsOf;

/** 약칭 → 정식 법률명 */
export const LAW_FULL_NAME = lawExam.laws as Record<Law, string>;

export type Blueprint = { total: number; jitter: number; weakUnitBonus: number; units: Record<string, { count: number }> };

export const blueprints: Record<Subject, Blueprint> = { 민법: civilBlueprint, 감관법: lawBlueprint };

export const UNITS: readonly Unit[] = ['총칙', '물권', '계약', '채권총론', '기타'];
export const LAWS = Object.keys(lawBlueprint.units) as Law[];

/** 과목별 분류 순서: 민법은 단원, 감관법은 법률(시험지 순서) */
export const CATEGORIES: Record<Subject, readonly Category[]> = { 민법: UNITS, 감관법: LAWS };
export const CATEGORY_NAME: Record<Subject, string> = { 민법: '단원', 감관법: '법률' };

/**
 * 세트 문항 수에 비례한 제한시간(초). 40문항이면 설정값 그대로,
 * 시드처럼 문항이 적은 세트는 같은 페이스(문항당 1분 기준)로 줄인다.
 */
export function timeLimitSec(questionCount: number, minutes = examConfig.defaultTimeLimitMinutes): number {
  const perQuestion = (minutes * 60) / examConfig.questionCount;
  return Math.max(60, Math.round(perQuestion * questionCount));
}
