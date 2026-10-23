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
 * 오늘의 추천 약점 복습: 약점 분류 문항 중 ① 오늘 복습할 오답노트 문항 → ② 틀린 적 있는 문항
 * → ③ 안 푼 문항 → ④ 맞힌 문항 순으로 최대 n개.
 */
export function buildWeakDrill(
  pool: Question[],
  category: Category,
  opts: { dueIds?: Set<string>; history?: History; n?: number; random?: () => number } = {},
): string[] {
  const { dueIds = new Set(), history = new Map(), n = 10, random = Math.random } = opts;
  const order = (q: Question) => {
    if (dueIds.has(q.id)) return 0;
    const h = history.get(q.id);
    if (h && h.wrong > 0) return 1;
    return h ? 3 : 2;
  };
  return shuffle(
    pool.filter((q) => categoryOf(q) === category),
    random,
  )
    .sort((a, b) => order(a) - order(b))
    .slice(0, n)
    .map((q) => q.id);
}
