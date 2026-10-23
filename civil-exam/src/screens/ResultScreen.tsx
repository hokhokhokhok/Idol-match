import { CIRCLED } from '../components/QuestionView';
import { elapsedSec, isPractice } from '../lib/attempt';
import type { AttemptRecord } from '../lib/db';
import { formatDuration } from '../lib/format';
import type { QuestionSet } from '../types';

type Props = {
  set: QuestionSet;
  record: AttemptRecord;
  /** 기기 저장에 실패했으면 알린다 */
  saveFailed?: boolean;
  onReview: (opts: { number?: number; wrongOnly?: boolean }) => void;
  onHome: () => void;
};

/** 채점 결과: 점수, 단원별 정답률, 문항별 O/X → 해설로 이동 */
export function ResultScreen({ set, record, saveFailed, onReview, onHome }: Props) {
  const elapsed = elapsedSec(record);
  const wrong = record.total - record.correct;

  return (
    <div className="result">
      <header className="topbar">
        <div className="topbar-title">
          <strong>채점 결과{isPractice(record) && <span className="mode-tag">연습</span>}</strong>
          <span className="topbar-sub">
            {set.title} · {new Date(record.submittedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        <button type="button" className="btn" onClick={onHome}>
          홈으로
        </button>
      </header>

      <main className="home-main">
        {record.timeUp && <p className="notice">시간이 종료되어 자동으로 제출되었습니다.</p>}
        {saveFailed && (
          <p className="notice notice-error">기기에 기록을 저장하지 못했습니다. 이 화면을 닫으면 결과가 사라집니다.</p>
        )}

        <section className="card score-card">
          <div className="score-big">
            <strong>{record.score100}</strong>
            <span>점</span>
          </div>
          <p className="muted">
            {record.correct} / {record.total}문항 정답 · {record.score} / {record.maxScore}점 · 풀이{' '}
            {formatDuration(elapsed)}
          </p>
          <div className="score-actions">
            <button type="button" className="btn btn-lg" onClick={() => onReview({})}>
              전체 해설
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={wrong === 0}
              onClick={() => onReview({ wrongOnly: true })}
            >
              틀린 문항 해설 ({wrong})
            </button>
          </div>
        </section>

        <h2 className="section-title">단원별 정답률</h2>
        <section className="card">
          <ul className="bars">
            {record.byUnit.map((u) => {
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

        <h2 className="section-title">문항별 (탭하면 해설)</h2>
        <section className="card">
          <ol className="ox-grid">
            {set.questions.map((q) => {
              const chosen = record.answers[q.id] ?? null;
              const correct = chosen === q.answer;
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    className={`ox-item ${correct ? 'is-o' : 'is-x'}`}
                    aria-label={`${q.number}번 ${correct ? '정답' : '오답'}, 내 답 ${chosen ?? '없음'}, 정답 ${q.answer}. 해설 보기`}
                    onClick={() => onReview({ number: q.number })}
                  >
                    <span className="ox-no">{q.number}</span>
                    <span className="ox-mark" aria-hidden>
                      {correct ? 'O' : 'X'}
                    </span>
                    <span className="ox-ans" aria-hidden>
                      {chosen ? CIRCLED[chosen - 1] : '—'} → {CIRCLED[q.answer - 1]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </main>
    </div>
  );
}
