import { describe, expect, it } from 'vitest';
import blueprint from '../../config/blueprint.json';
import set1 from '../data/sets/2026-001.json';
import type { Question, QuestionSet } from '../types';
import { buildMix, pickTodaySet, unitCounts } from './plan';

const sets = ['2026-001', '2026-002', '2026-003'].map((id) => ({ id, title: id, questions: [] }) as QuestionSet);
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('today set', () => {
  it('first unsolved set, else the least recently solved', () => {
    expect(pickTodaySet(sets, [])?.id).toBe('2026-001');
    expect(pickTodaySet(sets, [{ setId: '2026-001', submittedAt: 5 }])?.id).toBe('2026-002');
    const all = [
      { setId: '2026-001', submittedAt: 30 },
      { setId: '2026-002', submittedAt: 10 },
      { setId: '2026-003', submittedAt: 20 },
      { setId: '2026-001', submittedAt: 1 },
    ];
    expect(pickTodaySet(sets, all)?.id).toBe('2026-002');
    expect(pickTodaySet([], all)).toBeUndefined();
  });
});

describe('mix', () => {
  const plenty = { 총칙: 50, 물권: 50, 계약: 50 };
  it('keeps the blueprint total with ±jitter and a weak-unit bonus', () => {
    for (let k = 0; k < 50; k++) {
      const c = unitCounts(blueprint, plenty, ['계약']);
      expect(c.총칙 + c.물권 + c.계약).toBe(40);
      for (const u of ['총칙', '물권'] as const) expect(Math.abs(c[u] - blueprint.units[u].count)).toBeLessThanOrEqual(4);
      expect(c.계약).toBeGreaterThanOrEqual(12);
    }
    expect(unitCounts(blueprint, plenty, [], () => 0.5)).toEqual({ 총칙: 14, 물권: 14, 계약: 12 });
    expect(unitCounts(blueprint, plenty, ['물권'], () => 0.5)).toEqual({ 총칙: 12, 물권: 16, 계약: 12 });
  });

  it('never exceeds what the pool has', () => {
    const c = unitCounts(blueprint, { 총칙: 14, 물권: 14, 계약: 12 }, ['계약'], seq(0.9, 0.1, 0.5));
    expect(c).toEqual({ 총칙: 14, 물권: 14, 계약: 12 });
  });

  it('prefers unseen, then wrong questions, ordered like an exam paper', () => {
    const pool = set1 as Question[];
    const history = new Map(pool.slice(0, 10).map((q, i) => [q.id, { seen: 1, wrong: i % 2 }]));
    const ids = buildMix({ pool, blueprint, history, random: () => 0.5 });
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
    const units = ids.map((id) => pool.find((q) => q.id === id)!.unit);
    expect(units.indexOf('물권')).toBeGreaterThan(units.lastIndexOf('총칙'));
    expect(units.indexOf('계약')).toBeGreaterThan(units.lastIndexOf('물권'));
  });
});
