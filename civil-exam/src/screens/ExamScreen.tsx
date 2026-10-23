import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator } from '../components/Calculator';
import { ExplanationView } from '../components/ExplanationView';
import { OmrPanel } from '../components/OmrPanel';
import { QuestionView, nextMark } from '../components/QuestionView';
import { SubmitDialog } from '../components/SubmitDialog';
import { ElapsedClock, Timer } from '../components/Timer';
import { useCountdown } from '../hooks/useCountdown';
import { useSwipe } from '../hooks/useSwipe';
import { addTime, isPractice, unanswered, type Attempt } from '../lib/attempt';
import type { ChoiceNo, QuestionSet } from '../types';

type Props = {
  set: QuestionSet;
  attempt: Attempt;
  onChange: (a: Attempt) => void;
  /** 마지막 문항 체류시간까지 반영된 응시를 넘긴다 */
  onSubmit: (final: Attempt, timeUp: boolean) => void;
  onExit: (final: Attempt) => void;
  /** 시험 화면 계산기 버튼 (경제학원론, 설정에서 켠 경우) */
  calculator?: boolean;
};

/**
 * 실전 모드: 타이머 + 시험지 + 답안지(OMR). 40문항을 풀고 일괄 제출한다.
 * 연습 모드: 시간 제한 없이(경과 시간만 표시) 보기를 고르는 즉시 채점·해설. 고른 답은 바꿀 수 없다.
 */
export function ExamScreen({ set, attempt, onChange, onSubmit, onExit, calculator }: Props) {
  const qs = set.questions;
  const index = Math.min(attempt.current, qs.length - 1);
  const q = qs[index];

  const [omrOpen, setOmrOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [dir, setDir] = useState<'next' | 'prev' | 'jump'>('jump');
  const mainRef = useRef<HTMLElement>(null);

  // 문항별 풀이시간: 지금 문항을 보기 시작한 시각. 이동·제출·나가기·백그라운드 전환 때 누적한다.
  const enterAt = useRef(Date.now());
  const withTime = (a: Attempt) => addTime(a, q.id, enterAt.current);
  const latest = useRef({ attempt, qid: q.id, onChange });
  latest.current = { attempt, qid: q.id, onChange };

  useEffect(() => {
    enterAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        const { attempt: a, qid, onChange: save } = latest.current;
        save(addTime(a, qid, enterAt.current));
      }
      enterAt.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const practice = isPractice(attempt);
  const remaining = useCountdown(attempt.endsAt, () => onSubmit(withTime(attempt), true), !practice);
  const locked = practice && attempt.answers[q.id] != null;

  const go = useCallback(
    (i: number, how: 'next' | 'prev' | 'jump' = 'jump') => {
      const to = Math.max(0, Math.min(qs.length - 1, i));
      setOmrOpen(false);
      if (to === index) return;
      setDir(how);
      onChange({ ...addTime(attempt, q.id, enterAt.current), current: to });
    },
    [attempt, index, onChange, q.id, qs.length],
  );

  const select = useCallback(
    (c: ChoiceNo) => {
      if (locked) return;
      const answers = { ...attempt.answers };
      // 같은 번호를 다시 누르면 마킹 해제
      if (answers[q.id] === c) delete answers[q.id];
      else answers[q.id] = c;
      onChange({ ...attempt, answers });
    },
    [attempt, locked, onChange, q.id],
  );

  const flagged = attempt.flags.includes(q.id);
  const toggleFlag = () =>
    onChange({ ...attempt, flags: flagged ? attempt.flags.filter((f) => f !== q.id) : [...attempt.flags, q.id] });

  const toggleMark = (key: string) => {
    const m = attempt.marks[q.id] ?? {};
    onChange({ ...attempt, marks: { ...attempt.marks, [q.id]: { ...m, [key]: nextMark(m[key]) } } });
  };

  const swipe = useSwipe(
    () => go(index + 1, 'next'),
    () => go(index - 1, 'prev'),
  );

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(index + 1, 'next');
      else if (e.key === 'ArrowLeft') go(index - 1, 'prev');
      else if (/^[1-5]$/.test(e.key)) select(Number(e.key) as ChoiceNo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen, go, index, select]);

  const missing = unanswered(qs, attempt);
  const flaggedQs = qs.filter((x) => attempt.flags.includes(x.id));

  return (
    <div className="exam">
      <header className="topbar exam-bar">
        <button type="button" className="btn btn-ghost" onClick={() => onExit(withTime(attempt))} aria-label="나가기(진행 상황은 저장됨)">
          ‹ 나가기
        </button>
        {practice ? (
          <ElapsedClock startedAt={attempt.startedAt} />
        ) : (
          <Timer remaining={remaining} limitSec={attempt.timeLimitSec} />
        )}
        <div className="exam-bar-right">
          {calculator && (
            <button type="button" className="btn" aria-label="계산기" aria-pressed={calcOpen} onClick={() => setCalcOpen((o) => !o)}>
              <span className="calc-btn-text">계산기</span>
              <span className="calc-btn-icon" aria-hidden>
                ÷
              </span>
            </button>
          )}
          <button
            type="button"
            className="btn omr-toggle"
            aria-expanded={omrOpen}
            aria-controls="omr-panel"
            onClick={() => setOmrOpen((o) => !o)}
          >
            답안지 {qs.length - missing.length}/{qs.length}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setConfirmOpen(true)}>
            제출
          </button>
        </div>
      </header>

      <div className="exam-body">
        <main className="exam-main" ref={mainRef}>
          <div className="paper-wrap">
            <div className="qbar">
              <span className="qbar-pos">
                <strong>{q.number}</strong> / {qs.length}
                {practice && <span className="mode-tag">연습</span>}
              </span>
              <button
                type="button"
                className={`btn btn-flag${flagged ? ' is-on' : ''}`}
                aria-pressed={flagged}
                onClick={toggleFlag}
              >
                <span aria-hidden>{flagged ? '★' : '☆'}</span> 별표
              </button>
            </div>
            <div className={`sheet swipe-area anim-${dir}`} key={q.id} {...swipe}>
              <QuestionView
                question={q}
                selected={attempt.answers[q.id] ?? null}
                onSelect={locked ? undefined : select}
                marks={attempt.marks[q.id]}
                onToggleMark={toggleMark}
                reveal={locked}
              />
            </div>
            {locked && (
              <>
                <p className={`verdict verdict-block ${attempt.answers[q.id] === q.answer ? 'is-o' : 'is-x'}`} role="status">
                  {attempt.answers[q.id] === q.answer ? '정답입니다' : `오답입니다 · 정답 ${q.answer}번`}
                </p>
                <ExplanationView question={q} chosen={attempt.answers[q.id] ?? null} />
              </>
            )}
            <nav className="qnav" aria-label="문항 이동">
              <button type="button" className="btn" onClick={() => go(index - 1, 'prev')} disabled={index === 0}>
                ‹ 이전 문항
              </button>
              {index < qs.length - 1 ? (
                <button type="button" className="btn" onClick={() => go(index + 1, 'next')}>
                  다음 문항 ›
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setConfirmOpen(true)}>
                  제출하기
                </button>
              )}
            </nav>
          </div>
        </main>

        {omrOpen && <div className="omr-backdrop" onClick={() => setOmrOpen(false)} aria-hidden />}
        <aside id="omr-panel" className={`omr-aside${omrOpen ? ' is-open' : ''}`} aria-label="답안지">
          <OmrPanel questions={qs} attempt={attempt} current={index} onJump={(i) => go(i)} />
        </aside>
      </div>

      {calcOpen && <Calculator onClose={() => setCalcOpen(false)} />}

      <SubmitDialog
        open={confirmOpen}
        unanswered={missing}
        flagged={flaggedQs}
        onJump={(n) => {
          setConfirmOpen(false);
          go(qs.findIndex((x) => x.number === n));
        }}
        onCancel={() => setConfirmOpen(false)}
        onSubmit={() => {
          setConfirmOpen(false);
          onSubmit(withTime(attempt), false);
        }}
      />
    </div>
  );
}
