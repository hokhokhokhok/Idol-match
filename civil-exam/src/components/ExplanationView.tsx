import { useState } from 'react';
import { formatAsOf } from '../lib/law';
import type { ChoiceNo, CivilQuestion, LawQuestion, Question } from '../types';
import { LawTextDialog } from './LawTextDialog';
import { CIRCLED } from './QuestionView';
import { RichText } from './RichText';

type Props = { question: Question; chosen: ChoiceNo | null };

/** 해설: (감관법) 기준 법령·검수 배지 → 핵심 요약 → 보기별 해설(①~⑤) → 근거 조문 → (민법) 판례 취지 */
export function ExplanationView({ question: q, chosen }: Props) {
  const ex = q.explanation;
  return (
    <section className="exp" aria-label={`${q.number}번 해설`}>
      {q.subject === '감관법' && <LawBadges q={q} />}
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

      {q.subject === '감관법' ? <LegalBasisList q={q} /> : <CivilBasis q={q} />}
    </section>
  );
}

function LawBadges({ q }: { q: LawQuestion }) {
  return (
    <p className="exp-badges">
      <span className="tag tag-asof">기준 법령: {formatAsOf(q.lawAsOf)} 현행</span>
      {q.volatile && (
        <span className="tag tag-verify" title="수치·기간·비율은 법령 개정으로 바뀌기 쉽습니다. 시험 공고일 현행 법령으로 확인하세요">
          개정 확인 필요
        </span>
      )}
      {!q.reviewed && (
        <span className="tag tag-verify" title="국가법령정보센터 현행 조문과 대조한 뒤 reviewed: true로 바꾸세요">
          조문 확인 필요
        </span>
      )}
    </p>
  );
}

/** 감관법 근거 조문: 법/시행령/시행규칙 구분, 누르면 조문 원문 */
function LegalBasisList({ q }: { q: LawQuestion }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <h3 className="exp-h">근거 조문</h3>
      <ul className="exp-basis">
        {q.explanation.legalBasis.map((b) => (
          <li key={b.cite}>
            <button type="button" className="basis-btn" onClick={() => setOpen(b.cite)} aria-label={`${b.cite} 조문 원문 보기`}>
              <span className={`basis-inst basis-inst--${b.instrument}`}>{b.instrument}</span>
              <span className="basis-cite">{b.cite}</span>
              <span className="basis-more" aria-hidden>
                원문 ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      <LawTextDialog cite={open} onClose={() => setOpen(null)} />
    </>
  );
}

function CivilBasis({ q }: { q: CivilQuestion }) {
  const ex = q.explanation;
  return (
    <>
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
    </>
  );
}
