import { useMemo, useState } from 'react';
import { FigureView } from '../components/FigureView';
import quiz from '../data/shift-quiz.json';
import type { Figure } from '../types';

type Dir = 'left' | 'right' | 'none';
type Item = { id: string; market: 'goods' | 'islm' | 'adas'; curve: string; prompt: string; answer: Dir; explain: string };

const MARKET = {
  goods: { x: 'Q', y: 'P', down: 'D', up: 'S', title: '재화시장' },
  islm: { x: 'Y', y: 'r', down: 'IS', up: 'LM', title: 'IS-LM' },
  adas: { x: 'Y', y: 'P', down: 'AD', up: 'AS', title: 'AD-AS' },
} as const;
const DIR_LABEL: Record<Dir, string> = { left: '왼쪽으로 이동(감소)', right: '오른쪽으로 이동(증가)', none: '이동하지 않음' };
const SHIFT = 22;

/** 기준 그래프 + (답을 고른 뒤) 이동한 곡선을 점선으로 */
function figureFor(it: Item, shown: Dir | null): Figure {
  const m = MARKET[it.market];
  const down: [number, number][] = [[10, 90], [90, 10]];
  const up: [number, number][] = [[10, 10], [90, 90]];
  const series: Figure['series'] = [
    { name: m.down, points: down },
    { name: m.up, points: up },
  ];
  if (shown && shown !== 'none') {
    const dx = shown === 'right' ? SHIFT : -SHIFT;
    const base = it.curve === m.down ? down : up;
    const moved = base.map(([x, y]) => [x + dx, y] as [number, number]).map(([x, y]) => {
      // 축 범위(0~100) 안으로 자르기
      if (x < 0) return [0, y + (it.curve === m.down ? x : -x)] as [number, number];
      if (x > 100) return [100, y + (it.curve === m.down ? x - 100 : 100 - x)] as [number, number];
      return [x, y] as [number, number];
    });
    series.push({ name: `${it.curve}′`, points: moved, dashed: true });
  }
  return { kind: 'line-plot', xLabel: m.x, yLabel: m.y, xMax: 100, yMax: 100, series };
}

const shuffle = <T,>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 곡선 이동 퀴즈(2차): 상황을 읽고 곡선이 어느 쪽으로 이동하는지 고른다 */
export function ShiftQuizScreen({ onHome, count = 10 }: { onHome: () => void; count?: number }) {
  const items = useMemo(() => shuffle(quiz as Item[]).slice(0, count), [count]);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Dir | null>(null);
  const [score, setScore] = useState(0);
  const done = idx >= items.length;
  const it = items[idx];

  const header = (
    <header className="topbar">
      <div className="topbar-title">
        <strong>곡선 이동 퀴즈</strong>
        <span className="topbar-sub">{done ? '완료' : `${idx + 1} / ${items.length}`}</span>
      </div>
      <button type="button" className="btn" onClick={onHome}>
        홈으로
      </button>
    </header>
  );

  if (done) {
    return (
      <div className="result">
        {header}
        <main className="home-main">
          <section className="card score-card">
            <div className="score-big">
              <strong>
                {score}/{items.length}
              </strong>
            </div>
            <p className="muted">외생변수의 변화는 곡선의 이동, 그 축에 있는 변수(자기 가격·물가 등)의 변화는 곡선 위의 이동이다.</p>
          </section>
        </main>
      </div>
    );
  }

  const choose = (d: Dir) => {
    if (picked) return;
    setPicked(d);
    if (d === it.answer) setScore((s) => s + 1);
  };

  return (
    <div className="result">
      {header}
      <main className="home-main">
        <section className="card shift">
          <p className="muted small">{MARKET[it.market].title} · {it.curve}곡선</p>
          <p className="shift-prompt">
            {it.prompt} <strong>{it.curve}곡선</strong>은 어떻게 되는가?
          </p>
          <FigureView figure={figureFor(it, picked ? it.answer : null)} />
          <div className="shift-choices" role="group" aria-label="이동 방향">
            {(['left', 'none', 'right'] as Dir[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-lg${picked && d === it.answer ? ' is-correct' : ''}${picked === d && d !== it.answer ? ' is-wrong' : ''}`}
                aria-pressed={picked === d}
                onClick={() => choose(d)}
              >
                {DIR_LABEL[d]}
              </button>
            ))}
          </div>
          {picked && (
            <>
              <p className={`verdict verdict-block ${picked === it.answer ? 'is-o' : 'is-x'}`} role="status">
                {picked === it.answer ? '정답입니다' : `오답입니다 · 정답: ${DIR_LABEL[it.answer]}`}
              </p>
              <p className="shift-explain">{it.explain}</p>
              <div className="flash-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => {
                    setPicked(null);
                    setIdx(idx + 1);
                  }}
                >
                  {idx + 1 < items.length ? '다음 ›' : '결과 보기'}
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
