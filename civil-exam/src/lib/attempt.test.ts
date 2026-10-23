import { describe, expect, it } from 'vitest';
import seed from '../data/sets/seed-001.json';
import type { Question } from '../types';
import { grade, newAttempt, unanswered } from './attempt';
import { timeLimitSec } from './config';

const qs = seed as Question[];

describe('attempt', () => {
  it('grades answers and groups by unit', () => {
    const r = grade(qs, { [qs[0].id]: 4, [qs[1].id]: 2, [qs[2].id]: 4 });
    expect(r.correct).toBe(2);
    expect(r.total).toBe(4);
    expect(r.score).toBe(5);
    expect(r.maxScore).toBe(10);
    expect(r.score100).toBe(50);
    expect(r.items[3].chosen).toBeNull();
    expect(r.byUnit).toEqual([
      { unit: '총칙', total: 2, correct: 1 },
      { unit: '물권', total: 2, correct: 1 },
    ]);
  });

  it('lists unanswered questions', () => {
    const a = newAttempt('seed-001', 300, 0);
    a.answers[qs[0].id] = 1;
    expect(unanswered(qs, a).map((q) => q.number)).toEqual([2, 3, 4]);
    expect(a.endsAt).toBe(300_000);
  });

  it('scales time limit to set size', () => {
    expect(timeLimitSec(40, 40)).toBe(2400);
    expect(timeLimitSec(5, 40)).toBe(300);
    expect(timeLimitSec(40, 50)).toBe(3000);
  });
});
