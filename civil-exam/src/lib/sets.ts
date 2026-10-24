import { categoryOf, type Question, type QuestionSet, type Subject } from '../types';

const modules = import.meta.glob<Question[]>('../data/sets/*.json', { eager: true, import: 'default' });

/** 과목 필드가 없던 1차 민법 데이터 호환 */
const withSubject = (q: Question): Question => (q.subject ? q : { ...(q as object), subject: '민법' } as Question);

/** src/data/sets/*.json 을 번들에 포함(오프라인)하고 세트 단위로 묶는다. */
export const questionSets: QuestionSet[] = Object.entries(modules)
  .map(([path, questions]) => {
    const id = path.split('/').pop()!.replace(/\.json$/, '');
    const qs = questions.map(withSubject).sort((a, b) => a.number - b.number);
    return { id, title: id, subject: qs[0]?.subject ?? '민법', questions: qs };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

const bySubject = new Map<Subject, QuestionSet[]>();
/** 과목별 세트 (같은 배열을 돌려주므로 React 의존성 배열에 그대로 쓸 수 있다) */
export function setsOf(subject: Subject): QuestionSet[] {
  let sets = bySubject.get(subject);
  if (!sets) bySubject.set(subject, (sets = questionSets.filter((s) => s.subject === subject)));
  return sets;
}

/** 문항 id → 문항 (오답노트에서 사용) */
export const questionById = new Map(questionSets.flatMap((s) => s.questions.map((q) => [q.id, q] as const)));

/** 포맷 확인용 시드 세트(seed-*, law-seed-*)는 오늘의 세트·맞춤 세트 문항 풀에서 뺀다 */
export const isSeedSet = (id: string) => /(^|-)seed-/.test(id);

export const MIX_PREFIX = 'mix-';
export const MIX_TITLE = '맞춤 모의고사';

/** 맞춤 세트 이름: 오늘의 모의고사(mix-daily-YYYY-MM-DD-n)는 "오늘의 모의고사 n · 10.24" */
export function mixTitle(setId: string): string {
  const m = /^mix-daily-\d{4}-(\d{2})-(\d{2})-(\d+)$/.exec(setId);
  return m ? `오늘의 모의고사 ${m[3]} · ${Number(m[1])}.${Number(m[2])}` : MIX_TITLE;
}

/** 응시·기록·노트의 과목. 과목 필드가 없는 예전 기록은 민법 */
export const subjectOf = (a: { subject?: Subject }): Subject => a.subject ?? '민법';

/**
 * 응시의 세트를 찾는다. 맞춤 세트(mix-*)는 파일이 없고 응시에 담긴 문항 id 목록으로 만든다.
 * 문항 id는 원래 세트의 것을 그대로 쓰므로 오답노트·통계가 같은 문항으로 이어진다. 번호만 1부터 다시 매긴다.
 */
export function resolveSet(a: { setId: string; questionIds?: string[]; subject?: Subject }): QuestionSet | undefined {
  const fixed = questionSets.find((s) => s.id === a.setId);
  if (fixed) return fixed;
  if (!a.setId.startsWith(MIX_PREFIX) || !a.questionIds?.length) return undefined;
  const questions = a.questionIds
    .map((id) => questionById.get(id))
    .filter((q): q is Question => !!q)
    .map((q, i) => ({ ...q, number: i + 1 }));
  return questions.length ? { id: a.setId, title: mixTitle(a.setId), subject: a.subject ?? questions[0].subject, questions } : undefined;
}

export { categoryOf };
