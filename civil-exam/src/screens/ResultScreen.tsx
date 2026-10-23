import { CIRCLED } from '../components/QuestionView';
import { grade, type Attempt } from '../lib/attempt';
import { formatDuration } from '../lib/format';
import type { QuestionSet } from '../types';

type Props = { set: QuestionSet; attempt: Attempt; onHome: () => void };

/** 채점 결과 요약. 보기별 해설·오답 필터·기록 저장은 3단계에서 이 화면을 확장한다. */
export function ResultScreen({ set, attempt, onHome }: Props) {
  const r = grade(set.questions, attempt.answers);
  const elapsed = Math.min(attempt.timeLimitSec, ((attempt.submittedAt ?? Date.now()) - attempt.startedAt) / 1000);

  return (
    <div className="result">
      <header className="topbar">
        <div className="topbar-title">
          <strong>채점 결과</strong>
          <span className="topbar-sub">{set.title}</span>
        </div>
        <button type="button" className="btn" onClick={onHome}>
          홈으로
        </button>
      </header>

      <main className="home-main">
        {attempt.timeUp && <p className="notice">시간이 종료되어 자동으로 제출되었습니다.</p>}

        <section className="card score-card">
          <div className="score-big">
            <strong>{r.score100}</strong>
            <span>점</span>
          </div>
          <p className="muted">
            {r.correct} / {r.total}문항 정답 · {r.score} / {r.maxScore}점 · 풀이 {formatDuration(elapsed)}
          </p>
        </section>

        <h2 className="section-title">단원별 정답률</h2>
        <section className="card">
          <ul className="bars">
            {r.byUnit.map((u) => {
              const pct = Math.round((u.correct / u.total) * 100);
              return (
                <li key={u.unit}>
                  <span className="bar-label">{u.unit}</span>
                  <span className="bar-track" role="img" aria-label={`${u.unit} 정답률 ${pct}%`}>
                    <span className="bar-fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="bar-value">
                    {u.correct}/{u.total}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <h2 className="section-title">문항별</h2>
        <section className="card">
          <ol className="ox-grid">
            {r.items.map(({ question: q, chosen, correct }) => (
              <li
                key={q.id}
                className={correct ? 'is-o' : 'is-x'}
                aria-label={`${q.number}번 ${correct ? '정답' : '오답'}, 내 답 ${chosen ?? '없음'}, 정답 ${q.answer}`}
              >
                <span className="ox-no">{q.number}</span>
                <span className="ox-mark" aria-hidden>
                  {correct ? 'O' : 'X'}
                </span>
                <span className="ox-ans" aria-hidden>
                  {chosen ? CIRCLED[chosen - 1] : '—'} → {CIRCLED[q.answer - 1]}
                </span>
              </li>
            ))}
          </ol>
          <p className="muted small">보기별 해설 화면은 다음 단계에서 추가됩니다.</p>
        </section>
      </main>
    </div>
  );
}
