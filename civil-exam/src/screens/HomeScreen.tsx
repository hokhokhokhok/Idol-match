import { useLiveQuery } from 'dexie-react-hooks';
import { isPractice, type Attempt } from '../lib/attempt';
import { extractCards, pickCards } from '../lib/cards';
import { CATEGORY_NAME, passCut, timeLimitSec } from '../lib/config';
import { db } from '../lib/db';
import { formatClock } from '../lib/format';
import { dailySets } from '../lib/daily';
import { dailySetId, dateKey, DAILY_COUNT, pickTodaySet } from '../lib/plan';
import { isSeedSet, mixTitle, resolveSet, subjectOf } from '../lib/sets';
import type { Settings } from '../lib/settings';
import { isDue } from '../lib/srs';
import { streakDays, weakCategories } from '../lib/stats';
import { categoryOf, isCalc, isQuantSubject, SUBJECT_LABEL, SUBJECTS, type Category, type QuestionSet, type Subject } from '../types';
import { questionById } from '../lib/sets';

type Props = {
  /** 이 과목의 세트 */
  sets: QuestionSet[];
  subject: Subject;
  draft: Attempt | null;
  settings: Settings;
  onSubject: (s: Subject) => void;
  onStart: (setId: string) => void;
  onResume: () => void;
  onOpenRecord: (attemptId: string) => void;
  onNotes: () => void;
  onStats: () => void;
  onSettings: () => void;
  onStartMix: () => void;
  /** 오늘의 모의고사(매일 새로 구성하는 5세트) 시작 */
  onStartDaily: (setId: string, questionIds: string[]) => void;
  onWeakDrill: (category: Category) => void;
  onCards: () => void;
  /** 경제학원론: 계산 문제만 풀기 */
  onCalcDrill: () => void;
  /** 경제학원론: 곡선 이동 퀴즈 */
  onShiftQuiz: () => void;
  /** 부동산학원론: 화폐의 시간가치 6계수 계산기 */
  onTvm: () => void;
};

/** 홈: 과목 탭, 이어 풀기, 오늘의 세트, 오늘의 모의고사 5세트, 연속 학습일·오늘 복습·약점, (감관법) 추천 약점 복습·암기 카드, 최근 기록, 맞춤 모의고사, 세트 목록 */
export function HomeScreen(p: Props) {
  const { sets, subject, draft, settings } = p;
  const practice = settings.instantExplanation;
  const draftSet = draft && resolveSet(draft);
  const realSets = sets.filter((s) => !isSeedSet(s.id));
  const poolSize = realSets.reduce((n, s) => n + s.questions.length, 0);
  const confirmNew = () => !draft || confirm('풀던 세트가 있습니다. 새로 시작하면 진행 내용이 사라집니다. 시작할까요?');
  const startLabel = practice ? '연습 시작' : '실전 시작';
  const catName = CATEGORY_NAME[subject];
  const law = subject === '감관법';
  const econ = subject === '경제학원론';
  const quant = isQuantSubject(subject);
  const realEstate = subject === '부동산학원론';

  const summary = useLiveQuery(async () => {
    const [allAttempts, reviews, allNotes, allResults, cardStates] = await Promise.all([
      db.attempts.toArray(),
      db.reviews.toArray(),
      db.notes.toArray(),
      db.results.toArray(),
      db.cards.toArray(),
    ]);
    const now = Date.now();
    const submitted = allAttempts.filter((a) => subjectOf(a) === subject);
    const notes = allNotes.filter((n) => subjectOf(n) === subject);
    const examIds = new Set(submitted.filter((a) => !isPractice(a)).map((a) => a.id));
    const weak = weakCategories(
      allResults.filter((r) => examIds.has(r.attemptId)),
      subject,
    );
    let cardsDue = 0;
    if (law) {
      const cards = sets.flatMap((s) => s.questions.flatMap(extractCards));
      const states = new Map(cardStates.map((c) => [c.id, c]));
      cardsDue = pickCards(cards, states, new Set(notes.filter((n) => !n.mastered).map((n) => n.questionId)), now, 999).length;
    }
    // 오늘의 모의고사: 문항별 푼 기록(안 푼·틀린 문항 우선)으로 그날 처음 구성하고 하루 동안 유지
    const history = new Map<string, { seen: number; wrong: number }>();
    for (const r of allResults) {
      const h = history.get(r.questionId) ?? { seen: 0, wrong: 0 };
      h.seen += 1;
      if (!r.correct) h.wrong += 1;
      history.set(r.questionId, h);
    }
    const date = dateKey(now);
    const daily = dailySets(subject, history, now).map((ids, k) => {
      const id = dailySetId(date, k);
      const done = submitted.filter((a) => a.setId === id);
      return { id, ids, best: done.length ? Math.max(...done.map((a) => a.score100)) : null };
    });
    const calcRows = quant ? allResults.filter((r) => examIds.has(r.attemptId) && isCalc(questionById.get(r.questionId)!)) : [];
    const calcCount = quant ? sets.reduce((k, s) => k + s.questions.filter(isCalc).length, 0) : 0;
    return {
      calc: { total: calcRows.length, correct: calcRows.filter((r) => r.correct).length, size: Math.min(10, calcCount) },
      streak: streakDays([...allAttempts.map((a) => a.submittedAt), ...reviews.map((r) => r.at)], now),
      due: notes.filter((n) => isDue(n, now)).length,
      weak,
      weakDue: weak[0] ? notes.filter((n) => n.unit === weak[0].key && isDue(n, now)).length : 0,
      drillSize: weak[0] ? Math.min(10, sets.reduce((k, s) => k + s.questions.filter((q) => categoryOf(q) === weak[0].key).length, 0)) : 0,
      today: pickTodaySet(realSets, submitted),
      daily,
      solved: new Set(submitted.map((a) => a.setId)),
      recent: submitted.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 3),
      cardsDue,
    };
  }, [subject, sets]);

  return (
    <div className="home">
      <header className="topbar">
        <div className="topbar-title">
          <strong>감정평가사 1차 모의고사</strong>
          <span className="topbar-sub">{SUBJECT_LABEL[subject]}</span>
        </div>
        <button type="button" className="btn" onClick={p.onSettings}>
          설정
        </button>
      </header>

      <main className="home-main">
        <div className="subject-tabs" role="tablist" aria-label="과목">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === subject}
              className={`subject-tab${s === subject ? ' is-on' : ''}`}
              onClick={() => p.onSubject(s)}
            >
              {SUBJECT_LABEL[s]}
            </button>
          ))}
        </div>

        {draft && draftSet && (
          <section className="card card-resume">
            <div>
              <h2>풀던 세트가 있습니다</h2>
              <p className="muted">
                {SUBJECT_LABEL[subjectOf(draft)]} · {draftSet.title} · {Object.keys(draft.answers).length}/
                {draftSet.questions.length}문항 응답 ·{' '}
                {isPractice(draft) ? '연습 모드' : `남은 시간 ${formatClock((draft.endsAt - Date.now()) / 1000)}`}
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={p.onResume}>
              이어 풀기
            </button>
          </section>
        )}

        {summary?.today && (
          <section className="card card-today">
            <div>
              <span className="today-label">오늘의 세트</span>
              <h2>{summary.today.title}</h2>
              <p className="muted">
                {summary.today.questions.length}문항 ·{' '}
                {practice
                  ? '연습 모드'
                  : `${Math.round(timeLimitSec(summary.today.questions.length, settings.timeLimitMinutes) / 60)}분`}
                {summary.solved.has(summary.today.id) && ' · 다시 풀기'}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              aria-label={`오늘의 세트 ${summary.today.title} ${startLabel}`}
              onClick={() => confirmNew() && p.onStart(summary.today!.id)}
            >
              {startLabel}
            </button>
          </section>
        )}

        {summary && summary.daily.length > 0 && (
          <section className="card card-daily" aria-label="오늘의 모의고사">
            <div className="daily-head">
              <span className="today-label">오늘의 모의고사 · 매일 새로 {DAILY_COUNT}세트</span>
              <p className="muted">
                전체 {poolSize}문항에서 {catName} 배분대로 40문항씩 · 안 푼 문항·틀린 문항 우선 · 세트끼리 문항이 겹치지 않게
              </p>
            </div>
            <ol className="daily-list">
              {summary.daily.map((d, k) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`daily-item${d.best !== null ? ' is-done' : ''}`}
                    aria-label={`${mixTitle(d.id)} ${d.best !== null ? `완료 ${d.best}점, 다시 풀기` : startLabel}`}
                    onClick={() => confirmNew() && p.onStartDaily(d.id, d.ids)}
                  >
                    <strong>{k + 1}</strong>
                    <span>{d.best !== null ? `${d.best}점` : `${d.ids.length}문항`}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {quant && summary && summary.calc.size > 0 && (
          <section className="card card-drill card-calc">
            <div>
              <span className="today-label">계산 문제만 풀기</span>
              <h2>계산형 {summary.calc.size}문항</h2>
              <p className="muted">
                {summary.calc.total
                  ? `실전 계산형 정답률 ${Math.round((summary.calc.correct / summary.calc.total) * 100)}% (${summary.calc.correct}/${summary.calc.total})`
                  : '아직 실전 기록 없음'}{' '}
                · 틀린 문항·안 푼 문항 우선 · 풀이 단계 해설
              </p>
            </div>
            <button type="button" className="btn btn-lg" onClick={p.onCalcDrill}>
              계산 {summary.calc.size}문항 풀기
            </button>
          </section>
        )}

        {(law || quant) && summary && summary.weak.length > 0 && (
          <section className="card card-drill">
            <div>
              <span className="today-label">오늘의 추천 약점 복습</span>
              <h2>{summary.weak[0].key}</h2>
              <p className="muted">
                실전 정답률 {Math.round(summary.weak[0].rate * 100)}% ({summary.weak[0].correct}/{summary.weak[0].total})
                {summary.weakDue > 0 && ` · 오늘 복습 ${summary.weakDue}문항 포함`} · 고르는 즉시 해설
              </p>
            </div>
            <button type="button" className="btn btn-lg" onClick={() => p.onWeakDrill(summary.weak[0].key)}>
              {summary.drillSize}문항 풀기
            </button>
          </section>
        )}

        <section className="home-summary">
          <div className="tile">
            <span className="tile-label">연속 학습</span>
            <strong>{summary?.streak ?? 0}일</strong>
          </div>
          <button type="button" className="tile tile-btn" onClick={p.onNotes}>
            <span className="tile-label">오답노트 · 오늘 복습</span>
            <strong>{summary?.due ?? 0}문항</strong>
            <span className="tile-sub">열기 ›</span>
          </button>
          <button type="button" className="tile tile-btn" onClick={p.onStats}>
            <span className="tile-label">약점 {catName} Top 3</span>
            {summary && summary.weak.length > 0 ? (
              <ol className="weak-list">
                {summary.weak.map((u) => (
                  <li key={u.key}>
                    {u.key} <span className="muted">{Math.round(u.rate * 100)}%</span>
                  </li>
                ))}
              </ol>
            ) : (
              <span className="tile-sub">{catName}별 3문항 이상 풀면 표시</span>
            )}
            <span className="tile-sub">통계 ›</span>
          </button>
          {realEstate && (
            <button type="button" className="tile tile-btn" onClick={p.onTvm}>
              <span className="tile-label">화폐의 시간가치 6계수</span>
              <strong>내가·현가·연금·저당상수</strong>
              <span className="tile-sub">계수 계산기 ›</span>
            </button>
          )}
          {econ && (
            <button type="button" className="tile tile-btn" onClick={p.onShiftQuiz}>
              <span className="tile-label">곡선 이동 퀴즈</span>
              <strong>수요·공급·IS·LM·AD·AS</strong>
              <span className="tile-sub">그래프로 연습 ›</span>
            </button>
          )}
          {law && (
            <button type="button" className="tile tile-btn" onClick={p.onCards}>
              <span className="tile-label">숫자·기간 암기 카드</span>
              <strong>{summary?.cardsDue ?? 0}장</strong>
              <span className="tile-sub">오답 수치부터 ›</span>
            </button>
          )}
        </section>

        {summary && summary.recent.length > 0 && (
          <>
            <h2 className="section-title">최근 기록</h2>
            <ul className="recent-list">
              {summary.recent.map((r) => (
                <li key={r.id}>
                  <button type="button" className="card recent-item" onClick={() => p.onOpenRecord(r.id)}>
                    <span className="recent-score">
                      <strong>{r.score100}</strong>점{isPractice(r) && <span className="mode-tag">연습</span>}
                      {!isPractice(r) && r.total >= 40 && r.score100 < passCut && <span className="mode-tag mode-tag-fail">과락</span>}
                    </span>
                    <span className="muted">
                      {resolveSet(r)?.title ?? r.setId} · {r.correct}/{r.total} ·{' '}
                      {new Date(r.submittedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {poolSize >= 40 && (
          <>
            <h2 className="section-title">맞춤 모의고사</h2>
            <section className="card set-card card-mix">
              <div>
                <h3>전체 {poolSize}문항에서 40문항</h3>
                <p className="muted">
                  {catName} 배분 ±{law || quant ? 1 : 2} 무작위 · 안 푼 문항·틀린 문항 우선
                  {settings.weakUnitBoost ? ` · 약점 ${catName} +2` : ''}
                </p>
              </div>
              <button type="button" className="btn btn-lg" onClick={() => confirmNew() && p.onStartMix()}>
                맞춤 세트 만들기
              </button>
            </section>
          </>
        )}

        <h2 className="section-title">문항 세트</h2>
        {sets.length === 0 && <p className="empty-note">이 과목의 문항 세트가 아직 없습니다.</p>}
        <ul className="set-list">
          {sets.map((s) => {
            const limit = timeLimitSec(s.questions.length, settings.timeLimitMinutes);
            const unreviewed = s.questions.filter((q) => !q.reviewed).length;
            const past = s.questions.filter((q) => q.pastExam?.some((r) => r.kind !== '유사')).length;
            return (
              <li key={s.id} className="card set-card">
                <div>
                  <h3>{s.title}</h3>
                  <p className="muted">
                    {s.questions.length}문항 · {practice ? '연습 모드(시간 제한 없음)' : `${Math.round(limit / 60)}분`}
                    {unreviewed > 0 && <span className="pill">미검수 {unreviewed}</span>}
                    {past > 0 && <span className="pill pill-past">기출·변형 {past}</span>}
                  </p>
                </div>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => confirmNew() && p.onStart(s.id)}>
                  {startLabel}
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
