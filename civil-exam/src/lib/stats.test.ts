import { describe, expect, it } from 'vitest';
import type { ResultRow } from './db';
import { byType, byUnit, streakDays, weakUnits } from './stats';

const row = (unit: ResultRow['unit'], type: ResultRow['type'], correct: boolean, timeSec = 60): ResultRow => ({
  id: Math.random().toString(),
  attemptId: 'a',
  setId: 's',
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
