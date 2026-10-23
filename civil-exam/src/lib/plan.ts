import type { Question, QuestionSet, Unit } from '../types';

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

export type Blueprint = { total: number; jitter: number; weakUnitBonus: number; units: Record<string, { count: number }> };

type MixInput = {
  pool: Question[];
  blueprint: Blueprint;
  /** 가중치를 줄 약점 단원(정답률 낮은 순). 비어 있으면 가중치 없음 */
  weakUnits?: Unit[];
  /** 문항 id → 지금까지 맞힌/틀린 기록 (없으면 아직 안 푼 문항) */
  history?: Map<string, { seen: number; wrong: number }>;
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
 * 단원별 문항 수: blueprint 기본값에서 각 단원 ±jitter 무작위 변동,
 * 약점 단원(가장 약한 1개)은 +weakUnitBonus. 합계는 total로 맞추고 풀에 있는 문항 수를 넘지 않는다.
 */
export function unitCounts(
  blueprint: Blueprint,
  available: Record<string, number>,
  weakUnits: Unit[] = [],
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
  // 합계를 total로: 남으면 약점 단원이 아닌 단원부터 빼고, 모자라면 여유 있는 단원에 더한다
  let diff = units.reduce((s, u) => s + c[u], 0) - total;
  const order = (asc: boolean) => [...units].sort((a, b) => (a === weak ? 1 : b === weak ? -1 : 0) || (asc ? c[a] - c[b] : c[b] - c[a]));
  while (diff > 0) {
    const u = order(false).find((x) => c[x] > 0 && x !== weak) ?? order(false).find((x) => c[x] > 0)!;
    c[u] -= 1;
    diff -= 1;
  }
  while (diff < 0) {
    const u = order(true).find((x) => c[x] < cap(x));
    if (!u) break;
    c[u] += 1;
    diff += 1;
  }
  return c;
}

/** 맞춤 모의고사 문항 id 목록: 단원별로 안 푼 문항 → 틀린 적 있는 문항 → 나머지 순으로 고른다 */
export function buildMix({ pool, blueprint, weakUnits = [], history = new Map(), random = Math.random }: MixInput): string[] {
  const byUnit: Record<string, Question[]> = {};
  for (const q of pool) (byUnit[q.unit] ??= []).push(q);
  const available = Object.fromEntries(Object.entries(byUnit).map(([u, qs]) => [u, qs.length]));
  const counts = unitCounts(blueprint, available, weakUnits, random);

  const rank = (q: Question) => {
    const h = history.get(q.id);
    if (!h) return 0; // 안 푼 문항 우선
    return h.wrong > 0 ? 1 : 2; // 틀린 적 있는 문항, 그다음 맞힌 문항
  };
  const order = Object.keys(blueprint.units);
  return order.flatMap((u) => {
    const picked = shuffle(byUnit[u] ?? [], random)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, counts[u] ?? 0);
    // 시험지처럼 원래 세트·번호 순으로 정렬
    return picked.sort((a, b) => a.setId.localeCompare(b.setId) || a.number - b.number).map((q) => q.id);
  });
}
