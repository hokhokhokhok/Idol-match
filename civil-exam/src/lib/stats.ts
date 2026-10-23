import { CATEGORIES } from './config';
import type { AttemptRecord, ResultRow } from './db';
import { dayStart } from './srs';
import type { Category, Pattern, QuestionType, Subject } from '../types';

export type Acc<K> = { key: K; total: number; correct: number; rate: number; avgSec: number };

type RowLike = Pick<ResultRow, 'correct' | 'timeSec'>;

export function accBy<R extends RowLike, K extends string>(rows: R[], keyOf: (r: R) => K | undefined, order: readonly K[]): Acc<K>[] {
  const m = new Map<K, { total: number; correct: number; sec: number; timed: number }>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k === undefined) continue;
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

export const TYPES: readonly QuestionType[] = ['single', 'count', 'combo', 'case', 'precedent', 'numeric', 'calc', 'concept', 'graph', 'table'];
export const TYPE_LABEL: Record<QuestionType, string> = {
  single: '단일 정답형',
  count: '개수형',
  combo: '조합형(ㄱㄴㄷㄹ)',
  case: '사례형',
  precedent: '판례형',
  numeric: '숫자·기간 비교형',
  calc: '계산형',
  concept: '개념형',
  graph: '그래프 해석형',
  table: '표·사례형',
};
export const PATTERNS: readonly Pattern[] = ['정의', '숫자·기간', '절차·순서', '예외·단서', '사례'];
export const PATTERN_LABEL: Record<Pattern, string> = {
  정의: '정의형',
  '숫자·기간': '숫자·기간형',
  '절차·순서': '절차·순서형',
  '예외·단서': '예외·단서형',
  사례: '사례형',
};

/** 분류(민법 단원 / 감관법 법률)별 정답률. subject를 주면 그 과목 순서로 */
export const byCategory = (rows: ResultRow[], subject: Subject = '민법') =>
  accBy(rows, (r) => r.unit as Category, CATEGORIES[subject]);
export const byType = (rows: ResultRow[]) => accBy(rows, (r) => r.type, TYPES);

/** 정답률 낮은 분류 순. 표본이 너무 적은 분류는 제외 */
export function weakCategories(rows: ResultRow[], subject: Subject = '민법', n = 3, minCount = 3) {
  return byCategory(rows, subject)
    .filter((u) => u.total >= minCount && u.rate < 1)
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, n);
}

export type TrendCell = { attemptId: string; at: number; correct: number; total: number };

/**
 * 분류별 최근 n회 추세: 그 분류 문항이 들어 있던 최근 실전 n회의 회차별 정답 수.
 * 반환 순서는 오래된 회차 → 최근.
 */
export function recentTrend(rows: ResultRow[], attempts: Pick<AttemptRecord, 'id' | 'submittedAt'>[], n = 5) {
  const at = new Map(attempts.map((a) => [a.id, a.submittedAt]));
  const out = new Map<string, Map<string, TrendCell>>();
  for (const r of rows) {
    const t = at.get(r.attemptId);
    if (t === undefined) continue;
    const per = out.get(r.unit) ?? new Map<string, TrendCell>();
    const c = per.get(r.attemptId) ?? { attemptId: r.attemptId, at: t, correct: 0, total: 0 };
    c.total += 1;
    if (r.correct) c.correct += 1;
    per.set(r.attemptId, c);
    out.set(r.unit, per);
  }
  return new Map([...out].map(([k, per]) => [k, [...per.values()].sort((a, b) => a.at - b.at).slice(-n)]));
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
