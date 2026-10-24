import type { Blueprint } from './config';
import { categoryOf, type Category, type Question, type QuestionSet } from '../types';

export type { Blueprint };

type AttemptLike = { setId: string; submittedAt: number; mode?: 'exam' | 'practice' };

/**
 * 오늘의 세트: 아직 제출하지 않은 세트 중 id 순으로 첫 번째.
 * 모두 풀었으면 마지막으로 푼 지 가장 오래된 세트.
 */
export function pickTodaySet(sets: QuestionSet[], attempts: AttemptLike[]): QuestionSet | undefined {
  if (!sets.length) return undefined;
  const last = new Map<string, number>();
  for (const a of attempts) last.set(a.setId, Math.max(last.get(a.setId) ?? 0, a.submittedAt));
  return sets.find((s) => !last.has(s.id)) ?? [...sets].sort((a, b) => last.get(a.id)! - last.get(b.id)!)[0];
}

type History = Map<string, { seen: number; wrong: number }>;

type MixInput = {
  pool: Question[];
  blueprint: Blueprint;
  /** 가중치를 줄 약점 분류(정답률 낮은 순). 비어 있으면 가중치 없음 */
  weakUnits?: Category[];
  /** 문항 id → 지금까지 맞힌/틀린 기록 (없으면 아직 안 푼 문항) */
  history?: History;
  random?: () => number;
};

const shuffle = <T,>(xs: T[], rnd: () => number) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 분류(민법 단원 / 감관법 법률)별 문항 수: blueprint 기본값에서 각 분류 ±jitter 무작위 변동,
 * 약점 분류(가장 약한 1개)는 +weakUnitBonus. 합계는 total로 맞추고 풀에 있는 문항 수를 넘지 않는다.
 */
export function unitCounts(
  blueprint: Blueprint,
  available: Record<string, number>,
  weakUnits: string[] = [],
  rnd: () => number = Math.random,
): Record<string, number> {
  const units = Object.keys(blueprint.units);
  const c: Record<string, number> = {};
  for (const u of units) {
    const j = Math.round((rnd() * 2 - 1) * blueprint.jitter);
    c[u] = Math.max(0, blueprint.units[u].count + j);
  }
  const weak = weakUnits.find((u) => u in c);
  if (weak) c[weak] += blueprint.weakUnitBonus;

  const total = Math.min(blueprint.total, units.reduce((s, u) => s + (available[u] ?? 0), 0));
  const cap = (u: string) => available[u] ?? 0;
  for (const u of units) c[u] = Math.min(c[u], cap(u));
  // 합계를 total로: 남으면 약점 분류가 아닌 분류부터 빼고, 모자라면 여유 있는 분류에 더한다.
  // 되도록 기본값 ±jitter 안에서 고친다(감관법 1문항 법률이 0이 되거나 국토계획법만 크게 줄지 않게)
  const base = (u: string) => blueprint.units[u].count;
  let diff = units.reduce((s, u) => s + c[u], 0) - total;
  const order = (asc: boolean) => [...units].sort((a, b) => (a === weak ? 1 : b === weak ? -1 : 0) || (asc ? c[a] - c[b] : c[b] - c[a]));
  while (diff > 0) {
    const desc = order(false);
    const u =
      desc.find((x) => c[x] > 0 && x !== weak && c[x] > base(x) - blueprint.jitter) ??
      desc.find((x) => c[x] > 0 && x !== weak) ??
      desc.find((x) => c[x] > 0)!;
    c[u] -= 1;
    diff -= 1;
  }
  while (diff < 0) {
    const asc = order(true);
    const u = asc.find((x) => c[x] < cap(x) && c[x] < base(x) + blueprint.jitter) ?? asc.find((x) => c[x] < cap(x));
    if (!u) break;
    c[u] += 1;
    diff += 1;
  }
  return c;
}

const rankBy = (history: History) => (q: Question) => {
  const h = history.get(q.id);
  if (!h) return 0; // 안 푼 문항 우선
  return h.wrong > 0 ? 1 : 2; // 틀린 적 있는 문항, 그다음 맞힌 문항
};

/** 맞춤 모의고사 문항 id 목록: 분류별로 안 푼 문항 → 틀린 적 있는 문항 → 나머지 순으로 고른다 */
export function buildMix({ pool, blueprint, weakUnits = [], history = new Map(), random = Math.random }: MixInput): string[] {
  const byUnit: Record<string, Question[]> = {};
  for (const q of pool) (byUnit[categoryOf(q)] ??= []).push(q);
  const available = Object.fromEntries(Object.entries(byUnit).map(([u, qs]) => [u, qs.length]));
  const counts = unitCounts(blueprint, available, weakUnits, random);

  const rank = rankBy(history);
  const order = Object.keys(blueprint.units);
  return order.flatMap((u) => {
    const picked = shuffle(byUnit[u] ?? [], random)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, counts[u] ?? 0);
    // 시험지처럼 원래 세트·번호 순으로 정렬
    return picked.sort((a, b) => a.setId.localeCompare(b.setId) || a.number - b.number).map((q) => q.id);
  });
}

/**
 * 다시 풀기 묶음: 조건에 맞는 문항 중 ① 오늘 복습할 오답노트 문항 → ② 틀린 적 있는 문항
 * → ③ 안 푼 문항 → ④ 맞힌 문항 순으로 최대 n개.
 */
export function buildDrill(
  pool: Question[],
  pick: (q: Question) => boolean,
  opts: { dueIds?: Set<string>; history?: History; n?: number; random?: () => number } = {},
): string[] {
  const { dueIds = new Set(), history = new Map(), n = 10, random = Math.random } = opts;
  const order = (q: Question) => {
    if (dueIds.has(q.id)) return 0;
    const h = history.get(q.id);
    if (h && h.wrong > 0) return 1;
    return h ? 3 : 2;
  };
  return shuffle(pool.filter(pick), random)
    .sort((a, b) => order(a) - order(b))
    .slice(0, n)
    .map((q) => q.id);
}

/** 오늘의 추천 약점 복습: 약점 분류(감관법 법률·경제학 단원 등) 문항으로 buildDrill */
export const buildWeakDrill = (pool: Question[], category: Category, opts: Parameters<typeof buildDrill>[2] = {}) =>
  buildDrill(pool, (q) => categoryOf(q) === category, opts);

/* ---------- 오늘의 모의고사: 매일 새로 구성하는 5세트 ---------- */

export const DAILY_COUNT = 5;
export const DAILY_PREFIX = 'mix-daily-';

/** 문자열 → 32비트 시드 (FNV-1a) */
const hashSeed = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
/** 같은 시드면 같은 난수열 (mulberry32) */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 로컬 날짜 키 YYYY-MM-DD */
export const dateKey = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dailySetId = (date: string, k: number) => `${DAILY_PREFIX}${date}-${k + 1}`;
/** "mix-daily-2026-10-24-3" → { date: '2026-10-24', no: 3 } */
export function parseDailySetId(setId: string): { date: string; no: number } | null {
  const m = /^mix-daily-(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(setId);
  return m ? { date: m[1], no: Number(m[2]) } : null;
}

type DailyInput = {
  pool: Question[];
  blueprint: Blueprint;
  /** 날짜·과목 등으로 만든 시드: 같은 시드면 같은 세트 */
  seed: string;
  history?: History;
  /** 최근(어제 등) 오늘의 모의고사에 나온 문항: 되도록 뒤로 미룬다 */
  recent?: Set<string>;
  count?: number;
};

/**
 * 오늘의 모의고사 count개(기본 5): 세트마다 blueprint 배분(±jitter)으로 40문항.
 * 분류마다 ① 오늘 앞선 세트에 덜 나온 문항 ② 안 푼 문항 → 틀린 문항 → 맞힌 문항 ③ 최근 세트에 안 나온 문항 순으로 고른다.
 * 그래서 같은 날 5세트는 문항 풀을 고르게 돌아가며 쓰고, 날마다 다른 조합이 된다.
 */
export function buildDailySets({ pool, blueprint, seed, history = new Map(), recent = new Set(), count = DAILY_COUNT }: DailyInput): string[][] {
  const random = seededRandom(seed);
  const byUnit: Record<string, Question[]> = {};
  for (const q of pool) (byUnit[categoryOf(q)] ??= []).push(q);
  const available = Object.fromEntries(Object.entries(byUnit).map(([u, qs]) => [u, qs.length]));
  const rank = rankBy(history);
  const used = new Map<string, number>();
  const sets: string[][] = [];
  for (let k = 0; k < count; k++) {
    const counts = unitCounts(blueprint, available, [], random);
    const ids = Object.keys(blueprint.units).flatMap((u) => {
      const picked = shuffle(byUnit[u] ?? [], random)
        .sort(
          (a, b) =>
            (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) ||
            rank(a) - rank(b) ||
            Number(recent.has(a.id)) - Number(recent.has(b.id)),
        )
        .slice(0, counts[u] ?? 0);
      for (const q of picked) used.set(q.id, (used.get(q.id) ?? 0) + 1);
      return picked.sort((a, b) => a.setId.localeCompare(b.setId) || a.number - b.number).map((q) => q.id);
    });
    sets.push(ids);
  }
  return sets;
}
