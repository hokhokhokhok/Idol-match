import { describe, expect, it } from 'vitest';
import blueprint from '../../config/blueprint.json';
import lawBlueprint from '../../config/law/blueprint.json';
import lawSeed from '../data/sets/law-seed-001.json';
import set1 from '../data/sets/2026-001.json';
import set2 from '../data/sets/2026-002.json';
import set3 from '../data/sets/2026-003.json';
import set4 from '../data/sets/2026-004.json';
import { categoryOf, type Question, type QuestionSet } from '../types';
import { buildDailySets, buildMix, buildWeakDrill, dailySetId, dateKey, parseDailySetId, pickTodaySet, unitCounts } from './plan';

const sets = ['2026-001', '2026-002', '2026-003'].map((id) => ({ id, title: id, subject: '민법', questions: [] }) as QuestionSet);
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
    const units = ids.map((id) => categoryOf(pool.find((q) => q.id === id)!));
    expect(units.indexOf('물권')).toBeGreaterThan(units.lastIndexOf('총칙'));
    expect(units.indexOf('계약')).toBeGreaterThan(units.lastIndexOf('물권'));
  });
});

describe('감관법 mix and weak drill', () => {
  it('law blueprint sums to 40 with ±1 per law', () => {
    const plenty = Object.fromEntries(Object.keys(lawBlueprint.units).map((k) => [k, 30]));
    expect(Object.values(lawBlueprint.units).reduce((s, u) => s + u.count, 0)).toBe(40);
    for (let k = 0; k < 50; k++) {
      const c = unitCounts(lawBlueprint, plenty);
      expect(Object.values(c).reduce((s, n) => s + n, 0)).toBe(40);
      for (const [law, { count }] of Object.entries(lawBlueprint.units)) expect(Math.abs(c[law] - count)).toBeLessThanOrEqual(1);
      expect(c.동산채권담보법).toBeGreaterThanOrEqual(0);
    }
  });

  it('weak drill: due notes, then wrong, then unseen, then solved', () => {
    const pool = lawSeed as Question[];
    const gukto = pool.filter((q) => categoryOf(q) === '국토계획법').map((q) => q.id);
    expect(gukto).toHaveLength(2);
    const history = new Map([[gukto[0], { seen: 1, wrong: 0 }]]);
    expect(buildWeakDrill(pool, '국토계획법', { history, random: () => 0.3 })).toEqual([gukto[1], gukto[0]]);
    expect(buildWeakDrill(pool, '국토계획법', { history, dueIds: new Set([gukto[0]]), random: () => 0.3 })).toEqual([gukto[0], gukto[1]]);
    expect(buildWeakDrill(pool, '건축법', { n: 1 })).toHaveLength(1);
  });
});

describe('daily sets', () => {
  const pool = [set1, set2, set3, set4].flat() as unknown as Question[];
  it('같은 날 같은 구성, 날이 바뀌면 다른 구성; 세트마다 40문항·단원 배분 ±jitter', () => {
    const a = buildDailySets({ pool, blueprint, seed: '민법:2026-10-24' });
    expect(a).toEqual(buildDailySets({ pool, blueprint, seed: '민법:2026-10-24' }));
    expect(a).toHaveLength(5);
    expect(a).not.toEqual(buildDailySets({ pool, blueprint, seed: '민법:2026-10-25' }));
    const byId = new Map(pool.map((q) => [q.id, q]));
    for (const ids of a) {
      expect(ids).toHaveLength(40);
      expect(new Set(ids).size).toBe(40);
      for (const [u, { count }] of Object.entries(blueprint.units)) {
        const n = ids.filter((id) => categoryOf(byId.get(id)!) === u).length;
        expect(Math.abs(n - count)).toBeLessThanOrEqual(blueprint.jitter);
      }
    }
  });
  it('5세트가 문항 풀을 고르게 돌아가며 쓴다(160문항 → 각 문항 1~2회)', () => {
    const counts = new Map<string, number>();
    for (const id of buildDailySets({ pool, blueprint, seed: 'x' }).flat()) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.size).toBe(pool.length);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
  it('안 푼 문항을 맞힌 문항보다 먼저 고른다', () => {
    const history = new Map(pool.slice(0, 120).map((q) => [q.id, { seen: 1, wrong: 0 }]));
    const first = buildDailySets({ pool, blueprint, seed: 'y', history, count: 1 })[0];
    const unseen = first.filter((id) => !history.has(id)).length;
    expect(unseen).toBeGreaterThanOrEqual(30);
  });
  it('날짜 키와 세트 id', () => {
    expect(dailySetId('2026-10-24', 2)).toBe('mix-daily-2026-10-24-3');
    expect(parseDailySetId('mix-daily-2026-10-24-3')).toEqual({ date: '2026-10-24', no: 3 });
    expect(parseDailySetId('mix-123')).toBeNull();
    expect(dateKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});
