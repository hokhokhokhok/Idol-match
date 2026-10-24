import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('v5 → v6 snapshots 민법·감관법·경제학원론 data and leaves every record unchanged', async () => {
  const v5 = new Dexie('civil-exam');
  v5.version(5).stores({
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
  const econ = { id: 'a3', setId: 'econ-2026-001', subject: '경제학원론', submittedAt: 30, answers: {}, score100: 70 };
  await v5.table('attempts').bulkAdd([civil, law, econ]);
  await v5.table('notes').add({ questionId: 'econ-2026-001-q01', subject: '경제학원론', dueAt: 1, stage: 0, unit: '소비자이론' });
  await v5.table('settings').put({ id: 'app', subject: '경제학원론', fontSize: 2 });
  await v5.table('snapshots').add({ id: 'before-v5-econ', createdAt: 1, file: { app: 'civil-exam', version: 2, exportedAt: '', data: {} } });
  v5.close();

  const { db, PRE_REALESTATE_SNAPSHOT } = await import('./db');
  expect(await db.attempts.toArray()).toEqual([civil, law, econ]);
  expect(await db.notes.get('econ-2026-001-q01')).toMatchObject({ subject: '경제학원론', unit: '소비자이론' });
  expect(await db.settings.get('app')).toMatchObject({ subject: '경제학원론', fontSize: 2 });
  const snap = await db.snapshots.get(PRE_REALESTATE_SNAPSHOT);
  expect(snap?.file.data.attempts).toEqual([civil, law, econ]);
  expect(snap?.file.data.notes).toHaveLength(1);
  expect(await db.snapshots.get('before-v5-econ')).toBeTruthy();
});
