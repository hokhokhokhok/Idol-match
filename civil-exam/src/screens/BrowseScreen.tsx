import { useEffect, useRef, useState } from 'react';
import { ExplanationView } from '../components/ExplanationView';
import { QuestionView } from '../components/QuestionView';
import { questionById } from '../lib/sets';

type Props = { questionIds: string[]; start?: number; onBack: () => void; backLabel?: string };

/** 문항 열람(읽기 전용): 정답·해설을 바로 보여 준다. 조문 검색 결과 확인용 */
export function BrowseScreen({ questionIds, start = 0, onBack, backLabel = '검색' }: Props) {
  const ids = questionIds.filter((id) => questionById.has(id));
  const [i, setI] = useState(Math.min(start, ids.length - 1));
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [i]);
  const q = questionById.get(ids[i]);

  return (
    <div className="exam review">
      <header className="topbar exam-bar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ‹ {backLabel}
        </button>
        <span className="muted">
          {i + 1} / {ids.length}
        </span>
        <span className="topbar-spacer" />
      </header>
      <div className="exam-body">
        <main className="exam-main" ref={mainRef}>
          {q ? (
            <div className="paper-wrap">
              <div className="qbar">
                <span className="qbar-pos">
                  {q.setId} {q.number}번
                </span>
              </div>
              <div className="sheet anim-jump" key={q.id}>
                <QuestionView question={q} selected={null} reveal />
              </div>
              <ExplanationView question={q} chosen={null} />
              <nav className="qnav" aria-label="문항 이동">
                <button type="button" className="btn" onClick={() => setI(i - 1)} disabled={i === 0}>
                  ‹ 이전
                </button>
                <button type="button" className="btn" onClick={() => setI(i + 1)} disabled={i >= ids.length - 1}>
                  다음 ›
                </button>
              </nav>
            </div>
          ) : (
            <p className="app-empty">표시할 문항이 없습니다.</p>
          )}
        </main>
      </div>
    </div>
  );
}
