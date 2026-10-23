import type { Question, QuestionSet } from '../types';

const modules = import.meta.glob<Question[]>('../data/sets/*.json', { eager: true, import: 'default' });

/** src/data/sets/*.json 을 번들에 포함(오프라인)하고 세트 단위로 묶는다. */
export const questionSets: QuestionSet[] = Object.entries(modules)
  .map(([path, questions]) => {
    const id = path.split('/').pop()!.replace(/\.json$/, '');
    return { id, title: id, questions: [...questions].sort((a, b) => a.number - b.number) };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

/** 문항 id → 문항 (오답노트에서 사용) */
export const questionById = new Map(questionSets.flatMap((s) => s.questions.map((q) => [q.id, q] as const)));

/** 포맷 확인용 시드 세트(seed-*)는 오늘의 세트·맞춤 세트 문항 풀에서 뺀다 */
export const isSeedSet = (id: string) => id.startsWith('seed');

export const MIX_PREFIX = 'mix-';
export const MIX_TITLE = '맞춤 모의고사';

/**
 * 응시의 세트를 찾는다. 맞춤 세트(mix-*)는 파일이 없고 응시에 담긴 문항 id 목록으로 만든다.
 * 문항 id는 원래 세트의 것을 그대로 쓰므로 오답노트·통계가 같은 문항으로 이어진다. 번호만 1부터 다시 매긴다.
 */
export function resolveSet(a: { setId: string; questionIds?: string[] }): QuestionSet | undefined {
  const fixed = questionSets.find((s) => s.id === a.setId);
  if (fixed) return fixed;
  if (!a.setId.startsWith(MIX_PREFIX) || !a.questionIds?.length) return undefined;
  const questions = a.questionIds
    .map((id) => questionById.get(id))
    .filter((q): q is Question => !!q)
    .map((q, i) => ({ ...q, number: i + 1 }));
  return questions.length ? { id: a.setId, title: MIX_TITLE, questions } : undefined;
}
