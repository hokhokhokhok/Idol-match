import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('v1 → v2 backfills the wrong-answer note from saved results', async () => {
  const v1 = new Dexie('civil-exam');
  v1.version(1).stores({ attempts: 'id, setId, submittedAt', results: 'id, attemptId, questionId, unit, type, answeredAt', drafts: 'id' });
  const row = (id: string, questionId: string, correct: boolean, answeredAt: number) => ({
    id, attemptId: 'a', setId: 's', questionId, unit: '물권', topic: 't', type: 'single', chosen: 1, correct, timeSec: 0, answeredAt,
  });
  await v1.table('results').bulkAdd([
    row('a1:q1', 'q1', false, 1000),
    row('a2:q1', 'q1', false, 2000),
    row('a1:q2', 'q2', true, 1000),
  ]);
  v1.close();

  const { db } = await import('./db');
  const notes = await db.notes.toArray();
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ questionId: 'q1', wrongCount: 2, addedAt: 1000, lastWrongAt: 2000, stage: 0 });
});
