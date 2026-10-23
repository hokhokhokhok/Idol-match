import type { ChoiceNo, Question } from '../types';
import { CIRCLED } from './QuestionView';
import { RichText } from './RichText';

type Props = { question: Question; chosen: ChoiceNo | null };

/** 해설: 핵심 요약 → 보기별 해설(①~⑤) → 근거 조문 → 판례 취지 */
export function ExplanationView({ question: q, chosen }: Props) {
  const ex = q.explanation;
  return (
    <section className="exp" aria-label={`${q.number}번 해설`}>
      <p className="exp-summary">
        <span className="exp-key">핵심</span>
        <RichText text={ex.summary} />
      </p>

      <h3 className="exp-h">보기별 해설</h3>
      <ol className="exp-choices">
        {ex.perChoice.map((text, i) => {
          const no = (i + 1) as ChoiceNo;
          const isAnswer = no === q.answer;
          const isMine = no === chosen;
          return (
            <li
              key={no}
              className={`exp-choice${isAnswer ? ' is-answer' : ''}${isMine && !isAnswer ? ' is-mine-wrong' : ''}`}
            >
              <span className="exp-no">{CIRCLED[i]}</span>
              <div>
                {(isAnswer || isMine) && (
                  <span className="exp-tags">
                    {isAnswer && <span className="tag tag-answer">정답</span>}
                    {isMine && <span className={`tag ${isAnswer ? 'tag-mine-ok' : 'tag-mine'}`}>내 답</span>}
                  </span>
                )}
                <RichText text={text} />
              </div>
            </li>
          );
        })}
      </ol>

      {ex.statutes.length > 0 && (
        <>
          <h3 className="exp-h">근거 조문</h3>
          <ul className="exp-statutes">
            {ex.statutes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {ex.cases && ex.cases.length > 0 && (
        <>
          <h3 className="exp-h">판례</h3>
          <ul className="exp-cases">
            {ex.cases.map((c, i) => (
              <li key={i}>
                {!c.verified && (
                  <span className="tag tag-verify" title="대법원 종합법률정보에서 확인 후 verified: true로 바꾸세요">
                    판례 확인 필요
                  </span>
                )}
                <span>{c.gist}</span>
                {c.citation && <span className="exp-cite">{c.citation}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
