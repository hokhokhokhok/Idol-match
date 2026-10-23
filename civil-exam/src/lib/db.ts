import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, GradeResult } from './attempt';
import type { SettingsRow } from './settings';
import type { CardState } from './cards';
import { onReview, onWrong, type Note } from './srs';
import type { Category, ChoiceNo, QuestionType, Subject } from '../types';

/** 제출된 응시 1회 */
export type AttemptRecord = Attempt & {
  subject: Subject;
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
  subject: Subject;
  questionId: string;
  /** 민법 단원 / 감관법 법률 */
  unit: Category;
  topic: string;
  type: QuestionType;
  chosen: ChoiceNo | null;
  correct: boolean;
  timeSec: number;
  answeredAt: number;
};

/** 진행 중 응시(최대 1개) */
type DraftRow = { id: 'current'; attempt: Attempt };

/** 오답노트에서 다시 푼 기록 (연속 학습일·복습 통계용) */
export type ReviewLog = { id?: number; questionId: string; correct: boolean; at: number };

/** 마이그레이션 직전 자동 백업 (설정 화면에서 내려받기) */
export type SnapshotRow = { id: string; createdAt: number; file: { app: 'civil-exam'; version: number; exportedAt: string; data: Record<string, unknown[]> } };

export const db = new Dexie('civil-exam') as Dexie & {
  attempts: EntityTable<AttemptRecord, 'id'>;
  results: EntityTable<ResultRow, 'id'>;
  drafts: EntityTable<DraftRow, 'id'>;
  notes: EntityTable<Note, 'questionId'>;
  reviews: EntityTable<ReviewLog, 'id'>;
  settings: EntityTable<SettingsRow, 'id'>;
  snapshots: EntityTable<SnapshotRow, 'id'>;
  cards: EntityTable<CardState, 'id'>;
};

db.version(1).stores({
  attempts: 'id, setId, submittedAt',
  results: 'id, attemptId, questionId, unit, type, answeredAt',
  drafts: 'id',
});

// v2: 오답노트(간격 반복) + 복습 기록. 기존 제출 기록의 오답으로 노트를 채운다.
db.version(2)
  .stores({
    notes: 'questionId, dueAt',
    reviews: '++id, questionId, at',
  })
  .upgrade(async (tx) => {
    const rows = (await tx.table<ResultRow>('results').toArray()).sort((a, b) => a.answeredAt - b.answeredAt);
    const notes = new Map<string, Note>();
    for (const r of rows) {
      if (!r.correct) notes.set(r.questionId, onWrong(notes.get(r.questionId), r, r.answeredAt));
    }
    await tx.table<Note>('notes').bulkPut([...notes.values()]);
  });

// v3: 설정(글자 크기·시험시간·연습 모드)을 백업에 함께 담기 위해 DB로
db.version(3).stores({ settings: 'id' });

// v4: 과목(민법/감관법) 구분. 바꾸기 전에 기존 기록 전체를 snapshots에 백업해 두고(데이터 유실 방지),
// 과목 필드가 없는 기존 기록은 모두 민법으로 표시한다. 숫자 암기 카드(cards) 추가.
export const PRE_SUBJECT_SNAPSHOT = 'before-v4-subject';
db.version(4)
  .stores({
    attempts: 'id, setId, submittedAt, subject',
    results: 'id, attemptId, questionId, unit, type, answeredAt, subject',
    notes: 'questionId, dueAt, subject',
    snapshots: 'id',
    cards: 'id, dueAt, questionId',
  })
  .upgrade(async (tx) => {
    const names = ['attempts', 'results', 'notes', 'reviews', 'drafts', 'settings'] as const;
    const data = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await tx.table(n).toArray()] as const)));
    const now = Date.now();
    if (Object.values(data).some((rows) => rows.length > 0)) {
      await tx.table<SnapshotRow>('snapshots').put({
        id: PRE_SUBJECT_SNAPSHOT,
        createdAt: now,
        file: { app: 'civil-exam', version: 1, exportedAt: new Date(now).toISOString(), data },
      });
    }
    const civil = (r: { subject?: Subject }) => {
      r.subject ??= '민법';
    };
    await tx.table('attempts').toCollection().modify(civil);
    await tx.table('results').toCollection().modify(civil);
    await tx.table('notes').toCollection().modify(civil);
    await tx.table<DraftRow>('drafts').toCollection().modify((d) => civil(d.attempt));
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

/** 제출 기록 저장 + 틀린 문항 오답노트 등록 + 진행 중 응시 삭제를 한 트랜잭션으로 */
export async function saveSubmission(record: AttemptRecord, rows: ResultRow[]) {
  await db.transaction('rw', [db.attempts, db.results, db.drafts, db.notes], async () => {
    await db.attempts.put(record);
    await db.results.bulkPut(rows);
    const wrong = rows.filter((r) => !r.correct);
    const prev = await db.notes.bulkGet(wrong.map((r) => r.questionId));
    await db.notes.bulkPut(wrong.map((r, i) => onWrong(prev[i], r, record.submittedAt)));
    await db.drafts.delete('current');
  });
}

/**
 * 다시 풀기(오답노트 복습·약점 복습) 결과 반영. 노트에 없던 문항을 틀리면 오답노트에 새로 넣는다.
 * base는 노트에 없던 문항일 때 노트를 만들 정보.
 */
export async function saveReview(questionId: string, correct: boolean, now = Date.now(), base?: Parameters<typeof onWrong>[1]) {
  await db.transaction('rw', db.notes, db.reviews, async () => {
    const n = await db.notes.get(questionId);
    if (n) await db.notes.put(onReview(n, correct, now));
    else if (!correct && base) await db.notes.put(onWrong(undefined, base, now));
    await db.reviews.add({ questionId, correct, at: now });
  });
}

export const updateNote = (questionId: string, changes: Partial<Pick<Note, 'starred' | 'memo'>>) =>
  db.notes.update(questionId, changes);
