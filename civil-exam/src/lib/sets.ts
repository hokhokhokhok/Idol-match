import type { Question, QuestionSet } from '../types';

const modules = import.meta.glob<Question[]>('../data/sets/*.json', { eager: true, import: 'default' });

/** src/data/sets/*.json 을 번들에 포함(오프라인)하고 세트 단위로 묶는다. */
export const questionSets: QuestionSet[] = Object.entries(modules)
  .map(([path, questions]) => {
    const id = path.split('/').pop()!.replace(/\.json$/, '');
    return { id, title: id, questions: [...questions].sort((a, b) => a.number - b.number) };
  })
  .sort((a, b) => a.id.localeCompare(b.id));
