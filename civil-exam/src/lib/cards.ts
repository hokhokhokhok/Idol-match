import { dayStart } from './srs';
import type { LawQuestion, Question } from '../types';

/**
 * 숫자·기간 암기 카드 (2차): 감관법 해설에서 수치(비율·기간·면적·금액 등)가 든 문장을 뽑아
 * 그 수치를 빈칸으로 만든 카드. 오답노트에 있는 문항의 카드부터 간격 반복으로 낸다.
 */
export type Card = {
  id: string;
  questionId: string;
  /** 빈칸(＿＿)이 들어간 문장 */
  front: string;
  /** 빈칸의 정답 수치 */
  answer: string;
  /** 원래 문장 */
  sentence: string;
};

/** 카드 학습 상태 (IndexedDB cards) */
export type CardState = {
  id: string;
  questionId: string;
  stage: number;
  dueAt: number;
  seen: number;
  wrong: number;
  lastAt: number;
};

/** 맞히면 1 → 3 → 7 → 14 → 30일 뒤, 틀리면 다음 날부터 다시 */
export const CARD_INTERVALS = [1, 3, 7, 14, 30] as const;

const UNIT = '(?:퍼센트|%|일|개월|년|시간|제곱미터|㎡|미터|층|명|인|배|만원|억원|원|세대|분의\\s*\\d+)';
const NUM_RE = new RegExp(`(?:100분의\\s*\\d+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?\\s*${UNIT})`, 'g');
const BLANK = '＿＿＿';

/** 문장 끝의 채점 표시(정답. / 옳다. / 틀렸다.)는 카드에서 뺀다 */
const clean = (s: string) =>
  s
    .replace(/\*\*|<\/?u>/g, '')
    .replace(/\s*(정답|옳다|틀렸다|틀린 설명이다|옳은 설명이다)\.?\s*$/, '')
    .trim();

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function extractCards(q: Question): Card[] {
  if (q.subject !== '감관법') return [];
  const lq = q as LawQuestion;
  const texts = [lq.explanation.summary, ...lq.explanation.perChoice];
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const t of texts) {
    for (const raw of t.split(/(?<=[.다])\s+/)) {
      const sentence = clean(raw);
      if (sentence.length < 8) continue;
      const nums = [...sentence.matchAll(NUM_RE)].slice(0, 2);
      for (const m of nums) {
        const answer = m[0].trim();
        const front = sentence.slice(0, m.index) + BLANK + sentence.slice(m.index! + m[0].length);
        const key = `${front}|${answer}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: `${q.id}:${hash(key)}`, questionId: q.id, front, answer, sentence });
      }
    }
  }
  return out;
}

export function newCardState(c: Card, now: number): CardState {
  return { id: c.id, questionId: c.questionId, stage: 0, dueAt: now, seen: 0, wrong: 0, lastAt: 0 };
}

export function onCardAnswer(s: CardState, known: boolean, now: number): CardState {
  const base = { ...s, seen: s.seen + 1, lastAt: now };
  if (!known) return { ...base, stage: 0, wrong: s.wrong + 1, dueAt: dayStart(now, 1) };
  const stage = Math.min(s.stage + 1, CARD_INTERVALS.length);
  return { ...base, stage, dueAt: dayStart(now, CARD_INTERVALS[stage - 1]) };
}

/**
 * 오늘 볼 카드: ① 오답노트 문항의 복습일이 된 카드 → ② 오답노트 문항의 새 카드
 * → ③ 나머지 복습일 카드 → ④ 나머지 새 카드. 최대 limit장.
 */
export function pickCards(
  cards: Card[],
  states: Map<string, CardState>,
  wrongQuestionIds: Set<string>,
  now: number,
  limit = 20,
): Card[] {
  const rank = (c: Card) => {
    const s = states.get(c.id);
    if (s && s.dueAt > now) return -1;
    const wrong = wrongQuestionIds.has(c.questionId);
    return (wrong ? 0 : 2) + (s ? 0 : 1);
  };
  return cards
    .map((c) => ({ c, r: rank(c), due: states.get(c.id)?.dueAt ?? 0 }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.due - b.due)
    .slice(0, limit)
    .map((x) => x.c);
}
