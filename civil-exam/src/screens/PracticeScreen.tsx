import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { ExplanationView } from '../components/ExplanationView';
import { CIRCLED, QuestionView, nextMark, type MarkMap } from '../components/QuestionView';
import { db, saveReview } from '../lib/db';
import { questionById } from '../lib/sets';
import { dueLabel } from '../lib/srs';
import type { ChoiceNo } from '../types';

type Props = { questionIds: string[]; onDone: () => void };

/** 오답노트 다시 풀기: 한 문항씩 고르면 바로 채점·해설, 결과는 간격 반복 일정에 반영 */
export function PracticeScreen({ questionIds, onDone }: Props) {
  const [queue] = useState(() => questionIds.filter((id) => questionById.has(id)));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ChoiceNo>>({});
  const [marks, setMarks] = useState<Record<string, MarkMap>>({});
  const mainRef = useRef<HTMLElement>(null);
  const finished = idx >= queue.length;
  const notes = useLiveQuery(() => db.notes.bulkGet(queue), [queue]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [idx]);

  if (queue.length === 0) {
    return (
      <div className="result">
        <header className="topbar">
          <strong>다시 풀기</strong>
          <button type="button" className="btn" onClick={onDone}>
            오답노트
          </button>
        </header>
        <p className="app-empty">풀 문항이 없습니다.</p>
      </div>
    );
  }

  if (finished) {
    const correct = queue.filter((id) => answers[id] === questionById.get(id)!.answer).length;
    return (
      <div className="result">
        <header className="topbar">
          <div className="topbar-title">
            <strong>복습 완료</strong>
            <span className="topbar-sub">{queue.length}문항</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={onDone}>
            오답노트로
          </button>
        </header>
        <main className="home-main">
          <section className="card score-card">
            <div className="score-big">
              <strong>
                {correct}/{queue.length}
              </strong>
            </div>
            <p className="muted">맞힌 문항은 다음 간격(3일·7일)으로, 틀린 문항은 내일 다시 나옵니다.</p>
          </section>
          <h2 className="section-title">다음 복습</h2>
          <ul className="card plain-list">
            {queue.map((id, i) => {
              const q = questionById.get(id)!;
              const ok = answers[id] === q.answer;
              const n = notes?.[i];
              return (
                <li key={id}>
                  <span className={`ox-mark ${ok ? 'is-o' : 'is-x'}`}>{ok ? 'O' : 'X'}</span>
                  <span className="grow">
                    {q.unit} · {q.topic}
                  </span>
                  <span className="muted">{n ? dueLabel(n) : ''}</span>
                </li>
              );
            })}
          </ul>
        </main>
      </div>
    );
  }

  const id = queue[idx];
  const q = questionById.get(id)!;
  const chosen = answers[id] ?? null;
  const answered = chosen != null;

  const select = (c: ChoiceNo) => {
    if (answered) return;
    setAnswers((a) => ({ ...a, [id]: c }));
    saveReview(id, c === q.answer).catch((e) => console.error('review save failed', e));
  };

  return (
    <div className="exam">
      <header className="topbar exam-bar">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          ‹ 그만하기
        </button>
        <span className="muted">
          다시 풀기 {idx + 1} / {queue.length}
        </span>
        <span className="topbar-spacer" />
      </header>
      <div className="exam-body">
        <main className="exam-main" ref={mainRef}>
          <div className="paper-wrap">
            <div className="qbar">
              <span className="qbar-pos">
                {q.unit} · {q.topic}
              </span>
              {answered && (
                <span className={`verdict ${chosen === q.answer ? 'is-o' : 'is-x'}`}>
                  {chosen === q.answer ? '정답' : '오답'} · 정답 {CIRCLED[q.answer - 1]}
                </span>
              )}
            </div>
            <div className="sheet anim-jump" key={id}>
              <QuestionView
                question={{ ...q, number: idx + 1 }}
                selected={chosen}
                onSelect={answered ? undefined : select}
                marks={marks[id]}
                onToggleMark={(k) => setMarks((m) => ({ ...m, [id]: { ...m[id], [k]: nextMark(m[id]?.[k]) } }))}
                reveal={answered}
              />
            </div>
            {answered ? (
              <>
                <ExplanationView question={q} chosen={chosen} />
                <nav className="qnav">
                  <span />
                  <button type="button" className="btn btn-primary" onClick={() => setIdx(idx + 1)}>
                    {idx + 1 < queue.length ? '다음 문항 ›' : '결과 보기'}
                  </button>
                </nav>
              </>
            ) : (
              <p className="muted hint">보기를 고르면 바로 채점하고 해설을 보여 줍니다.</p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
