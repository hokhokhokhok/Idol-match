import { describe, expect, it } from 'vitest';
import type { ResultRow } from './db';
import { byCategory as byUnit, byType, recentTrend, streakDays, weakCategories as weakUnits } from './stats';

const row = (unit: ResultRow['unit'], type: ResultRow['type'], correct: boolean, timeSec = 60): ResultRow => ({
  id: Math.random().toString(),
  attemptId: 'a',
  setId: 's',
  subject: '민법',
  questionId: 'q',
  unit,
  topic: '',
  type,
  chosen: 1,
  correct,
  timeSec,
  answeredAt: 0,
});

describe('stats', () => {
  const rows = [
    row('물권', 'single', false, 90),
    row('물권', 'single', false, 30),
    row('물권', 'combo', true, 0),
    row('총칙', 'combo', true),
    row('총칙', 'case', false),
    row('총칙', 'single', true),
    row('계약', 'case', true),
  ];

  it('accuracy and avg time by unit in canonical order', () => {
    expect(byUnit(rows).map((u) => [u.key, u.correct, u.total, u.avgSec])).toEqual([
      ['총칙', 2, 3, 60],
      ['물권', 1, 3, 60],
      ['계약', 1, 1, 60],
    ]);
    expect(byType(rows).map((t) => t.key)).toEqual(['single', 'combo', 'case']);
  });

  it('weak units need enough samples', () => {
    expect(weakUnits(rows).map((u) => u.key)).toEqual(['물권', '총칙']);
  });

  it('streak counts back from today or yesterday', () => {
    const d = (day: number, h = 10) => new Date(2026, 9, day, h).getTime();
    expect(streakDays([d(21), d(22), d(23), d(23, 20)], d(23, 22))).toBe(3);
    expect(streakDays([d(21), d(22)], d(23, 8))).toBe(2);
    expect(streakDays([d(20), d(22)], d(23, 8))).toBe(1);
    expect(streakDays([d(20)], d(23))).toBe(0);
  });
});

describe('law stats', () => {
  const r = (attemptId: string, unit: ResultRow['unit'], correct: boolean): ResultRow => ({
    ...row(unit, 'single', correct),
    attemptId,
    subject: '감관법',
  });
  const rows = [
    r('a1', '국토계획법', false),
    r('a1', '국토계획법', true),
    r('a2', '국토계획법', true),
    r('a2', '건축법', false),
    r('a3', '건축법', false),
    r('a3', '건축법', true),
  ];
  const attempts = [
    { id: 'a1', submittedAt: 1 },
    { id: 'a2', submittedAt: 2 },
    { id: 'a3', submittedAt: 3 },
  ];
  it('orders laws like the exam paper and finds weak laws', () => {
    expect(byUnit(rows, '감관법').map((x) => x.key)).toEqual(['국토계획법', '건축법']);
    expect(weakUnits(rows, '감관법').map((x) => x.key)).toEqual(['건축법', '국토계획법']);
  });
  it('recent trend per law, oldest first, last n attempts', () => {
    const t = recentTrend(rows, attempts, 5);
    expect(t.get('국토계획법')!.map((c) => [c.attemptId, c.correct, c.total])).toEqual([
      ['a1', 1, 2],
      ['a2', 1, 1],
    ]);
    expect(recentTrend(rows, attempts, 1).get('건축법')!.map((c) => c.attemptId)).toEqual(['a3']);
  });
});
