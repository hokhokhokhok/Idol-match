import type { ResultRow } from './db';
import { dayStart } from './srs';
import type { QuestionType, Unit } from '../types';

export type Acc<K> = { key: K; total: number; correct: number; rate: number; avgSec: number };

function accBy<K extends string>(rows: ResultRow[], keyOf: (r: ResultRow) => K, order: readonly K[]): Acc<K>[] {
  const m = new Map<K, { total: number; correct: number; sec: number; timed: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    const a = m.get(k) ?? { total: 0, correct: 0, sec: 0, timed: 0 };
    a.total += 1;
    if (r.correct) a.correct += 1;
    if (r.timeSec > 0) {
      a.sec += r.timeSec;
      a.timed += 1;
    }
    m.set(k, a);
  }
  return order
    .filter((k) => m.has(k))
    .map((k) => {
      const a = m.get(k)!;
      return { key: k, total: a.total, correct: a.correct, rate: a.correct / a.total, avgSec: a.timed ? a.sec / a.timed : 0 };
    });
}

export const UNITS: readonly Unit[] = ['총칙', '물권', '기타'];
export const TYPES: readonly QuestionType[] = ['single', 'count', 'combo', 'case', 'precedent'];
export const TYPE_LABEL: Record<QuestionType, string> = {
  single: '단일 정답형',
  count: '개수형',
  combo: '조합형(ㄱㄴㄷㄹ)',
  case: '사례형',
  precedent: '판례형',
};

export const byUnit = (rows: ResultRow[]) => accBy(rows, (r) => r.unit, UNITS);
export const byType = (rows: ResultRow[]) => accBy(rows, (r) => r.type, TYPES);

/** 정답률 낮은 단원 순. 표본이 너무 적은 단원은 제외 */
export function weakUnits(rows: ResultRow[], n = 3, minCount = 3) {
  return byUnit(rows)
    .filter((u) => u.total >= minCount && u.rate < 1)
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, n);
}

/** 오늘(또는 어제)까지 하루도 빠짐없이 학습한 날 수 */
export function streakDays(activity: number[], now = Date.now()): number {
  const days = new Set(activity.map((t) => dayStart(t)));
  let d = dayStart(now);
  if (!days.has(d)) d = dayStart(now, -1); // 오늘 아직 안 했으면 어제부터 센다
  let n = 0;
  while (days.has(d)) {
    n += 1;
    d = dayStart(d, -1);
  }
  return n;
}
