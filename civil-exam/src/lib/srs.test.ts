import { describe, expect, it } from 'vitest';
import { dayStart, dueLabel, isDue, onReview, onWrong } from './srs';

const base = { questionId: 'q1', setId: 's', unit: '총칙' as const, topic: 't' };
const T0 = new Date(2026, 9, 23, 21, 30).getTime(); // 10/23 21:30
const day = (d: number, h = 9) => new Date(2026, 9, d, h).getTime();

describe('spaced repetition 1·3·7', () => {
  it('wrong → due next day 00:00', () => {
    const n = onWrong(undefined, base, T0);
    expect(n.dueAt).toBe(dayStart(T0, 1));
    expect(isDue(n, day(23, 23))).toBe(false);
    expect(isDue(n, day(24, 0))).toBe(true);
    expect(dueLabel(n, T0)).toBe('내일');
  });

  it('correct reviews go 1 → 3 → 7 days then master', () => {
    let n = onWrong(undefined, base, T0);
    n = onReview(n, true, day(24));
    expect(n.stage).toBe(1);
    expect(n.dueAt).toBe(day(27, 0));
    n = onReview(n, true, day(27));
    expect(n.dueAt).toBe(new Date(2026, 10, 3).getTime());
    n = onReview(n, true, new Date(2026, 10, 3, 8).getTime());
    expect(n.mastered).toBe(true);
    expect(isDue(n, Infinity)).toBe(false);
    expect(n.reviewCount).toBe(3);
  });

  it('early correct keeps schedule, wrong resets to 1 day', () => {
    let n = onWrong(undefined, base, T0);
    n = onReview(n, true, day(24));
    const early = onReview(n, true, day(25));
    expect(early.stage).toBe(1);
    expect(early.dueAt).toBe(n.dueAt);
    const reset = onReview(n, false, day(25));
    expect(reset).toMatchObject({ stage: 0, dueAt: day(26, 0), wrongCount: 2, reviewCount: 2 });
  });

  it('wrong again in an exam keeps star and memo', () => {
    const n = { ...onWrong(undefined, base, T0), starred: true, memo: '선의 추정' };
    const again = onWrong(n, base, day(30));
    expect(again).toMatchObject({ starred: true, memo: '선의 추정', wrongCount: 2, addedAt: T0 });
  });
});
