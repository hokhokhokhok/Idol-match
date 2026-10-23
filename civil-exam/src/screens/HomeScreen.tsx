import { useLiveQuery } from 'dexie-react-hooks';
import { isPractice, type Attempt } from '../lib/attempt';
import { db } from '../lib/db';
import { isDue } from '../lib/srs';
import { streakDays, weakUnits } from '../lib/stats';
import { timeLimitSec } from '../lib/config';
import { formatClock } from '../lib/format';
import type { Settings } from '../lib/settings';
import type { QuestionSet } from '../types';

type Props = {
  sets: QuestionSet[];
  draft: Attempt | null;
  settings: Settings;
  onStart: (setId: string) => void;
  onResume: () => void;
  onOpenRecord: (attemptId: string) => void;
  onNotes: () => void;
  onStats: () => void;
  onSettings: () => void;
};

/** 홈: 이어 풀기, 연속 학습일·오늘 복습·약점 단원, 최근 기록, 세트 목록 */
export function HomeScreen({ sets, draft, settings, onStart, onResume, onOpenRecord, onNotes, onStats, onSettings }: Props) {
  const practice = settings.instantExplanation;
  const draftSet = draft && sets.find((s) => s.id === draft.setId);
  const recent = useLiveQuery(() => db.attempts.orderBy('submittedAt').reverse().limit(3).toArray(), []);
  const summary = useLiveQuery(async () => {
    const [submitted, reviews, notes, results] = await Promise.all([
      db.attempts.toArray(),
      db.reviews.toArray(),
      db.notes.toArray(),
      db.results.toArray(),
    ]);
    const now = Date.now();
    const examIds = new Set(submitted.filter((a) => !isPractice(a)).map((a) => a.id));
    return {
      streak: streakDays([...submitted.map((a) => a.submittedAt), ...reviews.map((r) => r.at)], now),
      due: notes.filter((n) => isDue(n, now)).length,
      weak: weakUnits(results.filter((r) => examIds.has(r.attemptId))),
    };
  }, []);
  return (
    <div className="home">
      <header className="topbar">
        <div className="topbar-title">
          <strong>민법 모의고사</strong>
          <span className="topbar-sub">감정평가사 1차</span>
        </div>
        <button type="button" className="btn" onClick={onSettings}>
          설정
        </button>
      </header>

      <main className="home-main">
        {draft && draftSet && (
          <section className="card card-resume">
            <div>
              <h2>풀던 세트가 있습니다</h2>
              <p className="muted">
                {draftSet.title} · {Object.keys(draft.answers).length}/{draftSet.questions.length}문항 응답 ·{' '}
                {isPractice(draft) ? '연습 모드' : `남은 시간 ${formatClock((draft.endsAt - Date.now()) / 1000)}`}
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={onResume}>
              이어 풀기
            </button>
          </section>
        )}

        <section className="home-summary">
          <div className="tile">
            <span className="tile-label">연속 학습</span>
            <strong>{summary?.streak ?? 0}일</strong>
          </div>
          <button type="button" className="tile tile-btn" onClick={onNotes}>
            <span className="tile-label">오답노트 · 오늘 복습</span>
            <strong>{summary?.due ?? 0}문항</strong>
            <span className="tile-sub">열기 ›</span>
          </button>
          <button type="button" className="tile tile-btn" onClick={onStats}>
            <span className="tile-label">약점 단원 Top 3</span>
            {summary && summary.weak.length > 0 ? (
              <ol className="weak-list">
                {summary.weak.map((u) => (
                  <li key={u.key}>
                    {u.key} <span className="muted">{Math.round(u.rate * 100)}%</span>
                  </li>
                ))}
              </ol>
            ) : (
              <span className="tile-sub">단원별 3문항 이상 풀면 표시</span>
            )}
            <span className="tile-sub">통계 ›</span>
          </button>
        </section>

        {recent && recent.length > 0 && (
          <>
            <h2 className="section-title">최근 기록</h2>
            <ul className="recent-list">
              {recent.map((r) => (
                <li key={r.id}>
                  <button type="button" className="card recent-item" onClick={() => onOpenRecord(r.id)}>
                    <span className="recent-score">
                      <strong>{r.score100}</strong>점{isPractice(r) && <span className="mode-tag">연습</span>}
                    </span>
                    <span className="muted">
                      {sets.find((s) => s.id === r.setId)?.title ?? r.setId} · {r.correct}/{r.total} ·{' '}
                      {new Date(r.submittedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className="section-title">문항 세트</h2>
        <ul className="set-list">
          {sets.map((s) => {
            const limit = timeLimitSec(s.questions.length, settings.timeLimitMinutes);
            const unreviewed = s.questions.filter((q) => !q.reviewed).length;
            return (
              <li key={s.id} className="card set-card">
                <div>
                  <h3>{s.title}</h3>
                  <p className="muted">
                    {s.questions.length}문항 · {practice ? '연습 모드(시간 제한 없음)' : `${Math.round(limit / 60)}분`}
                    {unreviewed > 0 && <span className="pill">미검수 {unreviewed}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => {
                    if (draft && !confirm('풀던 세트가 있습니다. 새로 시작하면 진행 내용이 사라집니다. 시작할까요?')) return;
                    onStart(s.id);
                  }}
                >
                  {practice ? '연습 시작' : '실전 시작'}
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
