import type { ChoiceMark, ChoiceNo, Question } from '../types';
import { RichText } from './RichText';

export const CIRCLED = ['①', '②', '③', '④', '⑤'] as const;

/** 보기(①~⑤)는 "c1"~"c5", <보기> 박스 항목은 "b:ㄱ" 형식의 키로 표시를 저장한다. */
export type MarkMap = Record<string, ChoiceMark>;

export const nextMark = (m: ChoiceMark | undefined): ChoiceMark =>
  m === 'underline' ? 'cross' : m === 'cross' ? 'none' : 'underline';

type Props = {
  question: Question;
  /** 내가 고른 답 */
  selected?: ChoiceNo | null;
  onSelect?: (choice: ChoiceNo) => void;
  marks?: MarkMap;
  onToggleMark?: (key: string) => void;
  /** 채점 후: 정답/오답 표시 */
  reveal?: boolean;
};

function MarkButton({ mark, label, onToggle }: { mark: ChoiceMark; label: string; onToggle?: () => void }) {
  if (!onToggle) return <span className="qv-mark-slot" aria-hidden />;
  const text = mark === 'underline' ? '밑줄' : mark === 'cross' ? '제외' : '표시 없음';
  return (
    <button
      type="button"
      className={`qv-mark qv-mark--${mark}`}
      onClick={onToggle}
      aria-label={`${label} 표시: ${text} (탭하여 변경)`}
    >
      <span aria-hidden>{mark === 'cross' ? '✕' : mark === 'underline' ? '＿' : '·'}</span>
    </button>
  );
}

export function QuestionView({ question: q, selected, onSelect, marks = {}, onToggleMark, reveal }: Props) {
  const paragraphs = q.stem.split(/\n{2,}/);

  return (
    <article className="qv" data-type={q.type} aria-labelledby={`${q.id}-stem`}>
      {!q.reviewed && (
        <span className="qv-badge" title="사용자 검수가 끝나지 않은 문항입니다">
          미검수
        </span>
      )}

      <div className="qv-stem" id={`${q.id}-stem`}>
        <span className="qv-no">{q.number}.</span>
        <div className="qv-stem-text">
          {paragraphs.map((p, i) => (
            <p key={i}>
              <RichText text={p} />
            </p>
          ))}
        </div>
      </div>

      {q.box && (
        <div className="qv-box" role="group" aria-label={q.box.title?.replace(/\s/g, '') ?? '보기'}>
          {q.box.title && <div className="qv-box-title">&lt;{q.box.title}&gt;</div>}
          <ul className="qv-box-items">
            {q.box.items.map((it) => {
              const key = `b:${it.label}`;
              const mark = marks[key] ?? 'none';
              return (
                <li key={it.label} className={`qv-row qv-mark-${mark}`}>
                  <MarkButton mark={mark} label={it.label} onToggle={onToggleMark && (() => onToggleMark(key))} />
                  <div className="qv-hang">
                    <span className="qv-hang-label">{it.label}.</span>
                    <span className="qv-hang-text">
                      <RichText text={it.text} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ol className="qv-choices" role={onSelect ? 'radiogroup' : undefined} aria-label="답 선택">
        {q.choices.map((c, i) => {
          const no = (i + 1) as ChoiceNo;
          const key = `c${no}`;
          const mark = marks[key] ?? 'none';
          const isSelected = selected === no;
          const state = reveal ? (no === q.answer ? 'correct' : isSelected ? 'wrong' : '') : '';
          const body = (
            <span className="qv-hang">
              <span className={`qv-hang-label qv-circled${isSelected ? ' is-selected' : ''}`}>{CIRCLED[i]}</span>
              <span className="qv-hang-text">
                <RichText text={c} />
              </span>
            </span>
          );
          return (
            <li key={no} className={`qv-row qv-mark-${mark}${state ? ` is-${state}` : ''}`}>
              <MarkButton mark={mark} label={`${no}번 보기`} onToggle={onToggleMark && (() => onToggleMark(key))} />
              {onSelect ? (
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`qv-choice${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelect(no)}
                >
                  {body}
                </button>
              ) : (
                <div className="qv-choice">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </article>
  );
}
