import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('v3 → v4 snapshots existing data before marking it 민법 (no data loss)', async () => {
  const v3 = new Dexie('civil-exam');
  v3.version(3).stores({
    attempts: 'id, setId, submittedAt',
    results: 'id, attemptId, questionId, unit, type, answeredAt',
    drafts: 'id',
    notes: 'questionId, dueAt',
    reviews: '++id, questionId, at',
    settings: 'id',
  });
  await v3.table('attempts').add({ id: 'a1', setId: '2026-001', submittedAt: 10, answers: { q: 1 }, score100: 50 });
  await v3.table('results').add({ id: 'a1:q', attemptId: 'a1', questionId: 'q', unit: '물권', type: 'single', correct: false, answeredAt: 10 });
  await v3.table('notes').add({ questionId: 'q', dueAt: 5, stage: 0, unit: '물권', memo: '메모' });
  await v3.table('drafts').add({ id: 'current', attempt: { id: 'd', setId: '2026-002', answers: {} } });
  await v3.table('settings').add({ id: 'app', fontSize: 19 });
  v3.close();

  const { db, PRE_SUBJECT_SNAPSHOT } = await import('./db');
  const snap = await db.snapshots.get(PRE_SUBJECT_SNAPSHOT);
  expect(snap?.file.app).toBe('civil-exam');
  expect(snap?.file.data.attempts).toHaveLength(1);
  expect(snap?.file.data.notes).toEqual([{ questionId: 'q', dueAt: 5, stage: 0, unit: '물권', memo: '메모' }]);
  expect((snap?.file.data.attempts[0] as { subject?: string }).subject).toBeUndefined();

  expect(await db.attempts.get('a1')).toMatchObject({ subject: '민법', score100: 50 });
  expect(await db.results.get('a1:q')).toMatchObject({ subject: '민법', unit: '물권' });
  expect(await db.notes.get('q')).toMatchObject({ subject: '민법', memo: '메모' });
  expect((await db.drafts.get('current'))?.attempt.subject).toBe('민법');
  expect(await db.settings.get('app')).toMatchObject({ fontSize: 19 });
  expect(await db.attempts.where('subject').equals('민법').count()).toBe(1);

  const { preMigrationBackups, validateBackup } = await import('./backup');
  const file = (await preMigrationBackups()).find((x) => x.id === PRE_SUBJECT_SNAPSHOT)!.file;
  expect(validateBackup(JSON.parse(JSON.stringify(file))).data.attempts[0].subject).toBe('민법');
});
