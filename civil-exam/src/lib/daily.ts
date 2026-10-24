import { blueprints } from './config';
import { buildDailySets, dateKey } from './plan';
import { isSeedSet, setsOf } from './sets';
import type { Subject } from '../types';

/** 기기에 저장하는 오늘의 모의고사 구성 (과목별 마지막 하루치) */
type Stored = { date: string; sets: string[][] };
const key = (subject: Subject) => `ce:daily:${subject}`;

function load(subject: Subject): Stored | null {
  try {
    const raw = localStorage.getItem(key(subject));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function save(subject: Subject, v: Stored) {
  try {
    localStorage.setItem(key(subject), JSON.stringify(v));
  } catch {
    /* 저장 불가(사파리 개인정보 보호 모드 등) → 날짜 시드로 다시 만든다 */
  }
}

/**
 * 오늘의 모의고사 5세트(문항 id 목록). 그날 처음 열 때 기록(안 푼·틀린 문항 우선)과 전날 세트를 반영해 만들고
 * 기기에 저장해 두므로, 하루 동안은 풀어도 구성이 바뀌지 않는다. 다음 날에는 새로 만든다.
 */
export function dailySets(subject: Subject, history: Map<string, { seen: number; wrong: number }>, now = Date.now()): string[][] {
  const date = dateKey(now);
  const stored = load(subject);
  if (stored?.date === date && stored.sets.length) return stored.sets;
  const pool = setsOf(subject)
    .filter((s) => !isSeedSet(s.id))
    .flatMap((s) => s.questions);
  if (pool.length < 40) return [];
  const recent = new Set((stored?.sets ?? []).flat());
  const sets = buildDailySets({ pool, blueprint: blueprints[subject], seed: `${subject}:${date}`, history, recent });
  save(subject, { date, sets });
  return sets;
}
