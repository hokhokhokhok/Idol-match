import { useLiveQuery } from 'dexie-react-hooks';
import { RateBars, ScoreTrend } from '../components/Charts';
import { elapsedSec, isPractice } from '../lib/attempt';
import { db } from '../lib/db';
import { questionById, resolveSet } from '../lib/sets';
import { formatDuration } from '../lib/format';
import { byType, byUnit, streakDays, TYPE_LABEL } from '../lib/stats';

const secLabel = (s: number) => (s > 0 ? `평균 ${Math.round(s)}초` : '');

/** 통계: 단원별·유형별 누적 정답률, 풀이시간, 점수 추이 (실전 제출 기록 기준) */
export function StatsScreen({ onHome }: { onHome: () => void }) {
  const data = useLiveQuery(async () => {
    const [all, allResults, reviews, notes] = await Promise.all([
      db.attempts.orderBy('submittedAt').toArray(),
      db.results.toArray(),
      db.reviews.toArray(),
      db.notes.toArray(),
    ]);
    // 점수·정답률은 실전 모드만. 연습 모드 제출은 연속 학습일에만 반영
    const attempts = all.filter((a) => !isPractice(a));
    const examIds = new Set(attempts.map((a) => a.id));
    // 출제범위에서 빠진 문항(예: 계약 단원)의 예전 기록은 정답률·풀이시간 통계에서 뺀다
    const results = allResults.filter((r) => examIds.has(r.attemptId) && questionById.has(r.questionId));
    return { attempts, results, reviews, notes, activity: [...all.map((a) => a.submittedAt), ...reviews.map((r) => r.at)] };
  }, []);

  const header = (
    <header className="topbar">
      <div className="topbar-title">
        <strong>통계</strong>
        <span className="topbar-sub">실전 모드 제출 기록 기준</span>
      </div>
      <button type="button" className="btn" onClick={onHome}>
        홈으로
      </button>
    </header>
  );
  if (!data) return <div className="result">{header}</div>;

  const { attempts, results, reviews, notes, activity } = data;
  if (attempts.length === 0) {
    return (
      <div className="result">
        {header}
        <main className="home-main">
          <p className="empty-note">아직 실전 모드로 제출한 시험이 없습니다. 실전 모드로 한 세트를 풀면 통계가 쌓입니다.</p>
        </main>
      </div>
    );
  }

  const avgScore = attempts.reduce((s, a) => s + a.score100, 0) / attempts.length;
  const timed = results.filter((r) => r.timeSec > 0);
  const avgSec = timed.length ? timed.reduce((s, r) => s + r.timeSec, 0) / timed.length : 0;
  const streak = streakDays(activity);
  const reviewRate = reviews.length ? reviews.filter((r) => r.correct).length / reviews.length : null;
  const units = byUnit(results);
  const types = byType(results);
  const recent = attempts.slice(-20);

  return (
    <div className="result">
      {header}
      <main className="home-main">
        <section className="tiles">
          <div className="tile">
            <span className="tile-label">연속 학습</span>
            <strong>{streak}일</strong>
          </div>
          <div className="tile">
            <span className="tile-label">평균 점수 ({attempts.length}회)</span>
            <strong>{Math.round(avgScore * 10) / 10}점</strong>
          </div>
          <div className="tile">
            <span className="tile-label">문항당 풀이시간</span>
            <strong>{avgSec ? formatDuration(avgSec) : '—'}</strong>
          </div>
          <div className="tile">
            <span className="tile-label">오답노트</span>
            <strong>
              {notes.filter((n) => !n.mastered).length}
              <small> / 졸업 {notes.filter((n) => n.mastered).length}</small>
            </strong>
            {reviewRate != null && <span className="tile-sub">복습 정답률 {Math.round(reviewRate * 100)}%</span>}
          </div>
        </section>

        <h2 className="section-title">점수 추이 (최근 {recent.length}회)</h2>
        <section className="card">
          <ScoreTrend
            points={recent.map((a) => ({
              label: new Date(a.submittedAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
              value: a.score100,
            }))}
          />
        </section>

        <h2 className="section-title">단원별 누적 정답률</h2>
        <section className="card">
          <RateBars
            caption="단원별 정답률"
            rows={units.map((u) => ({
              label: u.key,
              rate: u.rate,
              detail: [`${u.correct}/${u.total}`, secLabel(u.avgSec)].filter(Boolean).join(' · '),
            }))}
          />
        </section>

        <h2 className="section-title">문항 유형별 정답률</h2>
        <section className="card">
          <RateBars
            caption="문항 유형별 정답률"
            rows={types.map((t) => ({
              label: TYPE_LABEL[t.key],
              rate: t.rate,
              detail: [`${t.correct}/${t.total}`, secLabel(t.avgSec)].filter(Boolean).join(' · '),
            }))}
          />
        </section>

        <h2 className="section-title">회차별 기록</h2>
        <section className="card">
          <table className="history">
            <thead>
              <tr>
                <th scope="col">날짜</th>
                <th scope="col">세트</th>
                <th scope="col">점수</th>
                <th scope="col">정답</th>
                <th scope="col">풀이시간</th>
              </tr>
            </thead>
            <tbody>
              {[...attempts].reverse().map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.submittedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</td>
                  <td>{resolveSet(a)?.title ?? a.setId}</td>
                  <td>{a.score100}</td>
                  <td>
                    {a.correct}/{a.total}
                  </td>
                  <td>{formatDuration(elapsedSec(a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
