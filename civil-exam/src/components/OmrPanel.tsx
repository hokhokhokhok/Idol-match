import type { Attempt } from '../lib/attempt';
import type { Question } from '../types';
import { CIRCLED } from './QuestionView';

type Props = {
  questions: Question[];
  attempt: Attempt;
  current: number;
  onJump: (index: number) => void;
};

/** 답안지: 번호 격자. 마킹한 문항은 칠하고 고른 번호를 보여 주며, 별표 문항은 ★ 표시 */
export function OmrPanel({ questions, attempt, current, onJump }: Props) {
  const answered = questions.filter((q) => attempt.answers[q.id] != null).length;
  return (
    <div className="omr">
      <div className="omr-head">
        <strong>답안지</strong>
        <span>
          {answered} / {questions.length}
        </span>
      </div>
      <ol className="omr-grid">
        {questions.map((q, i) => {
          const ans = attempt.answers[q.id];
          const flagged = attempt.flags.includes(q.id);
          return (
            <li key={q.id}>
              <button
                type="button"
                className={`omr-cell${ans ? ' is-answered' : ''}${i === current ? ' is-current' : ''}`}
                aria-current={i === current ? 'true' : undefined}
                aria-label={`${q.number}번 문항${ans ? `, ${ans}번 마킹` : ', 미응답'}${flagged ? ', 별표' : ''}`}
                onClick={() => onJump(i)}
              >
                <span className="omr-no">{q.number}</span>
                <span className="omr-ans" aria-hidden>
                  {ans ? CIRCLED[ans - 1] : ''}
                </span>
                {flagged && (
                  <span className="omr-flag" aria-hidden>
                    ★
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="omr-legend" aria-hidden>
        <span>
          <i className="lg lg-answered" /> 응답
        </span>
        <span>
          <i className="lg" /> 미응답
        </span>
        <span>★ 별표</span>
      </div>
    </div>
  );
}
