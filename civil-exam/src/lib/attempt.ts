import type { MarkMap } from '../components/QuestionView';
import type { ChoiceNo, Question, Unit } from '../types';
import { examConfig } from './config';

/** 진행 중이거나 제출된 한 번의 응시 */
export type Attempt = {
  id: string;
  setId: string;
  /** exam: 실전(제한시간, 일괄 해설) / practice: 연습(시간제한 없음, 고르는 즉시 해설). 없으면 exam */
  mode?: 'exam' | 'practice';
  /** 맞춤 모의고사(setId가 mix-*)의 문항 id 목록. 고정 세트는 없음 */
  questionIds?: string[];
  startedAt: number;
  /** 종료 시각(epoch ms). 앱이 백그라운드에 있다 돌아와도 남은 시간이 정확하도록 절대 시각으로 둔다. 연습 모드는 0 */
  endsAt: number;
  /** 연습 모드는 0(제한 없음) */
  timeLimitSec: number;
  /** 문항 id → 고른 답 */
  answers: Record<string, ChoiceNo>;
  /** 별표(다시 볼 문항) 문항 id */
  flags: string[];
  /** 문항 id → 보기 옆 밑줄/X 표시 */
  marks: Record<string, MarkMap>;
  /** 문항 id → 그 문항을 보고 있던 누적 시간(초) */
  timeSpent: Record<string, number>;
  /** 마지막으로 보던 문항 index */
  current: number;
  submittedAt?: number;
  /** 시간 종료로 자동 제출됐는지 */
  timeUp?: boolean;
};

export function newAttempt(
  setId: string,
  limitSec: number,
  now = Date.now(),
  mode: Attempt['mode'] = 'exam',
  questionIds?: string[],
): Attempt {
  const practice = mode === 'practice';
  return {
    id: `${setId}-${now}`,
    setId,
    mode,
    ...(questionIds ? { questionIds } : {}),
    startedAt: now,
    endsAt: practice ? 0 : now + limitSec * 1000,
    timeLimitSec: practice ? 0 : limitSec,
    answers: {},
    flags: [],
    marks: {},
    timeSpent: {},
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

/** 지금 보고 있는 문항에 [since, now) 동안의 시간을 더한다 */
export function addTime(a: Attempt, questionId: string, since: number, now = Date.now()): Attempt {
  const sec = Math.max(0, (now - since) / 1000);
  if (sec < 0.05) return a;
  const prev = a.timeSpent?.[questionId] ?? 0;
  return { ...a, timeSpent: { ...a.timeSpent, [questionId]: Math.round((prev + sec) * 10) / 10 } };
}

export const isPractice = (a: Pick<Attempt, 'mode'>) => a.mode === 'practice';

/** 실제 풀이에 쓴 시간(초). 실전은 제한시간을 넘지 않는다 */
export function elapsedSec(a: Pick<Attempt, 'startedAt' | 'timeLimitSec'> & { submittedAt?: number }, now = Date.now()) {
  const raw = ((a.submittedAt ?? now) - a.startedAt) / 1000;
  return a.timeLimitSec ? Math.min(a.timeLimitSec, raw) : raw;
}
