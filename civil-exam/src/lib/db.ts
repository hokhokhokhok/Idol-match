import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, GradeResult } from './attempt';
import type { ChoiceNo, QuestionType, Unit } from '../types';

/** 제출된 응시 1회 */
export type AttemptRecord = Attempt & {
  submittedAt: number;
  total: number;
  correct: number;
  score: number;
  maxScore: number;
  score100: number;
  byUnit: GradeResult['byUnit'];
};

/** 응시×문항 1행. 오답노트·통계(4단계)의 원천 데이터 */
export type ResultRow = {
  id: string; // `${attemptId}:${questionId}`
  attemptId: string;
  setId: string;
  questionId: string;
  unit: Unit;
  topic: string;
  type: QuestionType;
  chosen: ChoiceNo | null;
  correct: boolean;
  timeSec: number;
  answeredAt: number;
};

/** 진행 중 응시(최대 1개) */
type DraftRow = { id: 'current'; attempt: Attempt };

export const db = new Dexie('civil-exam') as Dexie & {
  attempts: EntityTable<AttemptRecord, 'id'>;
  results: EntityTable<ResultRow, 'id'>;
  drafts: EntityTable<DraftRow, 'id'>;
};

db.version(1).stores({
  attempts: 'id, setId, submittedAt',
  results: 'id, attemptId, questionId, unit, type, answeredAt',
  drafts: 'id',
});

const LEGACY_DRAFT_KEY = 'ce:draft';

/** 진행 중 응시 불러오기. 2단계(localStorage)에 남은 임시 저장분은 옮겨 온다. */
export async function loadDraft(): Promise<Attempt | null> {
  try {
    const legacy = localStorage.getItem(LEGACY_DRAFT_KEY);
    if (legacy) {
      const a = JSON.parse(legacy) as Attempt;
      a.timeSpent ??= {};
      await db.drafts.put({ id: 'current', attempt: a });
      localStorage.removeItem(LEGACY_DRAFT_KEY);
    }
  } catch {
    /* localStorage 접근 불가 → 무시 */
  }
  const row = await db.drafts.get('current');
  return row?.attempt ?? null;
}

export function saveDraft(a: Attempt | null): Promise<unknown> {
  return a ? db.drafts.put({ id: 'current', attempt: a }) : db.drafts.delete('current');
}

/** 제출 기록 저장 + 진행 중 응시 삭제를 한 트랜잭션으로 */
export async function saveSubmission(record: AttemptRecord, rows: ResultRow[]) {
  await db.transaction('rw', db.attempts, db.results, db.drafts, async () => {
    await db.attempts.put(record);
    await db.results.bulkPut(rows);
    await db.drafts.delete('current');
  });
}
