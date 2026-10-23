import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import seed from '../data/sets/seed-001.json';
import type { Question } from '../types';
import { newAttempt } from './attempt';
import { exportBackup, restoreBackup, validateBackup } from './backup';
import { db, saveDraft, saveReview, saveSubmission } from './db';
import { buildSubmission } from './records';
import { loadSettings, saveSettings } from './settings';

const qs = seed as Question[];

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('backup', () => {
  it('round-trips every table through JSON', async () => {
    const a = newAttempt('seed-001', 300, 0);
    a.answers[qs[0].id] = 4;
    const { record, rows } = buildSubmission(qs, a, 1000);
    await saveSubmission(record, rows);
    await saveReview(qs[1].id, false, 2000);
    await db.notes.update(qs[2].id, { memo: '등기', starred: true });
    await saveDraft(newAttempt('seed-001', 300, 5000));
    await saveSettings({ fontSize: 19, timeLimitMinutes: 50, instantExplanation: true, weakUnitBoost: false });

    const json = JSON.parse(JSON.stringify(await exportBackup()));
    await Promise.all(db.tables.map((t) => t.clear()));
    await restoreBackup(validateBackup(json));

    expect(await db.attempts.count()).toBe(1);
    expect(await db.results.count()).toBe(5);
    expect(await db.reviews.count()).toBe(1);
    expect(await db.notes.get(qs[2].id)).toMatchObject({ memo: '등기', starred: true });
    expect((await db.drafts.get('current'))?.attempt.startedAt).toBe(5000);
    expect(await loadSettings()).toEqual({ fontSize: 19, timeLimitMinutes: 50, instantExplanation: true, weakUnitBoost: false });
  });

  it('restore replaces existing data', async () => {
    await saveReview('x', true, 1);
    await restoreBackup(validateBackup({ app: 'civil-exam', version: 1, data: {} }));
    expect(await db.reviews.count()).toBe(0);
  });

  it('rejects foreign or broken files with a readable message', () => {
    expect(() => validateBackup({ hello: 1 })).toThrow('이 앱의 백업 파일이 아닙니다.');
    expect(() => validateBackup({ app: 'civil-exam', version: 99, data: {} })).toThrow(/새로운 버전/);
    expect(() => validateBackup({ app: 'civil-exam', version: 1, data: { attempts: [{ id: 1 }] } })).toThrow(
      '백업 파일이 손상되었습니다 (attempts).',
    );
  });

  it('clamps out-of-range settings', () => {
    const f = validateBackup({
      app: 'civil-exam',
      version: 1,
      data: { settings: [{ id: 'app', fontSize: 30, timeLimitMinutes: 999, instantExplanation: 'yes' }] },
    });
    expect(f.data.settings[0]).toEqual({ id: 'app', fontSize: 17, timeLimitMinutes: 150, instantExplanation: true, weakUnitBoost: true });
  });
});
