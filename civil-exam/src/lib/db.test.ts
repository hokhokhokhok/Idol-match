import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import seed from '../data/sets/seed-001.json';
import type { Question } from '../types';
import { addTime, newAttempt } from './attempt';
import { db, loadDraft, saveDraft, saveReview, saveSubmission } from './db';
import { dayStart } from './srs';
import { buildSubmission } from './records';

const qs = seed as Question[];

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('db', () => {
  it('saves and restores the draft', async () => {
    const a = newAttempt('seed-001', 300, 1000);
    a.answers[qs[0].id] = 4;
    await saveDraft(a);
    expect(await loadDraft()).toEqual(a);
    await saveDraft(null);
    expect(await loadDraft()).toBeNull();
  });

  it('stores a submission atomically and clears the draft', async () => {
    let a = newAttempt('seed-001', 300, 0);
    a.answers[qs[0].id] = 4;
    a.answers[qs[1].id] = 3;
    a = addTime(a, qs[0].id, 0, 42_000);
    await saveDraft(a);

    const { record, rows } = buildSubmission(qs, a, 100_000);
    await saveSubmission(record, rows);

    expect(await loadDraft()).toBeNull();
    const saved = await db.attempts.get(a.id);
    expect(saved?.correct).toBe(1);
    expect(saved?.score100).toBe(25);
    const res = await db.results.where('attemptId').equals(a.id).toArray();
    expect(res).toHaveLength(4);
    const q1 = res.find((r) => r.questionId === qs[0].id)!;
    expect(q1).toMatchObject({ correct: true, chosen: 4, timeSec: 42, unit: '총칙' });
    expect(res.filter((r) => !r.correct).map((r) => r.chosen)).toEqual([3, null, null]);
  });

  it('adds wrong answers to the note and applies reviews', async () => {
    const a = newAttempt('seed-001', 300, 0);
    a.answers[qs[0].id] = 4;
    const now = new Date(2026, 9, 23, 20).getTime();
    const { record, rows } = buildSubmission(qs, a, now);
    await saveSubmission(record, rows);
    const notes = await db.notes.toArray();
    expect(notes.map((n) => n.questionId).sort()).toEqual(qs.slice(1).map((q) => q.id));
    expect(notes[0].dueAt).toBe(dayStart(now, 1));

    await db.notes.update(qs[1].id, { memo: '제131조' });
    await saveReview(qs[1].id, true, dayStart(now, 1) + 3600_000);
    const n = await db.notes.get(qs[1].id);
    expect(n).toMatchObject({ stage: 1, memo: '제131조', reviewCount: 1, dueAt: dayStart(now, 4) });
    expect(await db.reviews.count()).toBe(1);
  });
});
