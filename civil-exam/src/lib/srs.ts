import type { Category, Subject } from '../types';

/** 오답 후 재출제 간격(일): 틀리면 1일 뒤 → 맞히면 3일 뒤 → 맞히면 7일 뒤 → 맞히면 졸업 */
export const INTERVALS = [1, 3, 7] as const;

export type Note = {
  questionId: string;
  setId: string;
  /** 없으면 민법(과목 구분 이전 노트) */
  subject?: Subject;
  /** 민법 단원 / 감관법 법률 */
  unit: Category;
  topic: string;
  addedAt: number;
  lastWrongAt: number;
  wrongCount: number;
  /** INTERVALS의 index. 다음 복습이 몇 번째 간격인지 */
  stage: number;
  /** 이 시각(그날 0시)부터 복습 대상 */
  dueAt: number;
  mastered: boolean;
  starred: boolean;
  memo: string;
  reviewCount: number;
  lastReviewedAt?: number;
};

/** 로컬 자정 기준 n일 뒤 0시 (서머타임과 무관하게 달력 날짜로 계산) */
export function dayStart(t: number, addDays = 0): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + addDays);
  return d.getTime();
}

export const isDue = (n: Note, now = Date.now()) => !n.mastered && n.dueAt <= now;

type Base = Pick<Note, 'questionId' | 'setId' | 'unit' | 'topic' | 'subject'>;

/** 시험이나 복습에서 틀렸을 때: 처음부터(1일 뒤) 다시 */
export function onWrong(prev: Note | undefined, base: Base, now: number): Note {
  return {
    starred: false,
    memo: '',
    reviewCount: 0,
    addedAt: now,
    ...prev,
    questionId: base.questionId,
    setId: base.setId,
    unit: base.unit,
    topic: base.topic,
    subject: base.subject ?? prev?.subject ?? '민법',
    lastWrongAt: now,
    wrongCount: (prev?.wrongCount ?? 0) + 1,
    stage: 0,
    dueAt: dayStart(now, INTERVALS[0]),
    mastered: false,
  };
}

/** 오답노트에서 다시 풀었을 때. 아직 복습일이 아닌 문항을 맞혀도 일정은 그대로 둔다. */
export function onReview(n: Note, correct: boolean, now: number): Note {
  const reviewed = { ...n, reviewCount: n.reviewCount + 1, lastReviewedAt: now };
  if (!correct) return { ...onWrong(n, n, now), reviewCount: reviewed.reviewCount, lastReviewedAt: now };
  if (!isDue(n, now)) return reviewed;
  const stage = n.stage + 1;
  if (stage >= INTERVALS.length) return { ...reviewed, stage, mastered: true };
  return { ...reviewed, stage, dueAt: dayStart(now, INTERVALS[stage]) };
}

/** "오늘", "내일", "3일 후", "졸업" */
export function dueLabel(n: Note, now = Date.now()): string {
  if (n.mastered) return '졸업';
  const days = Math.round((n.dueAt - dayStart(now)) / 86_400_000);
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  return `${days}일 후`;
}
