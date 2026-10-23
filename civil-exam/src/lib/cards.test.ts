import { describe, expect, it } from 'vitest';
import lawSeed from '../data/sets/law-seed-001.json';
import civilSeed from '../data/sets/seed-001.json';
import type { Question } from '../types';
import { extractCards, newCardState, onCardAnswer, pickCards } from './cards';
import { dayStart } from './srs';

const law = lawSeed as Question[];

describe('number cards', () => {
  it('blanks the numbers in 감관법 explanations', () => {
    const cards = extractCards(law[1]);
    expect(cards.length).toBeGreaterThanOrEqual(5);
    const c = cards.find((x) => x.sentence.startsWith('일반상업지역은'))!;
    expect(c.front).toBe('일반상업지역은 ＿＿＿ 이하이다.');
    expect(c.answer).toBe('80퍼센트');
    expect(new Set(cards.map((x) => x.id)).size).toBe(cards.length);
    expect(extractCards((civilSeed as Question[])[0])).toEqual([]);
    expect(extractCards(law[3])).toEqual([]); // 지목 부호: 수치 없음
  });

  it('schedules 1·3·7·14·30 days and resets on a miss', () => {
    const now = new Date(2026, 9, 23, 9).getTime();
    const [card] = extractCards(law[1]);
    let s = onCardAnswer(newCardState(card, now), true, now);
    expect(s).toMatchObject({ stage: 1, dueAt: dayStart(now, 1), seen: 1 });
    s = onCardAnswer(s, true, now);
    expect(s.dueAt).toBe(dayStart(now, 3));
    s = onCardAnswer(s, false, now);
    expect(s).toMatchObject({ stage: 0, wrong: 1, dueAt: dayStart(now, 1) });
  });

  it('puts cards from wrong questions first and skips cards not yet due', () => {
    const now = 1_000_000;
    const cards = [...extractCards(law[1]), ...extractCards(law[0])];
    const other = { ...cards[0], id: 'x', questionId: 'other' };
    const all = [other, ...cards];
    const states = new Map([[cards[1].id, { ...newCardState(cards[1], now), dueAt: now + 1 }]]);
    const picked = pickCards(all, states, new Set([law[1].id]), now);
    expect(picked[0].questionId).toBe(law[1].id);
    expect(picked.at(-1)!.id).toBe('x');
    expect(picked.map((c) => c.id)).not.toContain(cards[1].id);
  });
});
