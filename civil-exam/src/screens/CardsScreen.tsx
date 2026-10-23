import { useEffect, useState } from 'react';
import { RichText } from '../components/RichText';
import { CARD_INTERVALS, extractCards, newCardState, onCardAnswer, pickCards, type Card } from '../lib/cards';
import { db } from '../lib/db';
import { questionById, setsOf, subjectOf } from '../lib/sets';
import { categoryOf } from '../types';

type Props = { onHome: () => void };

/** 숫자·기간 암기 카드: 해설의 수치를 빈칸으로 만든 카드. 오답노트 문항의 수치부터, 맞히면 1·3·7·14·30일 간격 */
export function CardsScreen({ onHome }: Props) {
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(false);
  const [result, setResult] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const [states, notes] = await Promise.all([db.cards.toArray(), db.notes.toArray()]);
      const cards = setsOf('감관법').flatMap((s) => s.questions.flatMap(extractCards));
      const wrong = new Set(notes.filter((n) => subjectOf(n) === '감관법' && !n.mastered).map((n) => n.questionId));
      setQueue(pickCards(cards, new Map(states.map((s) => [s.id, s])), wrong, Date.now(), 20));
    })().catch((e) => {
      console.error('cards load failed', e);
      setQueue([]);
    });
  }, []);

  const header = (sub: string) => (
    <header className="topbar">
      <div className="topbar-title">
        <strong>숫자·기간 암기 카드</strong>
        <span className="topbar-sub">{sub}</span>
      </div>
      <button type="button" className="btn" onClick={onHome}>
        홈으로
      </button>
    </header>
  );

  if (!queue) return <div className="result">{header('불러오는 중')}</div>;
  if (queue.length === 0) {
    return (
      <div className="result">
        {header('오늘 볼 카드 없음')}
        <main className="home-main">
          <p className="empty-note">
            오늘 볼 카드가 없습니다. 감관법 해설에 나온 수치(비율·기간·면적 등)로 카드를 만들며, 맞힌 카드는{' '}
            {CARD_INTERVALS.join('·')}일 간격으로 다시 나옵니다.
          </p>
        </main>
      </div>
    );
  }

  if (idx >= queue.length) {
    const known = Object.values(result).filter(Boolean).length;
    return (
      <div className="result">
        {header(`${queue.length}장 완료`)}
        <main className="home-main">
          <section className="card score-card">
            <div className="score-big">
              <strong>
                {known}/{queue.length}
              </strong>
            </div>
            <p className="muted">모른 카드는 내일, 안 카드는 다음 간격에 다시 나옵니다.</p>
          </section>
        </main>
      </div>
    );
  }

  const card = queue[idx];
  const q = questionById.get(card.questionId);
  const answer = async (known: boolean) => {
    const now = Date.now();
    const prev = await db.cards.get(card.id);
    await db.cards.put(onCardAnswer(prev ?? newCardState(card, now), known, now)).catch((e) => console.error('card save failed', e));
    setResult((r) => ({ ...r, [card.id]: known }));
    setShown(false);
    setIdx(idx + 1);
  };

  return (
    <div className="result">
      {header(`${idx + 1} / ${queue.length}`)}
      <main className="home-main">
        <section className="card flash" aria-live="polite">
          {q && (
            <p className="flash-src muted small">
              {categoryOf(q)} · {q.topic}
            </p>
          )}
          <p className="flash-front">
            <RichText text={card.front} />
          </p>
          {shown ? (
            <>
              <p className="flash-answer">
                <strong>{card.answer}</strong>
              </p>
              {q && (
                <p className="muted small">
                  출처: {q.setId} {q.number}번 해설 · 시험 전 현행 법령으로 수치를 다시 확인하세요
                </p>
              )}
              <div className="flash-actions">
                <button type="button" className="btn btn-lg" onClick={() => answer(false)}>
                  몰랐어요
                </button>
                <button type="button" className="btn btn-primary btn-lg" onClick={() => answer(true)}>
                  알았어요
                </button>
              </div>
            </>
          ) : (
            <div className="flash-actions">
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setShown(true)}>
                정답 보기
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
