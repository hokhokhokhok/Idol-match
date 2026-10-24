import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('v4 → v5(→ v6) snapshots 민법·감관법 data and leaves every record unchanged', async () => {
  const v4 = new Dexie('civil-exam');
  v4.version(4).stores({
    attempts: 'id, setId, submittedAt, subject',
    results: 'id, attemptId, questionId, unit, type, answeredAt, subject',
    drafts: 'id',
    notes: 'questionId, dueAt, subject',
    reviews: '++id, questionId, at',
    settings: 'id',
    snapshots: 'id',
    cards: 'id, dueAt, questionId',
  });
  const civil = { id: 'a1', setId: '2026-001', subject: '민법', submittedAt: 10, answers: {}, score100: 50 };
  const law = { id: 'a2', setId: 'law-2026-001', subject: '감관법', submittedAt: 20, answers: {}, score100: 60 };
  await v4.table('attempts').bulkAdd([civil, law]);
  await v4.table('notes').add({ questionId: 'law-2026-001-q01', subject: '감관법', dueAt: 1, stage: 0, unit: '국토계획법' });
  await v4.table('cards').add({ id: 'c1', questionId: 'law-2026-001-q02', stage: 2, dueAt: 9, seen: 3, wrong: 1, lastAt: 5 });
  await v4.table('snapshots').add({ id: 'before-v4-subject', createdAt: 1, file: { app: 'civil-exam', version: 1, exportedAt: '', data: {} } });
  v4.close();

  const { db, PRE_ECON_SNAPSHOT, PRE_REALESTATE_SNAPSHOT } = await import('./db');
  expect(await db.attempts.toArray()).toEqual([civil, law]);
  expect(await db.notes.get('law-2026-001-q01')).toMatchObject({ subject: '감관법', unit: '국토계획법' });
  expect(await db.cards.get('c1')).toMatchObject({ stage: 2 });
  const snap = await db.snapshots.get(PRE_ECON_SNAPSHOT);
  expect(snap?.file.data.attempts).toEqual([civil, law]);
  expect(snap?.file.data.cards).toHaveLength(1);
  expect(await db.snapshots.get('before-v4-subject')).toBeTruthy();

  const { preMigrationBackups, validateBackup } = await import('./backup');
  const list = await preMigrationBackups();
  expect(list.map((x) => x.id)).toEqual([PRE_REALESTATE_SNAPSHOT, PRE_ECON_SNAPSHOT, 'before-v4-subject']);
  expect(validateBackup(JSON.parse(JSON.stringify(list[1].file))).data.attempts.map((a) => a.subject)).toEqual(['민법', '감관법']);
});
