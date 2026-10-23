import { useLiveQuery } from 'dexie-react-hooks';
import { RateBars, ScoreTrend } from '../components/Charts';
import { elapsedSec, isPractice } from '../lib/attempt';
import { CATEGORY_NAME, passCut } from '../lib/config';
import { db } from '../lib/db';
import { formatDuration } from '../lib/format';
import { patternOf } from '../lib/law';
import { questionById, resolveSet, subjectOf } from '../lib/sets';
import { accBy, byCategory, byType, PATTERN_LABEL, PATTERNS, recentTrend, streakDays, TYPE_LABEL, weakCategories } from '../lib/stats';
import { SUBJECT_LABEL, type Subject } from '../types';

const secLabel = (s: number) => (s > 0 ? `평균 ${Math.round(s)}초` : '');
const pct = (c: number, t: number) => Math.round((c / t) * 100);

type Props = { subject: Subject; onHome: () => void };

/** 통계: 단원(감관법은 법률)별·유형별 누적 정답률, 최근 5회 추세, 약점 Top3, 풀이시간, 점수 추이 (실전 제출 기록 기준) */
export function StatsScreen({ subject, onHome }: Props) {
  const law = subject === '감관법';
  const catName = CATEGORY_NAME[subject];
  const data = useLiveQuery(async () => {
    const [allAttempts, allResults, allReviews, allNotes] = await Promise.all([
      db.attempts.orderBy('submittedAt').toArray(),
      db.results.toArray(),
      db.reviews.toArray(),
      db.notes.toArray(),
    ]);
    const all = allAttempts.filter((a) => subjectOf(a) === subject);
    // 점수·정답률은 실전 모드만. 연습 모드 제출은 연속 학습일에만 반영
    const attempts = all.filter((a) => !isPractice(a));
    const examIds = new Set(attempts.map((a) => a.id));
    const results = allResults.filter((r) => examIds.has(r.attemptId));
    const reviews = allReviews.filter((r) => questionById.get(r.questionId)?.subject === subject);
    const notes = allNotes.filter((n) => subjectOf(n) === subject);
    const activity = [...allAttempts.map((a) => a.submittedAt), ...allReviews.map((r) => r.at)];
    return { attempts, results, reviews, notes, activity };
  }, [subject]);

  const header = (
    <header className="topbar">
      <div className="topbar-title">
        <strong>통계 · {SUBJECT_LABEL[subject]}</strong>
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
          <p className="empty-note">
            아직 {SUBJECT_LABEL[subject]} 실전 모드로 제출한 시험이 없습니다. 실전 모드로 한 세트를 풀면 통계가 쌓입니다.
          </p>
        </main>
      </div>
    );
  }

  const avgScore = attempts.reduce((s, a) => s + a.score100, 0) / attempts.length;
  const timed = results.filter((r) => r.timeSec > 0);
  const avgSec = timed.length ? timed.reduce((s, r) => s + r.timeSec, 0) / timed.length : 0;
  const streak = streakDays(activity);
  const reviewRate = reviews.length ? reviews.filter((r) => r.correct).length / reviews.length : null;
  const cats = byCategory(results, subject);
  const weak = weakCategories(results, subject);
  const trend = recentTrend(results, attempts, 5);
  const types = byType(results);
  const patterns = law
    ? accBy(
        results,
        (r) => {
          const q = questionById.get(r.questionId);
          return q?.subject === '감관법' ? patternOf(q) : undefined;
        },
        PATTERNS,
      )
    : [];
  const recent = attempts.slice(-20);
  const fails = attempts.filter((a) => a.total >= 40 && a.score100 < passCut).length;

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
            {fails > 0 && <span className="tile-sub">과락 {fails}회 (40문항 세트)</span>}
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

        <h2 className="section-title">약점 {catName} Top 3</h2>
        <section className="card">
          {weak.length ? (
            <ol className="weak-rank">
              {weak.map((w) => (
                <li key={w.key}>
                  <strong>{w.key}</strong>
                  <span>
                    {pct(w.correct, w.total)}% ({w.correct}/{w.total})
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{catName}별로 3문항 이상 풀면 표시합니다.</p>
          )}
        </section>

        <h2 className="section-title">{catName}별 누적 정답률</h2>
        <section className="card">
          <RateBars
            caption={`${catName}별 정답률과 최근 5회 추세`}
            rows={cats.map((u) => {
              const cells = trend.get(u.key) ?? [];
              const tr = cells.length > 1 ? `최근 ${cells.length}회 ${cells.map((c) => pct(c.correct, c.total)).join('→')}%` : '';
              return {
                label: u.key,
                rate: u.rate,
                detail: [`${u.correct}/${u.total}`, secLabel(u.avgSec), tr].filter(Boolean).join(' · '),
              };
            })}
          />
        </section>

        {law && patterns.length > 0 && (
          <>
            <h2 className="section-title">문항 유형별 정답률</h2>
            <section className="card">
              <RateBars
                caption="문항 유형(정의·숫자·절차·예외·사례)별 정답률"
                rows={patterns.map((t) => ({
                  label: PATTERN_LABEL[t.key],
                  rate: t.rate,
                  detail: [`${t.correct}/${t.total}`, secLabel(t.avgSec)].filter(Boolean).join(' · '),
                }))}
              />
            </section>
          </>
        )}

        <h2 className="section-title">문항 형식별 정답률</h2>
        <section className="card">
          <RateBars
            caption="문항 형식별 정답률"
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
