import { useEffect, useMemo, useRef, useState } from 'react';
import { ExplanationView } from '../components/ExplanationView';
import { CIRCLED, QuestionView } from '../components/QuestionView';
import { useSwipe } from '../hooks/useSwipe';
import type { AttemptRecord } from '../lib/db';
import type { QuestionSet } from '../types';

type Props = {
  set: QuestionSet;
  record: AttemptRecord;
  /** 처음 열 문항 번호 */
  startNumber?: number;
  wrongOnly?: boolean;
  onBack: () => void;
};

/** 해설 모드: 문항(정답·내 답 표시) + 보기별 해설. '틀린 문항만' 필터 */
export function ReviewScreen({ set, record, startNumber, wrongOnly: wrongOnlyInit = false, onBack }: Props) {
  const items = useMemo(
    () =>
      set.questions.map((q) => {
        const chosen = record.answers[q.id] ?? null;
        return { q, chosen, correct: chosen === q.answer };
      }),
    [set, record],
  );
  const wrongCount = items.filter((i) => !i.correct).length;

  const [wrongOnly, setWrongOnly] = useState(wrongOnlyInit && wrongCount > 0);
  const list = wrongOnly ? items.filter((i) => !i.correct) : items;
  const [number, setNumber] = useState(startNumber ?? list[0]?.q.number ?? 1);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // 필터를 바꿔 현재 문항이 목록에서 빠지면 가장 가까운 문항으로
  const pos = Math.max(0, list.findIndex((i) => i.q.number === number));
  const cur = list[pos];

  const goPos = (p: number) => {
    const t = list[Math.max(0, Math.min(list.length - 1, p))];
    if (t) setNumber(t.q.number);
    setNavOpen(false);
  };
  const swipe = useSwipe(
    () => goPos(pos + 1),
    () => goPos(pos - 1),
  );

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [cur?.q.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goPos(pos + 1);
      if (e.key === 'ArrowLeft') goPos(pos - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleFilter = () => {
    const next = !wrongOnly;
    setWrongOnly(next);
    if (next && cur?.correct) {
      const firstWrong = items.find((i) => !i.correct && i.q.number >= number) ?? items.find((i) => !i.correct);
      if (firstWrong) setNumber(firstWrong.q.number);
    }
  };

  return (
    <div className="exam review">
      <header className="topbar exam-bar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ‹ 결과
        </button>
        <button
          type="button"
          className={`chip${wrongOnly ? ' is-on' : ''}`}
          aria-pressed={wrongOnly}
          disabled={wrongCount === 0}
          onClick={toggleFilter}
        >
          틀린 문항만 ({wrongCount})
        </button>
        <button
          type="button"
          className="btn omr-toggle"
          aria-expanded={navOpen}
          aria-controls="review-nav"
          onClick={() => setNavOpen((o) => !o)}
        >
          문항 목록
        </button>
      </header>

      <div className="exam-body">
        <main className="exam-main" ref={mainRef}>
          {cur ? (
            <div className="paper-wrap">
              <div className="qbar">
                <span className="qbar-pos">
                  <strong>{cur.q.number}</strong> / {set.questions.length}
                  {wrongOnly && (
                    <span className="qbar-sub">
                      {' '}
                      · 오답 {pos + 1}/{list.length}
                    </span>
                  )}
                </span>
                <span className={`verdict ${cur.correct ? 'is-o' : 'is-x'}`}>
                  {cur.correct ? '정답' : '오답'} · 내 답 {cur.chosen ? CIRCLED[cur.chosen - 1] : '없음'} · 정답{' '}
                  {CIRCLED[cur.q.answer - 1]}
                </span>
              </div>
              <div className="swipe-area" key={cur.q.id} {...swipe}>
                <div className="sheet anim-jump">
                  <QuestionView
                    question={cur.q}
                    selected={cur.chosen}
                    marks={record.marks?.[cur.q.id]}
                    reveal
                  />
                </div>
                <ExplanationView question={cur.q} chosen={cur.chosen} />
              </div>
              <nav className="qnav" aria-label="문항 이동">
                <button type="button" className="btn" onClick={() => goPos(pos - 1)} disabled={pos === 0}>
                  ‹ 이전
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => goPos(pos + 1)}
                  disabled={pos === list.length - 1}
                >
                  다음 ›
                </button>
              </nav>
            </div>
          ) : (
            <p className="app-empty">표시할 문항이 없습니다.</p>
          )}
        </main>

        {navOpen && <div className="omr-backdrop" onClick={() => setNavOpen(false)} aria-hidden />}
        <aside id="review-nav" className={`omr-aside${navOpen ? ' is-open' : ''}`} aria-label="문항 목록">
          <div className="omr">
            <div className="omr-head">
              <strong>채점표</strong>
              <span>
                {record.correct} / {record.total}
              </span>
            </div>
            <ol className="omr-grid">
              {items.map((i) => {
                const hidden = wrongOnly && i.correct;
                return (
                  <li key={i.q.id}>
                    <button
                      type="button"
                      className={`omr-cell ox-cell ${i.correct ? 'is-o' : 'is-x'}${
                        cur && i.q.number === cur.q.number ? ' is-current' : ''
                      }`}
                      disabled={hidden}
                      aria-current={cur && i.q.number === cur.q.number ? 'true' : undefined}
                      aria-label={`${i.q.number}번 ${i.correct ? '정답' : '오답'}`}
                      onClick={() => {
                        setNumber(i.q.number);
                        setNavOpen(false);
                      }}
                    >
                      <span className="omr-no">{i.q.number}</span>
                      <span className="omr-ans" aria-hidden>
                        {i.correct ? 'O' : 'X'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
