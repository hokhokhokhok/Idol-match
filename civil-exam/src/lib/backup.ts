import { db, type AttemptRecord, type ResultRow, type ReviewLog } from './db';
import { normalizeSettings, type SettingsRow } from './settings';
import type { Note } from './srs';

export const BACKUP_APP = 'civil-exam';
export const BACKUP_VERSION = 1;

export type BackupData = {
  attempts: AttemptRecord[];
  results: ResultRow[];
  notes: Note[];
  reviews: ReviewLog[];
  drafts: unknown[];
  settings: SettingsRow[];
};
export type BackupFile = { app: typeof BACKUP_APP; version: number; exportedAt: string; data: BackupData };

export async function exportBackup(now = Date.now()): Promise<BackupFile> {
  const [attempts, results, notes, reviews, drafts, settings] = await Promise.all([
    db.attempts.toArray(),
    db.results.toArray(),
    db.notes.toArray(),
    db.reviews.toArray(),
    db.drafts.toArray(),
    db.settings.toArray(),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: { attempts, results, notes, reviews, drafts, settings },
  };
}

export const backupFileName = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `civil-exam-backup-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

/** 백업 파일 내용 검사. 문제가 있으면 사용자에게 보여 줄 메시지로 throw */
export function validateBackup(json: unknown): BackupFile {
  if (!isObj(json) || json.app !== BACKUP_APP || !isObj(json.data)) {
    throw new Error('이 앱의 백업 파일이 아닙니다.');
  }
  if (!num(json.version) || (json.version as number) > BACKUP_VERSION) {
    throw new Error('더 새로운 버전의 앱에서 만든 백업입니다. 앱을 업데이트한 뒤 복원하세요.');
  }
  const d = json.data;
  const list = (key: keyof BackupData, ok: (r: Record<string, unknown>) => boolean) => {
    const v = d[key] ?? [];
    if (!Array.isArray(v) || !v.every((r) => isObj(r) && ok(r))) throw new Error(`백업 파일이 손상되었습니다 (${key}).`);
    return v;
  };
  return {
    app: BACKUP_APP,
    version: json.version as number,
    exportedAt: String(json.exportedAt ?? ''),
    data: {
      attempts: list('attempts', (r) => str(r.id) && str(r.setId) && num(r.submittedAt) && isObj(r.answers)) as AttemptRecord[],
      results: list('results', (r) => str(r.id) && str(r.attemptId) && str(r.questionId) && typeof r.correct === 'boolean') as ResultRow[],
      notes: list('notes', (r) => str(r.questionId) && num(r.dueAt) && num(r.stage)) as Note[],
      reviews: list('reviews', (r) => str(r.questionId) && num(r.at)) as ReviewLog[],
      drafts: list('drafts', (r) => r.id === 'current' && isObj(r.attempt)),
      settings: (list('settings', (r) => r.id === 'app') as SettingsRow[]).map((s) => ({ ...normalizeSettings(s), id: 'app' as const })),
    },
  };
}

/** 현재 기기의 모든 기록을 백업 내용으로 바꾼다 (한 트랜잭션: 실패하면 그대로) */
export async function restoreBackup(file: BackupFile) {
  const d = file.data;
  await db.transaction('rw', [db.attempts, db.results, db.notes, db.reviews, db.drafts, db.settings], async () => {
    await Promise.all([db.attempts, db.results, db.notes, db.reviews, db.drafts, db.settings].map((t) => t.clear()));
    await db.attempts.bulkPut(d.attempts);
    await db.results.bulkPut(d.results);
    await db.notes.bulkPut(d.notes);
    await db.reviews.bulkPut(d.reviews);
    await db.drafts.bulkPut(d.drafts as never[]);
    await db.settings.bulkPut(d.settings);
  });
}

export function summarize(d: BackupData) {
  return { attempts: d.attempts.length, notes: d.notes.length, reviews: d.reviews.length };
}
