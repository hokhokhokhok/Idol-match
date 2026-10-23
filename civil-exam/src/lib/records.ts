import { grade, type Attempt } from './attempt';
import type { AttemptRecord, ResultRow } from './db';
import type { Question } from '../types';

/** 제출된 응시를 채점해 저장용 기록과 문항별 행으로 만든다 */
export function buildSubmission(questions: Question[], a: Attempt, submittedAt = Date.now()) {
  const r = grade(questions, a.answers);
  const record: AttemptRecord = {
    ...a,
    submittedAt,
    total: r.total,
    correct: r.correct,
    score: r.score,
    maxScore: r.maxScore,
    score100: r.score100,
    byUnit: r.byUnit,
  };
  const rows: ResultRow[] = r.items.map(({ question: q, chosen, correct }) => ({
    id: `${a.id}:${q.id}`,
    attemptId: a.id,
    setId: a.setId,
    questionId: q.id,
    unit: q.unit,
    topic: q.topic,
    type: q.type,
    chosen,
    correct,
    timeSec: a.timeSpent?.[q.id] ?? 0,
    answeredAt: submittedAt,
  }));
  return { record, rows };
}
