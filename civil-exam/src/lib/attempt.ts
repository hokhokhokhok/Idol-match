import type { MarkMap } from '../components/QuestionView';
import type { ChoiceNo, Question, Unit } from '../types';
import { examConfig } from './config';

/** 진행 중이거나 제출된 한 번의 응시 */
export type Attempt = {
  id: string;
  setId: string;
  startedAt: number;
  /** 종료 시각(epoch ms). 앱이 백그라운드에 있다 돌아와도 남은 시간이 정확하도록 절대 시각으로 둔다 */
  endsAt: number;
  timeLimitSec: number;
  /** 문항 id → 고른 답 */
  answers: Record<string, ChoiceNo>;
  /** 별표(다시 볼 문항) 문항 id */
  flags: string[];
  /** 문항 id → 보기 옆 밑줄/X 표시 */
  marks: Record<string, MarkMap>;
  /** 마지막으로 보던 문항 index */
  current: number;
  submittedAt?: number;
  /** 시간 종료로 자동 제출됐는지 */
  timeUp?: boolean;
};

export function newAttempt(setId: string, limitSec: number, now = Date.now()): Attempt {
  return {
    id: `${setId}-${now}`,
    setId,
    startedAt: now,
    endsAt: now + limitSec * 1000,
    timeLimitSec: limitSec,
    answers: {},
    flags: [],
    marks: {},
    current: 0,
  };
}

export function unanswered(questions: Question[], a: Attempt): Question[] {
  return questions.filter((q) => a.answers[q.id] == null);
}

export type GradeResult = {
  total: number;
  correct: number;
  /** 문항당 배점 기준 점수 */
  score: number;
  maxScore: number;
  /** 100점 만점 환산 */
  score100: number;
  items: { question: Question; chosen: ChoiceNo | null; correct: boolean }[];
  byUnit: { unit: Unit; total: number; correct: number }[];
};

export function grade(questions: Question[], answers: Attempt['answers']): GradeResult {
  const items = questions.map((q) => {
    const chosen = answers[q.id] ?? null;
    return { question: q, chosen, correct: chosen === q.answer };
  });
  const correct = items.filter((i) => i.correct).length;
  const total = questions.length;
  const units = new Map<Unit, { unit: Unit; total: number; correct: number }>();
  for (const i of items) {
    const u = units.get(i.question.unit) ?? { unit: i.question.unit, total: 0, correct: 0 };
    u.total += 1;
    if (i.correct) u.correct += 1;
    units.set(i.question.unit, u);
  }
  const p = examConfig.pointsPerQuestion;
  return {
    total,
    correct,
    score: correct * p,
    maxScore: total * p,
    score100: total ? Math.round((correct / total) * 1000) / 10 : 0,
    items,
    byUnit: [...units.values()],
  };
}

// 진행 중 응시는 앱이 종료돼도 이어 풀 수 있게 기기에 임시 저장한다.
// (제출 기록의 IndexedDB 저장은 3단계에서 추가)
const DRAFT_KEY = 'ce:draft';

export function loadDraft(): Attempt | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Attempt) : null;
  } catch {
    return null;
  }
}

export function saveDraft(a: Attempt | null) {
  try {
    if (a) localStorage.setItem(DRAFT_KEY, JSON.stringify(a));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 저장 불가 환경(개인정보 보호 모드 등)에서는 메모리 상태로만 진행 */
  }
}
