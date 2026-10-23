import { grade, type Attempt } from './attempt';
import type { AttemptRecord, ResultRow } from './db';
import { categoryOf, type Question } from '../types';

/** 제출된 응시를 채점해 저장용 기록과 문항별 행으로 만든다 */
export function buildSubmission(questions: Question[], a: Attempt, submittedAt = Date.now()) {
  const r = grade(questions, a.answers);
  const subject = a.subject ?? questions[0]?.subject ?? '민법';
  const record: AttemptRecord = {
    ...a,
    subject,
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
    subject: q.subject,
    questionId: q.id,
    unit: categoryOf(q),
    topic: q.topic,
    type: q.type,
    chosen,
    correct,
    timeSec: a.timeSpent?.[q.id] ?? 0,
    answeredAt: submittedAt,
  }));
  return { record, rows };
}
